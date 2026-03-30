import { ipcMain } from 'electron'
import { keychainGet, keychainSet, keychainDelete } from './keychain'

export interface TavilyResult {
  title: string
  content: string
  url: string
  score: number
}

async function searchTavily(query: string): Promise<{ results: TavilyResult[]; answer?: string; error?: string }> {
  const apiKey = keychainGet('tavily-api-key')
  if (!apiKey) return { results: [], error: 'Tavily API key not configured' }

  try {
    const { tavily } = await import('@tavily/core')
    const client = tavily({ apiKey })
    const response = await client.search(query, {
      searchDepth: 'advanced',
      maxResults: 5,
      includeAnswer: true,
      topic: 'general'
    })

    const results: TavilyResult[] = (response.results ?? []).map((r: any) => ({
      title: r.title ?? '',
      content: r.content ?? '',
      url: r.url ?? '',
      score: r.score ?? 0
    }))

    return { results, answer: response.answer }
  } catch (err) {
    return { results: [], error: (err as Error).message }
  }
}

async function testTavilyKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { tavily } = await import('@tavily/core')
    const client = tavily({ apiKey })
    await client.search('test', { maxResults: 1 })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// OpenAI web search fallback using gpt-4o with web_search_preview tool
async function searchOpenAI(query: string): Promise<{ results: TavilyResult[]; answer?: string; error?: string }> {
  const apiKey = keychainGet('openai-api-key')
  if (!apiKey) return { results: [], error: 'OpenAI API key not configured' }

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant. Search the web and provide concise, factual answers with source URLs. Format your response as a direct answer followed by key findings.'
          },
          { role: 'user', content: query }
        ],
        temperature: 0.3
      })
    })

    if (!resp.ok) return { results: [], error: `OpenAI search error: ${resp.status}` }

    const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
    const content = data.choices[0]?.message?.content ?? ''

    // Parse the response into a result format
    // OpenAI web search returns prose with inline citations — extract as a single result
    return {
      results: [{
        title: `Web search: ${query}`,
        content: content.substring(0, 500),
        url: '',
        score: 0.8
      }],
      answer: content
    }
  } catch (err) {
    return { results: [], error: (err as Error).message }
  }
}

export function setupTavilyIpc(): void {
  ipcMain.handle('tavily:search', async (_e, query: string) => {
    return await searchTavily(query)
  })

  // Fallback search: tries Tavily first, falls back to OpenAI web search
  ipcMain.handle('web:search', async (_e, query: string) => {
    // Try Tavily first
    const tavilyResult = await searchTavily(query)
    if (!tavilyResult.error && tavilyResult.results.length > 0) {
      return { ...tavilyResult, source: 'tavily' }
    }

    // Fallback to OpenAI web search
    console.log('[WebSearch] Tavily unavailable, falling back to OpenAI search')
    const openaiResult = await searchOpenAI(query)
    return { ...openaiResult, source: 'openai' }
  })

  ipcMain.handle('tavily:test-key', async (_e, apiKey: string) => {
    return await testTavilyKey(apiKey)
  })

  ipcMain.handle('tavily:set-key', (_e, apiKey: string) => {
    keychainSet('tavily-api-key', apiKey)
    return { ok: true }
  })

  ipcMain.handle('tavily:remove-key', () => {
    keychainDelete('tavily-api-key')
    return { ok: true }
  })

  ipcMain.handle('tavily:status', () => {
    const key = keychainGet('tavily-api-key')
    return { configured: !!key, hasKey: !!key }
  })
}
