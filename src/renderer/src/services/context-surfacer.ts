// Extracts named entities from transcript text via GPT-4o-mini,
// then searches the vault for related context.

import type { TranscriptSegment } from './openai-realtime'

export interface ContextCard {
  id: string
  notePath: string
  title: string
  excerpt: string
  relevanceHint: string
  surfacedAt: number
}

// Extract named entities and key topics from a transcript chunk
export async function extractEntities(transcriptChunk: string, apiKey: string): Promise<string[]> {
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Extract named entities and key topics from this transcript segment. Include person names, company names, project names, product names, and specific topics. Return as a JSON object: {"entities": ["entity1", "entity2", ...]}. Be concise, max 10 items. If nothing meaningful, return {"entities": []}.'
          },
          { role: 'user', content: transcriptChunk }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 200
      })
    })

    if (!resp.ok) return []

    const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
    const content = data.choices[0]?.message?.content
    if (!content) return []

    const parsed = JSON.parse(content)
    return Array.isArray(parsed.entities) ? parsed.entities.filter((e: string) => e.length > 1) : []
  } catch {
    return []
  }
}

// Search vault for context related to entities, with dedup
export async function searchForContext(
  entities: string[],
  seenPaths: Set<string>,
  skillVocabulary: Record<string, string>
): Promise<ContextCard[]> {
  const cards: ContextCard[] = []

  // Apply vocabulary corrections from skill file (e.g. "John" → "John Smith, VP Engineering")
  const expandedEntities = entities.map(e => {
    const correction = skillVocabulary[e.toLowerCase()]
    return correction ? [e, correction] : [e]
  }).flat()

  // Deduplicate search terms
  const uniqueTerms = [...new Set(expandedEntities)]

  // Search in parallel (max 5 concurrent)
  const searchPromises = uniqueTerms.slice(0, 5).map(async (term) => {
    try {
      const res = await window.darkscribe.vault.search(term)
      if (res.error || !res.results?.length) return []
      return res.results
        .filter(r => !seenPaths.has(r.path))
        .map(r => ({
          id: `${term}-${r.path}`,
          notePath: r.path,
          title: r.path.split('/').pop()?.replace('.md', '') ?? r.path,
          excerpt: r.snippet || '',
          relevanceHint: `Matched "${term}"`,
          surfacedAt: Date.now()
        }))
    } catch {
      return []
    }
  })

  const allResults = await Promise.all(searchPromises)
  for (const results of allResults) {
    for (const card of results) {
      if (!seenPaths.has(card.notePath)) {
        seenPaths.add(card.notePath)
        cards.push(card)
      }
    }
  }

  return cards
}

// Parse vocabulary corrections from skill file content
export function parseVocabulary(skillContent: string): Record<string, string> {
  const vocab: Record<string, string> = {}
  const vocabSection = skillContent.match(/## Vocabulary and Corrections\n([\s\S]*?)(?=\n## |$)/)
  if (!vocabSection) return vocab

  const lines = vocabSection[1].split('\n').filter(l => l.trim().startsWith('-'))
  for (const line of lines) {
    // Parse entries like "- John → John Smith, VP Engineering"
    const match = line.match(/^-\s*(.+?)\s*→\s*(.+)$/)
    if (match) {
      vocab[match[1].trim().toLowerCase()] = match[2].trim()
    }
  }
  return vocab
}
