# Centro de control interactivo — Bloque 4

> Ciudadan AgentOffice permite consultar y organizar trabajo real e
> interactuar con agentes mediante mecanismos **verificados y
> autorizados**. La funcionalidad de control funciona cuando el
> adaptador disponible la soporta y queda **claramente deshabilitada
> con su causa** cuando no — nunca se simula un envío.

## 1. Investigación del SDK/hub de Cline (FASE A/D) — veredicto

| Mecanismo | Estado |
|---|---|
| SDK `@cline/core` v0.0.92 (incluido en la instalación de Cline) | ✅ Localizado y cargado dinámicamente |
| Conexión al hub daemon (`ws://127.0.0.1:25463/hub`) con token del registro de descubrimiento (en memoria, nunca impreso) | ✅ **VALIDADA** |
| `list()`, `get()`, `readMessages()`, `subscribe()` (eventos `session_snapshot`, `status`) | ✅ Funcionan a nivel transporte |
| `start()` — crear sesiones gestionadas por el hub (prueba desechable en workspace temporal) | ✅ Crea sesión real |
| **`send()` a sesiones TUI existentes** (p. ej. la sesión de desarrollo interactiva) | ❌ **Imposible sin métodos invasivos**: el hub las ve como 0 — no están registradas. Adjuntar con `cline --id` abriría una segunda ejecución sobre la sesión activa (prohibido). |
| **Inferencia end-to-end vía hub** | ❌ El hub hospeda sesiones pero su directorio de configuración (`~/.cline`) no tiene credenciales de proveedor; copiar la clave NVIDIA está prohibido por el spec de este bloque. |
| Limpieza de sesiones desechables | ⚠️ `stop()` marca la parada; los registros internos del hub persisten como "running" inertes (sin transcript, sin inferencia). Pendiente de mantenimiento del hub (`cline doctor`). |

**Conclusión honesta**: el pipeline de instrucciones está implementado
al completo con el adaptador validado a nivel transporte; el envío real
queda **DESHABILITADO por configuración** (`INSTRUCTION_DISPATCH_ENABLED=false`)
y la UI muestra la causa exacta. No se introdujo ningún método invasivo
para controlar las terminales existentes.

## 2. Arquitectura de interacción

```
React (TaskBoard · InstructionPanel · Inspector)
        │  fetch /api/control/* (+ X-AgentOffice-Control-Token en escrituras)
        ▼
REST de control (server, 127.0.0.1) ──► Auditoría JSONL
  ├─ InstructionService (máquina de estados + idempotencia + rate-limit)
  │     └─ ClineControlAdapter (@cline/core, hub) — capacidades honestas
  ├─ LocalTaskStore (propias SQLite: propuestas + sprints, sustituible por DSH)
  └─ DshTaskProvider (contrato FASE G, sin endpoints inventados)
        ├─ UnavailableDshTaskProvider (DSH_SOURCE=none, defecto honesto)
        └─ HttpDshTaskProvider (DSH_SOURCE=http — REAL, Ciudadan Bloque 2)
              endpoints: /api/control/dsh-tasks (propose|assign|results|
              block|complete|clear), todos con token + auditoría
```

El frontend nunca ejecuta nada directamente: todas las acciones pasan
por el backend (reutilizable en iframe/Discord, FASE H). El token de
control es una credencial **del servidor** que el operador introduce en
la UI (sessionStorage); un botón de React jamás cuenta como autorización.

## 3. Máquina de estados de instrucciones

`draft → pending_approval → approved → dispatched → acknowledged | rejected | failed`

- **draft**: creado con `requestId` (idempotencia: duplicados devuelven
  el registro original — nunca se reenvía).
- **pending_approval**: enviado a aprobación.
- **approved**: autorización humana del lado servidor (token). Con el
  envío deshabilitado, la instrucción queda **APROBADA PENDIENTE con la
  causa documentada** — nunca se marca como enviada.
- **dispatched**: solo cuando el adaptador está validado Y acepta el envío.
- **rejected/failed**: con motivo visible y auditado.

Validación de destino: solo se aceptan instrucciones hacia sesiones
**reales registradas en la oficina** (id de sesión, nunca el nombre visible).

## 4. Tareas y sprints (FASE C)

- **Propuestas locales** (origen `agentoffice`): nacen como `proposed`;
  transiciones permitidas solo organizativas (`proposed/pending/in_review/blocked`).
  El servidor **rechaza** marcarlas `assigned/in_progress/completed` sin
  confirmación de DSH o despacho validado.
- **Observadas de Cline** (origen `cline`): solo lectura (Cline Teams).
- **DSH** (origen `dsh`): contrato tipado listo; hoy todo reporta
  `available:false` — DSH seguirá siendo la fuente de verdad.
- Sprints: agrupación visual; dependencias visibles (⛓ n).
- Almacenamiento propio (`data/office-tasks.db`) desacoplado —
  sustituible por el proveedor DSH sin tocar el motor.

## 5. Seguridad y auditoría (FASE F)

1. Autorización obligatoria server-side (header `X-AgentOffice-Control-Token`).
2. Lectura (GET) y escritura (POST/PATCH) separadas; sin credencial
   configurada → 503 (nunca se abre en silencio).
3. Validación del agente/sesión destino contra el registro real.
4. Confirmación explícita + token para aprobar (el botón no autoriza).
5. Auditoría JSONL (`data/control-audit.jsonl`): cada acción con
   resultado; consultable por GET /api/control/audit.
