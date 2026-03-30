// Direct HTTP client for Obsidian's Local REST API plugin.
// No MCP subprocess needed. Just HTTP requests with Bearer token auth.
// Requires Obsidian to be running with the Local REST API plugin enabled.

import { ipcMain } from 'electron'
import { readConfig } from './config'
import { keychainGet } from './keychain'

const REQUEST_TIMEOUT_MS = 10000

// ─── HTTP helpers ─────────────────────────────────────────────────────

function getBaseUrl(): string {
  const config = readConfig()
  const host = config.obsidian_host ?? '127.0.0.1'
  const port = config.obsidian_port ?? 27124
  return `http://${host}:${port}`
}

function getApiKey(): string {
  const key = keychainGet('obsidian-api-key')
  if (!key) throw new Error('Obsidian API key not configured. Go to Settings → Obsidian Connection.')
  return key
}

function getSubfolder(): string {
  const config = readConfig()
  return config.vault_subfolder ?? ''
}

// Prepend the Darkscribe subfolder to a relative path
export function vaultPath(relativePath: string): string {
  const prefix = getSubfolder()
  return prefix ? `${prefix}/${relativePath}` : relativePath
}

async function obsidianFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getBaseUrl()
  const apiKey = getApiKey()
  const url = `${baseUrl}${path}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...options.headers
      }
    })
    return resp
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Obsidian API request timed out (${REQUEST_TIMEOUT_MS}ms): ${path}`)
    }
    throw new Error(`Obsidian API connection failed: ${(err as Error).message}. Is Obsidian running with the REST API plugin?`)
  } finally {
    clearTimeout(timer)
  }
}

// ─── Vault operations ─────────────────────────────────────────────────

// Test connection to the Obsidian REST API
export async function testConnection(): Promise<{ ok: boolean; fileCount?: number; error?: string }> {
  try {
    const resp = await obsidianFetch('/vault/')
    if (resp.status === 401) return { ok: false, error: 'Invalid API key' }
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}: ${resp.statusText}` }
    const data = await resp.json() as { files?: string[] }
    return { ok: true, fileCount: data.files?.length ?? 0 }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// Read a file's content
export async function readNote(filePath: string): Promise<string> {
  const encoded = encodeURIComponent(filePath)
  const resp = await obsidianFetch(`/vault/${encoded}`, {
    headers: { 'Accept': 'text/markdown' }
  })
  if (resp.status === 404) throw new Error(`Note not found: ${filePath}`)
  if (!resp.ok) throw new Error(`Read failed (${resp.status}): ${filePath}`)
  return await resp.text()
}

// Create or overwrite a file (PUT = create/overwrite)
export async function saveNote(filePath: string, content: string): Promise<void> {
  const encoded = encodeURIComponent(filePath)
  const resp = await obsidianFetch(`/vault/${encoded}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown' },
    body: content
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Save failed (${resp.status}): ${filePath} — ${text}`)
  }
}

// Append content to a file (POST = append, creates if doesn't exist)
export async function appendNote(filePath: string, content: string): Promise<void> {
  const encoded = encodeURIComponent(filePath)
  const resp = await obsidianFetch(`/vault/${encoded}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/markdown' },
    body: content
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Append failed (${resp.status}): ${filePath} — ${text}`)
  }
}

// Delete a file
export async function deleteNote(filePath: string): Promise<void> {
  const encoded = encodeURIComponent(filePath)
  const resp = await obsidianFetch(`/vault/${encoded}`, { method: 'DELETE' })
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Delete failed (${resp.status}): ${filePath}`)
  }
}

// Search vault (full-text search)
// Obsidian REST API: POST /search/simple/?contextLength=N with plain text body
export async function searchVault(query: string, contextLength: number = 100): Promise<Array<{ path: string; snippet: string; score: number }>> {
  const encodedQuery = encodeURIComponent(query)
  const url = `/search/simple/?query=${encodedQuery}&contextLength=${contextLength}`
  console.log('[Obsidian:searchVault] URL:', url)
  const resp = await obsidianFetch(url, {
    method: 'POST'
  })
  console.log('[Obsidian:searchVault] Response status:', resp.status)
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    console.error('[Obsidian:searchVault] Error body:', text)
    throw new Error(`Search failed (${resp.status}): ${text}`)
  }

  const rawText = await resp.text()
  console.log('[Obsidian:searchVault] Raw response length:', rawText.length, 'preview:', rawText.substring(0, 300))

  if (!rawText || rawText === '[]') {
    console.log('[Obsidian:searchVault] Empty result')
    return []
  }

  const data = JSON.parse(rawText) as Array<{
    filename: string
    score: number
    matches: Array<{ match: { start: number; end: number }; context: string }>
  }>

  console.log('[Obsidian:searchVault] Parsed entries:', data.length)

  return data.map(item => ({
    path: item.filename,
    snippet: item.matches?.[0]?.context ?? '',
    score: item.score
  }))
}

