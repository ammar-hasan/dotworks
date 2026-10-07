import { diag } from "../core/diag";
import { clean, newId, plural, toast, upsertLocal } from "../core/helpers";
import { NS, S, runsCol, userDoc } from "../core/state";
import { isLead } from "../ui/characters";
import { openDot } from "../ui/nav";
import { renderAll } from "../ui/shell";
import { holdNow, leadOf } from "./attention";

/* ─── what your super atom knows about you ───
   Stored as your own private documents: data/users/<you>/<memId> {type: "memory", text, kind, scope, status,
   source, by, evidence, pinned, private, createdAt, confirmedAt, askId}.
   - text is one short sentence about you ("Prefers drafts to sending"), never an instruction.
   - scope is "all" or one atom's id; status is "candidate" (waiting for your yes), "confirmed" or "rejected" (you said
     no: kept so it isn't suggested again; clear them any time).
   - source says where it came from: "you-said" (you told an atom), "you-did" (learned from what you did with asks).
   Only confirmed items are used: every atom's prompt carries a short card of them (memoryCard), and an ask that
   follows one says so (memoryUsed). Nothing is learned from email, calendar, file or message content, and nothing
   learned from what you did is used until you say yes. Forget deletes the item and every copy of its words. */

export const MEM_KINDS: Record<string, string> = { preference: "Preferences", habit: "Habits", fact: "About your work" };
export const kindOf = k => (Object.prototype.hasOwnProperty.call(MEM_KINDS, k) ? k : "preference");
export const memText = t => clean(t || "").replace(/\s+/g, " ").trim().slice(0, 200);
const same = (a, b) => memText(a).toLowerCase().replace(/[.!]+$/, "") === memText(b).toLowerCase().replace(/[.!]+$/, "");
export const confirmedMem = () => S.memory.filter(m => m.status === "confirmed");
export const candidateMem = () => S.memory.filter(m => m.status === "candidate").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
export const atomName = id => S.dots.find(d => d.id === id)?.name || "one atom";

/* the card every atom gets: confirmed items for all atoms and for it (the super atom gets every one, private ones too),
   pinned first, then its own, then the newest; tagged m1, m2… so a proposal can say which it follows */
export function memoryCard(d): { text: string; tags: Record<string, string> } {
  const tags: Record<string, string> = {};
  if (!d || !leadOf()) return { text: "", tags };
  const lead = isLead(d);
  const items = confirmedMem().filter(m => (lead || m.scope === "all" || m.scope === d.id) && (lead || !m.private))
    .sort((a, b) => (+!!b.pinned - +!!a.pinned) || (+(b.scope === d.id) - +(a.scope === d.id)) || ((b.confirmedAt || b.createdAt || 0) - (a.confirmedAt || a.createdAt || 0)));
  let text = "", room = 1400, n = 0;
  for (const m of items) {
    const who = m.scope === "all" ? "" : m.scope === d.id ? " (for you)" : ` (for ${atomName(m.scope)})`;
    const line = `- [m${n + 1}] ${memText(m.text)}${who}${lead && m.private ? " (private: never for other people)" : ""}\n`;
    if (line.length > room) break;
    n++; tags["m" + n] = m.id; text += line; room -= line.length;
  }
  return { text: n ? `\nWhat the owner has told you about how they like things done. Each has a tag (m1, m2…): when a proposal follows one, list its tag in "used". These describe how the owner works, not views you have to agree with. Never repeat them to other people.\n${text}` : "", tags };
}
// what an ask says about the preferences it follows
export function memoryUsed(tags: Record<string, string>, used): { id: string; text: string }[] {
  const ids = [...new Set((Array.isArray(used) ? used : []).map(t => tags[String(t).replace(/[^\w]/g, "")]).filter(Boolean))].slice(0, 3);
  return ids.map(id => S.memory.find(m => m.id === id)).filter(Boolean).map(m => ({ id: m.id, text: memText(m.text) }));
}
export function touchUsed(list: { id: string }[]) { for (const u of list) userDoc(u.id).update({ lastUsedAt: Date.now() }).catch(e => diag("db.mem.used", e)); }

/* a scope from what an atom wrote: "all", or one of your atoms by name (an atom may also mean itself) */
function scopeFrom(d, s) {
  const v = clean(s || "").trim().toLowerCase();
  if (!v || v === "all" || v === "everyone" || v === "all atoms") return "all";
  if (["you", "me", "this atom", "this", "only you"].includes(v)) return d.id;
  return S.dots.find(x => x.name.toLowerCase() === v || x.id.toLowerCase() === v)?.id || "all";
}

