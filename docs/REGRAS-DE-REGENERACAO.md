# Regras de Geracao e Regeneracao (consolidado)

Este documento registra as regras que foram definidas e implementadas neste ciclo.
Ele complementa o README com foco em comportamento, limites e decisoes de produto.

## 1) Modelo de uso: config-first

Regra:
- O fluxo padrao nao deve depender de paths nos comandos.
- O usuario deve rodar na raiz do projeto Angular.

Comandos padrao:
- `generate-ui generate` (fluxo completo: schemas + Angular)
- `generate-ui merge --feature <FeatureName>`

Comandos avancados (quando necessario):
- `generate-ui schema` (somente schemas)
- `generate-ui angular` (somente Angular a partir dos overlays existentes)

Onde o CLI busca configuracao:
- `generateui-config.json` na raiz do projeto (ou ancestrais).
- Nao considerar `frontend/generateui-config.json`.

## 2) Estrutura esperada do projeto

Regra:
- Considerar projeto Angular com `src/`.
- Nao usar mais convencao `frontend/src/...`.

Defaults:
- Schemas: `src/generate-ui` (fallback: `generate-ui`).
- Features: `src/app/features`.

## 3) Arquivo generateui-config.json

Campos aceitos para paths:
- `openapi`
- `schemas`
- `features`
- ou `paths.openapi|schemas|features`

Campos de UX/layout:
- `appTitle`
- `defaultRoute`
- `menu.autoInject`
- `views`

