import { Component, type ReactNode, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { ACESFilmicToneMapping, SRGBColorSpace, type Object3D, type WebGLRenderer } from 'three'
import { HOMES, loadedInteriors } from '../buildings'
import { initPhysics } from '../physics'
import { CAPSULE_CENTER, sim } from '../sim'
import { TUNING } from '../tuning'
import { MARK } from '../zones'
import { EstateWorld } from '../game/world'
import { LEAK_TRIPS, reportIssues, type PerfCounts, type PerfMemory, type PerfReport } from './report'

const PAGE = 'ESTATE_' + 'PERF_PAGE'
const FIXTURE = 'PERF_' + 'FIXTURE_SAMPLETOWN'
const WARM_FRAMES = 20
const SETTLE_FRAMES = 8
const MAX_FRAMES = 2400

type Phase = 'warm' | 'grounds' | 'home' | 'out' | 'flush' | 'done'

function publish(state: 'done' | 'error', payload: unknown) {
  const node = document.getElementById('estate-perf-status')
  if (!node) return
  node.dataset.state = state
  node.dataset.page = PAGE
  node.dataset.fixture = FIXTURE
  node.textContent = JSON.stringify(payload)
}

function readSample(gl: WebGLRenderer): PerfCounts {
  return {
    calls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
  }
}

// Resources still attached to the scene. The renderer also keeps a GPU cache
// for meshes that were drawn once, so its counter stays up after a visit.
function sceneResources(root: Object3D): PerfMemory {
  const geometries = new Set<string>()
  const textures = new Set<string>()
  root.traverse((obj) => {
    const mesh = obj as Object3D & {
      geometry?: { uuid: string }
      material?: { [key: string]: unknown } | Array<{ [key: string]: unknown }>
    }
    if (mesh.geometry) geometries.add(mesh.geometry.uuid)
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value && (value as { isTexture?: boolean }).isTexture) {
          textures.add((value as unknown as { uuid: string }).uuid)
        }
      }
    }
  })
  return { geometries: geometries.size, textures: textures.size }
}

function placeSim(x: number, z: number) {
  sim.x = x
  sim.z = z
  sim.prevX = x
  sim.prevZ = z
  sim.y = CAPSULE_CENTER
  sim.prevY = CAPSULE_CENTER
  sim.guest = false
}

function homeCenter() {
  const home = HOMES[0]
  return {
    id: home.id,
    x: (home.minX + home.maxX) / 2,
    z: (home.minZ + home.maxZ) / 2,
  }
}

function placeCamera(camera: { position: { set: (x: number, y: number, z: number) => void }; lookAt: (x: number, y: number, z: number) => void }, mode: 'grounds' | 'home') {
  if (mode === 'home') {
    const home = homeCenter()
    camera.position.set(home.x, 1.7, home.z + 1.4)
    camera.lookAt(home.x, 1.05, home.z)
    return
  }
  const distance = TUNING.cameraOutdoor
  const pitch = 0.46
  const flat = Math.cos(pitch)
  const x = MARK.spawn.x
  const y = CAPSULE_CENTER
  const z = MARK.spawn.z
  camera.position.set(x, y + 0.42 + Math.sin(pitch) * distance, z + distance * flat)
  camera.lookAt(x, y + 0.42, z)
}

