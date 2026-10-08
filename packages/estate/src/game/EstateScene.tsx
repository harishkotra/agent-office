import { useEffect, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { ACESFilmicToneMapping, SRGBColorSpace, type DirectionalLight, type Object3D } from 'three'
import { usePresence } from '../presence'
import { look, sim } from '../sim'
import { setPaused, settings } from '../settings'
import { play, publishPlay } from '../play'
import type { Member } from '../auth'
import { colorFor } from '../family'
import { CameraRig } from './CameraRig'
import { LocalPlayer } from './Player'
import { RemotePlayers } from './Remotes'
import { EstateWorld } from './world'
import { PlayMenus } from '../ui/PlayMenus'
import { initPhysics } from '../physics'
import { TUNING } from '../tuning'
import { touch } from '../touch'

function coarseScreen() {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 820
}

let webglCache: boolean | null = null

export function webglOk() {
  if (webglCache != null) return webglCache
  try {
    const canvas = document.createElement('canvas')
    webglCache = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    webglCache = false
  }
  return webglCache
}

function Sun() {
  const light = useRef<DirectionalLight>(null)
  const target = useRef<Object3D>(null)
  useEffect(() => {
    if (light.current && target.current) light.current.target = target.current
  }, [])
  return (
    <>
      <directionalLight
        ref={light}
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
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <object3D ref={target} position={[0, 0, 40]} />
      <SunFollow light={light} target={target} />
    </>
  )
}

function SunFollow({
  light,
  target,
}: {
  light: RefObject<DirectionalLight>
  target: RefObject<Object3D>
}) {
  useFrame(() => {
    if (!light.current || !target.current) return
    light.current.position.set(sim.x + 26, 44, sim.z + 16)
    target.current.position.set(sim.x, 0, sim.z)
    target.current.updateMatrixWorld()
  })
  return null
}

export function EstateScene({
  member,
  admitted,
  onWelcome,
  onReject,
  onStatus,
  retry = 0,
}: {
  member: Member
  admitted: boolean
  onWelcome: (member: Member) => void
  onReject: (message: string) => void
  onStatus?: (status: 'connecting' | 'offline') => void
  retry?: number
}) {
  const [physicsReady, setPhysicsReady] = useState(false)
  const [physicsError, setPhysicsError] = useState('')
  usePresence(member, onWelcome, onReject, onStatus, retry)

  useEffect(() => {
    let live = true
    initPhysics()
      .then(() => {
        if (live) setPhysicsReady(true)
      })
      .catch((error: unknown) => {
        if (live) setPhysicsError(error instanceof Error ? error.message : 'Physics could not start')
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    sim.name = member.name
    sim.guest = false
    sim.color = member.color || colorFor(member.id || member.name)
    sim.id = member.id
    let leavingLock = false
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (play.directory) {
          publishPlay({ directory: false })
          return
        }
        if (play.travel) {
          publishPlay({ travel: false })
          return
        }
        const next = !settings.paused
        setPaused(next)
        if (next) {
          leavingLock = true
          document.exitPointerLock()
        }
        return
      }
      if (settings.runToggle && settings.bindings.run.includes(event.code) && !event.repeat) {
        settings.running = !settings.running
      }
      const typing = event.target instanceof HTMLElement && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')
      if (!typing && !settings.listening && settings.bindings.travel.includes(event.code)) {
        publishPlay({ travel: !play.travel })
        return
      }
      if (typing || settings.paused || settings.listening || play.directory || play.travel) return
      look.keys[event.code] = true
      if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault()
    }
    const up = (event: KeyboardEvent) => {
      look.keys[event.code] = false
    }
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
      touch.recenter = true
    }
    const pointerUp = (event: PointerEvent) => {
      if (event.button === 1) touch.recenter = false
    }
    const move = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.touch-layer, .touch')) return
      if (document.pointerLockElement || (event.buttons & 1) === 1) {
        const sens = settings.sensitivity
        const invert = settings.invertY ? -1 : 1
        look.dx += event.movementX * sens
        look.dy += event.movementY * sens * invert
      }
    }
    const onLock = () => {
      if (document.pointerLockElement) return
      if (leavingLock) {
        leavingLock = false
        return
      }
      setPaused(true)
    }
    const clear = () => {
      for (const key of Object.keys(look.keys)) look.keys[key] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointermove', move)
    window.addEventListener('blur', clear)
    document.addEventListener('pointerlockchange', onLock)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('blur', clear)
      document.removeEventListener('pointerlockchange', onLock)
      touch.recenter = false
      clear()
    }
  }, [member.color, member.id, member.name])

  if (!admitted) return null

  if (!physicsReady) {
    return <div className="physics-wait">{physicsError || 'Opening the grounds…'}</div>
  }

  if (!webglOk()) {
    return (
      <div className="physics-wait">
        <p>The 3D grounds could not start in this browser.</p>
        <PlayMenus />
      </div>
    )
  }

  return (
    <Canvas
      shadows={!coarseScreen()}
      dpr={coarseScreen() ? 1 : [1, 1.6]}
      camera={{ fov: 58, near: 0.08, far: 420, position: [0, 6, 90] }}
      gl={{ antialias: !coarseScreen(), powerPreference: coarseScreen() ? 'low-power' : 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        gl.outputColorSpace = SRGBColorSpace
        gl.domElement.addEventListener('pointerdown', () => {
          if (settings.paused || play.directory || play.travel) return
          void gl.domElement.requestPointerLock()
        })
        gl.domElement.addEventListener('contextmenu', (event) => event.preventDefault())
      }}
    >
      <color attach="background" args={['#9ec8ea']} />
      <fog attach="fog" args={['#b7d4ee', 48, 210]} />
      <Sky sunPosition={[90, 36, 24]} turbidity={4.2} rayleigh={0.7} mieCoefficient={0.004} mieDirectionalG={0.8} />
      <hemisphereLight args={['#e7f2ff', '#6ea85a', 0.62]} />
      <ambientLight intensity={0.22} />
      <Sun />
      <Physics gravity={[0, 0, 0]} timeStep={TUNING.timestep}>
        <EstateWorld />
        <LocalPlayer name={member.name} />
        <RemotePlayers />
        <CameraRig />
      </Physics>
    </Canvas>
  )
}