Exemplo recomendado:

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
    "ProductsAdmin": "cards",
    "getProducts": "list",
    "CharacterAdmin": "cards"
  }
}
```

Observacao:
- `list` e tratado como visualizacao de lista/tabela no fluxo atual.

## 4) Regras de `generate` (OpenAPI -> screen schemas)

Regra base:
- `generated/*.screen.json`: sempre sobrescrito.
- `overlays/*.screen.json`:
  - com `uiOverrides + safeRegeneration`: merge semantico (preserva customizacoes seguras);
  - sem esses recursos: overlay pode ser recriado/sobrescrito.

Outras regras:
- Remove overlays orfaos quando endpoint sai da OpenAPI.
- `menu.overrides.json`: criado uma vez, nunca sobrescrito automaticamente.
- `generateui-config.json`: criado apenas se nao existir.

Views default na primeira geracao:
- Todas as operacoes geradas recebem `views[operationId] = "list"` (se ainda nao existir).
- Telas Admin inteligentes recebem `views[AdminOperationId] = "cards"` (se ainda nao existir).

## 5) Regras de `angular` (screen schemas -> codigo Angular)

Regra base:
- Gera em `features/generated` (area regeneravel).
- Mantem `features/overrides` (area de customizacao).

Sincronizacao:
- Se `overrides` estiver vazio na primeira execucao, ele e semeado a partir de `generated`.
- Rotas e menu sao regenerados a partir do estado atual dos overlays.

## 6) Watch de overlays

Regra:
- `generate-ui angular` roda em watch por padrao.
- Para rodar uma vez e sair: `generate-ui angular --no-watch`.
- `generate-ui generate` (fluxo completo) roda uma vez por padrao.
- Para manter watch no fluxo completo: `generate-ui generate --watch`.

Comportamento:
- Observa `*.screen.json` em `src/generate-ui/overlays`.
- A cada alteracao, regenera Angular automaticamente.

## 7) Campos permitidos e bloqueados no overlay

Objetivo:
- Evitar que mudancas estruturais quebrem a geracao.

Bloqueados no overlay (alteracao ignorada e revertida para base gerada):
- `screen.type`
- `screen.mode`
- `api.method`
- `api.operationId`

Permitido no overlay:
- `api.endpoint` (para cenarios como teste local, mock, proxy etc).

Quando um campo bloqueado e alterado:
- O CLI imprime warning explicito.
- O valor aplicado na geracao volta para o valor da base gerada.

## 8) Mudancas de config vs mudancas de overlay

Mudou overlay (`*.screen.json`):
- Com watch ativo (padrao): espelha automaticamente no Angular.

Mudou `generateui-config.json`:
- Nao e monitorado em watch no fluxo atual.
- Recomendado rerodar `generate-ui generate` (fluxo completo) para reaplicar layout/views/defaultRoute/menu.

Mudou OpenAPI:
- `generate-ui generate` ja cobre o fluxo completo (schemas + Angular).
- `schema` e `angular` separados existem para uso avancado.

## 9) Instalacao: seed automatico de config

Regra implementada no postinstall:
- Em instalacao local (nao global), se detectar projeto Angular (`package.json` + `src/app`) e nao existir config, cria `generateui-config.json` base.
- Nao sobrescreve arquivo existente.
- Tenta detectar `openapi.yaml|yml|json` na raiz; fallback `openapi.yaml`.

## 10) Licenca e resiliencia offline/intermitencia

Regra ajustada:
- Se usuario esta logado (token valido), API falha, e existe cache de permissoes (mesmo expirado), usar ultimo cache conhecido para nao bloquear o fluxo.
- Objetivo: evitar quebra total de geracao por indisponibilidade temporaria da API.

## 11) Diretriz de produto para campos estruturais

Decisao:
- Campos que alteram fluxo estrutural de tela nao devem ser customizados via overlay.
- Se houver necessidade de controle desses comportamentos, preferir chave explicita em `generateui-config.json` ou evolucao dedicada do schema com validacao.

Racional:
- Reduz risco de regressao silenciosa.
- Mantem previsibilidade da geracao.
- Separa configuracao de apresentacao/comportamento seguro de alteracoes estruturais.

## 12) Schema Contract oficial (`.screen.json`)

Regra obrigatoria de produto:
- Deve existir um contrato oficial do schema para o arquivo `.screen.json`.
- Esse contrato deve dizer, de forma objetiva, o que pode e o que nao pode ser alterado manualmente.

Status atual do contrato (implementado):
- Permitido alterar:
  - `response.format`
  - `data.table.columns[*].label`
  - `data.table.columns[*].visible`
  - `api.endpoint`
- Bloqueado (alteracao ignorada na regeneracao Angular):
  - `screen.type`
  - `screen.mode`
  - `api.method`
  - `api.operationId`

Contrato recomendado para publicacao:
- Publicar uma secao fixa no README com:
  - Campos livres (safe to customize)
  - Campos protegidos (structural/managed by generator)
  - Efeito de cada campo no output Angular
- Versionar contrato por release:
  - Ex.: `schemaContractVersion` no CLI e no documento.
  - Toda mudanca de compatibilidade deve entrar no changelog como breaking/non-breaking.

Regra de evolucao:
- Novos campos devem nascer como opt-in e com fallback seguro.
- Campos que possam quebrar estrutura devem ser controlados por config global ou feature flag, nao por overlay livre.

## 13) Estrategia atual de codigo Angular (simples)

Regra:
- O fluxo padrao usa `generated/` e `overrides/`, sem heranca obrigatoria por `*.base.ts`.
- Regeneracao sobrescreve `generated/`.
- `overrides/` permanece como area de customizacao manual.

Objetivo:
- Manter previsibilidade e simplicidade operacional.
- Tornar as mudancas de API visiveis via diff (`generated` x `overrides`) com ajuste manual guiado.

## 14) Regras do comando `merge`

Regra:
- `merge` e o fluxo recomendado para revisar diferencas entre `generated` e `overrides`.
- A saida do `angular` lista apenas features com diferenca real no `component.ts` (nao lista tudo).

Comportamento:
- Se o arquivo em `overrides` nao existir, o CLI cria a copia a partir de `generated` e segue.
- Resolucao de `--feature` e tolerante (com/sem `Component`, case, separadores).
- Se a feature nao existir, mostra lista de features disponiveis.

Tools:
- `--tool code`: abre Merge Editor do VS Code (recomendado para consolidar resultado em overrides).
- `--tool code-diff`: abre diff classico no VS Code (left/right).
- Fallbacks: `vimdiff`, `diff`, `meld`, `kdiff3`, `bc`.

Observacao de DX:
- Para usar `--tool code` ou `--tool code-diff`, e recomendado instalar o comando `code` no PATH.
