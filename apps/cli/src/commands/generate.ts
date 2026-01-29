import fs from 'fs'
import path from 'path'
import { loadOpenApi } from '../openapi/load-openapi'
import { generateScreen } from '../generators/screen.generator'
import { mergeScreen } from '../generators/screen.merge'
import { getPermissions } from '../license/permissions'
import { incrementFreeGeneration, loadDeviceIdentity } from '../license/device'
import { trackCommand } from '../telemetry'
import { updateUserConfig } from '../runtime/user-config'
import { logDebug, logStep, logTip } from '../runtime/logger'

interface GeneratedRoute {
  path: string
  operationId: string
  label?: string
  group?: string | null
}

type ResourceOp = {
  operationId: string
  method: string
  path: string
  tag?: string
}

type ResourceIndex = {
  basePath: string
  list?: ResourceOp
  detail?: ResourceOp
  update?: ResourceOp
  remove?: ResourceOp
  idParam?: string | null
  tag?: string
}

export async function generate(options: {
  openapi: string
  output?: string
  debug?: boolean
  telemetryEnabled: boolean
}) {
  void trackCommand('generate', options.telemetryEnabled)

  /**
   * Caminho absoluto do OpenAPI (YAML)
   * Ex: /Users/.../generateui-playground/realWorldOpenApi.yaml
   */
  const openApiPath = path.resolve(process.cwd(), options.openapi)
  logStep(`OpenAPI: ${openApiPath}`)

  /**
   * Raiz do playground (onde está o YAML)
   */
  const projectRoot = path.dirname(openApiPath)
  logDebug(`Project root: ${projectRoot}`)

  /**
   * Onde o Angular consome os arquivos
   */
  const generateUiRoot = resolveGenerateUiRoot(
    projectRoot,
    options.output
  )
  logStep(`Schemas output: ${generateUiRoot}`)

  const generatedDir = path.join(generateUiRoot, 'generated')
  const overlaysDir = path.join(generateUiRoot, 'overlays')
  logDebug(`Generated dir: ${generatedDir}`)
  logDebug(`Overlays dir: ${overlaysDir}`)

  updateUserConfig(config => ({
    ...config,
    lastSchemasPath: generateUiRoot
  }))

  fs.mkdirSync(generatedDir, { recursive: true })
  fs.mkdirSync(overlaysDir, { recursive: true })

  /**
   * Lista de rotas geradas automaticamente
   */
  const routes: GeneratedRoute[] = []
  const usedOperationIds = new Set<string>()
  const resourceMap = new Map<string, ResourceIndex>()

  const permissions = await getPermissions()
  const device = loadDeviceIdentity()
  logDebug(
    `License: maxGenerations=${permissions.features.maxGenerations}, overrides=${permissions.features.uiOverrides}, safeRegen=${permissions.features.safeRegeneration}`
  )

  if (
    permissions.features.maxGenerations > -1 &&
    device.freeGenerationsUsed >= permissions.features.maxGenerations
  ) {
    throw new Error(
      '🔒 Você já utilizou sua geração gratuita.\n' +
        'O plano Dev libera gerações ilimitadas, regeneração segura e UI inteligente.\n' +
        '👉 Execute `generate-ui login` para continuar.\n' +
        'Se você já fez login e ainda vê esta mensagem, tente novamente com a mesma versão do CLI e verifique a conexão com a API.'
    )
  }

  /**
   * Parse do OpenAPI (já com $refs resolvidos)
   */
  const api = await loadOpenApi(openApiPath)
  const paths = api.paths ?? {}
  logDebug(`OpenAPI paths: ${Object.keys(paths).length}`)

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

      recordResourceOp(
        resourceMap,
        pathKey,
        method.toLowerCase(),
        operationId,
        op
      )

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
      const canOverride = permissions.features.uiOverrides
      const canRegenerateSafely = permissions.features.safeRegeneration

      if (canOverride && canRegenerateSafely) {
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
      } else {
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
        path: operationId,
        operationId,
        label: toLabel(
          screenSchema.entity
            ? String(screenSchema.entity)
            : operationId
        ),
        group: inferRouteGroup(op, pathKey)
      })

      console.log(`✔ Generated ${operationId}`)
    }
  }

  const canOverride = permissions.features.uiOverrides
  const canRegenerateSafely = permissions.features.safeRegeneration
  const intelligentEnabled = Boolean(
    permissions.features.intelligentGeneration
  )
  const viewDefaults: Array<{ key: string; view: string }> = []

  if (intelligentEnabled) {
    const adminSchemas = buildAdminSchemas(
      resourceMap,
      usedOperationIds
    )
    for (const admin of adminSchemas) {
      const fileName = `${admin.api.operationId}.screen.json`
      const generatedPath = path.join(generatedDir, fileName)
      fs.writeFileSync(
        generatedPath,
        JSON.stringify(admin, null, 2)
      )

      const overlayPath = path.join(overlaysDir, fileName)
      if (canOverride && canRegenerateSafely) {
        const overlay = fs.existsSync(overlayPath)
          ? JSON.parse(fs.readFileSync(overlayPath, 'utf-8'))
          : null

        const merged = mergeScreen(
          admin,
          overlay,
          null,
          {
            openapiVersion: api?.info?.version || 'unknown',
            debug: options.debug
          }
        )

        fs.writeFileSync(
          overlayPath,
          JSON.stringify(merged.screen, null, 2)
        )
      } else if (!fs.existsSync(overlayPath)) {
        fs.writeFileSync(
          overlayPath,
          JSON.stringify(admin, null, 2)
        )
      }

      routes.push({
        path: admin.api.operationId,
        operationId: admin.api.operationId,
        label: admin.meta?.intelligent?.label,
        group: admin.meta?.intelligent?.group ?? null
      })

      viewDefaults.push({
        key: admin.api.operationId,
        view: 'cards'
      })
      if (admin.meta?.intelligent?.listOperationId) {
        viewDefaults.push({
          key: admin.meta.intelligent.listOperationId,
          view: 'list'
        })
      }

      operationIds.add(admin.api.operationId)
      console.log(`✨ Generated ${admin.api.operationId}`)
    }
  }
  logStep(`Screens generated: ${routes.length}`)

  /**
   * 4️⃣ Gera arquivo de rotas
   */
  const routesPath = path.join(generateUiRoot, 'routes.json')
  fs.writeFileSync(
    routesPath,
    JSON.stringify(routes, null, 2)
  )
  logDebug(`Routes written: ${routesPath}`)

  /**
   * 4.3️⃣ Gera generateui-config.json (não sobrescreve)
   */
  const configPath = path.join(
    generateUiRoot,
    '..',
    '..',
    'generateui-config.json'
  )
  let configPayload: any = null
  if (!fs.existsSync(configPath)) {
    configPayload = {
      appTitle: 'Generate UI',
      defaultRoute: '',
      menu: {
        autoInject: true
      },
      views: {}
    }
    fs.writeFileSync(configPath, JSON.stringify(configPayload, null, 2))
    logDebug(`Config created: ${configPath}`)
  } else {
    try {
      configPayload = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      configPayload = null
    }
    logDebug(`Config found: ${configPath}`)
  }

  if (configPayload && viewDefaults.length) {
    configPayload.views = configPayload.views || {}
    for (const entry of viewDefaults) {
      if (!configPayload.views[entry.key]) {
        configPayload.views[entry.key] = entry.view
      }
    }
    fs.writeFileSync(
      configPath,
      JSON.stringify(configPayload, null, 2)
    )
    logDebug(`Config views updated: ${configPath}`)
  }

  /**
   * 4.1️⃣ Gera menu inicial (override possível via menu.overrides.json)
   */
  const menuPath = path.join(generateUiRoot, 'menu.json')
  const menu = buildMenuFromRoutes(routes)
  fs.writeFileSync(menuPath, JSON.stringify(menu, null, 2))
  logDebug(`Menu written: ${menuPath}`)

  /**
   * 4.2️⃣ Gera menu.overrides.json (não sobrescreve)
   */
  const menuOverridesPath = path.join(generateUiRoot, 'menu.overrides.json')
  if (!fs.existsSync(menuOverridesPath)) {
    fs.writeFileSync(
      menuOverridesPath,
      JSON.stringify(menu, null, 2)
    )
    logDebug(`Menu overrides created: ${menuOverridesPath}`)
  } else {
    logDebug(`Menu overrides found: ${menuOverridesPath}`)
  }

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

  if (permissions.features.maxGenerations > -1) {
    incrementFreeGeneration()
  }

  console.log('✔ Routes generated')
  console.log('')
  console.log('🎉 Next steps')
  console.log('  1) Generate Angular code:')
  console.log('     generate-ui angular --schemas <your-generate-ui> --features <your-app>/src/app/features')
  console.log('  2) Customize screens in generate-ui/overlays/')
  console.log('  3) Customize menu in generate-ui/menu.overrides.json (created once, never overwritten)')
  console.log('  4) Edit generateui-config.json to set appTitle/defaultRoute/menu.autoInject')
  console.log('')
  logTip('Run with --dev to see detailed logs and file paths.')
}

