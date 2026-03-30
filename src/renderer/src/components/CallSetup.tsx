import React, { useState } from 'react'
import ReferencePanel, { NoteReference } from './ReferencePanel'

interface Props {
  onStart: (recordingName: string, participants: string, references: NoteReference[]) => void
  onCancel: () => void
}

export default function CallSetup({ onStart, onCancel }: Props): React.ReactElement {
  const [recordingName, setRecordingName] = useState('')
  const [participants, setParticipants] = useState('')
  const [references, setReferences] = useState<NoteReference[]>([])

  const handleStart = () => {
    onStart(recordingName.trim(), participants.trim(), references)
  }

  return (
    <div className="page-enter" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-8)' }}>
      <div style={{
        width: 500, background: 'var(--surface-2)', border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-xl)', padding: 'var(--sp-8) var(--sp-10)',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
          fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.03em',
          marginBottom: 'var(--sp-2)'
        }}>New Call</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-8)', fontWeight: 500 }}>
          Name your recording and add participants. Both are optional.
        </p>

        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Recording Name</label>
          <input
            value={recordingName}
            onChange={e => setRecordingName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleStart() }}
            placeholder="e.g., Weekly sync with Sarah"
            autoFocus
            style={{
              width: '100%', padding: '12px 16px', border: '1px solid var(--border-1)',
              borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)',
              background: 'var(--surface-3)', color: 'var(--ink-1)',
              boxShadow: 'var(--shadow-inset)'
            }}
          />
        </div>

        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Participants</label>
          <input
            value={participants}
            onChange={e => setParticipants(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleStart() }}
            placeholder="e.g., Sarah, John, Marketing team"
            style={{
              width: '100%', padding: '12px 16px', border: '1px solid var(--border-1)',
              borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)',
              background: 'var(--surface-3)', color: 'var(--ink-1)',
              boxShadow: 'var(--shadow-inset)'
            }}
          />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', marginTop: 4 }}>
            Used in filenames and summary metadata. Leave empty to use timestamp only.
          </div>
        </div>

        <div style={{ marginBottom: 'var(--sp-6)' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Reference Notes (optional)</label>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', marginBottom: 'var(--sp-2)' }}>
            Attach Obsidian notes for context. Their content will enrich the summary.
          </div>
          <ReferencePanel references={references} onReferencesChange={setReferences} compact />
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '10px 22px', background: 'var(--surface-3)', color: 'var(--ink-3)',
            border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)',
            fontSize: 'var(--text-sm)', cursor: 'pointer', fontWeight: 500
          }}>Cancel</button>
          <button onClick={handleStart} style={{
            padding: '10px 28px', background: 'var(--accent)', color: 'var(--accent-ink)',
            border: 'none', borderRadius: 'var(--radius-lg)', fontWeight: 700,
            fontSize: 'var(--text-sm)', cursor: 'pointer',
            boxShadow: 'var(--shadow-glow-amber)'
          }}>Start Call</button>
        </div>
      </div>
    </div>
  )
}
