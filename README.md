# GenerateUI

GenerateUI transforma **OpenAPI → screen.json → Angular**, com re-geracao segura.

Ideia principal:
- **API manda na estrutura** (campos, tipos, required, endpoint).
- **Usuario manda na apresentacao** (labels, ordem, visibilidade).

## Como funciona (didatico)
1) Voce roda `generate` com um OpenAPI.
2) O GenerateUI cria arquivos `screen.json`:
   - `generated/` (sempre recriado)
   - `overlays/` (voce pode editar)
3) Voce roda `angular`, que gera features Angular.
4) A UI **le o JSON do overlay em runtime**.
   - Se voce mudar um label no JSON, a tela muda.

## Instalacao (local)
```
npm install
npm run build
```

## Passo 1 — Gerar schemas (OpenAPI → screen.json)
```
node dist/index.js generate --openapi /path/to/openapi.yaml
```

Modo debug (explica merge):
```
node dist/index.js generate --openapi /path/to/openapi.yaml --debug
```

Saidas:
- `frontend/src/app/assets/generate-ui/generated`
- `frontend/src/app/assets/generate-ui/overlays`

## Passo 2 — Gerar Angular (screen.json → Angular)
```
node dist/index.js angular \
  --schemas /path/to/frontend/src/app/assets/generate-ui \
  --features /path/to/frontend/src/app/features
```

## Onde editar (para mudar a UI)
Edite **apenas** os overlays:
```
frontend/src/app/assets/generate-ui/overlays/*.screen.json
```

O que pode mudar sem quebrar:
- `entity` (titulo)
- `actions.primary.label`
- campos: `label`, `placeholder`, `hint`, `info`
- campos: `options`, `defaultValue`
- `hidden` (ou `meta.userRemoved = true`)

O que nao deve mudar:
- `name`, `type`, `required`
- `api.operationId`, `api.endpoint`, `api.method`

## Merge seguro (resumo)
- Campo novo na API → entra como `autoAdded`, escondido se opcional.
- Campo removido da API → sai sempre.
- Campo removido pelo usuario → nunca volta.
- Required/optional muda → valida, mas nao remove.
- Enum muda → input/select se ajusta.

## Exemplo rapido (Playground)
```
node dist/index.js generate \
  --openapi /Users/nicoleprevid/Downloads/generateui-playground/realWorldOpenApi.yaml

node dist/index.js angular \
  --schemas /Users/nicoleprevid/Downloads/generateui-playground/frontend/src/app/assets/generate-ui \
  --features /Users/nicoleprevid/Downloads/generateui-playground/frontend/src/app/features
```
