import React, { useEffect, useState } from 'react'

interface CallRecord {
  date: string
  durationMinutes?: number
  tags?: string[]
  status?: string
  vaultNotePath?: string
}

interface Session {
  id: string
  name?: string
  calls: CallRecord[]
  createdAt: string
  updatedAt: string
}

interface SessionMeta {
  status?: string
}

interface Props {
  onNewCall: () => void
  onNewVoiceNote?: () => void
  onSelectSession: (session: Session) => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (diff === 1) return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getSessionStatus(session: Session, meta: SessionMeta | null): { label: string; color: string } {
  const lastCall = session.calls[session.calls.length - 1]
  const status = lastCall?.status || meta?.status
  if (status === 'complete' || lastCall?.vaultNotePath) return { label: 'Saved', color: 'var(--positive)' }
  if (status === 'summarized') return { label: 'Summarized', color: 'var(--accent)' }
  if (status === 'interrupted') return { label: 'Interrupted', color: 'var(--negative)' }
  if (status === 'recording') return { label: 'In Progress', color: 'var(--warning)' }
  if (session.calls.length === 0) return { label: 'Empty', color: 'var(--ink-4)' }
  return { label: 'Draft', color: 'var(--ink-3)' }
}

export default function SessionList({ onNewCall, onNewVoiceNote, onSelectSession }: Props): React.ReactElement {
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionMetas, setSessionMetas] = useState<Record<string, SessionMeta | null>>({})
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    window.darkscribe.session.list().then(async (list) => {
      const sessions = list as Session[]
      setSessions(sessions)
      const metas: Record<string, SessionMeta | null> = {}
      for (const s of sessions) {
        try { metas[s.id] = await window.darkscribe.session.loadMetadata(s.id) as SessionMeta | null } catch { metas[s.id] = null }
      }
      setSessionMetas(metas)
    })
  }, [])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirmDelete !== id) { setConfirmDelete(id); return }
    await window.darkscribe.session.delete(id)
    setSessions(prev => prev.filter(s => s.id !== id))
    setConfirmDelete(null)
  }

  const openInObsidian = async (e: React.MouseEvent, vaultPath: string) => {
    e.stopPropagation()
    try {
      const config = await window.darkscribe.config.read()
      const vaultName = encodeURIComponent((config.obsidian_vault_name as string) || 'MyVault')
      const filePath = encodeURIComponent(vaultPath.replace(/\.md$/, ''))
      window.darkscribe.shell.openUrl(`obsidian://open?vault=${vaultName}&file=${filePath}`)
    } catch {}
  }

  return (
    <div className="page-enter" style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-10) var(--sp-8)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 'var(--sp-10)' }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)',
              fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.04em',
              lineHeight: 1, marginBottom: 'var(--sp-2)'
            }}>
              Sessions
            </h1>
            <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>
              {sessions.length} recording{sessions.length !== 1 ? 's' : ''} captured
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            {onNewVoiceNote && (
              <button
                onClick={onNewVoiceNote}
                style={{
                  padding: '10px 20px',
                  background: 'var(--surface-3)',
                  color: 'var(--purple)',
                  border: '1px solid var(--border-2)',
                  borderRadius: 'var(--radius-lg)',
                  fontWeight: 600, fontSize: 'var(--text-sm)',
                  cursor: 'pointer'
                }}
              >
                Voice Note
              </button>
            )}
            <button
              onClick={onNewCall}
              style={{
                padding: '10px 24px',
                background: 'var(--accent)',
                color: 'var(--accent-ink)',
                border: 'none',
                borderRadius: 'var(--radius-lg)',
                fontWeight: 700, fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-glow-amber)'
              }}
            >
              New Call
            </button>
          </div>
        </div>

        {/* Session List */}
        {sessions.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 'var(--sp-16) var(--sp-8)',
            background: 'var(--surface-2)', borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 'var(--sp-4)', opacity: 0.4 }}>~</div>
            <div style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-2)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
              Nothing captured yet
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', maxWidth: 280, margin: '0 auto' }}>
              Start a new call or voice note to begin building your archive.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {sessions.map(session => {
              const lastCall = session.calls[session.calls.length - 1]
              const meta = sessionMetas[session.id]
              const { label: statusLabel, color: statusColor } = getSessionStatus(session, meta)
              const isHovered = hoveredId === session.id
              const hasVaultPath = !!lastCall?.vaultNotePath

              return (
                <div
                  key={session.id}
                  className="card-interactive"
                  onClick={() => onSelectSession(session)}
                  onMouseEnter={() => setHoveredId(session.id)}
                  onMouseLeave={() => { setHoveredId(null); if (confirmDelete === session.id) setConfirmDelete(null) }}
                  style={{
                    padding: 'var(--sp-4) var(--sp-5)',
                    background: isHovered ? 'var(--surface-3)' : 'var(--surface-2)',
                    border: `1px solid ${isHovered ? 'var(--border-2)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-lg)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      {/* Status dot */}
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0, boxShadow: `0 0 6px ${statusColor}` }} />
                      {/* Title */}
                      <span style={{
                        fontWeight: 600, color: 'var(--ink-1)', fontSize: 'var(--text-sm)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {session.name || formatDate(session.updatedAt)}
                      </span>
                      {/* Status label */}
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: statusColor,
                        letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0
                      }}>
                        {statusLabel}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 17 }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                        {formatDate(session.updatedAt)}
                      </span>
                      {lastCall?.durationMinutes ? (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
                          {lastCall.durationMinutes}m
                        </span>
                      ) : null}
                      {lastCall?.tags?.map((tag, i) => (
                        <span key={i} style={{
                          fontSize: 9, fontWeight: 600, color: 'var(--accent)',
                          background: 'var(--accent-subtle)',
                          padding: '1px 8px', borderRadius: 'var(--radius-full)',
                          letterSpacing: '0.02em'
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexShrink: 0 }}>
                    {hasVaultPath && (
                      <button
                        onClick={(e) => openInObsidian(e, lastCall.vaultNotePath!)}
                        title="Open in Obsidian"
                        style={{
                          background: 'var(--surface-4)', border: '1px solid var(--border-1)',
                          borderRadius: 'var(--radius-full)', padding: '3px 10px',
                          cursor: 'pointer', fontSize: 9, fontWeight: 600,
                          color: 'var(--purple)', letterSpacing: '0.02em'
                        }}
                      >
                        Obsidian
                      </button>
                    )}
                    {isHovered && (
                      <button
                        onClick={(e) => handleDelete(e, session.id)}
                        style={{
                          background: confirmDelete === session.id ? 'var(--negative)' : 'var(--negative-subtle)',
                          border: `1px solid ${confirmDelete === session.id ? 'var(--negative)' : 'rgba(217, 83, 79, 0.2)'}`,
                          borderRadius: 'var(--radius-full)',
                          color: confirmDelete === session.id ? 'white' : 'var(--negative)',
                          fontSize: 'var(--text-xs)', fontWeight: 600,
                          padding: '3px 10px', cursor: 'pointer'
                        }}
                      >
                        {confirmDelete === session.id ? 'Confirm' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
