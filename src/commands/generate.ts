import fs from 'fs'
import path from 'path'
import { loadOpenApi } from '../openapi/load-openapi'
import { generateScreen } from '../generators/screen.generator'

interface GeneratedRoute {
  path: string
  operationId: string
}

export async function generate(options: { openapi: string }) {
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

  /**
   * Parse do OpenAPI (já com $refs resolvidos)
   */
  const api = await loadOpenApi(openApiPath)
  const paths = api.paths ?? {}

  /**
   * Itera por todos os endpoints
   */
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    for (const [method, rawOp] of Object.entries(pathItem as any)) {
      const op = rawOp as any
      if (!op?.operationId) continue

      const endpoint = {
        operationId: op.operationId,
        path: pathKey,
        method: method.toLowerCase(),
        ...op
      }

      /**
       * Gera o ScreenSchema completo
       */
      const screenSchema = generateScreen(endpoint, api)
      const fileName = `${op.operationId}.screen.json`

      /**
       * 1️⃣ generated → SEMPRE sobrescrito (base técnica)
       */
      const generatedPath = path.join(generatedDir, fileName)
      fs.writeFileSync(
        generatedPath,
        JSON.stringify(screenSchema, null, 2)
      )

      /**
       * 2️⃣ overlays → só cria se NÃO existir (decisão humana)
       */
      const overlayPath = path.join(overlaysDir, fileName)
      if (!fs.existsSync(overlayPath)) {
        fs.writeFileSync(
          overlayPath,
          JSON.stringify(screenSchema, null, 2)
        )
      }

      /**
       * 3️⃣ rota automática
       * URL = operationId (MVP)
       */
      routes.push({
        path: op.operationId,
        operationId: op.operationId
      })

      console.log(`✔ Generated ${op.operationId}`)
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

  console.log('✔ Routes generated')
}
