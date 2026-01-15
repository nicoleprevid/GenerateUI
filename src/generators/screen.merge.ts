type Meta = {
  id: string
  source: 'api' | 'user'
  lastChangedBy: 'api' | 'user'
  introducedBy: 'api' | 'user'
  openapiVersion: string
  autoAdded?: boolean
  userRemoved?: boolean
}

type MergeOptions = {
  openapiVersion: string
  debug?: boolean
}

type MergeResult = {
  screen: any
  debug: string[]
}

const PRESENTATION_KEYS = [
  'label',
  'placeholder',
  'hint',
  'info',
  'ui',
  'group',
  'hidden'
]

export function mergeScreen(
  nextScreen: any,
  overlay: any | null,
  prevGenerated: any | null,
  options: MergeOptions
): MergeResult {
  const debug: string[] = []

  if (!overlay) {
    return { screen: normalizeScreen(nextScreen, options), debug }
  }

  const normalizedNext = normalizeScreen(nextScreen, options)
  const normalizedOverlay = normalizeScreen(overlay, options, 'user')
  const normalizedPrev = prevGenerated
    ? normalizeScreen(prevGenerated, options)
    : null

  const merged = {
    ...normalizedNext,
    entity: normalizedOverlay.entity ?? normalizedNext.entity,
    screen: normalizedOverlay.screen ?? normalizedNext.screen,
    layout: normalizedOverlay.layout ?? normalizedNext.layout,
    actions: mergeActions(
      normalizedNext.actions,
      normalizedOverlay.actions
    )
  }

  merged.api = {
    ...normalizedNext.api,
    pathParams: mergeFieldList(
      normalizedNext.api?.pathParams ?? [],
      normalizedOverlay.api?.pathParams ?? [],
      normalizedPrev?.api?.pathParams ?? [],
      options,
      debug,
      'path'
    ),
    queryParams: mergeFieldList(
      normalizedNext.api?.queryParams ?? [],
      normalizedOverlay.api?.queryParams ?? [],
      normalizedPrev?.api?.queryParams ?? [],
      options,
      debug,
      'query'
    )
  }

  merged.fields = mergeFieldList(
    normalizedNext.fields ?? [],
    normalizedOverlay.fields ?? [],
    normalizedPrev?.fields ?? [],
    options,
    debug,
    'body'
  )

  merged.meta = mergeMeta(
    normalizedNext.meta,
    normalizedOverlay.meta,
    options.openapiVersion
  )

  return { screen: merged, debug }
}

function mergeActions(nextActions: any, overlayActions: any) {
  if (!overlayActions) return nextActions
  const merged = { ...nextActions }
  if (overlayActions.primary?.label) {
    merged.primary = merged.primary || {}
    merged.primary.label = overlayActions.primary.label
  }
  return merged
}

function mergeFieldList(
  nextFields: any[],
  overlayFields: any[],
  prevFields: any[],
  options: MergeOptions,
  debug: string[],
  scope: 'body' | 'query' | 'path'
) {
  const nextMap = indexById(nextFields, scope)
  const overlayMap = indexById(overlayFields, scope)
  const prevMap = indexById(prevFields, scope)

  const result: any[] = []
  const overlayOrder = overlayFields.map(field => getId(field, scope))
  const used = new Set<string>()

  for (const id of overlayOrder) {
    const overlayField = overlayMap.get(id)
    const nextField = nextMap.get(id)
    const prevField = prevMap.get(id)
    used.add(id)

    if (!nextField) {
      debug.push(`REMOVED_BY_API ${id}`)
      continue
    }

    if (overlayField?.meta?.userRemoved) {
      result.push({
        ...nextField,
        hidden: true,
        meta: {
          ...mergeMeta(nextField.meta, overlayField.meta, options.openapiVersion),
          userRemoved: true,
          lastChangedBy: 'user'
        }
      })
      debug.push(`PRESERVE_USER_REMOVED ${id}`)
      continue
    }

    result.push(
      mergeField(nextField, overlayField, prevField, options, debug)
    )
  }

  for (const [id, nextField] of nextMap.entries()) {
    if (used.has(id)) continue
    const prevField = prevMap.get(id)

    if (prevField && !overlayMap.has(id)) {
      result.push({
        ...nextField,
        hidden: true,
        meta: {
          ...mergeMeta(nextField.meta, prevField.meta, options.openapiVersion),
          userRemoved: true,
          lastChangedBy: 'user'
        }
      })
      debug.push(`USER_REMOVED_TOMBSTONE ${id}`)
      continue
    }

    const autoAdded = !nextField.required
    result.push({
      ...nextField,
      hidden: autoAdded ? true : nextField.hidden,
      meta: {
        ...mergeMeta(nextField.meta, nextField.meta, options.openapiVersion),
        autoAdded
      }
    })
    debug.push(`ADDED_BY_API ${id}`)
  }

  return result
}