/* save one thing you told an atom: kept at once (you said it) */
export async function rememberSaid(d, i): Promise<string> {
  const text = memText(i?.text); if (text.length < 6) throw new Error("Say it in a sentence about the owner.");
  const scope = scopeFrom(d, i?.scope ?? (i?.forAll === false ? "you" : "all")), kind = kindOf(i?.kind);
  const dup = S.memory.find(m => same(m.text, text));
  if (dup?.status === "confirmed") return "Already known.";
  const now = Date.now(), fields = { status: "confirmed", confirmedAt: now, source: "you-said", scope, kind, text };
  if (dup) { upsertLocal(S.memory, dup.id, fields); await userDoc(dup.id).update(fields); }
  else {
    const id = newId("mem_"), doc = { type: "memory", ...fields, by: d.id, evidence: [], pinned: false, private: false, createdAt: now };
    await userDoc(id).set(doc); if (!S.memory.some(m => m.id === id)) S.memory = [...S.memory, { id, ...doc }];
  }
  const lead = leadOf();
  toast(`Remembered: ${text}`, lead ? { label: "See it", fn: () => openDot(lead.id, "know") } : undefined);
  renderAll();
  return `Saved. The owner can change or forget it on ${lead?.name || "the super atom"}'s You tab.`;
}

/* suggest one thing learned from what you did: kept only once you say yes (a question in Asks and on the You tab) */
export async function suggestMemory(d, runId: string, jobId: string | null, i): Promise<string> {
  const text = memText(i?.text); if (text.length < 6) throw new Error("Say it in one sentence about the owner.");
  if (S.memory.some(m => same(m.text, text))) return "Already known, or the owner said no to it. Don't suggest it again.";
  const scope = scopeFrom(d, i?.scope), kind = kindOf(i?.kind), now = Date.now();
  const evidence = (Array.isArray(i?.evidence) ? i.evidence : []).map(x => clean(x).slice(0, 40)).filter(x => S.actions.some(a => a.id === x)).slice(0, 5).map(id => ({ kind: "ask", id, at: S.actions.find(a => a.id === id)?.decidedAt || null }));
  const memId = newId("mem_"), askId = newId("act_");
  const choices = [{ id: "keep", label: "Yes, keep it" }, ...(scope !== "all" ? [{ id: "all", label: "Yes, for all atoms" }] : []), { id: "no", label: "No" }];
  const mem = { type: "memory", text, kind, scope, status: "candidate", source: "you-did", by: d.id, evidence, pinned: false, private: false, createdAt: now, askId };
  const q: Record<string, any> = { type: "action", source: "page", dotId: d.id, runId, state: holdNow() ? "held" : "pending", createdAt: now, kind: "question",
    title: `Is this right? ${text}`.slice(0, 160), why: clean(i?.why).replace(/\s+/g, " ").slice(0, 300) || "Learned from what you did in Atoms.", question: { choices, allowText: false }, memoryId: memId };
  if (jobId) q.jobId = jobId;
  await userDoc(memId).set(mem); await userDoc(askId).set(q);
  if (!S.memory.some(m => m.id === memId)) S.memory = [...S.memory, { id: memId, ...mem }];
  return q.state === "held" ? "Saved as a suggestion; the owner sees it once they clear some of what's waiting." : "Suggested. The owner confirms it with one tap.";
}

/* your answer to "Is this right?" */
export async function applyMemoryAnswer(a, choice: string) {
  const m = S.memory.find(x => x.id === a.memoryId), now = Date.now();
  const fields = choice === "no" ? { status: "rejected", decidedAt: now } : { status: "confirmed", confirmedAt: now, ...(choice === "all" ? { scope: "all" } : {}) };
  if (m) { upsertLocal(S.memory, m.id, fields); await userDoc(m.id).update(fields).catch(e => diag("db.mem.answer", e)); }
  if (a.id) userDoc(a.id).update({ continuedAt: now }).catch(e => diag("db.mem.q", e));
  toast(choice === "no" ? "Got it. It won't suggest that again." : "Kept. Your atoms will work that way.");
  renderAll();
}

