import { SRV } from "../core/constants";
import { diag } from "../core/diag";
import { toast } from "../core/helpers";
import { NS, S, cloudOn, jobsOf, runsCol, userDoc } from "../core/state";
import { go } from "../ui/nav";
import { renderAll } from "../ui/shell";

/* ═════════ delete ═════════ */
export async function deleteDot(did) {
  const d = S.dots.find(x => x.id === did); if (!d) return;
  S.confirmDel = false;
  // stop it if it's awake or mid-reply, and make sure nothing it was doing writes afterwards
  S.gone.add(did);
  if (S.running?.dotId === did) S.running.ctl.abort();
  if (S.chat?.dotId === did) S.chat.ctl.abort();
  renderAll();
  const jobs = jobsOf(d);
  try {
    // its schedules go first (its own and its jobs'), so nothing wakes up for an atom that's gone
    const scheduled = [d, ...jobs].filter(cloudOn);
    if (scheduled.length && NS.mcp) {
      toast(scheduled.length > 1 ? "Removing its cloud schedules first…" : "Removing its cloud schedule first…");
      for (const rec of scheduled) {
        try { await NS.mcp.callTool(SRV.cloud, "delete_trigger", { trigger_id: rec.cloud.triggerId }); }
        catch (e) { if (e?.code !== "tool_error") { S.gone.delete(did); diag("cloud.delete", e); toast("Couldn't confirm its cloud schedule was removed, so nothing was deleted. Try again."); return; } }
        if (rec !== d) await userDoc(rec.id).update({ cloud: null }).catch(() => {});
      }
    }
    await userDoc(did).delete();
  } catch (e) { S.gone.delete(did); diag("db.delete", e); toast(`Couldn't delete that atom (${e?.code || "error"}).`); return; }
  // gone from the field at once; its notes, asks and file are tidied up behind the scenes
  S.dots = S.dots.filter(x => x.id !== did); S.fresh.delete(did); S.jobs = S.jobs.filter(j => j.dotId !== did);
  const asks = S.actions.filter(a => a.dotId === did).map(a => a.id);
  S.actions = S.actions.filter(a => a.dotId !== did);
  go("home"); toast(`${d.name} deleted`);
  (async () => {
    try { const snap = await runsCol(did).get(); for (const x of snap.docs) await runsCol(did).doc(x.id).delete(); } catch (e) { diag("db.delete.runs", e); }
    for (const id of asks) await userDoc(id).delete().catch(() => {});
    for (const j of jobs) await userDoc(j.id).delete().catch(() => {});
    if (d.notesAssetId) NS.assets?.delete(d.notesAssetId).catch(() => {});
  })();
}
