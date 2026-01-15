import { getApiBaseUrl, getCliVersion } from './runtime/config'
import { loadDeviceIdentity } from './license/device'

export type TelemetryCommand = 'generate' | 'regenerate' | 'login'

function getOsName() {
  switch (process.platform) {
    case 'darwin':
      return 'macos'
    case 'win32':
      return 'windows'
    default:
      return 'linux'
  }
}

export async function sendTelemetry(
  command: TelemetryCommand,
  enabled: boolean
) {
  if (!enabled) return

  const apiBase = getApiBaseUrl()
  const device = loadDeviceIdentity()

  const payload = {
    deviceId: device.deviceId,
    command,
    cliVersion: getCliVersion(),
    os: getOsName(),
    timestamp: new Date().toISOString()
  }

  try {
    await fetch(`${apiBase}/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
  } catch {
    // Telemetry must never block execution.
  }
}