6. `requestId` impide envíos duplicados.
7. Rate limit global configurable (`INSTRUCTION_RATE_PER_MINUTE`).
8. Errores del adaptador → estado `failed` con causa; sin crashes.
9. Todo en 127.0.0.1; el token viaja solo por localhost.
10. Sanitización de secretos en prompts y auditoría (nunca claves).
11. Sin comandos shell arbitrarios desde el frontend; sin comandos de
    alto riesgo habilitados automáticamente.

> Nota operativa: el nombre canónico del header es
> `X-AgentOffice-Control-Token` (un solo guion entre Agent y Office) —
> detectado y corregido durante la validación en vivo del bloque.

## 6. Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/control/capabilities` | — | Capacidades honestas + agentes reales |
| GET | `/api/control/instructions` | — | Lista de instrucciones |
| POST | `/api/control/instructions` | ✅ | Crear borrador (idempotente por requestId) |
| POST | `/api/control/instructions/:id/submit` | ✅ | Enviar a aprobación |
| POST | `/api/control/instructions/:id/approve` | ✅ | Aprobar (y despachar si está validado) |
| POST | `/api/control/instructions/:id/reject` | ✅ | Rechazar |
| GET | `/api/control/tasks` | — | Propuestas + observadas + estado DSH |
| POST | `/api/control/tasks` | ✅ | Crear propuesta |
| PATCH | `/api/control/tasks/:id` | ✅ | Cambio organizativo de estado |
| POST | `/api/control/sprints` | ✅ | Crear sprint |
| POST | `/api/control/tasks/:id/sprint` | ✅ | Asignar a sprint |
| GET | `/api/control/audit` | — | Cola de auditoría (sanitizada) |

## 7. Preparación Discord (FASE H)

Componentes interactivos (TaskBoard/InstructionPanel/Inspector)
comunican solo vía REST same-origin con el token de control — sin
dependencias de localhost en el código del navegador, reutilizables en
iframe y con la futura Activity `/esfericulos`. La autenticación de
Ciudadan podrá inyectarse como capa delante del REST sin tocar el motor
visual ni el TaskBoard.

## 8. Bloque 5 — Sesiones gestionadas por hub (E2E VERIFICADO)

### Semántica del hub de Cline (v3.0.70) — verificada empíricamente

| Tipo de sesión | ¿Persiste entre turnos? | ¿Acepta send() repetido? |
|---|---|---|
| TUI existente (`cline -i`) | sí (terminal propio) | **no** — no está registrada en el hub |
| SDK `start({interactive: false})` | **no** — muere tras su primer turno (`ended`, "session not found") | no |
| SDK `start({interactive: true})` | **sí** — vive indefinidamente, `completed` = "turno terminado, esperando instrucción" | **sí** |

- La oficina lanza sesiones **interactivas** (única forma de múltiples instrucciones).
- El estado hub `completed` en una sesión interactiva viva se traduce a
  `idle` en la oficina (no terminal); solo las sesiones detenidas por la
  oficina son terminales (`completed` → gracia → puesto liberado).
- `core.stop()` no borra los registros de la lista del hub (inertes,
  limpiables con `cline doctor`); la oficina las olvida por sí misma.

### Prueba end-to-end obligatoria — RESULTADO: ✅ COMPLETA (2026-10-11)

1. ✅ Sesión desechable creada DESDE el hub vía la oficina (`1791688905603_j5ugk`), `interactive: true`, `enableTools: false`.
2. ✅ Workspace temporal aislado (`data/hub-workspaces/ws_*`, un directorio por sesión).
3. ✅ Instrucción inocua por el pipeline autorizado (draft → submit → approve → dispatch con `X-AgentOffice-Control-Token`).
4. ✅ Respuesta AUTÉNTICA del modelo: **"Azul."** (¿de qué color es el cielo al mediodía?).
5. ✅ Segunda instrucción a la MISMA sesión — despachada sin error.
6. ✅ Identidad persistente: misma `sessionId`; segunda respuesta real: **"4"** (2+2).
7. ✅ Representación en la oficina: personaje `Hub j5ugk` con estados reales observados (`idle` → `working` → `idle`), marcado 🎮 gestionada/controlable.
8. ✅ Auditoría: `session.launch`, `instruction.dispatch`, `instruction.refresh` con `acknowledged (respuesta real observada)` y `completed (respuesta final observada)`.
9. ✅ Cierre seguro: `DELETE /api/control/sessions/:id` → parada limpia → personaje terminal → puesto liberado tras gracia.

Proveedor/modelo utilizado (sin secretos): `cline` / `cline-free/mimo-v2.6-flash`
(tier gratuito configurado por el operador mediante `cline --config ~/.cline auth`).
NVIDIA `z-ai/glm-5.3` sigue soportado: el operador configura su clave en el
config del hub y ajusta `HUB_PROVIDER_ID`/`HUB_MODEL_ID`.

### Procedimiento del operador para el proveedor del hub

```bash
# El hub daemon lee de ~/.cline (HOME de quien lo ejecuta). Si tu shell
# hereda el config dir del TUI (/workspace/.cline), sé explícito:
cline --config ~/.cline auth -p nvidia -k nvapi-… -m z-ai/glm-5.3
# o interactivo (elegir proveedor 'cline' y modelo cline-free/*):
cline --config ~/.cline auth
# verificar SIN mostrar claves:
grep -o '"provider": "[a-z]*"' ~/.cline/data/settings/providers.json
```

La aplicación NUNCA lee ni copia credenciales de los archivos internos
de Cline; el hub resuelve el proveedor desde su propia configuración.


