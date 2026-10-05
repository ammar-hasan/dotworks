import { ICON } from "../core/constants";
import { diag } from "../core/diag";
import { $, ago, clean, cssKey, esc, hueOf, newId, plural, toast, upsertLocal } from "../core/helpers";
import { NS, S, cloudOn, curDot, jobsOf, userDoc } from "../core/state";
import { avatarHtml } from "../ui/characters";
import { openDot } from "../ui/nav";
import { renderAll } from "../ui/shell";
import { REPO_RE, loadRepos, repoShort } from "./repos";
import { cloudAct, firingFor, paintCloudBox, subOf } from "./cloud";
import { questionOf } from "./questions";

/* ─── jobs ───
   A job is one thing an atom does on its own schedule: run a command in one of your repos (like /catchup), in the
   cloud. Each job has its own scheduled task, notes and asks, so one atom can do the same kind of work in several
   places, separately. An atom marked with `jobs` ({run}) is driven by its jobs; most atoms have none.
   Stored as their own documents: data/users/<you>/<jobId> {type: "job", dotId, title, repo, run, rules, cloud, …}.

   When a job's command needs your say (file this? change that?), the cloud run doesn't guess and doesn't wait:
   it leaves each decision as a plain-words question in Asks ("decisions": kind "question" with a jobId). Once
   you've answered every decision from a run, this page starts a short filing run of that job, which carries on
   with the ones you said yes to (config/runbook.md, "Filing run"). */

export const RUN_RE = /^\/[A-Za-z][\w:.-]{0,40}$/;
export const jobSpecOf = x => (x && typeof x === "object" && RUN_RE.test(String(x.run || "")) ? { run: String(x.run) } : null);
export const jobTitle = j => clean(j?.title || "") || repoShort(j?.repo || "") || "job";
export const MAX_JOBS = 8;
export function jobBody(dotId: string, repo: string, run: string, rules: string[] = []) {
  return { type: "job", dotId, title: repoShort(repo), repo, run, rules: cleanRules(rules), createdAt: Date.now(), cloud: null, cloudPending: null, lastRunAt: null, lastStatus: null };
}
export const cleanRules = (rules): string[] => (Array.isArray(rules) ? rules : String(rules || "").split("\n")).map(r => clean(r).replace(/\s+/g, " ").trim().slice(0, 400)).filter(Boolean).slice(0, 12);

/* create jobs for an atom, one per repo; shows them at once */
export async function addJobs(d, repos: string[], run: string) {
  const have = new Set(jobsOf(d).map(j => j.repo)), made = [];
  for (const repo of repos.filter(r => REPO_RE.test(r) && !have.has(r)).slice(0, MAX_JOBS - have.size)) {
    const id = newId("job_"), body = jobBody(d.id, repo, run);
    await userDoc(id).set(body);
    if (!S.jobs.some(j => j.id === id)) S.jobs = [...S.jobs, { id, ...body }];
    made.push(id);
  }
  return made;
}
/* remove a job: its schedule first, then the job itself (its notes stay with the atom) */
export async function removeJob(j) {
  const d = S.dots.find(x => x.id === j.dotId); if (!d) return;
  if (cloudOn(j)) { const ok = await cloudAct("sleep", subOf(d, j)); if (!ok) { toast("Couldn't remove its schedule, so the job stays. Try again."); return; } }
  try { await userDoc(j.id).delete(); S.jobs = S.jobs.filter(x => x.id !== j.id); delete S.jobOpen[j.id]; toast(`${jobTitle(j)} removed`); }
  catch (e) { diag("db.job.delete", e); toast(`Couldn't remove it (${e?.code || "error"}).`); }
  renderAll();
}
export async function saveJobRules(j, text: string) {
  const rules = cleanRules(text);
  try { await userDoc(j.id).update({ rules }); upsertLocal(S.jobs, j.id, { rules }); toast("Saved"); }
  catch (e) { diag("db.job.rules", e); toast(`Couldn't save (${e?.code || "error"}).`); }
  renderAll();
}

