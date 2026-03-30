import React, { useState, useEffect } from 'react'
import type { TranscriptSegment } from '../services/openai-realtime'
import type { CallSummary } from '../services/summarizer'
import { detectAttendees, generateShareableSummary, buildShareableNoteFrontmatter, Attendee } from '../services/shareable-summary'

interface Props {
  segments: TranscriptSegment[]
  summary: CallSummary
  sessionId: string
  sessionName?: string
  onClose: () => void
}

type Phase = 'attendees' | 'generating' | 'preview'

export default function ShareableSummaryModal({ segments, summary, sessionId, sessionName, onClose }: Props): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('attendees')
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [detecting, setDetecting] = useState(true)
  const [newName, setNewName] = useState('')
  const [shareableMarkdown, setShareableMarkdown] = useState('')
  const [editedMarkdown, setEditedMarkdown] = useState('')
  const [error, setError] = useState('')
  const [savedToVault, setSavedToVault] = useState(false)
  const [copied, setCopied] = useState(false)

  // Detect attendees on mount
  useEffect(() => {
    ;(async () => {
      const key = await window.darkscribe.keychain.get('openai-api-key')
      if (!key) { setDetecting(false); return }
      try {
        const detected = await detectAttendees(segments, summary, key)
        setAttendees(detected)
      } catch {}
      setDetecting(false)
    })()
  }, [segments, summary])

  const removeAttendee = (idx: number) => {
    setAttendees(prev => prev.filter((_, i) => i !== idx))
  }

  const addAttendee = () => {
    if (!newName.trim()) return
    setAttendees(prev => [...prev, { name: newName.trim() }])
    setNewName('')
  }

  const generate = async () => {
    setPhase('generating')
    setError('')
    try {
      const key = await window.darkscribe.keychain.get('openai-api-key')
      if (!key) throw new Error('No API key')

      // Read skill file
      let skillContent: string | undefined
      try {
        const config = await window.darkscribe.config.read()
        const prefix = (config.vault_subfolder as string) || ''
        const skillPath = prefix ? `${prefix}/System/Notetaker Skill.md` : 'System/Notetaker Skill.md'
        const skillResult = await window.darkscribe.vault.readNote(skillPath)
        if (skillResult.content) skillContent = skillResult.content
      } catch {}

      const md = await generateShareableSummary(segments, summary, attendees, sessionName, key, skillContent)
      setShareableMarkdown(md)
      setEditedMarkdown(md)
      setPhase('preview')
    } catch (e) {
      setError((e as Error).message)
      setPhase('attendees')
    }
  }

  const saveToVault = async () => {
    try {
      const config = await window.darkscribe.config.read()
      const prefix = (config.vault_subfolder as string) || ''
      const vp = (p: string) => prefix ? `${prefix}/${p}` : p

      const date = new Date(summary.dateTime)
      const dateStr = date.toISOString().split('T')[0]
      const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-').substring(0, 5)
      const name = (sessionName || 'Unknown').replace(/[/\\:*?"<>|]/g, '-')

      // Build full content with frontmatter
      const frontmatter = buildShareableNoteFrontmatter(summary, attendees, sessionName)
      const internalRef = `\n\n---\n*Internal reference: [[${dateStr}_${timeStr}_${name}]]*`
      const fullContent = frontmatter + editedMarkdown + internalRef

      const notePath = vp(`Calls/Shared/${dateStr}_${timeStr}_${name}_shared.md`)

      // Ensure Calls/Shared directory exists
      try { await window.darkscribe.vault.createDirectory(vp('Calls/Shared')) } catch {}

      await window.darkscribe.vault.saveNote(notePath, fullContent)
      setSavedToVault(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(editedMarkdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const openInObsidian = () => {
    // Use obsidian:// URL scheme
    const config = window.darkscribe.config.read() as any
    // Best-effort — construct the Obsidian URI
    window.darkscribe.shell.openUrl(`obsidian://open?vault=Mark%20Mind`)
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000
  }

  const modal: React.CSSProperties = {
    background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-xl)', width: 640, maxHeight: '85vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden'
  }

  return (
    <div className="modal-overlay" style={overlay} onClick={onClose}>
      <div className="modal-content" style={modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: 'var(--sp-4)', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-1)' }}>Shareable Meeting Summary</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 18, cursor: 'pointer' }}>x</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-4)' }}>
          {error && (
            <div style={{ padding: 'var(--sp-2)', background: 'var(--negative-subtle)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--negative)', marginBottom: 'var(--sp-3)' }}>
              {error}
            </div>
          )}

          {phase === 'attendees' && (
            <>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-2)', marginBottom: 'var(--sp-3)' }}>
                {detecting ? 'Detecting attendees...' : 'Confirm attendees for the meeting summary:'}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
                {attendees.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', background: 'var(--primary-subtle)',
                    border: '1px solid var(--accent)', borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--text-xs)', color: 'var(--accent)'
                  }}>
                    <span style={{ fontWeight: 600 }}>{a.name}</span>
                    {a.role && <span style={{ color: 'var(--ink-3)' }}>({a.role})</span>}
                    <button onClick={() => removeAttendee(i)} style={{ background: 'none', border: 'none', color: 'var(--negative)', cursor: 'pointer', fontSize: 12, padding: 0, marginLeft: 2 }}>x</button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addAttendee() }}
                  placeholder="Add attendee..."
                  style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', background: 'var(--surface-2)', color: 'var(--ink-1)' }}
                />
                <button onClick={addAttendee} style={{ padding: '6px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', cursor: 'pointer', color: 'var(--ink-2)' }}>Add</button>
              </div>
            </>
          )}

          {phase === 'generating' && (
            <div style={{ textAlign: 'center', padding: 'var(--sp-8)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto var(--sp-3)' }} />
              <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)' }}>Creating shareable summary...</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {phase === 'preview' && (
            <textarea
              value={editedMarkdown}
              onChange={e => setEditedMarkdown(e.target.value)}
              style={{
                width: '100%', minHeight: 350, padding: 'var(--sp-3)',
                border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)', fontFamily: 'monospace',
                background: 'var(--surface-2)', color: 'var(--ink-1)',
                lineHeight: 1.6, resize: 'vertical'
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--border-1)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
          {phase === 'attendees' && (
            <button onClick={generate} disabled={detecting || attendees.length === 0} style={{
              padding: '8px 20px', background: 'var(--accent)', color: 'var(--accent-ink)',
              border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
              fontWeight: 600, cursor: 'pointer', opacity: detecting ? 0.6 : 1
            }}>
              Generate
            </button>
          )}

          {phase === 'preview' && (
            <>
              <button onClick={copyToClipboard} style={{
                padding: '8px 16px', background: 'var(--surface-2)', color: 'var(--ink-2)',
                border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)', cursor: 'pointer'
              }}>
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              <button onClick={saveToVault} disabled={savedToVault} style={{
                padding: '8px 16px',
                background: savedToVault ? 'var(--positive-subtle)' : 'var(--purple-subtle)',
                color: savedToVault ? 'var(--positive)' : 'var(--purple)',
                border: `1px solid ${savedToVault ? 'var(--positive)' : 'var(--purple)'}`,
                borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                fontWeight: 600, cursor: savedToVault ? 'default' : 'pointer'
              }}>
                {savedToVault ? 'Saved to Vault' : 'Save to Vault'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
