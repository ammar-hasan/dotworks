import { SRV } from "../core/constants";
import { diag } from "../core/diag";
import { toast } from "../core/helpers";
import { NS, S, cloudOn, runsCol, userDoc } from "../core/state";
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
  try {
    if (cloudOn(d) && NS.mcp) { toast("Removing its cloud schedule first…"); try { await NS.mcp.callTool(SRV.cloud, "delete_trigger", { trigger_id: d.cloud.triggerId }); } catch (e) { if (e?.code !== "tool_error") { diag("cloud.delete", e); toast("Couldn't confirm its cloud schedule was removed, so nothing was deleted. Try again."); return; } } }
    await userDoc(did).delete();
  } catch (e) { S.gone.delete(did); diag("db.delete", e); toast(`Couldn't delete that dot (${e?.code || "error"}).`); return; }
  // gone from the field at once; its notes, asks and file are tidied up behind the scenes
  S.dots = S.dots.filter(x => x.id !== did); S.fresh.delete(did);
  const asks = S.actions.filter(a => a.dotId === did).map(a => a.id);
  S.actions = S.actions.filter(a => a.dotId !== did);
  go("home"); toast(`${d.name} deleted`);
  (async () => {
    try { const snap = await runsCol(did).get(); for (const x of snap.docs) await runsCol(did).doc(x.id).delete(); } catch (e) { diag("db.delete.runs", e); }
    for (const id of asks) await userDoc(id).delete().catch(() => {});
    if (d.notesAssetId) NS.assets?.delete(d.notesAssetId).catch(() => {});
  })();
}
