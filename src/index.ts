#!/usr/bin/env node
import { Command } from 'commander'
import { generate } from './commands/generate'

const program = new Command()

program
  .name('generate-ui')
  .description('Generate UI forms from OpenAPI')
  .version('1.0.0')

program
  .command('generate')
  .requiredOption('-o, --openapi <path>', 'OpenAPI file')
  .action(async (options: { openapi: string }) => {
    await generate({
      openapi: options.openapi
    })
  })

program.parse()
