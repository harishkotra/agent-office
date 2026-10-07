import { useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { BatchGroup, Box, Column, InvisibleWall, Solid } from './primitives'
import { Homes } from './Homes'
import { Trees } from './trees'
import { MARK, WORLD } from '../zones'

const STONE = '#efe4d2'
const STONE_D = '#d7c6ae'
const ROOF = '#6d3838'
const TRIM = '#f6f0e4'
const WOOD = '#7a4e30'
const HEDGE = '#1e6834'
const WATER = '#2c8b96'
const GLASS = '#b7d5df'
const FLOWER = ['#d4534a', '#e2b23a', '#d57aa8', '#f4f1ea']

function grain(base: string, speck: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return new CanvasTexture(canvas)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 1600; i++) {
    ctx.globalAlpha = 0.15 + Math.random() * 0.3
    ctx.fillStyle = i % 2 ? speck : base
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  return texture
}

function wallX(
  z: number,
  x0: number,
  x1: number,
  height: number,
  color: string,
  key: string,
  door?: { x0: number; x1: number; h: number },
) {
  const piece = (id: string, xa: number, xb: number, y0: number, y1: number) => {
    if (xb - xa < 0.05 || y1 - y0 < 0.05) return null
    const h = y1 - y0
    return <Solid key={`${key}-${id}`} position={[(xa + xb) / 2, y0 + h / 2, z]} size={[xb - xa, h, 0.46]} color={color} />
  }
  if (!door) return piece('full', x0, x1, 0, height)
  return (
    <>
      {piece('l', x0, door.x0, 0, height)}
      {piece('r', door.x1, x1, 0, height)}
      {piece('t', door.x0, door.x1, door.h, height)}
    </>
  )
}

function wallZ(
  x: number,
  z0: number,
  z1: number,
  height: number,
  color: string,
  key: string,
  door?: { z0: number; z1: number; h: number },
) {
  const piece = (id: string, za: number, zb: number, y0: number, y1: number) => {
    if (zb - za < 0.05 || y1 - y0 < 0.05) return null
    const h = y1 - y0
    return <Solid key={`${key}-${id}`} position={[x, y0 + h / 2, (za + zb) / 2]} size={[0.46, h, zb - za]} color={color} />
  }
  if (!door) return piece('full', z0, z1, 0, height)
  return (
    <>
      {piece('a', z0, door.z0, 0, height)}
      {piece('b', door.z1, z1, 0, height)}
      {piece('t', door.z0, door.z1, door.h, height)}
    </>
  )
}

function Rim({
  cx,
  cz,
  radius,
  segments,
  height,
  thick,
  color,
  gapCenter,
  gapWidth = 0,
}: {
  cx: number
  cz: number
  radius: number
  segments: number
  height: number
  thick: number
  color: string
  gapCenter?: number
  gapWidth?: number
}) {
  const parts = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    if (gapCenter !== undefined && gapWidth > 0) {
      const delta = Math.atan2(Math.sin(a - gapCenter), Math.cos(a - gapCenter))
      if (Math.abs(delta) < gapWidth / 2) continue
    }
    const x = cx + Math.cos(a) * radius
    const z = cz + Math.sin(a) * radius
    const chord = 2 * radius * Math.sin(Math.PI / segments) * 1.08
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a))
    parts.push(
      <Solid
        key={`${cx}-${cz}-${i}`}
        position={[x, height / 2, z]}
        rotation={[0, yaw, 0]}
        size={[chord, height, thick]}
        color={color}
      />,
    )
  }
  return <>{parts}</>
}

