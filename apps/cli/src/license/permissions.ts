import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadToken, tokenFileExists } from './token'
import { getApiBaseUrl } from '../runtime/config'

export interface Features {
  intelligentGeneration: boolean
  safeRegeneration: boolean
  uiOverrides: boolean
  maxGenerations: number
}

export interface PermissionResponse {
  plan: 'free' | 'dev'
  features: Features
}

interface PermissionCache extends PermissionResponse {
  fetchedAt: string
  expiresAt: string
}

const CONFIG_DIR = path.join(os.homedir(), '.generateui')
const PERMISSIONS_PATH = path.join(CONFIG_DIR, 'permissions.json')
const DEV_OFFLINE_DAYS = 7

const FREE_DEFAULT: PermissionResponse = {
  plan: 'free',
  features: {
    intelligentGeneration: false,
    safeRegeneration: false,
    uiOverrides: false,
    maxGenerations: 1
  }
}

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

function readCache(): PermissionCache | null {
  if (!fs.existsSync(PERMISSIONS_PATH)) return null
  try {
    const parsed = JSON.parse(
      fs.readFileSync(PERMISSIONS_PATH, 'utf-8')
    ) as PermissionCache
    if (!parsed.plan || !parsed.features) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(response: PermissionResponse) {
  ensureConfigDir()
  const fetchedAt = new Date().toISOString()
  const expiresAt = new Date(
    Date.now() + DEV_OFFLINE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const payload: PermissionCache = {
    ...response,
    fetchedAt,
    expiresAt
  }

  fs.writeFileSync(PERMISSIONS_PATH, JSON.stringify(payload, null, 2))
}

export async function fetchPermissions(): Promise<PermissionResponse> {
  const apiBase = getApiBaseUrl()
  const token = loadToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (token?.accessToken) {
    headers.Authorization = `Bearer ${token.accessToken}`
  }

  const response = await fetch(`${apiBase}/me`, {
    method: 'GET',
    headers
  })

  if (!response.ok) {
    throw new Error('Failed to fetch permissions')
  }

  const data = (await response.json()) as PermissionResponse
  writeCache(data)
  return data
}

function cacheIsValid(cache: PermissionCache) {
  const expiresAt = new Date(cache.expiresAt).getTime()
  if (Number.isNaN(expiresAt)) return false
  return expiresAt > Date.now()
}

export async function getPermissions(): Promise<PermissionResponse> {
  try {
    return await fetchPermissions()
  } catch {
    const tokenPresent = tokenFileExists()
    const cache = readCache()
    if (cache && cacheIsValid(cache)) {
      return { plan: cache.plan, features: cache.features }
    }

    if (tokenPresent) {
      throw new Error(
        'Login concluído, mas não foi possível validar sua licença agora. Verifique sua conexão com a API e tente novamente.'
      )
    }

    return FREE_DEFAULT
  }
}
