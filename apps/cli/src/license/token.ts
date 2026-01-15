import fs from 'fs'
import os from 'os'
import path from 'path'

export interface AccessToken {
  accessToken: string
  expiresAt: string
}

const CONFIG_DIR = path.join(os.homedir(), '.generateui')
const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json')

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

export function tokenFileExists() {
  return fs.existsSync(TOKEN_PATH)
}

export function loadToken(): AccessToken | null {
  if (!tokenFileExists()) return null
  try {
    const parsed = JSON.parse(
      fs.readFileSync(TOKEN_PATH, 'utf-8')
    ) as AccessToken

    if (!parsed.accessToken || !parsed.expiresAt) return null
    const expiresAt = new Date(parsed.expiresAt).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveToken(token: AccessToken) {
  ensureConfigDir()
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2))
}

export function clearToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.rmSync(TOKEN_PATH)
  }
}