function Manor() {
  const { x0, x1, z0, z1 } = MARK.manor
  const west = MARK.westWing
  const east = MARK.eastWing
  const h = 6.8
  const steps = []
  for (let i = 0; i < 12; i++) {
    const top = (i + 1) * 0.28
    steps.push(
      <Solid key={`step-${i}`} position={[8.1, top / 2, -19.2 - i * 0.48]} size={[3.2, top, 0.6]} color={STONE_D} />,
    )
  }
  return (
    <group>
      {wallX(z1, x0, x1, h, STONE, 'manor-s', { x0: -1.7, x1: 1.7, h: 3.15 })}
      {wallX(z0, x0, x1, h, STONE, 'manor-n', { x0: -1.5, x1: 1.5, h: 3.15 })}
      {wallZ(x0, z0, z1, h, STONE, 'manor-w', { z0: -30.2, z1: -26.6, h: 2.9 })}
      {wallZ(x1, z0, z1, h, STONE, 'manor-e', { z0: -30.2, z1: -26.6, h: 2.9 })}
      {wallZ(west.x0, west.z0, west.z1, 5.2, STONE, 'west-outer')}
      {wallX(west.z1, west.x0, west.x1, 5.2, STONE, 'west-s', { x0: -24.2, x1: -20.6, h: 2.8 })}
      {wallX(west.z0, west.x0, west.x1, 5.2, STONE, 'west-n')}
      {wallZ(east.x1, east.z0, east.z1, 5.2, STONE, 'east-outer')}
      {wallX(east.z1, east.x0, east.x1, 5.2, STONE, 'east-s', { x0: 20.6, x1: 24.2, h: 2.8 })}
      {wallX(east.z0, east.x0, east.x1, 5.2, STONE, 'east-n')}
      <Solid position={[0, 7.15, -28]} size={[28.4, 0.42, 26.4]} color={ROOF} />
      <Box position={[0, 8.15, -28]} size={[16, 1.15, 12]} color={ROOF} />
      <Solid position={[-21.5, 5.45, -28]} size={[18.2, 0.36, 17.4]} color={ROOF} />
      <Solid position={[21.5, 5.45, -28]} size={[18.2, 0.36, 17.4]} color={ROOF} />
      <Solid position={[-8, 7.7, -28]} size={[1.1, 1.8, 1.1]} color={STONE_D} />
      <Solid position={[8, 7.7, -28]} size={[1.1, 1.8, 1.1]} color={STONE_D} />
      {[-10, -4, 4, 10].map((x) => (
        <Column key={`col-${x}`} position={[x, 1.7, -11.2]} height={3.4} radius={0.28} color={TRIM} />
      ))}
      <Solid position={[0, 3.55, -12.2]} size={[26.5, 0.24, 8.2]} color={ROOF} />
      <Box position={[0, 0.02, -28]} size={[24, 0.04, 22]} color="#c4a27a" />
      <Box position={[-1.5, 0.03, -27]} size={[6.5, 0.02, 4.2]} color="#7c2e2e" />
      <Solid position={[-2.2, 0.4, -27]} size={[3.4, 0.8, 1.25]} color={WOOD} />
      {[-3.5, -0.9].map((x) =>
        [-1.1, 1.1].map((dz) => (
          <Solid key={`chair-${x}-${dz}`} position={[x, 0.28, -27 + dz]} size={[0.55, 0.56, 0.55]} color={STONE_D} />
        )),
      )}
      {steps}
      <Solid position={[8.1, 1.68, -29.6]} size={[3.5, 3.36, 9.2]} color={STONE} />
      <Solid position={[6.25, 3.78, -30.4]} size={[0.16, 0.84, 6.4]} color={TRIM} />
      <Solid position={[9.9, 3.78, -30.4]} size={[0.16, 0.84, 6.4]} color={TRIM} />
      <Solid position={[8.1, 3.78, -34]} size={[3.5, 0.84, 0.16]} color={TRIM} />
      <Solid position={[-22, 0.4, -28]} size={[2.4, 0.8, 1.1]} color={WOOD} />
      <Solid position={[22, 0.55, -30]} size={[0.45, 1.1, 3.2]} color={WOOD} />
      <Solid position={[22, 1.35, -30]} size={[0.7, 0.5, 3.2]} color="#6a3a28" />
      {[-8, -4.2, 4.2, 8].map((x) => (
        <Box key={`win-s-${x}`} position={[x, 2.15, z1 + 0.28]} size={[1.25, 1.55, 0.08]} color={GLASS} roughness={0.15} />
      ))}
      {[-8, 8].map((x) => (
        <Box key={`win-s2-${x}`} position={[x, 4.55, z1 + 0.28]} size={[1.25, 1.35, 0.08]} color={GLASS} roughness={0.15} />
      ))}
      <pointLight position={[0, 4.4, -27]} intensity={18} distance={14} color="#ffe0b8" />
    </group>
  )
}

