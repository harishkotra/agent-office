import * as RAPIER from '@dimforge/rapier3d-compat'

let ready: Promise<void> | null = null

// rapier3d-compat inlines its wasm. init() uses those bytes.
// Do not also import rapier_wasm3d_bg.wasm; that file would ship and never load.
export function initPhysics() {
  if (!ready) {
    ready = RAPIER.init().catch((error: unknown) => {
      ready = null
      throw error
    })
  }
  return ready
}
