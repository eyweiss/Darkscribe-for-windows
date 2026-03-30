import React, { useState } from 'react'

interface Props {
  onComplete: () => void
}

type Step = 'welcome' | 'api-key' | 'tavily-key' | 'obsidian-connection' | 'obsidian-subfolder' | 'permissions' | 'language' | 'done'

export default function OnboardingFlow({ onComplete }: Props): React.ReactElement {
  const [step, setStep] = useState<Step>('welcome')

  // OpenAI
  const [openaiKey, setOpenaiKey] = useState('')
  const [keyError, setKeyError] = useState('')

  // Tavily
  const [tavilyKey, setTavilyKey] = useState('')
  const [tavilyTesting, setTavilyTesting] = useState(false)
  const [tavilyError, setTavilyError] = useState('')

  // Obsidian connection
  const [obsidianApiKey, setObsidianApiKey] = useState('')
  const [obsidianPort, setObsidianPort] = useState('27124')
  const [obsidianVaultName, setObsidianVaultName] = useState('')
  const [connectionTesting, setConnectionTesting] = useState(false)
  const [connectionResult, setConnectionResult] = useState<{ ok: boolean; fileCount?: number; error?: string } | null>(null)

  // Subfolder
  const [subfolder, setSubfolder] = useState('Work/Darkscribe')

  const browseForFolder = async () => {
    try {
      const result = await window.darkscribe.dialog.selectVaultFolder(obsidianVaultName || undefined)
      if (result) {
        setSubfolder(result.relativePath || '')
      }
    } catch (e) {
      console.error('Browse folder failed:', e)
    }
  }

  // Language
  const [langMode, setLangMode] = useState<'auto' | 'preferred'>('auto')
  const [selectedLangs, setSelectedLangs] = useState<string[]>([])

  const LANGUAGES = [
    { code: 'en', name: 'English' }, { code: 'he', name: 'Hebrew' },
    { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' }, { code: 'ar', name: 'Arabic' },
    { code: 'zh', name: 'Chinese' }, { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' }, { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' }, { code: 'hi', name: 'Hindi' },
    { code: 'it', name: 'Italian' }, { code: 'nl', name: 'Dutch' },
    { code: 'pl', name: 'Polish' }, { code: 'tr', name: 'Turkish' }
  ]

  const toggleLang = (code: string) => {
    setSelectedLangs(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : prev.length < 3 ? [...prev, code] : prev
    )
  }

  const saveLanguageAndNext = async () => {
    await window.darkscribe.config.write({
      transcription_mode: langMode,
      preferred_languages: langMode === 'preferred' ? selectedLangs : []
    })
    setStep('done')
  }

  // Permissions
  const [permStatus, setPermStatus] = useState({ mic: false, screen: false })

  const saveOpenaiKey = async () => {
    if (!openaiKey.trim()) { setKeyError('API key is required'); return }
    await window.darkscribe.keychain.set('openai-api-key', openaiKey.trim())
    setStep('tavily-key')
  }

  const saveTavilyAndNext = async () => {
    if (tavilyKey.trim()) {
      setTavilyTesting(true)
      setTavilyError('')
      const result = await window.darkscribe.tavily.testKey(tavilyKey.trim())
      setTavilyTesting(false)
      if (!result.ok) { setTavilyError(result.error ?? 'Invalid key'); return }
      await window.darkscribe.tavily.setKey(tavilyKey.trim())
    }
    setStep('obsidian-connection')
  }

  const testObsidianConnection = async () => {
    if (!obsidianApiKey.trim()) return
    setConnectionTesting(true)
    setConnectionResult(null)

    // Save the API key and port first
    await window.darkscribe.keychain.set('obsidian-api-key', obsidianApiKey.trim())
    await window.darkscribe.config.write({
      obsidian_host: '127.0.0.1',
      obsidian_port: parseInt(obsidianPort) || 27124,
      obsidian_vault_name: obsidianVaultName.trim()
    })

    const result = await window.darkscribe.vault.testConnection()
    setConnectionResult(result)
    setConnectionTesting(false)
  }

  const saveObsidianAndNext = async () => {
    if (!connectionResult?.ok) return
    setStep('obsidian-subfolder')
  }

  const saveSubfolderAndNext = async () => {
    await window.darkscribe.config.write({ vault_subfolder: subfolder.trim() })
    setStep('permissions')
  }

  const checkPermissions = async () => {
    const mic = await window.darkscribe.permissions.micStatus()
    const screen = await window.darkscribe.permissions.screenStatus()
    setPermStatus({ mic: mic === 'granted', screen: screen === 'granted' })
  }

  const requestMic = async () => {
    await window.darkscribe.permissions.micRequest()
    checkPermissions()
  }

  const openScreenSettings = async () => {
    await window.darkscribe.shell.openPrivacySettings('Privacy_ScreenCapture')
    const iv = setInterval(async () => {
      const s = await window.darkscribe.permissions.screenStatus()
      if (s === 'granted') { clearInterval(iv); setPermStatus(p => ({ ...p, screen: true })) }
    }, 2000)
    setTimeout(() => clearInterval(iv), 60000)
  }

  const container: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100vh', padding: 'var(--sp-8)', textAlign: 'center', gap: 'var(--sp-4)',
    background: 'var(--surface-1)'
  }

  const btnPrimary: React.CSSProperties = {
    padding: '12px 32px', background: 'var(--accent)', color: 'var(--accent-ink)',
    border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700,
    fontSize: 'var(--text-sm)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)'
  }

  const btnSecondary: React.CSSProperties = {
    padding: '10px 24px', background: 'var(--surface-2)', color: 'var(--ink-2)',
    border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)', cursor: 'pointer'
  }

  const inputStyle: React.CSSProperties = {
    width: 360, padding: '10px 14px', border: '1px solid var(--border-1)',
    borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
    background: 'var(--surface-2)', color: 'var(--ink-1)'
  }

  if (step === 'welcome') {
    return (
      <div style={container}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', color: 'var(--ink-1)' }}>Darkscribe</h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-base)', maxWidth: 400 }}>
          Call transcription and note-taking that saves everything to your Obsidian vault.
        </p>
        <button onClick={() => setStep('api-key')} style={btnPrimary}>Get Started</button>
      </div>
    )
  }

  if (step === 'api-key') {
    return (
      <div style={container}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--ink-1)' }}>OpenAI API Key</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', maxWidth: 400 }}>
          Required for real-time transcription and summary generation.
        </p>
        <input value={openaiKey} onChange={e => { setOpenaiKey(e.target.value); setKeyError('') }} placeholder="sk-..." style={{ ...inputStyle, borderColor: keyError ? 'var(--negative)' : undefined }} />
        {keyError && <div style={{ color: 'var(--negative)', fontSize: 'var(--text-xs)' }}>{keyError}</div>}
        <button onClick={saveOpenaiKey} style={btnPrimary}>Continue</button>
      </div>
    )
  }

  if (step === 'tavily-key') {
    return (
      <div style={container}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--ink-1)' }}>Web Search (Optional)</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', maxWidth: 420 }}>
          Tavily provides high-quality web search during calls. Without it, Darkscribe falls back to OpenAI's built-in web search.
        </p>
        <input value={tavilyKey} onChange={e => { setTavilyKey(e.target.value); setTavilyError('') }} placeholder="tvly-..." style={{ ...inputStyle, borderColor: tavilyError ? 'var(--negative)' : undefined }} />
        {tavilyError && <div style={{ color: 'var(--negative)', fontSize: 'var(--text-xs)' }}>{tavilyError}</div>}
        {tavilyTesting && <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-xs)' }}>Testing...</div>}
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <button onClick={() => setStep('obsidian-connection')} style={btnSecondary}>Skip</button>
          <button onClick={saveTavilyAndNext} disabled={tavilyTesting} style={btnPrimary}>
            {tavilyKey.trim() ? 'Save & Continue' : 'Skip'}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'obsidian-connection') {
    return (
      <div style={container}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--ink-1)' }}>Obsidian Connection</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', maxWidth: 440 }}>
          Darkscribe connects to Obsidian via its <b>Local REST API</b> plugin. Make sure Obsidian is open with the plugin enabled.
        </p>

        {/* Setup guide — collapsed by default */}
        <details style={{ width: 420, textAlign: 'left', marginBottom: 'var(--sp-2)' }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--accent)', padding: 'var(--sp-1) 0' }}>
            First time? Setup guide
          </summary>
          <div style={{ padding: 'var(--sp-3)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', marginTop: 'var(--sp-1)', fontSize: 'var(--text-xs)', color: 'var(--ink-2)', lineHeight: 1.8 }}>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              <li>Open Obsidian with your vault</li>
              <li>Go to <b>Settings</b> (gear icon) → <b>Community plugins</b></li>
              <li>If disabled, click <b>"Turn on community plugins"</b></li>
              <li>Click <b>Browse</b> and search for <b>"Local REST API"</b></li>
              <li>Click <b>Install</b>, then <b>Enable</b></li>
              <li>Go back to Settings → scroll to <b>Local REST API</b></li>
              <li>Toggle ON <b>"Enable Non-Encrypted (HTTP) Server"</b></li>
              <li>Copy the <b>API Key</b> shown at the top</li>
              <li>Note the <b>port number</b> (usually 27123 or 27124)</li>
              <li>Paste both below and click <b>Test Connection</b></li>
            </ol>
            <button onClick={() => window.darkscribe.shell.openUrl('https://github.com/coddingtonbear/obsidian-local-rest-api')} style={{ marginTop: 8, padding: 0, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'var(--text-xs)', cursor: 'pointer', textDecoration: 'underline' }}>
              Plugin documentation →
            </button>
          </div>
        </details>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', width: 380 }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4, textAlign: 'left' }}>API Key (from plugin settings)</label>
            <input value={obsidianApiKey} onChange={e => setObsidianApiKey(e.target.value)} placeholder="Paste your REST API key..." style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4, textAlign: 'left' }}>Port</label>
              <input value={obsidianPort} onChange={e => setObsidianPort(e.target.value)} placeholder="27124" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4, textAlign: 'left' }}>Vault Name (for deep links)</label>
              <input value={obsidianVaultName} onChange={e => setObsidianVaultName(e.target.value)} placeholder="My Vault" style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>
        </div>

        <button onClick={testObsidianConnection} disabled={connectionTesting || !obsidianApiKey.trim()} style={{ ...btnSecondary, opacity: connectionTesting ? 0.6 : 1 }}>
          {connectionTesting ? 'Testing...' : 'Test Connection'}
        </button>

        {connectionResult && (
          <div style={{
            padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', maxWidth: 400,
            background: connectionResult.ok ? 'var(--positive-subtle)' : 'var(--negative-subtle)',
            border: `1px solid ${connectionResult.ok ? 'var(--positive)' : 'var(--negative)'}`,
            color: connectionResult.ok ? 'var(--positive)' : 'var(--negative)'
          }}>
            {connectionResult.ok
              ? `Connected! Found ${connectionResult.fileCount} files in your vault.`
              : `Connection failed: ${connectionResult.error}`
            }
          </div>
        )}

        {connectionResult && !connectionResult.ok && (
          <div style={{ color: 'var(--ink-4)', fontSize: 'var(--text-xs)', maxWidth: 400 }}>
            {connectionResult.error?.includes('connection') || connectionResult.error?.includes('refused')
              ? 'Make sure Obsidian is open with the Local REST API plugin enabled.'
              : connectionResult.error?.includes('401') || connectionResult.error?.includes('API key')
                ? 'Check your API key in Obsidian → Settings → Local REST API.'
                : 'Check the port number in Obsidian → Settings → Local REST API.'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <button onClick={() => setStep('permissions')} style={{ ...btnSecondary, color: 'var(--ink-4)' }}>Skip</button>
          <button onClick={saveObsidianAndNext} disabled={!connectionResult?.ok} style={{ ...btnPrimary, opacity: connectionResult?.ok ? 1 : 0.4 }}>Continue</button>
        </div>
      </div>
    )
  }

  if (step === 'obsidian-subfolder') {
    return (
      <div style={container}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--ink-1)' }}>Darkscribe Folder</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', maxWidth: 440 }}>
          Where in your vault should Darkscribe store notes? Type a path or browse your vault.
        </p>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', width: 380 }}>
          <input value={subfolder} onChange={e => setSubfolder(e.target.value)} placeholder="Work/Darkscribe" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={browseForFolder} style={btnSecondary}>Browse</button>
        </div>

        <div style={{ color: 'var(--ink-4)', fontSize: 'var(--text-xs)', maxWidth: 400 }}>
          Transcripts, summaries, and references will be saved under this folder. Directories are created automatically.
        </div>
        <button onClick={saveSubfolderAndNext} style={btnPrimary}>Continue</button>
      </div>
    )
  }

  if (step === 'permissions') {
    return (
      <div style={container}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--ink-1)' }}>Permissions</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', maxWidth: 400 }}>
          Darkscribe needs microphone and screen recording access to capture audio.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', width: 360 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--sp-3)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Microphone</span>
            {permStatus.mic ? (
              <span style={{ color: 'var(--positive)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>Granted</span>
            ) : (
              <button onClick={requestMic} style={{ ...btnSecondary, padding: '4px 12px', fontSize: 'var(--text-xs)' }}>Grant</button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--sp-3)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Screen Recording</span>
            {permStatus.screen ? (
              <span style={{ color: 'var(--positive)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>Granted</span>
            ) : (
              <button onClick={openScreenSettings} style={{ ...btnSecondary, padding: '4px 12px', fontSize: 'var(--text-xs)' }}>Open Settings</button>
            )}
          </div>
        </div>
        <button onClick={() => { checkPermissions(); setStep('language') }} style={btnPrimary}>Continue</button>
      </div>
    )
  }

  if (step === 'language') {
    return (
      <div style={container}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--ink-1)' }}>Transcription Language</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', maxWidth: 420 }}>
          What languages do you speak during calls? You can change this anytime in Settings.
        </p>

        <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
          <button onClick={() => setLangMode('auto')} style={{
            padding: '10px 20px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
            background: langMode === 'auto' ? 'var(--accent)' : 'var(--surface-2)', color: langMode === 'auto' ? 'white' : 'var(--ink-2)',
            border: langMode === 'auto' ? 'none' : '1px solid var(--border-1)'
          }}>Auto-detect</button>
          <button onClick={() => setLangMode('preferred')} style={{
            padding: '10px 20px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
            background: langMode === 'preferred' ? 'var(--accent)' : 'var(--surface-2)', color: langMode === 'preferred' ? 'white' : 'var(--ink-2)',
            border: langMode === 'preferred' ? 'none' : '1px solid var(--border-1)'
          }}>Choose Languages</button>
        </div>

        {langMode === 'preferred' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', maxWidth: 420, justifyContent: 'center' }}>
            {LANGUAGES.map(lang => {
              const selected = selectedLangs.includes(lang.code)
              return (
                <button key={lang.code} onClick={() => toggleLang(lang.code)} style={{
                  padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
                  background: selected ? 'var(--primary-subtle)' : 'var(--surface-2)',
                  color: selected ? 'var(--accent)' : 'var(--ink-3)',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-1)'}`
                }}>{lang.name}</button>
              )
            })}
            {selectedLangs.length >= 3 && (
              <div style={{ width: '100%', fontSize: 'var(--text-xs)', color: 'var(--ink-4)', textAlign: 'center', marginTop: 4 }}>
                Maximum 3 languages
              </div>
            )}
          </div>
        )}

        <button onClick={saveLanguageAndNext} style={btnPrimary}>Continue</button>
      </div>
    )
  }

  // done
  return (
    <div style={container}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--ink-1)' }}>Ready!</h2>
      <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', maxWidth: 400 }}>
        Darkscribe is set up and ready to use. Start your first call to begin transcribing.
      </p>
      <button onClick={onComplete} style={btnPrimary}>Start Using Darkscribe</button>
    </div>
  )
}
