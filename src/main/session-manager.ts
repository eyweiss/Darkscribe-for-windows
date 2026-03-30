import fs from 'fs'
import path from 'path'
import { app, ipcMain } from 'electron'
import crypto from 'crypto'

export type SessionStatus = 'recording' | 'interrupted' | 'summarized' | 'complete'

export interface CallRecord {
  date: string
  durationMinutes?: number
  transcriptFile?: string
  summaryFile?: string
  tags?: string[]
  segmentCount?: number
  audioFile?: string
  vaultNotePath?: string
  originalSummary?: string
  status?: SessionStatus
  referenceCount?: number
}

export interface Session {
  id: string
  name?: string
  calls: CallRecord[]
  createdAt: string
  updatedAt: string
}

function sessionsFile(): string {
  return path.join(app.getPath('userData'), 'sessions.json')
}

function sessionDir(id: string): string {
  return path.join(app.getPath('userData'), 'sessions', id)
}

function readSessions(): Session[] {
  try {
    const file = sessionsFile()
    if (!fs.existsSync(file)) return []
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return []
  }
}

function writeSessions(sessions: Session[]): void {
  const file = sessionsFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(sessions, null, 2))
}

export function createSession(data: { name?: string }): Session {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const session: Session = {
    id,
    name: data.name,
    calls: [],
    createdAt: now,
    updatedAt: now
  }
  fs.mkdirSync(sessionDir(id), { recursive: true })
  const sessions = readSessions()
  sessions.unshift(session)
  writeSessions(sessions)
  return session
}

export function listSessions(): Session[] {
  return readSessions()
}

export function getSession(id: string): Session | null {
  return readSessions().find(s => s.id === id) ?? null
}

export function updateSession(id: string, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): Session | null {
  const sessions = readSessions()
  const idx = sessions.findIndex(s => s.id === id)
  if (idx === -1) return null
  sessions[idx] = { ...sessions[idx], ...updates, updatedAt: new Date().toISOString() }
  writeSessions(sessions)
  return sessions[idx]
}

export function addCallToSession(id: string, call: CallRecord): Session | null {
  const sessions = readSessions()
  const idx = sessions.findIndex(s => s.id === id)
  if (idx === -1) return null
  sessions[idx].calls.push(call)
  sessions[idx].updatedAt = new Date().toISOString()
  writeSessions(sessions)
  return sessions[idx]
}

export function deleteSession(id: string): boolean {
  const sessions = readSessions()
  const idx = sessions.findIndex(s => s.id === id)
  if (idx === -1) return false
  sessions.splice(idx, 1)
  writeSessions(sessions)
  const dir = sessionDir(id)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return true
}

