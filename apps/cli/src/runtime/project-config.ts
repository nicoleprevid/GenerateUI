import fs from 'fs'
import path from 'path'

export type GenerateUiProjectConfig = {
  appTitle?: string
  defaultRoute?: string
  menu?: {
    autoInject?: boolean
  }
  views?: Record<string, string>
  openapi?: string
  output?: string
  schemas?: string
  features?: string
  paths?: {
    openapi?: string
    output?: string
    schemas?: string
    features?: string
  }
}

export function findProjectConfig(startDir: string) {
  let dir = path.resolve(startDir)
  const root = path.parse(dir).root

  while (true) {
    const candidate = path.join(dir, 'generateui-config.json')
    if (fs.existsSync(candidate)) {
      const parsed = tryReadConfig(candidate)
      if (parsed) {
        return {
          configPath: candidate,
          config: parsed
        }
      }
    }

    if (dir === root) {
      return {
        configPath: null,
        config: null
      }
    }
    dir = path.dirname(dir)
  }
}

export function pickConfiguredPath(
  config: GenerateUiProjectConfig | null | undefined,
  key: 'openapi' | 'output' | 'schemas' | 'features'
) {
  const scoped = config?.paths?.[key]
  if (typeof scoped === 'string' && scoped.trim().length > 0) {
    return scoped.trim()
  }

  const topLevel = config?.[key]
  if (typeof topLevel === 'string' && topLevel.trim().length > 0) {
    return topLevel.trim()
  }

  return null
}

export function resolveOptionalPath(
  cliValue: string | undefined,
  configuredValue: string | null,
  configPath: string | null
) {
  if (cliValue && cliValue.trim().length > 0) {
    return path.resolve(process.cwd(), cliValue)
  }
  if (
    configuredValue &&
    configuredValue.trim().length > 0 &&
    configPath
  ) {
    return path.resolve(path.dirname(configPath), configuredValue)
  }
  return null
}

function tryReadConfig(configPath: string) {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw) as GenerateUiProjectConfig
  } catch {
    return null
  }
}
