# Atoms

_Formerly Dotworks; the repo keeps its old name for now._

Small character assistants ("atoms") that keep an eye on your apps for you. Each atom has one standing job, like *prep my meetings* or *tell me which pull requests need me*. It reads the apps you give it, writes you a short note, and proposes changes as **asks** you approve in one tap. Nothing in your apps changes until you say so, and anything that can't be undone needs a second, red tap.

Atoms runs as a [Claude artifact](https://claude.ai): one page, published from this repo, on Claude's runtime. It uses your Claude connectors, Claude's own model for the thinking, and Claude routines to wake atoms on a schedule while you're away.

## Get your own copy

Everyone runs their own copy, with their own apps and data.

1. Connect the apps you want atoms to use in Claude (Settings → Connectors).
2. Open a Claude session with this repo and say **"set up Atoms"**.
   Claude builds the page, declares *your* connectors, publishes it, and fills in what it needs (see [the skill](.claude/skills/atoms/SKILL.md)).
3. Open it, allow apps when it asks, and add one from Elements or make your own.

To pick up new code or an app you've just connected, say **"update Atoms"** in the same kind of session. It republishes to the same link, so your atoms, asks and schedules carry on.

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

- **Atoms, notes, asks** live in the artifact's store under your private path (`data/users/<you>`).
- **In the app**, an atom wakes with Claude and the read tools of the apps it's allowed to use.
- **In the cloud**, each atom gets its own routine. It follows the runbook in [`config/runbook.md`](config/runbook.md) and can also read GitHub repos you tie to the dot.
- **Asks** are tool calls in waiting: the card is built from the tool's own schema, you can edit every argument, and only *Approve* runs it. Afterwards a receipt says what changed, with an Undo where there's an exact way back.
- **Questions**: when the right move depends on something only you know, an atom asks with a few answers to tap, and carries on as soon as you answer.
- **One box on Home**: type what you want and it goes to the atom whose job fits, or offers to make one.
- **Jobs**: an atom can run a command from your repos, like `/catchup`, as jobs: one per repo, each on its own schedule in the cloud. Whenever the command needs your say, it leaves plain-words questions in Asks ("Call with Sara on Tuesday · Add it / Skip"), and once you've answered a run's questions it carries on with what you said yes to. **Ketchup** on Elements is a ready-made one.
- **Voice**: turn on voice on an atom's page and it reads its replies aloud in its own voice (your device's built-in voices; pick one in its settings). Any note has *Read aloud*. You talk back with your keyboard's mic, and in voice mode your message goes when you pause. Where the page may use the microphone, a mic button gives you a hands-free back and forth.

### Platform limits worth knowing

- A page can create a routine but can't attach connectors to it. After **Keep it awake**, open the atom's routine (the app links to it) and tick its apps under *Edit → Connectors*. The app shows what's missing until you do.
- A page declares the connectors and tools it may use (its manifest), at most 128 tools per connector. Declaring more later makes viewers approve the new ones once.
- Routines read GitHub through the REST API (`gh api …`); GraphQL isn't available there.
- Artifact pages can't use the microphone today, so the mic button stays hidden there; speaking aloud works anywhere the device has voices.

## Develop

Needs Node 20+.

```bash
npm install
npm run watch      # rebuild dist/atoms.html on every change
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
| `src/views/` | Home, an atom (chat, activity, schedule, settings), elements, apps, the atom builder |
| `src/features/` | Asks, questions, receipts and undo, the Home box, voice, jobs, cloud schedules, repos, deleting an atom |
| `src/ai/` | Waking an atom, tool schemas, the digest |
| `src/styles/`, `src/page/` | CSS and the page markup |
| `src/platform/` | Type definitions for Claude's artifact runtime |
| `config/` | Base capabilities, the cloud runbook, starter elements |
| `scripts/` | Build (one self-contained HTML fragment), manifest, and the character sheet (`spritesheet.mjs`) |
| `test/` | Behaviour tests, screenshot runner, browser mock |
| `.claude/skills/atoms/` | The set-up / update skill |

The build is a single HTML fragment (inline CSS and one classic script) because that's what an artifact page is. Fonts come from Google Fonts; there are no other external scripts.

See [`CLAUDE.md`](CLAUDE.md) for conventions when changing the code.
