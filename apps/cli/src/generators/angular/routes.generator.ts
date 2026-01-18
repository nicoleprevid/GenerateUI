import fs from 'fs'
import path from 'path'

export function generateRoutes(
  routes: any[],
  featuresRoot: string,
  schemasRoot: string
) {
  const out = path.join(schemasRoot, 'routes.gen.ts')
  const featuresImportBase = buildRelativeImportBase(
    schemasRoot,
    featuresRoot
  )

  fs.mkdirSync(path.dirname(out), { recursive: true })

  const content = `
import { Routes } from '@angular/router'

export const generatedRoutes: Routes = [
${routes
  .flatMap(r => {
    const baseImport = ensureRelativeImport(
      toPosixPath(
        path.join(
          featuresImportBase,
          r.folder,
          `${r.fileBase}.component`
        )
      )
    )
    const base = `  {
    path: '${r.path}',
    loadComponent: () =>
      import('${baseImport}')
        .then(m => m.${r.component})
  }`

    const pascal = toPascalCase(r.path)
    if (pascal === r.path) return [base]

    const alias = `  {
    path: '${pascal}',
    loadComponent: () =>
      import('${baseImport}')
        .then(m => m.${r.component})
  }`

    return [base, alias]
  })
  .join(',\n')}
]
`

  fs.writeFileSync(out, content)
}

function toPascalCase(value: string) {
  if (!value) return value
  return value[0].toUpperCase() + value.slice(1)
}

function buildRelativeImportBase(
  fromDir: string,
  toDir: string
) {
  let relativePath = path.relative(fromDir, toDir)
  relativePath = toPosixPath(relativePath)
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`
  }
  return relativePath
}

function toPosixPath(value: string) {
  return value.split(path.sep).join(path.posix.sep)
}

function ensureRelativeImport(value: string) {
  if (value.startsWith('.')) return value
  return `./${value}`
}