function GateSign() {
  const map = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) return new CanvasTexture(canvas)
    ctx.fillStyle = '#243026'
    ctx.fillRect(0, 0, 1024, 256)
    ctx.strokeStyle = '#e7d7b8'
    ctx.lineWidth = 14
    ctx.strokeRect(18, 18, 988, 220)
    ctx.fillStyle = '#f4ead8'
    ctx.font = '600 72px Georgia, "Liberation Serif", serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('McCowan Family Estate', 512, 128)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return texture
  }, [])
  return (
    <mesh position={[0, 6.35, MARK.gateZ + 0.72]}>
      <planeGeometry args={[8.4, 1.7]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  )
}

function HedgeGarden() {
  const x = MARK.hedge.x
  const z = MARK.hedge.z
  const h = 1.32
  return (
    <group>
      <Solid position={[x, h / 2, z - 8]} size={[20, h, 0.7]} color={HEDGE} />
      <Solid position={[x - 6.2, h / 2, z + 8]} size={[7.2, h, 0.7]} color={HEDGE} />
      <Solid position={[x + 6.2, h / 2, z + 8]} size={[7.2, h, 0.7]} color={HEDGE} />
      <Solid position={[x - 10, h / 2, z]} size={[0.7, h, 16]} color={HEDGE} />
      <Solid position={[x + 10, h / 2, z]} size={[0.7, h, 16]} color={HEDGE} />
      <Solid position={[x, h / 2, z + 1.5]} size={[8, h, 0.6]} color={HEDGE} />
      <Solid position={[x - 3, h / 2, z - 3]} size={[0.6, h, 6]} color={HEDGE} />
      <Box position={[x + 3, 0.18, z - 2]} size={[1.4, 0.36, 1.4]} color={FLOWER[0]} />
      <Box position={[x - 5, 0.18, z + 3]} size={[1.4, 0.36, 1.4]} color={FLOWER[1]} />
    </group>
  )
}

function Chapel() {
  const x = MARK.chapel.x
  const z = MARK.chapel.z
  const w = 8.5
  const d = 11
  const h = 5
  const x0 = x - w / 2
  const x1 = x + w / 2
  const z0 = z - d / 2
  const z1 = z + d / 2
  return (
    <group>
      {wallX(z1, x0, x1, h, STONE, 'chap-s', { x0: x - 1.2, x1: x + 1.2, h: 2.8 })}
      {wallX(z0, x0, x1, h, STONE, 'chap-n')}
      {wallZ(x0, z0, z1, h, STONE, 'chap-w')}
      {wallZ(x1, z0, z1, h, STONE, 'chap-e')}
      <Solid position={[x, 5.35, z]} size={[w + 1.2, 0.4, d + 1.2]} color={ROOF} />
      <Box position={[x, 3.55, z1 + 0.28]} size={[0.18, 1.15, 0.12]} color={TRIM} />
      <Box position={[x, 3.55, z1 + 0.28]} size={[0.7, 0.18, 0.12]} color={TRIM} />
      <Solid position={[x - 1.5, 0.38, z - 1]} size={[2.2, 0.45, 0.7]} color={WOOD} />
      <Solid position={[x + 1.5, 0.38, z - 1]} size={[2.2, 0.45, 0.7]} color={WOOD} />
      <Box position={[x, 2.2, z1 + 0.3]} size={[1.6, 0.9, 0.06]} color={GLASS} roughness={0.2} />
    </group>
  )
}

