import React, { useEffect, useState } from 'react'
import type { TranscriptSegment } from '../services/openai-realtime'
import { generateVoiceNoteSummary, VoiceNoteSummary as VNSummary } from '../services/summarizer'
import type { VoiceNoteCategory } from './VoiceNoteSetup'

function sanitizeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function buildVoiceNoteMarkdown(sum: VNSummary, segments: TranscriptSegment[], category: VoiceNoteCategory): string {
  const lines: string[] = [
    '---',
    `tags: [voice-note, ${category.toLowerCase()}, second-brain]`,
    `date: "${sum.dateTime.split('T')[0]}"`,
    `topic: "${sum.topic}"`,
    `category: "${category}"`,
    `duration: "${sum.durationMinutes}min"`,
    '---',
    '',
    `# ${sum.topic}`,
    '',
    '## Overview',
    sum.overview,
    ''
  ]

  if (sum.keyIdeas.length) {
    lines.push('## Key Ideas', ...sum.keyIdeas.map(i => `- ${i}`), '')
  }
  if (sum.questions.length) {
    lines.push('## Questions to Explore', ...sum.questions.map(q => `- ${q}`), '')
  }
  if (sum.connections.length) {
    lines.push('## Connections', ...sum.connections.map(c => `- ${c}`), '')
  }
  if (sum.actionItems.length) {
    lines.push('## Action Items', ...sum.actionItems.map(a => `- [ ] ${a}`), '')
  }
  if (sum.rawGems.length) {
    lines.push('## Raw Gems', ...sum.rawGems.map(g => `> ${g}`), '')
  }

  // Raw transcript in a collapsible callout
  const finalSegs = segments.filter(s => s.isFinal && s.text.trim())
  if (finalSegs.length) {
    lines.push('## Raw Transcript', '')
    lines.push('> [!note]- Full Transcript')
    for (const seg of finalSegs) {
      const time = new Date(seg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      lines.push(`> *(${time})* ${seg.text}`)
    }
    lines.push('')
  }

  return lines.filter(l => l !== undefined).join('\n')
}

interface Props {
  segments: TranscriptSegment[]
  topic: string
  category: VoiceNoteCategory
  audioFile?: string | null
  onBack: () => void
  onNew: () => void
}

export default function VoiceNoteSummary({ segments, topic, category, audioFile, onBack, onNew }: Props): React.ReactElement {
  const [summary, setSummary] = useState<VNSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savedToVault, setSavedToVault] = useState(false)
  const [savingToVault, setSavingToVault] = useState(false)
  const [savedNotePath, setSavedNotePath] = useState('')
  const [vaultError, setVaultError] = useState('')

  useEffect(() => {
    if (!segments.length) { setLoading(false); setError('No segments.'); return }
    ;(async () => {
      try {
        const key = await window.darkscribe.keychain.get('openai-api-key')
        if (!key) { setError('API key not found'); setLoading(false); return }

        const config = await window.darkscribe.config.read()
        const prefix = (config.vault_subfolder as string) || ''
        const vp = (p: string) => prefix ? `${prefix}/${p}` : p

        let skillContent: string | undefined
        try {
          const skillResult = await window.darkscribe.vault.readNote(vp('System/Notetaker Skill.md'))
          if (skillResult.content) skillContent = skillResult.content
        } catch {}

        const sum = await generateVoiceNoteSummary(segments, key, topic, skillContent)
        setSummary(sum)
      } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
    })()
  }, [segments, topic])

  const openInObsidian = async (filePath: string) => {
    const config = await window.darkscribe.config.read()
    const vaultName = encodeURIComponent((config.obsidian_vault_name as string) || 'MyVault')
    const encodedPath = encodeURIComponent(filePath)
    await window.darkscribe.shell.openUrl(`obsidian://open?vault=${vaultName}&file=${encodedPath}`)
  }

  const saveToVault = async () => {
    if (!summary || savingToVault) return
    setSavingToVault(true)
    setVaultError('')
    try {
      const config = await window.darkscribe.config.read()
      const prefix = (config.vault_subfolder as string) || ''
      const vp = (p: string) => prefix ? `${prefix}/${p}` : p

      const date = new Date(summary.dateTime)
      const dateStr = date.toISOString().split('T')[0]
      const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-').substring(0, 5)
      const safeTopic = topic ? sanitizeName(topic) : ''
      const baseName = safeTopic ? `${dateStr}_${timeStr}_${safeTopic}` : `${dateStr}_${timeStr}`

      const notePath = vp(`Notes/${category}/${baseName}.md`)
      const md = buildVoiceNoteMarkdown(summary, segments, category)

      const saveResult = await window.darkscribe.vault.saveNote(notePath, md)
      if (saveResult?.ok === false) throw new Error(saveResult.error ?? 'Save failed')

      setSavedToVault(true)
      setSavedNotePath(notePath)
    } catch (e) {
      setVaultError((e as Error).message)
    }
    setSavingToVault(false)
  }

  if (loading) {
    return (
      <div className="page-enter" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--purple)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)' }}>Organizing your thoughts...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-enter" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div style={{ color: 'var(--negative)', fontSize: 'var(--text-sm)' }}>Error: {error}</div>
        <button onClick={onBack} style={{ padding: '8px 20px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Back</button>
      </div>
    )
  }

  return (
    <div className="page-enter" style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-6)' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-6)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)', color: 'var(--ink-1)' }}>{topic || 'Voice Note'}</h2>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginTop: 4 }}>
              <span style={{ padding: '2px 8px', background: 'var(--purple-subtle)', color: 'var(--purple)', borderRadius: 'var(--radius-full)', fontSize: 10, fontWeight: 600 }}>{category}</span>
              <span style={{ marginLeft: 8 }}>{summary?.durationMinutes}min</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button onClick={saveToVault} disabled={savingToVault || savedToVault} style={{
              padding: '8px 16px',
              background: savedToVault ? 'var(--positive-subtle)' : 'var(--purple-subtle)',
              color: savedToVault ? 'var(--positive)' : 'var(--purple)',
              border: `1px solid ${savedToVault ? 'var(--positive)' : 'var(--purple)'}`,
              borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 600,
              cursor: savedToVault ? 'default' : 'pointer', opacity: savingToVault ? 0.6 : 1
            }}>
              {savedToVault ? 'Saved' : savingToVault ? 'Saving...' : 'Save to Vault'}
            </button>
            {savedToVault && savedNotePath && (
              <button onClick={() => openInObsidian(savedNotePath)} style={{
                padding: '8px 16px', background: 'none', color: 'var(--purple)',
                border: '1px solid var(--purple)', borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)', cursor: 'pointer', fontWeight: 600
              }}>Open in Obsidian</button>
            )}
            <button onClick={onBack} style={{ padding: '8px 16px', background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>Done</button>
            <button onClick={onNew} style={{ padding: '8px 16px', background: 'var(--purple)', color: 'var(--accent-ink)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>New Note</button>
          </div>
        </div>

        {savedToVault && savedNotePath && (
          <div style={{ padding: 'var(--sp-2) var(--sp-3)', background: 'var(--positive-subtle)', border: '1px solid var(--positive)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--positive)', marginBottom: 'var(--sp-4)' }}>
            Saved to vault <span style={{ color: 'var(--ink-4)', marginLeft: 8 }}>{savedNotePath}</span>
          </div>
        )}

        {vaultError && (
          <div style={{ padding: 'var(--sp-2) var(--sp-3)', background: 'var(--negative-subtle)', border: '1px solid var(--negative)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--negative)', marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Save failed: {vaultError}</span>
            <button onClick={saveToVault} style={{ padding: '2px 10px', background: 'var(--negative)', color: 'var(--accent-ink)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {/* Overview */}
        {summary?.overview && (
          <div style={{ padding: 'var(--sp-4)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-4)' }}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink-2)', marginBottom: 'var(--sp-2)' }}>Overview</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-1)', lineHeight: 1.6, fontStyle: 'italic' }}>{summary.overview}</p>
          </div>
        )}

        {/* Key Ideas */}
        {summary?.keyIdeas.length ? (
          <div style={{ padding: 'var(--sp-4)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-4)' }}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink-2)', marginBottom: 'var(--sp-2)' }}>Key Ideas</h3>
            {summary.keyIdeas.map((idea, i) => (
              <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-1)', marginBottom: 'var(--sp-1)' }}>- {idea}</div>
            ))}
          </div>
        ) : null}

        {/* Questions */}
        {summary?.questions.length ? (
          <div style={{ padding: 'var(--sp-4)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-4)' }}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink-2)', marginBottom: 'var(--sp-2)' }}>Questions to Explore</h3>
            {summary.questions.map((q, i) => (
              <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-1)', marginBottom: 'var(--sp-1)' }}>? {q}</div>
            ))}
          </div>
        ) : null}

        {/* Connections */}
        {summary?.connections.length ? (
          <div style={{ padding: 'var(--sp-4)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-4)' }}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink-2)', marginBottom: 'var(--sp-2)' }}>Connections</h3>
            {summary.connections.map((c, i) => (
              <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-1)', marginBottom: 'var(--sp-1)' }}>- {c}</div>
            ))}
          </div>
        ) : null}

        {/* Action Items */}
        {summary?.actionItems.length ? (
          <div style={{ padding: 'var(--sp-4)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-4)' }}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink-2)', marginBottom: 'var(--sp-2)' }}>Action Items</h3>
            {summary.actionItems.map((a, i) => (
              <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-1)', marginBottom: 'var(--sp-1)' }}>- [ ] {a}</div>
            ))}
          </div>
        ) : null}

        {/* Raw Gems */}
        {summary?.rawGems.length ? (
          <div style={{ padding: 'var(--sp-4)', background: 'var(--purple-subtle)', border: '1px solid var(--purple)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-4)' }}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--purple)', marginBottom: 'var(--sp-2)' }}>Raw Gems</h3>
            {summary.rawGems.map((g, i) => (
              <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-1)', marginBottom: 'var(--sp-2)', fontStyle: 'italic', paddingLeft: 'var(--sp-3)', borderLeft: '2px solid var(--purple)' }}>"{g}"</div>
            ))}
          </div>
        ) : null}

        {/* Transcript */}
        <details style={{ marginTop: 'var(--sp-4)' }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink-2)', padding: 'var(--sp-2) 0' }}>
            View Transcript ({segments.filter(s => s.isFinal).length} segments)
          </summary>
          <div style={{ padding: 'var(--sp-4)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', marginTop: 'var(--sp-2)', maxHeight: 400, overflow: 'auto' }}>
            {segments.filter(s => s.isFinal && s.text.trim()).map(seg => {
              const time = new Date(seg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              return (
                <div key={seg.id} style={{ marginBottom: 'var(--sp-2)', fontSize: 'var(--text-sm)' }}>
                  <span style={{ color: 'var(--ink-4)', fontSize: 'var(--text-xs)', marginRight: 8 }}>{time}</span>
                  <span style={{ color: 'var(--ink-1)' }}>{seg.text}</span>
                </div>
              )
            })}
          </div>
        </details>
      </div>
    </div>
  )
}
