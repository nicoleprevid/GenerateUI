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
import {
  findProjectConfig,
  pickConfiguredPath,
  resolveOptionalPath,
  type GenerateUiProjectConfig
} from '../runtime/project-config'

export async function angular(options: {
  schemasPath?: string
  featuresPath?: string
  watch?: boolean
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

  const projectConfig = findProjectConfig(process.cwd())
  const configuredFeatures = pickConfiguredPath(
    projectConfig.config,
    'features'
  )
  const configuredSchemas =
    pickConfiguredPath(projectConfig.config, 'schemas') ??
    pickConfiguredPath(projectConfig.config, 'output')

  const featuresRoot = resolveFeaturesRoot(
    options.featuresPath,
    configuredFeatures,
    projectConfig.configPath
  )
  const generatedFeaturesRoot = path.join(featuresRoot, 'generated')
  const overridesFeaturesRoot = path.join(featuresRoot, 'overrides')
  const schemasRoot = resolveSchemasRoot(
    options.schemasPath,
    configuredSchemas,
    projectConfig.configPath,
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

  await generateAngularOnce({
    overlaysDir,
    featuresRoot,
    generatedFeaturesRoot,
    overridesFeaturesRoot,
    schemasRoot,
    intelligentEnabled
  })

  if (!options.watch) {
    logTip('Run with --dev to see detailed logs and file paths.')
    return
  }

  console.log(`👀 Watching ${overlaysDir} for .screen.json changes...`)
  let debounceTimer: NodeJS.Timeout | null = null

  const rerun = (fileName: string) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      console.log(`↻ Change detected: ${fileName}`)
      try {
        await generateAngularOnce({
          overlaysDir,
          featuresRoot,
          generatedFeaturesRoot,
          overridesFeaturesRoot,
          schemasRoot,
          intelligentEnabled
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unexpected error'
        console.error(message)
      }
    }, 180)
  }

  const watcher = fs.watch(overlaysDir, (event, fileName) => {
    if (!fileName) return
    if (!String(fileName).endsWith('.screen.json')) return
    if (event !== 'change' && event !== 'rename') return
    rerun(String(fileName))
  })

  const closeWatcher = () => {
    watcher.close()
    console.log('\nStopped screen watch.')
    process.exit(0)
  }

  process.on('SIGINT', closeWatcher)
  process.on('SIGTERM', closeWatcher)
}

async function generateAngularOnce(options: {
  overlaysDir: string
  featuresRoot: string
  generatedFeaturesRoot: string
  overridesFeaturesRoot: string
  schemasRoot: string
  intelligentEnabled: boolean
}) {
  if (!fs.existsSync(options.overlaysDir)) {
    throw new Error(
      `Overlays directory not found: ${options.overlaysDir}\n` +
        'Run `generate-ui generate` first to create overlays.\n' +
        'If needed, configure "openapi", "schemas", and "features" in generateui-config.json.'
    )
  }
  logDebug(`Overlays dir: ${options.overlaysDir}`)

  const screens = fs
    .readdirSync(options.overlaysDir)
    .filter(f => f.endsWith('.screen.json'))
  logDebug(`Screens found: ${screens.length}`)

  if (screens.length === 0) {
    throw new Error(
      `No .screen.json files found in: ${options.overlaysDir}\n` +
        'Run `generate-ui generate` and then `generate-ui angular`.\n' +
        'If needed, set "schemas" (or "paths.schemas") in generateui-config.json.'
    )
  }

  fs.mkdirSync(options.featuresRoot, { recursive: true })
  fs.mkdirSync(options.generatedFeaturesRoot, { recursive: true })
  fs.mkdirSync(options.overridesFeaturesRoot, { recursive: true })

  const routes: any[] = []
  const schemas: Array<{ file: string; schema: any }> = []
  const appRoot = path.resolve(options.featuresRoot, '..')
  const configInfo = findConfig(appRoot)
  const views = configInfo.config?.views ?? {}
  const generatedSchemasDir = path.join(options.schemasRoot, 'generated')

  for (const file of screens) {
    let schema = JSON.parse(
      fs.readFileSync(path.join(options.overlaysDir, file), 'utf-8')
    )
    const generatedPath = path.join(generatedSchemasDir, file)
    if (fs.existsSync(generatedPath)) {
      try {
        const generatedSchema = JSON.parse(
          fs.readFileSync(generatedPath, 'utf-8')
        )
        const normalized = enforceScreenShape(
          schema,
          generatedSchema
        )
        schema = normalized.schema
        for (const warning of normalized.warnings) {
          console.warn(warning)
        }
      } catch {
        // Ignore malformed generated schema and keep overlay as source.
      }
    }
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
      if (!options.intelligentEnabled) {
        logTip(
          'Intelligent generation is disabled. Login required to generate admin list screens.'
        )
        continue
      }
      const adminRoute = generateAdminFeature(
        schema,
        schemaByOpId,
        options.featuresRoot,
        options.generatedFeaturesRoot,
        options.schemasRoot
      )
      routes.push(adminRoute)
      continue
    }

    const route = generateFeature(
      schema,
      options.featuresRoot,
      options.generatedFeaturesRoot,
      options.schemasRoot
    )
    routes.push(route)
  }

  migrateLegacyFeatures(
    routes,
    options.featuresRoot,
    options.generatedFeaturesRoot,
    options.overridesFeaturesRoot
  )
  syncOverrides(
    routes,
    options.generatedFeaturesRoot,
    options.overridesFeaturesRoot
  )

  generateRoutes(
    routes,
    options.generatedFeaturesRoot,
    options.overridesFeaturesRoot,
    options.schemasRoot
  )
  generateMenu(options.schemasRoot)
  applyAppLayout(options.featuresRoot, options.schemasRoot)

  console.log(`✔ Angular features generated at ${options.featuresRoot}`)
  const overrides = findOverrides(
    routes,
    options.overridesFeaturesRoot,
    options.generatedFeaturesRoot
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
}

function enforceScreenShape(overlay: any, generated: any) {
  const warnings: string[] = []
  const next = overlay ?? {}

  const generatedType = generated?.screen?.type
  const overlayType = next?.screen?.type
  if (
    generatedType &&
    overlayType &&
    String(overlayType) !== String(generatedType)
  ) {
    next.screen = { ...(next.screen ?? {}), type: generatedType }
    warnings.push(
      `⚠ Ignored overlay change: screen.type is fixed by generation (${generatedType}).`
    )
  }

  const generatedMode = generated?.screen?.mode
  const overlayMode = next?.screen?.mode
  if (
    generatedMode &&
    overlayMode &&
    String(overlayMode) !== String(generatedMode)
  ) {
    next.screen = { ...(next.screen ?? {}), mode: generatedMode }
    warnings.push(
      `⚠ Ignored overlay change: screen.mode is fixed by generation (${generatedMode}).`
    )
  }

  const generatedMethod = generated?.api?.method
  const overlayMethod = next?.api?.method
  if (
    generatedMethod &&
    overlayMethod &&
    String(overlayMethod).toLowerCase() !==
      String(generatedMethod).toLowerCase()
  ) {
    next.api = { ...(next.api ?? {}), method: generatedMethod }
    warnings.push(
      `⚠ Ignored overlay change: api.method is fixed by generation (${generatedMethod}).`
    )
  }

  const generatedOpId = generated?.api?.operationId
  const overlayOpId = next?.api?.operationId
  if (
    generatedOpId &&
    overlayOpId &&
    String(overlayOpId) !== String(generatedOpId)
  ) {
    next.api = { ...(next.api ?? {}), operationId: generatedOpId }
    warnings.push(
      `⚠ Ignored overlay change: api.operationId is fixed by generation (${generatedOpId}).`
    )
  }

  return { schema: next, warnings }
}

function resolveSchemasRoot(
  value: string | undefined,
  configured: string | null,
  configPath: string | null,
  featuresRoot: string
) {
  const fromConfig = resolveOptionalPath(
    value,
    configured,
    configPath
  )
  if (fromConfig) {
    return fromConfig
  }

  const inferred = inferSchemasRootFromFeatures(featuresRoot)
  if (inferred) return inferred

  return resolveDefaultSchemasRoot()
}

function resolveFeaturesRoot(
  value: string | undefined,
  configured: string | null,
  configPath: string | null
) {
  const fromConfig = resolveOptionalPath(
    value,
    configured,
    configPath
  )
  if (fromConfig) {
    return normalizeFeaturesRoot(fromConfig)
  }

  const srcAppRoot = path.resolve(process.cwd(), 'src', 'app')
  if (fs.existsSync(srcAppRoot)) {
    return path.join(srcAppRoot, 'features')
  }

  throw new Error(
    'Default features path not found.\n' +
      'Use --features <path> or set "features" (or "paths.features") in generateui-config.json.'
  )
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
  const userConfig = loadUserConfig()
  if (
    userConfig?.lastSchemasPath &&
    fs.existsSync(path.join(userConfig.lastSchemasPath, 'overlays'))
  ) {
    return userConfig.lastSchemasPath
  }

  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, 'src'))) {
    return path.join(cwd, 'src', 'generate-ui')
  }
  return path.join(cwd, 'generate-ui')
}

