import fs from 'fs'
import path from 'path'

type UiField = {
  name: string
  type: string
  required: boolean
  label: string
  placeholder: string
  source: 'path' | 'body'
}

export function generateFeature(schema: any, root: string) {
  const name = schema.api.operationId
  const folder = toFolderName(name)
  const fileBase = toFileBase(name)

  const featureDir = path.join(root, folder)
  fs.mkdirSync(featureDir, { recursive: true })

  const appRoot = path.resolve(root, '..')
  ensureUiComponents(appRoot)

  const method = String(schema.api.method || '').toLowerCase()
  const endpoint = String(schema.api.endpoint || '')
  const pathParams = extractPathParams(endpoint)
  const bodyFields = normalizeFields(schema.fields || [])
  const paramFields = pathParams.map(param => ({
    name: param,
    type: 'string',
    required: true,
    label: toLabel(param),
    placeholder: toPlaceholder(param),
    source: 'path' as const
  }))

  const includeBody = ['post', 'put', 'patch'].includes(method)
  const includeParams =
    pathParams.length > 0 &&
    (includeBody || ['get', 'delete'].includes(method))

  const formFields: UiField[] = [
    ...(includeParams ? paramFields : []),
    ...(includeBody ? bodyFields : [])
  ]

  const actionLabel =
    schema.actions?.primary?.label ||
    defaultActionLabel(method, includeParams)

  const title =
    schema.entity && String(schema.entity).trim()
      ? String(schema.entity).trim()
      : name

  const subtitle = `${method.toUpperCase()} ${endpoint}`

  /**
   * 1️⃣ Component (sempre sobrescreve)
   */
  const componentPath = path.join(
    featureDir,
    `${fileBase}.component.ts`
  )
  fs.writeFileSync(
    componentPath,
    `
import { Component } from '@angular/core'
import { JsonPipe, NgIf } from '@angular/common'
import { FormBuilder, ReactiveFormsModule } from '@angular/forms'
import { UiCardComponent } from '../../ui/ui-card/ui-card.component'
import { UiFieldComponent } from '../../ui/ui-field/ui-field.component'
import { UiButtonComponent } from '../../ui/ui-button/ui-button.component'
import { ${name}Service } from './${fileBase}.service.gen'
import { ${name}Gen } from './${fileBase}.gen'

@Component({
  selector: 'app-${toKebab(name)}',
  standalone: true,
  imports: [
    NgIf,
    JsonPipe,
    ReactiveFormsModule,
    UiCardComponent,
    UiFieldComponent,
    UiButtonComponent
  ],
  templateUrl: './${fileBase}.component.html',
  styleUrls: ['./${fileBase}.component.scss']
})
export class ${name}Component extends ${name}Gen {
  constructor(
    protected override fb: FormBuilder,
    protected override service: ${name}Service
  ) {
    super(fb, service)
  }

  submit() {
    const value = this.form.getRawValue()
    const params = this.pick(value, ${JSON.stringify(pathParams)})
    const body = this.pick(
      value,
      ${JSON.stringify(bodyFields.map(field => field.name))}
    )

    this.loading = true
    this.error = null

    this.service
      .execute(params, body)
      .subscribe({
        next: result => {
          this.result = result
          this.loading = false
        },
        error: error => {
          this.error = error
          this.loading = false
        }
      })
  }
}
`
  )

  /**
   * 2️⃣ Arquivo gerado (sempre sobrescreve)
   */
  const genTsPath = path.join(featureDir, `${fileBase}.gen.ts`)
  fs.writeFileSync(
    genTsPath,
    `
import { FormBuilder, FormGroup, Validators } from '@angular/forms'
import { Injectable } from '@angular/core'
import { ${name}Service } from './${fileBase}.service.gen'

@Injectable()
export class ${name}Gen {
  constructor(
    protected fb: FormBuilder,
    protected service: ${name}Service
  ) {
    this.form = this.fb.group({
${buildFormControls(formFields)}
    })
  }

  form!: FormGroup
  loading = false
  result: any = null
  error: any = null

  protected pick(source: Record<string, any>, keys: string[]) {
    const out: Record<string, any> = {}
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        out[key] = source[key]
      }
    }
    return out
  }
}
`
  )

  /**
   * 3️⃣ Service gerado
   */
  const wrap = schema.api?.submit?.wrap
  const servicePath = path.join(
    featureDir,
    `${fileBase}.service.gen.ts`
  )
  const httpCall = httpCallForMethod(method)
  fs.writeFileSync(
    servicePath,
    `
import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'

@Injectable({ providedIn: 'root' })
export class ${name}Service {
  private readonly baseUrl = 'https://api.realworld.io/api'
  private readonly endpoint = '${endpoint}'
  private readonly pathParams = ${JSON.stringify(pathParams)}

  constructor(private http: HttpClient) {}

  execute(pathParams: Record<string, any>, payload: Record<string, any>) {
    const url = this.buildUrl(pathParams)
    const body = this.buildBody(payload)
    ${httpCall}
  }

  private buildUrl(pathParams: Record<string, any>) {
    let url = \`\${this.baseUrl}\${this.endpoint}\`
    for (const key of this.pathParams) {
      const value = pathParams?.[key]
      url = url.replace(\`{\${key}}\`, encodeURIComponent(String(value)))
    }
    return url
  }

  private buildBody(payload: Record<string, any>) {
    const cleaned = payload ?? {}
    ${wrap ? `return { ${wrap}: cleaned }` : 'return cleaned'}
  }
}
`
  )

  /**
   * 4️⃣ HTML base (sempre sobrescreve)
   */
  const htmlPath = path.join(
    featureDir,
    `${fileBase}.component.html`
  )
  fs.writeFileSync(
    htmlPath,
    buildComponentHtml({
      title,
      subtitle,
      formFields,
      actionLabel,
      method,
      hasForm: formFields.length > 0
    })
  )

  /**
   * 5️⃣ SCSS base
   */
  const scssPath = path.join(
    featureDir,
    `${fileBase}.component.scss`
  )
  fs.writeFileSync(
    scssPath,
    `
:host {
  display: block;
  padding: 24px;
}

.page {
  display: grid;
  gap: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}

.result {
  margin-top: 20px;
  padding: 16px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.25);
  overflow: auto;
}
`
  )

  return {
    path: toRouteSegment(name),
    component: `${name}Component`,
    folder,
    fileBase
  }
}

