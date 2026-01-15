export function syncOverlay(base: any, overlay?: any) {
  if (!overlay) return base

  return {
    ...base,

    layout: overlay.layout ?? base.layout,
    actions: overlay.actions ?? base.actions,

    fields: mergeFields(base.fields, overlay.fields)
  }
}
function mergeFields(base: any[], overlay: any[] = []) {
  const overlayMap = new Map(overlay.map(f => [f.name, f]))

  return base.map(baseField => {
    const custom = overlayMap.get(baseField.name)

    if (!custom) return baseField

    return {
      ...baseField,
      ...custom,
      required: baseField.required
    }
  })
}
