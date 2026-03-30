import fs from 'fs'
import path from 'path'
import { app } from 'electron'

function configFile(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export interface AppConfig {
  onboarding_complete: boolean
  theme?: 'system' | 'light' | 'dark'
  vault_subfolder?: string            // Darkscribe subfolder within vault (e.g. "Work/Darkscribe")
  obsidian_host?: string              // REST API host (default: 127.0.0.1)
  obsidian_port?: number              // REST API port (default: 27124)
  obsidian_vault_name?: string        // Vault name for deep links (e.g. "MyVault")
  recordings_enabled?: boolean
  recordings_retention_days?: number
  transcription_mode?: 'auto' | 'preferred'
  preferred_languages?: string[]      // ISO 639-1 codes (e.g. ["en", "he"])
  auto_save_to_vault?: boolean        // Auto-save summary + transcript to vault after generation
  save_incomplete_sessions?: boolean  // Also auto-save sessions < 30s or without summary
}

const DEFAULTS: AppConfig = {
  onboarding_complete: false,
  theme: 'system',
  obsidian_host: '127.0.0.1',
  obsidian_port: 27124,
  recordings_enabled: true,
  recordings_retention_days: 30,
  transcription_mode: 'auto',
  preferred_languages: []
}

export function readConfig(): AppConfig {
  try {
    const file = configFile()
    if (!fs.existsSync(file)) return { ...DEFAULTS }
    const raw = fs.readFileSync(file, 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeConfig(updates: Partial<AppConfig>): AppConfig {
  const file = configFile()
  const current = readConfig()
  const next = { ...current, ...updates }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2))
  return next
}
