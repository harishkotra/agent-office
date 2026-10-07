# McCowan Family Estate

A huge walkable 3D estate for the McCowan family. Family members use the same sign-in as [mccowanestate.com](https://mccowanestate.com), walk the grounds with a keyboard, and see who else is here and which part of the estate they are standing in.

The grounds are a page on the family site, at `/estate/` on the same origin as [mccowanestate.com](https://mccowanestate.com). Sign in on the site, open the estate, and walk. The page reads that same sign-in. Guests are not admitted.

## Play

```bash
npm install
npm run estate
```

Open **http://localhost:5174** and sign in with your family account. A second signed-in window shows up as another living member. There is no guest entry.

| Key | Action |
| --- | --- |
| WASD or arrows | Walk, relative to the camera |
| Shift | Run |
| Space | Jump. Jump again as you land for a higher second and third leap |
| Ctrl or C | Dive |
| Mouse drag, or Q / E | Look around |
| R | Return to the front gate |
| Esc | Free the mouse |

Movement is a blend of Super Mario 64 (acceleration, jump chains, camera-relative steering), Fall Guys (bean body, dive), and Gang Beasts (loose, wobbly stride).

## Family site

Hop-in is a normal page on the family site, not a frame on another origin. Same origin keeps the Supabase session in the browser, so the estate does not take a token through `postMessage`.

Family Manager hosts the built client at `https://mccowanestate.com/estate/` and links it for signed-in members. The build uses relative asset paths (`base: './'`). Set `VITE_PRESENCE_URL` to a websocket on that same host before building. A `?ws=` query cannot retarget it. See [docs/docs/family-estate.md](docs/docs/family-estate.md).

A walker is created only after the presence server checks the live session and finds that account's `profiles` row. The name on the grounds is the profile name. Guests and anonymous sockets never appear. The family tree is not used for admission.

`npm run estate` starts the presence server on port **8787** and the 3D client on port **5174**. Build the client with `npm run build --workspace=@agent-office/estate`.

---

# AgentOffice (pixel office)

The original pixel-art agent office is still in this repo.

**Self-growing AI teams in a pixel-art virtual office — powered by local LLMs.**

Watch AI agents walk to desks, think, collaborate, hire interns, assign tasks to each other, execute code, search the web, and grow their team — all rendered in real-time pixel art with persistent memory across sessions.

> **Zero lock-in.** Runs 100% locally with Ollama. Swap for any OpenAI-compatible API.



https://github.com/user-attachments/assets/da76e31d-ff34-4ce1-9092-5bf9e6ee2058



[https://youtu.be/GgrK8K9RlIA](https://youtu.be/GgrK8K9RlIA)

<img width="1697" height="1272" alt="Screenshot at Feb 25 00-15-59" src="https://github.com/user-attachments/assets/9ed16692-09d9-44e4-a258-f796f9479afb" />
<img width="1694" height="1272" alt="Screenshot at Feb 25 00-16-31" src="https://github.com/user-attachments/assets/f592359a-ba96-45fc-bb5e-07ec88583a10" />
<img width="1699" height="1278" alt="screencapture-localhost-5173-2026-02-25-00_05_15" src="https://github.com/user-attachments/assets/4a604b86-1aaf-4b0d-985b-51afe7d71586" />
<img width="1699" height="1278" alt="screencapture-localhost-5173-2026-02-25-00_04_54" src="https://github.com/user-attachments/assets/4f2811ff-a66e-47e3-9d0f-184123e75e01" />
<img width="1699" height="1278" alt="screencapture-localhost-5173-2026-02-25-00_04_44" src="https://github.com/user-attachments/assets/8773814e-9414-4c62-a098-8f5a205db187" />
<img width="1695" height="1270" alt="Screenshot at Feb 25 00-18-57" src="https://github.com/user-attachments/assets/1591cb0e-9aea-4728-8f01-9f7a2c8d5ac2" />
<img width="2018" height="1268" alt="Screenshot at Feb 25 00-34-36" src="https://github.com/user-attachments/assets/f719ad99-f4ba-4998-8c9b-68818061bc60" />

---

## ✨ What Can It Do?

| Feature | Description |
|---------|-------------|
| 🧠 **LLM-Powered Agents** | Each agent has their own Ollama-powered brain with personality traits |
| 💬 **Agent-to-Agent Conversations** | Agents talk to each other autonomously and respond to messages |
| 🎯 **Click-to-Follow Focus Mode** | Click any agent sprite to have the camera smoothly track them |
| 📋 **UI Task Assignment** | Assign tasks from the TaskBoard — or agents create tasks for each other |
| 🤝 **Dynamic Hiring** | Agents can hire new team members (interns, devs, designers) on their own |
| 🔧 **Tool Execution** | Sandboxed JS execution, web search, note-taking, file reading |
| 💾 **Persistent Memory** | SQLite-backed memories survive server restarts with importance-weighted recall |
| 🔍 **Semantic Memory Search** | Ollama embeddings + cosine similarity for intelligent memory retrieval |
| 🏗️ **Layout Editor** | Drag-and-drop furniture placement, saved to database |
| 📊 **System Activity Log** | Real-time feed of all agent events with deduplication |
| 💡 **Emote Bubbles** | Action-specific emoji (💻💬😌🔧🚶💡) above agent sprites |
| 🪑 **Furniture Interaction** | Agents walk TO desks to work, approach each other to talk |

---

## 🎬 How It Works

```
You open the browser → pixel-art office loads → Alice (Engineer) and Bob (PM) spawn
  → Each agent runs a think loop every ~15s via Ollama
  → LLM returns: { thought, action, target, toolCall }
  → Server executes the action (move, talk, use_tool, hire_agent)
  → Colyseus syncs state to all connected browsers in real-time
  → Agents remember everything via SQLite + Ollama embeddings
  → Teams grow as agents decide to hire new members 🚀
```

---

## 🏗️ Architecture

```
agent-office/
├── packages/
│   ├── core/          # Agent state machine, Memory, Tasks, Office grid
│   ├── adapters/      # OllamaAdapter, OpenAICompatibleAdapter, PromptBuilder
│   ├── server/        # Colyseus rooms, ToolExecutor, MemoryStore (SQLite)
│   ├── ui/            # Phaser.js game + React overlay (Chat, TaskBoard, SystemLog)
│   └── cli/           # Scaffold & management commands
├── examples/
│   └── ollama-startup/  # Demo office with 2 agents
├── docs/              # Documentation (Docusaurus)
└── docker-compose.yml # One-command deployment
```

**Data Flow:**
```
Ollama ←→ OllamaAdapter ←→ Agent.think() ←→ Colyseus State ←→ Phaser + React UI
                                  ↕                  ↕
                           MemoryStore (SQLite)   ToolExecutor
                           Embeddings (Ollama)    (code, search, tasks)
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | ≥ 18 | Runtime |
| **npm** | ≥ 9 | Package manager (workspaces) |
| **Ollama** | Latest | Local LLM inference |

### Setup

```bash
# Clone & install
git clone https://github.com/AjStraworern/agent-office.git
cd agent-office
npm install

# Pull the model
ollama pull llama3.2

# Build all packages
npm run build

# Terminal 1: Start server
npm run start --workspace=@agent-office/server

# Terminal 2: Start UI
npm run dev --workspace=@agent-office/ui
```

Open **http://localhost:5173** — watch Alice and Bob come alive! 🎉

---

## 🐳 Docker Deployment

```bash
docker compose up --build
```

This starts the **server** (port 3000), **UI** (port 80), **Ollama** (with GPU), and **Redis** (for scaling).

> For CPU-only, remove the `deploy.resources` section from `docker-compose.yml`.

---

## 🔧 Configuration

### Change the LLM Model

Edit `packages/server/src/rooms/OfficeRoom.ts`:

```typescript
inference: {
    provider: 'ollama',
    model: 'llama3.2:latest',  // ← Change to any Ollama model
    systemPrompt: '...',
},
```

### Use OpenAI / Gaia / OpenRouter

```typescript
import { OpenAICompatibleAdapter } from '@agent-office/adapters';

private adapter = new OpenAICompatibleAdapter(
    'https://api.openai.com/v1',
    'sk-your-key-here',
    'gpt-4o-mini'
);
```

### Add Agents Manually

```typescript
await setupCoreAgent('charlie', 'Charlie', 'Designer', 15, 15);
```

Or let existing agents hire them dynamically via LLM! 🤝

---

## 🍴 Fork It & Build Your Own

AgentOffice is designed to be forked and customized. Here's how:

### Step 1: Fork & Clone

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/agent-office.git
cd agent-office && npm install
```

### Step 2: Customize Agents

Edit `packages/server/src/rooms/OfficeRoom.ts` to change agent names, roles, personalities, and system prompts. The personality traits (openness, conscientiousness, extraversion, agreeableness, neuroticism) directly influence agent behavior.

### Step 3: Add Custom Tools

Create new tools in `packages/server/src/tools/ToolExecutor.ts`:

```typescript
case 'my_custom_tool':
    return this.myCustomTool(params);
```

Then add the capability to the agent config.

### Step 4: Change the Office Layout

Modify `furnitureTargets` in `OfficeRoom.ts` or use the in-browser Layout Editor to place and save furniture.

---

## 💡 Ideas: What Can You Build With This?

| Use Case | Description |
|----------|-------------|
| 🎓 **AI Classroom** | Teacher agent assigns lessons, student agents learn and ask questions |
| 🏥 **Virtual Hospital** | Doctor, nurse, and patient agents simulate a medical workflow |
| 🏭 **Factory Simulation** | Agents manage assembly lines, quality control, and logistics |
| 🎮 **Game NPC Engine** | Use AgentOffice as the brain for NPCs in your game |
| 📊 **Business Simulation** | CEO, CTO, and team agents run a startup — watch strategy emerge |
| 🧪 **Research Lab** | Agents read papers, discuss findings, and write collaborative reports |
| 🤖 **AI Interview Simulator** | Interviewer and candidate agents practice technical interviews |
| 🎭 **Social Experiment** | Study emergent behavior in AI agent groups with different personalities |
| 📚 **Study Group** | Agents quiz each other, explain concepts, and track learning progress |
| 🏗️ **DevOps Team** | Agents monitor services, create incident tickets, and coordinate fixes |

---

## 📦 Package Overview

| Package | Description |
|---------|-------------|
| `@agent-office/core` | Agent lifecycle (Perceive → Think → Act), Office grid, Task system, Memory with importance scoring |
| `@agent-office/adapters` | InferenceAdapter interface, OllamaAdapter, OpenAICompatibleAdapter, PromptBuilder |
| `@agent-office/server` | Colyseus room, game loop, ToolExecutor (code/search/notes), MemoryStore (SQLite + embeddings) |
| `@agent-office/ui` | Phaser.js renderer, React overlay (Chat, TaskBoard, Inspector, SystemLog, LayoutEditor) |
| `@agent-office/cli` | `create-agent-office` scaffold, `add-agent` commands |

---

## 🧪 Testing

```bash
npm test                                    # All tests
npm test --workspace=@agent-office/core     # Core only
npm test --workspace=@agent-office/adapters # Adapters only
```

---

## 🗺️ Roadmap

- [x] Multi-agent conversations
- [x] UI task assignment
- [x] Persistent memory (SQLite)
- [x] Tool execution (code, search)
- [x] Custom layout editor
- [x] Agent Focus Mode
- [x] Dynamic agent hiring
- [x] Semantic memory search
- [x] System Activity Log
- [x] Emote Bubbles
- [ ] Voice mode (TTS/STT)
- [ ] GitHub PR integration
- [ ] Slack/Discord bridge
- [ ] Multiple office floors
- [ ] Plugin system for custom behaviors
- [ ] Mobile companion app

---

## 📘 Changelog

See release notes in [CHANGELOG.md](./CHANGELOG.md).

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

**Built with** Phaser.js · Colyseus · React · Ollama · SQLite · TypeScript

**Star ⭐ this repo** if you think AI agents deserve their own office!

💙 Shout out to @pablodelucca for building and inspiring this project with [https://github.com/pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents)
