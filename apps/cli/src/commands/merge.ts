import fs from 'fs'
import os from 'os'
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
  const selectedTool = options.tool || 'code'

  logStep(`Generated: ${generatedRoot}`)
  logStep(`Overrides: ${overridesRoot}`)
  logStep(
    `Merge tool: ${selectedTool}${
      selectedTool === 'code'
        ? ' (merge editor, recommended)'
        : selectedTool === 'code-diff'
          ? ' (red/green diff)'
          : ''
    }`
  )
  let compared = 0

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
      fs.mkdirSync(path.dirname(overridePath), { recursive: true })
      fs.copyFileSync(generatedPath, overridePath)
      console.log(`ℹ Created override file: ${overridePath}`)
    }

    openMergeTool(
      selectedTool,
      generatedPath,
      overridePath
    )
    compared += 1
  }

  if (compared === 0) {
    throw new Error(
      `No comparable files found for feature "${folder}".`
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
  const folders = listFeatureFolders(generatedRoot, overridesRoot)
  if (folders.length === 0) {
    throw new Error(
      `No feature folders found under ${generatedRoot} or ${overridesRoot}.`
    )
  }

  const direct = normalizeFeatureKey(value)
  const matches = folders.filter(
    folder => normalizeFeatureKey(folder) === direct
  )
  if (matches.length === 1) return matches[0]

  const contains = folders.filter(folder =>
    normalizeFeatureKey(folder).includes(direct)
  )
  if (contains.length === 1) return contains[0]

  if (contains.length > 1) {
    throw new Error(
      `Feature "${value}" is ambiguous. Matches: ${contains.join(', ')}`
    )
  }

  const sample = folders.slice(0, 12).join(', ')
  throw new Error(
    `Feature not found: ${value}.\n` +
      `Available features: ${sample}${folders.length > 12 ? ', ...' : ''}`
  )
}

function listFeatureFolders(
  generatedRoot: string,
  overridesRoot: string
) {
  const set = new Set<string>()
  for (const root of [generatedRoot, overridesRoot]) {
    if (!fs.existsSync(root)) continue
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      set.add(entry.name)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

function normalizeFeatureKey(value: string) {
  return String(value)
    .trim()
    .replace(/Component$/i, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
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
  const run = (cmd: string, args: string[]) => {
    try {
      execFileSync(cmd, args, { stdio: 'inherit' })
    } catch (error: any) {
      const message = String(error?.message || '')
      if (error?.code === 'ENOENT') {
        throw new Error(
          `Merge tool "${cmd}" not found in PATH.\n` +
            'Recommended: install VS Code command in PATH and use --tool code.\n' +
            "In VS Code run: 'Shell Command: Install code command in PATH'.\n" +
            'Or try one of these:\n' +
            '  --tool code\n' +
            '  --tool code-diff\n' +
            '  --tool vimdiff\n' +
            '  --tool diff'
        )
      }
      if (
        cmd === 'opendiff' &&
        message.includes('requires Xcode')
      ) {
        throw new Error(
          'Tool "opendiff" requires full Xcode.\n' +
            'Use --tool vimdiff or --tool diff, or install full Xcode.'
        )
      }
      throw error
    }
  }

  if (tool === 'code') {
    openCodeMerge(run, generatedPath, overridePath)
    return
  }

  if (tool === 'code-diff') {
    // Diff view: left = incoming generated, right = current overrides.
    run('code', ['--wait', '--diff', generatedPath, overridePath])
    return
  }

  if (tool === 'meld' || tool === 'kdiff3' || tool === 'bc') {
    run(
      'git',
      ['difftool', '--no-index', `--tool=${tool}`, generatedPath, overridePath]
    )
    return
  }

  run(tool, [generatedPath, overridePath])
}

function openCodeMerge(
  run: (cmd: string, args: string[]) => void,
  generatedPath: string,
  overridePath: string
) {
  const ext = path.extname(overridePath) || '.txt'
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'generate-ui-merge-')
  )

  const currentPath = path.join(tempDir, `current${ext}`)
  const incomingPath = path.join(tempDir, `incoming${ext}`)
  const basePath = path.join(tempDir, `base${ext}`)
  const resultPath = path.join(tempDir, `result${ext}`)

  try {
    fs.copyFileSync(overridePath, currentPath)
    fs.copyFileSync(generatedPath, incomingPath)
    fs.copyFileSync(generatedPath, basePath)
    fs.copyFileSync(overridePath, resultPath)

    // VS Code merge editor:
    // - current: user's override
    // - incoming: regenerated output
    // - base: fallback ancestor (best effort, regenerated)
    // - result: file that will be saved back to overrides
    run('code', [
      '--wait',
      '--merge',
      currentPath,
      incomingPath,
      basePath,
      resultPath
    ])

    fs.copyFileSync(resultPath, overridePath)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
