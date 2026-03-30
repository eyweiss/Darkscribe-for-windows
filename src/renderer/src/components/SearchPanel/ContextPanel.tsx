import React, { useState, useEffect } from 'react'
import type { ContextCard } from '../../services/context-surfacer'

interface Props {
  cards: ContextCard[]
  loading: boolean
  enabled: boolean
  onToggle: (enabled: boolean) => void
  debugStatus?: string
}

export default function ContextPanel({ cards, loading, enabled, onToggle, debugStatus }: Props): React.ReactElement {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (cards.length === 0) setDismissed(new Set())
  }, [cards.length === 0])

  const dismiss = (id: string) => setDismissed(prev => new Set(prev).add(id))

  const openInObsidian = async (notePath: string) => {
    try {
      const config = await window.darkscribe.config.read()
      const vaultName = (config.obsidian_vault_name as string) || 'MyVault'
      window.darkscribe.shell.openUrl(`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(notePath.replace(/\.md$/, ''))}`)
    } catch {}
  }

  const visibleCards = cards.filter(c => !dismissed.has(c.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--sp-4)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={{
            fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-3)',
            textTransform: 'uppercase', letterSpacing: '0.08em'
          }}>
            Context
          </span>
          {loading && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--accent)', animation: 'breathe 2s infinite'
            }} />
          )}
          {visibleCards.length > 0 && !loading && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: 'var(--accent-ink)',
              background: 'var(--accent)', padding: '1px 6px',
              borderRadius: 'var(--radius-full)'
            }}>
              {visibleCards.length}
            </span>
          )}
        </div>
        <button
          onClick={() => onToggle(!enabled)}
          style={{
            padding: '3px 10px', background: enabled ? 'var(--positive-subtle)' : 'var(--surface-3)',
            border: `1px solid ${enabled ? 'rgba(92,181,131,0.2)' : 'var(--border-1)'}`,
            borderRadius: 'var(--radius-full)', fontSize: 9, fontWeight: 700,
            color: enabled ? 'var(--positive)' : 'var(--ink-4)',
            cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase'
          }}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!enabled && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', textAlign: 'center', padding: 'var(--sp-6)', fontWeight: 500 }}>
            Context surfacing is paused
          </div>
        )}

        {enabled && visibleCards.length === 0 && !loading && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', textAlign: 'center', padding: 'var(--sp-6)', fontWeight: 500, lineHeight: 1.6 }}>
            Relevant notes will appear here during the call
          </div>
        )}

        {visibleCards.map((card) => (
          <div
            key={card.id}
            className="context-card"
            style={{
              padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-2)',
              background: 'var(--surface-3)',
              border: '1px solid var(--border-1)',
              borderLeft: '3px solid var(--purple)',
              borderRadius: 'var(--radius-md)',
              position: 'relative'
            }}
          >
            <button
              onClick={() => dismiss(card.id)}
              style={{
                position: 'absolute', top: 6, right: 8,
                background: 'var(--surface-4)', border: 'none',
                color: 'var(--ink-4)', fontSize: 10, cursor: 'pointer',
                width: 18, height: 18, borderRadius: 'var(--radius-full)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1
              }}
              title="Dismiss"
            >
              x
            </button>

            <div style={{
              fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-1)',
              marginBottom: 4, paddingRight: 20
            }}>
              {card.title}
            </div>
            {card.excerpt && (
              <div style={{
                fontSize: 'var(--text-xs)', color: 'var(--ink-3)',
                lineHeight: 1.6, marginBottom: 6
              }}>
                {card.excerpt.substring(0, 150)}{card.excerpt.length > 150 ? '...' : ''}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, color: 'var(--purple)', fontWeight: 600, letterSpacing: '0.02em' }}>
                {card.relevanceHint}
              </span>
              <button
                onClick={() => openInObsidian(card.notePath)}
                style={{
                  padding: '2px 8px', background: 'var(--surface-4)',
                  border: '1px solid var(--border-1)', borderRadius: 'var(--radius-full)',
                  fontSize: 9, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600
                }}
              >
                Open in Obsidian
              </button>
            </div>
          </div>
        ))}
      </div>

      {debugStatus && (
        <div style={{
          fontSize: 9, color: 'var(--ink-4)', textAlign: 'center',
          padding: '6px', borderTop: '1px solid var(--border-subtle)',
          flexShrink: 0, fontFamily: 'var(--font-mono)'
        }}>
          {debugStatus}
        </div>
      )}
    </div>
  )
}
