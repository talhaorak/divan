# Contributing to Divan

Thank you for your interest in contributing to Divan! This document outlines how to get involved.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Branch Naming](#branch-naming)
- [Commit Style](#commit-style)
- [Pull Request Workflow](#pull-request-workflow)
- [Code Style](#code-style)
- [Reporting Issues](#reporting-issues)

---

## Code of Conduct

Be kind, constructive, and respectful. This project is maintained in a collaborative spirit.

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/talhaorak/divan.git
   cd divan
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Configure your environment:**
   ```bash
   cp .env.example .env.local
   # Fill in your OpenClaw workspace path and gateway token
   ```
5. **Start the dev server:**
   ```bash
   npm run dev
   ```

---

## Branch Naming

Use descriptive, kebab-case branch names with a type prefix:

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<description>` | `feat/timeline-view` |
| Bug fix | `fix/<description>` | `fix/memory-scroll` |
| Docs | `docs/<description>` | `docs/api-routes` |
| Refactor | `refactor/<description>` | `refactor/workspace-lib` |
| Chore | `chore/<description>` | `chore/update-deps` |

---

## Commit Style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**
```
feat(memory): add full-text search with debounce
fix(gateway): handle WS reconnect on timeout
docs: update README with screenshots section
chore: bump three.js to 0.184
```

---

## Pull Request Workflow

1. Ensure your branch is up to date with `master`:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```
2. Run lint before opening a PR:
   ```bash
   npm run lint
   ```
3. Open a Pull Request against `main` with:
   - A clear title following commit convention
   - Description of what changed and why
   - Screenshots/recordings for UI changes
   - Reference to any related issues (`Closes #123`)

4. PRs require at least one approving review before merging.

---

## Code Style

- **TypeScript** — strict mode, explicit types preferred
- **Tailwind CSS** — utility-first; avoid custom CSS unless necessary
- **React** — functional components with hooks only
- **Imports** — group: external libraries → internal modules → types
- **File naming** — PascalCase for components, camelCase for lib/util files
- **API routes** — keep route handlers thin; business logic goes in `src/lib/`
- **No hardcoded paths** — all file system paths must use `OPENCLAW_WORKSPACE` env var or `os.homedir()`

Run the linter:
```bash
npm run lint
```

---

## Reporting Issues

Use the GitHub Issue templates:
- **[Bug Report](.github/ISSUE_TEMPLATE/bug_report.md)** — for broken functionality
- **[Feature Request](.github/ISSUE_TEMPLATE/feature_request.md)** — for new ideas

Please search existing issues before opening a new one.

---

## Questions?

Open a [GitHub Discussion](https://github.com/talhaorak/divan/discussions) or file an issue with the `question` label.
