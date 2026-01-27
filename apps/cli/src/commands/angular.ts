import fs from 'fs'
import path from 'path'
import { generateFeature } from '../generators/angular/feature.generator'
import { generateRoutes } from '../generators/angular/routes.generator'
import { generateMenu } from '../generators/angular/menu.generator'
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
    const example = [
      'generate-ui angular \\',
      '  --schemas /path/to/generate-ui \\',
      '  --features /path/to/src/app/features'
    ].join('\n')
    throw new Error(
      `Overlays directory not found: ${overlaysDir}\n` +
        'Run again with --schemas pointing to your generate-ui folder.\n' +
        `Example:\n${example}`
    )
  }

  const screens = fs
    .readdirSync(overlaysDir)
    .filter(f => f.endsWith('.screen.json'))

  if (screens.length === 0) {
    const example = [
      'generate-ui angular \\',
      '  --schemas /path/to/generate-ui \\',
      '  --features /path/to/src/app/features'
    ].join('\n')
    throw new Error(
      `No .screen.json files found in: ${overlaysDir}\n` +
        'Run again with --schemas pointing to your generate-ui folder.\n' +
        `Example:\n${example}`
    )
  }

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
  generateMenu(schemasRoot)
  applyAppLayout(featuresRoot, schemasRoot)

  console.log(`✔ Angular features generated at ${featuresRoot}`)
}