function resolveGenerateUiRoot(
  projectRoot: string,
  output?: string
) {
  if (output) {
    return path.resolve(process.cwd(), output)
  }

  const srcRoot = path.join(projectRoot, 'src')
  if (fs.existsSync(srcRoot)) {
    return path.join(srcRoot, 'generate-ui')
  }

  const frontendSrcRoot = path.join(projectRoot, 'frontend', 'src')
  if (fs.existsSync(frontendSrcRoot)) {
    return path.join(frontendSrcRoot, 'generate-ui')
  }

  return path.join(projectRoot, 'generate-ui')
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

function inferRouteGroup(op: any, pathKey: string) {
  const tag =
    Array.isArray(op?.tags) && op.tags.length
      ? String(op.tags[0]).trim()
      : ''
  if (tag) return tag

  const segment = String(pathKey || '')
    .split('/')
    .map(part => part.trim())
    .filter(Boolean)
    .find(part => !part.startsWith('{') && !part.endsWith('}'))

  return segment ? segment : null
}

function recordResourceOp(
  map: Map<string, ResourceIndex>,
  pathKey: string,
  method: string,
  operationId: string,
  op: any
) {
  const isItemPath = /\/{[^}]+}$/.test(pathKey)
  const basePath = isItemPath
    ? pathKey.replace(/\/{[^}]+}$/, '')
    : pathKey
  const paramMatch = isItemPath
    ? pathKey.match(/\/{([^}]+)}$/)
    : null
  const idParam = paramMatch ? paramMatch[1] : null
  const tag =
    Array.isArray(op?.tags) && op.tags.length
      ? String(op.tags[0]).trim()
      : undefined

  const entry =
    map.get(basePath) || ({
      basePath
    } as ResourceIndex)

  if (tag && !entry.tag) entry.tag = tag
  if (idParam && !entry.idParam) entry.idParam = idParam

  const payload: ResourceOp = {
    operationId,
    method,
    path: pathKey,
    tag
  }

  if (!isItemPath && method === 'get') entry.list = payload
  if (isItemPath && method === 'get') entry.detail = payload
  if (isItemPath && (method === 'put' || method === 'patch')) {
    entry.update = payload
  }
  if (isItemPath && method === 'delete') entry.remove = payload

  map.set(basePath, entry)
}