function normalizeFields(fields: any[]): UiField[] {
  return fields.map(field => ({
    name: field.name,
    type: field.type || 'string',
    required: Boolean(field.required),
    label: field.label || toLabel(field.name),
    placeholder: field.placeholder || toPlaceholder(field.name),
    source: 'body' as const
  }))
}

function extractPathParams(endpoint: string): string[] {
  const params = []
  const regex = /{([^}]+)}/g
  let match = regex.exec(endpoint)
  while (match) {
    params.push(match[1])
    match = regex.exec(endpoint)
  }
  return params
}

function buildFormControls(fields: UiField[]) {
  if (fields.length === 0) return ''
  return fields
    .map(field => {
      const value = defaultValueFor(field.type)
      const validators = field.required ? ', Validators.required' : ''
      return `    ${field.name}: [${value}${validators}]`
    })
    .join(',\n')
}

function defaultValueFor(type: string) {
  switch (type) {
    case 'array':
      return '[]'
    case 'boolean':
      return 'false'
    case 'number':
    case 'integer':
      return 'null'
    default:
      return "''"
  }
}

function toLabel(value: string) {
  return String(value)
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function toPlaceholder(value: string) {
  return toLabel(value)
}

function defaultActionLabel(method: string, hasParams: boolean) {
  switch (method) {
    case 'get':
      return hasParams ? 'Buscar' : 'Carregar'
    case 'post':
      return 'Criar'
    case 'put':
    case 'patch':
      return 'Salvar'
    case 'delete':
      return 'Excluir'
    default:
      return 'Executar'
  }
}

function buildComponentHtml(options: {
  title: string
  subtitle: string
  formFields: UiField[]
  actionLabel: string
  method: string
  hasForm: boolean
}) {
  const fieldsHtml = options.formFields
    .map(field => buildFieldHtml(field))
    .join('\n')

  const buttonVariant =
    options.method === 'delete' ? 'danger' : 'primary'

  if (!options.hasForm) {
    return `
<div class="page">
  <ui-card title="${options.title}" subtitle="${options.subtitle}">
    <div class="actions">
      <ui-button variant="${buttonVariant}" (click)="submit()">
        ${options.actionLabel}
      </ui-button>
    </div>
  </ui-card>
</div>
`
  }

  return `
<div class="page">
  <ui-card title="${options.title}" subtitle="${options.subtitle}">
    <form [formGroup]="form" (ngSubmit)="submit()">
      <div class="form-grid">
${fieldsHtml}
      </div>
      <div class="actions">
        <ui-button type="submit" variant="${buttonVariant}">
          ${options.actionLabel}
        </ui-button>
      </div>
    </form>
  </ui-card>

  <pre class="result" *ngIf="result">{{ result | json }}</pre>
</div>
`
}

function buildFieldHtml(field: UiField) {
  const isTextarea = /body|description|content/i.test(field.name)
  const inputType = inputTypeFor(field.type)
  if (isTextarea) {
    return `        <ui-field label="${field.label}">
          <textarea rows="4" formControlName="${field.name}" placeholder="${field.placeholder}"></textarea>
        </ui-field>`
  }
  return `        <ui-field label="${field.label}">
          <input type="${inputType}" formControlName="${field.name}" placeholder="${field.placeholder}" />
        </ui-field>`
}

function inputTypeFor(type: string) {
  switch (type) {
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'checkbox'
    default:
      return 'text'
  }
}

function httpCallForMethod(method: string) {
  switch (method) {
    case 'get':
      return 'return this.http.get(url)'
    case 'delete':
      return 'return this.http.delete(url)'
    case 'post':
      return 'return this.http.post(url, body)'
    case 'put':
      return 'return this.http.put(url, body)'
    case 'patch':
      return 'return this.http.patch(url, body)'
    default:
      return 'return this.http.get(url)'
  }
}

function ensureUiComponents(appRoot: string) {
  const uiRoot = path.join(appRoot, 'ui')
  const components = [
    {
      name: 'ui-card',
      template: `
import { Component, Input } from '@angular/core'
import { NgIf } from '@angular/common'

@Component({
  selector: 'ui-card',
  standalone: true,
  imports: [NgIf],
  templateUrl: './ui-card.component.html',
  styleUrls: ['./ui-card.component.scss']
})
export class UiCardComponent {
  @Input() title?: string
  @Input() subtitle?: string
}
`,
      html: `
<section class="ui-card">
  <header class="ui-card__header" *ngIf="title || subtitle">
    <h2 class="ui-card__title" *ngIf="title">{{ title }}</h2>
    <p class="ui-card__subtitle" *ngIf="subtitle">{{ subtitle }}</p>
  </header>
  <div class="ui-card__body">
    <ng-content></ng-content>
  </div>
</section>
`,
      scss: `
:host {
  display: block;
}

.ui-card {
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  padding: 20px;
}

.ui-card__header {
  margin-bottom: 16px;
}

.ui-card__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.ui-card__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: #64748b;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
`
    },
    {
      name: 'ui-field',
      template: `
import { Component, Input } from '@angular/core'
import { NgIf } from '@angular/common'

@Component({
  selector: 'ui-field',
  standalone: true,
  imports: [NgIf],
  templateUrl: './ui-field.component.html',
  styleUrls: ['./ui-field.component.scss']
})
export class UiFieldComponent {
  @Input() label = ''
  @Input() hint = ''
}
`,
      html: `
<label class="ui-field">
  <span class="ui-field__label" *ngIf="label">{{ label }}</span>
  <ng-content></ng-content>
  <span class="ui-field__hint" *ngIf="hint">{{ hint }}</span>
</label>
`,
      scss: `
:host {
  display: block;
}

.ui-field {
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: #334155;
}

.ui-field__label {
  font-weight: 600;
}

.ui-field__hint {
  color: #94a3b8;
  font-size: 12px;
}

input,
textarea,
select {
  width: 100%;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

input:focus,
textarea:focus,
select:focus {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2);
}
`
    },
    {
      name: 'ui-button',
      template: `
import { Component, Input } from '@angular/core'
import { NgClass } from '@angular/common'

@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [NgClass],
  templateUrl: './ui-button.component.html',
  styleUrls: ['./ui-button.component.scss']
})
export class UiButtonComponent {
  @Input() type: 'button' | 'submit' | 'reset' = 'button'
  @Input() variant: 'primary' | 'ghost' | 'danger' = 'primary'
  @Input() disabled = false
}
`,
      html: `
<button
  class="ui-button"
  [ngClass]="variant"
  [attr.type]="type"
  [disabled]="disabled"
>
  <ng-content></ng-content>
</button>
`,
      scss: `
.ui-button {
  border: none;
  border-radius: 999px;
  padding: 10px 18px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.ui-button.primary {
  background: linear-gradient(120deg, #0ea5e9, #38bdf8);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(14, 165, 233, 0.35);
}

.ui-button.ghost {
  background: #f1f5f9;
  color: #0f172a;
}

.ui-button.danger {
  background: linear-gradient(120deg, #ef4444, #f97316);
  color: #fff;
  box-shadow: 0 12px 24px rgba(239, 68, 68, 0.35);
}

.ui-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.ui-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}
`
    }
  ]

  fs.mkdirSync(uiRoot, { recursive: true })

  for (const component of components) {
    const componentDir = path.join(uiRoot, component.name)
    fs.mkdirSync(componentDir, { recursive: true })

    const base = component.name
    const tsPath = path.join(componentDir, `${base}.component.ts`)
    const htmlPath = path.join(componentDir, `${base}.component.html`)
    const scssPath = path.join(componentDir, `${base}.component.scss`)

    if (!fs.existsSync(tsPath)) {
      fs.writeFileSync(tsPath, component.template.trimStart())
    }
    if (!fs.existsSync(htmlPath)) {
      fs.writeFileSync(htmlPath, component.html.trimStart())
    }
    if (!fs.existsSync(scssPath)) {
      fs.writeFileSync(scssPath, component.scss.trimStart())
    }
  }
}

function toRouteSegment(operationId: string) {
  if (!operationId) return operationId
  return operationId[0].toLowerCase() + operationId.slice(1)
}

function toFolderName(operationId: string) {
  return toFileBase(operationId)
}

function toFileBase(operationId: string) {
  return operationId
}

function toKebab(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
}
