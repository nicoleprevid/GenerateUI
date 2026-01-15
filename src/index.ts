#!/usr/bin/env node
import { Command } from 'commander'
import { generate } from './commands/generate'
import { angular } from './commands/angular'

const program = new Command()

program
  .name('generate-ui')
  .description('Generate UI from OpenAPI')
  .version('1.0.0')

/**
 * 1️⃣ OpenAPI → Screen schemas
 */
program
  .command('generate')
  .description('Generate screen schemas from OpenAPI')
  .requiredOption('-o, --openapi <path>', 'OpenAPI file')
  .option('-d, --debug', 'Explain merge decisions')
  .action(async (options) => {
    await generate({
      openapi: options.openapi,
      debug: options.debug
    })
  })

/**
 * 2️⃣ Screen schemas → Angular code
 */
program
  .command('angular')
  .description('Generate Angular code from screen schemas')
  .requiredOption(
    '-s, --schemas <path>',
    'Directory containing generate-ui (with overlays/)'
  )
  .requiredOption(
    '-f, --features <path>',
    'Angular features output directory'
  )
  .action(async (options) => {
    await angular({
      schemasPath: options.schemas,
      featuresPath: options.features
    })
  })


program.parse()
