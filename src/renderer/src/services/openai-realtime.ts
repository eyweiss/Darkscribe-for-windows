// OpenAI Realtime API — Dual-Channel WebSocket transcription service
//
// Architecture: TWO separate Realtime API sessions, both always active
//   Session 1 (mic):    in-room audio → "You"
//   Session 2 (system): remote audio  → "Them"
//
// Audio format: Int16 PCM, 24kHz, mono.

export type TranscriptSegment = {
  id: string
  speaker: 'mic' | 'sys'
  speakerName?: string
  speakerColor?: string
  text: string
  isFinal: boolean
  timestamp: number
  language?: string
}

export type TranscriptCallback = (segment: TranscriptSegment) => void
export type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', detail?: string) => void

const REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview'
const MAX_RETRIES = 5
const BASE_RETRY_MS = 1000

function base64FromInt16(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 65536
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
  }
  return btoa(binary)
}

function rmsEnergy(buffer: ArrayBuffer): number {
  const samples = new Int16Array(buffer)
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

const SILENCE_THRESHOLD = 5  // Very low — system audio via Bluetooth/AirPods is quiet

let idCounter = 0
function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idCounter++}`
}

class RealtimeChannel {
  private ws: WebSocket | null = null
  private retryCount = 0
  private retryTimeout: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private pendingSegments = new Map<string, TranscriptSegment>()
  private channel: 'mic' | 'sys'
  private languages: string[]
  private vocabularyHints: string
  private onTranscript: TranscriptCallback
  private onStatus: StatusCallback

  constructor(channel: 'mic' | 'sys', onTranscript: TranscriptCallback, onStatus: StatusCallback, languages: string[] = [], vocabularyHints: string = '') {
    this.channel = channel
    this.onTranscript = onTranscript
    this.onStatus = onStatus
    this.languages = languages
    this.vocabularyHints = vocabularyHints
  }

  connect(): void {
    this.stopped = false
    this.openWebSocket()
  }

  private openWebSocket(): void {
    this.onStatus('connecting', `${this.channel} channel`)
    this.ws = new WebSocket(REALTIME_URL)

    this.ws.onopen = () => {
      this.retryCount = 0
      this.onStatus('connected', `${this.channel} channel`)
      this.sendSessionConfig()
      this.startPeriodicCommit()
    }

    this.ws.onmessage = (e: MessageEvent) => {
      try { this.handleEvent(JSON.parse(e.data as string)) } catch {}
    }

    this.ws.onerror = () => this.onStatus('error', `${this.channel} WebSocket error`)

    this.ws.onclose = () => {
      this.stopPeriodicCommit()
      if (!this.stopped) this.scheduleReconnect()
      else this.onStatus('disconnected', `${this.channel} channel`)
    }
  }

  private sendSessionConfig(): void {
    const transcriptionConfig: Record<string, unknown> = { model: 'whisper-1' }
    if (this.languages.length === 1 && this.languages[0] !== 'auto') {
      transcriptionConfig.language = this.languages[0]
    }

    // Build transcription instructions for higher quality output
    const langNote = this.languages.length > 1
      ? `The speakers may switch between ${this.languages.join(', ')}. Transcribe in the language being spoken. Do not translate.`
      : ''

    const channelNote = this.channel === 'sys'
      ? 'This audio is from remote participants in a video/phone call (system audio capture).'
      : 'This audio is from local participants captured via microphone.'

    const vocabNote = this.vocabularyHints
      ? `\n\nKnown vocabulary, names, and terms to watch for:\n${this.vocabularyHints}`
      : ''

    const instructions = `You are a high-accuracy meeting transcription system called Darkscribe. ${channelNote}

