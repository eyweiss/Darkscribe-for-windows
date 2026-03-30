import { app, BrowserWindow, nativeTheme, session, ipcMain } from 'electron'
import path from 'path'
import { setupIpcHandlers } from './ipc-handlers'
import { setupAudioBridge, cleanupAudioBridge } from './audio-bridge'
import { setupSessionIpc } from './session-manager'
import { setupTavilyIpc } from './tavily-search'
import { setupRecordingIpc, purgeOldRecordings } from './recording-writer'
import { setupObsidianIpc, testConnection } from './obsidian-api'
import { setupSkillLearnerIpc, checkForLearnings } from './skill-learner'
import { keychainGet } from './keychain'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    icon: path.join(
      __dirname,
      isMac ? '../../build/icon.icns' : '../../build/icon.ico'
    ),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Enable DevTools via keyboard shortcut
  // Mac: Cmd+Option+I  |  Windows: Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const devToolsShortcut = isMac
      ? input.meta && input.alt && input.key === 'i'
      : input.control && input.shift && input.key === 'I'
    if (devToolsShortcut) {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // Inject OpenAI auth headers for WebSocket connections
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['wss://api.openai.com/*', 'https://api.openai.com/*'] },
    (details, callback) => {
      const key = keychainGet('openai-api-key')
      if (key) {
        callback({
          requestHeaders: {
            ...details.requestHeaders,
            Authorization: `Bearer ${key}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        })
      } else {
        callback({ requestHeaders: details.requestHeaders })
      }
    }
  )

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Route renderer console.log to main process stdout for debugging
ipcMain.on('debug:log', (_e, ...args: unknown[]) => {
  console.log('[Renderer]', ...args)
})

app.whenReady().then(() => {
  setupIpcHandlers()
  setupSessionIpc()
  setupTavilyIpc()
  setupRecordingIpc()
  setupObsidianIpc()
  setupSkillLearnerIpc()
  purgeOldRecordings()

  // Test Obsidian connection on startup, then check for learnings
  testConnection()
    .then(result => {
      if (result.ok) {
        console.log(`[Obsidian] Connected (${result.fileCount} files)`)
        checkForLearnings().catch(err => console.log('[SkillLearner] Check skipped:', err.message))
      } else {
        console.log('[Obsidian] Not connected:', result.error)
      }
    })
    .catch(err => console.log('[Obsidian] Connection check failed:', err.message))

  createWindow()

  if (mainWindow) {
    setupAudioBridge(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      if (mainWindow) setupAudioBridge(mainWindow)
    }
  })
})

app.on('window-all-closed', () => {
  cleanupAudioBridge()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  cleanupAudioBridge()
})
