import React, { useEffect, useState } from 'react'

interface Props { onBack: () => void }

type Section = 'keys' | 'obsidian' | 'language' | 'appearance' | 'advanced'

export default function Settings({ onBack }: Props): React.ReactElement {
  const [activeSection, setActiveSection] = useState<Section>('keys')

  // API Keys
  const [openaiOk, setOpenaiOk] = useState(false)
  const [openaiEditing, setOpenaiEditing] = useState(false)
  const [openaiNewKey, setOpenaiNewKey] = useState('')
  const [tavilyOk, setTavilyOk] = useState(false)
  const [tavilyEditing, setTavilyEditing] = useState(false)
  const [tavilyNewKey, setTavilyNewKey] = useState('')

  // Obsidian connection
  const [obsidianConnected, setObsidianConnected] = useState(false)
  const [obsidianApiKeyEditing, setObsidianApiKeyEditing] = useState(false)
  const [obsidianNewApiKey, setObsidianNewApiKey] = useState('')
  const [obsidianPort, setObsidianPort] = useState('27124')
  const [obsidianVaultName, setObsidianVaultName] = useState('')
  const [subfolder, setSubfolder] = useState('')
  const [connectionTesting, setConnectionTesting] = useState(false)
  const [connectionMsg, setConnectionMsg] = useState('')

  // Auto-save
  const [autoSaveToVault, setAutoSaveToVault] = useState(false)
  const [saveIncomplete, setSaveIncomplete] = useState(false)

  // Language
  const [transcriptionMode, setTranscriptionMode] = useState<'auto' | 'preferred'>('auto')
  const [preferredLanguages, setPreferredLanguages] = useState<string[]>([])

  // Appearance
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')

  useEffect(() => {
    window.darkscribe.keychain.get('openai-api-key').then(k => { if (k) setOpenaiOk(true) })
    window.darkscribe.tavily.status().then(s => setTavilyOk(s.configured))
    window.darkscribe.vault.status().then(s => setObsidianConnected(s.connected))
    window.darkscribe.config.read().then(c => {
      setTheme((c.theme as any) ?? 'system')
      setObsidianPort(String((c.obsidian_port as number) ?? 27124))
      setObsidianVaultName((c.obsidian_vault_name as string) ?? '')
      setSubfolder((c.vault_subfolder as string) ?? '')
      setTranscriptionMode((c.transcription_mode as any) ?? 'auto')
      setPreferredLanguages((c.preferred_languages as string[]) ?? [])
      setAutoSaveToVault((c.auto_save_to_vault as boolean) ?? false)
      setSaveIncomplete((c.save_incomplete_sessions as boolean) ?? false)
    })
  }, [])

  const saveOpenaiKey = async () => {
    if (!openaiNewKey.trim()) return
    await window.darkscribe.keychain.set('openai-api-key', openaiNewKey.trim())
    setOpenaiOk(true); setOpenaiEditing(false); setOpenaiNewKey('')
  }

  const saveTavilyKey = async () => {
    if (!tavilyNewKey.trim()) return
    await window.darkscribe.tavily.setKey(tavilyNewKey.trim())
    setTavilyOk(true); setTavilyEditing(false); setTavilyNewKey('')
  }

  const testObsidianConnection = async () => {
    setConnectionTesting(true)
    setConnectionMsg('')
    const result = await window.darkscribe.vault.testConnection()
    setObsidianConnected(result.ok)
    setConnectionMsg(result.ok ? `Connected (${result.fileCount} files)` : `Failed: ${result.error}`)
    setConnectionTesting(false)
  }

  const saveObsidianApiKey = async () => {
    if (!obsidianNewApiKey.trim()) return
    await window.darkscribe.keychain.set('obsidian-api-key', obsidianNewApiKey.trim())
    setObsidianApiKeyEditing(false); setObsidianNewApiKey('')
    testObsidianConnection()
  }

  const saveObsidianSettings = async () => {
    await window.darkscribe.config.write({
      obsidian_port: parseInt(obsidianPort) || 27124,
      obsidian_vault_name: obsidianVaultName,
      vault_subfolder: subfolder
    })
  }

  const changeTheme = async (t: 'light' | 'dark' | 'system') => {
    setTheme(t)
    await window.darkscribe.app.setTheme(t)
    await window.darkscribe.config.write({ theme: t })
    if (t === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', t)
  }

  const LANGUAGES = [
    { code: 'en', label: 'English' }, { code: 'he', label: 'Hebrew' },
    { code: 'es', label: 'Spanish' }, { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' }, { code: 'ar', label: 'Arabic' },
    { code: 'zh', label: 'Chinese' }, { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' }, { code: 'pt', label: 'Portuguese' },
    { code: 'ru', label: 'Russian' }, { code: 'hi', label: 'Hindi' },
    { code: 'it', label: 'Italian' }, { code: 'nl', label: 'Dutch' },
    { code: 'pl', label: 'Polish' }, { code: 'tr', label: 'Turkish' }
  ]

  const toggleLanguage = async (code: string) => {
    let next: string[]
    if (preferredLanguages.includes(code)) {
      next = preferredLanguages.filter(c => c !== code)
    } else if (preferredLanguages.length < 3) {
      next = [...preferredLanguages, code]
    } else return
    setPreferredLanguages(next)
    await window.darkscribe.config.write({ preferred_languages: next })
  }

  const setMode = async (mode: 'auto' | 'preferred') => {
    setTranscriptionMode(mode)
    await window.darkscribe.config.write({ transcription_mode: mode })
  }

  const sections: { id: Section; label: string }[] = [
    { id: 'keys', label: 'API Keys' },
    { id: 'obsidian', label: 'Obsidian' },
    { id: 'language', label: 'Language' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'advanced', label: 'Advanced' }
  ]

  const card: React.CSSProperties = { padding: 'var(--sp-4)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-3)' }
  const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', background: 'var(--surface-2)', color: 'var(--ink-1)', width: '100%' }
  const btnSm: React.CSSProperties = { padding: '4px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--ink-2)', cursor: 'pointer' }

  return (
    <div className="page-enter" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 200, borderRight: '1px solid var(--border-1)', padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 'var(--text-sm)', cursor: 'pointer', textAlign: 'left', marginBottom: 'var(--sp-4)' }}>Back</button>
        <h2 style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-1)', marginBottom: 'var(--sp-3)' }}>Settings</h2>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            padding: '6px var(--sp-3)', background: activeSection === s.id ? 'var(--primary-subtle)' : 'none',
            border: 'none', borderRadius: 'var(--radius-sm)', textAlign: 'left',
            fontSize: 'var(--text-sm)', fontWeight: activeSection === s.id ? 600 : 400,
            color: activeSection === s.id ? 'var(--accent)' : 'var(--ink-2)', cursor: 'pointer'
          }}>{s.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-6)' }}>
        <div style={{ maxWidth: 500 }}>

          {activeSection === 'keys' && (
            <>
              <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-1)', marginBottom: 'var(--sp-4)' }}>API Keys</h3>
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>OpenAI</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: openaiOk ? 'var(--positive)' : 'var(--negative)', fontWeight: 600 }}>{openaiOk ? 'Configured' : 'Not set'}</span>
                </div>
                {openaiEditing ? (
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    <input value={openaiNewKey} onChange={e => setOpenaiNewKey(e.target.value)} placeholder="sk-..." style={inputStyle} />
                    <button onClick={saveOpenaiKey} style={{ ...btnSm, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }}>Save</button>
                  </div>
                ) : (
                  <button onClick={() => setOpenaiEditing(true)} style={btnSm}>{openaiOk ? 'Change' : 'Set Key'}</button>
                )}
              </div>
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Tavily (optional)</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: tavilyOk ? 'var(--positive)' : 'var(--ink-4)', fontWeight: 600 }}>{tavilyOk ? 'Configured' : 'Not set'}</span>
                </div>
                {tavilyEditing ? (
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    <input value={tavilyNewKey} onChange={e => setTavilyNewKey(e.target.value)} placeholder="tvly-..." style={inputStyle} />
                    <button onClick={saveTavilyKey} style={{ ...btnSm, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }}>Save</button>
                  </div>
                ) : (
                  <button onClick={() => setTavilyEditing(true)} style={btnSm}>{tavilyOk ? 'Change' : 'Set Key'}</button>
                )}
              </div>
            </>
          )}

          {activeSection === 'obsidian' && (
            <>
              <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-1)', marginBottom: 'var(--sp-4)' }}>Obsidian Connection</h3>
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: obsidianConnected ? 'var(--positive)' : 'var(--negative)' }} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: obsidianConnected ? 'var(--positive)' : 'var(--negative)' }}>
                    {obsidianConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>

                <div style={{ marginBottom: 'var(--sp-3)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>API Key</label>
                  {obsidianApiKeyEditing ? (
                    <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                      <input value={obsidianNewApiKey} onChange={e => setObsidianNewApiKey(e.target.value)} placeholder="REST API key..." style={inputStyle} />
                      <button onClick={saveObsidianApiKey} style={{ ...btnSm, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }}>Save</button>
                    </div>
                  ) : (
                    <button onClick={() => setObsidianApiKeyEditing(true)} style={btnSm}>Change API Key</button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Port</label>
                    <input value={obsidianPort} onChange={e => setObsidianPort(e.target.value)} onBlur={saveObsidianSettings} style={inputStyle} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Vault Name (for deep links)</label>
                    <input value={obsidianVaultName} onChange={e => setObsidianVaultName(e.target.value)} onBlur={saveObsidianSettings} style={inputStyle} />
                  </div>
                </div>

                <div style={{ marginBottom: 'var(--sp-3)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Darkscribe Subfolder</label>
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    <input value={subfolder} onChange={e => setSubfolder(e.target.value)} onBlur={saveObsidianSettings} placeholder="Work/Darkscribe" style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={async () => {
                      try {
                        const result = await window.darkscribe.dialog.selectVaultFolder(obsidianVaultName || undefined)
                        if (result) {
                          setSubfolder(result.relativePath || '')
                          saveObsidianSettings()
                        }
                      } catch (e) {
                        console.error('Browse folder failed:', e)
                      }
                    }} style={btnSm}>Browse</button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                  <button onClick={testObsidianConnection} disabled={connectionTesting} style={{ ...btnSm, opacity: connectionTesting ? 0.6 : 1 }}>
                    {connectionTesting ? 'Testing...' : 'Test Connection'}
                  </button>
                  {connectionMsg && <span style={{ fontSize: 'var(--text-xs)', color: obsidianConnected ? 'var(--positive)' : 'var(--negative)' }}>{connectionMsg}</span>}
                </div>

                {/* Auto-save toggles */}
                <div style={{ marginTop: 'var(--sp-4)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--border-1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)' }}>Auto-save to vault after summary</div>
                      <div style={{ fontSize: 9, color: 'var(--ink-4)', marginTop: 2 }}>Automatically saves transcript and summary to Obsidian when a call ends</div>
                    </div>
                    <button
                      onClick={async () => { const val = !autoSaveToVault; setAutoSaveToVault(val); await window.darkscribe.config.write({ auto_save_to_vault: val }) }}
                      style={{
                        padding: '2px 10px', background: autoSaveToVault ? 'var(--positive-subtle)' : 'var(--surface-2)',
                        border: `1px solid ${autoSaveToVault ? 'var(--positive)' : 'var(--border-1)'}`,
                        borderRadius: 'var(--radius-xs)', fontSize: 'var(--text-xs)', fontWeight: 600,
                        color: autoSaveToVault ? 'var(--positive)' : 'var(--ink-4)', cursor: 'pointer'
                      }}
                    >{autoSaveToVault ? 'ON' : 'OFF'}</button>
                  </div>
                  {autoSaveToVault && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 'var(--sp-3)' }}>
                      <div>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)' }}>Save incomplete sessions</div>
                        <div style={{ fontSize: 9, color: 'var(--ink-4)', marginTop: 2 }}>Also save sessions shorter than 30 seconds</div>
                      </div>
                      <button
                        onClick={async () => { const val = !saveIncomplete; setSaveIncomplete(val); await window.darkscribe.config.write({ save_incomplete_sessions: val }) }}
                        style={{
                          padding: '2px 10px', background: saveIncomplete ? 'var(--positive-subtle)' : 'var(--surface-2)',
                          border: `1px solid ${saveIncomplete ? 'var(--positive)' : 'var(--border-1)'}`,
                          borderRadius: 'var(--radius-xs)', fontSize: 'var(--text-xs)', fontWeight: 600,
                          color: saveIncomplete ? 'var(--positive)' : 'var(--ink-4)', cursor: 'pointer'
                        }}
                      >{saveIncomplete ? 'ON' : 'OFF'}</button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeSection === 'language' && (
            <>
              <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-1)', marginBottom: 'var(--sp-4)' }}>Transcription Language</h3>
              <div style={card}>
                <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
                  {(['auto', 'preferred'] as const).map(m => (
                    <button key={m} onClick={() => setMode(m)} style={{
                      padding: '8px 16px', background: transcriptionMode === m ? 'var(--primary-subtle)' : 'var(--surface-2)',
                      border: `1px solid ${transcriptionMode === m ? 'var(--accent)' : 'var(--border-1)'}`,
                      borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                      fontWeight: transcriptionMode === m ? 600 : 400,
                      color: transcriptionMode === m ? 'var(--accent)' : 'var(--ink-2)', cursor: 'pointer'
                    }}>
                      {m === 'auto' ? 'Auto-detect' : 'Preferred Languages'}
                    </button>
                  ))}
                </div>

                {transcriptionMode === 'auto' && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)' }}>
                    OpenAI will automatically detect the language being spoken. Works best for single-language calls.
                  </div>
                )}

                {transcriptionMode === 'preferred' && (
                  <>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginBottom: 'var(--sp-3)' }}>
                      Select up to 3 preferred languages. Improves accuracy for multilingual calls.
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                      {LANGUAGES.map(lang => {
                        const selected = preferredLanguages.includes(lang.code)
                        return (
                          <button key={lang.code} onClick={() => toggleLanguage(lang.code)} style={{
                            padding: '4px 12px',
                            background: selected ? 'var(--primary-subtle)' : 'var(--surface-2)',
                            border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-1)'}`,
                            borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)',
                            color: selected ? 'var(--accent)' : 'var(--ink-3)',
                            fontWeight: selected ? 600 : 400, cursor: 'pointer'
                          }}>
                            {lang.label}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {activeSection === 'appearance' && (
            <>
              <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-1)', marginBottom: 'var(--sp-4)' }}>Appearance</h3>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                {(['system', 'light', 'dark'] as const).map(t => (
                  <button key={t} onClick={() => changeTheme(t)} style={{
                    padding: '8px 16px', background: theme === t ? 'var(--primary-subtle)' : 'var(--surface-2)',
                    border: `1px solid ${theme === t ? 'var(--accent)' : 'var(--border-1)'}`,
                    borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                    fontWeight: theme === t ? 600 : 400, color: theme === t ? 'var(--accent)' : 'var(--ink-2)',
                    cursor: 'pointer', textTransform: 'capitalize'
                  }}>{t}</button>
                ))}
              </div>
            </>
          )}

          {activeSection === 'advanced' && (
            <>
              <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-1)', marginBottom: 'var(--sp-4)' }}>Advanced</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                <button onClick={() => window.darkscribe.app.openDataFolder()} style={{ ...card, cursor: 'pointer', textAlign: 'left', fontSize: 'var(--text-sm)', color: 'var(--ink-2)' }}>
                  Open Data Folder
                </button>
                <button onClick={() => { if (confirm('Reset all data? This cannot be undone.')) window.darkscribe.app.reset() }} style={{ padding: 'var(--sp-4)', background: 'var(--negative-subtle)', border: '1px solid var(--negative)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--negative)', cursor: 'pointer', textAlign: 'left' }}>
                  Reset App
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
