#!/usr/bin/env node
import { Command } from 'commander'
import { generate } from './commands/generate'
import { angular } from './commands/angular'
import { login } from './commands/login'
import { getCliVersion } from './runtime/config'

const program = new Command()

program
  .name('generate-ui')
  .description('Generate UI from OpenAPI')
  .version(getCliVersion())
  .option('--no-telemetry', 'Disable telemetry')

/**
 * 1️⃣ OpenAPI → Screen schemas
 */
program
  .command('generate')
  .description('Generate screen schemas from OpenAPI')
  .requiredOption('-o, --openapi <path>', 'OpenAPI file')
  .option(
    '--output <path>',
    'Output directory for generate-ui (default: ./src/generate-ui or ./generate-ui)'
  )
  .option('-d, --debug', 'Explain merge decisions')
  .action(async (options) => {
    const { telemetry } = program.opts<{ telemetry: boolean }>()
    try {
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
  .option('-f, --features <path>', 'Angular features output directory')
  .action(async (options) => {
    const { telemetry } = program.opts<{ telemetry: boolean }>()
    try {
      await angular({
        schemasPath: options.schemas,
        featuresPath: options.features,
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
    const { telemetry } = program.opts<{ telemetry: boolean }>()
    try {
      await login({ telemetryEnabled: telemetry })
    } catch (error) {
      handleCliError(error)
    }
  })

function handleCliError(error: unknown) {
  if (error instanceof Error) {
    console.error(error.message.replace(/\\n/g, '\n'))
  } else {
    console.error('Unexpected error')
  }
  process.exit(1)
}

program.parse()
