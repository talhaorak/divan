# Divan — OpenClaw Mission Control

## Why "Divan"?
In the Ottoman Empire, the Divan-ı Hümayun was the imperial council where the Sultan oversaw all affairs of state, and viziers delivered their reports. Your digital divan: agents report in, tasks are tracked, memory is searched.

## Tech Stack
- Next.js 16 (App Router, TypeScript)
- Tailwind CSS
- Three.js + @react-three/fiber (3D visualisation)
- Framer Motion (animations)
- Data: reading from OpenClaw workspace files (configured via OPENCLAW_WORKSPACE)

## Design Philosophy
- ALIVE, animated, spatial like Vibecraft — NOT a boring CRUD dashboard
- Dark theme, Ottoman-inspired accent colours (deep crimson, gold, navy)
- Every agent has a "room" — a 3D scene or at minimum an animated card
- Minimal yet information-dense

## Pages

### 1. Main Scene (/) — The Divan Hall
- 3D or 2.5D isometric view
- Auto-discovered agents appear in their respective spaces
- Active agents are animated (working / standby / sleeping)
- Recent activity feed in a sidebar
- Cron jobs shown in a calendar-style bottom panel

### 2. Memory (/memory)
- Parse MEMORY.md + memory/*.md files and display them in a polished UI
- Search functionality
- Date-based filtering
- In-file sections rendered as collapsible cards

### 3. Tasks (/tasks)
- Parse goals.yaml → goal tree visualisation
- Each goal's pressure/delta values are colour-coded
- TODO.md integration
- Drag & drop priority reordering (nice to have)

### 4. Team (/team)
- Agent profiles auto-discovered from `~/.openclaw/agents/`
- Each agent's role, last activity, and session status
- Sub-agent spawn history

### 5. Timeline (/timeline)
- Cron jobs + heartbeat history
- Daily activity timeline
- Daily logs pulled from memory/YYYY-MM-DD.md files

## Data API Routes
- `/api/memory` — Read MEMORY.md + memory/*.md
- `/api/goals` — Parse goals.yaml
- `/api/agents` — Agent information (IDENTITY.md, session status)
- `/api/cron` — Cron job list
- `/api/timeline` — Daily log files

## Workspace Path
OpenClaw workspace: configured via `OPENCLAW_WORKSPACE` env var (defaults to `~/clawd`)
(Configurable via env: OPENCLAW_WORKSPACE)
