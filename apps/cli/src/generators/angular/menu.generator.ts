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
    loadMenuConfig(schemasRoot) ?? {
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