function mergeField(
  nextField: any,
  overlayField: any,
  prevField: any,
  options: MergeOptions,
  debug: string[]
) {
  const merged = { ...nextField }
  const meta = mergeMeta(
    nextField.meta,
    overlayField?.meta,
    options.openapiVersion
  )

  for (const key of PRESENTATION_KEYS) {
    if (overlayField && overlayField[key] !== undefined) {
      merged[key] = overlayField[key]
    }
  }

  if (prevField && prevField.required !== nextField.required) {
    if (nextField.required) {
      merged.hidden = false
      debug.push(`OPTIONAL_TO_REQUIRED ${meta.id}`)
    } else {
      debug.push(`REQUIRED_TO_OPTIONAL ${meta.id}`)
    }
  }

  if (prevField && prevField.type !== nextField.type) {
    merged.ui = undefined
    merged.options = nextField.options ?? null
    debug.push(`TYPE_CHANGED ${meta.id}`)
  }

  const prevEnum = Array.isArray(prevField?.options)
  const nextEnum = Array.isArray(nextField?.options)
  if (prevEnum && !nextEnum) {
    merged.options = null
    debug.push(`ENUM_TO_STRING ${meta.id}`)
  }
  if (!prevEnum && nextEnum) {
    merged.options = nextField.options
    debug.push(`STRING_TO_ENUM ${meta.id}`)
  }

  merged.meta = meta
  return merged
}

function normalizeScreen(
  screen: any,
  options: MergeOptions,
  fallbackSource: 'api' | 'user' = 'api'
) {
  if (!screen) return screen
  const openapiVersion = options.openapiVersion
  const meta = screen.meta || buildMeta(
    screen.api?.operationId || 'screen',
    fallbackSource,
    openapiVersion
  )

  return {
    ...screen,
    meta,
    fields: normalizeFieldList(screen.fields, 'body', fallbackSource, openapiVersion),
    api: {
      ...screen.api,
      pathParams: normalizeFieldList(screen.api?.pathParams, 'path', fallbackSource, openapiVersion),
      queryParams: normalizeFieldList(screen.api?.queryParams, 'query', fallbackSource, openapiVersion)
    }
  }
}

function normalizeFieldList(
  list: any[] | undefined,
  scope: 'body' | 'query' | 'path',
  fallbackSource: 'api' | 'user',
  openapiVersion: string
) {
  if (!Array.isArray(list)) return []
  return list.map(field => ({
    ...field,
    meta: field.meta || buildMeta(
      `${scope}:${field.name}`,
      fallbackSource,
      openapiVersion
    )
  }))
}

function indexById(
  fields: any[],
  scope: 'body' | 'query' | 'path'
) {
  const map = new Map<string, any>()
  for (const field of fields) {
    map.set(getId(field, scope), field)
  }
  return map
}

function getId(field: any, scope: 'body' | 'query' | 'path') {
  return field?.meta?.id || `${scope}:${field?.name}`
}

function mergeMeta(
  nextMeta: Meta,
  overlayMeta: Meta | undefined,
  openapiVersion: string
) {
  const base = {
    ...(nextMeta || overlayMeta),
    openapiVersion
  } as Meta

  if (overlayMeta) {
    base.source = overlayMeta.source || base.source
    base.introducedBy = overlayMeta.introducedBy || base.introducedBy
    base.lastChangedBy = overlayMeta.lastChangedBy || base.lastChangedBy
    base.userRemoved = overlayMeta.userRemoved || base.userRemoved
  }

  return base
}

function buildMeta(
  id: string,
  source: 'api' | 'user',
  openapiVersion: string
) {
  return {
    id,
    source,
    lastChangedBy: source,
    introducedBy: source,
    openapiVersion,
    autoAdded: false,
    userRemoved: false
  }
}
