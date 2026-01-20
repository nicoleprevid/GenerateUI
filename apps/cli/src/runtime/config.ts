import pkg from '../../package.json'

export function getCliVersion() {
  return pkg.version || '0.0.0'
}

export function getApiBaseUrl() {
  return (
    'https://generateuibackend-production.up.railway.app'
  )
}

export function getWebAuthUrl() {
  return (
    'https://generateuibackend-production.up.railway.app'
  )
}
