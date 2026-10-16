import { diag } from "../core/diag";
import { clone, toast } from "../core/helpers";
import { NS, S, lastAt, runsCol, userDoc } from "../core/state";
import { markRead, unreadDots } from "./attention";
import { renderAll } from "../ui/shell";

/* ─── catch up: every atom's new notes in one place ───
   Like Slack's catch up: one card per atom that has notes you haven't read, the most recent first. Done (or a swipe
   right) marks them read, exactly as opening that atom's chat does (reads.at, attention.ts). Later (or a swipe left)
   keeps them unread and moves the atom to the back for now. An atom is unread when its latest run, or one of its
   jobs', is newer than when you last read it (unreadDots). */

// when you last read this atom's notes (or started counting)
export const readMarker = (d): number => { const r = S.reads || {}; return Math.max(Number(r.since) || 0, Number(r.at?.[d.id]) || 0); };

export function catchQueue() {
  const all = unreadDots().sort((a, b) => (lastAt(b) || 0) - (lastAt(a) || 0));
  return { now: all.filter(d => !S.cuLater.has(d.id)), later: all.filter(d => S.cuLater.has(d.id)) };
}

/* the notes you haven't read from one atom (its own and its jobs'), newest first; fetched once per new run */
export async function loadCatchNotes(d) {
  const at = lastAt(d) || 0, cur = S.cuNotes[d.id];
  if (!NS.db || !S.uid || (cur && cur.at === at)) return;
  S.cuNotes[d.id] = { at, loading: true, notes: cur?.notes || [] };
  try {
    const snap = await runsCol(d.id).orderBy("startedAt", "desc").limit(8).get(), since = readMarker(d);
    const notes = snap.docs.map(x => ({ id: x.id, ...clone(x.data()) })).filter(r => (r.startedAt || 0) > since && (r.text || r.status !== "done"));
    S.cuNotes[d.id] = { at, loading: false, notes };
  } catch (e) { diag("db.catchup", e); S.cuNotes[d.id] = { at, loading: false, notes: [], err: e?.code || "error" }; }
  renderAll();
}

/* Done: read, with a way back */
export function catchDone(id: string) {
  const d = S.dots.find(x => x.id === id); if (!d || !S.reads) return;
  const before = S.reads.at && typeof S.reads.at === "object" ? S.reads.at[id] : undefined;
  S.cuLater.delete(id); markRead(d); renderAll();
  toast(`${d.name}: read`, { label: "Undo", fn: () => {
    const at = { ...(S.reads?.at || {}) }; if (before === undefined) delete at[id]; else at[id] = before;
    S.reads = { ...S.reads, at }; userDoc("reads").set(clone(S.reads)).catch(e => diag("db.reads", e)); renderAll();
  } });
}
export function catchLater(id: string) { S.cuLater.add(id); renderAll(); }
export function catchAgain() { S.cuLater.clear(); renderAll(); }
export function catchAllRead() {
  const n = unreadDots().length; if (!n) return;
  for (const d of unreadDots()) markRead(d);
  S.cuLater.clear(); renderAll(); toast(n === 1 ? "Marked read" : `All ${n} marked read`);
}