export function EstateWorld() {
  const grass = useMemo(() => {
    const tex = grain('#4c8c3e', '#3a7332')
    tex.repeat.set(40, 34)
    return tex
  }, [])
  const gravel = useMemo(() => {
    const tex = grain('#cbb892', '#a8926c')
    tex.repeat.set(8, 28)
    return tex
  }, [])
  const lamps = []
  for (let z = 62; z >= -6; z -= 16) {
    lamps.push([-5.6, z], [5.6, z])
  }

  return (
    <BatchGroup>
    <group>
      <RigidBody type="fixed" colliders={false} position={[0, -1, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]} receiveShadow>
          <planeGeometry args={[WORLD.halfX * 2, WORLD.halfZ * 2]} />
          <meshStandardMaterial map={grass} roughness={1} />
        </mesh>
        <mesh position={[0, 1.02, 34]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[8.2, 108]} />
          <meshStandardMaterial map={gravel} roughness={1} />
        </mesh>
        <mesh position={[0, 1.025, MARK.fountain.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[7.2, 13.5, 48]} />
          <meshStandardMaterial color="#cbb892" roughness={1} />
        </mesh>
      </RigidBody>
      <InvisibleWall position={[0, -1, 0]} size={[WORLD.halfX * 2, 2, WORLD.halfZ * 2]} />

      <Manor />
      <Solid position={[0, 0.12, MARK.manor.z0 - 6]} size={[28, 0.24, 12]} color={STONE_D} />
      <Solid position={[-12, 0.7, MARK.manor.z0 - 6]} size={[0.3, 0.9, 12]} color={TRIM} />
      <Solid position={[12, 0.7, MARK.manor.z0 - 6]} size={[0.3, 0.9, 12]} color={TRIM} />

      <Rim cx={0} cz={MARK.fountain.z} radius={5.5} segments={18} height={0.58} thick={0.55} color={STONE} />
      <RigidBody type="fixed" colliders={false} position={[0, 0.1, MARK.fountain.z]}>
        <CylinderCollider args={[0.1, 4.35]} />
      </RigidBody>
      <mesh position={[0, 0.28, MARK.fountain.z]}>
        <cylinderGeometry args={[4.2, 4.2, 0.16, 28]} />
        <meshStandardMaterial color={WATER} roughness={0.18} metalness={0.05} transparent opacity={0.86} />
      </mesh>
      <Column position={[0, 0.7, MARK.fountain.z]} height={1.15} radius={0.42} color={STONE_D} />
      <mesh position={[0, 1.55, MARK.fountain.z]}>
        <cylinderGeometry args={[0.12, 0.22, 0.8, 8]} />
        <meshStandardMaterial color={WATER} transparent opacity={0.75} />
      </mesh>

      <Pool />
      <Gazebo />
      <Chapel />
      <Pond />
      <HedgeGarden />
      <Trees />
      <GateSign />
      <Column position={[-6.4, 3.2, MARK.gateZ]} height={6.4} radius={0.72} color={STONE} />
      <Column position={[6.4, 3.2, MARK.gateZ]} height={6.4} radius={0.72} color={STONE} />
      <Solid position={[0, 6.35, MARK.gateZ]} size={[14.2, 0.5, 1.15]} color={STONE} />

      {lamps.map(([x, z]) => (
        <group key={`lamp-${x}-${z}`} position={[x, 0, z]}>
          <Solid position={[0, 1.45, 0]} size={[0.14, 2.9, 0.14]} color="#2b2926" />
          <mesh position={[0, 3.05, 0]}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial color="#ffe1a8" emissive="#ffb35a" emissiveIntensity={0.7} />
          </mesh>
        </group>
      ))}

      {[48, 18, -2].map((z) => (
        <Solid key={`bench-e-${z}`} position={[7.4, 0.24, z]} size={[1.4, 0.48, 0.5]} color={WOOD} />
      ))}
      {[48, 18, -2].map((z) => (
        <Solid key={`bench-w-${z}`} position={[-7.4, 0.24, z]} size={[1.4, 0.48, 0.5]} color={WOOD} />
      ))}
      {[20, 40, 58].map((z, i) => (
        <Box key={`flower-${z}`} position={[i % 2 ? -3.2 : 3.2, 0.16, z]} size={[1.1, 0.32, 1.1]} color={FLOWER[i % FLOWER.length]} />
      ))}

      <Solid position={[0, 1.6, -WORLD.halfZ + 1.2]} size={[WORLD.halfX * 2, 3.2, 1.4]} color={HEDGE} />
      <Solid position={[0, 1.6, WORLD.halfZ - 1.2]} size={[WORLD.halfX * 2, 3.2, 1.4]} color={HEDGE} />
      <Solid position={[-WORLD.halfX + 1.2, 1.6, 0]} size={[1.4, 3.2, WORLD.halfZ * 2]} color={HEDGE} />
      <Solid position={[WORLD.halfX - 1.2, 1.6, 0]} size={[1.4, 3.2, WORLD.halfZ * 2]} color={HEDGE} />
      <Homes />
    </group>
    </BatchGroup>
  )
}

function Pool() {
  const { x, z, w, d } = MARK.pool
  const deck = 0.32
  const ix0 = x - 8
  const ix1 = x + 8
  const iz0 = z - 4.2
  const iz1 = z + 4.2
  const ox0 = x - w / 2
  const ox1 = x + w / 2
  const oz0 = z - d / 2
  const oz1 = z + d / 2
  return (
    <group>
      <Solid position={[(ox0 + ix0) / 2, deck / 2, z]} size={[ix0 - ox0, deck, d]} color={STONE_D} />
      <Solid position={[(ox1 + ix1) / 2, deck / 2, z]} size={[ox1 - ix1, deck, d]} color={STONE_D} />
      <Solid position={[x, deck / 2, (oz0 + iz0) / 2]} size={[16, deck, iz0 - oz0]} color={STONE_D} />
      <Solid position={[x, deck / 2, (oz1 + iz1) / 2]} size={[16, deck, oz1 - iz1]} color={STONE_D} />
      <RigidBody type="fixed" colliders={false} position={[x, 0.06, z]}>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[15.6, 0.12, 8]} />
          <meshStandardMaterial color={WATER} roughness={0.16} transparent opacity={0.88} />
        </mesh>
      </RigidBody>
      <InvisibleWall position={[x, 0.08, z]} size={[15.6, 0.16, 8]} />
      <Solid position={[ox0 - 0.7, 0.16, z]} size={[1.1, 0.16, 3]} color={STONE} />
    </group>
  )
}

