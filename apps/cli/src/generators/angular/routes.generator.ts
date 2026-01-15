import fs from 'fs'
import path from 'path'

export function generateRoutes(routes: any[], featuresRoot: string) {
  const appRoot = path.resolve(featuresRoot, '..')
  const out = path.join(appRoot, 'generated', 'routes.gen.ts')

  fs.mkdirSync(path.dirname(out), { recursive: true })

  const content = `
import { Routes } from '@angular/router'

export const generatedRoutes: Routes = [
${routes
  .flatMap(r => {
    const base = `  {
    path: '${r.path}',
    loadComponent: () =>
      import('../features/${r.folder}/${r.fileBase}.component')
        .then(m => m.${r.component})
  }`

    const pascal = toPascalCase(r.path)
    if (pascal === r.path) return [base]

    const alias = `  {
    path: '${pascal}',
    loadComponent: () =>
      import('../features/${r.folder}/${r.fileBase}.component')
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
