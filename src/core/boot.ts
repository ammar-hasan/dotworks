import { normSources } from "./apps";
import { maybeDigest } from "../ai/digest";
import { CADENCE, SRV } from "./constants";
import { diag } from "./diag";
import { clean, clone, fmtDay, headlineOf, hueOf, tierOf } from "./helpers";
import { restoreHot } from "./hot";
import { setPresence, startRoom } from "./room";
import { NS, S, cloudOn, connPerm, runsCol, userDoc } from "./state";
import { loadTriggers, paintCloud } from "../features/cloud";
import { jobSpecOf } from "../features/jobs";
import { renderAcct } from "../ui/account";
import { lookOf } from "../ui/characters";
import { go, openDot } from "../ui/nav";
import { renderAll } from "../ui/shell";
import { startDay } from "../views/horizon";
import { paintView } from "../views/index";

/* ═════════ boot: core first, everything else lights up as it arrives ═════════ */
export const use = n => {
  try { return (window.claude && typeof window.claude.use === "function") ? Promise.resolve(window.claude.use(n)).catch(e => { diag("use:" + n, e); return null; }) : Promise.resolve(null); }
  catch (e) { diag("use:" + n, e); return Promise.resolve(null); }
};
export async function boot(hot) {
  restoreHot(hot || {});
  const t0 = Date.now(), C = window.claude;
  S.env = { claude: !!C, use: !!(C && typeof C.use === "function"), hot: !!(C && (C as any).hot), caps: {}, coreMs: null };
  const [user, db] = await Promise.all([use("user"), use("db")]);
  NS.user = user; NS.db = db; (S.env.caps as any).user = !!user; (S.env.caps as any).db = !!db; (S.env as any).coreMs = Date.now() - t0;
  if (NS.user) {
    try { S.me = await NS.user.me(); S.uid = S.me?.id || null; S.isOwner = !!S.me?.isOwner; } catch (e) { diag("user.me", e); }
    try { S.canShare = await NS.user.can("data.write"); } catch { S.canShare = null; }
  }
  (S.env as any).signedIn = !!S.uid;
  S.booted = true;
  if (!NS.db) { S.dotsLoaded = true; S.seedsLoaded = true; if (S.env.use && S.uid) diag("boot", { code: "no_db", message: "Memory (db) isn't available in this view." }); }
  subscribe();
  renderAll();
  const later = {
    permissions: async () => { await readPerms(); startDay(); },
    sample: async () => { try { const l = await NS.sample.limits(); S.toolsOK = !!l?.tools; S.toolMax = Number(l?.tools?.maxCount) || 0; S.imagesOK = l?.images || null; } catch (e) { S.toolsOK = null; diag("sample.limits", e); } },
    mcp: async () => { refreshConnectors(); startDay(); },
    room: async () => startRoom(),
    assets: async () => refreshAssets(),
    downloads: async () => {}, comments: async () => {},
  };
  S.capsLeft = Object.keys(later).length;
  for (const [n, fn] of Object.entries(later)) {
    use(n).then(ns => { NS[n] = ns; S.env.caps[n] = !!ns; return ns ? fn() : null; }).catch(e => diag("init:" + n, e))
      .finally(() => { S.capsLeft--; if (!S.capsLeft) { (S.env as any).allMs = Date.now() - t0; if (S.env.use && S.uid && !NS.sample) diag("boot", { code: "no_sample", message: "Claude (sample) isn't available in this view." }); } renderAll(); });
  }
}
export async function readPerms() {
  if (!NS.permissions) { S.perms = {}; return; }
  try { S.perms = (await NS.permissions.state()) || {}; } catch (e) { S.perms = {}; diag("permissions.state", e); }
}
export function refreshConnectors() {
  NS.mcp.listTools().then(r => {
    S.conn = {}; for (const s of r?.servers || []) S.conn[s.server] = { auth: s.authStatus, tools: (s.tools || []).map(t => t.name), ann: Object.fromEntries((s.tools || []).map(t => [t.name, t.annotations || {}])), kind: s.kind };
    S.connLoaded = true; renderAll();
  }).catch(e => { S.connLoaded = true; diag("mcp.listTools", e); renderAll(); });
}
export function refreshAssets() { NS.assets.list().then(r => { S.assetsUsage = r?.usage || null; if (S.acctOpen) renderAcct(); }).catch(e => diag("assets.list", e)); }

