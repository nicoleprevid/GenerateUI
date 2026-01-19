import fs from 'fs'
import path from 'path'
import { generateFeature } from '../generators/angular/feature.generator'
import { generateRoutes } from '../generators/angular/routes.generator'
import { trackCommand } from '../telemetry'
import { loadUserConfig } from '../runtime/user-config'

export async function angular(options: {
  schemasPath?: string
  featuresPath?: string
  telemetryEnabled: boolean
}) {
  void trackCommand('angular', options.telemetryEnabled)

  const featuresRoot = resolveFeaturesRoot(options.featuresPath)
  const schemasRoot = resolveSchemasRoot(
    options.schemasPath,
    featuresRoot
  )

  /**
   * Onde estão os schemas
   * Ex: generate-ui
   */
  const overlaysDir = path.join(schemasRoot, 'overlays')

  if (!fs.existsSync(overlaysDir)) {
    throw new Error(`Overlays directory not found: ${overlaysDir}`)
  }

  const screens = fs
    .readdirSync(overlaysDir)
    .filter(f => f.endsWith('.screen.json'))

  /**
   * Onde gerar as features Angular
   */
  fs.mkdirSync(featuresRoot, { recursive: true })

  const routes: any[] = []

  for (const file of screens) {
    const schema = JSON.parse(
      fs.readFileSync(path.join(overlaysDir, file), 'utf-8')
    )

    const route = generateFeature(schema, featuresRoot, schemasRoot)
    routes.push(route)
  }

  generateRoutes(routes, featuresRoot, schemasRoot)

  console.log(`✔ Angular features generated at ${featuresRoot}`)
}

function resolveSchemasRoot(
  value: string | undefined,
  featuresRoot: string
) {
  if (value) {
    return path.resolve(process.cwd(), value)
  }

  const config = loadUserConfig()
  if (config?.lastSchemasPath) {
    const resolved = path.resolve(config.lastSchemasPath)
    if (fs.existsSync(path.join(resolved, 'overlays'))) {
      return resolved
    }
  }

  const inferred = inferSchemasRootFromFeatures(featuresRoot)
  if (inferred) return inferred

  return resolveDefaultSchemasRoot()
}

function resolveFeaturesRoot(value?: string) {
  if (value) {
    const resolved = path.resolve(process.cwd(), value)
    const isSrcApp =
      path.basename(resolved) === 'app' &&
      path.basename(path.dirname(resolved)) === 'src'
    if (isSrcApp) {
      return path.join(resolved, 'features')
    }
    return resolved
  }

  const srcAppRoot = path.resolve(process.cwd(), 'src', 'app')
  if (!fs.existsSync(srcAppRoot)) {
    throw new Error(
      'Default features path not found: ./src/app. Provide --features /path/to/src/app (or /path/to/src/app/features)'
    )
  }

  return path.join(srcAppRoot, 'features')
}

function inferSchemasRootFromFeatures(featuresRoot: string) {
  const candidate = path.resolve(
    featuresRoot,
    '../../..',
    'generate-ui'
  )
  if (fs.existsSync(path.join(candidate, 'overlays'))) {
    return candidate
  }
  return null
}

function resolveDefaultSchemasRoot() {
  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, 'src'))) {
    return path.join(cwd, 'src', 'generate-ui')
  }
  if (fs.existsSync(path.join(cwd, 'frontend', 'src'))) {
    return path.join(cwd, 'frontend', 'src', 'generate-ui')
  }
  return path.join(cwd, 'generate-ui')
}
