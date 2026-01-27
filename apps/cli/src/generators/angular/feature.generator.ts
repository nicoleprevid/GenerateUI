import fs from 'fs'
import path from 'path'

type UiField = {
  name: string
  type: string
  required: boolean
  label: string
  placeholder: string
  hint?: string
  info?: string
  options?: any[] | null
  defaultValue?: any | null
  source: 'path' | 'body' | 'query'
}

export function generateFeature(
  schema: any,
  root: string,
  schemasRoot: string
) {
  const rawName = schema.api.operationId
  const name = toPascalCase(rawName)
  const folder = toFolderName(name)
  const fileBase = toFileBase(name)

  const featureDir = path.join(root, folder)
  fs.mkdirSync(featureDir, { recursive: true })

  const appRoot = path.resolve(root, '..')
  ensureUiComponents(appRoot)

  const method = String(schema.api.method || '').toLowerCase()
  const endpoint = String(schema.api.endpoint || '')
  const baseUrl = String(
    schema.api.baseUrl || 'https://api.realworld.io/api'
  )
  const pathParams = extractPathParams(endpoint)
  const queryParams = normalizeQueryParams(
    schema.api?.queryParams || []
  )
  const bodyFields = normalizeFields(schema.fields || [])
  const paramFields = pathParams.map(param => ({
    name: param,
    type: 'string',
    required: true,
    label: toLabel(param),
    placeholder: toPlaceholder(param),
    source: 'path' as const
  }))

  const normalizedQueryFields = queryParams.map(field => ({
    ...field,
    source: 'query' as const
  }))

  const includeBody = ['post', 'put', 'patch'].includes(method)
  const includeParams =
    pathParams.length > 0 || queryParams.length > 0

  const formFields: UiField[] = [
    ...(includeParams
      ? [...paramFields, ...normalizedQueryFields]
      : []),
    ...(includeBody ? bodyFields : [])
  ]

  const actionLabel =
    schema.actions?.primary?.label ||
    defaultActionLabel(method, includeParams)

  const title =
    schema.entity && String(schema.entity).trim()
      ? String(schema.entity).trim()
      : rawName

  const subtitle = `${method.toUpperCase()} ${endpoint}`
  const schemaImportPath = buildSchemaImportPath(
    featureDir,
    schemasRoot,
    rawName
  )

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
import { JsonPipe, NgFor, NgIf } from '@angular/common'
import { FormBuilder, ReactiveFormsModule } from '@angular/forms'
import { UiCardComponent } from '../../ui/ui-card/ui-card.component'
import { UiButtonComponent } from '../../ui/ui-button/ui-button.component'
import { UiSelectComponent } from '../../ui/ui-select/ui-select.component'
import { UiCheckboxComponent } from '../../ui/ui-checkbox/ui-checkbox.component'
import { UiInputComponent } from '../../ui/ui-input/ui-input.component'
import { UiTextareaComponent } from '../../ui/ui-textarea/ui-textarea.component'
import { ${name}Service } from './${fileBase}.service.gen'
import { ${name}Gen } from './${fileBase}.gen'
import screenSchema from '${schemaImportPath}'

@Component({
  selector: 'app-${toKebab(name)}',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    JsonPipe,
    ReactiveFormsModule,
    UiCardComponent,
    UiButtonComponent,
    UiSelectComponent,
    UiCheckboxComponent,
    UiInputComponent,
    UiTextareaComponent
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
    this.setSchema(screenSchema as any)
  }

  submit() {
    const value = this.form.getRawValue()
    const pathParams = this.pick(value, this.pathParamNames)
    const queryParams = this.pick(value, this.queryParamNames)
    const body = this.pick(value, this.bodyFieldNames)

    this.loading = true
    this.error = null

    this.service
      .execute(pathParams, queryParams, body)
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

  isArrayResult() {
    return this.getRows().length > 0
  }

  getRows() {
    const value = this.result
    if (Array.isArray(value)) return value
    if (!value || typeof value !== 'object') return []

    const commonKeys = ['data', 'items', 'results', 'list', 'records']
    for (const key of commonKeys) {
      if (Array.isArray(value[key])) return value[key]
    }

    for (const key of Object.keys(value)) {
      if (Array.isArray(value[key])) return value[key]
    }

    return []
  }

  getColumns() {
    const raw = this.form.get('fields')?.value
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw
        .split(',')
        .map((value: string) => value.trim())
        .filter(Boolean)
    }

    const rows = this.getRows()
    if (rows.length > 0 && rows[0] && typeof rows[0] === 'object') {
      return Object.keys(rows[0])
    }

    return []
  }

  formatHeader(value: string) {
    return value
      .replace(/[_-]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, char => char.toUpperCase())
  }

  getCellValue(row: any, column: string) {
    if (!row || !column) return ''

    if (column.includes('.')) {
      return column
        .split('.')
        .reduce((acc, key) => (acc ? acc[key] : undefined), row) ?? ''
    }

    const value = row[column]
    return this.formatValue(value)
  }

  isImageCell(row: any, column: string) {
    const value = this.getCellValue(row, column)
    return (
      typeof value === 'string' &&
      /^https?:\\/\\//.test(value) &&
      /(\\.png|\\.jpg|\\.jpeg|\\.svg)/i.test(value)
    )
  }

  private formatValue(value: any): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value)
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    if (Array.isArray(value)) {
      return value
        .map((item: any) => this.formatValue(item))
        .join(', ')
    }
    if (typeof value === 'object') {
      if (typeof value.common === 'string') return value.common
      if (typeof value.official === 'string') return value.official
      if (typeof value.name === 'string') return value.name
      if (typeof value.label === 'string') return value.label
      return JSON.stringify(value)
    }
    return String(value)
  }

  getObjectRows() {
    const value = this.result
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return []
    }
    return this.flattenObject(value)
  }

  private flattenObject(
    value: Record<string, any>,
    prefix = ''
  ) {
    const rows: Array<{ key: string; value: string }> = []
    for (const [key, raw] of Object.entries(value)) {
      const fullKey = prefix ? prefix + '.' + key : key
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        rows.push(...this.flattenObject(raw, fullKey))
        continue
      }
      rows.push({ key: fullKey, value: this.formatValue(raw) })
    }
    return rows
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
  form!: FormGroup
  formFields: any[] = []
  protected pathParamNames: string[] = []
  protected queryParamNames: string[] = []
  protected bodyFieldNames: string[] = []
  schema: any

  loading = false
  result: any = null
  error: any = null

  constructor(
    protected fb: FormBuilder,
    protected service: ${name}Service
  ) {
    this.form = this.fb.group({})
  }

  setSchema(schema: any) {
    this.schema = schema
    this.formFields = this.buildFormFields(schema)
    this.form = this.fb.group({})
    for (const field of this.formFields) {
      const value = this.resolveDefault(field)
      const validators = field.required ? [Validators.required] : []
      this.form.addControl(
        field.name,
        this.fb.control(value, validators)
      )
    }
  }

  protected pick(source: Record<string, any>, keys: string[]) {
    const out: Record<string, any> = {}
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        out[key] = source[key]
      }
    }
    return out
  }

  protected isSelect(field: any) {
    if (field?.ui === 'select' || field?.ui === 'dropdown') return true
    return Array.isArray(field.options) && field.options.length > 0
  }

  protected getSelectOptions(field: any) {
    if (Array.isArray(field.options) && field.options.length > 0) {
      return field.options
    }
    return []
  }

  protected isCheckbox(field: any) {
    if (field?.ui === 'select' || field?.ui === 'dropdown') return false
    return field.type === 'boolean'
  }

  protected isTextarea(field: any) {
    return /body|description|content/i.test(field.name)
  }

  protected inputType(field: any) {
    switch (field.type) {
      case 'number':
      case 'integer':
        return 'number'
      default:
        return 'text'
    }
  }

  protected isInvalid(field: any) {
    const control = this.form.get(field.name)
    return !!(control?.invalid && (control.touched || control.dirty))
  }

  private buildFormFields(schema: any) {
    const fields = Array.isArray(schema?.fields)
      ? schema.fields
          .filter(
            (field: any) =>
              !field?.hidden && !field?.meta?.userRemoved
          )
      : []

    const queryParams = Array.isArray(schema?.api?.queryParams)
      ? schema.api.queryParams.filter(
          (field: any) =>
            !field?.hidden && !field?.meta?.userRemoved
        )
      : []

    const pathParamsSource = Array.isArray(schema?.api?.pathParams)
      ? schema.api.pathParams
      : this.extractPathParams(schema?.api?.endpoint ?? '').map(
          (name: string) => ({
            name,
            type: 'string',
            required: true,
            label: name,
            placeholder: name,
            source: 'path'
          })
        )

    const pathParams = pathParamsSource.filter(
      (field: any) =>
        !field?.hidden && !field?.meta?.userRemoved
    )

    this.pathParamNames = pathParams.map((p: any) => p.name)
    this.queryParamNames = queryParams.map((p: any) => p.name)
    this.bodyFieldNames = fields.map((f: any) => f.name)

    return [...pathParams, ...queryParams, ...fields]
  }

  private extractPathParams(endpoint: string) {
    const params = []
    const regex = /{([^}]+)}/g
    let match = regex.exec(endpoint)
    while (match) {
      params.push(match[1])
      match = regex.exec(endpoint)
    }
    return params
  }

  private resolveDefault(field: any) {
    if (field.defaultValue !== null && field.defaultValue !== undefined) {
      return field.defaultValue
    }
    switch (field.type) {
      case 'array':
        return []
      case 'boolean':
        return false
      case 'number':
      case 'integer':
        return null
      default:
        return ''
    }
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
  private readonly baseUrl = '${baseUrl}'
  private readonly endpoint = '${endpoint}'
  private readonly pathParams = ${JSON.stringify(pathParams)}

  constructor(private http: HttpClient) {}

  execute(
    pathParams: Record<string, any>,
    queryParams: Record<string, any>,
    payload: Record<string, any>
  ) {
    const url = this.buildUrl(pathParams, queryParams)
    const body = this.buildBody(payload)
    ${httpCall}
  }

  private buildUrl(
    pathParams: Record<string, any>,
    queryParams: Record<string, any>
  ) {
    let url = \`\${this.baseUrl}\${this.endpoint}\`
    for (const key of this.pathParams) {
      const value = pathParams?.[key]
      url = url.replace(\`{\${key}}\`, encodeURIComponent(String(value)))
    }
    const query = this.buildQuery(queryParams)
    if (query) {
      url += \`?\${query}\`
    }
    return url
  }

  private buildQuery(queryParams: Record<string, any>) {
    const params = new URLSearchParams()
    for (const key of Object.keys(queryParams || {})) {
      const value = queryParams[key]
      if (value === undefined || value === null || value === '') continue
      const out = Array.isArray(value) ? value.join(',') : String(value)
      params.set(key, out)
    }
    return params.toString()
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

.screen-description {
  margin: 0 0 18px;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.5;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
}

.form-field {
  display: grid;
  gap: 8px;
}

.field-error {
  color: #ef4444;
  font-size: 12px;
  margin-top: -4px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  margin-top: 20px;
  flex-wrap: wrap;
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

.result-table {
  margin-top: 20px;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}

.result-card {
  margin-top: 20px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
  padding: 18px;
}

.result-card__grid {
  display: grid;
  gap: 12px;
}

.result-card__row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 10px;
}

.result-card__row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.result-card__label {
  font-weight: 600;
  color: #475569;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.result-card__value {
  color: #0f172a;
  font-weight: 600;
  text-align: right;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  background: #ffffff;
  font-size: 14px;
}

.data-table thead {
  background: #f8fafc;
}

.data-table th,
.data-table td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  color: #0f172a;
  vertical-align: middle;
}

.data-table th {
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #475569;
}

.data-table tbody tr:hover {
  background: #f1f5f9;
}

.cell-image {
  width: 44px;
  height: 28px;
  object-fit: cover;
  border-radius: 6px;
  box-shadow: 0 6px 12px rgba(15, 23, 42, 0.16);
}

@media (max-width: 720px) {
  :host {
    padding: 18px;
  }

  .form-grid {
    grid-template-columns: 1fr;
    max-width: 100%;
  }

  .actions {
    justify-content: stretch;
  }
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
    hint: field.hint || undefined,
    info: field.info || undefined,
    options: field.options || null,
    defaultValue: field.defaultValue ?? null,
    source: 'body' as const
  }))
}

function normalizeQueryParams(params: any[]): UiField[] {
  return params.map(param => {
    const labelText = param.label || param.name
    const hintText =
      param.hint ||
      (typeof labelText === 'string' && labelText.length > 60
        ? labelText
        : '')
    const help = resolveFieldHelp(hintText, labelText)
    return {
      name: param.name,
      type: param.type || 'string',
      required: Boolean(param.required),
      label: toLabel(param.name),
      placeholder: param.placeholder || toPlaceholder(param.name),
      hint: help.hint,
      info: help.info,
      options: param.options || null,
      defaultValue: param.defaultValue ?? null,
      source: 'query' as const
    }
  })
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
      const value =
        field.defaultValue !== null && field.defaultValue !== undefined
          ? JSON.stringify(field.defaultValue)
          : defaultValueFor(field.type)
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

function normalizeWhitespace(value: string) {
  return String(value).replace(/\s+/g, ' ').trim()
}

function resolveFieldHelp(rawHint: string, label: string) {
  const hint = normalizeWhitespace(rawHint || '')
  if (!hint) return { hint: undefined, info: undefined }
  if (hint.length > 120) {
    return { hint: undefined, info: hint }
  }
  return { hint, info: undefined }
}

function escapeAttr(value: string) {
  return String(value).replace(/"/g, '&quot;')
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
  const buttonVariant =
    options.method === 'delete' ? 'danger' : 'primary'

  if (!options.hasForm) {
    return `
<div class="page">
  <ui-card title="${options.title}" subtitle="${options.subtitle}">
    <div class="actions">
      <ui-button
        variant="${buttonVariant}"
        [disabled]="form.invalid"
        (click)="submit()"
      >
        ${options.actionLabel}
      </ui-button>
    </div>
  </ui-card>
</div>
`
  }

  return `
<div class="page">
  <ui-card [title]="schema.entity || schema.api.operationId" [subtitle]="schema.api.method.toUpperCase() + ' ' + schema.api.endpoint">
    <p class="screen-description" *ngIf="schema.description">
      {{ schema.description }}
    </p>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <div class="form-grid">
        <div class="form-field" *ngFor="let field of formFields">
          <ui-select
            *ngIf="isSelect(field)"
            [label]="field.label || field.name"
            [hint]="field.hint"
            [info]="field.info"
            [controlName]="field.name"
            [options]="getSelectOptions(field)"
            [invalid]="isInvalid(field)"
          ></ui-select>

          <ui-textarea
            *ngIf="isTextarea(field)"
            [label]="field.label || field.name"
            [hint]="field.hint"
            [info]="field.info"
            [controlName]="field.name"
            [rows]="3"
            [placeholder]="field.placeholder || field.label || field.name"
            [invalid]="isInvalid(field)"
          ></ui-textarea>

          <ui-checkbox
            *ngIf="isCheckbox(field)"
            [label]="field.label || field.name"
            [hint]="field.hint"
            [info]="field.info"
            [controlName]="field.name"
            [invalid]="isInvalid(field)"
          ></ui-checkbox>

          <ui-input
            *ngIf="!isSelect(field) && !isTextarea(field) && !isCheckbox(field)"
            [label]="field.label || field.name"
            [hint]="field.hint"
            [info]="field.info"
            [type]="inputType(field)"
            [controlName]="field.name"
            [placeholder]="field.placeholder || field.label || field.name"
            [invalid]="isInvalid(field)"
          ></ui-input>

          <span class="field-error" *ngIf="isInvalid(field)">
            Campo obrigatório
          </span>
        </div>
      </div>
      <div class="actions">
        <ui-button
          type="submit"
          variant="${buttonVariant}"
          [disabled]="form.invalid"
        >
          ${options.actionLabel}
        </ui-button>
      </div>
    </form>
  </ui-card>

  <div class="result-table" *ngIf="isArrayResult()">
    <table class="data-table">
      <thead>
        <tr>
          <th *ngFor="let column of getColumns()">
            {{ formatHeader(column) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let row of getRows()">
          <td *ngFor="let column of getColumns()">
            <img
              *ngIf="isImageCell(row, column)"
              [src]="getCellValue(row, column)"
              [alt]="formatHeader(column)"
              class="cell-image"
            />
            <span *ngIf="!isImageCell(row, column)">
              {{ getCellValue(row, column) }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="result-card" *ngIf="!isArrayResult() && result">
    <div class="result-card__grid">
      <div class="result-card__row" *ngFor="let row of getObjectRows()">
        <span class="result-card__label">
          {{ formatHeader(row.key) }}
        </span>
        <span class="result-card__value">
          {{ row.value }}
        </span>
      </div>
    </div>
  </div>
</div>
`
}

function buildFieldHtml(field: UiField) {
  return ''
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
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: var(--shadow-card);
  padding: 30px;
  position: relative;
  overflow: hidden;
}

.ui-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 6px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-primary-strong), var(--color-accent));
  opacity: 0.65;
}

.ui-card__header {
  margin-bottom: 18px;
}

.ui-card__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: var(--bg-ink);
  letter-spacing: -0.02em;
}

.ui-card__subtitle {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--color-muted);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-family: "Space Mono", "Courier New", monospace;
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
  @Input() info = ''
  infoOpen = false

  toggleInfo(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.infoOpen = !this.infoOpen
  }
}
`,
      html: `
<label class="ui-field">
  <span class="ui-field__label" *ngIf="label">
    {{ label }}
    <button
      class="ui-field__info"
      type="button"
      *ngIf="info"
      (click)="toggleInfo($event)"
      [attr.aria-expanded]="infoOpen"
    >
      i
    </button>
  </span>
  <div class="ui-field__info-panel" *ngIf="info && infoOpen">
    {{ info }}
  </div>
  <ng-content></ng-content>
  <span class="ui-field__hint" *ngIf="hint && !info">{{ hint }}</span>
</label>
`,
      scss: `
:host {
  display: block;
}

.ui-field {
  display: grid;
  gap: 10px;
  font-size: 13px;
  color: #1f2937;
}

.ui-field__label {
  font-weight: 700;
  line-height: 1.4;
  word-break: break-word;
  letter-spacing: 0.01em;
}

.ui-field__hint {
  color: #94a3b8;
  font-size: 12px;
}

.ui-field__info {
  margin-left: 8px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.2);
  background: #ffffff;
  color: #475569;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.ui-field__info:hover {
  background: #f8fafc;
}

.ui-field__info-panel {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 12px;
  line-height: 1.4;
}

:host ::ng-deep input,
:host ::ng-deep textarea {
  width: 100%;
  min-height: 3.4rem;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #ffffff;
  padding: 0.9rem 1.1rem;
  font-size: 15px;
  font-weight: 500;
  box-shadow: none;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

:host ::ng-deep input:focus,
:host ::ng-deep textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.2);
  transform: translateY(-1px);
}

:host ::ng-deep input.invalid,
:host ::ng-deep textarea.invalid {
  border-color: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
}

:host ::ng-deep input::placeholder,
:host ::ng-deep textarea::placeholder {
  color: #94a3b8;
}

:host ::ng-deep input[type='checkbox'] {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 6px;
  box-shadow: none;
  accent-color: var(--color-primary);
}

.field-error {
  color: #ef4444;
  font-size: 12px;
  margin-top: -4px;
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
  padding: 12px 24px;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.ui-button.primary {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-strong));
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(8, 145, 178, 0.3);
}

.ui-button.ghost {
  background: #f9fafb;
  color: #111827;
}

.ui-button.danger {
  background: linear-gradient(135deg, #ef4444, #f97316);
  color: #fff;
  box-shadow: 0 10px 22px rgba(239, 68, 68, 0.25);
}

.ui-button:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.02);
}

.ui-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}
`
    },
    {
      name: 'ui-input',
      template: `
import { Component, Input } from '@angular/core'
import { NgIf } from '@angular/common'
import {
  ControlContainer,
  FormGroupDirective,
  ReactiveFormsModule
} from '@angular/forms'

@Component({
  selector: 'ui-input',
  standalone: true,
  imports: [NgIf, ReactiveFormsModule],
  viewProviders: [
    { provide: ControlContainer, useExisting: FormGroupDirective }
  ],
  templateUrl: './ui-input.component.html',
  styleUrls: ['./ui-input.component.scss']
})
export class UiInputComponent {
  @Input() label = ''
  @Input() hint = ''
  @Input() info = ''
  @Input() controlName = ''
  @Input() placeholder = ''
  @Input() type: 'text' | 'number' | 'email' | 'password' | 'search' | 'tel' | 'url' = 'text'
  @Input() invalid = false
  infoOpen = false

  toggleInfo(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.infoOpen = !this.infoOpen
  }
}
`,
      html: `
<label class="ui-control">
  <span class="ui-control__label" *ngIf="label">
    {{ label }}
    <button
      class="ui-control__info"
      type="button"
      *ngIf="info"
      (click)="toggleInfo($event)"
      [attr.aria-expanded]="infoOpen"
    >
      i
    </button>
  </span>
  <div class="ui-control__info-panel" *ngIf="info && infoOpen">
    {{ info }}
  </div>
  <input
    class="ui-control__input"
    [type]="type"
    [formControlName]="controlName"
    [placeholder]="placeholder"
    [class.invalid]="invalid"
  />
  <span class="ui-control__hint" *ngIf="hint && !info">{{ hint }}</span>
</label>
`,
      scss: `
:host {
  display: block;
}

.ui-control {
  display: grid;
  gap: 10px;
  font-size: 13px;
  color: #1f2937;
}

.ui-control__label {
  font-weight: 700;
  line-height: 1.4;
  word-break: break-word;
  letter-spacing: 0.01em;
}

.ui-control__hint {
  color: #94a3b8;
  font-size: 12px;
}

.ui-control__info {
  margin-left: 8px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.2);
  background: #ffffff;
  color: #475569;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.ui-control__info:hover {
  background: #f8fafc;
}

.ui-control__info-panel {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 12px;
  line-height: 1.4;
}

.ui-control__input {
  width: 100%;
  min-height: 3.4rem;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #ffffff;
  padding: 0.9rem 1.1rem;
  font-size: 15px;
  font-weight: 500;
  box-shadow: none;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.ui-control__input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.2);
  transform: translateY(-1px);
}

.ui-control__input.invalid {
  border-color: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
}

.ui-control__input::placeholder {
  color: #94a3b8;
}
`
    },
    {
      name: 'ui-textarea',
      template: `
import { Component, Input } from '@angular/core'
import { NgIf } from '@angular/common'
import {
  ControlContainer,
  FormGroupDirective,
  ReactiveFormsModule
} from '@angular/forms'

@Component({
  selector: 'ui-textarea',
  standalone: true,
  imports: [NgIf, ReactiveFormsModule],
  viewProviders: [
    { provide: ControlContainer, useExisting: FormGroupDirective }
  ],
  templateUrl: './ui-textarea.component.html',
  styleUrls: ['./ui-textarea.component.scss']
})
export class UiTextareaComponent {
  @Input() label = ''
  @Input() hint = ''
  @Input() info = ''
  @Input() controlName = ''
  @Input() placeholder = ''
  @Input() rows = 3
  @Input() invalid = false
  infoOpen = false

  toggleInfo(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.infoOpen = !this.infoOpen
  }
}
`,
      html: `
<label class="ui-control">
  <span class="ui-control__label" *ngIf="label">
    {{ label }}
    <button
      class="ui-control__info"
      type="button"
      *ngIf="info"
      (click)="toggleInfo($event)"
      [attr.aria-expanded]="infoOpen"
    >
      i
    </button>
  </span>
  <div class="ui-control__info-panel" *ngIf="info && infoOpen">
    {{ info }}
  </div>
  <textarea
    class="ui-control__input"
    [formControlName]="controlName"
    [rows]="rows"
    [placeholder]="placeholder"
    [class.invalid]="invalid"
  ></textarea>
  <span class="ui-control__hint" *ngIf="hint && !info">{{ hint }}</span>
</label>
`,
      scss: `
:host {
  display: block;
}

.ui-control {
  display: grid;
  gap: 10px;
  font-size: 13px;
  color: #1f2937;
}

.ui-control__label {
  font-weight: 700;
  line-height: 1.4;
  word-break: break-word;
  letter-spacing: 0.01em;
}

.ui-control__hint {
  color: #94a3b8;
  font-size: 12px;
}

.ui-control__info {
  margin-left: 8px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.2);
  background: #ffffff;
  color: #475569;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.ui-control__info:hover {
  background: #f8fafc;
}

.ui-control__info-panel {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 12px;
  line-height: 1.4;
}

.ui-control__input {
  width: 100%;
  min-height: 3.4rem;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #ffffff;
  padding: 0.9rem 1.1rem;
  font-size: 15px;
  font-weight: 500;
  box-shadow: none;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.ui-control__input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.2);
  transform: translateY(-1px);
}

.ui-control__input.invalid {
  border-color: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
}

.ui-control__input::placeholder {
  color: #94a3b8;
}
`
    },
    {
      name: 'ui-select',
      template: `
import { Component, Input } from '@angular/core'
import { NgFor, NgIf } from '@angular/common'
import {
  ControlContainer,
  FormGroupDirective,
  ReactiveFormsModule
} from '@angular/forms'

@Component({
  selector: 'ui-select',
  standalone: true,
  imports: [NgFor, NgIf, ReactiveFormsModule],
  viewProviders: [
    { provide: ControlContainer, useExisting: FormGroupDirective }
  ],
  templateUrl: './ui-select.component.html',
  styleUrls: ['./ui-select.component.scss']
})
export class UiSelectComponent {
  @Input() label = ''
  @Input() hint = ''
  @Input() info = ''
  @Input() controlName = ''
  @Input() options: any[] = []
  @Input() invalid = false
  infoOpen = false

  toggleInfo(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.infoOpen = !this.infoOpen
  }
}
`,
      html: `
<label class="ui-control">
  <span class="ui-control__label" *ngIf="label">
    {{ label }}
    <button
      class="ui-control__info"
      type="button"
      *ngIf="info"
      (click)="toggleInfo($event)"
      [attr.aria-expanded]="infoOpen"
    >
      i
    </button>
  </span>
  <div class="ui-control__info-panel" *ngIf="info && infoOpen">
    {{ info }}
  </div>
  <select
    class="ui-control__select"
    [formControlName]="controlName"
    [class.invalid]="invalid"
  >
    <option *ngFor="let option of options" [value]="option">
      {{ option }}
    </option>
  </select>
  <span class="ui-control__hint" *ngIf="hint && !info">{{ hint }}</span>
</label>
`,
      scss: `
:host {
  display: block;
}

.ui-control {
  display: grid;
  gap: 10px;
  font-size: 13px;
  color: #1f2937;
}

.ui-control__label {
  font-weight: 700;
  line-height: 1.4;
  word-break: break-word;
  letter-spacing: 0.01em;
}

.ui-control__hint {
  color: #94a3b8;
  font-size: 12px;
}

.ui-control__info {
  margin-left: 8px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.2);
  background: #ffffff;
  color: #475569;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.ui-control__info:hover {
  background: #f8fafc;
}

.ui-control__info-panel {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 12px;
  line-height: 1.4;
}

.ui-control__select {
  width: 100%;
  min-height: 3.4rem;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #ffffff;
  padding: 0.9rem 2.6rem 0.9rem 1.1rem;
  font-size: 15px;
  font-weight: 500;
  box-shadow: none;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='8' viewBox='0 0 14 8' fill='none'><path d='M1 1.5L7 6.5L13 1.5' stroke='%236b7280' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 0.9rem center;
  background-size: 14px 8px;
  appearance: none;
}

.ui-control__select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.2);
  transform: translateY(-1px);
}

.ui-control__select.invalid {
  border-color: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
}
`
    },
    {
      name: 'ui-checkbox',
      template: `
import { Component, Input } from '@angular/core'
import { NgIf } from '@angular/common'
import {
  ControlContainer,
  FormGroupDirective,
  ReactiveFormsModule
} from '@angular/forms'

@Component({
  selector: 'ui-checkbox',
  standalone: true,
  imports: [NgIf, ReactiveFormsModule],
  viewProviders: [
    { provide: ControlContainer, useExisting: FormGroupDirective }
  ],
  templateUrl: './ui-checkbox.component.html',
  styleUrls: ['./ui-checkbox.component.scss']
})
export class UiCheckboxComponent {
  @Input() label = ''
  @Input() hint = ''
  @Input() info = ''
  @Input() controlName = ''
  @Input() invalid = false
  infoOpen = false

  toggleInfo(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.infoOpen = !this.infoOpen
  }
}
`,
      html: `
<label class="ui-control">
  <span class="ui-control__label" *ngIf="label">
    {{ label }}
    <button
      class="ui-control__info"
      type="button"
      *ngIf="info"
      (click)="toggleInfo($event)"
      [attr.aria-expanded]="infoOpen"
    >
      i
    </button>
  </span>
  <div class="ui-control__info-panel" *ngIf="info && infoOpen">
    {{ info }}
  </div>
  <input
    class="ui-control__checkbox"
    type="checkbox"
    [formControlName]="controlName"
    [class.invalid]="invalid"
  />
  <span class="ui-control__hint" *ngIf="hint && !info">{{ hint }}</span>
</label>
`,
      scss: `
:host {
  display: block;
}

.ui-control {
  display: grid;
  gap: 10px;
  font-size: 13px;
  color: #1f2937;
}

.ui-control__label {
  font-weight: 700;
  line-height: 1.4;
  word-break: break-word;
  letter-spacing: 0.01em;
}

.ui-control__hint {
  color: #94a3b8;
  font-size: 12px;
}

.ui-control__info {
  margin-left: 8px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.2);
  background: #ffffff;
  color: #475569;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.ui-control__info:hover {
  background: #f8fafc;
}

.ui-control__info-panel {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 12px;
  line-height: 1.4;
}

.ui-control__checkbox {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 6px;
  box-shadow: none;
  accent-color: var(--color-primary);
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

    const needsUiFieldUpdate = component.name === 'ui-field'
    const shouldOverwrite = (filePath: string, marker?: string) => {
      if (!fs.existsSync(filePath)) return true
      if (needsUiFieldUpdate) return true
      if (!marker) return true
      const existing = fs.readFileSync(filePath, 'utf-8')
      return !existing.includes(marker)
    }

    if (shouldOverwrite(tsPath, 'infoOpen')) {
      fs.writeFileSync(tsPath, component.template.trimStart())
    }
    if (shouldOverwrite(htmlPath, 'ui-control__info-panel')) {
      fs.writeFileSync(htmlPath, component.html.trimStart())
    }
    if (shouldOverwrite(scssPath, 'ui-control__info-panel')) {
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

function toPascalCase(value: string) {
  if (!value) return 'Generated'
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('')
}

function buildSchemaImportPath(
  featureDir: string,
  schemasRoot: string,
  rawName: string
) {
  const schemaFile = path.join(
    schemasRoot,
    'overlays',
    `${rawName}.screen.json`
  )
  let relativePath = path.relative(featureDir, schemaFile)
  relativePath = toPosixPath(relativePath)

  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`
  }

  return relativePath
}

function toPosixPath(value: string) {
  return value.split(path.sep).join(path.posix.sep)
}
