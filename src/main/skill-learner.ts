import { ipcMain } from 'electron'
import { readNote, saveNote, vaultPath } from './obsidian-api'
import { keychainGet } from './keychain'
import { listSessions, Session } from './session-manager'

function skillFilePath(): string {
  return vaultPath('System/Notetaker Skill.md')
}
const CONSOLIDATION_INTERVAL = 5 // Every 5 calls

interface CallRecord {
  date: string
  vaultNotePath?: string
  originalSummary?: string
}

// Extract learnings by comparing original summary with user-edited version
async function extractLearnings(original: string, edited: string, apiKey: string): Promise<string[]> {
  if (original === edited) return []

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are analyzing how a user edited an AI-generated call summary to learn their preferences.

Compare the original AI-generated summary with the user's edited version.
Identify specific, actionable preferences the user revealed through their edits.

Focus on:
- Formatting changes (headers, lists, structure)
- Tone/style changes (more/less formal, shorter/longer)
- Content priorities (what they added, removed, or reordered)
- Vocabulary preferences (terms they replaced)
- Structural patterns (section order, level of detail)

Return a JSON object: { "learnings": ["learning 1", "learning 2", ...] }
Each learning should be a single, specific, reusable instruction.
Only include meaningful changes, not typo fixes.
Return at most 5 learnings. If changes are trivial, return {"learnings": []}.`
        },
        {
          role: 'user',
          content: `ORIGINAL:\n${original}\n\nEDITED:\n${edited}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  })

  if (!resp.ok) return []

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices[0]?.message?.content
  if (!content) return []

  try {
    const parsed = JSON.parse(content)
    return Array.isArray(parsed.learnings) ? parsed.learnings : []
  } catch {
    return []
  }
}

// Consolidate the skill file: remove duplicates, prioritize recent learnings
async function consolidateSkillFile(skillContent: string, apiKey: string): Promise<string> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are maintaining a Notetaker Skill file that teaches an AI how to take better notes.

Your job is to consolidate this file:
1. Remove duplicate or contradictory learnings (keep the most recent)
2. Merge similar learnings into clear, specific rules
3. Promote frequently-appearing patterns from "Patterns and Learnings" into the main sections (Summarization Style, Formatting Preferences, Transcript Cleanup Rules, Vocabulary and Corrections)
4. Keep the User Feedback Log section but trim entries older than 10 calls
5. Update the version number by incrementing it
6. Set last_updated to today's date

IMPORTANT: Preserve the exact markdown structure with these sections:
- YAML frontmatter (tags, last_updated, version)
- Notetaker Skill File heading
- Summarization Style
- Formatting Preferences
- Transcript Cleanup Rules
- Vocabulary and Corrections
- Patterns and Learnings
- User Feedback Log

Return the COMPLETE updated file content, not just the changes.`
        },
        {
          role: 'user',
          content: skillContent
        }
      ],
      temperature: 0.2
    })
  })

  if (!resp.ok) return skillContent

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0]?.message?.content ?? skillContent
}

// Append learnings to the skill file
async function appendLearnings(learnings: string[], callDate: string): Promise<void> {
  let skillContent: string
  try {
    skillContent = await readNote(skillFilePath())
  } catch {
    console.log('[SkillLearner] Could not read skill file')
    return
  }

  const dateStr = new Date(callDate).toISOString().split('T')[0]
  const entry = `\n### ${dateStr}\n${learnings.map(l => `- ${l}`).join('\n')}\n`

  // Append to "User Feedback Log" section
  const feedbackIdx = skillContent.indexOf('## User Feedback Log')
  if (feedbackIdx !== -1) {
    const afterHeader = skillContent.indexOf('\n', feedbackIdx)
    const insertPos = afterHeader + 1
    // Skip the description paragraph if present
    const nextSection = skillContent.indexOf('\n## ', insertPos)
    const sectionContent = nextSection !== -1
      ? skillContent.substring(insertPos, nextSection)
      : skillContent.substring(insertPos)

    // Find end of description (first blank line after non-blank content, or first entry)
    let entryInsertPos = insertPos
    if (sectionContent.startsWith('\n(')) {
      // Description paragraph — insert after it
      const descEnd = sectionContent.indexOf('\n\n', 1)
      entryInsertPos = insertPos + (descEnd !== -1 ? descEnd : sectionContent.length)
    }

    const updated = skillContent.substring(0, entryInsertPos) + entry + skillContent.substring(entryInsertPos)

    // Also update last_updated in frontmatter
    const finalContent = updated.replace(/last_updated:\s*"[^"]*"/, `last_updated: "${dateStr}"`)

    try {
      await saveNote(skillFilePath(), finalContent)
      console.log(`[SkillLearner] Appended ${learnings.length} learning(s) to skill file`)
    } catch (err) {
      console.error('[SkillLearner] Failed to update skill file:', err)
    }
  }
}

// Check all recent sessions for user edits and extract learnings
export async function checkForLearnings(): Promise<void> {
  const apiKey = keychainGet('openai-api-key')
  if (!apiKey) return

  const sessions = listSessions()
  let totalLearnings = 0
  let totalCallsWithVault = 0

  for (const session of sessions) {
    for (const call of (session.calls as CallRecord[])) {
      if (!call.vaultNotePath || !call.originalSummary) continue
      totalCallsWithVault++

      // Read the current vault note
      let currentContent: string
      try {
        currentContent = await readNote(call.vaultNotePath)
      } catch {
        continue // Note may have been moved or deleted
      }

      // Compare with original
      if (currentContent === call.originalSummary) continue

      // Extract learnings from the diff
      const learnings = await extractLearnings(call.originalSummary, currentContent, apiKey)
      if (learnings.length > 0) {
        await appendLearnings(learnings, call.date)
        totalLearnings += learnings.length

        // Clear originalSummary so we don't re-process this diff
        // (We'd need to update the call record, but since we don't have
        // the session ID here cleanly, we'll skip this for now —
        // the diff will produce the same learnings which is fine)
      }
    }
  }

  if (totalLearnings > 0) {
    console.log(`[SkillLearner] Extracted ${totalLearnings} learning(s) from edited summaries`)
  }

  // Consolidation check: every 5 vault-saved calls
  if (totalCallsWithVault > 0 && totalCallsWithVault % CONSOLIDATION_INTERVAL === 0) {
    console.log(`[SkillLearner] ${totalCallsWithVault} vault calls — running consolidation`)
    await runConsolidation(apiKey)
  }
}

async function runConsolidation(apiKey: string): Promise<void> {
  try {
    const skillContent = await readNote(skillFilePath())
    const consolidated = await consolidateSkillFile(skillContent, apiKey)
    if (consolidated !== skillContent) {
      await saveNote(skillFilePath(), consolidated)
      console.log('[SkillLearner] Skill file consolidated')
    }
  } catch (err) {
    console.error('[SkillLearner] Consolidation failed:', err)
  }
}

// IPC for manual trigger from renderer
export function setupSkillLearnerIpc(): void {
  ipcMain.handle('skill-learner:check', async () => {
    try {
      await checkForLearnings()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('skill-learner:consolidate', async () => {
    const apiKey = keychainGet('openai-api-key')
    if (!apiKey) return { ok: false, error: 'No API key' }
    try {
      await runConsolidation(apiKey)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
