import fs from 'fs'
import path from 'path'
import { generateFeature } from '../generators/angular/feature.generator'
import { generateAdminFeature } from '../generators/angular/feature.generator'
import { generateRoutes } from '../generators/angular/routes.generator'
import { generateMenu } from '../generators/angular/menu.generator'
import { trackCommand } from '../telemetry'
import { loadUserConfig } from '../runtime/user-config'
import { getPermissions } from '../license/permissions'
import { logDebug, logStep, logTip } from '../runtime/logger'

export async function angular(options: {
  schemasPath?: string
  featuresPath?: string
  telemetryEnabled: boolean
}) {
  void trackCommand('angular', options.telemetryEnabled)

  let intelligentEnabled = false
  try {
    const permissions = await getPermissions()
    intelligentEnabled = Boolean(
      permissions.features.intelligentGeneration
    )
  } catch {
    intelligentEnabled = false
  }

  const featuresRoot = resolveFeaturesRoot(options.featuresPath)
  const generatedFeaturesRoot = path.join(featuresRoot, 'generated')
  const overridesFeaturesRoot = path.join(featuresRoot, 'overrides')
  const schemasRoot = resolveSchemasRoot(
    options.schemasPath,
    featuresRoot
  )
  logStep(`Features output: ${featuresRoot}`)
  logDebug(`Generated features: ${generatedFeaturesRoot}`)
  logDebug(`Overrides: ${overridesFeaturesRoot}`)
  logStep(`Schemas input: ${schemasRoot}`)

  /**
   * Onde estão os schemas
   * Ex: generate-ui
   */
  if (options.schemasPath && !fs.existsSync(schemasRoot)) {
    fs.mkdirSync(schemasRoot, { recursive: true })
    console.log(`ℹ Created generate-ui folder at ${schemasRoot}`)
  }

  const overlaysDir = path.join(schemasRoot, 'overlays')

  if (!fs.existsSync(overlaysDir)) {
    const example = [
      'generate-ui angular \\',
      '  --schemas /path/to/generate-ui \\',
      '  --features /path/to/src/app/features'
    ].join('\n')
    throw new Error(
      `Overlays directory not found: ${overlaysDir}\n` +
        'Run `generate-ui generate --openapi <path> --output <schemas>` first to create overlays.\n' +
        `Example:\n${example}`
    )
  }
  logDebug(`Overlays dir: ${overlaysDir}`)

  const screens = fs
    .readdirSync(overlaysDir)
    .filter(f => f.endsWith('.screen.json'))
  logDebug(`Screens found: ${screens.length}`)

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
  fs.mkdirSync(generatedFeaturesRoot, { recursive: true })
  fs.mkdirSync(overridesFeaturesRoot, { recursive: true })

  const routes: any[] = []
  const schemas: Array<{ file: string; schema: any }> = []
  const appRoot = path.resolve(featuresRoot, '..')
  const configInfo = findConfig(appRoot)
  const views = configInfo.config?.views ?? {}

  for (const file of screens) {
    const schema = JSON.parse(
      fs.readFileSync(path.join(overlaysDir, file), 'utf-8')
    )
    schemas.push({ file, schema })
  }

  const schemaByOpId = new Map<string, any>()
  for (const { schema } of schemas) {
    const opId = schema?.api?.operationId
    if (opId) schemaByOpId.set(opId, schema)
  }

  for (const { schema } of schemas) {
    const opId = schema?.api?.operationId
    const view = opId ? views[opId] : undefined
    if (view) {
      schema.meta = {
        ...(schema.meta ?? {}),
        view
      }
    }
    if (schema?.meta?.intelligent?.kind === 'adminList') {
      if (!intelligentEnabled) {
        logTip(
          'Intelligent generation is disabled. Login required to generate admin list screens.'
        )
        continue
      }
      const adminRoute = generateAdminFeature(
        schema,
        schemaByOpId,
        featuresRoot,
        generatedFeaturesRoot,
        schemasRoot
      )
      routes.push(adminRoute)
      continue
    }

    const route = generateFeature(
      schema,
      featuresRoot,
      generatedFeaturesRoot,
      schemasRoot
    )
    routes.push(route)
  }

  migrateLegacyFeatures(
    routes,
    featuresRoot,
    generatedFeaturesRoot,
    overridesFeaturesRoot
  )
  syncOverrides(routes, generatedFeaturesRoot, overridesFeaturesRoot)

  generateRoutes(
    routes,
    generatedFeaturesRoot,
    overridesFeaturesRoot,
    schemasRoot
  )
  generateMenu(schemasRoot)
  applyAppLayout(featuresRoot, schemasRoot)

  console.log(`✔ Angular features generated at ${featuresRoot}`)
  const overrides = findOverrides(
    routes,
    overridesFeaturesRoot,
    generatedFeaturesRoot
  )
  if (overrides.length) {
    console.log('')
    console.log('ℹ Overrides detected:')
    for (const override of overrides) {
      console.log(
        `  - ${override.component}: run "generate-ui merge --feature ${override.component.replace(/Component$/, '')}"`
      )
    }
    console.log('')
  }
  logTip('Run with --dev to see detailed logs and file paths.')
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
  views?: Record<string, string>
}

