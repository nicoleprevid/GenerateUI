export function syncOverlay(baseForm: any, overlay?: any) {
  if (!overlay) {
    return {
      ...baseForm,
      fields: baseForm.fields.map((f: any) => ({
        ...f,
        label: null,
        placeholder: null,
        ui: null,
        validations: []
      }))
    }
  }

  const overlayByName = new Map(
    overlay.fields.map((f: any) => [f.name, f])
  )

  const syncedFields = baseForm.fields.map((baseField: any) => {
    const existing = overlayByName.get(baseField.name)

    if (!existing) {
      return {
        ...baseField,
        label: null,
        placeholder: null,
        ui: null,
        validations: []
      }
    }

    return {
      ...baseField,
      ...existing,
      required: baseField.required
    }
  })

  return {
    ...overlay,
    endpoint: baseForm.endpoint,
    method: baseForm.method,
    fields: syncedFields
  }
}