// List files in a directory
export async function listFiles(dirPath?: string): Promise<string[]> {
  const path = dirPath ? `/vault/${encodeURIComponent(dirPath + '/')}/` : '/vault/'
  const resp = await obsidianFetch(path)
  if (!resp.ok) throw new Error(`List failed (${resp.status})`)
  const data = await resp.json() as { files?: string[] }
  return data.files ?? []
}

// Patch content in a specific section of a note (uses the PATCH endpoint)
export async function patchNote(
  filePath: string,
  content: string,
  operation: 'append' | 'prepend' | 'replace',
  target: string,
  targetType: 'heading' | 'block' | 'frontmatter'
): Promise<void> {
  const encoded = encodeURIComponent(filePath)
  const resp = await obsidianFetch(`/vault/${encoded}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      operation,
      target,
      targetType
    })
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Patch failed (${resp.status}): ${filePath} — ${text}`)
  }
}

// ─── IPC Setup ────────────────────────────────────────────────────────

export function setupObsidianIpc(): void {
  ipcMain.handle('vault:test-connection', async () => {
    return await testConnection()
  })

  ipcMain.handle('vault:status', async () => {
    const result = await testConnection()
    return { connected: result.ok, error: result.error }
  })

  ipcMain.handle('vault:read-note', async (_e, filePath: string) => {
    try {
      const content = await readNote(filePath)
      return { content }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('vault:save-note', async (_e, filePath: string, content: string) => {
    try {
      await saveNote(filePath, content)
      console.log(`[Obsidian] Saved: ${filePath} (${content.length} chars)`)
      return { ok: true }
    } catch (err) {
      console.error(`[Obsidian] Save failed: ${filePath}`, (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('vault:create-note', async (_e, filePath: string, content: string) => {
    try {
      await saveNote(filePath, content)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('vault:edit-note', async (_e, filePath: string, content: string) => {
    try {
      await saveNote(filePath, content)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('vault:append-note', async (_e, filePath: string, content: string) => {
    try {
      await appendNote(filePath, content)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('vault:patch-note', async (_e, filePath: string, content: string, operation: string, target: string, targetType: string) => {
    try {
      await patchNote(filePath, content, operation as any, target, targetType as any)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('vault:search', async (_e, query: string) => {
    try {
      console.log('[Obsidian:search] Query:', query)
      const subfolder = getSubfolder()
      console.log('[Obsidian:search] Subfolder filter:', subfolder)
      const allResults = await searchVault(query)
      console.log('[Obsidian:search] Raw results:', allResults.length, allResults.map(r => r.path).slice(0, 5))
      // Filter to Darkscribe subfolder first, then show others
      const scoped = subfolder
        ? allResults.filter(r => r.path.startsWith(subfolder))
        : allResults
      console.log('[Obsidian:search] Scoped results:', scoped.length)
      return { results: scoped.length > 0 ? scoped : allResults.slice(0, 10) }
    } catch (err) {
      console.error('[Obsidian:search] Failed:', (err as Error).message)
      return { results: [], error: (err as Error).message }
    }
  })

  ipcMain.handle('vault:list-files', async (_e, dirPath?: string) => {
    try {
      const files = await listFiles(dirPath)
      return { files }
    } catch (err) {
      return { files: [], error: (err as Error).message }
    }
  })

  ipcMain.handle('vault:delete-note', async (_e, filePath: string) => {
    try {
      await deleteNote(filePath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Legacy compatibility — vault:connect just tests the connection
  ipcMain.handle('vault:connect', async () => {
    return await testConnection()
  })

  ipcMain.handle('vault:disconnect', async () => {
    return { ok: true } // No-op for HTTP
  })

  // Directory creation via saving a placeholder (REST API creates dirs automatically)
  ipcMain.handle('vault:create-directory', async (_e, dirPath: string) => {
    // The REST API creates directories automatically when saving a file.
    // Save a .gitkeep-like placeholder if the dir doesn't have files.
    return { ok: true }
  })
}
