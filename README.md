# Dotworks

Small character assistants ("dots") that keep an eye on your apps for you. Each dot has one standing job, like *prep my meetings* or *tell me which pull requests need me*. It reads the apps you give it, writes you a short note, and proposes changes as **asks** you approve in one tap. Nothing in your apps changes until you say so, and anything that can't be undone needs a second, red tap.

Dotworks runs as a [Claude artifact](https://claude.ai): one page, published from this repo, on Claude's runtime. It uses your Claude connectors, Claude's own model for the thinking, and Claude routines to wake dots on a schedule while you're away.

## Get your own copy

Everyone runs their own copy, with their own apps and data.

1. Connect the apps you want dots to use in Claude (Settings → Connectors).
2. Open a Claude session with this repo and say **"set up Dotworks"**.
   Claude builds the page, declares *your* connectors, publishes it, and fills in what it needs (see [the skill](.claude/skills/dotworks/SKILL.md)).
3. Open it, allow apps when it asks, and plant a seed or make a dot.

To pick up new code or an app you've just connected, say **"update Dotworks"** in the same kind of session. It republishes to the same link, so your dots, asks and schedules carry on.

## How it works

```
 you ── the page (artifact) ───────────── Claude's runtime
          │  dots, asks, notes  ──────▶  store (db, private per person)
          │  reads + approved asks ───▶  your connectors (MCP)
          │  thinking  ───────────────▶  Claude (sample)
          │  "Keep it awake"  ────────▶  one routine per dot (Claude Code Remote)
          ▼
 routine fires ─▶ cloud session ─▶ reads meta/runbook ─▶ reads the dot's apps & repos
                                  └▶ writes a note + asks back into the store
```

- **Dots, notes, asks** live in the artifact's store under your private path (`data/users/<you>`).
- **In the app**, a dot wakes with Claude and the read tools of the apps it's allowed to use.
- **In the cloud**, each dot gets its own routine. It follows the runbook in [`config/runbook.md`](config/runbook.md) and can also read GitHub repos you tie to the dot.
- **Asks** are tool calls in waiting: the card is built from the tool's own schema, you can edit every argument, and only *Approve* runs it.

### Platform limits worth knowing

- A page can create a routine but can't attach connectors to it. After **Keep it awake**, open the dot's routine (the app links to it) and tick its apps under *Edit → Connectors*. The app shows what's missing until you do.
- A page declares the connectors and tools it may use (its manifest), at most 128 tools per connector. Declaring more later makes viewers approve the new ones once.
- Routines read GitHub through the REST API (`gh api …`); GraphQL isn't available there.

## Develop

Needs Node 20+.

```bash
npm install
npm run watch      # rebuild dist/dotworks.html on every change
npm run preview    # dist/preview.html: the app in a plain browser with a mock Claude runtime (?scene=full|empty|nocap|signedout)
npm run check      # typecheck + build + behaviour tests (jsdom, strict mock runtime)
npm run screens    # screenshots + layout checks (needs Playwright: PLAYWRIGHT=/path/to/playwright)
npm run manifest   # dist/capabilities.json from local/connectors.json
```

| Path | What's there |
|---|---|
| `src/main.ts` | Entry: boots the app |
| `src/core/` | State (`S`, `NS`), boot and store subscriptions, the app registry, helpers, diagnostics, presence, hot reload |
| `src/ui/` | Shell, navigation, account popover, characters, and the one delegated event handler (`events.ts`) |
| `src/views/` | Home, a dot (chat, activity, schedule, settings), seeds, apps, the dot builder |
| `src/features/` | Asks, cloud schedules, repos, deleting a dot |
| `src/ai/` | Waking a dot, tool schemas, the digest |
| `src/styles/`, `src/page/` | CSS and the page markup |
| `src/platform/` | Type definitions for Claude's artifact runtime |
| `config/` | Base capabilities, the cloud runbook, starter seeds |
| `scripts/` | Build (one self-contained HTML fragment) and manifest |
| `test/` | Behaviour tests, screenshot runner, browser mock |
| `.claude/skills/dotworks/` | The set-up / update skill |

The build is a single HTML fragment (inline CSS and one classic script) because that's what an artifact page is. Fonts come from Google Fonts; there are no other external scripts.

See [`CLAUDE.md`](CLAUDE.md) for conventions when changing the code.
