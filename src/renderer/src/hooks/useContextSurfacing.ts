import { useState, useRef, useEffect, useCallback } from 'react'
import type { TranscriptSegment } from '../services/openai-realtime'
import { extractEntities, searchForContext, parseVocabulary, ContextCard } from '../services/context-surfacer'

const DEFAULT_INTERVAL_MS = 30000

export interface ContextSurfacingState {
  cards: ContextCard[]
  loading: boolean
  enabled: boolean
  debugStatus: string
}

export interface ContextSurfacingActions {
  setEnabled: (enabled: boolean) => void
}

export function useContextSurfacing(
  segments: TranscriptSegment[],
  isCapturing: boolean
): ContextSurfacingState & ContextSurfacingActions {
  const [cards, setCards] = useState<ContextCard[]>([])
  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [debugStatus, setDebugStatus] = useState('Waiting to start...')
  const seenPathsRef = useRef(new Set<string>())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastCheckRef = useRef(0)

  const runCheck = useCallback(async () => {
    console.log('[Context] runCheck called — isCapturing:', isCapturing, 'enabled:', enabled, 'segments:', segments.length)
    if (!isCapturing || !enabled) { setDebugStatus('Not active'); return }

    // Get last ~60 seconds of transcript
    const now = Date.now()
    const recentSegments = segments.filter(
      s => s.isFinal && s.text.trim() && (now - s.timestamp) < 60000
    )
    console.log('[Context] Recent segments (last 60s):', recentSegments.length)
    if (recentSegments.length === 0) { setDebugStatus('No recent segments'); return }

    const chunk = recentSegments.map(s => s.text).join(' ')
    console.log('[Context] Chunk length:', chunk.length, '— text:', chunk.substring(0, 100))
    if (chunk.length < 20) { setDebugStatus('Text too short'); return }

    setLoading(true)
    setDebugStatus('Checking...')
    try {
      const apiKey = await window.darkscribe.keychain.get('openai-api-key')
      if (!apiKey) { console.warn('[Context] No API key'); setDebugStatus('No API key'); return }

      // Check vault connection
      try {
        const status = await window.darkscribe.vault.status()
        console.log('[Context] Vault status:', status)
        if (!status.connected) { console.warn('[Context] Vault not connected'); setDebugStatus('Vault not connected'); return }
      } catch (e) {
        console.warn('[Context] Vault status check failed:', e)
        setDebugStatus('Vault check failed')
      }

      // Read skill file vocabulary
      let vocabulary: Record<string, string> = {}
      try {
        const config = await window.darkscribe.config.read()
        const prefix = (config.vault_subfolder as string) || ''
        const skillPath = prefix ? `${prefix}/System/Notetaker Skill.md` : 'System/Notetaker Skill.md'
        const skillResult = await window.darkscribe.vault.readNote(skillPath)
        if (skillResult.content) {
          vocabulary = parseVocabulary(skillResult.content)
        }
      } catch {}

      setDebugStatus('Extracting entities...')
      console.log('[Context] Extracting entities...')
      const entities = await extractEntities(chunk, apiKey)
      console.log('[Context] Entities found:', entities)
      if (entities.length === 0) { setDebugStatus('No entities found'); return }

      setDebugStatus(`Found: ${entities.join(', ')} — searching vault...`)
      console.log('[Context] Searching vault for context...')
      const newCards = await searchForContext(entities, seenPathsRef.current, vocabulary)
      console.log('[Context] Cards found:', newCards.length, newCards.map(c => c.title))
      if (newCards.length > 0) {
        setCards(prev => [...newCards, ...prev].slice(0, 10))
        setDebugStatus(`Found ${newCards.length} related notes`)
      } else {
        setDebugStatus(`Searched for ${entities.join(', ')} — no vault matches`)
      }
    } catch (err) {
      console.error('[ContextSurfacing] Error:', err)
      setDebugStatus(`Error: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [segments, isCapturing, enabled])

  // Set up polling interval
  useEffect(() => {
    if (!isCapturing || !enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Run immediately on first capture, then every 30s
    const timer = setInterval(runCheck, DEFAULT_INTERVAL_MS)
    intervalRef.current = timer

    // Run first check after 10 seconds of capturing
    const firstCheck = setTimeout(runCheck, 10000)

    return () => {
      clearInterval(timer)
      clearTimeout(firstCheck)
      intervalRef.current = null
    }
  }, [isCapturing, enabled, runCheck])

  // Reset when a new call starts
  useEffect(() => {
    if (isCapturing) {
      seenPathsRef.current = new Set()
      setCards([])
    }
  }, [isCapturing])

  return { cards, loading, enabled, setEnabled, debugStatus }
}
