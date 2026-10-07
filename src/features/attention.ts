import { diag } from "../core/diag";
import { ago, clone, esc, fmtTime, pad, plural, toast, upsertLocal } from "../core/helpers";
import { NS, S, lastAt, pending, upsertDocLocal, userDoc } from "../core/state";
import { isLead } from "../ui/characters";
import { renderAll } from "../ui/shell";
import { groupKey, isDecision } from "./jobs";

/* ─── your attention ───
   The super atom guards how much reaches you. Its owner sets a budget (on the super atom's You tab):
   - open: when this many decisions already wait for you, new asks that can wait are held back ("held") and come
     back as you clear the others, oldest first. One run's yes-or-no list counts as one thing.
   - unread: while this many atoms have notes you haven't opened, the super atom doesn't ping you.
   - pings, gap, quietFrom/quietTo: at most this many pings a day, this many hours apart, none in quiet hours.
   Pings themselves come from the super atom's cloud runs (config/runbook.md, THE SUPER ATOM), which keep their
   count in data/users/<you>/pings; this page only shows it. What you've read is data/users/<you>/reads.
   Without a super atom nothing is held: atoms behave as they always have. */

export const ATTENTION = { open: 5, unread: 5, pings: 4, gap: 3, quietFrom: 22, quietTo: 8 };
const LIMITS = { open: [1, 30], unread: [1, 30], pings: [0, 12], gap: [1, 12], quietFrom: [0, 23], quietTo: [0, 23] };
export const leadOf = () => S.dots.find(d => isLead(d) && !S.gone.has(d.id)) || null;
export function attentionOf(lead = leadOf()): typeof ATTENTION {
  const a = (lead?.attention && typeof lead.attention === "object" ? lead.attention : {}) as Record<string, any>, out = { ...ATTENTION };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) { const v = Number(a[k]); if (a[k] !== null && a[k] !== undefined && Number.isFinite(v) && v >= lo && v <= hi) out[k] = Math.round(v); }
  return out;
}

// what waits for you, counted the way you'd count it: one run's yes-or-no list is one thing
export function waitingUnits(list = pending()) {
  const seen = new Set<string>(); let n = 0;
  for (const a of list) { if (isDecision(a)) { const k = groupKey(a); if (seen.has(k)) continue; seen.add(k); } n++; }
  return n;
}
export const heldAsks = () => S.actions.filter(a => a.state === "held").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1));
// with a super atom, a new ask that can wait is held while too much already waits for you
export function holdNow(urgent = false) { const lead = leadOf(); return !!lead && !urgent && waitingUnits() >= attentionOf(lead).open; }

/* you cleared some: bring back the oldest held ones (a run's yes-or-no list comes back whole). Without a super atom,
   everything held comes back. */
let releasing = false;
export async function releaseHeld() {
  const held = heldAsks(); if (!held.length || releasing || !NS.db || !S.uid) return;
  const lead = leadOf();
  let room = lead ? attentionOf(lead).open - waitingUnits() : held.length;
  if (room <= 0) return;
  releasing = true;
  try {
    const done = new Set<string>();
    for (const a of held) {
      if (room <= 0) break;
      if (done.has(a.id)) continue;
      const batch = isDecision(a) ? held.filter(x => isDecision(x) && groupKey(x) === groupKey(a)) : [a];
      for (const x of batch) {
        done.add(x.id); upsertLocal(S.actions, x.id, { state: "pending" });
        await userDoc(x.id).update({ state: "pending", releasedAt: Date.now() }).catch(e => diag("db.release", e));
      }
      room--;
    }
  } finally { releasing = false; renderAll(); }
}

/* notes you haven't read: an atom whose latest run is newer than when you last opened its chat (and newer than
   when you started counting, so old notes never count) */
export function unreadDots() {
  const r = S.reads || {}, since = Number(r.since) || Date.now(), at = r.at && typeof r.at === "object" ? r.at : {};
  return S.dots.filter(d => { const t = lastAt(d) || 0; return t > since && t > (Number(at[d.id]) || 0); });
}
let readTimer = null;
export function markRead(d) {
  if (!d || !NS.db || !S.uid || !S.reads) return;
  const t = lastAt(d) || 0, at = (S.reads.at && typeof S.reads.at === "object" ? S.reads.at : {}) as Record<string, number>;
  if (!t || (Number(at[d.id]) || 0) >= t) return;
  S.reads = { ...S.reads, at: { ...at, [d.id]: Date.now() } };
  clearTimeout(readTimer);
  readTimer = setTimeout(() => userDoc("reads").set(clone(S.reads)).catch(e => diag("db.reads", e)), 800);
}
// counting starts when you first have a super atom
export function ensureReads() {
  if (S.reads || !S.readsLoaded || S.readsTried || !NS.db || !S.uid || !leadOf()) return;
  S.readsTried = true; S.reads = { since: Date.now(), at: {} };
  userDoc("reads").set(clone(S.reads)).catch(e => { S.readsTried = false; diag("db.reads", e); });
}