function normalizeFeaturesRoot(value: string) {
  const isSrcApp =
    path.basename(value) === 'app' &&
    path.basename(path.dirname(value)) === 'src'
  if (isSrcApp) return path.join(value, 'features')
  return value
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
  const overridesEmpty =
    fs.existsSync(overridesRoot) &&
    fs.readdirSync(overridesRoot).length === 0
  if (overridesEmpty && fs.existsSync(generatedRoot)) {
    fs.cpSync(generatedRoot, overridesRoot, { recursive: true })
    console.log('ℹ Seeded overrides from generated (initial sync).')
    return
  }
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

  ensureBaseStyles(appRoot)

  const autoInject = config?.menu?.autoInject !== false
  if (autoInject) {
    const appTitle = config?.appTitle || 'Generate UI'
    injectMenuLayout(appRoot, appTitle, schemasRoot)
  }
}

function findConfig(startDir: string) {
  let dir = startDir
  let config: GenerateUiProjectConfig | null = null
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
    const shellCss = `:host {\n  display: block;\n  min-height: 100vh;\n  color: #0f172a;\n  background:\n    radial-gradient(circle at 10% 12%, rgba(236, 72, 153, 0.18), transparent 45%),\n    radial-gradient(circle at 85% 18%, rgba(56, 189, 248, 0.22), transparent 50%),\n    radial-gradient(circle at 25% 85%, rgba(34, 197, 94, 0.16), transparent 52%),\n    radial-gradient(circle at 80% 80%, rgba(250, 204, 21, 0.18), transparent 48%),\n    linear-gradient(180deg, #f8fafc 0%, #f2f5ff 100%);\n}\n\n.app-shell {\n  display: grid;\n  grid-template-columns: 260px 1fr;\n  gap: 24px;\n  padding: 24px;\n  align-items: start;\n}\n\n.app-content {\n  min-width: 0;\n}\n\n@media (max-width: 900px) {\n  .app-shell {\n    grid-template-columns: 1fr;\n  }\n}\n`
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

function ensureBaseStyles(appRoot: string) {
  const workspaceRoot = findAngularWorkspaceRoot(appRoot) ?? path.resolve(appRoot, '..')
  const stylesPath = path.join(workspaceRoot, 'src', 'styles.css')
  if (fs.existsSync(stylesPath)) return
  if (fs.existsSync(path.join(workspaceRoot, 'src', 'styles.scss'))) return

  const styles = `:root {
  --bg-page: #f7f5f2;
  --bg-surface: #ffffff;
  --bg-ink: #0f172a;
  --color-text: #0f172a;
  --color-muted: #64748b;
  --color-border: rgba(99, 102, 241, 0.28);
  --color-primary: #22d3ee;
  --color-primary-strong: #6366f1;
  --color-primary-soft: rgba(34, 211, 238, 0.14);
  --color-accent: #a78bfa;
  --color-accent-strong: #f59e0b;
  --color-accent-soft: rgba(167, 139, 250, 0.16);
  --shadow-card: 0 12px 30px rgba(15, 23, 42, 0.08);
}

body {
  margin: 0;
  background: var(--bg-page);
  color: var(--color-text);
  font-family: system-ui, -apple-system, "SF Pro Text", "SF Pro Display", "Segoe UI", sans-serif;
}
`

  fs.writeFileSync(stylesPath, styles)
}

function findAngularWorkspaceRoot(startDir: string) {
  let dir = startDir
  const root = path.parse(dir).root
  while (true) {
    const candidate = path.join(dir, 'angular.json')
    if (fs.existsSync(candidate)) return dir
    if (dir === root) return null
    dir = path.dirname(dir)
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
