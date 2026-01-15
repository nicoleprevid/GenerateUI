# GenerateUI CLI

Generate UI from OpenAPI locally. Free works offline with 1 generation per device; Dev unlocks unlimited generation, safe regeneration, and UI overrides.

## Install
```bash
npm install -g generate-ui
```

## Usage
```bash
generate-ui generate --openapi /path/to/openapi.yaml
```

Safe regeneration (Dev):
```bash
generate-ui regenerate --openapi /path/to/openapi.yaml
```

Login (Dev):
```bash
generate-ui login
```

Telemetry can be disabled with:
```bash
generate-ui --no-telemetry generate --openapi /path/to/openapi.yaml
```

## Local files
- `~/.generateui/device.json`
- `~/.generateui/token.json`
