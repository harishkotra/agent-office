import * as RAPIER from '@dimforge/rapier3d-compat'
import wasmUrl from '@dimforge/rapier3d-compat/rapier_wasm3d_bg.wasm?url'

let ready: Promise<void> | null = null

// rapier3d-compat 0.14 publishes a broken default wasm URL (`"<deleted>"`).
// Pass the real file once; later init() calls from the physics view reuse it.
export function initPhysics() {
  if (!ready) {
    ready = (RAPIER.init as (module?: string) => Promise<void>)(wasmUrl).catch((error) => {
      ready = null
      throw error
    })
  }
  return ready
}
