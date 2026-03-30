import React, { useState } from 'react'

interface Props {
  activeTab: 'home' | 'call' | 'settings'
  isCapturing: boolean
  onNavigate: (tab: string) => void
}

export default function TopNav({ activeTab, isCapturing, onNavigate }: Props): React.ReactElement {
  const [settingsHovered, setSettingsHovered] = useState(false)

  return (
    <nav className="glass-panel" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 var(--sp-5)', height: 48,
      borderBottom: '1px solid var(--border-1)',
      flexShrink: 0,
      WebkitAppRegion: 'drag' as any
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 160, WebkitAppRegion: 'no-drag' as any }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 800,
          color: 'var(--accent)', letterSpacing: '-0.03em', textTransform: 'uppercase',
          fontSize: '0.75rem', letterSpacing: '0.08em'
        }}>
          Darkscribe
        </span>
      </div>

      {/* Center nav */}
      <div style={{ display: 'flex', gap: 'var(--sp-1)', WebkitAppRegion: 'no-drag' as any }}>
        <button
          onClick={() => onNavigate('home')}
          style={{
            padding: '6px var(--sp-4)', background: activeTab === 'home' ? 'var(--accent-subtle)' : 'none',
            border: 'none', borderRadius: 'var(--radius-full)',
            fontSize: 'var(--text-sm)', fontWeight: activeTab === 'home' ? 600 : 500,
            color: activeTab === 'home' ? 'var(--accent)' : 'var(--ink-3)',
            cursor: 'pointer'
          }}
        >
          Home
        </button>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 160, justifyContent: 'flex-end', WebkitAppRegion: 'no-drag' as any }}>
        {isCapturing && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 12px',
            background: 'var(--live-glow)',
            borderRadius: 'var(--radius-full)',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            color: 'var(--live-dot)',
            border: '1px solid rgba(92, 181, 131, 0.2)'
          }}>
            <span className="recording-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--live-dot)' }} />
            LIVE
          </span>
        )}
        <button
          onClick={() => onNavigate('settings')}
          onMouseEnter={() => setSettingsHovered(true)}
          onMouseLeave={() => setSettingsHovered(false)}
          style={{
            background: activeTab === 'settings' ? 'var(--accent-subtle)' : settingsHovered ? 'var(--surface-3)' : 'none',
            border: activeTab === 'settings' ? '1px solid var(--border-glow)' : '1px solid transparent',
            borderRadius: 'var(--radius-full)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: activeTab === 'settings' ? 'var(--accent)' : settingsHovered ? 'var(--ink-2)' : 'var(--ink-3)',
            cursor: 'pointer',
            padding: '5px 14px'
          }}
          title="Settings"
        >
          Settings
        </button>
      </div>
    </nav>
  )
}