function findOverrides(
  routes: Array<{ folder: string; fileBase: string; component: string }>,
  overridesRoot: string,
  generatedRoot: string
) {
  const results: Array<{
    component: string
    generatedPath: string
    overridePath: string
  }> = []
  for (const route of routes) {
    const overridePath = path.join(
      overridesRoot,
      route.folder,
      `${route.fileBase}.component.ts`
    )
    if (fs.existsSync(overridePath)) {
      results.push({
        component: route.component,
        generatedPath: path.join(
          generatedRoot,
          route.folder,
          `${route.fileBase}.component.ts`
        ),
        overridePath
      })
    }
  }
  return results
}

function syncOverrides(
  routes: Array<{ folder: string }>,
  generatedRoot: string,
  overridesRoot: string
) {
  for (const route of routes) {
    const sourceDir = path.join(generatedRoot, route.folder)
    const targetDir = path.join(overridesRoot, route.folder)
    if (!fs.existsSync(sourceDir)) continue
    if (fs.existsSync(targetDir)) continue
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })
    fs.cpSync(sourceDir, targetDir, { recursive: true })
  }
}

function migrateLegacyFeatures(
  routes: Array<{ folder: string }>,
  featuresRoot: string,
  generatedRoot: string,
  overridesRoot: string
) {
  let migrated = false
  for (const route of routes) {
    const legacyDir = path.join(featuresRoot, route.folder)
    const generatedDir = path.join(generatedRoot, route.folder)
    const overrideDir = path.join(overridesRoot, route.folder)
    if (!fs.existsSync(legacyDir)) continue
    if (fs.existsSync(generatedDir) || fs.existsSync(overrideDir)) {
      continue
    }
    fs.mkdirSync(path.dirname(generatedDir), { recursive: true })
    fs.cpSync(legacyDir, generatedDir, { recursive: true })
    fs.cpSync(legacyDir, overrideDir, { recursive: true })
    migrated = true
  }
  if (migrated) {
    console.log('ℹ Legacy feature folders detected. Seeded generated/overrides.')
  }
}

function applyAppLayout(featuresRoot: string, schemasRoot: string) {
  const appRoot = path.resolve(featuresRoot, '..')
  const configInfo = findConfig(appRoot)
  const config = configInfo.config
  if (configInfo.configPath) {
    logDebug(`Config path: ${configInfo.configPath}`)
  }
  if (config) {
    const resolvedTitle = config.appTitle ?? 'Generate UI'
    const resolvedRoute = config.defaultRoute ?? '(not set)'
    const resolvedInject = config.menu?.autoInject !== false
    console.log('✅ GenerateUI config detected')
    console.log('')
    console.log(`  🏷️  appTitle: "${resolvedTitle}"`)
    console.log(`  ➡️  defaultRoute: ${resolvedRoute}`)
    console.log(`  🧭 menu.autoInject: ${resolvedInject}`)
    console.log('  🧩 menu overrides: edit generate-ui/menu.overrides.json to customize labels, groups, and order')
    console.log('     (this file is created once and never overwritten)')
    console.log('')
  } else {
    console.log('ℹ️  No generateui-config.json found. Using defaults.')
    console.log('')
    console.log('  ✨ To customize, add generateui-config.json at your project root.')
    console.log('  🧩 To customize the menu, edit generate-ui/menu.overrides.json (created on first generate).')
    console.log('')
  }

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
  let configPath: string | null = null
  const root = path.parse(dir).root

  while (true) {
    const candidate = path.join(dir, 'generateui-config.json')
    if (!config && fs.existsSync(candidate)) {
      try {
        config = JSON.parse(fs.readFileSync(candidate, 'utf-8'))
        configPath = candidate
      } catch {
        config = null
      }
    }

    if (dir === root) break
    dir = path.dirname(dir)
  }

  return { config, configPath }
}

