# Integración real Cline/DSH — Bloque 2

> **Objetivo cumplido**: la oficina muestra agentes Cline **reales** con
> identidad, estados, tareas y actividad verificables — sin simulaciones.

## Arquitectura real de adaptadores

```
┌─────────────────────────── READ-ONLY ───────────────────────────┐
│  ClineSessionSource          ClineTeamsObserver   DshAdapter    │
│  ├─ db/sessions.db (RO)      ├─ db/teams.db (RO)  └─ slot: no   │
│  ├─ sessions/<id>.json      └─ team_tasks/members    instalado  │
│  └─ sessions/<id>.messages                                ↓      │
│         │ .json (solo estructura)                          documentado │
└─────────┼────────────────────────────────────────────────────────┘
          ▼
  RealAgentsOrchestrator (poll 5 s, en el proceso del servidor)
          ▼
  ExternalBridge (contrato del Bloque 1) ──► Colyseus ──► UI
```

- **Fuentes**: `packages/server/src/integrations/cline/` (sesiones),
  `integrations/dsh/` (DSH slot + teams). Todo se abre con
  `OPEN_READONLY`; jamás se escribe, se lanza ni se reinicia un proceso
  de Cline.
- **IDs estables**: el `session_id` de Cline (p. ej.
  `1791652292571_3vb8s`) es el id del agente en la oficina → sin
  duplicados entre ciclos; el asiento es estable por fecha de inicio.
- **Sin ficción**: los 7 puestos solo se ocupan con sesiones reales; no
  se crean agentes de relleno. Los estados sin evidencia se reportan
  como `idle`, nunca se inventan.

## Estados normalizados (derivados de evidencia)

| Estado | Evidencia observable |
|--------|----------------------|
| `working` | `tool_use`/`tool_result` de herramientas genéricas o `run_commands` sin patrón de test |
| `reading` | último bloque `read_files`/`search_codebase` |
| `editing` | último bloque `editor` |
| `testing` | `run_commands` cuyo contenido coincide con patrones de test (jest/vitest/pytest/npm test) |
| `waiting` | `ask_question` sin respuesta posterior (detectado en todo el transcript, no solo el último mensaje) |
| `idle` | proceso vivo sin mensajes recientes (>120 s) — inactividad ≠ desconexión |
| `offline` | estado `running` pero PID muerto, o estado desconocido |
| `completed` | estado `completed`/`exit_code` declarado por Cline |
| `blocked` | solo si la sesión lo declara (no se infiere) |

Acción visual reutilizada: `working/editing/testing`→💻 escritorio,
`reading`→💡 pensar, `waiting/idle/completed/offline`→😌, error→🚨 en
el Inspector.

## DSH (DeepSeek Harness) — integración REAL (Ciudadan Bloque 2, 2026-10-26)

El slot del Bloque 2 ya tiene una implementación real: **`HttpDshTaskProvider`**
(`packages/server/src/integrations/dsh/HttpDshTaskProvider.ts`), activada con
`DSH_SOURCE=http` + `DSH_URL` + `AGENTOFFICE_DSH_SESSION_ID` (+ opcional
`AGENTOFFICE_DSH_CREDENTIALS`). Cableada en `index.ts` vía `createDshProvider()`;
`DSH_SOURCE=none` mantiene `UnavailableDshTaskProvider` (compatibilidad).

**Protocolo verificado** (leído del código vivo, cero endpoints inventados):
`POST {DSH_URL}/api/{endpoint}` con body
`{type:'client-request', rpcId, method, payload:{args}}` y respuesta
`{rpcId, result:{ok:true,value}|{ok:false,error:{code,message}}}`. Remotos usados:
`pluginInventory/list` (sonda de vida, lectura), `goals/create|pause|resume|complete|clear`
(ciclo de vida completo de goals).

**Autenticación real**: el webserver de DSH exige en cada `/api` la misma
cookie firmada que el navegador obtiene al abrir la URL con token de
lanzamiento (el token vive solo en memoria del proceso). El secreto
**firmante** sí persiste en el almacén de credenciales del harness
(dsh-credentials-local, registro `client-connection/browser-session`); el
proveedor acuña con él la cookie firmada por autoridad — mismo mecanismo,
nada nuevo inventado, el secreto nunca se registra ni se expone.

**Mapeo semántico honesto** (tarea de oficina ↔ goal de DSH):
- `proposeToDsh` → `goals/create` + `goals/pause` (propuesta aceptada,
  DESARMADA: existe en DSH, no se ejecuta).
- `requestAssignment` → `goals/resume` (ARMAR = asignación real; el driver
  de rounds del harness ejecuta la sesión dueña).