/* Wake on an atom driven by jobs: run each scheduled job now, in the cloud (a page can't run a repo's command) */
export async function runJobs(d) {
  const jobs = jobsOf(d), live = jobs.filter(cloudOn);
  if (!live.length) { toast(jobs.length ? "Give its jobs a schedule first: they run in the cloud." : "It has no jobs yet. Add a repo on the Schedule tab."); S.tab = "schedule"; renderAll(); return; }
  let n = 0;
  for (const j of live) if (await cloudAct("fire", subOf(d, j), { quiet: true })) n++;
  toast(n ? `${d.name} is running ${n === 1 ? jobTitle(live[0]) : plural(n, "job")} in the cloud` : "Couldn't start it. Check the Schedule tab.");
}

/* ─── the Schedule tab of an atom driven by jobs ─── */
export function paintJobs(d, box) {
  const jobs = jobsOf(d), add = S.jobOpen["add:" + d.id];
  const head = `<div class="jobs-h"><h3>${esc(d.name)}'s jobs</h3><p class="note">Each job runs ${esc(d.jobs?.run || "its command")} in one repo, on its own schedule in the cloud. Its note lands in Chat; anything that needs your say comes to Asks first.</p></div>`;
  const cards = jobs.map(j => {
    const k = cssKey(j.id), more = S.jobOpen[j.id], rules = j.rules || [];
    return `<article class="jobcard" data-key="${esc(j.id)}">
      <div class="job-h"><b>${esc(j.run || d.jobs?.run || "")}</b><span>in</span><b>${esc(jobTitle(j))}</b><span class="mono">${esc(j.repo || "")}</span></div>
      <section class="card cloud-card" id="cloud-${k}"></section>
      <details class="job-more" ${more ? "open" : ""} data-job="${esc(j.id)}"><summary>${rules.length ? `Its own instructions · ${rules.length}` : "Add instructions for this job"}</summary>
        <label class="sr" for="jr-${k}">Instructions for this job, one per line</label>
        <textarea id="jr-${k}" data-jobrules="${esc(j.id)}" maxlength="4800" placeholder="Run /catchup as operator ammar&#10;Captures go to my Drive folder catchup/my-repo">${esc(S.edits["job:" + j.id] ?? rules.join("\n"))}</textarea>
        <span class="note">One per line. The job follows these along with the repo's own rules, every run.</span>
        <div class="row"><button class="btn sm" data-act="job-rules" data-job="${esc(j.id)}">Save</button><span class="grow"></span><button class="btn ghost sm danger" data-act="job-remove" data-job="${esc(j.id)}">Remove this job…</button></div>
        ${S.jobOpen["rm:" + j.id] ? `<div class="confirm" style="margin:0"><span>Remove ${esc(jobTitle(j))}${cloudOn(j) ? " and its schedule" : ""}? Its notes stay.</span><button class="btn danger sm" data-act="job-remove-yes" data-job="${esc(j.id)}">Remove</button><button class="btn ghost sm" data-act="job-remove-no" data-job="${esc(j.id)}">Keep it</button></div>` : ""}
      </details></article>`;
  }).join("");
  const empty = jobs.length ? "" : `<p class="calm">No jobs yet. Add a repo and ${esc(d.name)} runs ${esc(d.jobs?.run || "its command")} there.</p>`;
  const addBox = !add ? (jobs.length < MAX_JOBS ? `<div class="row"><button class="btn sm" data-act="job-add-open">${ICON.plus}Add a repo</button></div>` : "")
    : `<div class="card job-add"><label class="eyebrow" for="jb-repoq">Add a repo</label><input type="text" id="jb-repoq" data-jobq="1" value="${esc(S.jobOpen["q:" + d.id] || "")}" placeholder="Search your repos" autocomplete="off"><div class="repo-list" id="jb-rlist">${jobRepoList(d)}</div><div class="row"><button class="btn ghost sm" data-act="job-add-close">Done</button></div></div>`;
  const html = head + `<div class="jobs">${cards}</div>${empty}${addBox}`;
  // keep the cards (and what's being typed in them) when only their schedules change
  // (what's typed in the repo search isn't part of it: the list under it updates by itself)
  const opens = Object.entries(S.jobOpen).filter(([k]) => !k.startsWith("q:"));
  const sig = JSON.stringify([d.name, d.jobs, jobs.map(j => [j.id, j.title, j.repo, j.run, j.rules, cloudOn(j)]), opens, !!S.repos, S.reposErr]);
  if (box.dataset.sig !== sig) { box.innerHTML = html; box.dataset.sig = sig; }
  for (const j of jobs) paintCloudBox(subOf(d, j), $(`#cloud-${cssKey(j.id)}`));
}
export function jobRepoList(d) {
  if (!S.repos) { if (!S.reposLoading && !S.reposErr) setTimeout(() => loadRepos(), 0); return `<p class="note">${S.reposErr ? `Couldn't list your repos: ${esc(S.reposErr)}. <button type="button" class="link" data-act="repos-retry">Try again</button>` : "Loading your repos…"}</p>`; }
  const q = String(S.jobOpen["q:" + d.id] || "").toLowerCase(), have = new Set(jobsOf(d).map(j => j.repo));
  const rows = S.repos.filter(r => !have.has(r.name) && (!q || r.name.toLowerCase().includes(q))).slice(0, 8);
  return rows.length ? rows.map(r => `<button type="button" class="repo-opt" data-act="job-add" data-id="${esc(r.name)}"><b>${esc(r.name)}</b><small>${esc(r.visibility)}${r.pushedAt ? ` · pushed ${esc(ago(Date.parse(r.pushedAt)))}` : ""}</small></button>`).join("") : `<p class="note">${q ? "No repo matches that." : "Every repo has a job."}</p>`;
}

/* ─── decisions: a job's questions, shown as one short list per run ─── */
export const isDecision = a => a?.kind === "question" && typeof a.jobId === "string" && !!a.runId;
export const groupKey = a => a.jobId + ":" + a.runId;
export const groupOf = a => S.actions.filter(x => isDecision(x) && groupKey(x) === groupKey(a)).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0) || (x.id < y.id ? -1 : 1));
const SRC = { meeting: "Meeting", email: "Email", chat: "Chat", slack: "Slack", doc: "Doc", calendar: "Calendar", code: "Code", note: "Note" };
const saidYes = a => !!a.answer && a.answer.choice !== "no";
const yesWord = n => (n === 1 ? "one" : String(n));
const subFor = a => { const d = S.dots.find(x => x.id === a.dotId), j = S.jobs.find(x => x.id === a.jobId); return d && j ? subOf(d, j) : null; };
export function decisionsSig(grp) { const s = grp[0] ? subFor(grp[0]) : null; return JSON.stringify([grp.map(a => [a.id, a.state, a.title, a.why, a.answer?.text, !!S.busy[a.id]]), s ? firingFor(s) : false, Math.floor(Date.now() / 60000)]); }
export function decisionsHtml(grp, o: { inChat?: boolean } = {}) {
  const a0 = grp[0], d = S.dots.find(x => x.id === a0.dotId), j = S.jobs.find(x => x.id === a0.jobId);
  const open = grp.filter(a => a.state === "pending"), yes = grp.filter(saidYes).length;
  const head = clean(a0.question?.group || "").slice(0, 120) || "Needs your say";
  const who = o.inChat ? "" : `${d ? avatarHtml(d, { size: 18 }) : ""}<span>${esc(d?.name || "An atom")}</span><span>·</span>`;
  const s = subFor(a0), firing = s ? firingFor(s) : false, nm = esc(d?.name || "It");
  const foot = open.length
    ? (grp.length > 1 ? `${grp.length - open.length} of ${grp.length} answered. ` : "") + `When you've answered ${grp.length > 1 ? "them all" : "it"}, ${nm} carries on with what you said yes to. Nothing else happens.`
    : firing ? `All answered. ${nm} is working on the ${yesWord(yes)} you said yes to.` : yes ? `All answered. ${nm} carries on with the ${yesWord(yes)} you said yes to.` : "All answered. Nothing to do.";
  return `<article class="ask decide" data-key="grp:${esc(groupKey(a0))}" style="--h:${hueOf(d)}">
    <div class="from">${who}<span class="kind">${esc(j ? jobTitle(j) : "a job")}</span><span>· ${ago(a0.createdAt)}</span>${a0.source === "cloud" ? `<span class="cloud-tag">· from the cloud</span>` : ""}</div>
    <h4>${esc(head)}</h4>
    <ul class="dec-list">${grp.map(decisionRow).join("")}</ul>
    <p class="fine">${foot}</p></article>`;
}
function decisionRow(a) {
  const q = questionOf(a), id = esc(a.id), busy = !!S.busy[a.id], src = SRC[a.about?.source] || "";
  const label = `<span class="dec-src">${esc(src)}</span>`;
  if (a.state !== "pending") {
    const said = a.answer?.text || (a.state === "dismissed" ? "Not now" : "Done"), no = !!a.answer && !saidYes(a);
    return `<li class="dec done">${label}<span class="dec-t"><b>${esc(a.title)}</b></span><span class="dec-said ${no ? "no" : ""}">${no ? "–" : "✓"} ${esc(said)}</span></li>`;
  }
  const btns = q.choices.map((c, i) => `<button type="button" class="btn sm ${i === 0 ? "choice" : "ghost"}" data-act="answer" data-id="${id}" data-choice="${esc(c.id)}" ${busy ? "disabled" : ""}>${esc(c.label)}</button>`).join("");
  return `<li class="dec">${label}<span class="dec-t"><b>${esc(a.title)}</b>${a.why ? `<small>${esc(a.why)}</small>` : ""}</span><span class="dec-btns">${btns}</span></li>`;
}

