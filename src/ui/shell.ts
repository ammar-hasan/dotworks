import { CADENCE, ICON, VERSION } from "../core/constants";
import { diag } from "../core/diag";
import { $, esc, fmtWhen, hueOf, plural, reconcile, span } from "../core/helpers";
import { NS, S, cloudOn, curDot, hasJobs, isDue, jobsOf, pending } from "../core/state";
import { cloudFiringFor, missingApps } from "../features/cloud";
import { renderAcct } from "./account";
import { avatarHtml, stateOf } from "./characters";
import { renderSheet } from "../views/builder";
import { renderView } from "../views/index";

/* ═════════ shell ═════════ */
export function renderAll() {
  try { renderShell(); renderView(); paintBanner(); renderSheet(); if (S.acctOpen) renderAcct(); }
  catch (e) { diag("render", e); }
}
export function renderShell() {
  const n = pending().length;
  const navItems = [["home", "Home", ICON.home, ""], ["asks", "Asks", ICON.inbox, n ? String(n) : ""], ["seeds", "Elements", ICON.atom, ""], ["apps", "Apps", ICON.plug, ""]];
  const navHtml = navItems.map(([v, label, ic, c]) => `<button class="nav-i" data-nav="${v}" ${S.view === v ? 'aria-current="page"' : ""}>${ic}<span>${label}</span><span class="count">${c}</span></button>`).join("");
  if ($("#nav").innerHTML !== navHtml) $("#nav").innerHTML = navHtml;
  if (!$("#sideNew").innerHTML) $("#sideNew").innerHTML = ICON.plus;
  $("#sideNew").hidden = !S.uid;
  const tabHtml = navItems.map(([v, label, ic, c]) => `<button data-nav="${v}" ${S.view === v || (v === "home" && S.view === "dot") ? 'aria-current="page"' : ""}>${ic}<span>${label}</span><span class="count">${c}</span></button>`).join("") + `<button data-act="acct">${ICON.me}<span>Me</span>${S.diag.length ? '<span class="count">!</span>' : ""}</button>`;
  if ($("#tabbar").innerHTML !== tabHtml) $("#tabbar").innerHTML = tabHtml;
  renderDotList($("#dotList"), "side");
  renderMe();
  const d = curDot(), main = $("#main");
  main.style.setProperty("--amb", d ? hueOf(d) : S.dots.length ? hueOf(S.dots[0]) : 230);
  main.classList.toggle("on-home", S.view === "home");
}
/* what this view can't do, said once, plainly, with the way out */
export function capIssues() {
  if (!S.booted) return [];
  if (!S.env.use) return [{ key: "host", html: "<b>This copy of Atoms can't reach Claude.</b> Open it from your artifacts on claude.ai, signed in, to make and wake atoms." }];
  if (!NS.user || !S.uid) return [];
  const out = [];
  if (!NS.db) out.push({ key: "db", html: "<b>Memory is off in this view</b>, so new atoms can't be saved here. Turn it on from this page's Permissions, or open it from claude.ai in a browser.", fix: true });
  if (!S.capsLeft && !NS.sample) out.push({ key: "sample", html: "<b>Claude isn't available in this view</b>, so atoms can't wake or chat. Open the page from claude.ai in a browser.", fix: true });
  else if (NS.sample && (S.perms as any).sample === "denied") out.push({ key: "sample-off", html: "<b>Claude is turned off for this page</b>, so atoms can't wake or chat until you allow it.", fix: true });
  return out;
}
export function paintBanner() {
  const box = $("#banner"); if (!box) return;
  const issues = capIssues();
  const html = issues.map(x => `<span class="grow">${x.html}</span>`).join("") + (issues.some(x => x.fix) && NS.permissions ? `<button class="btn sm" data-act="perms">Manage access</button>` : "");
  if (box.innerHTML !== html) box.innerHTML = html;
}
export function dotStatus(d) {
  if (S.running?.dotId === d.id) return [S.running.text ? "writing you a note…" : "awake now", "live"];
  if (cloudFiringFor(d)) return [hasJobs(d) ? "running in the cloud" : "waking in the cloud", "cl"];
  const asks = pending().filter(a => a.dotId === d.id).length;
  if (hasJobs(d)) return jobsStatus(d, asks);
  if (cloudOn(d)) { const t = S.triggers?.get(d.cloud.triggerId); if (t && !t.enabled) return ["paused in the cloud", ""];
    if (t && missingApps(d, t).length) return ["cloud · apps not attached", "warn"]; return [t?.next ? "cloud · " + fmtWhen(Date.parse(t.next)).replace(/^today /, "") : "awake in the cloud", "cl"]; }
  if (asks) return [plural(asks, "ask") + " for you", ""];
  if (isDue(d)) return [d.lastRunAt ? "ready to wake" : "new · wake it", ""];
  return ["resting · next in " + span((d.lastRunAt || 0) + (CADENCE[d.cadence] || CADENCE.daily) - Date.now()), ""];
}
// an atom driven by jobs: what its jobs are up to
function jobsStatus(d, asks) {
  const jobs = jobsOf(d), on = jobs.filter(cloudOn), ts = on.map(j => S.triggers?.get(j.cloud.triggerId)).filter(Boolean);
  if (!jobs.length) return ["no jobs yet", ""];
  if (ts.some(t => missingApps(d, t).length)) return ["cloud · apps not attached", "warn"];
  if (asks) return [plural(asks, "ask") + " for you", ""];
  if (!on.length) return ["jobs not scheduled yet", "warn"];
  if (ts.length && ts.every(t => !t.enabled)) return ["paused in the cloud", ""];
  const next = ts.filter(t => t.enabled && t.next).map(t => Date.parse(t.next)).sort((a, b) => a - b)[0];
  return [next ? "cloud · " + fmtWhen(next).replace(/^today /, "") : `${plural(on.length, "job")} in the cloud`, "cl"];
}
export function renderDotList(box, where) {
  if (!box) return;
  if (!S.booted) { box.innerHTML = '<div class="dl-empty">…</div>'; return; }
  if (!S.uid) { box.innerHTML = `<div class="dl-empty">${NS.user ? "Sign in to Claude to make atoms." : "Open Atoms inside Claude to make atoms."}</div>`; return; }
  if (!S.dotsLoaded) { box.innerHTML = '<div class="dl-empty"><div class="skel" style="width:70%"></div></div>'; return; }
  if (!S.dots.length) { const msg = `<div class="dl-empty" data-key="empty">No atoms yet. Add one from Elements or make your own.</div>`; if (box.innerHTML !== msg) box.innerHTML = msg; return; }
  reconcile(box, S.dots.map(d => {
    const [st, cl] = dotStatus(d), asks = pending().filter(a => a.dotId === d.id).length;
    const html = `<button class="dl-i" data-key="${esc(d.id)}" data-act="open-dot" data-id="${esc(d.id)}" aria-current="${S.view === "dot" && S.selected === d.id}">${avatarHtml(d, { size: where === "side" ? 34 : 40, state: stateOf(d), badge: asks || "" })}<span class="dl-t"><b>${esc(d.name)}</b><small class="${cl}">${esc(st)}</small></span><span></span></button>`;
    return { key: d.id, html, sig: html };
  }));
}
export function renderMe() {
  const el = $("#meBtn"); if (!el) return;
  const issue = S.diag.length ? '<span class="issue" title="Something went wrong — open for details"></span>' : "";
  let html;
  if (!S.booted) html = `<span><b>Waking up…</b><small>Atoms ${VERSION}</small></span>`;
  else if (!S.uid) html = `<span><b>${NS.user ? "Not signed in" : "Not inside Claude"}</b><small>Signals & access</small></span>${issue}`;
  else html = `<img alt="" src="${esc(S.me?.avatarUrl || "")}"><span><b>${esc(S.me?.name || "You")}</b><small>Signals & access</small></span>${issue}`;
  if (el.innerHTML !== html) el.innerHTML = html;
}
export let peerTok = 0;
export async function renderPeers() {
  const box = $("#peers"), tok = ++peerTok;
  const viewers = S.peers.filter(p => p.kind === "viewer");
  const keyOf = p => p.by || p.presence?.uid || p.peer;
  const people = [...new Set(viewers.map(keyOf))];
  if (people.length < 2) { box.hidden = true; return; }
  const ids = people.filter(x => typeof x === "string" && x.startsWith("u_"));
  const ps = NS.user && ids.length ? await NS.user.profiles(ids).catch(() => ({})) : {};
  if (tok !== peerTok) return;
  const faces = document.createElement("span"); faces.className = "faces";
  for (const id of people.slice(0, 5)) {
    const p = viewers.find(v => keyOf(v) === id), img = document.createElement("img");
    img.alt = ""; img.src = ps[id]?.avatarUrl || ""; img.title = (ps[id]?.name || "Someone") + (p?.isMe ? " (you)" : "") + (p?.presence?.running ? " · waking an atom" : "");
    if (p?.presence?.running) img.className = "busy";
    faces.append(img);
  }
  const label = document.createElement("span"); label.textContent = `${people.length} here now`;
  box.replaceChildren(faces, label); box.hidden = false;
}
