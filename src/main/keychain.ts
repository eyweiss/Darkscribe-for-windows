import { safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

function keychainFile(): string {
  return path.join(app.getPath('userData'), 'keychain.enc')
}

interface KeychainData {
  [key: string]: string
}

function readStore(): KeychainData {
  try {
    const file = keychainFile()
    if (!fs.existsSync(file)) return {}
    const raw = fs.readFileSync(file)
    const decrypted = safeStorage.decryptString(raw)
    return JSON.parse(decrypted)
  } catch {
    return {}
  }
}

function writeStore(data: KeychainData): void {
  const file = keychainFile()
  const json = JSON.stringify(data)
  const encrypted = safeStorage.encryptString(json)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, encrypted)
}

export function keychainSet(key: string, value: string): void {
  const store = readStore()
  store[key] = value
  writeStore(store)
}

export function keychainGet(key: string): string | null {
  const store = readStore()
  return store[key] ?? null
}

export function keychainDelete(key: string): void {
  const store = readStore()
  delete store[key]
  writeStore(store)
}