function injectDefaultRoute(appRoot: string, value: string) {
  const routesPath = path.join(appRoot, 'app.routes.ts')
  if (!fs.existsSync(routesPath)) {
    logDebug(`Skip defaultRoute: ${routesPath} not found`)
    return
  }

  let content = fs.readFileSync(routesPath, 'utf-8')
  const route = normalizeRoutePath(value)
  const insertion = `  { path: '', pathMatch: 'full', redirectTo: '${route}' },\n`

  if (!content.trim().length) {
    const template = `import { Routes } from '@angular/router'\nimport { generatedRoutes } from '../generate-ui/routes.gen'\n\nexport const routes: Routes = [\n${insertion}  ...generatedRoutes\n]\n`
    fs.writeFileSync(routesPath, template)
    logDebug(`Default route injected (created): ${routesPath}`)
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

  if (
    content.includes('generatedRoutes') &&
    !content.match(
      /import\s+\{\s*generatedRoutes\s*\}\s+from\s+['"].*generate-ui\/routes\.gen['"]/
    )
  ) {
    content =
      `import { generatedRoutes } from '../generate-ui/routes.gen'\n` +
      content
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
  logDebug(`Default route injected (updated): ${routesPath}`)
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
    logDebug('Skip menu injection: app.html/app.css/app.ts not found')
    return
  }

  const htmlRaw = fs.readFileSync(appHtmlPath, 'utf-8')
  if (htmlRaw.includes('<ui-menu')) {
    let updatedHtml = htmlRaw
    updatedHtml = updatedHtml.replace(
      /<ui-menu(?![^>]*\[\s*title\s*\])[\\s>]/,
      '<ui-menu [title]="appTitle()">'
    )
    if (updatedHtml !== htmlRaw) {
      fs.writeFileSync(appHtmlPath, updatedHtml)
      logDebug(`Updated ui-menu title binding: ${appHtmlPath}`)
    }
  } else {
    const normalized = htmlRaw.replace(/\s+/g, '')
    const isDefaultOutlet =
      normalized === '<router-outlet></router-outlet>' ||
      normalized === '<router-outlet/>' ||
      normalized === '<router-outlet/>'

    if (!isDefaultOutlet) return

    const newHtml = `<div class="app-shell">\n  <ui-menu [title]="appTitle()"></ui-menu>\n  <main class="app-content">\n    <router-outlet></router-outlet>\n  </main>\n</div>\n`
    fs.writeFileSync(appHtmlPath, newHtml)
    logDebug(`Injected menu layout into: ${appHtmlPath}`)
  }

  const cssRaw = fs.readFileSync(appCssPath, 'utf-8')
  if (!cssRaw.includes('.app-shell')) {
    const shellCss = `:host {\n  display: block;\n  min-height: 100vh;\n  color: #0f172a;\n  background:\n    radial-gradient(circle at top left, rgba(14, 116, 144, 0.14), transparent 55%),\n    radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.12), transparent 50%),\n    linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);\n}\n\n.app-shell {\n  display: grid;\n  grid-template-columns: 260px 1fr;\n  gap: 24px;\n  padding: 24px;\n  align-items: start;\n}\n\n.app-content {\n  min-width: 0;\n}\n\n@media (max-width: 900px) {\n  .app-shell {\n    grid-template-columns: 1fr;\n  }\n}\n`
    fs.writeFileSync(
      appCssPath,
      cssRaw.trim().length ? `${cssRaw.trim()}\n\n${shellCss}` : shellCss
    )
    logDebug(`Injected menu shell styles into: ${appCssPath}`)
  }

  let tsRaw = fs.readFileSync(appTsPath, 'utf-8')
  if (!tsRaw.includes('UiMenuComponent')) {
    tsRaw = tsRaw.replace(
      /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]@angular\/router['"];/,
      (match) =>
        `${match}\nimport { UiMenuComponent } from './ui/ui-menu/ui-menu.component';`
    )
  }

  if (tsRaw.includes('imports: [')) {
    tsRaw = tsRaw.replace(
      /imports:\s*\[/,
      match => `${match}RouterOutlet, UiMenuComponent, `
    )
    tsRaw = tsRaw.replace(/UiMenuComponent,\s*UiMenuComponent,\s*/g, 'UiMenuComponent, ')
    tsRaw = tsRaw.replace(/RouterOutlet,\s*RouterOutlet,\s*/g, 'RouterOutlet, ')
    tsRaw = tsRaw.replace(/UiMenuComponent,\s*RouterOutlet,\s*UiMenuComponent,/g, 'UiMenuComponent, ')
  }

  if (tsRaw.includes('appTitle')) {
    tsRaw = tsRaw.replace(
      /appTitle\s*=\s*signal\('([^']*)'\)/,
      `appTitle = signal('${escapeString(appTitle)}')`
    )
  } else {
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

  // Remove legacy runtime config loader if present.
  if (tsRaw.includes('loadRuntimeConfig')) {
    tsRaw = tsRaw.replace(/\\s*constructor\\(\\)\\s*\\{[\\s\\S]*?\\}\\s*/m, '\n')
    tsRaw = tsRaw.replace(/\\s*private\\s+loadRuntimeConfig\\(\\)\\s*\\{[\\s\\S]*?\\}\\s*/m, '\n')
  }

  fs.writeFileSync(appTsPath, tsRaw)
  logDebug(`Updated app title/menu imports: ${appTsPath}`)

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


function normalizeRoutePath(value: string) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return trimmed
  if (trimmed.includes('/')) return trimmed.replace(/^\//, '')
  const pascal = toPascalCase(trimmed)
  return toRouteSegment(pascal)
}

function toRouteSegment(value: string) {
  if (!value) return value
  return value[0].toLowerCase() + value.slice(1)
}

function toPascalCase(value: string) {
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('')
}
