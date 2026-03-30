import React, { useState } from 'react'

export type VoiceNoteCategory = 'Ideas' | 'Research' | 'Brainstorm' | 'Journal'

interface Props {
  onStart: (topic: string, category: VoiceNoteCategory) => void
  onCancel: () => void
}

const categories: { id: VoiceNoteCategory; desc: string }[] = [
  { id: 'Ideas', desc: 'Product ideas, feature thoughts, creative concepts' },
  { id: 'Research', desc: 'Investigation notes, findings, analysis' },
  { id: 'Brainstorm', desc: 'Freeform thinking, problem solving, exploration' },
  { id: 'Journal', desc: 'Daily reflections, observations, personal notes' }
]

export default function VoiceNoteSetup({ onStart, onCancel }: Props): React.ReactElement {
  const [topic, setTopic] = useState('')
  const [category, setCategory] = useState<VoiceNoteCategory>('Ideas')

  return (
    <div className="page-enter" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-8)' }}>
      <div style={{ width: 460, background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-8)', boxShadow: 'var(--shadow-md)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--ink-1)', marginBottom: 'var(--sp-2)' }}>Voice Note</h2>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', marginBottom: 'var(--sp-6)' }}>
          Think out loud. Darkscribe will capture and organize your thoughts.
        </p>

        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>What's on your mind?</label>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onStart(topic.trim(), category) }}
            placeholder="e.g., Product strategy ideas, Weekend project thoughts"
            autoFocus
            style={{
              width: '100%', padding: '10px 14px', border: '1px solid var(--border-1)',
              borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
              background: 'var(--surface-2)', color: 'var(--ink-1)'
            }}
          />
        </div>

        <div style={{ marginBottom: 'var(--sp-6)' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>Category</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                style={{
                  padding: 'var(--sp-3)', textAlign: 'left',
                  background: category === c.id ? 'var(--primary-subtle)' : 'var(--surface-2)',
                  border: `1px solid ${category === c.id ? 'var(--primary)' : 'var(--border-1)'}`,
                  borderRadius: 'var(--radius-md)', cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: category === c.id ? 'var(--primary)' : 'var(--ink-1)', marginBottom: 2 }}>{c.id}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-4)', lineHeight: 1.4 }}>{c.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '10px 20px', background: 'var(--surface-2)', color: 'var(--ink-2)',
            border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)', cursor: 'pointer'
          }}>Cancel</button>
          <button onClick={() => onStart(topic.trim(), category)} style={{
            padding: '10px 24px', background: 'var(--purple)', color: 'var(--accent-ink)',
            border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700,
            fontSize: 'var(--text-sm)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)'
          }}>Start Recording</button>
        </div>
      </div>
    </div>
  )
}
