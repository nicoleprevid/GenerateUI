import { generateFields } from './form.generator'

function inferScreen(method: string) {
  if (method === 'get') {
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

function inferActions(method: string) {
  if (method === 'post') {
    return { primary: { type: 'submit', label: 'Criar' } }
  }

  if (method === 'put' || method === 'patch') {
    return { primary: { type: 'submit', label: 'Salvar' } }
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

export function generateScreen(endpoint: any) {
  const fields = generateFields(endpoint)
  const method = endpoint.method.toLowerCase()

  return {
    entity: endpoint.operationId.replace(/^(Create|Update|Get)/, ''),
    screen: inferScreen(method),
    api: {
      operationId: endpoint.operationId,
      endpoint: endpoint.path,
      method,
      submit: inferSubmitWrap(endpoint)
        ? { wrap: inferSubmitWrap(endpoint) }
        : undefined
    },
    layout: { type: 'single' },
    fields,
    actions: inferActions(method),
    data: {}
  }
}
