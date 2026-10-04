import { normSources, shortOf } from "../core/apps";
import { ICON } from "../core/constants";
import { diag } from "../core/diag";
import { $, autosize, clean, esc, toast } from "../core/helpers";
import { NS, S } from "../core/state";
import { normRepos } from "./repos";
import { sendReply } from "../ai/flow";
import { avatarHtml } from "../ui/characters";
import { openDot } from "../ui/nav";
import { openNew, renderSheet, draftWithClaude } from "../views/builder";

/* One box on Home: say what you want, and it goes to the dot whose job fits, as a message in that dot's chat.
   You never have to pick a dot (people prefer the routing done for them), and routing never widens what a dot
   can reach: the dot answers with its own apps. When no dot does this yet, it offers to make one. */

const STOP = new Set("about after again also because been before could does doing done from have just like make more need only other over should some than that their them then there these they this those very want what when where which while will with would your yours please thanks today tomorrow".split(" "));
const words = (t: string) => [...new Set(clean(t).toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || [])].filter(w => !STOP.has(w));
function score(d, ws: string[]) {
  const hay = words([d.name, d.responsibility, ...(d.rules || []), ...normSources(d.sources).map(shortOf), ...normRepos(d.repos).list].join(" "));
  return ws.reduce((n, w) => n + (hay.some(h => h === w || (w.length > 4 && (h.startsWith(w.slice(0, 5)) || w.startsWith(h.slice(0, 5))))) ? 1 : 0), 0);
}
// best first, by how many of your words a dot's job shares; recent activity breaks ties
export function rankDots(text: string) {
  const ws = words(text);
  return S.dots.map(d => ({ d, n: score(d, ws) })).sort((a, b) => b.n - a.n || (b.d.lastRunAt || 0) - (a.d.lastRunAt || 0));
}
// without Claude: only a clear winner counts as sure
function guess(text: string) {
  const r = rankDots(text), [a, b] = r;
  return { dot: a && a.n > 0 ? a.d : null, sure: !!a && a.n >= 2 && a.n >= 2 * (b?.n || 0) };
}

function routePrompt(text: string) {
  const list = S.dots.map(d => `- ${d.id}: "${clean(d.name)}". Job: ${clean(d.responsibility).replace(/\s+/g, " ").slice(0, 260)} Reads: ${normSources(d.sources).map(shortOf).join(", ") || "nothing"}.${normRepos(d.repos).mode !== "none" ? " Watches GitHub repos." : ""}`).join("\n");
  return `The owner of a set of personal assistant "atoms" typed a message for them. Each atom has one job. Pick the atom whose job this message belongs to.\nThe message:\n"""${text.slice(0, 1200)}"""\nTheir atoms:\n${list}\nReply with only one JSON object: {"atom": "<the id of the best atom, or none if no atom's job covers this>", "sure": true or false}`;
}

export async function tellDots(raw: string) {
  const text = clean(raw).replace(/\s+\n/g, "\n").trim().slice(0, 2000);
  if (!text || S.tell?.busy || !S.uid) return;
  if (!S.dots.length) return newDotFrom(text);
  if (S.dots.length === 1) return deliver(S.dots[0], text);
  S.tell = { busy: true, text }; paintTell();
  let pick = null, sure = false, none = false;
  if (NS.sample && (S.perms as any).sample !== "denied") {
    try {
      const j: any = await NS.sample.json(routePrompt(text), { modelTier: "quick" });
      const id = String(j?.atom || j?.dot || ""), dd = S.dots.find(x => x.id === id);
      if (dd) { pick = dd; sure = j?.sure !== false; } else if (id === "none") none = true;
    } catch (e) { diag("sample.route", e); }
  }
  if (!pick && !none) { const g = guess(text); pick = g.dot; sure = g.sure; }
  if (pick && sure) { S.tell = null; paintTell(); return deliver(pick, text); }
  // not sure: show the likeliest dots (Claude's pick first) and a way to make a new one
  const ranked = rankDots(text).map(x => x.d), choices = [...new Set([...(pick ? [pick] : []), ...ranked])].slice(0, 3).map(d => d.id);
  S.tell = { busy: false, text, choices, none }; paintTell();
}

// hand the message to a dot: open its chat and send it there as soon as its conversation has loaded
export function deliver(d, text: string) {
  S.pendingSend = { dotId: d.id, text };
  toast(`Over to ${d.name}`);
  if (S.view === "dot" && S.selected === d.id && S.runsLoaded) flushPendingSend();
  else openDot(d.id, "chat");
}
export function flushPendingSend() {
  const p = S.pendingSend; if (!p || S.view !== "dot" || S.selected !== p.dotId || !S.runsLoaded) return;
  S.pendingSend = null;
  // busy, or no Claude here: leave it in the message box so nothing you typed is lost
  if (S.running?.dotId === p.dotId || (S.chat && S.chat.dotId === p.dotId) || !NS.sample) { const ta = $("#reply"); if (ta) { ta.value = p.text; autosize(ta); ta.focus(); } return; }
  sendReply(p.text);
}

export function newDotFrom(text: string) {
  openNew(null);
  if (!S.formDraft) return;
  S.formDraft.ask = text.slice(0, 600); S.formDraft.rev = (S.formDraft.rev || 0) + 1; renderSheet();
  if (NS.sample) draftWithClaude();
}

export function paintTell() {
  const form = $("#tell"); if (!form) return;
  const show = !!(S.uid && NS.db && S.dotsLoaded && NS.sample && (S.perms as any).sample !== "denied");
  form.hidden = !show;
  const note = $("#tellNote");
  if (!show) { if (note) note.innerHTML = ""; return; }
  const inp = $("#tellIn"), t = S.tell;
  const ph = S.dots.length ? "Tell your atoms something…" : "Describe a job, and an atom is made for it…";
  if (inp.placeholder !== ph) inp.placeholder = ph;
  inp.disabled = !!t?.busy; $("#tellSend").disabled = !!t?.busy;
  let html = "";
  if (t?.busy) html = `<span class="fine">Finding the right atom…</span>`;
  else if (t?.choices) html = `<span class="fine">${t.none ? "None of your atoms does this yet." : "Which atom should take this?"}</span>${t.choices.map(id => { const d = S.dots.find(x => x.id === id); return d ? `<button type="button" class="chip" data-act="tell-pick" data-id="${esc(d.id)}">${avatarHtml(d, { size: 16 })}${esc(d.name)}</button>` : ""; }).join("")}<button type="button" class="chip" data-act="tell-new">${ICON.plus}New atom for this</button><button type="button" class="link" data-act="tell-cancel">Never mind</button>`;
  if (note.innerHTML !== html) note.innerHTML = html;
}
