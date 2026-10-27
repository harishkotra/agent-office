# Instalación de Ciudadan AgentOffice (máquinas Oracle)

> Guía reproducible: **una oficina por desarrollador**, hasta 7 agentes Cline. Producción en un solo proceso, todo en `127.0.0.1` (sin exposición pública).

## Requisitos

| Requisito | Versión verificada | Nota |
|-----------|--------------------|------|
| Node.js | v22.x (verificado: v22.23.3) | `node -v` |
| npm | 10.x | viene con Node |
| Git + clave SSH de GitHub | — | añadida a la cuenta |
| Cline (para observar/controlar) | v3.0.70 | opcional: sin Cline la oficina queda vacía |
| Ollama / Redis / Docker-in-Docker | **NO necesarios** | — |

## 1. Clonar el fork

```bash
cd ~
git clone git@github.com:CiudadanMex/gameview.git agent-office
cd agent-office
git checkout feature/ciudadan-agentoffice-base
```

## 2. Instalar y compilar

```bash
npm install          # workspaces core/adapters/server/ui
npm run build        # produce packages/ui/dist + todos los dist
npm test             # 105 pruebas (deben pasar todas)
```

## 3. Configurar

```bash
cp .env.example .env
# Editar lo mínimo:
#   CLINE_DATA_DIR=/workspace/.cline/data   (donde viven TUS sesiones)
#   AGENTOFFICE_CONTROL_TOKEN=<openssl rand -hex 16>   (escrituras)
```

Todas las variables están documentadas en `.env.example`. Puertos por defecto: servidor `3000` (API+WS+UI), UI dev `5173` (solo desarrollo).

## 4. Arrancar (elige UNA vía)

**A. Producción — un solo proceso (recomendado):**

```bash
./scripts/office.sh start     # API + WebSocket + UI compilada en :3000
./scripts/office.sh status   # salud + proceso
# → http://127.0.0.1:3000
```

El script usa archivo PID: no crea duplicados, verifica salud en `/api/health` y para limpiamente. Otros comandos: `stop`, `restart`, `health`, `logs`.

**B. Docker (autoarranque + healthcheck):**

```bash
docker compose up -d --build
docker compose ps          # healthcheck cada 30s, restart: unless-stopped
```

**C. Desarrollo (Vite HMR):**

```bash
npm run dev --workspace=@agent-office/ui   # :5173 con proxy /api → :3000
```

## 5. Supervisor de procesos (importante)

Este entorno contenedorizado NO tiene systemd (PID 1 = sshd). La causa de las sesiones tmux que desaparecen es el **relanzamiento del agente por la plataforma**, que mata el árbol de procesos (incluido el servidor tmux) — no es un fallo de la oficina. Recomendaciones:

- **Producción**: Docker con `restart: unless-stopped` (compose ya lo trae) — el contenedor revive el proceso.
- **Sin Docker**: `./scripts/office.sh start` tras cada relanzamiento del agente, o intégralo a tu supervisor de host (cron `@reboot`, systemd del HOST, etc.).

## 6. Conectar Cline

**Observación**: `CLINE_DATA_DIR` apunta al data dir de Cline (lectura exclusiva de `sessions.db` + JSONs). Sin credenciales.

**Control real** (sesiones gestionadas por hub — ver README § Conectar Cline):

```bash
# El hub daemon lee su config de ~/.cline (HOME de quien lo ejecuta).
# Si tu terminal hereda el config dir del TUI, sé explícito con --config:
cline --config ~/.cline auth -p nvidia -k <TU-CLAVE> -m z-ai/glm-5.3
#   (o interactivo: cline --config ~/.cline auth → 'cline' + cline-free/*)
# .env: INSTRUCTION_DISPATCH_ENABLED="true" y HUB_PROVIDER_ID/HUB_MODEL_ID
#       = el proveedor/modelo que configuraste en el hub.
./scripts/office.sh restart
```

## 7. Acceso privado

- Local: <http://127.0.0.1:3000>
- SSH: `ssh -L 3000:127.0.0.1:3000 usuario@oracle` → <http://localhost:3000>
- Remoto: proxy privado (Tailscale / Cloudflare Access). Si usas WS token: `OFFICE_WS_TOKEN` + URL `?wstoken=…`; si publicas el host: `ALLOWED_ORIGIN`.

## 8. Actualización

```bash
git pull origin feature/ciudadan-agentoffice-base
npm install && npm run build && npm test
./scripts/office.sh restart   # o: docker compose up -d --build
```

## 9. Respaldo y recuperación

Datos persistentes en `packages/server/data/`:

| Archivo/directorio | Contenido |
|---|---|
| `office-memory.db` | Tareas/layouts de la oficina |
| `office-tasks.db` | Propuestas y sprints |
| `control-audit.jsonl` | Auditoría de control (rotativa) |
| `hub-workspaces/` | Workspaces aislados de sesiones gestionadas |

```bash
# respaldo
tar czf office-backup-$(date +%F).tgz packages/server/data
# recuperación
tar xzf office-backup-<fecha>.tgz -C packages/server/ && ./scripts/office.sh restart
```

Nunca se tocan las conversaciones de Cline (`/workspace/.cline` es de solo lectura para la oficina).