export function subscribe() {
  if (!NS.db) { S.seedsLoaded = true; return; }
  // where this copy of Atoms lives (recorded once by the setup skill); cloud wakes need it to find their way back
  NS.db.doc("meta/app").onSnapshot(snap => {
    const u = snap.exists ? String(snap.data()?.url || "") : "";
    S.appUrl = /^https:\/\/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9_-]{6,64}$/.test(u) ? u : "";
    S.appUrlLoaded = true; if (S.view === "dot" && S.tab === "schedule") paintCloud();
  }, e => { S.appUrlLoaded = true; diag("db.app", e); });
  // which apps you've turned off for Atoms (private to you)
  userDoc("apps_prefs").onSnapshot(snap => { const off = snap.exists ? snap.data()?.off : null; S.appsOff = new Set((Array.isArray(off) ? off : []).filter(n => typeof n === "string" && n.length <= 80)); renderAll(); }, e => diag("db.prefs", e));
  NS.db.collection("library").onSnapshot(snap => {
    const seeds = [];
    for (const doc of snap.docs) {
      const body = doc.data() || {};
      (Array.isArray(body.templates) ? body.templates : []).slice(0, 20).forEach((t, ord) => {
        const s = sanitizeSeed(t); if (!s) return;
        seeds.push({ ...s, ord, key: doc.id + ":" + s.id, owner: doc.id === "starter" ? null : doc.id, starter: doc.id === "starter" });
      });
    }
    seeds.sort((a, b) => (b.starter - a.starter) || (a.starter ? a.ord - b.ord : (b.createdAt || 0) - (a.createdAt || 0)));
    S.seeds = seeds; S.seedsLoaded = true; renderAll();
  }, e => { S.seedsLoaded = true; diag("db.library", e); renderAll(); });
  NS.db.collection("adopts").onSnapshot(snap => {
    const counts = {}; let mine = [];
    for (const doc of snap.docs) { const keys: string[] = Array.isArray(doc.data()?.keys) ? (doc.data().keys as any[]).map(String) : []; for (const k of new Set(keys)) counts[k] = (counts[k] || 0) + 1; if (doc.id === S.uid) mine = keys; }
    S.adopts = counts; S.myAdopts = mine; if (S.view === "seeds") paintView();
  }, e => diag("db.adopts", e));
  if (!S.uid) return;
  const col = NS.db.collection("data/users/" + S.uid);
  col.where("type", "==", "dot").onSnapshot(snap => {
    const fromSnap = snap.docs.map(x => ({ id: x.id, ...clone(x.data()) })), now = Date.now();
    for (const d of fromSnap) { S.seen.add(d.id); S.fresh.delete(d.id); }
    for (const [id, f] of S.fresh) if (now - f.at > 90000) S.fresh.delete(id);
    S.dots = [...fromSnap, ...[...S.fresh.values()].map(f => f.dot)].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    S.dotsLoaded = true;
    if (S.needDot) { const id = S.needDot; S.needDot = null; if (S.dots.some(d => d.id === id)) openDot(id, S.tab); }
    // leave a dot's page only when a dot we had really went away (deleted here or in another tab)
    if (S.view === "dot" && S.seen.has(S.selected) && !S.dots.some(d => d.id === S.selected)) go("home");
    loadLatest(); renderAll();
    if (S.dots.some(d => cloudOn(d) || d.cloudPending) && connPerm(SRV.cloud) === "granted" && !S.triggers) loadTriggers();
  }, e => { diag("db.dots", e); S.dotsLoaded = true; renderAll(); });
  col.where("type", "==", "job").onSnapshot(snap => {
    S.jobs = snap.docs.map(x => ({ id: x.id, ...clone(x.data()) })).filter(j => typeof j.dotId === "string");
    S.jobsLoaded = true; renderAll();
    if (S.jobs.some(j => cloudOn(j) || j.cloudPending) && connPerm(SRV.cloud) === "granted" && !S.triggers) loadTriggers();
  }, e => { diag("db.jobs", e); S.jobsLoaded = true; renderAll(); });
  col.where("type", "==", "action").onSnapshot(snap => {
    S.actions = snap.docs.map(x => ({ id: x.id, ...clone(x.data()) })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderAll(); setPresence();
  }, e => diag("db.actions", e));
}
export function sanitizeSeed(t) {
  if (!t || typeof t !== "object" || !t.id || !t.name) return null;
  return { id: clean(t.id).slice(0, 40), name: clean(t.name).slice(0, 40), responsibility: clean(t.responsibility).slice(0, 900),
    rules: (Array.isArray(t.rules) ? t.rules : []).map(r => clean(r).slice(0, 160)).filter(Boolean).slice(0, 6),
    sources: normSources(t.sources), cadence: CADENCE[t.cadence] ? t.cadence : "daily",
    tier: tierOf(t), hue: hueOf(t), look: lookOf(t), createdAt: Number(t.createdAt) || 0, job: jobSpecOf(t.job) };
}
export async function loadLatest() {
  if (!NS.db || !S.uid) return;
  const todo = S.dots.filter(d => d.lastRunAt && S.latest[d.id]?.at !== d.lastRunAt);
  for (const d of todo) {
    try { const snap = await runsCol(d.id).orderBy("startedAt", "desc").limit(1).get(); const r = snap.docs[0]?.data(); S.latest[d.id] = r ? { at: d.lastRunAt, headline: headlineOf(r.text), day: fmtDay(r.startedAt) } : { at: d.lastRunAt }; }
    catch (e) { S.latest[d.id] = { at: d.lastRunAt }; diag("db.latest", e); }
  }
  if (todo.length) { renderAll(); maybeDigest(); }
}
