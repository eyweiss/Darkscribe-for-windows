# Darkscribe — Session Persistence + Note References Plan

## Context

Darkscribe has a critical data loss issue: transcript segments, generated summaries, web searches, and sentiment analysis live **only in React state**. When the user navigates away from the PostCallSummary screen (Back, Home, close app) without clicking "Save to Vault," everything is lost. The session index in `sessions.json` retains metadata (id, name, call date, duration) but not the actual content.

This plan adds: (1) persistent per-session storage that survives navigation and crashes, (2) auto-save to Obsidian toggle, (3) the ability to attach Obsidian notes as references to enrich summaries.

---

## Phase 1: Core Persistence (session-manager + preload)

### What changes

**`src/main/session-manager.ts`** — Add per-session file I/O functions. Each session already has a directory at `userData/sessions/{id}/`. Add these files:

| File | Contents | Written When |
|------|----------|--------------|
| `transcript.json` | `TranscriptSegment[]` | Every 10s during recording + on call end |
| `summary.json` | `CallSummary` object | After summary generation |
| `web-searches.json` | `WebSearchResult[]` | On call end |
| `references.json` | `NoteReference[]` | When user attaches/removes references |
| `metadata.json` | `{ status, participants }` | On state transitions |

New IPC handlers to add (all follow existing read/write pattern with `fs.readFileSync`/`fs.writeFileSync`):
- `session:save-transcript(id, segments)` / `session:load-transcript(id)`
- `session:save-summary(id, summary)` / `session:load-summary(id)`
- `session:save-web-searches(id, searches)` / `session:load-web-searches(id)`
- `session:save-references(id, refs)` / `session:load-references(id)`
- `session:save-metadata(id, meta)` / `session:load-metadata(id)`
- `session:recover-interrupted()` — scans all session dirs for metadata.json where status === 'recording'

Add `status` field to `CallRecord`: `'recording' | 'interrupted' | 'summarized' | 'complete'`

**`src/preload/index.ts`** — Add all new IPC bridge methods to the `session` namespace.

**`src/main/config.ts`** — Add to AppConfig:
- `auto_save_to_vault: boolean` (default: false)
- `save_incomplete_sessions: boolean` (default: false)

### Verification
- Write a transcript to disk, read it back, confirm data integrity
- Kill the app mid-recording, restart, confirm transcript.json exists with partial data

---

## Phase 2: Auto-save During Recording

### What changes

**`src/renderer/src/components/MainApp.tsx`** — Add a `useEffect` with a 10-second `setInterval` that calls `session:save-transcript` with the current segments array. On call end (`handleStop`), do a final save of transcript + web searches before transitioning to summary.

Also save `metadata.json` with `status: 'recording'` when capture starts, so interrupted sessions can be detected.

Add a save-in-progress flag to prevent the interval and final save from racing.

### Verification
- Start a call, talk for 30 seconds, check `sessions/{id}/transcript.json` exists on disk
- Force-quit the app mid-call, restart, confirm transcript data is recoverable

---

## Phase 3: Summary Persistence + Review Mode

### What changes

**`src/renderer/src/components/PostCallSummary.tsx`**:
- Add `readOnly?: boolean` prop
- **Generate mode** (readOnly=false, current behavior): After generating summary, persist it to disk via `session:save-summary`. Also persist transcript and web searches. Update metadata status to 'summarized'.
- **Review mode** (readOnly=true): Load summary from `session:load-summary` instead of calling OpenAI. No API cost to reopen a past session.
- After vault save succeeds: update status to 'complete'
- **Auto-save check**: After summary generates, read `config.auto_save_to_vault`. If true, call `saveToVault()` automatically and show a toast.

**`src/renderer/src/App.tsx`**:
- Add `'review'` to AppState union
- New handler `loadAndReviewSession(session)`: loads transcript, summary, web searches from disk, sets state to 'review'
- On startup: call `session:recover-interrupted()`, show banner if any found
- `review` state renders `PostCallSummary` with `readOnly={true}`

**`src/renderer/src/components/VoiceNoteSummary.tsx`** — Same pattern: persist summary to disk, support readOnly mode.

### Verification
- End a call, see summary, navigate home, click the session — summary loads from disk without re-generating
- Close and reopen app — past sessions still accessible with full data

---

## Phase 4: SessionList Improvements

### What changes

**`src/renderer/src/components/SessionList.tsx`**:
- On mount, load all sessions. For each, load `metadata.json` to get status.
- Display status indicators: green dot = complete, orange = summarized (not vault-saved), red = interrupted
- Differentiate click behavior:
  - Complete/summarized sessions → load from disk, go to 'review' state
  - Interrupted sessions → load transcript from disk, go to 'summary' state (re-generate summary)
  - New sessions → existing 'setup' flow
- Show "Save to Vault" button inline for sessions not yet saved
- Show Obsidian deep link icon for vault-saved sessions
- Add "Delete Session" with confirmation dialog

### Verification
- Home screen shows all past sessions with correct status badges
- Can reopen any session and see full content
- Can delete a session

---