function buildAdminSchemas(
  resources: Map<string, ResourceIndex>,
  usedOperationIds: Set<string>
) {
  const adminSchemas: any[] = []

  for (const resource of resources.values()) {
    if (!resource.list) continue

    const entity = inferEntityName(resource.basePath)
    const baseId = toPascalCase(entity)
    const baseOpId = `${baseId}Admin`
    let operationId = baseOpId
    let index = 2
    while (usedOperationIds.has(operationId)) {
      operationId = `${baseOpId}${index}`
      index += 1
    }
    usedOperationIds.add(operationId)

    const label = `${toLabel(entity)} Admin`
    const group = resource.tag ? resource.tag : inferGroup(resource.basePath)

    adminSchemas.push({
      meta: {
        intelligent: {
          kind: 'adminList',
          label,
          group,
          listOperationId: resource.list.operationId,
          detailOperationId: resource.detail?.operationId ?? null,
          updateOperationId: resource.update?.operationId ?? null,
          deleteOperationId: resource.remove?.operationId ?? null,
          idParam: resource.idParam ?? null
        }
      },
      entity: toLabel(entity),
      description:
        'Smart admin list generated from collection endpoints.',
      api: {
        operationId,
        method: 'get',
        endpoint: resource.list.path
      }
    })
  }

  return adminSchemas
}

function inferEntityName(pathKey: string) {
  const segments = String(pathKey || '')
    .split('/')
    .filter(Boolean)
  if (!segments.length) return 'Resource'
  const last = segments[segments.length - 1]
  return last.replace(/[^a-zA-Z0-9]+/g, ' ')
}

function inferGroup(pathKey: string) {
  const segment = String(pathKey || '')
    .split('/')
    .map(part => part.trim())
    .filter(Boolean)[0]
  return segment ? segment : null
}

function buildMenuFromRoutes(routes: GeneratedRoute[]) {
  const groups: any[] = []
  const ungrouped: any[] = []
  const groupMap = new Map<string, any>()

  for (const route of routes) {
    const item = {
      id: route.operationId,
      label: toLabel(route.label || route.operationId),
      route: route.path
    }
    const rawGroup = route.group ? String(route.group) : ''
    if (!rawGroup) {
      ungrouped.push(item)
      continue
    }

    const groupId = toKebab(rawGroup)
    let group = groupMap.get(groupId)
    if (!group) {
      group = {
        id: groupId,
        label: toLabel(rawGroup),
        items: []
      }
      groupMap.set(groupId, group)
      groups.push(group)
    }
    group.items.push(item)
  }

  return {
    groups,
    ungrouped
  }
}

function toKebab(value: string) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
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

function toPascalCase(value: string) {
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('')
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
