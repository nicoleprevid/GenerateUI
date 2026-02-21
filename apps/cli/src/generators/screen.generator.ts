import { generateFields } from './form.generator'

function inferScreen(method: string, hasInput: boolean) {
  if (method === 'get') {
    if (hasInput) {
      return { type: 'form', mode: 'filter' }
    }
    return { type: 'view', mode: 'readonly' }
  }

  if (method === 'post') {
    return { type: 'form', mode: 'create' }
  }

  if (method === 'put' || method === 'patch') {
    return { type: 'form', mode: 'edit' }
  }

  return { type: 'view', mode: 'readonly' }
}

function inferActions(method: string, hasInput: boolean) {
  if (method === 'get' && hasInput) {
    return { primary: { type: 'submit', label: 'Search' } }
  }

  if (method === 'post') {
    return { primary: { type: 'submit', label: 'Create' } }
  }

  if (method === 'put' || method === 'patch') {
    return { primary: { type: 'submit', label: 'Save' } }
  }

  return {}
}

function inferSubmitWrap(endpoint: any): string | null {
  const schema =
    endpoint.requestBody?.content?.['application/json']?.schema

  if (!schema?.properties) return null

  const keys = Object.keys(schema.properties)
  if (keys.length === 1) return keys[0]

  return null
}

export function generateScreen(endpoint: any, api?: any) {
  const fields = generateFields(endpoint, api)
  const method = endpoint.method.toLowerCase()
  const baseUrl = api?.servers?.[0]?.url
  const queryParams = extractQueryParams(endpoint, api)
  const pathParams = extractPathParams(endpoint.path, api)
  const hasInput =
    fields.length > 0 ||
    queryParams.length > 0 ||
    pathParams.length > 0

  const openapiVersion =
    api?.info?.version || 'unknown'

  const screenMeta = buildMeta(
    endpoint.operationId,
    'api',
    openapiVersion
  )

  const columnKeys =
    method === 'get'
      ? inferResponseColumns(endpoint)
      : []
  const responseFormat = inferResponseFormat(endpoint)
  const columns = columnKeys.map(key => ({
    key,
    label: toLabel(key),
    visible: true
  }))

  return {
    meta: screenMeta,
    entity: endpoint.summary
      ? String(endpoint.summary).trim()
      : endpoint.operationId.replace(/^(Create|Update|Get)/, ''),
    screen: inferScreen(method, hasInput),
    description: endpoint.description ?? null,
    api: {
      operationId: endpoint.operationId,
      endpoint: endpoint.path,
      method,
      baseUrl,
      pathParams,
      queryParams,
      submit: inferSubmitWrap(endpoint)
        ? { wrap: inferSubmitWrap(endpoint) }
        : undefined
    },
    layout: { type: 'single' },
    fields: decorateFields(fields, 'body', openapiVersion),
    actions: inferActions(method, hasInput),
    response: responseFormat
      ? { format: responseFormat }
      : undefined,
    data: {
      table: {
        columns
      }
    }
  }
}

function inferResponseColumns(endpoint: any) {
  const schema = getPrimaryResponseSchema(endpoint)
  if (!schema) return []
  return inferColumnsFromSchema(schema)
}

function inferResponseFormat(endpoint: any): 'table' | null {
  const schema = getPrimaryResponseSchema(endpoint)
  if (!schema) return null
  if (!hasResponseData(schema)) return null
  return 'table'
}

function getPrimaryResponseSchema(endpoint: any) {
  const responses = endpoint?.responses ?? {}
  const candidate =
    responses['200'] ||
    responses['201'] ||
    responses.default ||
    Object.values(responses)[0]
  return candidate?.content?.['application/json']?.schema ?? null
}

function hasResponseData(schema: any): boolean {
  if (!schema) return false
  if (Array.isArray(schema.allOf)) {
    return schema.allOf.some((entry: any) =>
      hasResponseData(entry)
    )
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.some((entry: any) =>
      hasResponseData(entry)
    )
  }
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.some((entry: any) =>
      hasResponseData(entry)
    )
  }
  if (schema.type === 'array') return true
  if (
    schema.type === 'object' &&
    (schema.properties || schema.additionalProperties)
  ) {
    return true
  }
  return inferColumnsFromSchema(schema).length > 0
}

function inferColumnsFromSchema(schema: any): string[] {
  if (!schema) return []

  if (Array.isArray(schema.allOf)) {
    for (const entry of schema.allOf) {
      const columns = inferColumnsFromSchema(entry)
      if (columns.length) return columns
    }
  }

  if (schema.type === 'array') {
    return inferColumnsFromSchema(schema.items)
  }

  if (schema.type === 'object' && schema.properties) {
    const commonKeys = [
      'data',
      'items',
      'results',
      'list',
      'records',
      'products'
    ]
    for (const key of commonKeys) {
      const nested = schema.properties[key]
      const columns = inferColumnsFromSchema(nested)
      if (columns.length) return columns
    }

    return Object.keys(schema.properties)
  }

  return []
}

function extractQueryParams(endpoint: any, api?: any) {
  const params = endpoint?.parameters ?? []
  return params
    .filter((param: any) => param?.in === 'query')
    .map((param: any) => ({
      name: param.name,
      type: param.schema?.type ?? 'string',
      required: Boolean(param.required),
      label: toLabel(param.name),
      placeholder: param.schema?.example ?? null,
      options: param.schema?.enum ?? null,
      defaultValue: param.schema?.default ?? null,
      hint: param.description ?? null,
      meta: buildMeta(
        `query:${param.name}`,
        'api',
        api?.info?.version || 'unknown'
      )
    }))
}

function extractPathParams(path: string, api?: any) {
  const params = []
  const regex = /{([^}]+)}/g
  let match = regex.exec(path)
  while (match) {
    params.push(match[1])
    match = regex.exec(path)
  }
  return params.map(name => ({
    name,
    type: 'string',
    required: true,
    label: toLabel(name),
    placeholder: toLabel(name),
    options: null,
    defaultValue: null,
    hint: null,
    meta: buildMeta(
      `path:${name}`,
      'api',
      api?.info?.version || 'unknown'
    )
  }))
}

function toLabel(value: string) {
  return stripDiacritics(String(value))
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function stripDiacritics(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function buildMeta(
  id: string,
  source: 'api' | 'user',
  openapiVersion: string
) {
  return {
    id,
    source,
    lastChangedBy: source,
    introducedBy: source,
    openapiVersion,
    autoAdded: false,
    userRemoved: false
  }
}

function decorateFields(
  fields: any[],
  scope: 'body' | 'query' | 'path',
  openapiVersion: string
) {
  return fields.map(field => ({
    ...field,
    meta: field.meta || buildMeta(`${scope}:${field.name}`, 'api', openapiVersion)
  }))
}
