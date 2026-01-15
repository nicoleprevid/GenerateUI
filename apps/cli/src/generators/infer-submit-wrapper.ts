export function inferSubmitWrapper(endpoint: any): string | null {
  const schema =
    endpoint.requestBody?.content?.['application/json']?.schema

  if (!schema?.properties) return null

  const keys = Object.keys(schema.properties)

  if (
    keys.length === 1 &&
    schema.properties[keys[0]]?.type === 'object'
  ) {
    return keys[0]
  }

  return null
}