## Phase 5: Settings — Auto-save Toggles

### What changes

**`src/renderer/src/components/Settings.tsx`** — Add to the Obsidian section:
- Toggle: "Auto-save to vault after summary" (writes `auto_save_to_vault` to config)
- Toggle: "Save incomplete sessions" (writes `save_incomplete_sessions` to config, only visible when auto-save is ON)
- Description text explaining each toggle

### Verification
- Toggle auto-save ON, end a call — summary auto-saves to vault without clicking the button
- Toggle OFF — reverts to manual Save to Vault button

---

## Phase 6: Note References

### New component

**`src/renderer/src/components/ReferencePanel.tsx`** — Shared component for searching and attaching Obsidian notes:
- Search input → `vault:search` (same endpoint as existing search)
- Results list with "Attach" button per result
- Attached references shown as chips with note title, clickable (opens in Obsidian), removable (×)
- Max 10 references
- `onReferencesChange(refs)` callback

### New interface

```typescript
interface NoteReference {
  path: string       // vault-relative path
  title: string      // display name (filename sans .md)
  snippet: string    // first ~200 chars
  content?: string   // full note content (loaded for prompt injection)
  addedAt: string    // ISO timestamp
}
```

### Where it's used

**`src/renderer/src/components/CallSetup.tsx`** — Add "Reference Notes (optional)" section with embedded ReferencePanel. References stored in App.tsx state, persisted to disk after session creation.

**`src/renderer/src/components/MainApp.tsx`** — Add "References" as a third tab alongside Context and Search in the right panel. Allows attaching references mid-call. Pinned references shown at top of Context panel.

**`src/renderer/src/App.tsx`** — New state: `pendingReferences: NoteReference[]`. Threaded through setup → call → summary. Persisted via `session:save-references` after session creation.

### How references affect output

**`src/renderer/src/services/summarizer.ts`** — New `references?: NoteReference[]` parameter. Reference content (truncated to 2000 chars each) injected into GPT-4o system prompt: "The user referenced these notes. Use them as context. Cite connections using [[wikilinks]]."

**`src/renderer/src/components/PostCallSummary.tsx`** — References in saved markdown:
- YAML frontmatter: `references: ["[[Note Title]]", ...]`
- Body section: `## References` with wikilinks + when attached (before/during session)

**Context surfacing** (`useContextSurfacing.ts`) — If a note is already attached as a reference, skip it during vault search (don't re-surface).

### Verification
- Attach a note before starting a call → note content appears in summary prompt
- Attach a note during a call → appears in Context panel + saved in session
- References appear in saved vault markdown as wikilinks

---

## Critical Files (ordered by implementation)

1. `src/main/session-manager.ts` — All new file I/O + IPC handlers
2. `src/preload/index.ts` — New IPC bridge methods
3. `src/main/config.ts` — Two new config fields
4. `src/renderer/src/components/MainApp.tsx` — 10s auto-save interval + reference tab
5. `src/renderer/src/components/PostCallSummary.tsx` — readOnly mode, disk persistence, auto-save
6. `src/renderer/src/App.tsx` — review state, interrupted recovery, reference threading
7. `src/renderer/src/components/SessionList.tsx` — Status indicators, reopen behavior
8. `src/renderer/src/components/Settings.tsx` — Auto-save toggles
9. `src/renderer/src/components/ReferencePanel.tsx` — NEW component
10. `src/renderer/src/components/CallSetup.tsx` — Reference attachment UI
11. `src/renderer/src/services/summarizer.ts` — References in prompt
12. `src/renderer/src/components/VoiceNoteSummary.tsx` — Same persistence as PostCallSummary

### Existing functions to reuse
- `sessionDir(id)` in session-manager.ts — gets `userData/sessions/{id}/`
- `readConfig()` / `writeConfig()` in config.ts — for auto-save settings
- `vault:search` IPC — for reference search (same as VaultSearchPanel uses)
- `vault:readNote` IPC — for loading reference content
- `vault:saveNote` IPC — for auto-save to vault
- `buildSummaryMarkdown()` / `buildTranscriptMarkdown()` in PostCallSummary.tsx — for vault save
- `openInObsidian()` in ContextPanel.tsx — reuse for reference chips

---

## Verification Plan

1. **Data loss test**: Start a call, talk for 30s, force-quit the app. Reopen → session appears in list with "Interrupted" badge. Click it → partial transcript loads. Generate summary from partial data.

2. **Navigation test**: Start call → end call → summary generates → click "Back" without saving to vault → click session from home → full summary loads from disk (no API re-call).

3. **Auto-save test**: Enable auto-save in Settings → end a call → summary auto-saves to vault → toast shows with Obsidian link → session shows green "Complete" badge.

4. **Reference test**: On CallSetup, search vault for "Project Alpha" → attach it → start call → mention project alpha → summary cites the reference note → saved markdown has `references: ["[[Project Alpha]]"]` in frontmatter.

5. **Interrupted recovery test**: Start recording → kill Electron process → restart → home screen shows "1 interrupted session" → click resume → transcript loads from last 10s save → user can generate summary.
