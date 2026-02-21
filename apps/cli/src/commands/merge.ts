import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { logStep, logTip } from '../runtime/logger'
import {
  findProjectConfig,
  pickConfiguredPath,
  resolveOptionalPath
} from '../runtime/project-config'

export async function merge(options: {
  featuresPath?: string
  feature?: string
  file?: string
  tool?: string
}) {
  const projectConfig = findProjectConfig(process.cwd())
  const configuredFeatures = pickConfiguredPath(
    projectConfig.config,
    'features'
  )
  const featuresRoot = resolveFeaturesRoot(
    options.featuresPath,
    configuredFeatures,
    projectConfig.configPath
  )
  const generatedRoot = path.join(featuresRoot, 'generated')
  const overridesRoot = path.join(featuresRoot, 'overrides')

  if (!options.feature) {
    throw new Error(
      'Missing --feature. Example: generate-ui merge --feature ProductsAdmin'
    )
  }

  const folder = resolveFeatureFolder(
    options.feature,
    generatedRoot,
    overridesRoot
  )

  const files = resolveFiles(folder, options.file)
  if (files.length === 0) {
    throw new Error('No files selected to compare.')
  }

  logStep(`Generated: ${generatedRoot}`)
  logStep(`Overrides: ${overridesRoot}`)

  for (const fileName of files) {
    const generatedPath = path.join(
      generatedRoot,
      folder,
      fileName
    )
    const overridePath = path.join(
      overridesRoot,
      folder,
      fileName
    )
    if (!fs.existsSync(generatedPath)) {
      console.warn(`⚠ Missing generated file: ${generatedPath}`)
      continue
    }
    if (!fs.existsSync(overridePath)) {
      console.warn(`⚠ Missing override file: ${overridePath}`)
      continue
    }

    openMergeTool(
      options.tool || 'code',
      generatedPath,
      overridePath
    )
  }

  logTip(
    'Save changes in the overrides file (right side) to keep custom edits.'
  )
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

function normalizeFeaturesRoot(value: string) {
  const isSrcApp =
    path.basename(value) === 'app' &&
    path.basename(path.dirname(value)) === 'src'
  if (isSrcApp) return path.join(value, 'features')
  return value
}

function resolveFeatureFolder(
  value: string,
  generatedRoot: string,
  overridesRoot: string
) {
  const direct = value.trim()
  const pascal = toPascalCase(value)
  const candidates = [direct, pascal]

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(generatedRoot, candidate)) ||
      fs.existsSync(path.join(overridesRoot, candidate))
    ) {
      return candidate
    }
  }

  throw new Error(
    `Feature not found: ${value}. Expected folder under ${generatedRoot} or ${overridesRoot}.`
  )
}

function resolveFiles(folder: string, raw?: string) {
  const key = String(raw || 'component.ts').trim()
  if (key === 'all') {
    return [
      `${folder}.component.ts`,
      `${folder}.component.html`,
      `${folder}.component.scss`
    ]
  }
  const normalized = key.startsWith('.')
    ? key.slice(1)
    : key
  const suffix = normalized.startsWith('component')
    ? normalized
    : `component.${normalized}`
  return [`${folder}.${suffix}`]
}

function openMergeTool(
  tool: string,
  generatedPath: string,
  overridePath: string
) {
  if (tool === 'code') {
    execFileSync('code', ['--wait', '--diff', generatedPath, overridePath], {
      stdio: 'inherit'
    })
    return
  }

  if (tool === 'meld' || tool === 'kdiff3' || tool === 'bc') {
    execFileSync(
      'git',
      ['difftool', '--no-index', `--tool=${tool}`, generatedPath, overridePath],
      { stdio: 'inherit' }
    )
    return
  }

  execFileSync(tool, [generatedPath, overridePath], { stdio: 'inherit' })
}

function toPascalCase(value: string) {
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('')
}
