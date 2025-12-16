function mapSchema(schema: any) {
  if (!schema || !schema.properties) return []

  return Object.entries(schema.properties).map(([name, prop]: any) => {
    const baseField: any = {
      name,
      type: prop.type,
      required: schema.required?.includes(name) ?? false,

      // configuráveis pelo usuário (overlay)
      label: null,
      placeholder: null,
      ui: null,
      validations: []
    }

    // se for objeto, mapeia filhos recursivamente
    if (prop.type === 'object' && prop.properties) {
      baseField.children = mapSchema(prop)
    }

    return baseField
  })
}

export function generateForm(endpoint: any) {
  const schema =
    endpoint.requestBody?.content?.['application/json']?.schema

  return {
    operationId: endpoint.operationId,
    endpoint: endpoint.path,
    method: endpoint.method,
    fields: schema ? mapSchema(schema) : []
  }
}
