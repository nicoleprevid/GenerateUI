import fs from 'fs'
import os from 'os'
import path from 'path'

export type UserConfig = {
  installationId?: string
  telemetry?: boolean
  lastSchemasPath?: string
  lastLoginEmail?: string
}

export function getUserConfigPath() {
  return path.join(os.homedir(), '.generateui', 'config.json')
}

export function loadUserConfig(): UserConfig | null {
  const configPath = getUserConfigPath()
  if (!fs.existsSync(configPath)) return null

  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw) as UserConfig
  } catch {
    return null
  }
}

export function saveUserConfig(config: UserConfig) {
  const configPath = getUserConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

export function updateUserConfig(
  updater: (config: UserConfig) => UserConfig
) {
  const current = loadUserConfig() ?? {}
  const next = updater(current)
  saveUserConfig(next)
  return next
}