export function getSessionDir(id: string): string {
  const dir = sessionDir(id)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ─── Per-session file I/O ─────────────────────────────────────────────

function sessionFilePath(id: string, filename: string): string {
  return path.join(sessionDir(id), filename)
}

function writeSessionFile(id: string, filename: string, data: unknown): void {
  const dir = sessionDir(id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(sessionFilePath(id, filename), JSON.stringify(data, null, 2))
}

function readSessionFile<T>(id: string, filename: string): T | null {
  try {
    const filePath = sessionFilePath(id, filename)
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export function saveTranscript(id: string, segments: unknown[]): void {
  writeSessionFile(id, 'transcript.json', segments)
}

export function loadTranscript(id: string): unknown[] | null {
  return readSessionFile<unknown[]>(id, 'transcript.json')
}

export function saveSummary(id: string, summary: unknown): void {
  writeSessionFile(id, 'summary.json', summary)
}

export function loadSummary(id: string): unknown | null {
  return readSessionFile(id, 'summary.json')
}

export function saveWebSearches(id: string, searches: unknown[]): void {
  writeSessionFile(id, 'web-searches.json', searches)
}

export function loadWebSearches(id: string): unknown[] | null {
  return readSessionFile<unknown[]>(id, 'web-searches.json')
}

export function saveReferences(id: string, refs: unknown[]): void {
  writeSessionFile(id, 'references.json', refs)
}

export function loadReferences(id: string): unknown[] | null {
  return readSessionFile<unknown[]>(id, 'references.json')
}

export function saveMetadata(id: string, meta: unknown): void {
  writeSessionFile(id, 'metadata.json', meta)
}

export function loadMetadata(id: string): unknown | null {
  return readSessionFile(id, 'metadata.json')
}

export function recoverInterrupted(): Array<{ sessionId: string; session: Session }> {
  const sessions = readSessions()
  const interrupted: Array<{ sessionId: string; session: Session }> = []

  for (const session of sessions) {
    const meta = readSessionFile<{ status?: string }>(session.id, 'metadata.json')
    if (meta?.status === 'recording') {
      // Mark as interrupted
      writeSessionFile(session.id, 'metadata.json', { ...meta, status: 'interrupted' })
      // Update call record status if exists
      const allSessions = readSessions()
      const idx = allSessions.findIndex(s => s.id === session.id)
      if (idx !== -1) {
        const lastCall = allSessions[idx].calls[allSessions[idx].calls.length - 1]
        if (lastCall) lastCall.status = 'interrupted'
        allSessions[idx].updatedAt = new Date().toISOString()
        writeSessions(allSessions)
      }
      interrupted.push({ sessionId: session.id, session })
    }
  }

  return interrupted
}

// ─── IPC Setup ─────────────────────────────────────────────────────────

export function setupSessionIpc(): void {
  ipcMain.handle('session:create', (_e, data) => createSession(data))
  ipcMain.handle('session:list', () => listSessions())
  ipcMain.handle('session:get', (_e, id: string) => getSession(id))
  ipcMain.handle('session:update', (_e, id: string, updates) => updateSession(id, updates))
  ipcMain.handle('session:delete', (_e, id: string) => deleteSession(id))
  ipcMain.handle('session:add-call', (_e, id: string, call: CallRecord) => addCallToSession(id, call))

  ipcMain.handle('session:update-call', (_e, sessionId: string, callIndex: number, updates: Partial<CallRecord>) => {
    const sessions = readSessions()
    const idx = sessions.findIndex(s => s.id === sessionId)
    if (idx === -1 || callIndex < 0 || callIndex >= sessions[idx].calls.length) return null
    sessions[idx].calls[callIndex] = { ...sessions[idx].calls[callIndex], ...updates }
    sessions[idx].updatedAt = new Date().toISOString()
    writeSessions(sessions)
    return sessions[idx]
  })

  // Per-session file persistence
  ipcMain.handle('session:save-transcript', (_e, id: string, segments: unknown[]) => { saveTranscript(id, segments); return { ok: true } })
  ipcMain.handle('session:load-transcript', (_e, id: string) => loadTranscript(id))
  ipcMain.handle('session:save-summary', (_e, id: string, summary: unknown) => { saveSummary(id, summary); return { ok: true } })
  ipcMain.handle('session:load-summary', (_e, id: string) => loadSummary(id))
  ipcMain.handle('session:save-web-searches', (_e, id: string, searches: unknown[]) => { saveWebSearches(id, searches); return { ok: true } })
  ipcMain.handle('session:load-web-searches', (_e, id: string) => loadWebSearches(id))
  ipcMain.handle('session:save-references', (_e, id: string, refs: unknown[]) => { saveReferences(id, refs); return { ok: true } })
  ipcMain.handle('session:load-references', (_e, id: string) => loadReferences(id))
  ipcMain.handle('session:save-metadata', (_e, id: string, meta: unknown) => { saveMetadata(id, meta); return { ok: true } })
  ipcMain.handle('session:load-metadata', (_e, id: string) => loadMetadata(id))
  ipcMain.handle('session:recover-interrupted', () => recoverInterrupted())
}
