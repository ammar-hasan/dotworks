import { appInfo, appNames, appsMissing, humanTool, kindOf, normSources, toolsOf } from "../core/apps";
import { loadRepos, normRepos } from "../features/repos";
import { SRV } from "../core/constants";
import { diag } from "../core/diag";
import { $, esc, plural, reconcile, toast } from "../core/helpers";
import { NS, S, userDoc } from "../core/state";
import { renderAll } from "../ui/shell";

/* ═════════ apps ═════════ */
export function appState(n) {
  const info = S.conn[n], p = S.perms["mcp:" + n];
  if (!NS.mcp) return ["", "not in this view"];
  if (S.connLoaded && !info) return ["off", "not connected in Claude"];
  if (info?.auth === "needs_reauth") return ["off", "reconnect it in Claude's Settings"];
  if (S.appsOff.has(n)) return ["", "off for Dotworks"];
  if (p === "denied") return ["off", "blocked for this page"];
  if (p === "granted") return ["on", "on"];
  return ["wait", "asks first"];
}
export function paintApps() {
  const grid = $("#appGrid"); if (!grid) return;
  const cards = [...appNames(), ...appsMissing()].map(n => { const a = appInfo(n);
    const [led, txt] = appState(n), tools = toolsOf(n), reads = tools.filter(t => kindOf(n, t) === "read"), acts = tools.filter(t => kindOf(n, t) !== "read"), risky = acts.filter(t => kindOf(n, t) === "risky");
    const users = S.dots.filter(d => normSources(d.sources).includes(n)).map(d => d.name);
    const connected = !S.connLoaded || !!S.conn[n], off = S.appsOff.has(n), p = S.perms["mcp:" + n];
    const open = !!S.appOpen[n];
    const list = (arr, cls) => arr.map(t => `<span class="tool ${cls}" title="${esc(t)}">${esc(humanTool(t))}${kindOf(n, t) === "risky" ? " ⚠" : ""}</span>`).join("");
    return { key: n, html: `<article class="appcard" data-key="${esc(n)}" style="--h:${a.hue}">
      <div class="app-top"><span class="ball"></span><div class="grow"><strong>${esc(n)}</strong><span class="fine">${esc(a.does)}</span></div></div>
      <span class="app-st"><span class="led ${led}"></span>${esc(txt)}</span>
      <p class="fine">${connected ? `${plural(reads.length, "thing")} it can read · ${plural(acts.length, "action")} it can propose${risky.length ? ` (${risky.length} can't be undone)` : ""}` : "Connect it in Claude (Settings → Connectors) and reload. Still missing? Ask Claude to “update Dotworks” so this copy can use it."}${users.length ? ` · used by ${esc(users.slice(0, 3).join(", "))}${users.length > 3 ? ` and ${users.length - 3} more` : ""}` : ""}</p>
      <div class="row">${connected ? `<button class="btn sm ${off ? "pri" : ""}" data-act="app-toggle" data-id="${esc(n)}">${off ? "Turn on" : "Turn off"}</button>${!off && p !== "granted" && p !== "denied" && NS.mcp ? `<button class="btn sm" data-act="allow" data-id="${esc(n)}">Allow now</button>` : ""}${p === "denied" && NS.permissions ? `<button class="btn ghost sm" data-act="perms">Manage access</button>` : ""}${tools.length ? `<button class="btn ghost sm" data-act="app-tools" data-id="${esc(n)}">${open ? "Hide tools" : "See tools"}</button>` : ""}` : ""}</div>
      ${open ? `<div class="toolset"><span class="eyebrow">Reads</span><div class="tools">${list(reads, "r") || '<span class="fine">none</span>'}</div><span class="eyebrow">Can propose</span><div class="tools">${list(acts, "a") || '<span class="fine">none</span>'}</div>${risky.length ? '<p class="fine">⚠ can\'t be undone: these ask for a second tap before they run.</p>' : ""}</div>` : ""}
    </article>` };
  });
  if (NS.mcp && (!S.connLoaded || S.conn[SRV.cloud])) {
    if (S.reposOpen && !S.repos && !S.reposLoading && !S.reposErr) setTimeout(() => loadRepos(), 0);
    const users = S.dots.filter(d => normRepos(d.repos).mode !== "none").map(d => d.name);
    cards.push({ key: "GitHub", html: `<article class="appcard" data-key="GitHub" style="--h:220">
      <div class="app-top"><span class="ball"></span><div class="grow"><strong>GitHub repos</strong><span class="fine">through Claude Code · pick them per dot</span></div></div>
      <span class="app-st"><span class="led ${S.repos ? "on" : S.reposErr ? "off" : ""}"></span>${S.repos ? `${plural(S.repos.length, "repo")} you can reach` : S.reposErr ? esc(S.reposErr) : "not checked yet"}</span>
      <p class="fine">Cloud wakes read commits, pull requests, issues and CI; dots never push, comment or merge.${users.length ? ` Used by ${esc(users.slice(0, 3).join(", "))}${users.length > 3 ? ` and ${users.length - 3} more` : ""}.` : ""}</p>
      <div class="row"><button class="btn ghost sm" data-act="repos-toggle">${S.reposOpen ? "Hide repos" : "See repos"}</button></div>
      ${S.reposOpen ? `<div class="toolset"><div class="tools">${S.repos ? S.repos.slice(0, 60).map(r => `<span class="tool" title="${esc(r.visibility)}">${esc(r.name)}</span>`).join("") + (S.repos.length > 60 ? `<span class="fine">+${S.repos.length - 60} more</span>` : "") : '<span class="fine">Loading…</span>'}</div></div>` : ""}
    </article>` });
  }
  reconcile(grid, cards.map(c => ({ ...c, sig: c.html })));
  const cloud = appState(SRV.cloud);
  $("#appsFoot").innerHTML = `Scheduled tasks (for waking dots in the cloud): ${esc(cloud[1])}. Connected a new app in Claude? Dotworks only sees the apps it was published with: ask Claude to “update Dotworks” in a session with your dotworks repo.`;
}
export async function toggleApp(n) {
  if (!appNames().includes(n) || !NS.db || !S.uid) return;
  const off = new Set(S.appsOff); off.has(n) ? off.delete(n) : off.add(n);
  const prev = S.appsOff; S.appsOff = off; renderAll();
  try { await userDoc("apps_prefs").set({ off: [...off], at: Date.now() }); toast(off.has(n) ? `${appInfo(n).short} is off for Dotworks` : `${appInfo(n).short} is on`); }
  catch (e) { S.appsOff = prev; renderAll(); diag("db.prefs", e); toast("Couldn't save that. Try again."); }
}