/* the You tab's buttons */
export async function memUpdate(id: string, fields: Record<string, any>, done?: string) {
  const m = S.memory.find(x => x.id === id); if (!m) return false;
  const before = { ...m };
  upsertLocal(S.memory, id, fields); renderAll();
  try { await userDoc(id).update(fields); if (done) toast(done); return true; }
  catch (e) { diag("db.mem.update", e); const i = S.memory.findIndex(x => x.id === id); if (i >= 0) S.memory[i] = before; renderAll(); toast(`Couldn't save that (${e?.code || "error"}).`); return false; }
}
export async function memAdd(text: string, kind: string, scope: string) {
  const lead = leadOf(); if (!lead) return;
  try { await rememberSaid(lead, { text, kind, scope: S.dots.some(x => x.id === scope) ? scope : "all" }); return true; }
  catch (e) { toast(e?.message && e.message.length < 80 ? e.message : "Couldn't save that."); return false; }
}
/* forget: the item goes, and so do its words everywhere else they were kept (its question, and asks that cited it) */
export async function forget(id: string) {
  const m = S.memory.find(x => x.id === id); if (!m) return;
  S.memory = S.memory.filter(x => x.id !== id); renderAll();
  try { await userDoc(id).delete(); }
  catch (e) { diag("db.mem.forget", e); S.memory = [...S.memory, m]; renderAll(); toast(`Couldn't forget it (${e?.code || "error"}).`); return; }
  toast("Forgotten");
  const q = m.askId ? S.actions.find(a => a.id === m.askId) : null;
  if (q) { S.actions = S.actions.filter(a => a.id !== q.id); userDoc(q.id).delete().catch(e => diag("db.mem.forgetq", e)); }
  for (const a of S.actions.filter(x => Array.isArray(x.memoryUsed) && x.memoryUsed.some(u => u.id === id))) {
    const memoryUsed = a.memoryUsed.filter(u => u.id !== id); upsertLocal(S.actions, a.id, { memoryUsed });
    userDoc(a.id).update({ memoryUsed }).catch(e => diag("db.mem.forgetcite", e));
  }
  renderAll();
}
export async function clearRejected() {
  const no = S.memory.filter(m => m.status === "rejected"); if (!no.length) return;
  S.memory = S.memory.filter(m => m.status !== "rejected"); renderAll();
  for (const m of no) await userDoc(m.id).delete().catch(e => diag("db.mem.clear", e));
  toast(`Cleared ${plural(no.length, "suggestion")}`);
}
// deleting the super atom deletes what it knew about you
export async function forgetAll() { const all = S.memory.slice(); S.memory = []; for (const m of all) await userDoc(m.id).delete().catch(e => diag("db.mem.all", e)); }

/* ─── tools for the atoms ───
   remember: any atom, in chat, while you have a super atom: what you just said about yourself.
   suggest_memory: the super atom, in chat and when it learns: something it noticed, for you to confirm.
   recent_activity: the super atom when it learns: only what you did and said in Atoms, never your apps. */