function resolveSchemasRoot(
  value: string | undefined,
  featuresRoot: string
) {
  if (value) {
    return path.resolve(process.cwd(), value)
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
  const srcCandidate = path.resolve(
    featuresRoot,
    '..',
    '..',
    'generate-ui'
  )
  if (fs.existsSync(path.join(srcCandidate, 'overlays'))) {
    return srcCandidate
  }

  const rootCandidate = path.resolve(
    featuresRoot,
    '../../..',
    'generate-ui'
  )
  if (fs.existsSync(path.join(rootCandidate, 'overlays'))) {
    return rootCandidate
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

type GenerateUiConfig = {
  appTitle?: string
  defaultRoute?: string
  menu?: {
    autoInject?: boolean
  }
}

function applyAppLayout(featuresRoot: string, schemasRoot: string) {
  const appRoot = path.resolve(featuresRoot, '..')
  const configInfo = findConfig(appRoot)
  const config = configInfo.config

  if (config?.defaultRoute) {
    injectDefaultRoute(appRoot, config.defaultRoute)
  }

  const autoInject = config?.menu?.autoInject !== false
  if (!autoInject) return

  const appTitle = config?.appTitle || 'Generate UI'
  injectMenuLayout(appRoot, appTitle, schemasRoot)
}

function findConfig(startDir: string) {
  let dir = startDir
  let config: GenerateUiConfig | null = null
  const root = path.parse(dir).root

  while (true) {
    const configPath = path.join(dir, 'generateui-config.json')
    if (!config && fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      } catch {
        config = null
      }
    }

    if (dir === root) break
    dir = path.dirname(dir)
  }

  return { config }
}

function injectDefaultRoute(appRoot: string, value: string) {
  const routesPath = path.join(appRoot, 'app.routes.ts')
  if (!fs.existsSync(routesPath)) return

  let content = fs.readFileSync(routesPath, 'utf-8')
  const route = value.replace(/^\//, '')
  const insertion = `  { path: '', pathMatch: 'full', redirectTo: '${route}' },\n`

  if (!content.trim().length) {
    const template = `import { Routes } from '@angular/router'\nimport { generatedRoutes } from '../generate-ui/routes.gen'\n\nexport const routes: Routes = [\n${insertion}  ...generatedRoutes\n]\n`
    fs.writeFileSync(routesPath, template)
    return
  }

  if (!content.match(/export const routes\s*:\s*Routes\s*=/)) {
    if (!content.match(/import\s+\{\s*Routes\s*\}\s+from\s+['"]@angular\/router['"]/)) {
      content = `import { Routes } from '@angular/router'\n${content}`
    }
    content = content.replace(
      /export const routes\s*=/,
      'export const routes: Routes ='
    )
  }

  content = content.replace(
    /export const routes\s*=\s*\[/,
    match => `${match}\n${insertion}`
  )

  const emptyRedirect = /path:\s*['"]\s*['"]\s*,\s*pathMatch:\s*['"]full['"]\s*,\s*redirectTo:\s*['"]\s*['"]/
  if (emptyRedirect.test(content)) {
    content = content.replace(
      emptyRedirect,
      `path: '', pathMatch: 'full', redirectTo: '${route}'`
    )
  }

  fs.writeFileSync(routesPath, content)
}

function injectMenuLayout(
  appRoot: string,
  appTitle: string,
  schemasRoot: string
) {
  const appHtmlPath = path.join(appRoot, 'app.html')
  const appCssPath = path.join(appRoot, 'app.css')
  const appTsPath = path.join(appRoot, 'app.ts')

  if (
    !fs.existsSync(appHtmlPath) ||
    !fs.existsSync(appCssPath) ||
    !fs.existsSync(appTsPath)
  ) {
    return
  }

  const htmlRaw = fs.readFileSync(appHtmlPath, 'utf-8')
  if (htmlRaw.includes('<ui-menu')) return

  const normalized = htmlRaw.replace(/\s+/g, '')
  const isDefaultOutlet =
    normalized === '<router-outlet></router-outlet>' ||
    normalized === '<router-outlet/>' ||
    normalized === '<router-outlet/>'

  if (!isDefaultOutlet) return

  const newHtml = `<div class="app-shell">\n  <ui-menu [title]="appTitle()"></ui-menu>\n  <main class="app-content">\n    <router-outlet></router-outlet>\n  </main>\n</div>\n`
  fs.writeFileSync(appHtmlPath, newHtml)

  const cssRaw = fs.readFileSync(appCssPath, 'utf-8')
  if (!cssRaw.includes('.app-shell')) {
    const shellCss = `:host {\n  display: block;\n  min-height: 100vh;\n  color: #0f172a;\n  background:\n    radial-gradient(circle at top left, rgba(14, 116, 144, 0.14), transparent 55%),\n    radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.12), transparent 50%),\n    linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);\n}\n\n.app-shell {\n  display: grid;\n  grid-template-columns: 260px 1fr;\n  gap: 24px;\n  padding: 24px;\n  align-items: start;\n}\n\n.app-content {\n  min-width: 0;\n}\n\n@media (max-width: 900px) {\n  .app-shell {\n    grid-template-columns: 1fr;\n  }\n}\n`
    fs.writeFileSync(
      appCssPath,
      cssRaw.trim().length ? `${cssRaw.trim()}\n\n${shellCss}` : shellCss
    )
  }

  let tsRaw = fs.readFileSync(appTsPath, 'utf-8')
  if (!tsRaw.includes('UiMenuComponent')) {
    tsRaw = tsRaw.replace(
      /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]@angular\/router['"];/,
      (match, imports) =>
        `${match}\nimport { UiMenuComponent } from './ui/ui-menu/ui-menu.component';`
    )
  }

  if (tsRaw.includes('imports: [')) {
    tsRaw = tsRaw.replace(/imports:\s*\[/, match => `${match}UiMenuComponent, `)
  }

  if (!tsRaw.includes('appTitle')) {
    if (!tsRaw.match(/import\s+\{\s*[^}]*\bsignal\b[^}]*\}\s+from\s+['"]@angular\/core['"]/)) {
      tsRaw = tsRaw.replace(
        /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]@angular\/core['"];?/,
        (match, imports) => {
          if (imports.includes('signal')) return match
          return `import { ${imports.trim()}, signal } from '@angular/core';`
        }
      )
    }
    tsRaw = tsRaw.replace(
      /export class App\s*\{\s*/,
      match =>
        `${match}\n  protected readonly appTitle = signal('${escapeString(
          appTitle
        )}');\n`
    )
  }

  fs.writeFileSync(appTsPath, tsRaw)

  const menuComponentPath = path.join(
    appRoot,
    'ui',
    'ui-menu',
    'ui-menu.component.ts'
  )
  if (fs.existsSync(menuComponentPath)) {
    // Touch to keep consistent in case it was generated before config title existed.
    void schemasRoot
  }
}

function escapeString(value: string) {
  return String(value).replace(/'/g, "\\'")
}