function Gazebo() {
  const { x, z } = MARK.gazebo
  const cols = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    cols.push(
      <Column
        key={`gaz-${i}`}
        position={[x + Math.cos(a) * 3.3, 1.45, z + Math.sin(a) * 3.3]}
        height={2.9}
        radius={0.18}
        color={TRIM}
      />,
    )
  }
  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={[x, 0.1, z]}>
        <CylinderCollider args={[0.1, 4]} />
        <mesh receiveShadow>
          <cylinderGeometry args={[4, 4.15, 0.2, 8]} />
          <meshStandardMaterial color={STONE_D} roughness={0.8} />
        </mesh>
      </RigidBody>
      {cols}
      <mesh position={[x, 3.35, z]} castShadow>
        <coneGeometry args={[4.7, 1.45, 8]} />
        <meshStandardMaterial color={ROOF} roughness={0.75} />
      </mesh>
    </group>
  )
}

function Pond() {
  const { x, z, r } = MARK.pond
  return (
    <group>
      <Rim cx={x} cz={z} radius={r} segments={20} height={0.5} thick={0.6} color={STONE_D} gapCenter={Math.PI} gapWidth={0.62} />
      <RigidBody type="fixed" colliders={false} position={[x, 0.08, z]}>
        <CylinderCollider args={[0.08, r - 1.3]} />
      </RigidBody>
      <mesh position={[x, 0.24, z]}>
        <cylinderGeometry args={[r - 1.45, r - 1.45, 0.12, 28]} />
        <meshStandardMaterial color={WATER} roughness={0.2} transparent opacity={0.9} />
      </mesh>
      <Solid position={[x - r * 0.72, 0.16, z]} size={[r * 1.15, 0.22, 2.3]} color={WOOD} />
      <Solid position={[x - r * 0.72, 0.55, z - 1.35]} size={[r * 1.15, 0.45, 0.12]} color={WOOD} />
      <Solid position={[x - r * 0.72, 0.55, z + 1.35]} size={[r * 1.15, 0.45, 0.12]} color={WOOD} />
    </group>
  )
}
