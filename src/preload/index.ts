import { contextBridge, ipcRenderer } from 'electron'

const api = {
  keychain: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('keychain:get', key),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('keychain:set', key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('keychain:delete', key)
  },
  config: {
    read: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('config:read'),
    write: (updates: Record<string, unknown>): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('config:write', updates)
  },
  permissions: {
    micStatus: (): Promise<string> => ipcRenderer.invoke('permissions:mic-status'),
    micRequest: (): Promise<boolean> => ipcRenderer.invoke('permissions:mic-request'),
    screenStatus: (): Promise<string> => ipcRenderer.invoke('permissions:screen-status')
  },
  shell: {
    openPrivacySettings: (pane: string): Promise<void> =>
      ipcRenderer.invoke('shell:open-privacy-settings', pane),
    openUrl: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-url', url)
  },
  app: {
    reset: (): Promise<void> => ipcRenderer.invoke('app:reset'),
    openDataFolder: (): Promise<void> => ipcRenderer.invoke('app:open-data-folder'),
    getDataPath: (): Promise<string> => ipcRenderer.invoke('app:get-data-path'),
    setTheme: (theme: 'light' | 'dark' | 'system'): Promise<{ ok: boolean }> => ipcRenderer.invoke('app:set-theme', theme),
    getTheme: (): Promise<'light' | 'dark' | 'system'> => ipcRenderer.invoke('app:get-theme')
  },
  dialog: {
    selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:select-directory'),
    selectVaultFolder: (vaultName?: string): Promise<{ absolutePath: string; relativePath: string; vaultRoot: string } | null> =>
      ipcRenderer.invoke('dialog:select-vault-folder', vaultName)
  },
  audio: {
    start: (): Promise<{ ok?: boolean; error?: string }> => ipcRenderer.invoke('audio:start'),
    stop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('audio:stop'),
    checkPermission: (): Promise<{ status: string; message?: string }> =>
      ipcRenderer.invoke('audio:check-permission'),
    onChunk: (cb: (buffer: ArrayBuffer) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, buf: ArrayBuffer) => cb(buf)
      ipcRenderer.on('audio:chunk', listener)
      return () => ipcRenderer.removeListener('audio:chunk', listener)
    },
    onStopped: (cb: (info: { code: number | null }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, info: { code: number | null }) => cb(info)
      ipcRenderer.on('audio:stopped', listener)
      return () => ipcRenderer.removeListener('audio:stopped', listener)
    },
    onPermissionDenied: (cb: () => void): (() => void) => {
      const listener = () => cb()
      ipcRenderer.on('audio:permission-denied', listener)
      return () => ipcRenderer.removeListener('audio:permission-denied', listener)
    },
    onError: (cb: (msg: string) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, msg: string) => cb(msg)
      ipcRenderer.on('audio:error', listener)
      return () => ipcRenderer.removeListener('audio:error', listener)
    }
  },
  session: {
    create: (data: { name?: string }): Promise<unknown> =>
      ipcRenderer.invoke('session:create', data),
    list: (): Promise<unknown[]> => ipcRenderer.invoke('session:list'),
    get: (id: string): Promise<unknown> => ipcRenderer.invoke('session:get', id),
    update: (id: string, updates: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('session:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('session:delete', id),
    addCall: (id: string, call: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('session:add-call', id, call),
    updateCall: (sessionId: string, callIndex: number, updates: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('session:update-call', sessionId, callIndex, updates),
    // Per-session file persistence
    saveTranscript: (id: string, segments: unknown[]): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('session:save-transcript', id, segments),
    loadTranscript: (id: string): Promise<unknown[] | null> =>
      ipcRenderer.invoke('session:load-transcript', id),
    saveSummary: (id: string, summary: unknown): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('session:save-summary', id, summary),
    loadSummary: (id: string): Promise<unknown | null> =>
      ipcRenderer.invoke('session:load-summary', id),
    saveWebSearches: (id: string, searches: unknown[]): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('session:save-web-searches', id, searches),
    loadWebSearches: (id: string): Promise<unknown[] | null> =>
      ipcRenderer.invoke('session:load-web-searches', id),
    saveReferences: (id: string, refs: unknown[]): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('session:save-references', id, refs),
    loadReferences: (id: string): Promise<unknown[] | null> =>
      ipcRenderer.invoke('session:load-references', id),
    saveMetadata: (id: string, meta: unknown): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('session:save-metadata', id, meta),
    loadMetadata: (id: string): Promise<unknown | null> =>
      ipcRenderer.invoke('session:load-metadata', id),
    recoverInterrupted: (): Promise<unknown[]> =>
      ipcRenderer.invoke('session:recover-interrupted')
  },
  recording: {
    start: (sessionId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('recording:start', sessionId),
    stop: (): Promise<{ filePath: string; durationMs: number } | null> =>
      ipcRenderer.invoke('recording:stop'),
    micChunk: (chunk: ArrayBuffer): void => ipcRenderer.send('recording:mic-chunk', chunk),
    status: (): Promise<{ isRecording: boolean; durationMs: number; estimatedBytes: number }> =>
      ipcRenderer.invoke('recording:status'),
    delete: (filePath: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('recording:delete', filePath)
  },
  web: {
    search: (query: string): Promise<{ results: Array<{ title: string; content: string; url: string; score: number }>; answer?: string; error?: string; source?: string }> =>
      ipcRenderer.invoke('web:search', query)
  },
  tavily: {
    search: (query: string): Promise<{ results: Array<{ title: string; content: string; url: string; score: number }>; answer?: string; error?: string }> =>
      ipcRenderer.invoke('tavily:search', query),
    testKey: (apiKey: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('tavily:test-key', apiKey),
    setKey: (apiKey: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('tavily:set-key', apiKey),
    removeKey: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('tavily:remove-key'),
    status: (): Promise<{ configured: boolean; hasKey: boolean }> => ipcRenderer.invoke('tavily:status')
  },
  vault: {
    testConnection: (): Promise<{ ok: boolean; fileCount?: number; error?: string }> =>
      ipcRenderer.invoke('vault:test-connection'),
    status: (): Promise<{ connected: boolean; error?: string }> =>
      ipcRenderer.invoke('vault:status'),
    readNote: (filePath: string): Promise<{ content?: string; error?: string }> =>
      ipcRenderer.invoke('vault:read-note', filePath),
    saveNote: (filePath: string, content: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('vault:save-note', filePath, content),
    createNote: (filePath: string, content: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('vault:create-note', filePath, content),
    editNote: (filePath: string, content: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('vault:edit-note', filePath, content),
    appendNote: (filePath: string, content: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('vault:append-note', filePath, content),
    patchNote: (filePath: string, content: string, operation: string, target: string, targetType: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('vault:patch-note', filePath, content, operation, target, targetType),
    deleteNote: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('vault:delete-note', filePath),
    search: (query: string): Promise<{ results: Array<{ path: string; snippet: string; score?: number }>; error?: string }> =>
      ipcRenderer.invoke('vault:search', query),
    listFiles: (dirPath?: string): Promise<{ files: string[]; error?: string }> =>
      ipcRenderer.invoke('vault:list-files', dirPath),
    // Legacy compatibility
    connect: (vaultPath?: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('vault:connect'),
    disconnect: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('vault:disconnect'),
    createDirectory: (dirPath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('vault:create-directory', dirPath)
  },
  skillLearner: {
    check: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('skill-learner:check'),
    consolidate: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('skill-learner:consolidate')
  }
}

contextBridge.exposeInMainWorld('darkscribe', api)

export type DarkscribeAPI = typeof api
