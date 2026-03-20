import { Features } from './permissions'
import { getDevPlanUrl } from '../runtime/config'

export function requireFeature(
  features: Features,
  featureKey: keyof Features,
  reason?: string
) {
  if (!features[featureKey]) {
    const details = reason ? ` ${reason}` : ''
    throw new Error(
      `This feature requires an active paid subscription.${details} Upgrade: ${getDevPlanUrl()}`
    )
  }
}