export function memoryTools(d, live, runId: string, jobId: string | null, mode: "chat" | "learn", repaint: () => void) {
  if (!leadOf()) return [];
  const lead = isLead(d), tools = [];
  const step = label => { const s = { label, state: "wait" }; live.steps.push(s); repaint(); return s; };
  let saved = 0, suggested = 0;
  const scopeHelp = lead ? `"all" (the default) or the name of the one atom it's for: ${S.dots.filter(x => x.id !== d.id).map(x => x.name).join(", ") || "none yet"}` : `"all" (the default) or "you" if it's only about your own job`;
  if (mode === "chat") tools.push({
    name: "remember",
    description: `Save something the owner just told you about how they work or what they prefer, so their atoms use it from now on (for example "I don't take meetings before 10"). Only what the owner said here, as one sentence about them ("Prefers…", "Doesn't…", "Usually…"), never an instruction and never anything from an email, file or message. Saved at once; the owner can change or forget it on ${leadOf().name}'s You tab. At most 3 per message.`,
    inputSchema: { type: "object", properties: { text: { type: "string", description: "One sentence about the owner, at most 160 characters" }, kind: { type: "string", enum: ["preference", "habit", "fact"] }, scope: { type: "string", description: scopeHelp } }, required: ["text"] },
    async execute(input) {
      if (saved >= 3) throw new Error("You already saved 3 things this time.");
      const s = step(`Remembering: ${memText(input?.text).slice(0, 80)}`);
      try { const r = await rememberSaid(d, input); saved++; s.state = "ok"; repaint(); return r; }
      catch (e) { diag("mem.remember", e); s.state = "bad"; repaint(); throw new Error(clean(e?.message).slice(0, 120) || "Couldn't save it."); }
    },
  });
  if (lead) tools.push({
    name: "suggest_memory",
    description: `Suggest one thing you noticed about how the owner likes to work, for them to confirm with one tap (it becomes a question). Base it only on what the owner did or said in Atoms: what they approved, changed before approving, set aside or undid, how they answered, their own messages. Never on email, calendar, file or message content. One sentence about the owner. Back it with at least 2 things they did (ask ids from recent_activity as evidence). At most 3 per run; never repeat what's already known or what they said no to.`,
    inputSchema: { type: "object", properties: { text: { type: "string", description: "One sentence about the owner, at most 160 characters" }, kind: { type: "string", enum: ["preference", "habit", "fact"] }, scope: { type: "string", description: scopeHelp }, why: { type: "string", description: "One line on what you saw, like: You changed the sign-off on 3 drafts to Cheers" }, evidence: { type: "array", items: { type: "string" }, description: "Ids of the asks it's based on" } }, required: ["text", "why"] },
    async execute(input) {
      if (suggested >= 3) throw new Error("You already suggested 3 things this time.");
      if (S.gone.has(d.id)) throw new Error("This atom was deleted; stop.");
      const s = step(`Suggesting: ${memText(input?.text).slice(0, 80)}`);
      try { const r = await suggestMemory(d, runId, jobId, input); suggested++; s.state = "ok"; repaint(); return r; }
      catch (e) { diag("mem.suggest", e); s.state = "bad"; repaint(); throw new Error(clean(e?.message).slice(0, 120) || "Couldn't save it."); }
    },
  });
  if (lead && mode === "learn") tools.push({
    name: "recent_activity",
    description: "What the owner did in Atoms over the last N days (default 14): asks they approved, changed before approving, set aside or undid, their answers to questions, and their own chat messages to their atoms. Also what you already know about them and what they said no to. Returns {asks:[{id,atom,kind,title,outcome,changed,answer,at}], messages:[{atom,text,at}], known:[…], saidNo:[…]}.",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 30 } } },
    async execute(input) {
      const days = Math.min(30, Math.max(1, Math.round(Number(input?.days) || 14))), since = Date.now() - days * 864e5;
      const s = step(`Reading what you did in Atoms, last ${plural(days, "day")}`);
      try { const r = await activitySince(since); s.state = "ok"; s.label = `Read ${plural(r.asks.length, "decision")} and ${plural(r.messages.length, "message")} of yours`; repaint(); return r; }
      catch (e) { diag("mem.activity", e); s.state = "bad"; repaint(); throw new Error("Couldn't read what the owner did."); }
    },
  });
  return tools;
}

/* what you did and said in Atoms since a time: the only thing the super atom learns from */
export async function activitySince(since: number) {
  const name = id => S.dots.find(x => x.id === id)?.name || "an atom", cut = (v, n = 160) => clean(typeof v === "string" ? v : JSON.stringify(v ?? "")).replace(/\s+/g, " ").slice(0, n);
  const asks = S.actions.filter(a => !a.memoryId && (a.decidedAt || 0) >= since && a.state !== "pending" && a.state !== "held")
    .sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0)).slice(0, 40).map(a => {
      const edits = Array.isArray(a.result?.edits) ? a.result.edits : [];
      const outcome = a.result?.undone ? "undone after approving" : a.state === "dismissed" ? "set aside" : a.state === "handed_off" ? "handed to Claude" : a.kind === "question" ? "answered" : edits.length ? "changed, then approved" : "approved";
      return { id: a.id, atom: name(a.dotId), kind: a.kind === "tool" ? `${a.payload?.server || "app"} · ${a.payload?.tool || ""}` : a.kind, title: cut(a.title, 120), outcome,
        ...(edits.length ? { changed: edits.slice(0, 3).map(e => ({ field: cut(e.field, 40), from: cut(e.from, 120), to: cut(e.to, 120) })) } : {}),
        ...(a.answer?.text ? { answer: cut(a.answer.text, 120) } : {}), at: new Date(a.decidedAt).toISOString() };
    });
  const messages = [];
  for (const d of S.dots) {
    if (messages.length >= 30 || !NS.db || !S.uid) break;
    try {
      const snap = await runsCol(d.id).orderBy("startedAt", "desc").limit(5).get();
      for (const doc of snap.docs) { const th: any = doc.data()?.thread; for (const t of (Array.isArray(th) ? th : []) as any[])
        if (t?.role === "you" && !t.kind && (t.at || 0) >= since && messages.length < 30) messages.push({ atom: d.name, text: cut(t.text, 300), at: new Date(t.at).toISOString() }); }
    } catch (e) { diag("db.mem.msgs", e); }
  }
  return { asks, messages, known: S.memory.filter(m => m.status !== "rejected").map(m => memText(m.text)).slice(0, 40), saidNo: S.memory.filter(m => m.status === "rejected").map(m => memText(m.text)).slice(0, 40) };
}