/* whether a ping may go out now, and if not why (the cloud run decides the same way) */
const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export function quietNow(at = attentionOf(), now = Date.now()) {
  const h = new Date(now).getHours();
  if (at.quietFrom === at.quietTo) return false;
  return at.quietFrom > at.quietTo ? h >= at.quietFrom || h < at.quietTo : h >= at.quietFrom && h < at.quietTo;
}
export type Hold = { kind: "off" | "quiet" | "count" | "gap" | "waiting" | "unread"; text: string };
export function pingHold(now = Date.now()): Hold | null {
  const lead = leadOf(); if (!lead) return null;
  const at = attentionOf(lead), p = S.pings || {};
  if (at.pings === 0) return { kind: "off", text: "you turned pings off" };
  if (quietNow(at, now)) return { kind: "quiet", text: `quiet hours until ${pad(at.quietTo)}:00` };
  if (p.day === dayKey(now) && (Number(p.count) || 0) >= at.pings) return { kind: "count", text: `${plural(at.pings, "ping")} today already` };
  if (p.lastAt && now - p.lastAt < at.gap * 3600e3) return { kind: "gap", text: `the next can go out after ${fmtTime(p.lastAt + at.gap * 3600e3)}` };
  const w = waitingUnits(); if (w >= at.open) return { kind: "waiting", text: `${plural(w, "thing")} already ${w === 1 ? "waits" : "wait"} for you` };
  const u = unreadDots().length; if (u >= at.unread) return { kind: "unread", text: `${plural(u, "atom")} ${u === 1 ? "has" : "have"} notes you haven't read` };
  return null;
}

/* the settings, on the super atom's You tab */
const LABEL = { pings: "Pings a day", gap: "Hours between pings", quietFrom: "Quiet from", quietTo: "Quiet until", open: "How many waiting before new asks are held back", unread: "How many atoms with unread notes before pings wait" };
const opt = (k: string, vals: number[], cur: number, fmt = (v: number) => String(v)) => `<select id="att-${k}" data-att="${k}" aria-label="${LABEL[k]}">${vals.map(v => `<option value="${v}" ${cur === v ? "selected" : ""}>${esc(fmt(v))}</option>`).join("")}</select>`;
const hours = Array.from({ length: 24 }, (_, i) => i), hh = (v: number) => `${pad(v)}:00`;
export function attentionHtml(lead) {
  const at = attentionOf(lead), p = S.pings || {}, w = waitingUnits(), held = heldAsks().length, u = unreadDots().length, hold = pingHold(), nm = esc(lead.name);
  const today = p.day === dayKey(Date.now()) ? Number(p.count) || 0 : 0;
  const now = [`${plural(w, "thing")} waiting on you`, held ? `${held} held back` : "", `${plural(u, "atom")} with notes you haven't read`].filter(Boolean).join(" · ");
  const last = p.lastAt ? `Last ping ${ago(p.lastAt)}, ${plural(today, "ping")} today.` : "No pings yet.";
  return `<span class="eyebrow">Pings and your attention</span>
    <p class="attn-row">Ping me at most ${opt("pings", [0, 1, 2, 3, 4, 5, 6, 8], at.pings, v => v ? String(v) : "no")} times a day, at least ${opt("gap", [1, 2, 3, 4, 6, 8], at.gap)} hours apart.</p>
    <p class="attn-row">Quiet from ${opt("quietFrom", hours, at.quietFrom, hh)} to ${opt("quietTo", hours, at.quietTo, hh)}.</p>
    <p class="attn-row">Hold back new asks while ${opt("open", [2, 3, 4, 5, 6, 8, 10, 15], at.open)} things wait for me.</p>
    <p class="attn-row">Don't ping me while ${opt("unread", [1, 2, 3, 4, 5, 6, 8, 10], at.unread)} atoms have notes I haven't read.</p>
    <p class="fine">Now: ${esc(now)}. ${esc(last)}${hold ? ` Pings wait: ${esc(hold.text)}.` : ""}</p>
    <p class="note">Pings come from ${nm}'s schedule on its Jobs tab (every 3 hours by default). Anything urgent, like an invite for a meeting today, still comes through. With ${nm} here, other atoms' new schedules don't ping your phone: ${nm} tells you when their news matters.</p>`;
}
export async function saveAttention(k: string, v: string) {
  const lead = leadOf(); if (!lead || !(k in ATTENTION)) return;
  const n = Number(v), [lo, hi] = LIMITS[k]; if (!Number.isFinite(n) || n < lo || n > hi) return;
  const attention = { ...attentionOf(lead), [k]: n };
  upsertDocLocal(lead.id, { attention }); renderAll();
  try { await userDoc(lead.id).update({ attention }); if (k === "open") releaseHeld(); }
  catch (e) { diag("db.attention", e); toast(`Couldn't save that (${e?.code || "error"}).`); }
}
export const heldLine = () => { const n = heldAsks().length; return n ? `<p class="held-line" data-key="held">${plural(n, "more ask")}${n === 1 ? " is" : " are"} held back until you clear some. <button type="button" class="link" data-act="held-toggle">${S.showHeld ? "Hide" : "Show"} ${n === 1 ? "it" : "them"}</button></p>` : ""; };
