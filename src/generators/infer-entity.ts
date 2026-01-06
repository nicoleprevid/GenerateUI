export function inferEntity(endpoint: { path: string }): string {
  const parts = endpoint.path
    .split('/')
    .filter(Boolean)
    .filter(p => !p.startsWith('{'))

  if (!parts.length) return 'Unknown'

  const raw = parts[0]

  // remove plural simples (users -> user)
  const singular = raw.endsWith('s')
    ? raw.slice(0, -1)
    : raw

  return capitalize(singular)
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
