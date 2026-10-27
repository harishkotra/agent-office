# Interfaz externa de Ciudadan AgentOffice — Contrato (Bloque 1)

> **Propósito**: interfaz independiente y documentada para que el adaptador **DSH/Cline** (Bloque 2) pueda reflejar en la oficina hasta **7 agentes reales**: identidad, estado de ejecución, tarea actual, mensajes, eventos, estado de sesión y errores/bloqueos.
>
> **Estado**: implementada y operativa (REST + puente en proceso). El adaptador DSH/Cline NO está implementado todavía — ese es el Bloque 2.

- Tipos TypeScript del contrato: [`packages/core/src/external/types.ts`](../../packages/core/src/external/types.ts)
- Implementación del puente: [`packages/server/src/external/ExternalBridge.ts`](../../packages/server/src/external/ExternalBridge.ts)
- Rutas REST: [`packages/server/src/external/routes.ts`](../../packages/server/src/external/routes.ts)

## Requisitos

1. Servidor corriendo en modo `external` (`AGENT_OFFICE_MODE=external`).
2. La sala `office` existe cuando **al menos un cliente (navegador) ha abierto la UI una vez**. En modo `external` la sala no se autodestruye al cerrar el navegador (`autoDispose=false`), por lo que los agentes registrados persisten.
3. `EXTERNAL_API_ENABLED=true` (por defecto).

Mientras no haya sala activa, los endpoints devuelven **503** con un mensaje explicativo.

## Modelo de datos

```ts
type ExternalAgentExecutionStatus =
  'offline' | 'idle' | 'running' | 'thinking' | 'acting'
  | 'waiting_input' | 'blocked' | 'error' | 'completed'
  // ─── Bloque 2: estados reales de sesiones Cline (derivados de evidencia) ───
  | 'working' | 'reading' | 'editing' | 'testing' | 'waiting';

interface ExternalAgentDescriptor { id: string; name: string; role: string; }
// id: estable y único (letras, dígitos, . _ -). Ej: "cline-01"

interface ExternalAgentStateUpdate {
  status?: ExternalAgentExecutionStatus;
  currentTask?: string;   // "" limpia la tarea
  thought?: string;       // burbuja de pensamiento (~120 chars)
  action?: 'idle'|'work'|'think'|'talk'|'move'; // acción visual (opcional)
  mood?, reputation?, riskLevel?, momentum?: number; // 0..1 (opcional)
}

interface ExternalTaskUpdate { title: string; status?: 'pending'|'in_progress'|'completed'|'failed'; assigneeId?: string; }
interface ExternalMessage { from?: string; content: string; to?: string; timestamp?: string; }
interface ExternalEvent { type: string; title: string; body?: string; } // type: info|task|tool|error|session|...
interface ExternalSessionState { state: 'active'|'idle'|'awaiting'|'stopped'|'crashed'|'unknown'; sessionId?: string; details?: string; }
interface ExternalIssue { severity: 'warning'|'error'|'fatal'; message: string; code?: string; blocked?: boolean; }
```

**Reglas semánticas**:
- `status: running|idle` limpia el último error reportado.
- `reportIssue` con `message: ""` limpia el error. `blocked:true` o `severity: fatal` marcan al agente como `blocked`.
- `updateSession` con `state: crashed|stopped` marcan al agente `offline`.
- `pushTask` con `status: completed|failed` vacía la tarea del asignado.
- Registro con id existente = **upsert** (actualiza nombre/rol, conserva asiento).
- La oficina admite **como máximo 7 agentes** (puestos fijos). El 8º registro devuelve 507.

## Endpoints REST (servidor local, p. ej. `http://127.0.0.1:3000`)

