# CLAUDE.md — AI Agent Instructions for Divan

This file tells AI coding agents (Claude Code, Cursor, GitHub Copilot, etc.) how to work
effectively in this codebase. Read this before making any changes.

---

## What Is Divan?

Divan is a Next.js 16 (App Router) dashboard for monitoring OpenClaw AI agent workspaces.
It is a **read-mostly** app: it reads workspace files (Markdown, YAML) and OpenClaw Gateway
state, and displays them in an animated, spatial UI. There is no database.

Key entry points:
- `src/app/page.tsx` — Home page (3D scene)
- `src/app/memory/page.tsx` — Memory browser
- `src/app/tasks/page.tsx` — Goal tree + TODO
- `src/app/team/page.tsx` — Agent team view
- `src/app/cron/page.tsx` — Cron job manager
- `src/app/api/*/route.ts` — Backend API routes (server-side only)
- `src/lib/workspace.ts` — All file system operations
- `src/lib/i18n.ts` — All UI strings (Turkish + English)
- `src/contexts/LanguageContext.tsx` — i18n hook

---

## Key Patterns to Follow

### 1. i18n: ALWAYS use `useLanguage()` for UI strings

**Never hardcode user-visible strings in components.** Use the `t()` function from the
`useLanguage()` hook instead.

```tsx
// ✅ Correct
import { useLanguage } from "@/contexts/LanguageContext";

export function MyComponent() {
  const { t } = useLanguage();
  return <h1>{t("myComponent.title")}</h1>;
}

// ❌ Wrong
export function MyComponent() {
  return <h1>My Title</h1>;
}
```

When you add a new string, you **must** add the key to **both** `tr` and `en` dictionaries
in `src/lib/i18n.ts`. Keys use dot-notation namespacing:

```ts
// src/lib/i18n.ts — add to BOTH dictionaries
const tr: Translations = {
  // ...
  "myComponent.title": "Başlık",
  "myComponent.someLabel": "Bir etiket",
};

const en: Translations = {
  // ...
  "myComponent.title": "Title",
  "myComponent.someLabel": "A label",
};
```

For strings with dynamic values, use `{placeholder}` syntax:
```ts
"myComponent.count": "{n} öğe",  // TR
"myComponent.count": "{n} items", // EN
```
```tsx
t("myComponent.count", { n: items.length })
```

### 2. Components

- Pages go in `src/app/<page-name>/page.tsx` — these are **server components** by default.
  Add `"use client"` at the top only when you need hooks, state, or browser APIs.
- Shared UI components go in `src/components/`.
- Use **PascalCase** for component filenames: `AgentCard.tsx`, not `agent-card.tsx`.
- Use functional components with hooks. No class components.
- Wrap client-only logic in `useEffect` to avoid hydration errors.

### 3. API Routes

All API routes live in `src/app/api/<name>/route.ts`. They follow this pattern:

```ts
import { NextResponse } from "next/server";
import { someWorkspaceHelper } from "@/lib/workspace";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const param = searchParams.get("param");

  const data = await someWorkspaceHelper(param ?? "");
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ data });
}
```

Rules for API routes:
- Keep route handlers thin. Put business logic in `src/lib/`.
- All file system operations go through `src/lib/workspace.ts` helpers — never use `fs` directly in route handlers.
- Never expose environment variables (especially `OPENCLAW_GATEWAY_TOKEN`) in responses.
- Auth tokens and workspace paths are **server-side only** — never import them in client components.

### 4. File System Access

Always use the helpers in `src/lib/workspace.ts`:

```ts
import { readWorkspaceFile, writeFileContent } from "@/lib/workspace";

// Read a workspace file (returns null if missing)
const content = await readWorkspaceFile("MEMORY.md");

// Write a workspace file (returns false on failure)
const ok = await writeFileContent("memory/note.md", "content here");
```

**Never** construct paths with string concatenation. Use `path.join()`:
```ts
// ✅
const fullPath = path.join(WORKSPACE, relativePath);

// ❌
const fullPath = WORKSPACE + "/" + relativePath;
```

The `writeFileContent()` function validates that the resolved path is within WORKSPACE
(path-traversal protection). Do not bypass this check.

### 5. Environment Variables

Access env vars only in server-side code (API routes, `src/lib/`):

```ts
// ✅ In src/lib/workspace.ts or src/app/api/*/route.ts
const workspace = process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), "clawd");

// ❌ In src/components/ or src/app/page.tsx (client-side)
const workspace = process.env.OPENCLAW_WORKSPACE; // undefined in browser
```

Available env vars:
- `OPENCLAW_WORKSPACE` — path to the OpenClaw workspace (always use this, never hardcode)
- `OPENCLAW_GATEWAY_URL` — gateway WebSocket URL
- `OPENCLAW_GATEWAY_HTTP` — gateway HTTP URL
- `OPENCLAW_GATEWAY_TOKEN` — gateway auth token (never log or expose this)

