import { app, ipcMain, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { appendSysChunk } from './recording-writer'

let captureProcess: ChildProcess | null = null

// 2400 frames × 2 bytes per Int16 = 100ms of audio at 24kHz
const CHUNK_BYTES = 2400 * 2
const accumulator = Buffer.alloc(CHUNK_BYTES)
let accPos = 0
let chunksSent = 0

function getAudioCaptureSpawnArgs(): { cmd: string; args: string[] } {
  if (process.platform === 'win32') {
    // Capture system audio via VB-Cable (dshow) — Zoom audio is routed through it
    // Output: raw Int16 PCM, 24kHz, mono — identical format to the Swift binary
    return {
      cmd: 'ffmpeg',
      args: [
        '-f', 'dshow',
        '-i', 'audio=CABLE Output (VB-Audio Virtual Cable)',
        '-ac', '1',
        '-ar', '24000',
        '-f', 's16le',
        '-loglevel', 'error',
        'pipe:1'
      ]
    }
  }
  // macOS: original Swift binary
  const bin = app.isPackaged
    ? path.join(process.resourcesPath, 'AudioCapture')
    : path.join(app.getAppPath(), 'resources', 'AudioCapture')
  return { cmd: bin, args: [] }
}

function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

export function setupAudioBridge(win: BrowserWindow): void {
  ipcMain.removeHandler('audio:check-permission')
  ipcMain.handle('audio:check-permission', async () => {
    if (process.platform === 'win32') {
      // FFmpeg is available system-wide; no binary to check
      return { status: 'unknown' }
    }
    const { cmd } = getAudioCaptureSpawnArgs()
    if (!require('fs').existsSync(cmd)) {
      return { status: 'unavailable', message: 'AudioCapture binary not built yet' }
    }
    return { status: 'unknown' }
  })

  ipcMain.removeHandler('audio:start')
  ipcMain.handle('audio:start', async () => {
    if (captureProcess) return { error: 'Already capturing' }

    if (process.platform !== 'win32') {
      const { cmd } = getAudioCaptureSpawnArgs()
      if (!require('fs').existsSync(cmd)) {
        return { error: 'AudioCapture binary not found. Run: npm run build:swift' }
      }
    }

    accPos = 0
    chunksSent = 0

    const { cmd, args } = getAudioCaptureSpawnArgs()
    captureProcess = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    captureProcess.stdout!.on('data', (chunk: Buffer) => {
      let offset = 0
      while (offset < chunk.length) {
        const copy = Math.min(chunk.length - offset, CHUNK_BYTES - accPos)
        chunk.copy(accumulator, accPos, offset, offset + copy)
        accPos += copy
        offset += copy
        if (accPos >= CHUNK_BYTES) {
          const buf = Buffer.from(accumulator)
          safeSend(win, 'audio:chunk', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
          appendSysChunk(buf)
          accPos = 0
          chunksSent++
          if (chunksSent % 100 === 0) {
            console.log(`[AudioCapture] ${chunksSent} chunks sent (${(chunksSent * 0.1).toFixed(0)}s of audio)`)
          }
        }
      }
    })

    captureProcess.stderr!.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      if (!msg) return
      console.error('[AudioCapture]', msg)
      if (msg.includes('permission denied') || msg.includes('No display') || msg.includes('failed')) {
        safeSend(win, 'audio:error', msg)
        safeSend(win, 'audio:permission-denied')
      }
    })

    captureProcess.on('exit', (code) => {
      console.log(`[AudioCapture] exited with code ${code}, ${chunksSent} total chunks sent`)
      captureProcess = null
      safeSend(win, 'audio:stopped', { code })
    })

    return { ok: true }
  })

  ipcMain.removeHandler('audio:stop')
  ipcMain.handle('audio:stop', async () => {
    if (!captureProcess) return { ok: true }
    captureProcess.stdin?.end()
    captureProcess.kill()
    captureProcess = null
    accPos = 0
    return { ok: true }
  })
}

export function cleanupAudioBridge(): void {
  if (captureProcess) {
    captureProcess.stdin?.end()
    captureProcess.kill()
    captureProcess = null
  }
}
