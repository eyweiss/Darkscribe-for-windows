import fs from 'fs'
import path from 'path'
import { app, ipcMain } from 'electron'
import { readConfig } from './config'

// Audio format constants
const CAPTURE_RATE = 24000   // Swift AudioCapture outputs 24kHz
const RECORD_RATE = 16000    // We store at 16kHz (telephony quality, ~3.5MB/30min)
const KEEP_EVERY = 3         // Keep 2 out of every 3 samples to downsample 24k→16k

let sessionId: string | null = null
let micChunks: Buffer[] = []
let sysChunks: Buffer[] = []
let startMs = 0
let recording = false

export function startRecording(sid: string): void {
  const cfg = readConfig()
  if (cfg.recordings_enabled === false) return
  sessionId = sid
  micChunks = []
  sysChunks = []
  startMs = Date.now()
  recording = true
  console.log('[Recording] Started for session', sid)
}

export function appendMicChunk(chunk: Buffer): void {
  if (!recording) return
  micChunks.push(Buffer.from(chunk))
}

export function appendSysChunk(chunk: Buffer): void {
  if (!recording) return
  sysChunks.push(Buffer.from(chunk))
}

export async function stopRecording(): Promise<{ filePath: string; durationMs: number } | null> {
  if (!recording || !sessionId) return null
  recording = false

  const durationMs = Date.now() - startMs
  const sid = sessionId
  sessionId = null

  const micTotal = micChunks.reduce((n, b) => n + b.length, 0)
  const sysTotal = sysChunks.reduce((n, b) => n + b.length, 0)
  const micBuf = Buffer.concat(micChunks, micTotal)
  const sysBuf = Buffer.concat(sysChunks, sysTotal)
  micChunks = []
  sysChunks = []

  const micSamples = micTotal / 2
  const sysSamples = sysTotal / 2
  const totalSamples = Math.max(micSamples, sysSamples)

  if (totalSamples === 0) {
    console.log('[Recording] No audio captured, skipping WAV write')
    return null
  }

  const outSamples = Math.floor(totalSamples * RECORD_RATE / CAPTURE_RATE)
  const pcm = new Int16Array(outSamples)

  let outIdx = 0

  for (let i = 0; i < totalSamples && outIdx < outSamples; i++) {
    const phase = i % KEEP_EVERY
    if (phase === 2) continue

    const micSample = i < micSamples ? micBuf.readInt16LE(i * 2) : 0
    const sysSample = i < sysSamples ? sysBuf.readInt16LE(i * 2) : 0

    const mixed = Math.max(-32768, Math.min(32767, Math.round((micSample + sysSample) / 2)))
    pcm[outIdx++] = mixed
  }

  const actualSamples = outIdx
  const pcmBytes = actualSamples * 2

  const wavBuffer = Buffer.alloc(44 + pcmBytes)
  let pos = 0

  wavBuffer.write('RIFF', pos); pos += 4
  wavBuffer.writeUInt32LE(36 + pcmBytes, pos); pos += 4
  wavBuffer.write('WAVE', pos); pos += 4

  wavBuffer.write('fmt ', pos); pos += 4
  wavBuffer.writeUInt32LE(16, pos); pos += 4
  wavBuffer.writeUInt16LE(1, pos); pos += 2
  wavBuffer.writeUInt16LE(1, pos); pos += 2
  wavBuffer.writeUInt32LE(RECORD_RATE, pos); pos += 4
  wavBuffer.writeUInt32LE(RECORD_RATE * 2, pos); pos += 4
  wavBuffer.writeUInt16LE(2, pos); pos += 2
  wavBuffer.writeUInt16LE(16, pos); pos += 2

  wavBuffer.write('data', pos); pos += 4
  wavBuffer.writeUInt32LE(pcmBytes, pos); pos += 4

  for (let i = 0; i < actualSamples; i++) {
    wavBuffer.writeInt16LE(pcm[i], pos)
    pos += 2
  }

  const sessDir = path.join(app.getPath('userData'), 'sessions', sid)
  fs.mkdirSync(sessDir, { recursive: true })
  const filePath = path.join(sessDir, 'recording.wav')
  fs.writeFileSync(filePath, wavBuffer)

  const sizeMB = (wavBuffer.length / 1048576).toFixed(1)
  console.log(`[Recording] Saved ${filePath} (${sizeMB} MB, ${(durationMs / 1000).toFixed(0)}s)`)

  return { filePath, durationMs }
}

export function purgeOldRecordings(): void {
  const cfg = readConfig()
  const retentionDays = cfg.recordings_retention_days ?? 30
  if (retentionDays <= 0) return

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const sessionsDir = path.join(app.getPath('userData'), 'sessions')
  if (!fs.existsSync(sessionsDir)) return

  let purged = 0
  for (const entry of fs.readdirSync(sessionsDir)) {
    const wavPath = path.join(sessionsDir, entry, 'recording.wav')
    if (!fs.existsSync(wavPath)) continue
    try {
      const stat = fs.statSync(wavPath)
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(wavPath)
        purged++
      }
    } catch {}
  }
  if (purged > 0) console.log(`[Recording] Purged ${purged} old recording(s) (>${retentionDays}d)`)
}

export function setupRecordingIpc(): void {
  ipcMain.removeHandler('recording:start')
  ipcMain.handle('recording:start', (_e, sid: string) => {
    startRecording(sid)
    return { ok: true }
  })

  ipcMain.removeHandler('recording:stop')
  ipcMain.handle('recording:stop', async () => {
    return await stopRecording()
  })

  ipcMain.removeHandler('recording:mic-chunk')
  ipcMain.on('recording:mic-chunk', (_e, buf: ArrayBuffer) => {
    if (!recording) return
    appendMicChunk(Buffer.from(buf))
  })

  ipcMain.removeHandler('recording:status')
  ipcMain.handle('recording:status', () => {
    const micBytes = micChunks.reduce((n, b) => n + b.length, 0)
    const sysBytes = sysChunks.reduce((n, b) => n + b.length, 0)
    const totalBytes = micBytes + sysBytes
    const estimatedBytes = Math.floor(totalBytes / 3) + 44
    return {
      isRecording: recording,
      durationMs: recording ? Date.now() - startMs : 0,
      estimatedBytes
    }
  })

  ipcMain.removeHandler('recording:delete')
  ipcMain.handle('recording:delete', (_e, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { ok: true }
    } catch (e) {
      console.error('[Recording] Delete failed:', e)
      return { ok: false }
    }
  })
}
