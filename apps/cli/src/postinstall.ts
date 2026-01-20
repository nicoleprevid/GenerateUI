import pkg from '../package.json'

const TELEMETRY_URL =
  process.env.GENERATEUI_TELEMETRY_URL?.trim() ||
  'https://generateuibackend-production.up.railway.app/events'

async function sendInstallEvent() {
  if (typeof fetch !== 'function') return

  const payload = {
    event: 'cli_installed',
    cliVersion: pkg.version || '0.0.0',
    npmUserAgent: process.env.npm_config_user_agent || ''
  }

  try {
    await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } catch {
    // Postinstall must never block installation.
  }
}

void sendInstallEvent()
