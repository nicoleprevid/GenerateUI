import fs from 'fs'
import path from 'path'

type MenuItem = {
  id: string
  label: string
  route: string
  hidden?: boolean
  icon?: string
}

type MenuGroup = {
  id: string
  label: string
  items: MenuItem[]
  hidden?: boolean
}

type MenuConfig = {
  groups: MenuGroup[]
  ungrouped: MenuItem[]
}

export function generateMenu(schemasRoot: string) {
  const menu =
    loadMenuConfig(schemasRoot) ??
    buildMenuFromRoutes(loadRoutesConfig(schemasRoot)) ?? {
      groups: [],
      ungrouped: []
    }

  const out = path.join(schemasRoot, 'menu.gen.ts')
  const content = `
export type GeneratedMenuItem = {
  id: string
  label: string
  route: string
  hidden?: boolean
  icon?: string
}

export type GeneratedMenuGroup = {
  id: string
  label: string
  items: GeneratedMenuItem[]
  hidden?: boolean
}

export type GeneratedMenu = {
  groups: GeneratedMenuGroup[]
  ungrouped: GeneratedMenuItem[]
}

export const generatedMenu: GeneratedMenu = ${JSON.stringify(
    normalizeMenu(menu),
    null,
    2
  )}
`

  fs.writeFileSync(out, content.trimStart())
}

function loadMenuConfig(schemasRoot: string): MenuConfig | null {
  const overridePath = path.join(schemasRoot, 'menu.overrides.json')
  const basePath = path.join(schemasRoot, 'menu.json')

  if (fs.existsSync(overridePath)) {
    const override = JSON.parse(
      fs.readFileSync(overridePath, 'utf-8')
    )
    const hasOverride =
      Array.isArray(override?.groups) &&
        override.groups.length > 0
        ? true
        : Array.isArray(override?.ungrouped) &&
          override.ungrouped.length > 0

    if (hasOverride) {
      return override
    }
  }

  if (fs.existsSync(basePath)) {
    return JSON.parse(fs.readFileSync(basePath, 'utf-8'))
  }

  return null
}

function loadRoutesConfig(schemasRoot: string) {
  const routesPath = path.join(schemasRoot, 'routes.json')
  if (!fs.existsSync(routesPath)) return null
  try {
    return JSON.parse(fs.readFileSync(routesPath, 'utf-8'))
  } catch {
    return null
  }
}

function normalizeMenu(value: any): MenuConfig {
  return {
    groups: Array.isArray(value?.groups)
      ? value.groups.map(normalizeGroup)
      : [],
    ungrouped: Array.isArray(value?.ungrouped)
      ? value.ungrouped.map(normalizeItem)
      : []
  }
}

function normalizeGroup(value: any): MenuGroup {
  return {
    id: String(value?.id ?? ''),
    label: String(value?.label ?? ''),
    hidden: Boolean(value?.hidden) || undefined,
    items: Array.isArray(value?.items)
      ? value.items.map(normalizeItem)
      : []
  }
}

function normalizeItem(value: any): MenuItem {
  return {
    id: String(value?.id ?? ''),
    label: String(value?.label ?? ''),
    route: String(value?.route ?? ''),
    hidden: Boolean(value?.hidden) || undefined,
    icon: value?.icon ? String(value.icon) : undefined
  }
}

function buildMenuFromRoutes(routes: any[] | null): MenuConfig | null {
  if (!Array.isArray(routes) || routes.length === 0) return null

  const groups: MenuGroup[] = []
  const ungrouped: MenuItem[] = []
  const groupMap = new Map<string, MenuGroup>()

  for (const route of routes) {
    if (!route?.path || !route?.operationId) continue

    const item: MenuItem = {
      id: String(route.operationId),
      label: toLabel(String(route.label ?? route.operationId)),
      route: normalizeRoutePath(
        String(route.path ?? route.operationId ?? '')
      )
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

  return { groups, ungrouped }
}

function toKebab(value: string) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\\s]+/g, '-')
    .toLowerCase()
}

function toLabel(value: string) {
  return String(value)
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\\b\\w/g, char => char.toUpperCase())
}

function normalizeRoutePath(value: string) {
  if (!value) return value
  if (value.includes('/')) return value.replace(/^\//, '')
  const pascal = toPascalCase(value)
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
