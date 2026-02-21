#!/usr/bin/env node
import { Command } from 'commander'
import { generate } from './commands/generate'
import { angular } from './commands/angular'
import { login } from './commands/login'
import { merge } from './commands/merge'
import { getCliVersion } from './runtime/config'
import {
  trackCliStarted,
  trackCommandHelp,
  trackGenerateCalled
} from './telemetry'
import { isVerbose, setVerbose } from './runtime/logger'

const program = new Command()

program
  .name('generate-ui')
  .description('Generate UI from OpenAPI')
  .version(getCliVersion())
  .option('--no-telemetry', 'Disable telemetry')
  .option('--dev', 'Enable verbose logs')
  .option('--verbose', 'Enable verbose logs (same as --dev)')

/**
 * 1️⃣ OpenAPI → Screen schemas
 */
program
  .command('generate')
  .description('Generate screen schemas from OpenAPI')
  .option(
    '-o, --openapi <path>',
    'OpenAPI file (optional if configured in generateui-config.json)'
  )
  .option(
    '--output <path>',
    'Output directory for generate-ui (optional if configured in generateui-config.json)'
  )
  .option('-d, --debug', 'Explain merge decisions')
  .action(async (options) => {
    const { telemetry, dev, verbose } = program.opts<{
      telemetry: boolean
      dev?: boolean
      verbose?: boolean
    }>()
    setVerbose(Boolean(dev || verbose))
    try {
      await trackGenerateCalled()
      await generate({
        openapi: options.openapi,
        output: options.output,
        debug: options.debug,
        telemetryEnabled: telemetry
      })
    } catch (error) {
      handleCliError(error)
    }
  })

/**
 * 2️⃣ Screen schemas → Angular code
 */
program
  .command('angular')
  .description('Generate Angular code from screen schemas')
  .option(
    '-s, --schemas <path>',
    'Directory containing generate-ui (with overlays/)'
  )
  .option(
    '-f, --features <path>',
    'Angular features output directory (optional if configured in generateui-config.json)'
  )
  .option(
    '-w, --watch',
    'Watch .screen.json files and regenerate Angular on changes (default)'
  )
  .option(
    '--no-watch',
    'Run Angular generation once and exit'
  )
  .action(async (options) => {
    const { telemetry, dev, verbose } = program.opts<{
      telemetry: boolean
      dev?: boolean
      verbose?: boolean
    }>()
    setVerbose(Boolean(dev || verbose))
    try {
      await angular({
        schemasPath: options.schemas,
        featuresPath: options.features,
        watch: options.watch !== false,
        telemetryEnabled: telemetry
      })
    } catch (error) {
      handleCliError(error)
    }
  })

/**
 * 3️⃣ Login (Dev plan)
 */
program
  .command('login')
  .description('Login to unlock Dev features')
  .action(async () => {
    const { telemetry, dev, verbose } = program.opts<{
      telemetry: boolean
      dev?: boolean
      verbose?: boolean
    }>()
    setVerbose(Boolean(dev || verbose))
    try {
      await login({ telemetryEnabled: telemetry })
    } catch (error) {
      handleCliError(error)
    }
  })

/**
 * 4️⃣ Compare generated vs overrides (interactive)
 */
program
  .command('merge')
  .description('Compare generated vs overrides with an interactive diff tool')
  .requiredOption('--feature <name>', 'Feature folder or operationId')
  .option(
    '-f, --features <path>',
    'Angular features output directory'
  )
  .option(
    '--file <name>',
    'File to compare: component.ts, component.html, component.scss, or all'
  )
  .option(
    '--tool <name>',
    'Diff tool (code, meld, kdiff3, bc, or any executable)'
  )
  .action(async (options) => {
    const { telemetry, dev, verbose } = program.opts<{
      telemetry: boolean
      dev?: boolean
      verbose?: boolean
    }>()
    setVerbose(Boolean(dev || verbose))
    try {
      await merge({
        featuresPath: options.features,
        feature: options.feature,
        file: options.file,
        tool: options.tool
      })
    } catch (error) {
      handleCliError(error)
    }
  })

function handleCliError(error: unknown) {
  if (error instanceof Error) {
    console.error(error.message.replace(/\\n/g, '\n'))
    if (isVerbose() && error.stack) {
      console.error('')
      console.error('🔎 Stack trace:')
      console.error(error.stack)
    } else {
      console.error('')
      console.error('ℹ️  Tip: re-run with --dev to see detailed logs.')
    }
  } else {
    console.error('Unexpected error')
  }
  process.exit(1)
}

async function run() {
  console.log('[GenerateUI] started')
  await trackCliStarted()

  if (process.argv.slice(2).length === 0) {
    await trackCommandHelp()
    program.outputHelp()
    return
  }

  await program.parseAsync()
}

void run()
