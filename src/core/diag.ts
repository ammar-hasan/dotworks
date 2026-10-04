import { VERSION } from "./constants";
import { clean, clone } from "./helpers";
import { NS, S, userDoc } from "./state";
import { renderAcct } from "../ui/account";
import { renderMe } from "../ui/shell";

/* ═════════ diagnostics: a private log so problems in the live viewer are visible ═════════ */
export let diagTimer = null;
export function diag(where, e) {
  const entry = { at: Date.now(), where: String(where).slice(0, 60), code: String(e?.code || e?.name || "error").slice(0, 40), msg: clean(e?.message || (typeof e === "string" ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })())).slice(0, 240) };
  const last = S.diag[S.diag.length - 1];
  if (last && last.where === entry.where && last.code === entry.code && last.msg === entry.msg) { last.n = (last.n || 1) + 1; last.at = entry.at; return; }
  S.diag.push(entry); if (S.diag.length > 40) S.diag.shift();
  try { console.warn("[dotworks]", entry.where, entry.code, entry.msg); } catch {}
  if (S.acctOpen) renderAcct();
  renderMe();
  clearTimeout(diagTimer);
  diagTimer = setTimeout(saveDiag, 2500);
}
export function saveDiag() {
  if (!NS.db || !S.uid) return;
  userDoc("diag_log").set({ v: VERSION, at: Date.now(), ua: String(navigator.userAgent || "").slice(0, 140), env: clone(S.env), view: S.view, entries: S.diag.slice(-30) }).catch(() => {});
}
window.addEventListener("error", ev => diag("window", ev.error || { message: ev.message }));
window.addEventListener("unhandledrejection", ev => diag("promise", ev.reason));
