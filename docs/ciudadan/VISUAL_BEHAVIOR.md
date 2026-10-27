# Animaciones inteligentes y política de ocupación — Bloque 3

> La oficina representa **visualmente la actividad real** de los agentes
> Cline. Ningún comportamiento se simula: cada movimiento y emote se
> deriva de estados observados con evidencia (reglas documentadas en
> `docs/ciudadan/REAL_INTEGRATION.md`).

## 1. Controlador visual (`AgentVisualController`)

Capa independiente que traduce `estado externo → comportamiento visual →
destino → animación`. No conoce Cline ni DSH — consume solo el estado
normalizado de la oficina, así que queda reutilizable para la futura
Activity de Discord. El bucle de movimiento ORIGINAL de AgentOffice
(1 celda/500ms) sigue siendo el motor: sin teletransportes, sin rutas
que reiniciar.

## 2. Tabla estados → animaciones

| Estado | Destino | Acción/anims existentes | Emote (cliente) |
|--------|---------|------------------------|------------------|
| `working` | Escritorio | trabajo en escritorio (posición sentada original) | 💻 |
| `editing` | Escritorio | ídem `working` | ✏️ |
| `testing` | Estación de pruebas (pizarra, 17,5) | ídem `working` en estación | 🧪 |
| `reading` | Estación de lectura (librería, 32,12) | animación `think` existente | 📖 |
| `waiting` | Permanece en su escritorio | reposo | ⏳ |
| `blocked` | Permanece (detiene actividad) | reposo + error en Inspector | 🚨 |
| `idle` | Escritorio (+ pausa ambient ☕ ocasional y determinista hacia la cafetería) | reposo / caminar | 😌 / ☕ |
| `completed` | Permanece (✅ breve) — puesto liberado por la política de gracia | reposo | ✅ |
| `offline` | Permanece (💤) — puesto liberado tras gracia | reposo | 💤 |
| *desconocido* | Permanece | reposo — **nunca inventa actividad** | — |

Los emotes por estado se muestran solo cuando el estado CAMBIA (guarda
`lastStatusEmote`), evitando que el polling de 5 s reinicie la burbuja.

## 3. Reglas de movimiento (FASE C)

1. **Sin teletransportes**: movimiento original celda a celda.
2. **Sin reinicios por polling**: estados equivalentes (`working`↔`editing`)
   mapean al MISMO destino → la ruta nunca se reinicia.
3. **Sin movimientos contradictorios**: el destino solo cambia cuando
   cambia el comportamiento; el enfoque "talk" original queda limitado a
   agentes NO externos.
4. **Relación estable agente↔escritorio**: asiento fijo del SeatAllocator.
5. **Solapes reducidos**: las estaciones compartidas aplican un offset
   determinista por asiento (el sistema original no tiene colisiones
   entre agentes).
6. **Desconexiones caminando**: la posición vive en el servidor
   (autoridad Colyseus); los clientes que se reconectan ven el estado
   exacto. Una sesión que muere → `offline` → gracia → puesto libre.
7. **CPU/memoria**: mtime-cache de transcripts, parches solo con cambios
   de estado, bucle de 100 ms intacto.

## 4. Política de ocupación de los 7 escritorios (FASE D)

`OccupancyPolicy` (pura, testeada) decide quién ocupa puesto cada ciclo:

1. **Sesiones activas primero** (cualquier estado no terminal), ordenadas
   por última actividad (más reciente primero).
2. **Las sesiones terminales solo rellenan** los puestos sobrantes y
   únicamente dentro de la **ventana de gracia** (`TERMINAL_GRACE_MS`,
   por defecto 60 s), para que el espectador vea el ✅.
3. **Finalizaciones antiguas** (anteriores al arranque del servidor) no
   obtienen gracia: jamás ocupan un puesto "zombi".
4. **Más de 7 activas**: se sientan las 7 más recientes; el resto espera
   (la oficina nunca se expande ni desaloja a quien trabaja por un
   histórico). **Más de 7 históricas**: irrelevante para los puestos
   (solo la gracia reciente sienta); el historial REST conserva las
   últimas 20 salidas.
5. **Sin duplicados ni reasignaciones innecesarias**: ids estables
   (session_id) y conjuntos iguales producen decisiones iguales.
6. **Historial preservado sin parecer activo**: REST `/api/external/status`
   + feed de eventos ("puesto liberado"); nunca como agente en escena.

## 5. Inspector (FASE E)

Al hacer clic en un personaje (cámara sigue, como siempre) el Inspector
muestra con distinción explícita:
- **⚙ Estado derivado** (por reglas documentadas) + tarea observable.
- **🔎 Actividad real observada**: última herramienta, última actividad
  (relativa, se refresca), archivo activo, tipo de sesión, rama Git,
  workspace, equipo.
- **— No disponible** para lo que la fuente no puede proporcionar (p. ej. archivo
  activo cuando no se está editando).
- Error/bloqueo con su evidencia; origen del dato y hora de actualización.
- **Nunca** se muestran conversaciones simuladas como mensajes auténticos
  ni salidas de terminal.

## 6. Preparación Discord (FASE F) — sin integrar todavía

- Endpoint WS configurable en **build time** (`VITE_WS_URL` /
  `VITE_WS_PORT` vía `define` de Vite) — el navegador no depende de
  localhost; el fallback deriva de `window.location` (seguro en iframes).
- `Phaser.Scale.RESIZE` ya permite ajustar el tamaño de la escena sin
  reconstruirla.
- Renderizado (Phaser/React) separado de la obtención de datos (Colyseus
  + adaptadores server-side) — reutilizable en `/esfericulos`.
- Sin SDK, autenticación ni controles de terminal (bloques 4-5).

## 7. DSH (FASE G)

Sin cambios: slot del Bloque 2 conservado; nada instalado ni inventado.