| Método | Ruta | Cuerpo (JSON) | Éxito | Errores |
|--------|------|----------------|-------|---------|
| GET | `/api/external/status` | — | 200 snapshot | 503 sin sala |
| POST | `/api/external/agents` | `ExternalAgentDescriptor` | 201 creado / 200 upsert | 400 inválido, 409 modo interno, 507 lleno |
| DELETE | `/api/external/agents/:id` | — | 200 | 404, 503 |
| PATCH | `/api/external/agents/:id/state` | `ExternalAgentStateUpdate` | 200 | 400/404 |
| POST | `/api/external/agents/:id/tasks` | `ExternalTaskUpdate` | 201 | 400/404 |
| POST | `/api/external/agents/:id/messages` | `ExternalMessage` | 201 | 400/404 |
| POST | `/api/external/agents/:id/events` | `ExternalEvent` | 201 | 400/404 |
| POST | `/api/external/agents/:id/session` | `ExternalSessionState` | 200 | 400/404 |
| POST | `/api/external/agents/:id/issues` | `ExternalIssue` | 201 | 400/404 |

Todas las respuestas incluyen `"ok": true|false` y, en error, `"error"` con motivo legible.

## Ejemplos (curl)

```bash
BASE=http://127.0.0.1:3000/api/external

# 1. Registrar un agente (aparece en la oficina y camina a su puesto)
curl -s -X POST $BASE/agents \
  -H 'Content-Type: application/json' \
  -d '{"id":"cline-01","name":"Cline 01","role":"Backend Developer"}'
# → {"ok":true,"seat":1}

# 2. Actualizar estado de ejecución y pensamiento
curl -s -X PATCH $BASE/agents/cline-01/state \
  -H 'Content-Type: application/json' \
  -d '{"status":"running","currentTask":"Refactor del login","thought":"Analizando el módulo..."}'

# 3. Enviar un mensaje al chat de la oficina
curl -s -X POST $BASE/agents/cline-01/messages \
  -H 'Content-Type: application/json' \
  -d '{"content":"Termine los tests, subiendo cambios."}'

# 4. Anunciar una tarea
curl -s -X POST $BASE/agents/cline-01/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Revisar PR #42","status":"in_progress"}'

# 5. Estado de sesión
curl -s -X POST $BASE/agents/cline-01/session \
  -H 'Content-Type: application/json' \
  -d '{"state":"active","sessionId":"dsh-abc123"}'

# 6. Reportar un bloqueo
curl -s -X POST $BASE/agents/cline-01/issues \
  -H 'Content-Type: application/json' \
  -d '{"severity":"error","message":"Esperando revisión humana","blocked":true}'

# 7. Snapshot completo (modo, puestos, agentes)
curl -s $BASE/status

# 8. Retirar un agente (libera su puesto)
curl -s -X DELETE $BASE/agents/cline-01
```

## Cómo se refleja en la UI

| Llamada externa | Efecto visible |
|-----------------|----------------|
| `registerAgent` | Sprite aparece en la puerta y camina a su puesto (asiento fijo 1..7); mensaje en Chat; evento en Highlights |
| `updateAgentState` | Emote (💻💬💡😌), burbuja de pensamiento, tarea en Inspector/TaskBoard, entrada en System Activity Log (telemetría) |
| `pushMessage` | Mensaje en el Chat + highlight |
| `pushTask` | TaskBoard + chat + highlight |
| `reportIssue` | Inspector muestra el error (🚨); estado `blocked` |
| `updateSession` | Inspector muestra la sesión; `crashed/stopped` → `offline` |
| Clic en el sprite | Inspector con datos en vivo (rol, estado, tarea, sesión, error) |

## Uso en proceso (alternativa a REST)

El Bloque 2 puede importar `ExternalBridge` directamente (sin HTTP), programando contra la interfaz `ExternalOrchestratorAdapter` de `@agent-office/core`:

```ts
import type { ExternalOrchestratorAdapter } from '@agent-office/core';
const bridge: ExternalOrchestratorAdapter | null = officeRoom.getExternalBridge();
bridge?.registerAgent({ id: 'cline-01', name: 'Cline 01', role: 'Backend' });
bridge?.updateAgentState('cline-01', { status: 'thinking' });
```

## Datos de prueba (DEMO)

`EXTERNAL_DEMO_MODE=true` registra 7 agentes `[DEMO] Agente 1..7` que simulan actividad cada 5 s usando **este mismo contrato** (valida el camino que usará el adaptador real). Desactivado por defecto; nunca mezclar con agentes reales.

