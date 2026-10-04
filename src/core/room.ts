import { diag } from "./diag";
import { plural, toast } from "./helpers";
import { NS, S, pending } from "./state";
import { renderAll, renderPeers } from "../ui/shell";

/* ═════════ room ═════════ */
export function startRoom() {
  try {
    NS.room.onPeers(ch => { S.peers = [...ch.peers]; renderPeers(); }, e => diag("room.peers", e));
    NS.room.on("ran", msg => { if (msg.isMe) return; const n = Number((msg.data as any)?.asks) || 0; whoIs(msg.by).then(name => toast(`${name}'s atom just woke · ${plural(n, "ask")}`)); }, e => diag("room.on", e));
  } catch (e) { diag("room.start", e); }
  setPresence(); refreshCanSend();
}
export function setPresence() { try { NS.room?.presence({ uid: S.uid, view: S.view, dotId: S.view === "dot" ? S.selected : null, running: !!S.running, waiting: pending().length }).catch(() => {}); } catch {} }
export async function whoIs(id) { if (!id || !NS.user) return "Someone"; const ps = await NS.user.profiles([id]).catch(() => ({})); return ps[id]?.name || "Someone"; }
export async function refreshCanSend() {
  if (!NS.room) return;
  let v = "off"; try { v = await NS.room.canSendToClaudeSession(); } catch { v = "off"; }
  if (v !== S.canSend) { S.canSend = v; renderAll(); }
}
