import { pruneRuns } from "../ai/flow";
import { flushPendingSend } from "../features/tell";
import { stopListening, stopSpeaking } from "../features/voice";
import { SRV } from "../core/constants";
import { diag } from "../core/diag";
import { $, clone } from "../core/helpers";
import { setPresence } from "../core/room";
import { NS, S, cloudOn, connPerm, runsCol } from "../core/state";
import { loadTriggers } from "../features/cloud";
import { closeAcct } from "./account";
import { renderAll } from "./shell";
import { paintDot } from "../views/dot";

/* ═════════ navigation ═════════ */
export function go(view) {
  if (view !== "dot") { if (S.unsubRuns) { S.unsubRuns(); S.unsubRuns = null; } S.selected = null; stopSpeaking(); stopListening(); }
  S.view = view; S.confirmDel = false; closeAcct(false);
  setPresence(); renderAll();
  $("#view")?.scrollTo?.(0, 0);
}
export function openDot(id, tab?) {
  if (!id) return go("home");
  const changed = S.selected !== id;
  if (changed) { stopSpeaking(); stopListening(); }
  S.view = "dot"; S.selected = id; S.tab = tab || (changed ? "chat" : S.tab) || "chat"; S.confirmDel = false; S.hzSel = null;
  if (changed) {
    S.editDraft = null; S.editFile = null;
    if (S.unsubRuns) { S.unsubRuns(); S.unsubRuns = null; }
    S.runs = []; S.runsLoaded = false;
    if (NS.db && S.uid) {
      const mine = id;
      S.unsubRuns = runsCol(id).orderBy("startedAt", "desc").limit(10).onSnapshot(snap => {
        if (S.selected !== mine) return;
        const fresh = snap.docs.map(x => ({ id: x.id, ...clone(x.data()) }));
        const local = S.runs.filter(r => !fresh.some(f => f.id === r.id) && Date.now() - (r.finishedAt || 0) < 15000);
        S.runs = [...local, ...fresh].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, 10);
        S.runsLoaded = true; if (S.view === "dot") paintDot();
        if (S.pendingSend?.dotId === mine) queueMicrotask(flushPendingSend);
      }, e => { S.runsLoaded = true; diag("db.runs", e); paintDot(); });
      if (!S.pruned.has(id)) { S.pruned.add(id); setTimeout(() => pruneRuns(id), 5000); }
    }
    const d = S.dots.find(x => x.id === id);
    if (d && (cloudOn(d) || d.cloudPending) && NS.mcp && !S.triggers && connPerm(SRV.cloud) === "granted") loadTriggers();
  }
  closeAcct(false); setPresence(); renderAll();
}
export function cycle(dir) {
  if (!S.dots.length) return;
  const i = S.dots.findIndex(d => d.id === S.selected);
  openDot(S.dots[(i + dir + S.dots.length) % S.dots.length].id);
}
