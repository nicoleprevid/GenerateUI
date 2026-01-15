import { Features } from './permissions'

export function requireFeature(
  features: Features,
  featureKey: keyof Features,
  reason?: string
) {
  if (!features[featureKey]) {
    const details = reason ? ` ${reason}` : ''
    throw new Error(
      `Requires Dev plan.${details} Execute \`generate-ui login\` to continue.`
    )
  }
}
