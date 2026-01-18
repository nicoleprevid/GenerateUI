# GenerateUI CLI

Generate CRUD screens (List, Create/Edit, Delete), typed API services, and routes from your OpenAPI spec with real Angular code you can own and evolve.

Goal: stop rewriting repetitive CRUD and start with a functional, scalable UI foundation.

## What GenerateUI Does

Given an `openapi.yaml` (or `.json`), GenerateUI can generate:

- `screens.json` (detected screens/endpoints)
- one folder per feature/screen
- typed API services and DTOs
- plug-and-play routes
- basic CRUD UI (list + form + delete confirmation)
- UI states (loading / empty / error)

GenerateUI is code generation, not runtime rendering.

## Before You Start (Quick Checklist)

You will need:

- Node.js (LTS recommended)
- A valid OpenAPI v3.x file
- An Angular project (for Angular generation) > v.15
- Optional: a design system (Material, PrimeNG, internal DS)

Important:
- Incomplete OpenAPI specs (missing schemas, responses, or types) may limit what can be generated.
- Some public APIs require query params (e.g. `fields=...`). Make sure your API calls actually work.

## Installation

### Global install
```bash
npm install -g generate-ui-cli
```

### Local install
```bash
npm install -D generate-ui-cli
```

Then run:
```bash
npx generate-ui --help
```

## Recommended Workflow

GenerateUI works in two main steps:

1. Read the OpenAPI and generate `screens.json`
2. Generate Angular code from `screens.json`

## 1) Generate `screens.json`

```bash
generate-ui generate --openapi openapiWeather.yaml
```

What happens after this command:

- GenerateUI reads your OpenAPI and detects endpoints.
- It identifies CRUD-like operations (list, get by id, create, update, delete).
- It maps request/response schemas.
- A `screens.json` file is created in the output folder.
- Two JSON folders are created: `generated/` (auto-created files) and `override/` (your manual edits that should be preserved on regeneration).

What you should review now:

- Are all expected screens present?
- Are screen and route names correct?
- Are required query params represented?
- Do the detected fields match your API schemas?

Tip: this is the best moment to adjust naming and structure before generating code.

## 2) Generate Angular code from `screens.json`

```bash
generate-ui angular \
  --schemas /Users/nicoleprevid/Downloads/generateui-playground/frontend/src/app/assets/generate-ui \
  --features /Users/nicoleprevid/Downloads/generateui-playground/frontend/src/app/features
```

What happens after this command:

- For each screen defined in `screens.json`, GenerateUI creates:
  - a feature folder
  - list and form components (create/edit)
  - a typed API service
  - DTO/types files
  - route definitions

What you should review now:

- Are files generated in the correct location?
- Does the project compile?
- Are routes correctly generated and importable?
- Does the basic UI work end-to-end?

Note:
If your project uses custom routing, standalone components, or advanced layouts, you may need to adjust how routes are plugged in.

## Login (Dev plan)

```bash
generate-ui login
```

What happens after this command:

- You authenticate your device to unlock Dev features.
- Dev features include safe regeneration, UI overrides, and unlimited generations.

## Telemetry

GenerateUI collects anonymous usage data such as CLI version, OS, and executed commands to improve the product.
No source code or OpenAPI content is ever sent.
Telemetry can be disabled by setting `telemetry=false` in `~/.generateui/config.json` or by running with `--no-telemetry`.

## Plugging Routes into Your App

GenerateUI usually creates route files such as:

- `generated.routes.ts`
- or per feature: `users.routes.ts`, `orders.routes.ts`

Example (Angular Router):

```ts
import { GENERATED_ROUTES } from './app/generated/generated.routes';

export const routes = [
  // ...your existing routes
  ...GENERATED_ROUTES
];
```

Things to pay attention to:

- route prefixes (`/admin`, `/app`, etc.)
- authentication guards
- layout components (`<router-outlet>` placement)

## Example Generated Structure

```txt
src/app/generated/
  users/
    users-list.component.ts
    users-form.component.ts
    users.routes.ts
    users.service.ts
    users.types.ts
  orders/
    orders-list.component.ts
    orders-form.component.ts
    orders.routes.ts
    orders.service.ts
    orders.types.ts
  generated.routes.ts
```

## After Generation: How to Customize Safely

GenerateUI gives you a working baseline. From here, you typically:

- Customize UI (design system components, masks, validators)
- Add business logic (conditional fields, permissions)
- Improve UX (pagination, filtering, empty/error states)

Rule of thumb: the generated code is yours — generate once, then evolve freely.

## Overrides and Regeneration Behavior

You can edit files inside `override/` to customize labels, placeholders, hints, and other details. When your API changes and you regenerate, GenerateUI updates what is safe to change from the OpenAPI, but preserves what you defined in `override/` to avoid breaking your flow.

Even after the Angular TypeScript files are generated, changes you make in `override/` will be mirrored the next time you regenerate.

## Common Issues and Fixes

### "required option '-o, --openapi <path>' not specified"

You ran the command without passing the OpenAPI file.

Fix:
```bash
generate-ui generate --openapi /path/to/openapi.yaml
```

### "An endpoint exists but no screen was generated"

This may happen if:

- `operationId` is missing
- request/response schemas are empty
- required response codes (`200`, `201`) are missing

Recommendation:

- always define `operationId`
- include schemas in responses

### "Routes were generated but navigation does not work"

Usually a routing integration issue.

Check:

- if `GENERATED_ROUTES` is imported/spread
- if route prefixes match your menu
- if there is a `<router-outlet>` in your layout

## Team Workflow Recommendation

1. Update OpenAPI
2. Generate `screens.json`
3. Review `screens.json`
4. Generate Angular code
5. Customize UI and business rules
6. Commit

## Tips for Better Results

- Use consistent `operationId`s (`users_list`, `users_create`, etc.)
- Define complete schemas (types, required, enums)
- Standardize responses (`200`, `201`, `204`)
- Document important query params (pagination, filters)
- If your API requires `fields=...`, reflect it in `screens.json`

## Roadmap (Example)

- [ ] Layout presets (minimal / enterprise / dashboard)
- [ ] Design system adapters (Material / PrimeNG / custom)
- [ ] Filters and real pagination
- [ ] UI schema overrides (visual control without touching OpenAPI)
- [ ] React support

## Contributing

Issues and PRs are welcome.
If you use GenerateUI in a company or real project, let us know — it helps guide the roadmap.

## License

MIT

## Local Files

- `~/.generateui/device.json`
- `~/.generateui/token.json`
