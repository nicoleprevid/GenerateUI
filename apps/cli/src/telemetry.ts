import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { getCliVersion } from './runtime/config'
import { loadDeviceIdentity } from './license/device'

export type TelemetryCommand = 'generate' | 'angular' | 'login' | 'help'
export type TelemetryEvent = 'first_run' | 'command_run' | 'login'

type TelemetryConfig = {
  installationId: string
  telemetry?: boolean
}

const TELEMETRY_URL =
  process.env.GENERATEUI_TELEMETRY_URL?.trim() ||
  'generateuibackend-production.up.railway.app'
const TELEMETRY_TIMEOUT_MS = 1000

function getOsName() {
  return process.platform
}

function getConfigPath() {
  return path.join(os.homedir(), '.generateui', 'config.json')
}

function loadOrCreateConfig(): {
  config: TelemetryConfig
  isNew: boolean
} {
  const configPath = getConfigPath()
  let config: TelemetryConfig | null = null

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8')
      config = JSON.parse(raw) as TelemetryConfig
    } catch {
      config = null
    }
  }

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
    const dir = path.dirname(configPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  }

  return { config, isNew }
}

function isTelemetryEnabled(
  cliEnabled: boolean,
  config: TelemetryConfig
) {
  if (!cliEnabled) return false
  return config.telemetry !== false
}

async function sendEvent(payload: Record<string, unknown>) {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    TELEMETRY_TIMEOUT_MS
  )
  try {
    await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
      os: getOsName(),
      arch: process.arch,
      cliVersion: getCliVersion()
    })
  }

  await sendEvent({
    event: 'command_run',
    installationId: config.installationId,
    command,
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

  await sendEvent({
    event: 'login',
    installationId: config.installationId,
    email: email ?? '',
    cliVersion: getCliVersion()
  })
}
