let verbose = false

export function setVerbose(value: boolean) {
  verbose = value
}

export function isVerbose() {
  return verbose
}

export function logDebug(message: string) {
  if (!verbose) return
  console.log(`🔎 ${message}`)
}

export function logStep(message: string) {
  if (!verbose) return
  console.log(`🧭 ${message}`)
}

export function logTip(message: string) {
  if (!verbose) return
  console.log(`💡 ${message}`)
}
