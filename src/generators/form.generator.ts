export interface GeneratedField {
  name: string
  type: string
  required: boolean
  label: string | null
  placeholder: string | null
  ui: string | null
  validations: any[]
}

function mapSchema(schema: any): GeneratedField[] {
  if (!schema || !schema.properties) return []

  return Object.entries(schema.properties).map(([name, prop]: any) => ({
    name,
    type: prop.type ?? 'string',
    required: schema.required?.includes(name) ?? false,
    label: null,
    placeholder: null,
    ui: prop.type === 'array' ? 'tags' : null,
    validations: []
  }))
}

/**
 * REGRA CRÍTICA:
 * - Wrapper (ex: article, user) NÃO vira campo de formulário
 * - Se houver apenas 1 propriedade object, ela é o wrapper
 */
export function generateFields(endpoint: any): GeneratedField[] {
  const schema =
    endpoint.requestBody?.content?.['application/json']?.schema

  if (!schema || !schema.properties) return []

  const propertyNames = Object.keys(schema.properties)

  // Caso clássico: { article: { ... } } ou { user: { ... } }
  if (
    propertyNames.length === 1 &&
    schema.properties[propertyNames[0]]?.type === 'object'
  ) {
    const wrapper = schema.properties[propertyNames[0]]
    return mapSchema(wrapper)
  }

  // Caso normal (sem wrapper)
  return mapSchema(schema)
}