### 6. Styling

- Tailwind CSS utility classes only. Do not write custom CSS unless adding a CSS custom property to `globals.css`.
- The app is **dark-theme only**. Do not add light-mode variants.
- Colour conventions:
  - Page background: `bg-[#0a0a0f]` or `bg-black`
  - Cards/panels: `bg-[#111118]` or `bg-white/5`
  - Borders: `border-[#1e1e2e]` or `border-white/10`
  - Primary accent (crimson): `text-red-500`, `border-red-500`, `#dc2626`
  - Gold accent: `text-amber-500`, `#d97706`
  - Violet accent: `text-violet-500`, `#7c3aed`
  - Muted text: `text-gray-500` or `text-white/40`

---

## Common Pitfalls

### ❌ Hardcoded paths
```ts
// Wrong
const memoryPath = "/Users/someone/clawd/MEMORY.md";
const memoryPath = "~/clawd/MEMORY.md";  // still wrong — don't assume path

// Right
import { WORKSPACE } from "@/lib/workspace";
const memoryPath = path.join(WORKSPACE, "MEMORY.md");
```

### ❌ Breaking i18n
```tsx
// Wrong — new page with hardcoded English text
<h1>Memory Browser</h1>
<p>No files found</p>

// Right — add keys to i18n.ts, then use t()
<h1>{t("memory.title")}</h1>
<p>{t("memory.empty")}</p>
```

### ❌ Using env vars in client components
```tsx
// Wrong — OPENCLAW_GATEWAY_TOKEN is undefined in browser builds
"use client";
const token = process.env.OPENCLAW_GATEWAY_TOKEN;
```

### ❌ Direct fs access in API routes
```ts
// Wrong — bypasses security checks in workspace.ts
import fs from "fs/promises";
const content = await fs.readFile(someUserInput, "utf-8");

// Right — path-traversal safe
import { readFileContent } from "@/lib/workspace";
const content = await readFileContent(someUserInput);
```

### ❌ Forgetting to add i18n key to both languages
If you add a key only to `en` but not `tr` (or vice versa), the other language will show
the raw key string instead of translated text.

---

## Testing Guidance

There is currently no automated test suite. Manual testing checklist:

1. **Dev server starts:** `npm run dev` — no TypeScript errors, no 404 on main routes
2. **Language toggle works:** Click the TR/EN toggle in the navbar — all visible strings change
3. **Memory page loads:** `/memory` — should show MEMORY.md sections (or empty state if no workspace)
4. **No hardcoded paths:** Grep for `/Users/`, `~/clawd`, or absolute paths in source:
   ```bash
   grep -r "/Users/" src/ --include="*.ts" --include="*.tsx"
   grep -r "~/clawd" src/ --include="*.ts" --include="*.tsx"
   ```
5. **Lint passes:** `npm run lint`
6. **TypeScript clean:** `npx tsc --noEmit`

When adding a new API route, test it manually:
```bash
curl http://localhost:3000/api/<your-route>
```

---

## Adding a New Page

1. Create `src/app/<page-name>/page.tsx`
2. Add nav link in `src/components/Navbar.tsx`
3. Add i18n keys for the page in `src/lib/i18n.ts` (both `tr` and `en`)
4. If the page needs data, add an API route in `src/app/api/<page-name>/route.ts`
5. Put any file-reading logic in a new helper in `src/lib/workspace.ts`

---

## Adding a New API Route

1. Create `src/app/api/<name>/route.ts`
2. Export named HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`)
3. Call workspace helpers from `src/lib/workspace.ts` for file operations
4. Return `NextResponse.json({ ... })`
5. Handle errors with appropriate status codes (404 for missing, 400 for bad input, 403 for unauthorized writes)

---

## Package Conventions

- Import order: external packages → `@/lib/` → `@/components/` → `@/contexts/` → local types
- Use `@/` path aliases (configured in tsconfig) for all src imports
- Do not add new dependencies without a clear need. Check if something in the existing stack can do the job first.

---

## Quick Reference

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint check
npx tsc --noEmit     # TypeScript check without building
```

Workspace file structure the app depends on:
```
~/clawd/                       # OPENCLAW_WORKSPACE
├── MEMORY.md                  # Long-term memory
├── SOUL.md                    # Agent identity/soul
├── AGENTS.md                  # Agent rules
├── USER.md                    # User profile
├── HEARTBEAT.md               # Heartbeat checklist
├── IDENTITY.md                # Agent identity
├── goals.yaml                 # Goal tree
├── TODO.md                    # TODO list
├── memory/                    # Daily logs (YYYY-MM-DD.md)
├── .openclaw/
│   └── cron-state.json        # Cron job state
└── .divan-backups/            # Auto-created by Divan for file backups
```
