import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useRealtimeTranscription } from '../hooks/useRealtimeTranscription'
import { useContextSurfacing } from '../hooks/useContextSurfacing'
import Transcript from './SessionView/Transcript'
import VaultSearchPanel from './SearchPanel/VaultSearchPanel'
import type { WebSearchResult } from './SearchPanel/VaultSearchPanel'
import ContextPanel from './SearchPanel/ContextPanel'
import type { TranscriptSegment } from '../services/openai-realtime'

interface Props {
  sessionId: string
  sessionName?: string
  onEndCall: (segments: TranscriptSegment[], audioFile: string | null, webSearches: WebSearchResult[]) => void
  onBack: () => void
}

export default function MainApp({ sessionId, sessionName, onEndCall, onBack }: Props): React.ReactElement {
  const {
    status, statusDetail, segments, isCapturing,
    sysChunkCount, micChunkCount, audioError, callDuration,
    startSession, stopSession
  } = useRealtimeTranscription()

  const { cards: contextCards, loading: contextLoading, enabled: contextEnabled, setEnabled: setContextEnabled, debugStatus: contextDebug } = useContextSurfacing(segments, isCapturing)
  const [rightTab, setRightTab] = useState<'context' | 'search'>('context')

  const [contactName, setContactName] = useState(sessionName ?? '')
  const [editingContact, setEditingContact] = useState(false)
  const [contactDraft, setContactDraft] = useState('')
  const [collectedSearches, setCollectedSearches] = useState<WebSearchResult[]>([])
  const isActive = isCapturing || status === 'connecting' || status === 'connected'

  const handleAddToSummary = useCallback((result: WebSearchResult) => {
    setCollectedSearches(prev => [...prev, result])
  }, [])

  // Auto-save transcript to disk every 10 seconds during recording
  const savingRef = useRef(false)
  useEffect(() => {
    if (!isCapturing || !sessionId) return
    window.darkscribe.session.saveMetadata(sessionId, { status: 'recording', participants: sessionName })
    const interval = setInterval(async () => {
      if (savingRef.current || segments.length === 0) return
      savingRef.current = true
      try { await window.darkscribe.session.saveTranscript(sessionId, segments) } catch {}
      savingRef.current = false
    }, 10000)
    return () => {
      clearInterval(interval)
      if (segments.length > 0) window.darkscribe.session.saveTranscript(sessionId, segments).catch(() => {})
    }
  }, [isCapturing, sessionId, segments.length > 0])

  const handleStop = async () => {
    const recording = await stopSession()
    await window.darkscribe.session.saveTranscript(sessionId, segments).catch(() => {})
    if (collectedSearches.length > 0) await window.darkscribe.session.saveWebSearches(sessionId, collectedSearches).catch(() => {})
    onEndCall(segments, recording?.filePath ?? null, collectedSearches)
  }

  const saveContact = async (name: string) => {
    const trimmed = name.trim()
    setContactName(trimmed)
    setEditingContact(false)
    await window.darkscribe.session.update(sessionId, { name: trimmed || undefined })
  }

  const statusColor = status === 'connected' ? 'var(--live-dot)' : status === 'error' ? 'var(--negative)' : 'var(--warning)'
  const statusLabel = status === 'idle' ? 'Ready' : status === 'connecting' ? 'Connecting' : status === 'connected' ? 'Live' : status === 'error' ? 'Error' : 'Offline'

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--surface-1)' }}>
      {/* ─── Controls Bar ─── */}
      <div className="glass-panel" style={{
        padding: '10px var(--sp-5)',
        borderBottom: '1px solid var(--border-1)',
        display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none',
          color: 'var(--ink-3)', fontSize: 'var(--text-sm)',
          cursor: 'pointer', fontWeight: 500
        }}>
          Back
        </button>

        <div style={{ width: 1, height: 22, background: 'var(--border-1)' }} />

        {/* Record / Stop button */}
        <button
          onClick={isActive ? handleStop : () => startSession(sessionId)}
          className={isActive ? 'recording-active' : ''}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 22px',
            background: isActive ? 'var(--recording-pulse)' : 'var(--accent)',
            color: isActive ? 'white' : 'var(--accent-ink)',
            border: 'none', borderRadius: 'var(--radius-full)',
            fontSize: 'var(--text-xs)', fontWeight: 700,
            cursor: 'pointer',
            boxShadow: isActive ? 'var(--shadow-glow-red)' : 'var(--shadow-glow-amber)',
            letterSpacing: '0.04em', textTransform: 'uppercase'
          }}
        >
          <span style={{
            width: 8, height: 8,
            borderRadius: isActive ? 2 : '50%',
            background: 'currentColor'
          }} />
          {isActive ? 'Stop' : 'Start'}
        </button>

        {/* Status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={status === 'connected' ? 'recording-dot' : ''} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: statusColor,
            boxShadow: status === 'connected' ? `0 0 8px ${statusColor}` : 'none'
          }} />
          <span style={{
            fontSize: 'var(--text-xs)', fontWeight: 700, color: statusColor,
            textTransform: 'uppercase', letterSpacing: '0.06em'
          }}>
            {statusLabel}
          </span>
        </div>

        {statusDetail && status !== 'connected' && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>{statusDetail}</span>
        )}

        {/* Contact name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {editingContact ? (
            <input
              autoFocus
              value={contactDraft}
              onChange={e => setContactDraft(e.target.value)}
              onBlur={() => saveContact(contactDraft)}
              onKeyDown={e => { if (e.key === 'Enter') saveContact(contactDraft); if (e.key === 'Escape') setEditingContact(false) }}
              placeholder="Contact name..."
              style={{
                padding: '4px 10px', background: 'var(--surface-3)',
                border: '1px solid var(--accent)', borderRadius: 'var(--radius-full)',
                color: 'var(--ink-1)', fontSize: 'var(--text-xs)', outline: 'none', width: 160
              }}
            />
          ) : contactName ? (
            <button onClick={() => { setContactDraft(contactName); setEditingContact(true) }} style={{
              padding: '4px 12px', background: 'var(--surface-3)',
              border: '1px solid var(--border-1)', borderRadius: 'var(--radius-full)',
              color: 'var(--ink-2)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer'
            }}>
              {contactName}
            </button>
          ) : (
            <button onClick={() => { setContactDraft(''); setEditingContact(true) }} style={{
              padding: '4px 12px', background: 'transparent',
              border: '1px dashed var(--border-2)', borderRadius: 'var(--radius-full)',
              color: 'var(--ink-4)', fontSize: 'var(--text-xs)', cursor: 'pointer'
            }}>
              + Contact
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Metrics */}
        {isActive && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
              fontWeight: 600, color: 'var(--accent)',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {formatDuration(callDuration)}
            </span>
            <span style={{
              padding: '3px 10px', background: 'var(--surface-3)',
              borderRadius: 'var(--radius-full)',
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'var(--ink-3)'
            }}>
              SYS {sysChunkCount || '0'}
            </span>
            <span style={{
              padding: '3px 10px', background: 'var(--surface-3)',
              borderRadius: 'var(--radius-full)',
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'var(--ink-3)'
            }}>
              MIC {micChunkCount || '0'}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
              {segments.length} seg
            </span>
          </div>
        )}
      </div>

      {/* Audio error banner */}
      {audioError && (
        <div style={{
          padding: '6px var(--sp-5)',
          background: 'var(--negative-subtle)',
          borderBottom: '1px solid rgba(217, 83, 79, 0.2)',
          fontSize: 'var(--text-xs)', color: 'var(--negative)', flexShrink: 0
        }}>
          {audioError}
        </div>
      )}

      {/* ─── 2-Panel Layout: Transcript + Sidebar ─── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Transcript panel */}
        <div style={{ flex: 3, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Transcript segments={segments} isCapturing={isCapturing} />
        </div>

        {/* Right sidebar */}
        <div style={{
          flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderLeft: '1px solid var(--border-1)',
          background: 'var(--surface-2)'
        }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
            {(['context', 'search'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                style={{
                  flex: 1, padding: '10px 0', background: 'none', border: 'none',
                  borderBottom: rightTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  fontSize: 'var(--text-xs)', fontWeight: rightTab === tab ? 700 : 500,
                  color: rightTab === tab ? 'var(--accent)' : 'var(--ink-3)',
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em'
                }}
              >
                {tab === 'context' ? 'Context' : 'Search'}
                {tab === 'context' && contextCards.length > 0 && (
                  <span style={{
                    marginLeft: 6, fontSize: 9, fontWeight: 700,
                    color: 'var(--accent-ink)', background: 'var(--accent)',
                    padding: '1px 5px', borderRadius: 'var(--radius-full)'
                  }}>
                    {contextCards.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {rightTab === 'context' ? (
            <ContextPanel cards={contextCards} loading={contextLoading} enabled={contextEnabled} onToggle={setContextEnabled} debugStatus={contextDebug} />
          ) : (
            <VaultSearchPanel onAddToSummary={handleAddToSummary} />
          )}
        </div>
      </div>
    </div>
  )
}
