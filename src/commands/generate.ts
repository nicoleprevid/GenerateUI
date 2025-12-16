import fs from 'fs'
import path from 'path'
import { loadOpenApi } from '../openapi/load-openapi'
import { generateForm } from '../generators/form.generator'
import { syncOverlay } from '../overlay/sync-overlay'

export async function generate(options: { openapi: string }) {
  const openApiPath = path.resolve(process.cwd(), options.openapi)
  const projectRoot = path.dirname(openApiPath)

  const generateUiRoot = path.join(projectRoot, 'generate-ui')
  const generatedDir = path.join(generateUiRoot, 'generated')
  const overlaysDir = path.join(generateUiRoot, 'overlays')

  fs.mkdirSync(generatedDir, { recursive: true })
  fs.mkdirSync(overlaysDir, { recursive: true })

  const api = await loadOpenApi(openApiPath)
  const paths = api.paths ?? {}

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    for (const [method, rawOp] of Object.entries(pathItem as any)) {
      const op = rawOp as any
      if (!op?.operationId) continue

      const endpoint = {
        operationId: op.operationId,
        path: pathKey,
        method,
        ...op
      }

      const baseForm = generateForm(endpoint)
      const fileName = `${op.operationId}.form.json`

      // base (sempre regenerado)
      fs.writeFileSync(
        path.join(generatedDir, fileName),
        JSON.stringify(baseForm, null, 2)
      )

      // overlay (preserva decisões do usuário)
      const overlayPath = path.join(overlaysDir, fileName)
      const existingOverlay = fs.existsSync(overlayPath)
        ? JSON.parse(fs.readFileSync(overlayPath, 'utf-8'))
        : undefined

      const syncedOverlay = syncOverlay(baseForm, existingOverlay)

      fs.writeFileSync(
        overlayPath,
        JSON.stringify(syncedOverlay, null, 2)
      )

      console.log(`✔ Synced ${op.operationId}`)
    }
  }
}
