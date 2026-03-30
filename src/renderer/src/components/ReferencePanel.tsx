import React, { useState } from 'react'

export interface NoteReference {
  path: string
  title: string
  snippet: string
  content?: string
  addedAt: string
}

interface Props {
  references: NoteReference[]
  onReferencesChange: (refs: NoteReference[]) => void
  maxReferences?: number
  compact?: boolean
}

export default function ReferencePanel({ references, onReferencesChange, maxReferences = 10, compact = false }: Props): React.ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ path: string; snippet: string }>>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await window.darkscribe.vault.search(query.trim())
      const items = (res.results ?? []).filter(
        (r: any) => !references.some(ref => ref.path === r.path)
      )
      setResults(items)
    } catch {}
    setSearching(false)
  }

  const attach = async (result: { path: string; snippet: string }) => {
    if (references.length >= maxReferences) return
    // Load full note content for prompt injection
    let content = ''
    try {
      const note = await window.darkscribe.vault.readNote(result.path)
      content = note.content?.substring(0, 2000) ?? ''
    } catch {}

    const title = result.path.split('/').pop()?.replace('.md', '') ?? result.path
    const ref: NoteReference = {
      path: result.path,
      title,
      snippet: result.snippet,
      content,
      addedAt: new Date().toISOString()
    }
    onReferencesChange([...references, ref])
    setResults(prev => prev.filter(r => r.path !== result.path))
  }

  const remove = (path: string) => {
    onReferencesChange(references.filter(r => r.path !== path))
  }

  const openInObsidian = async (notePath: string) => {
    try {
      const config = await window.darkscribe.config.read()
      const vaultName = encodeURIComponent((config.obsidian_vault_name as string) || 'MyVault')
      const encodedPath = encodeURIComponent(notePath.replace(/\.md$/, ''))
      window.darkscribe.shell.openUrl(`obsidian://open?vault=${vaultName}&file=${encodedPath}`)
    } catch {}
  }

  return (
    <div style={{ padding: compact ? 0 : 'var(--sp-3)' }}>
      {/* Attached references */}
      {references.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)', marginBottom: 'var(--sp-2)' }}>
          {references.map(ref => (
            <div
              key={ref.path}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', background: 'var(--primary-subtle)',
                border: '1px solid var(--accent)', borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)', color: 'var(--accent)', maxWidth: '100%'
              }}
            >
              <button
                onClick={() => openInObsidian(ref.path)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'var(--text-xs)', cursor: 'pointer', fontWeight: 600, padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={`Open ${ref.title} in Obsidian`}
              >
                [[{ref.title}]]
              </button>
              <button
                onClick={() => remove(ref.path)}
                style={{ background: 'none', border: 'none', color: 'var(--ink-4)', fontSize: 11, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add reference button / search */}
      {references.length < maxReferences && !showSearch && (
        <button
          onClick={() => setShowSearch(true)}
          style={{
            padding: '4px 10px', background: 'none',
            border: '1px dashed var(--border-1)', borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)', color: 'var(--ink-4)', cursor: 'pointer',
            width: compact ? 'auto' : '100%'
          }}
        >
          + Add reference note
        </button>
      )}

      {showSearch && (
        <div style={{ marginTop: 'var(--sp-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-1)', marginBottom: 'var(--sp-2)' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') search(); if (e.key === 'Escape') { setShowSearch(false); setResults([]) } }}
              placeholder="Search vault..."
              style={{
                flex: 1, padding: '4px 8px', border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius-xs)', fontSize: 'var(--text-xs)',
                background: 'var(--surface-2)', color: 'var(--ink-1)'
              }}
            />
            <button onClick={search} disabled={searching} style={{
              padding: '4px 8px', background: 'var(--accent)', color: 'var(--accent-ink)',
              border: 'none', borderRadius: 'var(--radius-xs)', fontSize: 'var(--text-xs)',
              cursor: 'pointer', fontWeight: 600
            }}>
              {searching ? '...' : 'Search'}
            </button>
            <button onClick={() => { setShowSearch(false); setResults([]) }} style={{
              padding: '4px 6px', background: 'none', border: '1px solid var(--border-1)',
              borderRadius: 'var(--radius-xs)', fontSize: 'var(--text-xs)', color: 'var(--ink-4)', cursor: 'pointer'
            }}>
              Cancel
            </button>
          </div>

          {results.length > 0 && (
            <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}>
              {results.slice(0, 8).map((r, i) => {
                const title = r.path.split('/').pop()?.replace('.md', '') ?? r.path
                return (
                  <div
                    key={i}
                    style={{ padding: '6px 8px', borderBottom: i < results.length - 1 ? '1px solid var(--border-subtle)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                      <div style={{ fontSize: 9, color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path}</div>
                    </div>
                    <button
                      onClick={() => attach(r)}
                      style={{
                        padding: '2px 8px', background: 'var(--primary-subtle)', border: '1px solid var(--accent)',
                        borderRadius: 'var(--radius-xs)', fontSize: 9, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, flexShrink: 0, marginLeft: 8
                      }}
                    >
                      Attach
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {searching && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', padding: 'var(--sp-2)', textAlign: 'center' }}>Searching...</div>}
          {!searching && results.length === 0 && query && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', padding: 'var(--sp-2)', textAlign: 'center' }}>No results</div>}
        </div>
      )}

      {references.length >= maxReferences && (
        <div style={{ fontSize: 9, color: 'var(--ink-4)', marginTop: 'var(--sp-1)' }}>Maximum {maxReferences} references</div>
      )}
    </div>
  )
}
