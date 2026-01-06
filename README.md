# GenerateUI
Generate Angular admin screens from OpenAPI + UI JSON.
# OpenAPI Angular UI Generator

Generate Angular admin screens from OpenAPI + UI JSON.

## Install
npx oa-ui generate --config oa-ui.config.json

## Status
🚧 Early MVP — form screens only

## Comandos 
npm run dev -- generate \
  -o ./openapi.yaml \
  -d ./out

npm run build

node dist/index.js generate --help

node ../generateui/dist/index.js generate \
  --openapi ./openapi.yaml \
  --output ./generated


node dist/index.js generate \
  --openapi /Users/nicoleprevid/Downloads/generateui-playground/realWorldOpenApi.yaml\
  --output /Users/nicoleprevid/Downloads/generateui-playground/generated

node dist/index.js generate --openapi /Users/nicoleprevid/Downloads/generateui-playground/realWorldOpenApi.yaml


node dist/index.js generate --openapi /Users/nicoleprevid/Downloads/generateui-playground/frontend/src/realWorldOpenApi.yaml