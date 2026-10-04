import { appInfo, appNames, kindOf, toolsOf } from "../core/apps";
import { readPerms } from "../core/boot";
import { CAPS, CONNECTORS, ICON, SRV, VERSION } from "../core/constants";
import { diag } from "../core/diag";
import { $, esc, fmtTime } from "../core/helpers";
import { NS, S, cloudOn, connPerm } from "../core/state";
import { loadTriggers } from "../features/cloud";
import { renderAll, renderShell } from "./shell";
import { appState } from "../views/apps";
import { watchDay } from "../views/horizon";

/* ═════════ signals & access ═════════ */
export function closeAcct(render = true) { if (!S.acctOpen) return; S.acctOpen = false; $("#acctPop").hidden = true; if (render) renderShell(); }
export function renderAcct() {
  const pop = $("#acctPop"); if (!S.acctOpen) { pop.hidden = true; return; }
  pop.hidden = false;
  const caps = CAPS.map(([n, label]) => {
    let led = "", txt = S.booted ? "not here" : "…";
    if (NS[n]) { const p = S.perms[n]; if (p === "denied") { led = "off"; txt = "off"; } else if (p === "prompt") { led = "wait"; txt = "asks first"; } else { led = "on"; txt = "on"; }
      if (n === "sample" && !S.toolsOK) txt += " · no tools"; if (n === "sample" && S.imagesOK) txt += " · sees images"; if (n === "assets" && S.assetsUsage) txt = `${Math.max(1, Math.round((S.assetsUsage.bytes || 0) / 1024))} KB used`; }
    return `<dt><span class="led ${led}"></span><span>${esc(label)} <span class="mono">${n}</span></span></dt><dd>${txt}</dd>`;
  }).join("");
  const conns = NS.mcp ? [...appNames(), SRV.cloud].map(n => {
    const [led, txt] = appState(n), p = S.perms["mcp:" + n], label = n === SRV.cloud ? "Scheduled tasks" : n, does = n === SRV.cloud ? "waking dots in the cloud" : appInfo(n).does;
    const btn = led === "wait" && p !== "granted" ? `<button class="mini" data-act="allow" data-id="${esc(n)}">Allow</button>` : "";
    return `<dt><span class="led ${led}"></span><span>${esc(label)} <span class="mono">${esc(does)}</span></span></dt><dd>${esc(txt)}${btn}</dd>`;
  }).join("") : "";
  const askable = Object.values(S.perms).some(v => v === "prompt");
  pop.innerHTML = `<div class="pop-h">${S.me?.avatarUrl ? `<img alt="" src="${esc(S.me.avatarUrl)}">` : ""}<div style="flex:1;min-width:0"><b>${esc(S.me?.name || (S.booted ? "Not signed in" : "…"))}</b><span class="fine">${S.isOwner ? "Owner of this page" : "Viewer"}</span></div><button class="icon-btn" data-act="acct" aria-label="Close">${ICON.close}</button></div>
    <div class="col" style="gap:8px"><span class="eyebrow">This page can use</span><dl class="signals">${caps}</dl></div>
    ${conns ? `<div class="col" style="gap:8px"><span class="eyebrow">Your apps</span><dl class="signals">${conns}</dl><div class="row"><button class="btn ghost sm" data-nav="apps">Manage apps</button></div></div>` : ""}
    <div class="row">${askable && NS.permissions ? `<button class="btn sm" data-act="allow-all">Allow everything once</button>` : ""}${NS.permissions ? `<button class="btn ghost sm" data-act="perms">Manage access</button>` : ""}</div>
    <div class="col issues" style="gap:6px"><span class="eyebrow">Recent issues</span>${S.diag.length ? `<ul>${S.diag.slice(-6).reverse().map(x => `<li>${esc(fmtTime(x.at))} · ${esc(x.where)} · ${esc(x.code)}${x.msg ? " — " + esc(x.msg.slice(0, 120)) : ""}</li>`).join("")}</ul><div class="row"><button class="btn ghost sm" data-act="clear-diag">Clear</button></div>` : `<span>None. Everything this page tried has worked.</span>`}</div>
    <p class="fine">Dotworks ${VERSION} · runs on your own Claude plan and your own apps. Dots, notes and asks are private to you; seeds are shared with everyone who can open this page. Keys: N new · W wake · [ ] switch dots · / message.</p>`;
}
export async function allow(server) {
  if (!NS.permissions && !NS.mcp) return;
  const name = server ? "mcp:" + server : null;
  try { if (NS.permissions) await NS.permissions.request(name ? [name] : undefined); } catch (e) { diag("permissions.request", e); }
  await readPerms();
  // a scoped request isn't always shown; a harmless read from your own click asks for real
  if (server && connPerm(server) !== "granted" && NS.mcp) {
    const c: any = CONNECTORS.find(x => x.server === server), firstRead = toolsOf(server).find(t => kindOf(server, t) === "read");
    if (c || firstRead) { try { await (c ? NS.mcp.callTool(server, c.probe[0], c.probe[1]()) : NS.mcp.callTool(server, firstRead, {})); } catch (e) { if (e?.code !== "tool_error") diag("allow." + server, e); } await readPerms(); }
  }
  if (connPerm(SRV.cal) === "granted" || server === SRV.cal) watchDay();
  if (S.dots.some(cloudOn)) loadTriggers(true);
  renderAll();
}
