import React, { useEffect, useRef } from 'react'
import type { TranscriptSegment } from '../../services/openai-realtime'

interface Props {
  segments: TranscriptSegment[]
  isCapturing: boolean
}

export default function Transcript({ segments, isCapturing }: Props): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isCapturing) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments, isCapturing])

  const finalSegments = segments.filter(s => s.text.trim())

  // Channel colors: mic = amber glow, sys = jade glow
  const channelColor = (speaker: string) => speaker === 'mic' ? 'var(--accent)' : 'var(--positive)'
  const channelGlow = (speaker: string) => speaker === 'mic' ? 'var(--accent-subtle)' : 'var(--positive-subtle)'

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-5) var(--sp-6)' }}>
      {finalSegments.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 'var(--sp-16) 0',
          color: 'var(--ink-4)', fontSize: 'var(--text-sm)', fontWeight: 500
        }}>
          {isCapturing ? (
            <div>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--recording-glow)',
                margin: '0 auto var(--sp-4)',
                animation: 'breathe 2s ease-in-out infinite'
              }} />
              <div style={{ color: 'var(--ink-3)' }}>Listening...</div>
            </div>
          ) : (
            'No transcript yet. Start a call to begin.'
          )}
        </div>
      )}
      {finalSegments.map((seg) => (
        <div
          key={seg.id}
          className="transcript-segment"
          style={{
            marginBottom: 'var(--sp-4)',
            padding: 'var(--sp-3) var(--sp-4)',
            background: seg.isFinal ? 'var(--surface-2)' : 'var(--surface-3)',
            borderRadius: 'var(--radius-lg)',
            borderLeft: `3px solid ${channelColor(seg.speaker)}`,
            opacity: seg.isFinal ? 1 : 0.7,
            transition: 'opacity 0.3s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-1)' }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
              color: 'var(--ink-4)', letterSpacing: '0.02em'
            }}>
              {new Date(seg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <div style={{
            fontSize: 'var(--text-sm)', color: seg.isFinal ? 'var(--ink-1)' : 'var(--ink-3)',
            lineHeight: 1.7, fontWeight: 400
          }}>
            {seg.text}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
