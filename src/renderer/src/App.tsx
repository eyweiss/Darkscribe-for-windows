import React, { useEffect, useState, useCallback } from 'react'
import OnboardingFlow from './components/Onboarding/OnboardingFlow'
import TopNav from './components/TopNav'
import SessionList from './components/SessionList'
import CallSetup from './components/CallSetup'
import VoiceNoteSetup from './components/VoiceNoteSetup'
import type { VoiceNoteCategory } from './components/VoiceNoteSetup'
import MainApp from './components/MainApp'
import PostCallSummary from './components/PostCallSummary'
import VoiceNoteSummary from './components/VoiceNoteSummary'
import Settings from './components/Settings'
import type { TranscriptSegment } from './services/openai-realtime'
import type { WebSearchResult } from './components/SearchPanel/VaultSearchPanel'
import type { NoteReference } from './components/ReferencePanel'

type AppState = 'loading' | 'onboarding' | 'home' | 'setup' | 'voice-setup' | 'call' | 'voice-call' | 'summary' | 'voice-summary' | 'review' | 'settings'

interface ActiveSession {
  id: string
  name?: string
  participants?: string
}

interface VoiceNoteState {
  topic: string
  category: VoiceNoteCategory
}

export default function App(): React.ReactElement {
  const [state, setState] = useState<AppState>('loading')
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [completedSegments, setCompletedSegments] = useState<TranscriptSegment[]>([])
  const [completedAudioFile, setCompletedAudioFile] = useState<string | null>(null)
  const [completedWebSearches, setCompletedWebSearches] = useState<WebSearchResult[]>([])
  const [voiceNote, setVoiceNote] = useState<VoiceNoteState>({ topic: '', category: 'Ideas' })

  useEffect(() => {
    window.darkscribe.config.read().then((config) => {
      setState(config.onboarding_complete ? 'home' : 'onboarding')
    })
  }, [])

  const handleCallEnd = useCallback((segments: TranscriptSegment[], audioFile: string | null, webSearches?: WebSearchResult[]) => {
    setCompletedSegments(segments)
    setCompletedAudioFile(audioFile)
    setCompletedWebSearches(webSearches ?? [])
    setState(prev => prev === 'voice-call' ? 'voice-summary' : 'summary')
  }, [])

  const startCallFromSetup = useCallback(async (recordingName: string, participants: string, references?: NoteReference[]) => {
    const session = await window.darkscribe.session.create({ name: recordingName || undefined }) as any
    if (references?.length) {
      await window.darkscribe.session.saveReferences(session.id, references).catch(() => {})
    }
    setActiveSession({ id: session.id, name: recordingName || undefined, participants: participants || undefined })
    setState('call')
  }, [])

  const startVoiceNote = useCallback(async (topic: string, category: VoiceNoteCategory) => {
    setVoiceNote({ topic, category })
    const session = await window.darkscribe.session.create({ name: topic || 'Voice Note' }) as any
    setActiveSession({ id: session.id, name: topic || undefined })
    setState('voice-call')
  }, [])

  if (state === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--primary-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        </div>
        <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>Loading Darkscribe...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (state === 'onboarding') {
    return <OnboardingFlow onComplete={() => { window.darkscribe.config.write({ onboarding_complete: true }); setState('home') }} />
  }

  const handleNav = (tab: string) => {
    if (tab === 'home') { setActiveSession(null); setState('home') }
    else if (tab === 'settings') setState('settings')
  }

  const isRecording = (state === 'call' || state === 'voice-call') && !!activeSession
  const activeTab: 'home' | 'call' | 'settings' = (state === 'home' || state === 'setup' || state === 'voice-setup') ? 'home' : state === 'settings' ? 'settings' : 'call'

  const renderContent = () => {
    if (state === 'settings') return <Settings onBack={() => setState('home')} />

    if (state === 'home') {
      return (
        <SessionList
          onNewCall={() => setState('setup')}
          onNewVoiceNote={() => setState('voice-setup')}
          onSelectSession={async (session) => {
            // Load session data from disk and open in review mode
            const transcript = await window.darkscribe.session.loadTranscript(session.id) as any[] | null
            const searches = await window.darkscribe.session.loadWebSearches(session.id) as any[] | null
            setCompletedSegments(transcript ?? [])
            setCompletedWebSearches(searches ?? [])
            setCompletedAudioFile(null)
            setActiveSession({ id: session.id, name: session.name })
            setState('review')
          }}
        />
      )
    }

    if (state === 'setup') {
      return <CallSetup onStart={startCallFromSetup} onCancel={() => setState('home')} />
    }

    if (state === 'voice-setup') {
      return <VoiceNoteSetup onStart={startVoiceNote} onCancel={() => setState('home')} />
    }

    if (state === 'summary' && activeSession) {
      return (
        <PostCallSummary
          segments={completedSegments}
          sessionId={activeSession.id}
          sessionName={activeSession.name}
          participants={activeSession.participants}
          webSearches={completedWebSearches}
          audioFile={completedAudioFile}
          onBack={() => { setActiveSession(null); setState('home') }}
          onNewCall={() => { setActiveSession(null); setState('setup') }}
        />
      )
    }

    if (state === 'review' && activeSession) {
      return (
        <PostCallSummary
          segments={completedSegments}
          sessionId={activeSession.id}
          sessionName={activeSession.name}
          participants={activeSession.participants}
          webSearches={completedWebSearches}
          audioFile={completedAudioFile}
          readOnly={true}
          onBack={() => { setActiveSession(null); setState('home') }}
          onNewCall={() => { setActiveSession(null); setState('setup') }}
        />
      )
    }

    if (state === 'voice-summary') {
      return (
        <VoiceNoteSummary
          segments={completedSegments}
          topic={voiceNote.topic}
          category={voiceNote.category}
          audioFile={completedAudioFile}
          onBack={() => { setActiveSession(null); setState('home') }}
          onNew={() => { setActiveSession(null); setState('voice-setup') }}
        />
      )
    }

    if ((state === 'call' || state === 'voice-call') && activeSession) {
      return (
        <MainApp
          sessionId={activeSession.id}
          sessionName={activeSession.name}
          onEndCall={handleCallEnd}
          onBack={() => { setActiveSession(null); setState('home') }}
        />
      )
    }

    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-1)', paddingTop: 28 }}>
      <TopNav activeTab={activeTab} isCapturing={isRecording} onNavigate={handleNav} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {renderContent()}
      </div>
    </div>
  )
}
