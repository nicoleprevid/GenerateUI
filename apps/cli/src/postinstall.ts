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

console.log('')
console.log('👋 GenerateUI CLI installed')
console.log('  Quick start:')
console.log('  1) generate-ui generate --openapi /path/to/openapi.yaml')
console.log('  2) generate-ui angular --schemas /path/to/generate-ui --features /path/to/app/src/app/features')
console.log('  Tip: customize screens in generate-ui/overlays and menu in generate-ui/menu.overrides.json')
console.log('')
