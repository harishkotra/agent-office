# 🏢 Ciudadan AgentOffice

**Interfaz web interactiva para visualizar y controlar hasta siete agentes [Cline](https://github.com/cline/cline) reales**, con tareas, sprints e instrucciones autorizadas — sin simulaciones.

> Fork de [harishkotra/agent-office](https://github.com/harishkotra/agent-office) (MIT), reconstruido por Ciudadan sobre Phaser + React + Colyseus. Créditos y licencia originales al final.

---

## ✨ Qué hace (funcionalidades comprobadas)

| Funcionalidad | Estado |
|---|---|
| Oficina pixel-art con 7 puestos fijos, animaciones según estado real | ✅ |
| Visualización de sesiones Cline **reales** (identidad, modelo, rama Git, workspace, archivo activo) | ✅ |
| Estados derivados de evidencia: working / editing / reading / testing / waiting / blocked / idle / completed / offline | ✅ |
| Movimiento coherente: escritorio, estación de lectura, estación de pruebas, pausas ambientales | ✅ |
| Política de ocupación: activos primero; finalizadas liberan puesto tras gracia configurable | ✅ |
| Historial de sesiones (REST) sin ocupar escritorios | ✅ |
| TaskBoard real: propuestas, sprints, dependencias, tareas observadas de Cline | ✅ |
| Panel de instrucciones con máquina de estados y aprobación autorizada | ✅ |
| Lanzamiento de sesiones Cline **gestionadas por hub** desde la oficina (workspace aislado, permisos restrictivos) | ✅ verificado en vivo |
| Ciclo de instrucciones con evidencia real: enviado → recibido → completado | ✅ verificado E2E (respuestas reales del modelo, misma sesión) |
| Auditoría completa de acciones de control (JSONL rotativo) | ✅ |
| Producción en un solo proceso (UI compilada + API + WebSocket) | ✅ |
| Despliegue reproducible: Docker/compose + script supervisor | ✅ |
| Adaptador DSH (DeepSeek Harness) preparado como contrato tipado | 🔌 pendiente de instancia real |

**Honestidad por diseño**: nada se simula. Si el control real no está disponible, la interfaz lo dice exactamente y por qué.

## 🚀 Instalación rápida (máquina Oracle, una oficina por desarrollador)

```bash
git clone git@github.com:CiudadanMex/gameview.git agent-office
cd agent-office && git checkout feature/ciudadan-agentoffice-base
npm install
cp .env.example .env   # ajusta CLINE_DATA_DIR a tus sesiones
npm run build
./scripts/office.sh start    # → http://127.0.0.1:3000 (producción, 1 proceso)
```

Con Docker:

```bash
cp .env.example .env && docker compose up -d --build
docker compose ps   # healthcheck incluido, restart: unless-stopped
```

Acceso privado: `ssh -L 3000:127.0.0.1:3000 usuario@oracle` → <http://localhost:3000>. Para acceso remoto usa un proxy privado (Tailscale / Cloudflare Access); la app nunca se publica directamente.

Documentación completa: [docs/ciudadan/INSTALL.md](docs/ciudadan/INSTALL.md) · [CONTROL_CENTER.md](docs/ciudadan/CONTROL_CENTER.md) · [VISUAL_BEHAVIOR.md](docs/ciudadan/VISUAL_BEHAVIOR.md) · [REAL_INTEGRATION.md](docs/ciudadan/REAL_INTEGRATION.md) · [EXTERNAL_INTERFACE.md](docs/ciudadan/EXTERNAL_INTERFACE.md)

## 🤖 Conectar Cline

**Observación** (automática): apunta `CLINE_DATA_DIR` al directorio de datos de tus sesiones Cline (p. ej. `/workspace/.cline/data` con `--config`). La oficina las detecta por solo lectura: `sessions.db`, JSONs de sesión y mensajes. No necesita credenciales.

**Control** (opcional): las instrucciones solo funcionan con sesiones **gestionadas por hub de Cline** (las TUI existentes no están registradas en el hub y son de solo lectura por seguridad). Pasos del operador:

1. Configura el proveedor del hub con el procedimiento oficial (la app JAMÁS copia claves de los archivos internos de Cline). **Ojo**: el hub daemon lee su config de `~/.cline` del usuario que lo ejecuta; si tu terminal hereda el config dir del TUI, sé explícito:
   ```bash
   # verificar qué hay (sin mostrar claves):
   cat ~/.cline/data/settings/providers.json | grep -o '"provider": "[a-z]*"'
   # configurar el proveedor que usará el hub:
   cline --config ~/.cline auth -p nvidia -k <TU-CLAVE> -m z-ai/glm-5.3
   #   (o el proveedor gratuito integrado, sin claves:)
   cline --config ~/.cline auth   # y elegir 'cline' + un modelo cline-free/*
   ```
2. En `.env`: `AGENTOFFICE_CONTROL_TOKEN=$(openssl rand -hex 16)`, `INSTRUCTION_DISPATCH_ENABLED="true"`, `HUB_PROVIDER_ID`/`HUB_MODEL_ID` = el proveedor/modelo que configuraste en el hub, `HUB_SESSION_TOOLS="false"`.
3. Reinicia. Lanza sesiones desde la oficina (`POST /api/control/sessions` con el token) e envíales instrucciones tras aprobación explícita.

**Verificado end-to-end** (2026-10-11, Cline v3.0.70, proveedor gratuito `cline-free/mimo-v2.6-flash` configurado por el operador): sesión interactiva gestionada por hub lanzada desde la oficina → instrucción inocua despachada por el pipeline autorizado → respuesta real del modelo ("Azul.") → segunda instrucción a la MISMA sesión → respuesta real ("4") → identidad persistente → estados del personaje (idle/working) reflejando la actividad → auditoría completa → cierre seguro. Semántica del hub verificada: las sesiones lanzadas con `interactive: true` **persisten entre turnos**; las one-shot mueren tras su primer turno.

## 🧠 DSH (DeepSeek Harness)

DSH es el orquestador previsto y **seguirá siendo la fuente de verdad de sus tareas**. Esta instancia no tiene DSH instalado; el adaptador queda como contrato tipado (`DshTaskProvider`: tareas, dependencias, propuestas, asignaciones, resultados, bloqueos) con todo marcado como no disponible — sin endpoints inventados. Al desplegar una instancia real, se implementa el contrato y se sustituye el proveedor local de propuestas sin tocar el motor.

## 🛡️ Seguridad

- Todo escucha en `127.0.0.1` por defecto; acceso remoto solo vía proxy privado.
- Escrituras `/api/control` con credencial server-side obligatoria (`X-AgentOffice-Control-Token`); sin ella → 503, nunca se abre en silencio.
- WebSocket opcionalmente autenticado (`OFFICE_WS_TOKEN`); validación de Origin en despliegues no-loopback.
- Instrucciones: aprobación humana + token + idempotencia por requestId + rate limit + auditoría JSONL rotativa; solo sesiones reales registradas; sanitización de secretos en todo texto; sin endpoints de shell arbitrario; workspaces aislados por sesión; el botón de React nunca es la autorización.

## 📋 Pruebas

119 pruebas automatizadas (`npm test`): contrato externo, observación Cline, controlador visual, política de ocupación, pipeline de instrucciones (idempotencia, rate-limit, estados honestos), tareas/sprints, launcher de sesiones hub, WS auth, rotación de auditoría, proveedor DSH real (11 tests con verificación criptográfica de cookie), DSH no disponible. Nota Windows: `config.test`/`ClineSessionSource` arrastran 1 fallo ambiental preexistente (separador de rutas POSIX) ajeno a este bloque.

## 🔮 Roadmap (etapa 2)

- **Discord Activity `/esfericulos`**: el frontend es reutilizable — componentes React desacoplados, Phaser independiente del despliegue, endpoints configurables en build (`VITE_WS_URL`/`VITE_WS_PORT`), WebSocket compatible con proxy inverso, diseño adaptable a iframe (`Phaser.Scale.RESIZE`), sin dominios codificados. La autenticación Ciudadan (ROOT/socios) entrará como capa delante del REST sin tocar el motor visual.
- **DSH real (Ciudadan Bloque 2) ✓**: `HttpDshTaskProvider` contra el protocolo v2 verificado del webserver de DSH (`DSH_SOURCE=http`) — goals como tareas, cookie firmada del almacén de credenciales del harness, ciclo completo propuesta/asignación/completado/reversión probado E2E el 2026-10-26 contra un DSH vivo.
- Permisos de herramientas por sesión gestionada (sandbox) cuando se necesite ejecución real.

## ⚠️ Limitaciones conocidas

- Las sesiones TUI existentes no pueden recibir instrucciones (limitación estructural del hub de Cline, documentada); la oficina las muestra como observadas.
- `blocked` solo se muestra cuando Cline lo declara explícitamente.
- En contenedores sin systemd, el supervisor recomendado es Docker (`restart: unless-stopped` + healthcheck); tmux no es fiable como supervisor (sus sesiones mueren con el relanzamiento del agente).

## 📄 Créditos y licencia

- **Proyecto original**: [AgentOffice](https://github.com/harishkotra/agent-office) de Harish Kotra — **licencia MIT** (ver [LICENSE](./LICENSE)).
- Inspirado en [pixel-agents](https://github.com/pablodelucca/pixel-agents) de Pablo de Lucca.
- Adaptación Ciudadan sobre este fork. Código bajo MIT.

