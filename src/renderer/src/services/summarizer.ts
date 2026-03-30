import type { TranscriptSegment } from './openai-realtime'

export interface VoiceNoteSummary {
  dateTime: string
  durationMinutes: number
  topic: string
  keyIdeas: string[]
  questions: string[]
  connections: string[]
  actionItems: string[]
  rawGems: string[]
  overview: string
}

export interface SentimentMoment {
  timestamp?: string
  topic: string
  sentiment: 'very positive' | 'positive' | 'neutral' | 'cautious' | 'negative' | 'tense'
  indicator: string  // what in the language signaled this
}

export interface SentimentAnalysis {
  overallTone: string                    // e.g., "Collaborative with moments of tension around timeline"
  emotionalArc: string                   // how the sentiment evolved across the call
  keyMoments: SentimentMoment[]          // specific moments with sentiment shifts
  participantDynamics: string            // how participants interacted emotionally
  engagementLevel: string                // how engaged/disengaged participants were
  topicSentiments: Array<{ topic: string; sentiment: string; detail: string }>
  concerns: string[]                     // unspoken or implicit concerns detected
  positiveSignals: string[]              // enthusiasm, agreement, excitement
  risksDetected: string[]                // frustration, pushback, avoidance, discomfort
  recommendation: string                 // suggested follow-up based on emotional dynamics
}

export interface CallSummary {
  dateTime: string
  durationMinutes: number
  participants: string[]
  keyTopics: string[]
  actionItems: Array<{ item: string; owner?: string }>
  decisions: string[]
  followUps: string[]
  overview: string
  sentiment: SentimentAnalysis
}

export interface NoteReferenceForSummary {
  title: string
  content?: string
}

export async function generateSummary(
  segments: TranscriptSegment[],
  apiKey: string,
  skillContent?: string,
  references?: NoteReferenceForSummary[]
): Promise<CallSummary> {
  const transcript = segments
    .filter(s => s.isFinal && s.text.trim())
    .map(s => `[${s.speakerName ?? (s.speaker === 'mic' ? 'You' : 'Them')}] ${s.text}`)
    .join('\n')

  const firstTs = segments[0]?.timestamp ?? Date.now()
  const lastTs = segments[segments.length - 1]?.timestamp ?? Date.now()
  const durationMinutes = Math.round((lastTs - firstTs) / 60000)

  const systemPrompt = `You are an expert call analyst. Analyze the transcript and return a single flat JSON object (no nesting under wrapper keys) with ALL of the following top-level fields:

"participants": string[] — speaker names identified
"keyTopics": string[] — 3-5 main topics discussed
"actionItems": {"item": string, "owner": string}[] — tasks mentioned
"decisions": string[] — key decisions made
"followUps": string[] — things needing follow-up
"overview": string — 2-3 sentence summary of the call
"sentiment": object with these fields:
  "overallTone": string — one sentence capturing the emotional character
  "emotionalArc": string — how mood evolved start to end
  "keyMoments": {"topic": string, "sentiment": string, "indicator": string}[] — moments where sentiment shifted. sentiment is one of: "very positive", "positive", "neutral", "cautious", "negative", "tense". indicator cites actual words said.
  "participantDynamics": string — how participants related emotionally
  "engagementLevel": string — how engaged participants were
  "topicSentiments": {"topic": string, "sentiment": string, "detail": string}[] — sentiment per topic
  "concerns": string[] — implicit concerns from hesitation or hedging
  "positiveSignals": string[] — enthusiasm, agreement, excitement
  "risksDetected": string[] — frustration, pushback, avoidance
  "recommendation": string — suggested follow-up action

For sentiment: be specific, cite actual language from the transcript. Do not be generic.

Example structure (abbreviated):
{"participants":["Alice","Bob"],"keyTopics":["Budget","Timeline"],"actionItems":[{"item":"Send proposal","owner":"Alice"}],"decisions":["Approved Q3 budget"],"followUps":["Schedule review"],"overview":"Alice and Bob discussed...","sentiment":{"overallTone":"Collaborative with tension on timeline","emotionalArc":"Started warm, grew tense around deadlines, resolved positively","keyMoments":[{"topic":"Timeline","sentiment":"tense","indicator":"Bob said 'that's not realistic' twice"}],"participantDynamics":"Alice led, Bob pushed back","engagementLevel":"High throughout","topicSentiments":[{"topic":"Budget","sentiment":"positive","detail":"Both agreed quickly"}],"concerns":["Bob may not commit to the deadline"],"positiveSignals":["Alice expressed excitement about the new approach"],"risksDetected":["Unresolved disagreement on delivery date"],"recommendation":"Follow up with Bob separately on timeline concerns"}}
${skillContent ? `\nFollow these learned preferences:\n${skillContent}` : ''}
${references?.length ? `\nThe user attached these reference notes for context. Use them to provide more relevant analysis. Cite connections using [[wikilinks]]:\n\n${references.map(r => `### ${r.title}\n${(r.content ?? '').substring(0, 2000)}`).join('\n\n')}` : ''}
Return ONLY the JSON object. All fields at the top level. No wrapper keys.`

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Summarize this call transcript:\n\n${transcript}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4096
    })
  })

  if (!resp.ok) {
    throw new Error(`Summary API error: ${resp.status}`)
  }

  const data = await resp.json() as { choices: Array<{ message: { content: string }; finish_reason?: string }> }
  const content = data.choices[0]?.message?.content
  const finishReason = data.choices[0]?.finish_reason
  if (!content) throw new Error('Empty summary response')

  console.log('[Summarizer] finish_reason:', finishReason)
  console.log('[Summarizer] response length:', content.length)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    console.error('[Summarizer] JSON parse failed:', content.substring(0, 500))
    throw new Error('Failed to parse summary JSON — response may have been truncated')
  }

  console.log('[Summarizer] parsed keys:', Object.keys(parsed))

  // Resilient parsing: if GPT wrapped content in a nested key, unwrap it
  if (!parsed.overview && !parsed.keyTopics) {
    // Check for common wrapper patterns
    const wrapperKeys = ['contentAnalysis', 'content_analysis', 'summary', 'callSummary', 'call_summary']
    for (const key of wrapperKeys) {
      if (parsed[key] && typeof parsed[key] === 'object') {
        console.log(`[Summarizer] Found wrapped content under "${key}", unwrapping`)
        const inner = parsed[key] as Record<string, unknown>
        // Merge inner keys into parsed (but keep sentiment at top level if it exists)
        for (const [k, v] of Object.entries(inner)) {
          if (!parsed[k]) parsed[k] = v
        }
        break
      }
    }
    // Also check if sentiment is nested under a wrapper
    const sentimentKeys = ['sentimentAnalysis', 'sentiment_analysis']
    for (const key of sentimentKeys) {
      if (parsed[key] && typeof parsed[key] === 'object' && !parsed.sentiment) {
        parsed.sentiment = parsed[key]
        break
      }
    }
  }

  const defaultSentiment: SentimentAnalysis = {
    overallTone: '',
    emotionalArc: '',
    keyMoments: [],
    participantDynamics: '',
    engagementLevel: '',
    topicSentiments: [],
    concerns: [],
    positiveSignals: [],
    risksDetected: [],
    recommendation: ''
  }

  return {
    dateTime: new Date(firstTs).toISOString(),
    durationMinutes,
    participants: parsed.participants ?? ['You', 'Them'],
    keyTopics: parsed.keyTopics ?? [],
    actionItems: parsed.actionItems ?? [],
    decisions: parsed.decisions ?? [],
    followUps: parsed.followUps ?? [],
    overview: parsed.overview ?? '',
    sentiment: parsed.sentiment ? { ...defaultSentiment, ...parsed.sentiment } : defaultSentiment
  }
}

