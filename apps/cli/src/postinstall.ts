import fs from 'fs'
import path from 'path'
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

function seedProjectConfig() {
  const isGlobalInstall = String(process.env.npm_config_global || '') === 'true'
  if (isGlobalInstall) return

  const initCwd = process.env.INIT_CWD
  if (!initCwd) return

  const projectRoot = path.resolve(initCwd)
  const packageJsonPath = path.join(projectRoot, 'package.json')
  const srcAppPath = path.join(projectRoot, 'src', 'app')
  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(srcAppPath)) return

  const configPath = path.join(projectRoot, 'generateui-config.json')
  if (fs.existsSync(configPath)) return

  const openApiCandidates = ['openapi.yaml', 'openapi.yml', 'openapi.json']
  const openapi =
    openApiCandidates.find(file =>
      fs.existsSync(path.join(projectRoot, file))
    ) || 'openapi.yaml'

  const config = {
    openapi,
    schemas: 'src/generate-ui',
    features: 'src/app/features',
    appTitle: 'Store',
    defaultRoute: '',
    menu: {
      autoInject: true
    },
    views: {
      ProductsAdmin: 'cards'
    }
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    console.log(`  Created ${path.basename(configPath)} in project root`)
  } catch {
    // Postinstall must never block installation.
  }
}

void sendInstallEvent()
seedProjectConfig()

console.log('')
console.log('👋 GenerateUI CLI installed')
console.log('  Quick start:')
console.log('  1) generate-ui generate')
console.log('  2) generate-ui angular')
console.log('  Tip: customize screens in generate-ui/overlays and menu in generate-ui/menu.overrides.json')
console.log('')
