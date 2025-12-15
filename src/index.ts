#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('generate-ui')
  .description('Generate Angular UI from OpenAPI + UI metadata')
  .version('0.0.1');

program
  .command('generate')
  .description('Generate UI')
  .requiredOption('-o, --openapi <path>', 'OpenAPI file')
  .requiredOption('-u, --ui <path>', 'UI config file')
  .requiredOption('-d, --output <path>', 'Output directory')
  .action((options) => {
    console.log('Generate called with:', options);
  });


program.parse();
