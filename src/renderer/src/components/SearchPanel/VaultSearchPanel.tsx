import React, { useState } from 'react'

export interface WebSearchResult {
  query: string
  title: string
  snippet: string
  url: string
  source: string
}

interface SearchResult {
  path: string
  snippet: string
  source: 'vault' | 'web'
  url?: string
  title?: string
}

interface Props {
  onAddToSummary?: (result: WebSearchResult) => void
}

export default function VaultSearchPanel({ onAddToSummary }: Props): React.ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchedVault, setSearchedVault] = useState(false)
  const [answer, setAnswer] = useState('')
  const [webSource, setWebSource] = useState<string>('')

  const [searchError, setSearchError] = useState('')
  const [addedIndices, setAddedIndices] = useState<Set<number>>(new Set())

  const searchVault = async () => {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    setAnswer('')
    setSearchedVault(true)
    setWebSource('')
    setSearchError('')
    setAddedIndices(new Set())

    const timeout = setTimeout(() => {
      setSearching(false)
      setSearchError('Search timed out. Try again.')
    }, 5000)

    try {
      const status = await window.darkscribe.vault.status()
      if (!status.connected) {
        clearTimeout(timeout)
        setSearchError('Vault not connected. Is Obsidian running?')
        setSearching(false)
        return
      }

      const res = await window.darkscribe.vault.search(query)
      clearTimeout(timeout)
      if (res.error) {
        setSearchError(res.error)
      } else {
        const vaultResults: SearchResult[] = (res.results ?? []).map(r => ({
          path: r.path,
          snippet: r.snippet,
          source: 'vault' as const
        }))
        setResults(vaultResults)
      }
    } catch (e) {
      clearTimeout(timeout)
      setSearchError((e as Error).message)
    }
    setSearching(false)
  }

  const searchWeb = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await window.darkscribe.web.search(query)
      if (res.answer) setAnswer(res.answer)
      setWebSource((res as any).source ?? 'web')
      const webResults: SearchResult[] = (res.results ?? []).map(r => ({
        path: '',
        snippet: r.content,
        source: 'web' as const,
        url: r.url || undefined,
        title: r.title
      }))
      setResults(prev => [...prev, ...webResults])
    } catch {}
    setSearching(false)
  }

  const addToSummary = (result: SearchResult, idx: number) => {
    if (!onAddToSummary) return
    onAddToSummary({
      query: query.trim(),
      title: result.title ?? query.trim(),
      snippet: result.snippet,
      url: result.url ?? '',
      source: webSource || 'web'
    })
    setAddedIndices(prev => new Set(prev).add(idx))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--sp-4)' }}>
      <div style={{
        fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-3)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--sp-3)'
      }}>
        Search
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') searchVault() }}
          placeholder="Search vault or web..."
          style={{
            flex: 1, padding: '8px 12px', border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
            background: 'var(--surface-3)', color: 'var(--ink-1)',
            boxShadow: 'var(--shadow-inset)'
          }}
        />
        <button onClick={searchVault} disabled={searching} style={{
          padding: '8px 12px', background: 'var(--accent)', color: 'var(--accent-ink)',
          border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
          fontWeight: 700, cursor: 'pointer', opacity: searching ? 0.6 : 1
        }}>
          Vault
        </button>
        <button onClick={searchWeb} disabled={searching || !query.trim()} style={{
          padding: '8px 12px', background: 'var(--surface-3)', color: 'var(--ink-2)',
          border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
          fontWeight: 600, cursor: 'pointer', opacity: (searching || !query.trim()) ? 0.5 : 1
        }}>
          Web
        </button>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {searching && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', padding: 'var(--sp-2)' }}>Searching...</div>}

        {searchError && (
          <div style={{ padding: 'var(--sp-2)', background: 'var(--negative-subtle)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--negative)', marginBottom: 'var(--sp-2)' }}>
            {searchError}
          </div>
        )}

        {answer && (
          <div style={{ padding: 'var(--sp-3)', background: 'var(--primary-subtle)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--sp-2)', fontSize: 'var(--text-xs)', color: 'var(--ink-1)', lineHeight: 1.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Answer</span>
              {webSource && <span style={{ fontSize: 9, color: 'var(--ink-4)' }}>via {webSource}</span>}
            </div>
            {answer}
          </div>
        )}

        {results.map((r, i) => (
          <div key={i} style={{
            padding: 'var(--sp-2) var(--sp-3)', marginBottom: 'var(--sp-2)',
            background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: r.source === 'vault' ? 'var(--purple)' : 'var(--amber)', textTransform: 'uppercase' }}>
                {r.source === 'vault' ? 'Vault' : 'Web'}
              </span>
              {r.source === 'web' && (
                <button
                  onClick={() => addToSummary(r, i)}
                  disabled={addedIndices.has(i)}
                  style={{
                    padding: '2px 8px', background: addedIndices.has(i) ? 'var(--positive-subtle)' : 'var(--surface-2)',
                    border: `1px solid ${addedIndices.has(i) ? 'var(--positive)' : 'var(--border-1)'}`,
                    borderRadius: 'var(--radius-xs)', fontSize: 9,
                    color: addedIndices.has(i) ? 'var(--positive)' : 'var(--ink-3)', cursor: 'pointer'
                  }}
                >
                  {addedIndices.has(i) ? 'Added!' : 'Add to Summary'}
                </button>
              )}
            </div>
            {r.title && <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-1)', marginBottom: 2 }}>{r.title}</div>}
            {r.path && <div style={{ fontSize: 10, color: 'var(--ink-4)', marginBottom: 2 }}>{r.path}</div>}
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {r.snippet.substring(0, 200)}{r.snippet.length > 200 ? '...' : ''}
            </div>
            {r.url && (
              <button
                onClick={() => window.darkscribe.shell.openUrl(r.url!)}
                style={{ marginTop: 4, padding: 0, background: 'none', border: 'none', color: 'var(--primary)', fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Open source
              </button>
            )}
          </div>
        ))}

        {!searching && searchedVault && results.filter(r => r.source === 'vault').length === 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', padding: 'var(--sp-2)', textAlign: 'center' }}>
            No vault results.
          </div>
        )}
      </div>

    </div>
  )
}
