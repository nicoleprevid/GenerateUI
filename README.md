# GenerateUI

GenerateUI is a CLI that reads an OpenAPI 3.x spec and generates Angular CRUD screens, typed services, routes, and menu artifacts that you can keep evolving inside your app.

This repository is a monorepo. The published CLI package is `generate-ui-cli`.

## What It Generates

From an `openapi.yaml`, `openapi.yml`, or `openapi.json`, GenerateUI can generate:

- screen schemas in `generate-ui/generated` and `generate-ui/overlays`
- route metadata in `routes.json`
- Angular routes in `routes.gen.ts`
- menu artifacts in `menu.json`, `menu.overrides.json`, and `menu.gen.ts`
- Angular feature code under `features/generated`
- a safe customization area under `features/overrides`

The generator writes source code and JSON configuration files. It is not a runtime renderer.

## Requirements

- Node.js `>= 18.20.0`
- an OpenAPI 3.x file
- an Angular project for Angular output

Incomplete specs reduce generation quality. Missing `operationId`, response schemas, or field types usually lead to weaker results.

## Install

Global:

```bash
npm install -g generate-ui-cli
```

Local:

```bash
npm install -D generate-ui-cli
```

Then check the CLI:

```bash
npx generate-ui --help
```

## Quick Start

Create `generateui-config.json` in your Angular project root:

```json
{
  "openapi": "openapi.yaml",
  "schemas": "src/generate-ui",
  "features": "src/app/features",
  "appTitle": "Store",
  "defaultRoute": "",
  "menu": {
    "autoInject": true
  },
  "views": {
    "ProductsAdmin": "cards"
  }
}
```

Line-by-line explanation:

```jsonc
{
  // Path to the OpenAPI file that GenerateUI will read as the source of truth.
  "openapi": "openapi.yaml",

  // Preferred schema output folder. GenerateUI first uses this value from generateui-config.json
  // when it exists; if no schema/output path is configured, it falls back to its internal resolution logic.
  "schemas": "src/generate-ui",

  // Folder where Angular feature code will be generated.
  "features": "src/app/features",

  // Title shown in the injected menu/layout when menu auto-injection is enabled.
  "appTitle": "Store",

  // Default route to redirect to from the app root. Empty means no explicit default redirect.
  "defaultRoute": "",

  "menu": {
    // When true, GenerateUI tries to inject its base menu layout into the Angular app.
    "autoInject": true
  },

  "views": {
    // Sets the preferred default view for this generated screen. Here, ProductsAdmin starts in cards mode.
    "ProductsAdmin": "cards"
  }
}
```

Run the default flow:

```bash
generate-ui generate
```

This command:

1. reads the OpenAPI file
2. creates or updates screen schemas
3. generates Angular code from those schemas

Schema path resolution follows this order:

1. CLI argument such as `--output` or `--schemas` when the command supports it
2. `output` or `schemas` from `generateui-config.json`
3. inferred location based on the configured features path, when applicable
4. fallback to `src/generate-ui` if the current project has a `src/` folder, otherwise `generate-ui` at the project root

## CLI Commands

Default flow:

```bash
generate-ui generate
```

Useful options:

- `--openapi <path>`
- `--output <path>`
- `--features <path>`
- `--watch`
- `--debug`

Advanced flow:

```bash
generate-ui schema
generate-ui angular
```

- `schema` generates screen schemas and menu metadata from OpenAPI
- `angular` generates Angular code from `overlays/*.screen.json`
- `angular` watches `*.screen.json` by default
- `generate-ui angular --no-watch` runs once and exits

Merge generated vs customized files:

```bash
generate-ui merge --feature ProductsAdmin
```

Optional authentication flow for licensed/dev features:

```bash
generate-ui login
```

## Generated Structure

Typical output:

```txt
src/generate-ui/
  generated/
  overlays/
  menu.json
  menu.overrides.json
  menu.gen.ts
  routes.json
  routes.gen.ts
src/app/features/
  generated/
  overrides/
```

Behavior:

- `generated/` is regenerated
- `overlays/` is the editable source for screen-level customization
- `features/generated/` is regenerated
- `features/overrides/` is preserved for manual changes

On the first Angular generation, the CLI can seed `features/overrides/` from generated output to start the customization flow.

## Customization

Main customization points:

- edit `generate-ui/overlays/*.screen.json` for labels, fields, layout hints, and table/card behavior
- edit `generate-ui/menu.overrides.json` for menu labels, groups, and order
- edit `generateui-config.json` for `appTitle`, `defaultRoute`, `menu.autoInject`, and per-screen `views`

Supported view values currently include table/list-style output and cards. In practice, `list` is treated as table-style rendering.

When `defaultRoute` is configured, the Angular step attempts to inject that redirect into the app routes. When `menu.autoInject` is not `false`, the Angular step also attempts to inject the base menu layout/styles into the host app.

## Safe Regeneration Workflow

Recommended flow:

1. update the OpenAPI spec
2. run `generate-ui generate`
3. review `src/generate-ui/overlays`
4. review generated Angular output
5. compare customized files with `generate-ui merge --feature <Feature>`

This is the intended split:

- change generation inputs in `overlays/`
- keep hand-edited Angular code in `features/overrides/`
- expect `features/generated/` to be overwritten

## Telemetry

The CLI includes telemetry hooks for install and command usage. The global flag `--no-telemetry` disables telemetry for a command run.

User config is also stored under `~/.generateui/`.

## Local Development

Repository structure:

- `apps/cli`: published CLI package
- `apps/web-auth`: web auth app
- `packages/shared`: shared code placeholder

Root scripts:

```bash
npm run build:cli
```

## License

MIT