- `updateStatus('completed')` → `goals/complete`.
- `notifyBlocker` → `goals/pause` + nota en el registro.
- `removeFromDsh` → `goals/clear` (reversibilidad total).
- `getResults` → último GoalView confirmado por RPC. DSH v1 no expone
  lectura pasiva de goals: nunca se inventa una fase.

**E2E verificado el 2026-10-26** contra un DSH real (127.0.0.1:3080,
sesión top-level fría `session-80140f8c…`): goal real creado y desarmado
(rev 2) → asignado (rev 3, armed) → **1 ronda autónoma real ejecutada**
(el archivo de sesión creció +13 KB con turnos del modelo) → completado
por RPC (rev 4, `roundsStarted:1`) → limpiado con `goals/clear`.
Evidencia: auditoría JSONL de la oficina con las 4 acciones + registro
SQLite origen `dsh` (`dsh-tasks.db`).

**Limitaciones verificadas** (documentadas, no ocultas):
- Las sesiones de subagentes no pueden poseer goals de primer nivel
  (`session/agent-busy: owned by subagent routing`) — usar sesiones
  top-level.
- `goals/edit` con petición vacía lanza error (no existe lectura por
  edit-noop).
- El harness inyecta `DSH_SESSION_ID` propio en los procesos que lanza:
  la variable de la oficina es `AGENTOFFICE_DSH_SESSION_ID` (el cargador
  `.env` nunca pisa variables existentes).
- Despliegue previsto: misma máquina o túnel SSH (la valla confía en
  loopback/trustedHosts y la cookie es por autoridad).

### Tareas reales disponibles hoy

`ClineTeamsObserver` lee `teams.db` (tareas del subsistema *teams*
nativo de Cline — real, no DSH). Las tareas con asignatario registrado
pasan al TaskBoard; el resto se muestra como eventos. En esta máquina
la tabla está vacía (sin actividad de equipos), así que no se muestra
nada — sin datos inventados.

## Seguridad (FASE F)

- Todo escucha en `127.0.0.1` (puertos 3000/5173) — sin exposición.
- `EXTERNAL_API_TOKEN` opcional: si se define, `/api/external` exige
  `X-AgentOffice-Token` (el orquestador interno no pasa por REST).
- Sanitización antes de cualquier texto hacia la UI: claves
  (`nvapi-…`, `sk-…`, `ghp_…`, `Bearer …`, hex-largo) reemplazadas;
  textos truncados a 200 chars; **nunca** se reenvían salidas de
  terminales ni resultados de herramientas — solo bloques de texto del
  asistente.
- Polling de bajo impacto: 5 s (mín. 2 s forzado), con caché por mtime
  (un transcript sin cambios no se re-parsea) y ciclo anti-solapamiento.
- Re-conexión: el orquestador re-ataca la sala cuando aparece y se
  re-registra tras una regeneración; los errores de fuente conservan el
  último snapshot.

## Prueba NVIDIA (opcional, aislada)

`npm run test:nvidia` — un único mensaje, sin herramientas, sin
reintentos, usando el `OpenAICompatibleAdapter` existente. La
credencial se lee de `NVIDIA_API_KEY` o del *provider* `nvidia`
configurado en los ajustes autorizados de Cline (nunca se imprime).

Resultados reales (2026-10-10):
| Modelo | Resultado |
|--------|-----------|
| `deepseek-ai/deepseek-v4-flash-0731` (spec) | ❌ 410 Gone — no existe en la cuenta (catálogo: 80 modelos) |
| `deepseek-ai/deepseek-v4.1-flash` | ❌ timeout 20 s |
| `z-ai/glm-5.3` (modelo en uso real) | ✅ respuesta «OK», 21+59 tokens, 2904 ms |

El modo NVIDIA es **independiente**: no toca sesiones reales ni
activa ciclos autónomos; el modo principal sigue siendo `external`.

## Limitaciones pendientes

1. **DSH ausente** (impedimento verificado) — pendiente de que el
   equipo lo despliegue; el slot y la config están listos.
2. Polling (5 s), no eventos en vivo: el hub daemon de Cline
   (127.0.0.1:25463, `/hub`) no expone REST (404 en todas las rutas);
   parece WebSocket para `-z/--zen`. No se ingeniería-inversa para no
   interferir con un agente vivo — candidato a explorar en el Bloque 3.
3. `blocked` solo cuando Cline lo declara (no hay evidencia inferible).
4. Id de contenedor: n/a (sin Docker en esta máquina).
5. Subagentes (`is_subagent=1`) no se muestran como agentes (documentado).
6. Sesiones batch completadas aparecen como `completed` — decisión
   deliberada (son reales); configurable en el futuro si molesta.
