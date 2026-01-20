import { randomUUID } from 'crypto'
import { getCliVersion } from './runtime/config'
import {
  loadUserConfig,
  saveUserConfig
} from './runtime/user-config'
import { loadDeviceIdentity } from './license/device'
import { loadToken } from './license/token'

export type TelemetryCommand = 'generate' | 'angular' | 'login' | 'help'
export type TelemetryEvent = 'first_run' | 'command_run' | 'login'

const TELEMETRY_URL =
  process.env.GENERATEUI_TELEMETRY_URL?.trim() ||
  'https://api.generateui.dev/events'
const TELEMETRY_TIMEOUT_MS = 1000

function getOsName() {
  return process.platform
}

function loadOrCreateConfig(): {
  config: {
    installationId: string
    telemetry?: boolean
    lastLoginEmail?: string
  }
  isNew: boolean
} {
  let config = loadUserConfig()

  let isNew = false
  let shouldWrite = false

  if (!config) {
    isNew = true
    shouldWrite = true
    config = {
      installationId: randomUUID(),
      telemetry: true
    }
  } else if (!config.installationId) {
    isNew = true
    shouldWrite = true
    config.installationId = randomUUID()
    if (config.telemetry === undefined) {
      config.telemetry = true
    }
  } else if (config.telemetry === undefined) {
    shouldWrite = true
    config.telemetry = true
  }

  if (shouldWrite) {
    saveUserConfig(config)
  }

  const installationId =
    config.installationId ?? randomUUID()

  if (installationId !== config.installationId) {
    shouldWrite = true
    config.installationId = installationId
  }

  if (shouldWrite) {
    saveUserConfig(config)
  }

  return {
    config: {
      installationId,
      telemetry: config.telemetry,
      lastLoginEmail: config.lastLoginEmail
    },
    isNew
  }
}

function isTelemetryEnabled(
  cliEnabled: boolean,
  config: { telemetry?: boolean }
) {
  if (!cliEnabled) return false
  return config.telemetry !== false
}

async function sendEvent(payload: Record<string, unknown>) {
  const token = loadToken()
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    TELEMETRY_TIMEOUT_MS
  )
  try {
    await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token
          ? { Authorization: `Bearer ${token.accessToken}` }
          : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
  } catch {
    // Telemetry must never block execution.
  } finally {
    clearTimeout(timeout)
  }
}

export async function trackCommand(
  command: TelemetryCommand,
  cliEnabled: boolean
) {
  const { config, isNew } = loadOrCreateConfig()
  const enabled = isTelemetryEnabled(cliEnabled, config)
  if (!enabled) return

  const device = loadDeviceIdentity()

  if (isNew) {
    await sendEvent({
      event: 'first_run',
      installationId: config.installationId,
      deviceId: device.deviceId,
      deviceCreatedAt: device.createdAt,
      os: getOsName(),
      arch: process.arch,
      cliVersion: getCliVersion()
    })
  }

  if (command === 'login') return

  await sendEvent({
    event: command,
    installationId: config.installationId,
    deviceId: device.deviceId,
    email: config.lastLoginEmail ?? '',
    cliVersion: getCliVersion()
  })
}

export async function trackLogin(
  email: string | null,
  cliEnabled: boolean
) {
  const { config } = loadOrCreateConfig()
  const enabled = isTelemetryEnabled(cliEnabled, config)
  if (!enabled) return

  const device = loadDeviceIdentity()
  await sendEvent({
    event: 'login',
    installationId: config.installationId,
    deviceId: device.deviceId,
    email: email ?? '',
    cliVersion: getCliVersion()
  })
}
