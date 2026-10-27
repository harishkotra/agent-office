# 🏢 Ciudadan AgentOffice

Interfaz web interactiva para visualizar y controlar hasta **siete agentes Cline reales**, coordinados por DeepSeek Harness (DSH).

> **Base**: fork de [harishkotra/agent-office](https://github.com/harishkotra/agent-office) — commit base `58f11f9b31770c10bcf3d7a0618325d22bd0ee9e` (rama `feature/ciudadan-agentoffice-base`).
> **Licencia**: MIT (se conserva la licencia y atribución originales — ver [LICENSE](./LICENSE)).

---

## ¿Qué es cada modo?

| Modo | Comportamiento | Uso |
|------|----------------|-----|
| `external` (**por defecto**) | La oficina es una *carcasa visual*: sin LLM, sin herramientas, sin agentes autónomos. Los agentes se registran y actualizan exclusivamente a través de la **interfaz externa** (`/api/external`). | Integración DSH/Cline (Bloque 2), visualización de agentes reales |
| `internal` | Comportamiento original de AgentOffice: ciclo de razonamiento Ollama (~15 s/agente), contratación autónoma, tareas autónomas, conversaciones ficticias, ejecución de herramientas, embeddings. | Compatibilidad con el proyecto upstream; requiere Ollama |

El modo se configura con `AGENT_OFFICE_MODE` (ver [`.env.example`](./.env.example)).

## Qué queda DESACTIVADO en modo `external`

- ❌ Ciclos de razonamiento (ninguna llamada a Ollama; el `OllamaAdapter` ni se instancia)
- ❌ Contratación autónoma de agentes (`hire_agent`)
- ❌ Generación autónoma de tareas (`create_task` desde el LLM)
- ❌ Conversaciones ficticias entre agentes
- ❌ Ejecución de herramientas y comandos (`ToolExecutor` no se instancia: ni `code_execute`, ni `web_search`, ni `read_file`)
- ❌ Embeddings de memoria (llamadas a `/api/embeddings` de Ollama)
- ❌ Motor de caos/escenarios y votos de audiencia (eventos narrativos ficticios)
- ❌ Jitter aleatorio de métricas virales (los valores los fija la interfaz externa)

## Qué se CONSERVA siempre

- ✅ Escenario pixel-art original (Phaser): suelo, paredes, salas, plantas, máquinas de café…
- ✅ Animaciones y desplazamiento (los agentes caminan a su puesto asignado)
- ✅ Selección de personajes (clic → cámara sigue + Inspector con datos reales)
- ✅ Paneles React: Chat, Tablero de tareas, Registro de actividad, Inspector, Editor de layout
- ✅ Sincronización en tiempo real vía Colyseus
- ✅ Persistencia SQLite de tareas y layouts
- ✅ **Máximo 7 puestos fijos** (sin expansión dinámica de la oficina)

## Arquitectura resultante (Bloque 1)

```
┌────────────────────────── Navegador ──────────────────────────┐
│  Phaser OfficeScene (pixel-art)  +  React (paneles)          │
└───────────────▲──────────────────────────────▲────────────────┘
                │ Colyseus WebSocket (:3000)  │ REST (proxy /api)
┌───────────────┴──────────────────────────────┴────────────────┐
│  @agent-office/server (Express + Colyseus)                    │
│  ├─ OfficeRoom — modo 'external': sin IA autónoma             │
│  ├─ ExternalBridge → aplica estado y difunde a los paneles    │
│  └─ /api/external/*  ← INTERFAZ EXTERNA (contrato del Bloque 2)
└──────────────────────────▲────────────────────────────────────┘
                           │ (Bloque 2: adaptador DSH/Cline — NO implementado)
                 ┌─────────┴────────┐
                 │  DSH + agentes   │
                 │  Cline reales    │
                 └──────────────────┘
```

Documentación completa de la interfaz externa: [`docs/ciudadan/EXTERNAL_INTERFACE.md`](./docs/ciudadan/EXTERNAL_INTERFACE.md)
Instalación reproducible (máquinas Oracle): [`docs/ciudadan/INSTALL.md`](./docs/ciudadan/INSTALL.md)

## Bloque 2 — Integración real (Cline + DSH slot + NVIDIA opcional)

- **Agentes reales**: el servidor observa las **sesiones Cline reales**
  (`CLINE_DATA_DIR`, solo lectura: sessions.db + JSONs de sesión/mensajes)
  y las refleja en la oficina: identidad (session_id estable), modelo,
  rama Git, workspace, tarea observable (título), estados derivados de
  evidencia (`working/reading/editing/testing/waiting/idle/completed/offline`)
  y últimos mensajes del asistente (sanitizados).
- **DSH (Ciudadan Bloque 2)**: integración REAL activada con
  `DSH_SOURCE=http` — `HttpDshTaskProvider` habla el protocolo v2
  verificado del webserver de DSH (goals como tareas, cookie firmada
  del almacén de credenciales del harness, ciclo completo
  propuesta/asignación/completado/reversión probado E2E 2026-10-26).
  Con `DSH_SOURCE=none` queda `UnavailableDshTaskProvider` (sin fingir).
  Las tareas reales de *Cline Teams* se leen de `teams.db` (no es DSH).
- **NVIDIA (opcional)**: `npm run test:nvidia` — prueba aislada de un
  mensaje vía `OpenAICompatibleAdapter` (resultado: glm-5.3 ✅,
  deepseek-v4-flash-0731 410 Gone — ver
  [`docs/ciudadan/REAL_INTEGRATION.md`](./docs/ciudadan/REAL_INTEGRATION.md)).
- **Seguridad**: todo local (127.0.0.1), sanitización de secretos, token
  opcional `EXTERNAL_API_TOKEN`, polling de bajo impacto (5 s, min 2 s).

## Bloque 3 — Animaciones inteligentes basadas en actividad real

- **Controlador visual** (`AgentVisualController`): estado → destino →
  animación existente (sin teletransportes, sin reinicios por polling,
  estaciones de lectura/pruebas, pausas ambientales ☕ claramente no-laborales).
- **Política de ocupación** (`TERMINAL_GRACE_MS`, defecto 60 s): prioridad
  absoluta a sesiones activas; completadas visibles solo durante la gracia
  y luego liberan puesto; finalizaciones antiguas nunca ocupan "zombis";
  historial preservado vía REST/eventos. Ver
  [`docs/ciudadan/VISUAL_BEHAVIOR.md`](./docs/ciudadan/VISUAL_BEHAVIOR.md).
- **Inspector renovado**: distingue ⚙ estado derivado / 🔎 actividad real
  observada / — no disponible; muestra archivo activo, rama Git, workspace,
  tipo de sesión, última herramienta y hora de actualización.
- **Preparación Discord**: endpoint WS configurable en build
  (`VITE_WS_URL`/`VITE_WS_PORT`), `Phaser.Scale.RESIZE` existente,
  renderizado separado de datos — listo para `/esfericulos` (sin integrar).

## Bloque 4 — Centro de control interactivo

- **Investigación SDK/hub Cline** (`docs/ciudadan/CONTROL_CENTER.md`):
  `@cline/core` conecta al hub y sus funciones (`list/get/readMessages/
  subscribe/start/send`) funcionan a nivel transporte; **las sesiones TUI
  existentes no están registradas en el hub** → el envío real queda
  deshabilitado por config con causa documentada (sin métodos invasivos).
- **Panel de Instrucciones** con máquina de estados completa
  (`draft→pending_approval→approved→dispatched→acknowledged|rejected|failed`),
  idempotencia por requestId, rate-limit y auditoría JSONL; aprobación
  honesta (nunca simula envíos).
- **Centro de Trabajo**: propuestas (nunca "asignadas" sin confirmación
  externa), sprints, dependencias, tareas observadas de Cline (solo
  lectura) y estado DSH explícito.
- **Seguridad**: credencial de control obligatoria server-side
  (`AGENTOFFICE_CONTROL_TOKEN`), lecturas/escrituras separadas,
  validación de sesión destino, sin comandos shell arbitrarios.
- **DSH**: contrato de proveedor tipado (`DshTaskProvider`) con todo
  marcado no disponible — sin endpoints inventados.

## Bloque 5 — MVP web final

- **Sesiones gestionadas por hub**: `HubSessionLauncher` (workspace aislado por
  sesión, permisos restrictivos `HUB_SESSION_TOOLS=false`, ids persistentes,
  auditoría) + endpoints `POST/GET/DELETE /api/control/sessions`. La UI marca
  cada sesión como 🎮 gestionada (controlable), 👁 observada (TUI, solo
  lectura), ✅ finalizada o 💤 desconectada — imposible enviar instrucciones a
  una sesión que no lo admite.
- **Ciclo completo de instrucciones con evidencia real**: enviado → recibido
  (acknowledged) → completado, avanzando solo con mensajes del transcript del
  hub posteriores al envío (nunca se marca completada por el simple envío).
- **E2E VERIFICADO (2026-10-11)**: control real completo vía hub — sesión
  interactiva desechable, dos instrucciones a la misma sesión con respuestas
  reales del modelo ("Azul." y "4"), identidad persistente, personaje con
  estados reales (idle/working), auditoría completa y cierre seguro.
  Semántica del hub descubierta y documentada: `interactive: true` persiste
  entre turnos; one-shot muere tras el primero; `completed` de una sesión
  interactiva viva = `idle` en la oficina. Proveedor usado (config del
  operador): `cline`/`cline-free/mimo-v2.6-flash` (gratuito, sin claves);
  NVIDIA `z-ai/glm-5.3` soportado cambiando config.
- **HubSessionObserver**: las sesiones lanzadas por la oficina aparecen como
  personajes REALES con estados derivados del API del hub (nada inventado),
  integradas al orquestador con la política de ocupación existente.
- **Seguridad**: `OFFICE_WS_TOKEN` (auth del WebSocket), validación de Origin
  en despliegues no-loopback, rotación de auditoría JSONL.
- **Despliegue reproducible**: producción en un solo proceso (UI compilada
  servida por el propio servidor en :3000, sin Vite), `/api/health`,
  `Dockerfile` + `docker-compose.yml` (restart + healthcheck) y
  `scripts/office.sh` (start/stop/restart/status/health/logs sin duplicados).
  Causa tmux documentada: relanzamiento del agente por la plataforma (PID 1 =
  sshd, sin systemd); supervisor recomendado = Docker.
- **README público** con tabla de funcionalidades comprobadas, limitaciones,
  conexión Cline, DSH y plan Discord.

## Puertos y variables

| Variable | Defecto | Descripción |
|----------|---------|-------------|
| `AGENT_OFFICE_MODE` | `external` | Modo de orquestación |
| `HOST` | `127.0.0.1` | Interfaz del servidor (solo local por defecto) |
| `PORT` | `3000` | WebSocket Colyseus + REST |
| `UI_HOST` / `UI_PORT` | `127.0.0.1` / `5173` | Servidor Vite (UI) |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Solo modo `internal` |
| `EXTERNAL_API_ENABLED` | `true` | Acepta updates vía `/api/external` |
| `EXTERNAL_DEMO_MODE` | `false` | ⚠️ Datos de prueba `[DEMO]` (verificación de UI) |
| `DATABASE_PATH` | `./data/office-memory.db` | SQLite |
| `MAX_SEATS` | `7` | Tope duro de puestos (máx. 7) |

## Git

- `origin` → `CiudadanMex/gameview` (fork propio — destino de push)
- `upstream` → `harishkotra/agent-office` (push DESHABILITADO)
- Rama de trabajo del Bloque 1: `feature/ciudadan-agentoffice-base`
