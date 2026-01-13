import fs from 'fs'
import path from 'path'
import { generateFeature } from '../generators/angular/feature.generator'
import { generateRoutes } from '../generators/angular/routes.generator'

export async function angular(options: {
  schemasPath: string
  featuresPath: string
}) {
  /**
   * Onde estão os schemas
   * Ex: frontend/src/app/assets/generate-ui
   */
  const schemasRoot = path.resolve(process.cwd(), options.schemasPath)
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
  const featuresRoot = path.resolve(
    process.cwd(),
    options.featuresPath
  )

  fs.mkdirSync(featuresRoot, { recursive: true })

  const routes: any[] = []

  for (const file of screens) {
    const schema = JSON.parse(
      fs.readFileSync(path.join(overlaysDir, file), 'utf-8')
    )

    const route = generateFeature(schema, featuresRoot)
    routes.push(route)
  }

  generateRoutes(routes, featuresRoot)

  console.log(`✔ Angular features generated at ${featuresRoot}`)
}
