# Dotworks: notes for Claude

Dotworks is a claude.ai artifact: one HTML page built from this repo and published with the Artifact tool. Read README.md for what it does. To publish or update someone's copy, use the `dotworks` skill (`.claude/skills/dotworks/SKILL.md`).

## Commands

```bash
npm run check      # tsc --noEmit, build, behaviour tests: run before every commit
npm run build      # dist/dotworks.html (+ dist/data/*.json for the store)
npm run preview    # dist/preview.html with the browser mock
npm run screens    # Playwright screenshots + layout checks; PLAYWRIGHT=<path to playwright>, CHROME=<chromium> if needed
npm run manifest   # dist/capabilities.json from local/connectors.json
```

## How the code is put together

- **One page, one script.** esbuild bundles `src/main.ts` into a classic IIFE; `scripts/build.mjs` inlines it with the CSS and `src/page/*.html` into a fragment starting with `<title>`. The publisher wraps that in its own document. No module scripts, no external JS (jsdom tests can't run modules, and artifacts only allow a few CDNs).
- **State.** `S` (`core/state.ts`) is the one mutable app state; `NS` holds the runtime namespaces from `claude.use(...)`, each `null` when this view can't use it. Always design for `null`.
- **Rendering.** Plain template strings. `renderAll()` repaints shell + view; views have `paint*` functions for their parts. Lists go through `reconcile(box, [{key, html, sig}])` so typing isn't interrupted. Escape every interpolated value with `esc()`; strip control characters from anything stored with `clean()`.
- **Events.** One delegated listener set in `ui/events.ts` dispatches on `data-act` / `data-nav` / `data-tab`. Add a case there, not inline handlers.
- **Store.** `userDoc(id)` is the person's private `data/users/<uid>/<id>`. Dots are `type: "dot"`, asks `type: "action"` (`kind: "tool"` with `payload {server, tool, input}`, or `note`), notes are `<dotId>/runs/<runId>`. Shared docs: `meta/app` (the artifact's own URL), `meta/runbook`, `library/*` (seeds), `adopts/*`. Access rules are in `config/capabilities.json`.
- **Apps are generic.** Whatever `listTools()` reports is the person's app list (`core/apps.ts`). `KNOWN_APPS` only adds a nicer name/colour. Read vs. action vs. risky comes from tool annotations first, then names (`kindOf`). Never hard-code a person's connectors, URL, time zone or repos.
- **Asks.** A dot never changes anything itself. It proposes a tool call; the card is built from the tool's schema (`ai/schemas.ts`, `features/asks.ts`), and only Approve runs it. Risky tools need a second, red tap. Keep it that way.
- **Cloud wakes.** `features/cloud.ts` creates one routine per dot (`create_trigger` with `create_new_session_on_fire`). The routine's prompt only points at `meta/runbook`; the real instructions are `config/runbook.md`. Bump its `(vN)` on the first line when you change it; setup only rewrites the stored runbook when the version goes up.

## Platform facts (verified, don't re-litigate)

- A page can't attach connectors to a routine: `connectors` is refused, `mcp_connections` is ignored, `persistent_session_id` is blocked for artifacts. The person ticks connectors on the routine's page; the app detects what's missing and links there.
- A manifest lists each server's tools explicitly, at most 128 per server. Widening it makes viewers consent again.
- Cloud sessions reach GitHub through `add_repo` (access "push" for API credentials) and REST via `gh api`; GraphQL is blocked. Dots never push, comment or merge.
- `src/platform/*.d.ts` are the runtime's type definitions (artifact-capabilities 0.2.67). Update them from that skill, not by hand.

## Conventions

- TypeScript with `strict: false` for now; there are still ~80 `as any` casts from the split. Prefer real types in new code and remove casts you touch.
- Any behaviour change gets a check in `test/behaviour.cjs` (sections are numbered; the mock runtime is strict on purpose). UI changes: look at `npm run screens` output.
- Copy is plain and warm: say what happened and what to do next. Errors name the cause (`FIX` in `core/constants.ts` maps runtime error codes to words).
- Never commit `dist/` or `local/`.