function Driver() {
  const { gl, camera, set, scene } = useThree()
  const phase = useRef<Phase>('warm')
  const frames = useRef(0)
  const stable = useRef(0)
  const trips = useRef(0)
  const lastMemory = useRef<PerfMemory | null>(null)
  const report = useRef<Partial<PerfReport>>({})

  useFrame(() => {
    if (phase.current === 'done') return
    frames.current += 1
    if (frames.current > MAX_FRAMES) {
      phase.current = 'done'
      publish('error', { error: 'perf page timed out' })
      return
    }

    const home = homeCenter()
    const inside = loadedInteriors.has(home.id)
    const mode = phase.current === 'home' ? 'home' : 'grounds'
    placeCamera(camera, mode)
    const sample = readSample(gl)

    if (phase.current === 'warm') {
      placeSim(MARK.spawn.x, MARK.spawn.z)
      const previous = lastMemory.current
      const current = sceneResources(scene)
      const same = previous && previous.geometries === current.geometries && previous.textures === current.textures && !inside
      lastMemory.current = current
      stable.current = same ? stable.current + 1 : 0
      if (stable.current >= WARM_FRAMES) {
        report.current.grounds = sample
        report.current.leakStart = sceneResources(scene)
        phase.current = 'home'
        stable.current = 0
        placeSim(home.x, home.z)
      }
      return
    }

    if (phase.current === 'home') {
      placeSim(home.x, home.z)
      stable.current = inside ? stable.current + 1 : 0
      if (stable.current >= SETTLE_FRAMES) {
        if (trips.current === 0) report.current.home = sample
        trips.current += 1
        phase.current = 'out'
        stable.current = 0
        placeSim(MARK.spawn.x, MARK.spawn.z)
      }
      return
    }

    if (phase.current === 'out') {
      placeSim(MARK.spawn.x, MARK.spawn.z)
      stable.current = inside ? 0 : stable.current + 1
      if (stable.current < SETTLE_FRAMES) return
      if (trips.current < LEAK_TRIPS) {
        phase.current = 'home'
        stable.current = 0
        placeSim(home.x, home.z)
        return
      }
      phase.current = 'flush'
      set({ frameloop: 'demand' })
      const finish = () => {
        if (phase.current === 'done') return
        const full: PerfReport = {
          grounds: report.current.grounds || sample,
          home: report.current.home || sample,
          leakStart: report.current.leakStart || sceneResources(scene),
          leakEnd: sceneResources(scene),
          trips: trips.current,
        }
        phase.current = 'done'
        const issues = reportIssues(full)
        publish(issues.length ? 'error' : 'done', issues.length ? { ...full, issues } : full)
      }
      window.setTimeout(finish, 500)
    }
  })

  return null
}

function View() {
  loadedInteriors.clear()
  placeSim(MARK.spawn.x, MARK.spawn.z)
  return (
    <Canvas
      shadows
      dpr={1}
      camera={{ fov: 58, near: 0.08, far: 420, position: [0, 6, 90] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        gl.outputColorSpace = SRGBColorSpace
      }}
    >
      <color attach="background" args={['#9ec8ea']} />
      <fog attach="fog" args={['#b7d4ee', 48, 210]} />
      <Sky sunPosition={[90, 36, 24]} turbidity={4.2} rayleigh={0.7} mieCoefficient={0.004} mieDirectionalG={0.8} />
      <hemisphereLight args={['#e7f2ff', '#6ea85a', 0.62]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        castShadow
        intensity={2.35}
        position={[28, 46, 18]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
      />
      <Physics gravity={[0, 0, 0]} timeStep={TUNING.timestep}>
        <EstateWorld />
        <Driver />
      </Physics>
    </Canvas>
  )
}

type BoundaryProps = { children: ReactNode }
type BoundaryState = { error: string }

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state = { error: '' }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error instanceof Error ? error.message : 'perf page failed' }
  }

  componentDidCatch() {
    publish('error', { error: this.state.error || 'perf page failed' })
  }

  render() {
    if (this.state.error) return <p id="estate-perf-status" data-state="error">{JSON.stringify({ error: 'perf page failed' })}</p>
    return this.props.children
  }
}

export function PerfApp() {
  return (
    <Boundary>
      <p id="estate-perf-status" data-state="loading" data-page={PAGE} data-fixture={FIXTURE}>
        loading
      </p>
      <View />
    </Boundary>
  )
}

export function startPhysics(onReady: () => void, onError: (message: string) => void) {
  initPhysics()
    .then(onReady)
    .catch((error: unknown) => {
      onError(error instanceof Error ? error.message : 'Physics could not start')
    })
}