export async function generateVoiceNoteSummary(
  segments: TranscriptSegment[],
  apiKey: string,
  topic?: string,
  skillContent?: string
): Promise<VoiceNoteSummary> {
  const transcript = segments
    .filter(s => s.isFinal && s.text.trim())
    .map(s => s.text)
    .join('\n')

  const firstTs = segments[0]?.timestamp ?? Date.now()
  const lastTs = segments[segments.length - 1]?.timestamp ?? Date.now()
  const durationMinutes = Math.round((lastTs - firstTs) / 60000)

  const systemPrompt = `You are summarizing a personal voice note where the user was thinking out loud.
Organize their thoughts into a clear structure. Return a JSON object with these fields:
- keyIdeas: array of strings — the main points and insights they were exploring
- questions: array of strings — things they wondered about or need to research
- connections: array of strings — links to other topics, projects, or people they mentioned
- actionItems: array of strings — anything they said they want to do
- rawGems: array of strings — interesting phrases or formulations worth keeping verbatim (max 5)
- overview: 2-3 sentence summary written in first person, keeping the user's voice

Write in first person. Keep the user's voice. Don't over-formalize.
${topic ? `The user's stated topic was: "${topic}"` : ''}
${skillContent ? `\nIMPORTANT — Follow these learned preferences:\n${skillContent}` : ''}
Return ONLY valid JSON.`

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Summarize this voice note:\n\n${transcript}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    })
  })

  if (!resp.ok) throw new Error(`Summary API error: ${resp.status}`)

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices[0]?.message?.content
  if (!content) throw new Error('Empty summary response')

  const parsed = JSON.parse(content)

  return {
    dateTime: new Date(firstTs).toISOString(),
    durationMinutes,
    topic: topic || 'Voice Note',
    keyIdeas: parsed.keyIdeas ?? [],
    questions: parsed.questions ?? [],
    connections: parsed.connections ?? [],
    actionItems: parsed.actionItems ?? [],
    rawGems: parsed.rawGems ?? [],
    overview: parsed.overview ?? ''
  }
}
