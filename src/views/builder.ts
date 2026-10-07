import { appInfo, appsAvail, normSources, shortOf } from "../core/apps";
import { loadRepos, normRepos } from "../features/repos";
import { runDot } from "../ai/flow";
import { refreshAssets } from "../core/boot";
import { ACCS, CADENCE, EYES, ICON, SHAPES, TEXT_TYPES, TIERS } from "../core/constants";
import { diag } from "../core/diag";
import { $, ago, clean, esc, handleOf, hueOf, newId, tierOf, toast, upsertLocal } from "../core/helpers";
import { NS, S, jobDriven, userDoc } from "../core/state";
import { addJobs } from "../features/jobs";
import { closeAcct } from "../ui/account";
import { LEAD_ORBITS, avatarHtml, isLead, lookOf } from "../ui/characters";
import { afterLeadMade, leadDraft } from "../features/lead";
import { leadOf } from "../features/attention";
import { openDot } from "../ui/nav";
import { renderAll } from "../ui/shell";
import { canSpeak, voices } from "../features/voice";
import { cantSave, recordAdopt, rememberNew } from "./seeds";

/* ─── builder: make / change a dot ─── */
export function draftFromDot(d) { return { id: d.id, role: isLead(d) ? "lead" : null, jobbed: jobDriven(d), voiceName: d.voice?.name || "", name: d.name, responsibility: d.responsibility, rulesText: (d.rules || []).join("\n"), sources: normSources(d.sources), cadence: d.cadence || "daily", tier: tierOf(d), hue: hueOf(d), look: lookOf(d), vips: (d.vips || []).slice(), notesName: d.notesName || null, repoMode: normRepos(d.repos).mode, repoList: normRepos(d.repos).list, rev: 0 }; }
export function blankDraft() { const hue = Math.floor(Math.random() * 360); return { pid: newId("dot_"), voiceName: "", name: "", responsibility: "", rulesText: "", sources: ["Google Calendar", "Gmail"].filter(n => appsAvail().includes(n)), cadence: "daily", tier: "default", hue, look: { shape: SHAPES[hue % 4], eyes: "round", acc: "none" }, vips: [], ask: "", repoMode: "none", repoList: [], rev: 0 }; }
export function openNew(seed) {
  if (cantSave()) return;
  S.formDraft = seed ? { pid: newId("dot_"), voiceName: "", name: seed.name, responsibility: seed.responsibility, rulesText: seed.rules.join("\n"), sources: normSources(seed.sources), cadence: seed.cadence, tier: seed.tier, hue: seed.hue, look: { ...seed.look }, vips: [], seedKey: seed.key, job: seed.job || null, repoMode: seed.job ? "some" : "none", repoList: [], rev: 0 } : blankDraft();
  S.formFile = null; S.sheet = { kind: seed ? "plant" : "new" }; closeAcct(false); renderSheet();
  setTimeout(() => (seed ? $("#sh-name") : $("#sh-ask") || $("#sh-name"))?.focus({ preventScroll: true }), 120);
}
/* your super atom: one per person, made from its own form (features/lead.ts) */
export function openLead() {
  if (cantSave()) return;
  S.formDraft = leadDraft(); S.formFile = null; S.sheet = { kind: "lead" }; closeAcct(false); renderSheet();
  setTimeout(() => $("#sh-name")?.focus({ preventScroll: true }), 120);
}
export function closeSheet() { S.sheet = null; S.formDraft = null; S.formFile = null; renderSheet(); }
export let sheetKey = "";
export function renderSheet() {
  const scrim = $("#scrim");
  if (!S.sheet || !S.formDraft) { if (!scrim.hidden) { scrim.hidden = true; scrim.innerHTML = ""; sheetKey = ""; } return; }
  const key = S.sheet.kind + ":" + (S.formDraft.seedKey || "") + ":" + (S.formDraft.rev || 0);
  if (sheetKey === key && !scrim.hidden) return;
  sheetKey = key; scrim.hidden = false;
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-title">${builderHtml(S.formDraft, "new")}</div>`;
  paintPeoplePicker("new");
}
export function lookBlock(f, p) {
  // shape and eyes are shown bare so the difference is visible; accessories on the current face
  const look = lookOf(f), opt = (k, v) => `<button type="button" class="opt" data-look="${k}" data-v="${v}" aria-pressed="${look[k] === v}" aria-label="${k} ${v}" title="${v}">${avatarHtml({ ...f, id: f.id || "preview", look: { ...look, [k]: v, ...(k === "acc" ? {} : { acc: "none" }) } }, { size: 32 })}</button>`;
  return `<div class="b-prev" id="${p}-prev">${avatarHtml({ ...f, id: f.id || "preview", look }, { size: 112 })}</div>
    <div class="b-pick">
      <div class="pick"><span class="eyebrow">Shape</span><div class="opts">${SHAPES.map(v => opt("shape", v)).join("")}</div></div>
      <div class="pick"><span class="eyebrow">Eyes</span><div class="opts">${EYES.map(v => opt("eyes", v)).join("")}</div></div>
      <div class="pick"><span class="eyebrow">Wears</span><div class="opts">${ACCS.map(v => opt("acc", v)).join("")}</div></div>
      ${f.role === "lead" ? `<div class="pick"><span class="eyebrow">Orbits</span><div class="opts">${LEAD_ORBITS.map(v => `<button type="button" class="opt" data-look="orbits" data-v="${v}" aria-pressed="${(look.orbits || "three") === v}" aria-label="orbits ${v}" title="${v === "three" ? "three orbits" : v === "ring" ? "one ring, three electrons" : "two crossed orbits"}">${avatarHtml({ ...f, id: f.id || "preview", look: { ...look, orbits: v, acc: "none" } }, { size: 32 })}</button>`).join("")}</div></div>` : ""}
      <div class="pick"><label class="eyebrow" for="${p}-hue">Colour</label><input type="range" id="${p}-hue" data-f="hue" min="0" max="359" value="${hueOf(f)}"></div>
      ${canSpeak() && voices().length ? `<div class="pick"><label class="eyebrow" for="${p}-voice">Voice</label><div class="row voice-pick"><select id="${p}-voice" data-f="voiceName"><option value="">Its own (picked for it)</option>${voices().map(v => `<option value="${esc(v.name)}" ${f.voiceName === v.name ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select><button type="button" class="btn ghost sm" data-act="voice-try" data-mode="${p === "sh" ? "new" : "edit"}">${ICON.voice}Hear it</button></div></div>` : ""}
    </div>`;
}
export function builderHtml(f, mode) {
  const p = mode === "new" ? "sh" : "st", editing = mode === "edit";
  const title = editing ? "Settings" : S.sheet?.kind === "plant" ? "Add it" : S.sheet?.kind === "lead" ? "Your super atom" : "Make an atom";
  return `<form class="builder" id="${p}-form" data-draft="${mode}" novalidate>
    <div class="b-head"><h2 id="${p}-title">${title}</h2>${editing ? "" : `<button type="button" class="icon-btn" data-act="close-sheet" aria-label="Close">${ICON.close}</button>`}</div>
    ${!editing && S.sheet?.kind === "lead" ? `<p class="note lead-intro">One atom that looks across all your others. It learns how you like to work from what you tell it and what you do with asks, and keeps that on a page only you see. Every few hours it may ping you, only when something is worth it and never past the budget you set. Like every atom, it only asks, and you decide.</p>` : ""}
    ${NS.sample && !editing && S.sheet?.kind !== "plant" && S.sheet?.kind !== "lead" ? `<div class="spark"><label class="eyebrow" for="sh-ask">Say what you want watched</label><div class="row"><input type="text" id="sh-ask" data-f="ask" value="${esc(f.ask || "")}" placeholder="Warn me about this week's meetings that have no agenda" style="flex:1;min-width:200px"><button class="btn pri" type="button" data-act="draft-ai" id="sh-draftBtn">Shape it</button></div><span class="note" id="sh-draftNote">Claude fills in everything below — name, job, rules, even a look. You check it before it joins your field.</span></div>` : ""}
    <div class="b-look" id="${p}-look">${lookBlock(f, p)}</div>
    <div class="two"><div class="field-i"><label class="eyebrow" for="${p}-name">Name</label><input type="text" id="${p}-name" data-f="name" maxlength="40" value="${esc(f.name)}" placeholder="Meeting prep"></div>
      <div class="field-i"><span class="eyebrow">Handle</span><div class="note mono" id="${p}-handle" style="padding:11px 0">${esc(handleOf(f))}</div></div></div>
    <div class="field-i"><label class="eyebrow" for="${p}-resp">Its main job${f.jobbed ? " · off" : ""}</label><textarea class="job" id="${p}-resp" data-f="responsibility" maxlength="900" placeholder="What should it keep an eye on, and what's worth telling you about?">${esc(f.responsibility)}</textarea></div>
    <div class="field-i"><label class="eyebrow" for="${p}-rules">House rules · one per line</label><textarea id="${p}-rules" data-f="rulesText" maxlength="900" style="min-height:64px" placeholder="Never propose more than 3 actions">${esc(f.rulesText || "")}</textarea></div>
    <div class="field-i"><span class="eyebrow">It may read</span><div class="checks" id="${p}-srcs">${[...new Set([...appsAvail(), ...normSources(f.sources)])].map(n => `<label title="${esc(appInfo(n).does)}"><input type="checkbox" data-f="src" data-src="${esc(n)}" value="${esc(n)}" ${normSources(f.sources).includes(n) ? "checked" : ""}>${esc(shortOf(n))}${S.appsOff.has(n) ? " (off)" : S.connLoaded && NS.mcp && !S.conn[n] ? " (not connected)" : ""}</label>`).join("") || '<span class="fine">No apps are on. Turn some on in Apps.</span>'}</div></div>
    <div class="field-i" id="${p}-repoField">${repoFieldHtml(f, mode)}</div>
    <div class="two">${f.job || f.jobbed ? `<div class="field-i"><span class="eyebrow">Runs</span><p class="note" style="padding:10px 0 0">On each job's own schedule, in the cloud.</p></div>` : `<div class="field-i"><label class="eyebrow" for="${p}-cad">Wakes</label><select id="${p}-cad" data-f="cadence">${["hourly", "daily", "weekly"].map(c => `<option ${f.cadence === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>`}
      <div class="field-i"><label class="eyebrow" for="${p}-tier">Mind</label><select id="${p}-tier" data-f="tier">${Object.entries(TIERS).map(([k, v]) => `<option value="${k}" ${tierOf(f) === k ? "selected" : ""}>${v}${k === "complex" ? " · slower" : k === "quick" ? " · lightest" : ""}</option>`).join("")}</select></div></div>
    ${NS.user ? `<div class="field-i"><label class="eyebrow" for="${p}-people">People who matter · optional</label><div class="people-pick"><div class="people" id="${p}-vips"></div><input type="text" id="${p}-people" data-people="${mode}" placeholder="Search your organization" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="${p}-plist" aria-autocomplete="list"><div class="plist" id="${p}-plist" role="listbox" hidden></div></div><span class="note">Their mail comes first. Only their ids are saved.</span></div>` : ""}
    ${NS.assets ? `<div class="field-i"><label class="eyebrow" for="${p}-file">Something it should know · optional</label><input type="file" id="${p}-file" data-file="${mode}" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json"><span class="note" id="${p}-fileNote">${f.notesName ? `Knows <b>${esc(f.notesName)}</b> now. Pick another file to replace it, or <button type="button" class="link" data-act="drop-file" data-id="${mode}">remove it</button>.` : "A .txt, .md, .csv or .json it rereads every time, like your team roster."}</span></div>` : ""}
    <div class="row b-foot"><button class="btn pri" type="submit" id="${p}-save">${editing ? "Save changes" : S.sheet?.kind === "plant" ? "Add it" : S.sheet?.kind === "lead" ? "Add it" : "Make it"}</button>${editing ? "" : `<button type="button" class="btn ghost" data-act="close-sheet">Cancel</button>`}<span class="err" id="${p}-err" role="alert"></span></div>
  </form>`;
}
export function repoListHtml(f, mode) {
  if (!S.repos) return `<p class="note">${S.reposErr ? `Couldn't list your repos: ${esc(S.reposErr)}. <button type="button" class="link" data-act="repos-retry">Try again</button>` : "Loading your repos…"}</p>`;
  const q = (f.repoQ || "").toLowerCase(), picked = new Set(f.repoList || []);
  const rows = S.repos.filter(r => !picked.has(r.name) && (!q || r.name.toLowerCase().includes(q))).slice(0, 8);
  return rows.length ? rows.map(r => `<button type="button" class="repo-opt" data-act="pick-repo" data-id="${esc(r.name)}" data-mode="${mode}"><b>${esc(r.name)}</b><small>${esc(r.visibility)}${r.pushedAt ? ` · pushed ${esc(ago(Date.parse(r.pushedAt)))}` : ""}</small></button>`).join("") : `<p class="note">${q ? "No repo matches that." : "Every repo is picked."}</p>`;
}
export function repoFieldHtml(f, mode) {
  const p = prefixOf(mode), m = f.repoMode || "none", list = f.repoList || [];
  // an atom driven by jobs: the repos it works in are its jobs
  if (f.jobbed) return `<span class="eyebrow">Repos</span><p class="note">Its main job is off. Each command job works in its own repo. <button type="button" class="link" data-act="tab" data-id="schedule">See its jobs</button></p>`;
  if (f.job) {
    if (!S.repos && !S.reposLoading && !S.reposErr) setTimeout(() => loadRepos(), 0);
    return `<span class="eyebrow">Repos it works in · each gets its own job</span><div class="people">${list.map(x => `<span class="person repo-chip"><span>${esc(x)}</span><button type="button" data-act="unpick-repo" data-id="${esc(x)}" data-mode="${mode}" aria-label="Remove ${esc(x)}">×</button></span>`).join("")}</div>
      <input type="text" id="${p}-repoq" data-repoq="${mode}" value="${esc(f.repoQ || "")}" placeholder="Search your repos" autocomplete="off"><div class="repo-list" id="${p}-rlist">${repoListHtml(f, mode)}</div>
      <span class="note">In each repo it runs ${esc(f.job.run)} in the cloud, on that job's own schedule, under the repo's own rules. Anything that needs your say comes to Asks first.</span>`;
  }
  const chip = (v, l) => `<button type="button" class="chip" data-act="repo-mode" data-id="${v}" data-mode="${mode}" aria-pressed="${m === v}">${l}</button>`;
  let body = "";
  if (m === "some") {
    if (!S.repos && !S.reposLoading && !S.reposErr) setTimeout(() => loadRepos(), 0);
    body = `<div class="people">${list.map(x => `<span class="person repo-chip"><span>${esc(x)}</span><button type="button" data-act="unpick-repo" data-id="${esc(x)}" data-mode="${mode}" aria-label="Remove ${esc(x)}">×</button></span>`).join("")}</div>
      <input type="text" id="${p}-repoq" data-repoq="${mode}" value="${esc(f.repoQ || "")}" placeholder="Search your repos" autocomplete="off"><div class="repo-list" id="${p}-rlist">${repoListHtml(f, mode)}</div>`;
  } else if (m === "all") {
    if (!S.repos && !S.reposLoading && !S.reposErr) setTimeout(() => loadRepos(), 0);
    body = `<p class="note">${S.repos ? `All ${S.repos.length} repos you can reach through Claude, including ones you get later.` : "Every repo you can reach through Claude, including ones you get later."} When it wakes it looks at the ones that changed lately.</p>`;
  }
  return `<span class="eyebrow">GitHub repos</span><div class="chips">${chip("none", "None")}${chip("some", "Pick repos")}${chip("all", "All my repos")}</div>${body}
    ${m !== "none" ? `<span class="note">Read in full when it wakes in the cloud: commits, pull requests, issues and CI. It never pushes, comments or merges. Waking here, it only sees when each repo last changed.</span>` : ""}`;
}
export function paintRepoField(mode) { const f = draftOf(mode), box = $(`#${prefixOf(mode)}-repoField`); if (f && box) box.innerHTML = repoFieldHtml(f, mode); }
export const draftOf = mode => (mode === "new" ? S.formDraft : S.editDraft);
export const prefixOf = mode => (mode === "new" ? "sh" : "st");
export function refreshLook(mode) {
  const f = draftOf(mode), p = prefixOf(mode), blk = $(`#${p}-look`); if (!f || !blk) return;
  const hueVal = $(`#${p}-hue`)?.value;
  blk.innerHTML = lookBlock(f, p);
  if (hueVal != null) $(`#${p}-hue`).value = hueVal;
}
export function paintPeoplePicker(mode) { const f = draftOf(mode), el = $(`#${prefixOf(mode)}-vips`); if (el && f) paintPeopleChips(el, f.vips || [], mode); }
export let chipTok = 0;
export async function paintPeopleChips(el, ids, mode) {
  if (!el) return; const tok = ++chipTok;
  const ps = NS.user && ids.length ? await NS.user.profiles(ids).catch(() => ({})) : {};
  if (tok !== chipTok || !el.isConnected) return;
  el.innerHTML = ids.map(id => { const p = ps[id] || {}; return `<span class="person">${p.avatarUrl ? `<img alt="" src="${esc(p.avatarUrl)}">` : ""}<span>${esc(p.name || "Someone")}</span>${mode ? `<button type="button" data-act="unpick-person" data-id="${esc(id)}" data-mode="${mode}" aria-label="Remove ${esc(p.name || "person")}">×</button>` : ""}</span>`; }).join("");
}
export let peopleTok = 0;
export async function searchPeople(mode, q) {
  const p = prefixOf(mode), list = $(`#${p}-plist`), input = $(`#${p}-people`); if (!list || !NS.user) return;
  const tok = ++peopleTok, hits = await NS.user.search(q).catch(() => []);
  if (tok !== peopleTok || !list.isConnected) return;
  const vips = draftOf(mode)?.vips || [], rows = (hits || []).filter(x => !x.isMe && !vips.includes(x.id)).slice(0, 8);
  list.innerHTML = rows.length ? rows.map(x => `<button type="button" role="option" data-act="pick-person" data-id="${esc(x.id)}" data-mode="${mode}">${x.avatarUrl ? `<img alt="" src="${esc(x.avatarUrl)}">` : ""}<span>${esc(x.name)}${x.email ? ` <small>${esc(x.email)}</small>` : ""}</span></button>`).join("") : `<p class="note" style="padding:8px">${q ? "Nobody by that name." : "Type a name to search your organization."}</p>`;
  list.hidden = false; input?.setAttribute("aria-expanded", "true");
}
export async function draftWithClaude() {
  const ask = clean($("#sh-ask")?.value || "").trim(); if (!ask) { $("#sh-ask")?.focus(); return; }
  const btn = $("#sh-draftBtn"), note = $("#sh-draftNote"); btn.disabled = true; note.textContent = "Shaping…";
  try {
    const j = await NS.sample.json(
      `Turn this request into the setup for a personal assistant "atom". An atom is a small character with one job: it reads some of the owner's apps (${appsAvail().map(shortOf).join(", ") || "none connected yet"}), writes the owner short notes, can ask the owner a question, and can propose (never take) actions in those apps for the owner to approve.\nRequest: """${ask.slice(0, 600)}"""\n` +
      `Reply with only one JSON object: {"name": string (2-3 words), "responsibility": string (2-3 plain sentences: what to watch and what is worth reporting), "rules": string[] (up to 3 short rules), "sources": array of app names it should read, from: ${JSON.stringify(appsAvail())}, "cadence": "hourly"|"daily"|"weekly", "tier": "quick"|"default"|"complex", "hue": integer 0-359, "look": {"shape": "orb"|"squircle"|"blob"|"pebble", "eyes": "round"|"wide"|"happy"|"sleepy", "acc": "none"|"glasses"|"shades"|"headphones"|"antenna"|"beanie"} (a look that suits its personality)}`,
      { modelTier: "quick" });
    const f = S.formDraft; if (!f) return;
    Object.assign(f, { ask, name: clean((j as any)?.name).slice(0, 40), responsibility: clean((j as any)?.responsibility).slice(0, 900), rulesText: (Array.isArray((j as any)?.rules) ? (j as any).rules : []).map(x => clean(x).slice(0, 160)).slice(0, 3).join("\n"),
      sources: normSources((j as any)?.sources).length ? normSources((j as any).sources) : normSources(f.sources), cadence: CADENCE[(j as any)?.cadence] ? (j as any).cadence : "daily", tier: tierOf(j),
      hue: Number.isFinite(+(j as any)?.hue) ? ((Math.round(+(j as any).hue) % 360) + 360) % 360 : f.hue, look: lookOf({ id: "x", look: (j as any)?.look || f.look }), rev: (f.rev || 0) + 1 });
    renderSheet();
    const n2 = $("#sh-draftNote"); if (n2) n2.textContent = "Here it is. Change anything — its look too — then make it.";
  } catch (e) { diag("sample.shape", e); note.textContent = e?.code === "not_granted" ? "Claude isn't allowed on this page. Fill it in by hand." : e?.code === "rate_limited" ? "Usage limit reached. Fill it in by hand or try later." : "Couldn't shape that. Try saying it another way."; }
  finally { const b = $("#sh-draftBtn"); if (b) b.disabled = false; }
}
export async function saveBuilder(mode) {
  const f = draftOf(mode), p = prefixOf(mode), err = $(`#${p}-err`); if (!f || !err) return;
  const name = clean(f.name).trim().slice(0, 40), resp = clean(f.responsibility).trim().slice(0, 900);
  const rules = clean(f.rulesText || "").split("\n").map(s => s.trim()).filter(Boolean).slice(0, 6), sources = normSources(f.sources);
  if (!name || !resp) { err.textContent = "Give it a name and a job."; return; }
  if (!sources.length) { err.textContent = "Let it read at least one app."; return; }
  if (!NS.db || !S.uid) { err.textContent = "Open this page inside Claude, signed in, to save atoms."; return; }
  const btn = $(`#${p}-save`); btn.disabled = true; err.textContent = "";
  const prev = mode === "edit" ? S.dots.find(d => d.id === f.id) : null, id = prev ? prev.id : f.pid || newId("dot_");
  const newLead = !prev && f.role === "lead";
  if (newLead && leadOf()) { err.textContent = `You already have a super atom: ${leadOf().name}.`; btn.disabled = false; return; }
  const jobSpec = !prev && f.job ? f.job : null;
  if (jobSpec && !(f.repoList || []).length) { err.textContent = "Pick at least one repo for it to work in."; btn.disabled = false; return; }
  if (!jobSpec && !f.jobbed && f.repoMode === "some" && !(f.repoList || []).length) { err.textContent = "Pick at least one repo, or choose None."; btn.disabled = false; return; }
  const fields: Record<string, any> = { voice: f.voiceName ? { name: clean(f.voiceName).slice(0, 120) } : null, repos: normRepos({ mode: f.repoMode, list: f.repoList }), name, responsibility: resp, rules, sources, cadence: CADENCE[f.cadence] ? f.cadence : "daily", tier: tierOf(f), hue: hueOf(f), look: lookOf({ id, look: f.look }), vips: (f.vips || []).slice(0, 5) };
  // an atom driven by jobs keeps its repos on its jobs
  if (jobSpec) { fields.repos = { mode: "none", list: [] }; fields.jobs = { run: jobSpec.run }; }
  if (prev && jobDriven(prev)) delete fields.repos;
  let oldAsset = null, fileChanged = false;
  try {
    const file = mode === "new" ? S.formFile : S.editFile;
    if (file && NS.assets) {
      const ext = (file.name.split(".").pop() || "").toLowerCase(), type = TEXT_TYPES[ext];
      if (!type) { err.textContent = "Use a .txt, .md, .csv or .json file."; btn.disabled = false; return; }
      if (file.size > 512 * 1024) { err.textContent = "Keep the file under 512 KB."; btn.disabled = false; return; }
      const up = await NS.assets.upload(file, { type }); oldAsset = prev?.notesAssetId || null; (fields as any).notesAssetId = up.id; (fields as any).notesName = clean(file.name).slice(0, 60); fileChanged = true;
    } else if (f.dropFile && prev?.notesAssetId) { oldAsset = prev.notesAssetId; (fields as any).notesAssetId = null; (fields as any).notesName = null; fileChanged = true; }
    if (prev) { await userDoc(id).update(fields); upsertLocal(S.dots, id, fields); }
    else {
      const body = { type: "dot", ...fields, ...(newLead ? { role: "lead" } : {}), notesAssetId: (fields as any).notesAssetId || null, notesName: (fields as any).notesName || null, createdAt: Date.now(), lastRunAt: null, lastStatus: null };
      await userDoc(id).set(body); rememberNew(id, body);
      if (jobSpec) await addJobs({ id, ...body }, f.repoList || [], jobSpec.run);
      if (newLead) await afterLeadMade({ id, ...body });
    }
    if (oldAsset && oldAsset !== (fields as any).notesAssetId) NS.assets?.delete(oldAsset).catch(() => {});
    if (f.seedKey) recordAdopt(f.seedKey);
    if (fileChanged) refreshAssets();
    if (mode === "new" && jobSpec) { closeSheet(); openDot(id, "schedule"); toast(`${name} is ready. Give each job a schedule.`); }
    else if (newLead) { closeSheet(); openDot(id, "know"); toast(`${name} is ready. Tell it about how you work, or give it a schedule on its Jobs tab for pings.`); }
    else if (mode === "new") { closeSheet(); openDot(id, "chat"); toast(`${name} is ready`, { label: "Wake it", fn: () => runDot(id) }); }
    else { S.editDraft = null; S.editFile = null; S.settingsKey = ""; toast("Saved"); renderAll(); }
  } catch (e) {
    diag("db.save", e);
    const c = e?.code;
    err.textContent = c === "quota_exceeded" || c === "quota_or_state" ? "Storage is full. Delete an old atom or file first." : c === "unsupported_type" || c === "invalid_request" ? "That file couldn't be stored. Save it as UTF-8 text and try again." : c === "too_large" ? "That file is too large." : `Couldn't save (${c || "error"}). Details are in Signals & access.`;
    btn.disabled = false;
  }
}
