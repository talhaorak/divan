## Description

<!-- A clear and concise description of what this PR does and why. -->

Closes #<!-- issue number, if applicable -->

---

## Type of Change

<!-- Check all that apply -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📝 Documentation update
- [ ] ♻️ Refactor (no functional change)
- [ ] 🎨 Style / UI change
- [ ] ⚙️ Chore (dependency update, config change, etc.)

---

## Checklist

<!-- Please check all items that apply before requesting review. -->

### i18n
- [ ] All new user-visible strings use `t("key")` from `useLanguage()` — no hardcoded text
- [ ] All new i18n keys are added to **both** `tr` and `en` dictionaries in `src/lib/i18n.ts`

### Paths & Security
- [ ] No hardcoded file system paths (no `/Users/...`, no `~/clawd`, no absolute paths)
- [ ] File system access goes through `src/lib/workspace.ts` helpers, not raw `fs` calls in route handlers
- [ ] Environment variables accessed only in server-side code (API routes, `src/lib/`)
- [ ] No sensitive values (tokens, credentials) logged or returned in API responses

### Code Quality
- [ ] `npm run lint` passes with no errors
- [ ] `npx tsc --noEmit` passes (no TypeScript errors)
- [ ] New API routes follow the thin-handler pattern (business logic in `src/lib/`)
- [ ] Component filenames are PascalCase; lib/util filenames are camelCase

### Testing
- [ ] Tested locally with `npm run dev`
- [ ] Language toggle (TR ↔ EN) works correctly for any new strings
- [ ] New API routes respond correctly (manual `curl` or browser test)
- [ ] No regressions on existing pages

### UI Changes
- [ ] Screenshots or screen recording attached below (required for any visual change)
- [ ] Dark theme preserved — no light-mode styles introduced
- [ ] Ottoman colour palette followed (crimson `#dc2626`, gold `#d97706`, navy `#1e3a5f`)

---

## Screenshots / Recordings

<!-- Attach screenshots or a screen recording for UI changes. Delete this section if not applicable. -->

| Before | After |
|--------|-------|
| _screenshot_ | _screenshot_ |

---

## Additional Notes

<!-- Any context, trade-offs, or follow-up work that reviewers should know about. -->
