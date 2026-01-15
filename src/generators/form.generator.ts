export interface GeneratedField {
  name: string
  type: string
  required: boolean
  label: string | null
  placeholder: string | null
  ui: string | null
  options?: any[] | null
  defaultValue?: any | null
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
    options: prop.enum ?? null,
    defaultValue: prop.default ?? null,
    validations: []
  }))
}

/**
 * REGRA CRÍTICA:
 * - Wrapper (ex: article, user) NÃO vira campo de formulário
 * - Se houver apenas 1 propriedade object, ela é o wrapper
 */
export function generateFields(endpoint: any, api?: any): GeneratedField[] {
  const schema =
    endpoint.requestBody?.content?.['application/json']?.schema

  const unwrapped = unwrapSchema(schema)
  const baseSchema = unwrapped ?? schema

  if (!baseSchema || !baseSchema.properties) return []

  const method = String(endpoint.method || '').toLowerCase()
  const entity = String(endpoint.operationId || '').replace(
    /^(Create|Update|Get|Delete)/,
    ''
  )

  let finalSchema = baseSchema

  if (method === 'post' && entity && api?.components?.schemas) {
    const schemas = api.components.schemas
    const newSchema =
      unwrapSchema(schemas[`New${entity}`]) ??
      schemas[`New${entity}`]
    const updateSchema =
      unwrapSchema(schemas[`Update${entity}`]) ?? schemas[`Update${entity}`]

    if (newSchema && updateSchema) {
      finalSchema = mergeSchemas(newSchema, updateSchema)
    } else if (newSchema) {
      finalSchema = newSchema
    }
  }

  return mapSchema(finalSchema)
}

function unwrapSchema(schema: any) {
  if (!schema || !schema.properties) return null

  const propertyNames = Object.keys(schema.properties)

  if (
    propertyNames.length === 1 &&
    schema.properties[propertyNames[0]]?.type === 'object'
  ) {
    return schema.properties[propertyNames[0]]
  }

  return null
}

function mergeSchemas(primary: any, secondary: any) {
  const merged = {
    type: 'object',
    properties: {
      ...(primary?.properties ?? {}),
      ...(secondary?.properties ?? {})
    },
    required: Array.from(
      new Set([
        ...(primary?.required ?? []),
        ...(secondary?.required ?? [])
      ])
    )
  }

  return merged
}
