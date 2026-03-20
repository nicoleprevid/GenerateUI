import fs from 'fs'
import os from 'os'
import path from 'path'
import { getTokenState, loadToken, tokenFileExists } from './token'
import { getApiBaseUrl, getDevPlanUrl, getWebAuthUrl } from '../runtime/config'

export interface Features {
  intelligentGeneration: boolean
  safeRegeneration: boolean
  uiOverrides: boolean
  maxGenerations: number
}

export interface PermissionResponse {
  features: Features
  subscription: {
    status: string
    reason?: string | null
  }
}

interface PermissionCache extends PermissionResponse {
  fetchedAt: string
  expiresAt: string
}

const CONFIG_DIR = path.join(os.homedir(), '.generateui')
const PERMISSIONS_PATH = path.join(CONFIG_DIR, 'permissions.json')
const DEV_OFFLINE_DAYS = 7

const FREE_DEFAULT: PermissionResponse = {
  features: {
    intelligentGeneration: false,
    safeRegeneration: false,
    uiOverrides: false,
    maxGenerations: -1
  },
  subscription: {
    status: 'anonymous',
    reason: 'Login required to unlock paid features.'
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
    if (!parsed.features || !parsed.subscription?.status) return null
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

  const headers: Record<string, string> = {}
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

  const raw = (await response.json()) as any
  const data = normalizePermissions(raw)
  writeCache(data)
  return data
}

function normalizePermissions(raw: any): PermissionResponse {
  const features = normalizeFeatures(raw?.features)
  const subscription = normalizeSubscription(raw)
  return { features, subscription }
}

function normalizeFeatures(raw: any): Features {
  const fallback = FREE_DEFAULT.features
  return {
    intelligentGeneration:
      typeof raw?.intelligentGeneration === 'boolean'
        ? raw.intelligentGeneration
        : fallback.intelligentGeneration,
    safeRegeneration:
      typeof raw?.safeRegeneration === 'boolean'
        ? raw.safeRegeneration
        : fallback.safeRegeneration,
    uiOverrides:
      typeof raw?.uiOverrides === 'boolean'
        ? raw.uiOverrides
        : fallback.uiOverrides,
    maxGenerations:
      typeof raw?.maxGenerations === 'number'
        ? raw.maxGenerations
        : fallback.maxGenerations
  }
}

function normalizeSubscription(raw: any) {
  const source = raw?.subscription ?? {}
  const status = String(
    source?.status ??
      (raw?.plan === 'dev' ? 'active' : 'inactive')
  )
  const reasonValue = source?.reason
  const normalizedStatus = status.toLowerCase()
  return {
    status,
    reason:
      typeof reasonValue === 'string' && reasonValue.trim().length
        ? reasonValue
        : normalizedStatus === 'active'
          ? null
          : `Assinatura inativa. Faça upgrade para o plano Dev: ${getDevPlanUrl()}`
  }
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
    const tokenState = getTokenState()
    const cache = readCache()
    if (cache && cacheIsValid(cache)) {
      return {
        features: cache.features,
        subscription: cache.subscription
      }
    }

    // If the user is logged in but the API is temporarily unavailable,
    // fallback to the last known permissions to avoid blocking generation.
    if (tokenPresent && cache) {
      return {
        features: cache.features,
        subscription: cache.subscription
      }
    }

    if (tokenState === 'expired') {
      throw new Error(
        `Sua sessão expirou. Faça login novamente: ${getWebAuthUrl()}`
      )
    }

    if (tokenPresent) {
      throw new Error(
        'Login concluído, mas não foi possível validar sua licença agora. Verifique sua conexão com a API e tente novamente.'
      )
    }

    return FREE_DEFAULT
  }
}
