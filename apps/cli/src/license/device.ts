import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

export interface DeviceIdentity {
  deviceId: string
  createdAt: string
  freeGenerationsUsed: number
}

const CONFIG_DIR = path.join(os.homedir(), '.generateui')
const DEVICE_PATH = path.join(CONFIG_DIR, 'device.json')

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

function newDeviceIdentity(): DeviceIdentity {
  const deviceId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex')

  return {
    deviceId,
    createdAt: new Date().toISOString(),
    freeGenerationsUsed: 0
  }
}

export function loadDeviceIdentity(): DeviceIdentity {
  ensureConfigDir()

  if (!fs.existsSync(DEVICE_PATH)) {
    const identity = newDeviceIdentity()
    fs.writeFileSync(DEVICE_PATH, JSON.stringify(identity, null, 2))
    return identity
  }

  const raw = fs.readFileSync(DEVICE_PATH, 'utf-8')
  try {
    const parsed = JSON.parse(raw) as DeviceIdentity
    if (!parsed.deviceId) {
      throw new Error('Invalid device identity')
    }
    return parsed
  } catch {
    const identity = newDeviceIdentity()
    fs.writeFileSync(DEVICE_PATH, JSON.stringify(identity, null, 2))
    return identity
  }
}

export function saveDeviceIdentity(identity: DeviceIdentity) {
  ensureConfigDir()
  fs.writeFileSync(DEVICE_PATH, JSON.stringify(identity, null, 2))
}

export function incrementFreeGeneration() {
  const identity = loadDeviceIdentity()
  identity.freeGenerationsUsed += 1
  saveDeviceIdentity(identity)
  return identity
}
