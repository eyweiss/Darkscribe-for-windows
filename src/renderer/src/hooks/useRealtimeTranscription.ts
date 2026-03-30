import { useState, useRef, useCallback, useEffect } from 'react'
import { RealtimeTranscriptionService, TranscriptSegment } from '../services/openai-realtime'

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected'

export interface Speaker {
  id: string
  name: string
  color: string
  source: 'mic' | 'sys'
}

export interface TranscriptionState {
  status: SessionStatus
  statusDetail: string
  segments: TranscriptSegment[]
  speakers: Speaker[]
  isCapturing: boolean
  sysChunkCount: number
  micChunkCount: number
  audioError: string
  callDuration: number
}

export interface TranscriptionActions {
  startSession: (sessionId: string) => Promise<void>
  stopSession: () => Promise<{ filePath: string; durationMs: number } | null>
}

const MIC_SAMPLE_RATE = 24000
const MIC_CHUNK_FRAMES = 2400

export function useRealtimeTranscription(): TranscriptionState & TranscriptionActions {
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [statusDetail, setStatusDetail] = useState('')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([
    { id: 'mic', name: 'You', color: '#2563eb', source: 'mic' },
    { id: 'sys', name: 'Them', color: '#059669', source: 'sys' }
  ])
  const [isCapturing, setIsCapturing] = useState(false)
  const [sysChunkCount, setSysChunkCount] = useState(0)
  const [micChunkCount, setMicChunkCount] = useState(0)
  const [audioError, setAudioError] = useState('')
  const [callDuration, setCallDuration] = useState(0)

  const serviceRef = useRef<RealtimeTranscriptionService | null>(null)
  const removeListenersRef = useRef<Array<() => void>>([])
  const micStreamRef = useRef<MediaStream | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleTranscriptSegment = useCallback((seg: TranscriptSegment) => {
    setSegments(prev => {
      const idx = prev.findIndex(s => s.id === seg.id)
      if (idx !== -1) {
        // Update existing segment in place
        const next = [...prev]
        next[idx] = seg
        return next
      }
      // Insert new segment in chronological order by timestamp
      const next = [...prev, seg]
      // Only sort if the new segment is out of order (optimization)
      if (prev.length > 0 && seg.timestamp < prev[prev.length - 1].timestamp) {
        next.sort((a, b) => a.timestamp - b.timestamp)
      }
      return next
    })
  }, [])

  const startMicCapture = useCallback(async (service: RealtimeTranscriptionService) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: MIC_SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      micStreamRef.current = stream
      const ctx = new AudioContext({ sampleRate: MIC_SAMPLE_RATE })
      micContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      micProcessorRef.current = processor
      let acc = new Int16Array(MIC_CHUNK_FRAMES), pos = 0
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        const input = e.inputBuffer.getChannelData(0)
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]))
          acc[pos++] = s < 0 ? s * 0x8000 : s * 0x7FFF
          if (pos >= MIC_CHUNK_FRAMES) {
            const chunk = acc.buffer.slice(0)
            service.appendAudio(chunk, 'mic')
            window.darkscribe.recording.micChunk(chunk)
            setMicChunkCount(p => p + 1)
            acc = new Int16Array(MIC_CHUNK_FRAMES)
            pos = 0
          }
        }
      }
      source.connect(processor); processor.connect(ctx.destination)
    } catch (err) { setAudioError(`Mic: ${(err as Error).message}`) }
  }, [])

  const stopMicCapture = useCallback(() => {
    micProcessorRef.current?.disconnect(); micProcessorRef.current = null
    micContextRef.current?.close(); micContextRef.current = null
    micStreamRef.current?.getTracks().forEach(t => t.stop()); micStreamRef.current = null
  }, [])

  const startSession = useCallback(async (sessionId: string) => {
    setSysChunkCount(0); setMicChunkCount(0); setAudioError(''); setCallDuration(0)
    setSpeakers([
      { id: 'mic', name: 'You', color: '#2563eb', source: 'mic' },
      { id: 'sys', name: 'Them', color: '#059669', source: 'sys' }
    ])
    setSegments([])

    const audioResult = await window.darkscribe.audio.start()
    if (audioResult.error) { setStatus('error'); setStatusDetail(audioResult.error); return }
    setIsCapturing(true)

    window.darkscribe.recording.start(sessionId).catch(() => {})
    timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000)

    // Read language settings and vocabulary hints from config + skill file
    let languages: string[] = []
    let vocabularyHints = ''
    try {
      const config = await window.darkscribe.config.read()
      if (config.transcription_mode === 'preferred' && config.preferred_languages?.length) {
        languages = config.preferred_languages as string[]
      }

      // Load vocabulary from Notetaker Skill file
      const prefix = (config.vault_subfolder as string) || ''
      const skillPath = prefix ? `${prefix}/System/Notetaker Skill.md` : 'System/Notetaker Skill.md'
      try {
        const skillResult = await window.darkscribe.vault.readNote(skillPath)
        if (skillResult?.content) {
          // Extract the "Vocabulary and Corrections" section
          const vocabMatch = skillResult.content.match(/## Vocabulary and Corrections\n([\s\S]*?)(?=\n## |\n---|\Z)/)
          if (vocabMatch?.[1]?.trim()) {
            vocabularyHints = vocabMatch[1].trim()
          }
        }
      } catch {} // Vault may not be connected — that's fine
    } catch {}

    const service = new RealtimeTranscriptionService(
      handleTranscriptSegment,
      (s, detail) => {
        setStatus(s === 'connecting' ? 'connecting' : s === 'connected' ? 'connected' : s === 'disconnected' ? 'disconnected' : 'error')
        setStatusDetail(detail ?? '')
      },
      languages,
      vocabularyHints
    )
    serviceRef.current = service; service.connect()
    startMicCapture(service)

    const removeChunk = window.darkscribe.audio.onChunk((buffer: ArrayBuffer) => { service.appendAudio(buffer, 'sys'); setSysChunkCount(p => p + 1) })
    const removeStopped = window.darkscribe.audio.onStopped(() => {})
    const removePermDenied = window.darkscribe.audio.onPermissionDenied(() => {})
    const removeError = window.darkscribe.audio.onError((msg: string) => setAudioError(msg))
    removeListenersRef.current = [removeChunk, removeStopped, removePermDenied, removeError]
  }, [handleTranscriptSegment, startMicCapture])

  const stopSession = useCallback(async () => {
    await window.darkscribe.audio.stop(); setIsCapturing(false); stopMicCapture()
    serviceRef.current?.disconnect(); serviceRef.current = null
    removeListenersRef.current.forEach(fn => fn()); removeListenersRef.current = []
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setStatus('idle'); setStatusDetail('')
    try {
      return await window.darkscribe.recording.stop()
    } catch {
      return null
    }
  }, [stopMicCapture])

  useEffect(() => {
    return () => {
      serviceRef.current?.disconnect(); removeListenersRef.current.forEach(fn => fn()); stopMicCapture(); window.darkscribe.audio.stop()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [stopMicCapture])

  return { status, statusDetail, segments, speakers, isCapturing, sysChunkCount, micChunkCount, audioError, callDuration, startSession, stopSession }
}