/* every decision from a run is answered: start a filing run of that job, once */
export async function afterDecision(a) {
  const grp = groupOf(a); if (grp.some(x => x.state === "pending")) return;
  const d = S.dots.find(x => x.id === a.dotId), j = S.jobs.find(x => x.id === a.jobId); if (!d || !j) return;
  const yes = grp.filter(saidYes).length;
  if (!yes) { toast("All skipped. Nothing to do."); return; }
  if (j.filing?.runId === a.runId && Date.now() - (j.filing.at || 0) < 30 * 60e3) return; // started already, here or on another device
  if (!cloudOn(j) || !NS.mcp) { toast(`Saved. Give ${jobTitle(j)} a schedule so ${d.name} can carry on with ${yes === 1 ? "it" : "them"}.`, { label: "Schedule", fn: () => openDot(d.id, "schedule") }); return; }
  try { await userDoc(j.id).update({ filing: { runId: a.runId, at: Date.now() } }); upsertLocal(S.jobs, j.id, { filing: { runId: a.runId, at: Date.now() } }); } catch (e) { diag("db.job.filing", e); }
  const ok = await cloudAct("fire", subOf(d, j), { quiet: true, text: `Filing run. Act only on the owner's answers to this job's questions (job ${j.id}, run ${a.runId}, and any older answered ones not yet acted on). Do not start a new catch-up.` });
  toast(ok ? `${d.name} is carrying on with the ${yesWord(yes)} you said yes to` : `Couldn't start ${d.name}. Your answers are saved; it carries on at its next run.`);
}
export function firstOpenDecisionGroup() { const a = S.actions.find(x => x.state === "pending" && isDecision(x)); return a ? groupOf(a) : null; }
export const curJob = id => { const d = curDot(); return d ? S.jobs.find(j => j.id === id && j.dotId === d.id) || null : null; };
