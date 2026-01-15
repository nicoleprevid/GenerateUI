import fs from 'fs'
import path from 'path'
import { loadOpenApi } from '../openapi/load-openapi'
import { generateScreen } from '../generators/screen.generator'
import { mergeScreen } from '../generators/screen.merge'

interface GeneratedRoute {
  path: string
  operationId: string
}

export async function generate(options: { openapi: string; debug?: boolean }) {
  /**
   * Caminho absoluto do OpenAPI (YAML)
   * Ex: /Users/.../generateui-playground/realWorldOpenApi.yaml
   */
  const openApiPath = path.resolve(process.cwd(), options.openapi)

  /**
   * Raiz do playground (onde está o YAML)
   */
  const projectRoot = path.dirname(openApiPath)

  /**
   * Onde o Angular consome os arquivos
   */
  const generateUiRoot = path.join(
    projectRoot,
    'frontend',
    'src',
    'app',
    'assets',
    'generate-ui'
  )

  const generatedDir = path.join(generateUiRoot, 'generated')
  const overlaysDir = path.join(generateUiRoot, 'overlays')

  fs.mkdirSync(generatedDir, { recursive: true })
  fs.mkdirSync(overlaysDir, { recursive: true })

  /**
   * Lista de rotas geradas automaticamente
   */
  const routes: GeneratedRoute[] = []
  const usedOperationIds = new Set<string>()

  /**
   * Parse do OpenAPI (já com $refs resolvidos)
   */
  const api = await loadOpenApi(openApiPath)
  const paths = api.paths ?? {}

  /**
   * Itera por todos os endpoints
   */
  const operationIds = new Set<string>()

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    for (const [method, rawOp] of Object.entries(pathItem as any)) {
      const op = rawOp as any
      if (!op) continue

      const operationId =
        op.operationId ||
        buildOperationId(
          method.toLowerCase(),
          pathKey,
          usedOperationIds
        )
      operationIds.add(operationId)

      const endpoint = {
        operationId,
        path: pathKey,
        method: method.toLowerCase(),
        parameters: mergeParameters(
          (pathItem as any)?.parameters,
          op?.parameters
        ),
        ...op
      }

      /**
       * Gera o ScreenSchema completo
       */
      const screenSchema = generateScreen(endpoint, api)
      const fileName = `${operationId}.screen.json`

      /**
       * 1️⃣ generated → SEMPRE sobrescrito (base técnica)
       */
      const generatedPath = path.join(generatedDir, fileName)
      const previousGenerated = fs.existsSync(generatedPath)
        ? JSON.parse(fs.readFileSync(generatedPath, 'utf-8'))
        : null
      fs.writeFileSync(
        generatedPath,
        JSON.stringify(screenSchema, null, 2)
      )

      /**
       * 2️⃣ overlays → merge semântico (preserva decisões do usuário)
       */
      const overlayPath = path.join(overlaysDir, fileName)
      const overlay = fs.existsSync(overlayPath)
        ? JSON.parse(fs.readFileSync(overlayPath, 'utf-8'))
        : null

      const merged = mergeScreen(
        screenSchema,
        overlay,
        previousGenerated,
        {
          openapiVersion: api?.info?.version || 'unknown',
          debug: options.debug
        }
      )

      fs.writeFileSync(
        overlayPath,
        JSON.stringify(merged.screen, null, 2)
      )

      if (options.debug && merged.debug.length) {
        console.log(`ℹ Merge ${operationId}`)
        for (const line of merged.debug) {
          console.log(`  - ${line}`)
        }
      }

      /**
       * 3️⃣ rota automática
       * URL = operationId (MVP)
       */
      routes.push({
        path: operationId,
        operationId
      })

      console.log(`✔ Generated ${operationId}`)
    }
  }

  /**
   * 4️⃣ Gera arquivo de rotas
   */
  const routesPath = path.join(generateUiRoot, 'routes.json')
  fs.writeFileSync(
    routesPath,
    JSON.stringify(routes, null, 2)
  )

  /**
   * 5️⃣ Remove overlays órfãos (endpoint removido)
   */
  const overlayFiles = fs
    .readdirSync(overlaysDir)
    .filter(file => file.endsWith('.screen.json'))

  for (const file of overlayFiles) {
    const opId = file.replace(/\.screen\.json$/, '')
    if (!operationIds.has(opId)) {
      fs.rmSync(path.join(overlaysDir, file))
      if (options.debug) {
        console.log(`✖ Removed overlay ${opId}`)
      }
    }
  }

  console.log('✔ Routes generated')
}

function mergeParameters(
  pathParams: any[] | undefined,
  opParams: any[] | undefined
) {
  const all = [...(pathParams ?? []), ...(opParams ?? [])]
  const seen = new Set<string>()
  const merged: any[] = []

  for (const param of all) {
    const key = `${param?.in ?? ''}:${param?.name ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(param)
  }

  return merged
}

function buildOperationId(
  method: string,
  pathKey: string,
  usedOperationIds: Set<string>
) {
  const verb = method.toLowerCase()
  const prefix = httpVerbToPrefix(verb)
  const parts = pathKey
    .split('/')
    .filter(Boolean)
    .map(segment => {
      if (segment.startsWith('{') && segment.endsWith('}')) {
        const name = segment.slice(1, -1)
        return `By${capitalize(name)}`
      }
      return capitalize(segment)
    })

  let base = `${prefix}${parts.join('')}`
  if (!base) base = `${prefix}Endpoint`

  let candidate = base
  let index = 2
  while (usedOperationIds.has(candidate)) {
    candidate = `${base}${index}`
    index += 1
  }

  usedOperationIds.add(candidate)
  return candidate
}

function httpVerbToPrefix(verb: string) {
  switch (verb) {
    case 'get':
      return 'Get'
    case 'post':
      return 'Create'
    case 'put':
      return 'Update'
    case 'patch':
      return 'Patch'
    case 'delete':
      return 'Delete'
    default:
      return 'Call'
  }
}

function capitalize(value: string) {
  if (!value) return value
  return value[0].toUpperCase() + value.slice(1)
}
