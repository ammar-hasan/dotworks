---
name: atoms
description: Set up, update or republish your own copy of Atoms (formerly Dotworks), a claude.ai artifact built from this repo. Use when asked to "set up Atoms", "update Atoms", "finish Atoms setup" (or the same with Dotworks), add a newly connected app to Atoms, or publish the latest code.
---

# Atoms: set up or update your copy

Atoms is one page published as a claude.ai artifact. Everyone runs their own copy: the same code, their own connectors, their own atoms and data. This skill builds the page from this repo, declares the person's own connectors, publishes it, and fills the artifact's store with what the page and its cloud wakes need.

It needs a Claude session on claude.ai with this repo cloned and the **Artifact** and **ArtifactData** tools (load them with ToolSearch if they are deferred). Claude Code in a terminal can build and test but can't publish artifacts: say so and stop if those tools aren't available.

Never create routines, run tools in the person's apps, or edit their atoms from here: the page does that, with their approval.

## 1. Build and check

```bash
npm ci            # or npm install when there is no package-lock.json
npm run check     # typecheck + build + behaviour tests
```

Stop and report if anything fails. A good build prints `built dist/atoms.html · … · runbook vN` and the tests end with `ALL PASSED`.

## 2. Declare their connectors

1. Call **ListConnectors** (no keywords).
2. Write `local/connectors.json` (git-ignored):
   ```json
   { "connectors": <the rows ListConnectors returned, as is>,
     "tools": ["mcp__Gmail__search_threads", "mcp__Google_Calendar__list_events", "..."] }
   ```
   `tools` is every tool name in this session that starts with `mcp__`, loaded or deferred, copied exactly from your tool list. Include `mcp__claude-code-remote__…` ones when you have them. Never invent a name: the script matches each connector's tools by the `mcp__<name>__` prefix.
3. `npm run manifest` writes `dist/capabilities.json` and prints each app with its tool count, plus warnings:
   - *no tools visible / turned off for this chat*: that connector's tools aren't in this session. Tell the person they can turn it on for this chat and run this again, or go ahead without it.
   - *offers N tools, a page may declare 128*: some tools were left out (named). That's fine; mention it.
   - *Claude Code Remote not seen*: atoms will still wake in the app, but "Keep it awake" (cloud wakes) won't work for them.

## 3. Find their Atoms

- If the person gave an artifact link, use it.
- Otherwise **Artifact** `action: "list"` (`scope: "mine"`, `limit: 50`) and look for the title **Atoms** (copies published before the rename are titled **Dotworks**). One match: use it. Several: ask which (AskUserQuestion, with each one's last-updated time). None: this is a first setup.
- Only publish to an artifact the person owns or can edit ("writer" when read).

## 4. Publish

Pass the JSON object in `dist/capabilities.json` as `capabilities` (read the file; send it as an object, not a string).

- **Update** (an artifact was found): first **Artifact** `action: "read"` with its `url` (a publish to it is refused otherwise), then publish with `file_path: "dist/atoms.html"`, the same `url`, `capabilities`, and a short `label` such as "v6.2" (the version is in package.json). No `icon`.
- **First setup**: publish with `file_path: "dist/atoms.html"`, `icon: "robot"`, `capabilities`, and `description: "Small character assistants that read your apps and ask before they act."`

If the manifest gained tools or apps since the last publish, each viewer approves the new ones once: tell the person.

## 5. Fill the store

All with **ArtifactData**, `url` = the artifact. Read each document first and pin writes with its `version` (`if_version`); one `batch` for the writes is best.

| Document | Write when | Data |
|---|---|---|
| `meta/app` | missing, or its `url` isn't this artifact's link | `{"url": "<the artifact link, https://claude.ai/artifact/…>"}` |
| `meta/runbook` | missing, or its `version` is lower than in `dist/data/runbook.json` | `file_path: "dist/data/runbook.json"` |
| `library/starter` | missing, or its `templates` differ from `dist/data/starter.json` | `file_path: "dist/data/starter.json"` |

`meta/app` is how the page knows its own address: without it, "Keep it awake" stays off because a cloud wake couldn't find its way back. `meta/runbook` is what every cloud wake follows (source: `config/runbook.md`). `library/starter` is the starter seeds (source: `config/seeds/starter.json`).

## 6. Tell the person

Keep it short:
- Published (the card carries the link), and what changed if it was an update.
- The apps it can use, from the manifest output, and anything left out and why.
- On a first setup, how to start: open it and allow apps when asked; add one from Elements or make their own; **Keep it awake** gives an atom its own routine. Claude can't attach apps to a routine a page creates, so on the routine's page (the app links to it) they open Edit → Connectors and tick the apps that atom reads; the app shows which are missing until they do.

## "Finish Atoms setup"

The page asks for this when `meta/app` is missing. Do step 3, then only the `meta/app` row of step 5. Nothing needs rebuilding.

## Updating later

"Update Atoms" (new code, or a newly connected app) is steps 1 to 6 again against the same artifact link, so atoms, asks and routines carry on. Run `git pull` first when the person wants the latest code.
