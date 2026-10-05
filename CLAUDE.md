# Atoms: notes for Claude

Atoms is a claude.ai artifact: one HTML page built from this repo and published with the Artifact tool. Read README.md for what it does. To publish or update someone's copy, use the `atoms` skill (`.claude/skills/atoms/SKILL.md`).

## Commands

```bash
npm run check      # tsc --noEmit, build, behaviour tests: run before every commit
npm run build      # dist/atoms.html (+ dist/data/*.json for the store)
npm run preview    # dist/preview.html with the browser mock
npm run screens    # Playwright screenshots + layout checks; PLAYWRIGHT=<path to playwright>, CHROME=<chromium> if needed
npm run manifest   # dist/capabilities.json from local/connectors.json
```

## How the code is put together

- **One page, one script.** esbuild bundles `src/main.ts` into a classic IIFE; `scripts/build.mjs` inlines it with the CSS and `src/page/*.html` into a fragment starting with `<title>`. The publisher wraps that in its own document. No module scripts, no external JS (jsdom tests can't run modules, and artifacts only allow a few CDNs).
- **State.** `S` (`core/state.ts`) is the one mutable app state; `NS` holds the runtime namespaces from `claude.use(...)`, each `null` when this view can't use it. Always design for `null`.
- **Rendering.** Plain template strings. `renderAll()` repaints shell + view; views have `paint*` functions for their parts. Lists go through `reconcile(box, [{key, html, sig}])` so typing isn't interrupted. Escape every interpolated value with `esc()`; strip control characters from anything stored with `clean()`.
- **Events.** One delegated listener set in `ui/events.ts` dispatches on `data-act` / `data-nav` / `data-tab`. Add a case there, not inline handlers.
- **Store.** `userDoc(id)` is the person's private `data/users/<uid>/<id>`. Jobs are `type: "job"` docs beside them. Atoms are stored as `type: "dot"` (internal names keep "dot"; only words on screen say "atom"), asks `type: "action"` (`kind: "tool"` with `payload {server, tool, input}`, `question` with `question {choices, allowText}` and, once answered, `answer {text, at}` and `continuedAt`, or `note`), notes are `<dotId>/runs/<runId>` with the conversation in `thread`. An approved ask keeps `result {label, url, receipt, undo, undone}`. Shared docs: `meta/app` (the artifact's own URL), `meta/runbook`, `library/*` (elements, shown on the Elements page), `adopts/*`. Access rules are in `config/capabilities.json`.
- **Apps are generic.** Whatever `listTools()` reports is the person's app list (`core/apps.ts`). `KNOWN_APPS` only adds a nicer name/colour. Read vs. action vs. risky comes from tool annotations first, then names (`kindOf`). Never hard-code a person's connectors, URL, time zone or repos.
- **Asks.** An atom never changes anything itself. It proposes a tool call; the card is built from the tool's schema (`ai/schemas.ts`, `features/asks.ts`), and only Approve runs it. Risky tools need a second, red tap. Keep it that way.
- **Questions** (`features/questions.ts`): an atom calls `ask_owner` instead of guessing; your answer goes back to it at once (`carryOn` in `ai/flow.ts`) or on its next wake (`openAnswers`).
- **Receipts and undo** (`features/receipts.ts`): every approved ask records what it changed; Undo only reverses exactly that, from a fixed table of inverses, for a day. Add an inverse only when it's exact.
- **The box on Home** (`features/tell.ts`) routes what you type to the atom whose job fits; it never widens what an atom can reach.
- **Jobs** (`features/jobs.ts`): any atom can have up to 8 jobs, stored as their own docs (`type: "job"`, `dotId`, `title`, `rules`, `cloud`, `lastRunAt`, `seen`, `filing`, and either `repo` + `run` for a command job or `task` for a plain-words job). An atom's main job (its responsibility; internally its "check-ins") is the first card on its Jobs tab, laid out like its other jobs, and can be turned off in that card's "Change this job" (`setCheckins`): `jobs` is an object while it's off (`jobDriven`; Ketchup starts that way, `{run: "/catchup"}`) and null while it's on. With it off the atom has no schedule of its own and only does its other jobs. On screen it's always "main job", never "check-ins". Each job has its own routine (`cloud.ts` works on a subject: `subOf(atom, job?)`), and its runs and asks carry `jobId`. A job's run never touches the atom's own `lastRunAt` (unless its main job is off); `lastAt(d)` covers both. Yes-or-no job questions are "decisions" (`isDecision`: a `yes` choice, no free text) and show as one list per run; other job questions are ordinary cards. Answering a run's last question fires that job's routine with "Follow-up run" text, and the atom's own wakes never act on a job's answers. Runbook "JOBS" is the cloud side (J1–J6 for commands, P1–P3 for plain words); it never lets a job message anyone.
- **Voice** (`features/voice.ts`): `speechSynthesis` only, after a tap, with a voice per atom (`voiceOf`: picked in settings, else from its id). Listening is offered only when `canListen()` says the permissions policy allows the microphone; otherwise voice mode sends dictated text after a pause (`dictationPaused`). Voice mode is a per-device preference in `localStorage`, nothing else is.
- **Characters** (`ui/characters.ts`, `styles/characters.css`): `node scripts/spritesheet.mjs --png` draws every shape, face, accessory, state and size with the app's own code. Show the sheet to the owner before shipping a change to the looks.
- **Cloud wakes.** `features/cloud.ts` creates one routine per atom and one per job (`create_trigger` with `create_new_session_on_fire`). The routine's prompt only points at `meta/runbook`; the real instructions are `config/runbook.md`. Bump its `(vN)` on the first line when you change it; setup only rewrites the stored runbook when the version goes up.

## Platform facts (verified, don't re-litigate)

- A page can't attach connectors to a routine: `connectors` is refused, `mcp_connections` is ignored, `persistent_session_id` is blocked for artifacts. The person ticks connectors on the routine's page; the app detects what's missing and links there.
- A manifest lists each server's tools explicitly, at most 128 per server. Widening it makes viewers consent again.
- Cloud sessions reach GitHub through `add_repo` (access "push" for API credentials) and REST via `gh api`; GraphQL is blocked. Atoms never push, comment or merge.
- There's no microphone capability, and artifact pages are served with a permissions policy that blocks the microphone. `speechSynthesis` works after a user gesture.
- `src/platform/*.d.ts` are the runtime's type definitions (artifact-capabilities 0.2.67). Update them from that skill, not by hand.

## Conventions

- TypeScript with `strict: false` for now; there are still ~80 `as any` casts from the split. Prefer real types in new code and remove casts you touch.
- Any behaviour change gets a check in `test/behaviour.cjs` (sections are numbered; the mock runtime is strict on purpose). UI changes: look at `npm run screens` output.
- Copy is plain and warm: say what happened and what to do next. Errors name the cause (`FIX` in `core/constants.ts` maps runtime error codes to words).
- Never commit `dist/` or `local/`.
