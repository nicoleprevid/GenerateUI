import pkg from '../../package.json'

export function getCliVersion() {
  return pkg.version || '0.0.0'
}

export function getApiBaseUrl() {
  return (
    process.env.GENERATEUI_API_BASE_URL?.trim() ||
    'https://generateuibackend-production.up.railway.app'
  )
}

export function getWebAuthUrl() {
  return (
    process.env.GENERATEUI_WEB_AUTH_URL?.trim() ||
    'https://generateuibackend-production.up.railway.app'
  )
}
