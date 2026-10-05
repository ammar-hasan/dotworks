import { normSources, shortOf } from "../core/apps";
import { runDot } from "../ai/flow";
import { diag } from "../core/diag";
import { $, clone, esc, hueOf, newId, reconcile, tierOf, toast } from "../core/helpers";
import { NS, S, userDoc } from "../core/state";
import { avatarHtml, lookOf } from "../ui/characters";
import { go, openDot } from "../ui/nav";
import { renderAll } from "../ui/shell";
import { closeSheet, openNew } from "./builder";

/* ─── seeds ─── */
export let seedTok = 0;
export async function paintSeeds() {
  const box = $("#seedGrid"); if (!box) return;
  const tok = ++seedTok;
  if (!S.booted || (NS.db && !S.seedsLoaded)) { box.innerHTML = '<div class="skel" style="height:160px"></div>'; return; }
  if (!NS.db) { box.innerHTML = '<p class="calm">Open this page inside Claude to see elements.</p>'; return; }
  if (!S.seeds.length) { box.innerHTML = '<p class="calm">Nothing here yet. Open one of your atoms and choose Share as an element.</p>'; return; }
  const owners = [...new Set(S.seeds.map(s => s.owner).filter(Boolean))];
  const ps = NS.user && owners.length ? await NS.user.profiles(owners).catch(() => ({})) : {};
  if (tok !== seedTok || !box.isConnected) return;
  reconcile(box, S.seeds.slice(0, 30).map(s => {
    const who = s.starter ? "starter" : s.owner === S.uid ? "shared by you" : "shared by " + (ps[s.owner]?.name || "someone");
    const n = S.adopts[s.key] || 0, mine = S.myAdopts.includes(s.key), canRemove = !s.starter && (s.owner === S.uid || S.isOwner);
    const html = `<article class="seedcard" data-key="${esc(s.key)}" style="--h:${s.hue}" data-comment-target><div class="sc-top">${avatarHtml({ ...s, id: s.key }, { size: 56 })}<div style="min-width:0"><strong>${esc(s.name)}</strong><span class="by">${esc(who)}${n ? ` · added by ${n}` : ""}${mine ? " · you have it" : ""}</span></div></div><p>${esc(s.responsibility)}</p><div class="srcs">${normSources(s.sources).map(x => `<span class="src">${esc(shortOf(x))}</span>`).join("")}<span class="src">${s.job ? `runs ${esc(s.job.run)} per repo` : `wakes ${esc(s.cadence)}`}</span></div><div class="row">${S.uid ? `<button class="btn pri sm" data-act="plant" data-id="${esc(s.key)}" ${S.busy["plant:" + s.key] ? "disabled" : ""}>${S.busy["plant:" + s.key] ? "Adding…" : s.job ? "Add…" : "Add"}</button><button class="btn ghost sm" data-act="plant-open" data-id="${esc(s.key)}">Customize</button>` : ""}${canRemove ? `<span class="grow"></span><button class="btn ghost sm danger" data-act="unshare" data-id="${esc(s.key)}">Remove</button>` : ""}</div></article>`;
    return { key: s.key, html, sig: html };
  }));
}
export const seedByKey = k => S.seeds.find(s => s.key === k) || null;
export async function recordAdopt(key) {
  if (!NS.db || !S.uid || !key) return;
  try { await NS.db.doc("adopts/" + S.uid).set({ keys: [...new Set([...S.myAdopts, key])].slice(-50), updatedAt: Date.now() }); } catch (e) { diag("db.adopt", e); }
}
export function rememberNew(id, body) {
  // a dot we just created shows up at once, even if the store's echo is slow
  if (S.dots.some(d => d.id === id)) return;
  const dot = { id, ...clone(body) };
  S.fresh.set(id, { dot, at: Date.now() }); S.dots = [...S.dots, dot];
}
export function cantSave() {
  if (!S.uid) { toast(NS.user ? "Sign in to Claude to make atoms." : "Open this page inside Claude to make atoms."); return true; }
  if (!NS.db) { toast("Memory is off in this view, so atoms can't be saved here."); return true; }
  return false;
}
export async function plant(key) {
  const s = seedByKey(key); if (!s || cantSave() || S.busy["plant:" + key]) return;
  // an atom with jobs needs its repos first: open it to pick them
  if (s.job) { openNew(s); return; }
  const id = newId("dot_"), body = { type: "dot", name: s.name, responsibility: s.responsibility, rules: s.rules, sources: s.sources, cadence: s.cadence, tier: s.tier, hue: s.hue, look: s.look, vips: [], createdAt: Date.now(), lastRunAt: null, lastStatus: null };
  S.busy["plant:" + key] = true; renderAll();
  try {
    await userDoc(id).set(body);
    rememberNew(id, body); recordAdopt(key); closeSheet();
    openDot(id, "chat"); toast(`${s.name} is ready`, { label: "Wake it", fn: () => runDot(id) });
  } catch (e) { diag("db.plant", e); toast(`Couldn't add that (${e?.code || "error"}). Details are in Signals & access.`); }
  delete S.busy["plant:" + key]; renderAll();
}
export async function shareSeed(d) {
  if (!d || !NS.db || !S.uid) return;
  const mine = S.seeds.filter(s => s.owner === S.uid);
  const strip = s => ({ id: s.id, name: s.name, responsibility: s.responsibility, rules: s.rules, sources: s.sources, cadence: s.cadence, tier: s.tier, hue: s.hue, look: s.look, createdAt: s.createdAt, ...(s.job ? { job: s.job } : {}) });
  // shared: the setup only. An atom with jobs shares what its jobs run, never your repos or their instructions.
  const tpl = { id: "t" + d.id.slice(4), name: d.name, responsibility: d.responsibility, rules: d.rules || [], sources: d.sources || [], cadence: d.cadence || "daily", tier: tierOf(d), hue: hueOf(d), look: lookOf(d), createdAt: Date.now(), ...(d.jobs?.run ? { job: { run: d.jobs.run } } : {}) };
  try { await NS.db.doc("library/" + S.uid).set({ templates: [tpl, ...mine.filter(s => s.id !== tpl.id).map(strip)].slice(0, 12), updatedAt: Date.now() }); toast("Shared as an element. Only the setup is shared — never your notes, people or files.", { label: "See seeds", fn: () => go("seeds") }); }
  catch (e) { diag("db.share", e); toast("Sharing needs Contributor access to this page."); }
}
export async function unshare(key) {
  const s = seedByKey(key); if (!s || !s.owner) return;
  const rest = S.seeds.filter(x => x.owner === s.owner && x.key !== key).map(x => ({ id: x.id, name: x.name, responsibility: x.responsibility, rules: x.rules, sources: x.sources, cadence: x.cadence, tier: x.tier, hue: x.hue, look: x.look, createdAt: x.createdAt, ...(x.job ? { job: x.job } : {}) }));
  try { await NS.db.doc("library/" + s.owner).set({ templates: rest, updatedAt: Date.now() }); toast("Removed"); } catch (e) { diag("db.unshare", e); toast("Couldn't remove it."); }
}