Transcription rules:
- Transcribe verbatim — capture exactly what is said, word for word.
- Preserve all proper nouns, company names, product names, technical terms, and acronyms with correct spelling and capitalization.
- Use proper punctuation, capitalization, and paragraph breaks.
- Numbers: spell out one through nine, use digits for 10 and above. Use digits for all measurements, dates, and financial figures.
- Do not censor, paraphrase, or summarize. Do not add commentary.
- If a word is unclear, transcribe your best interpretation rather than omitting it.
- Preserve filler words (um, uh, like) only when they carry conversational meaning (hesitation, emphasis). Omit routine fillers.
${langNote}${vocabNote}`

    // Different VAD settings per channel:
    // - Mic: longer silence tolerance (speakers pause to think)
    // - System: shorter silence tolerance (break up continuous remote speech faster)
    const vadConfig = this.channel === 'sys'
      ? { type: 'server_vad' as const, threshold: 0.3, prefix_padding_ms: 300, silence_duration_ms: 400 }
      : { type: 'server_vad' as const, threshold: 0.45, prefix_padding_ms: 500, silence_duration_ms: 800 }

    this.send({
      type: 'session.update',
      session: {
        modalities: ['text'],
        instructions,
        input_audio_format: 'pcm16',
        input_audio_transcription: transcriptionConfig,
        turn_detection: vadConfig
      }
    })
  }

  private sysAudioLogCounter = 0
  private lastCommitTime = 0
  private hasSentAudioSinceCommit = false
  private commitInterval: ReturnType<typeof setInterval> | null = null

  // For system audio: periodically commit the buffer to force transcription
  // even when VAD doesn't detect a clean silence boundary
  private startPeriodicCommit(): void {
    if (this.channel !== 'sys' || this.commitInterval) return
    this.lastCommitTime = Date.now()
    this.commitInterval = setInterval(() => {
      if (this.hasSentAudioSinceCommit && this.ws?.readyState === WebSocket.OPEN) {
        console.log(`[Realtime:sys] Forcing audio commit after ${((Date.now() - this.lastCommitTime) / 1000).toFixed(1)}s`)
        this.send({ type: 'input_audio_buffer.commit' })
        this.hasSentAudioSinceCommit = false
        this.lastCommitTime = Date.now()
        // Capture the speech start time for the NEXT segment
        this.speechStartTime = Date.now()
      }
    }, 8000) // Force commit every 8 seconds
  }

  private stopPeriodicCommit(): void {
    if (this.commitInterval) {
      clearInterval(this.commitInterval)
      this.commitInterval = null
    }
  }

  appendAudio(buffer: ArrayBuffer): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    if (this.channel === 'sys') {
      const rms = rmsEnergy(buffer)
      this.sysAudioLogCounter++
      if (this.sysAudioLogCounter % 50 === 0) {
        console.log(`[Realtime:sys] RMS energy: ${rms.toFixed(0)} (threshold: ${SILENCE_THRESHOLD})`)
      }
      if (rms < SILENCE_THRESHOLD) return
      this.hasSentAudioSinceCommit = true
    }
    this.send({ type: 'input_audio_buffer.append', audio: base64FromInt16(buffer) })
  }

  private speechStartTime: number | null = null

  private handleEvent(event: Record<string, unknown>): void {
    const type = event.type as string

    if (type === 'error') {
      console.error(`[Realtime:${this.channel}]`, event.error)
    }

    const speakerName = this.channel === 'mic' ? 'You' : 'Them'
    const speakerColor = this.channel === 'mic' ? '#2563eb' : '#059669'

    switch (type) {
      // Track when VAD detects speech start — this is the true timestamp
      case 'input_audio_buffer.speech_started': {
        this.speechStartTime = Date.now()
        break
      }
      case 'input_audio_buffer.speech_stopped': {
        // Speech ended, timestamp is preserved for the next transcript
        break
      }

      case 'conversation.item.input_audio_transcription.delta': {
        const itemId = event.item_id as string
        const delta = event.delta as string
        if (!delta) break
        let seg = this.pendingSegments.get(itemId)
        if (!seg) {
          // Use the speech start time if available, otherwise fall back to now
          const timestamp = this.speechStartTime ?? Date.now()
          seg = { id: nextId(this.channel), speaker: this.channel, speakerName, speakerColor, text: '', isFinal: false, timestamp }
          this.pendingSegments.set(itemId, seg)
          this.speechStartTime = null // Consumed
        }
        seg.text += delta
        this.onTranscript({ ...seg })
        break
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const itemId = event.item_id as string
        const transcript = event.transcript as string
        let seg = this.pendingSegments.get(itemId)
        if (!seg) {
          seg = { id: nextId(this.channel), speaker: this.channel, speakerName, speakerColor, text: '', isFinal: false, timestamp: Date.now() }
        }
        seg.text = transcript ?? seg.text
        seg.isFinal = true
        this.onTranscript({ ...seg })
        this.pendingSegments.delete(itemId)
        break
      }
      case 'error': {
        const err = event.error as Record<string, unknown> | undefined
        this.onStatus('error', (err?.message as string) ?? 'Realtime API error')
        break
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES) { this.onStatus('error', `${this.channel}: max retries`); return }
    const delay = BASE_RETRY_MS * Math.pow(2, this.retryCount)
    this.retryCount++
    this.onStatus('connecting', `${this.channel}: reconnecting ${this.retryCount}/${MAX_RETRIES}`)
    this.retryTimeout = setTimeout(() => this.openWebSocket(), delay)
  }

  private send(obj: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  disconnect(): void {
    this.stopped = true
    this.stopPeriodicCommit()
    if (this.retryTimeout) { clearTimeout(this.retryTimeout); this.retryTimeout = null }
    if (this.ws) { this.ws.close(); this.ws = null }
    this.pendingSegments.clear()
  }
}

export class RealtimeTranscriptionService {
  private micChannel: RealtimeChannel | null = null
  private sysChannel: RealtimeChannel | null = null
  private onTranscript: TranscriptCallback
  private onStatus: StatusCallback
  private languages: string[]
  private vocabularyHints: string
  private micConnected = false
  private sysConnected = false

  constructor(onTranscript: TranscriptCallback, onStatus: StatusCallback, languages: string[] = [], vocabularyHints: string = '') {
    this.onTranscript = onTranscript
    this.onStatus = onStatus
    this.languages = languages
    this.vocabularyHints = vocabularyHints
  }

  connect(): void {
    this.micConnected = false
    this.sysConnected = false

    this.micChannel = new RealtimeChannel('mic', this.onTranscript, (status) => {
      if (status === 'connected') this.micConnected = true
      this.updateOverallStatus()
    }, this.languages, this.vocabularyHints)

    this.sysChannel = new RealtimeChannel('sys', this.onTranscript, (status) => {
      if (status === 'connected') this.sysConnected = true
      this.updateOverallStatus()
    }, this.languages, this.vocabularyHints)

    this.onStatus('connecting', 'Opening dual channels...')
    this.micChannel.connect()
    this.sysChannel.connect()
  }

  private updateOverallStatus(): void {
    if (this.micConnected && this.sysConnected) {
      this.onStatus('connected', 'Dual channels active')
    } else if (this.micConnected || this.sysConnected) {
      this.onStatus('connecting', `${this.micConnected ? 'Mic' : 'System'} connected, waiting for other...`)
    }
  }

  appendAudio(buffer: ArrayBuffer, channel: 'mic' | 'sys'): void {
    if (channel === 'mic') {
      this.micChannel?.appendAudio(buffer)
    } else {
      this.sysChannel?.appendAudio(buffer)
    }
  }

  disconnect(): void {
    this.micChannel?.disconnect()
    this.sysChannel?.disconnect()
    this.micChannel = null
    this.sysChannel = null
  }
}
