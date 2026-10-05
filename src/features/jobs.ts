import { ICON } from "../core/constants";
import { diag } from "../core/diag";
import { $, ago, clean, cssKey, esc, hueOf, newId, plural, toast, upsertLocal } from "../core/helpers";
import { NS, S, cloudOn, curDot, jobDriven, jobsOf, upsertDocLocal, userDoc } from "../core/state";
import { avatarHtml } from "../ui/characters";
import { openDot } from "../ui/nav";
import { renderAll } from "../ui/shell";
import { REPO_RE, loadRepos, repoShort } from "./repos";
import { cloudAct, firingFor, paintCloudBox, subOf } from "./cloud";
import { questionOf } from "./questions";

/* ─── jobs ───
   A job is one more thing an atom does, on its own schedule in the cloud. Any atom can have jobs. A job is either
   - a command in one of your repos (like /catchup in course-materials), run under the repo's own rules, or
   - a task in plain words (like "every Monday, plan my week"), done the way the atom's own wake works.
   Each job has its own scheduled task, notes and asks. An atom marked with `jobs` ({run}) is driven by its jobs only
   (Ketchup): it has no schedule of its own, and a new job runs that command unless you say otherwise.
   Stored as their own documents: data/users/<you>/<jobId> {type: "job", dotId, title, repo?, run?, task?, rules, cloud, …}.

   A job never waits for you in the middle of a run: whatever needs your say becomes a question in Asks. Simple
   choices ("decisions") show as one short list per run. When you've answered all of a run's questions, this page
   starts a short follow-up run of that job, which carries on with what you said (config/runbook.md, JOBS). */

export const RUN_RE = /^\/[A-Za-z][\w:.-]{0,40}$/;
export const jobSpecOf = x => (x && typeof x === "object" && RUN_RE.test(String(x.run || "")) ? { run: String(x.run) } : null);
export const MAX_JOBS = 8;
export const isCommandJob = j => !!(j?.repo && j?.run);
export const cleanTask = t => clean(t || "").replace(/\s+/g, " ").trim().slice(0, 900);
const titleFromTask = t => cleanTask(t).split(/[.:;!?]/)[0].split(" ").slice(0, 5).join(" ").slice(0, 40);
export const jobTitle = j => clean(j?.title || "") || repoShort(j?.repo || "") || titleFromTask(j?.task) || "job";
// one line saying what a job does ("/catchup in course-materials", "Week plan: every Monday, …")
export const jobLine = j => (isCommandJob(j) ? `${clean(j.run)} in ${repoShort(j.repo)}` : `${jobTitle(j)}: ${cleanTask(j.task).slice(0, 120)}`);
export const cleanRules = (rules): string[] => (Array.isArray(rules) ? rules : String(rules || "").split("\n")).map(r => clean(r).replace(/\s+/g, " ").trim().slice(0, 400)).filter(Boolean).slice(0, 12);
const base = (dotId: string) => ({ type: "job", dotId, rules: [] as string[], createdAt: Date.now(), cloud: null, cloudPending: null, lastRunAt: null, lastStatus: null });
export const commandJob = (dotId: string, repo: string, run: string, rules: string[] = []) => ({ ...base(dotId), title: repoShort(repo), repo, run, task: null, rules: cleanRules(rules) });
export const taskJob = (dotId: string, task: string, title = "", rules: string[] = []) => ({ ...base(dotId), title: clean(title).replace(/\s+/g, " ").trim().slice(0, 40) || titleFromTask(task), repo: null, run: null, task: cleanTask(task), rules: cleanRules(rules) });

/* add a job to an atom; it shows at once */
export async function addJob(d, body) {
  if (jobsOf(d).length >= MAX_JOBS) throw { code: "local", message: `An atom can have ${MAX_JOBS} jobs.` };
  const id = newId("job_");
  await userDoc(id).set(body);
  if (!S.jobs.some(j => j.id === id)) S.jobs = [...S.jobs, { id, ...body }];
  return id;
}
/* one job per repo, all running the same command (an atom made from a template with a job) */
export async function addJobs(d, repos: string[], run: string) {
  const have = new Set(jobsOf(d).filter(j => j.run === run).map(j => j.repo)), made = [];
  for (const repo of repos.filter(r => REPO_RE.test(r) && !have.has(r))) {
    if (jobsOf(d).length >= MAX_JOBS) break;
    made.push(await addJob(d, commandJob(d.id, repo, run)));
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
/* save what a job does (a plain-words job's task) and its own instructions */
export async function saveJob(j, o: { task?: string; rules: string }) {
  const fields: Record<string, any> = { rules: cleanRules(o.rules) };
  if (!isCommandJob(j) && o.task !== undefined) {
    const task = cleanTask(o.task); if (task.length < 8) { toast("Say what the job should do, in a sentence or two."); return false; }
    fields.task = task;
  }
  try { await userDoc(j.id).update(fields); upsertLocal(S.jobs, j.id, fields); toast("Saved"); renderAll(); return true; }
  catch (e) { diag("db.job.save", e); toast(`Couldn't save (${e?.code || "error"}).`); renderAll(); return false; }
}

/* An atom's main job (internally its "check-ins") on or off. Off stops its own schedule first; its jobs carry on either way.
   Stored as `jobs`: an object while check-ins are off (keeping the command a template gave it), null while on. */
export async function setCheckins(d, on: boolean) {
  const k = "ci:" + d.id; if (S.busy[k]) return;
  S.busy[k] = true; renderAll();
  try {
    if (!on && (cloudOn(d) || d.cloudPending) && !(await cloudAct("sleep", subOf(d), { quiet: true })) && cloudOn(S.dots.find(x => x.id === d.id))) { toast(`Couldn't stop ${d.name}'s schedule, so its main job stays on. Try again.`); return; }
    const fields = { jobs: on ? null : { run: d.jobs?.run || null }, cloudPending: null };
    await userDoc(d.id).update(fields); upsertDocLocal(d.id, fields);
    toast(on ? `Main job on. ${d.name} wakes for it again.` : `Main job off. ${d.name} only does its other jobs now.`);
  } catch (e) { diag("db.checkins", e); toast(`Couldn't change it (${e?.code || "error"}).`); }
  finally { delete S.busy[k]; renderAll(); }
}

/* Run now on an atom driven by jobs: run each scheduled job now, in the cloud (a page can't run a repo's command) */
export async function runJobs(d) {
  const jobs = jobsOf(d), live = jobs.filter(cloudOn);
  if (!live.length) { toast(jobs.length ? "Give its jobs a schedule first: they run in the cloud." : "It has no jobs yet. Add one on the Jobs tab."); S.tab = "schedule"; renderAll(); return; }
  let n = 0;
  for (const j of live) if (await cloudAct("fire", subOf(d, j), { quiet: true })) n++;
  toast(n ? `${d.name} is running ${n === 1 ? jobTitle(live[0]) : plural(n, "job")} in the cloud` : "Couldn't start it. Check the Jobs tab.");
}

/* ─── an atom's other jobs, on its Jobs tab (its main job is the first card, above them: cloud.ts) ─── */
export function paintJobs(d, box) {
  const jobs = jobsOf(d), driven = jobDriven(d), add = S.jobOpen["add:" + d.id];
  // its main job sits above, as the first card (cloud.ts); these are the others, each on its own schedule
  const empty = driven && !jobs.length ? `<p class="calm">No jobs yet. Add one and ${esc(d.name)} runs it on its own schedule.</p>` : "";
  const teaser = !driven && !jobs.length ? `<p class="note">Give ${esc(d.name)} another job on its own schedule: a command in one of your repos, or something in plain words.</p>` : "";
  const addBox = add ? addFormHtml(d) : jobs.length < MAX_JOBS ? `${teaser}<div class="row"><button class="btn sm" data-act="job-add-open">${ICON.plus}Add a job</button></div>` : "";
  const html = `<div class="jobs">${jobs.map(j => jobCardHtml(d, j)).join("")}</div>${empty}${addBox}`;
  // repaint only when something structural changes, never because of what's being typed
  const f = S.jobDraft[d.id], opens = Object.entries(S.jobOpen).filter(([k]) => !/^(q|ci|main):/.test(k));
  const sig = JSON.stringify([d.name, d.jobs, jobs.map(j => [j.id, j.title, j.repo, j.run, j.task, j.rules, cloudOn(j)]), opens, add ? [f?.kind, f?.repo] : 0, !!S.repos, S.reposErr, S.errs["jobadd:" + d.id] || ""]);
  if (box.dataset.sig !== sig) { box.innerHTML = html; box.dataset.sig = sig; }
  for (const j of jobs) paintCloudBox(subOf(d, j), $(`#cloud-${cssKey(j.id)}`));
}
function jobCardHtml(d, j) {
  const k = cssKey(j.id), id = esc(j.id), more = S.jobOpen[j.id], rules = j.rules || [], cmd = isCommandJob(j);
  const head = cmd ? `<div class="job-h"><b class="cmd">${esc(j.run)}</b><span>in</span><b>${esc(jobTitle(j))}</b><span class="mono">${esc(j.repo)}</span></div>`
    : `<div class="job-h"><b>${esc(jobTitle(j))}</b></div><p class="job-task">${esc(j.task || "")}</p>`;
  const taskEdit = cmd ? "" : `<label class="eyebrow" for="jt-${k}">What it does</label><textarea id="jt-${k}" data-jobtask="${id}" maxlength="900">${esc(S.edits["jobtask:" + j.id] ?? j.task ?? "")}</textarea>`;
  return `<article class="jobcard" data-key="${id}">${head}
    <section class="card cloud-card" id="cloud-${k}"></section>
    <details class="job-more" ${more ? "open" : ""} data-job="${id}"><summary>${cmd ? (rules.length ? `Its own instructions · ${rules.length}` : "Add instructions for this job") : "Change this job"}</summary>
      ${taskEdit}
      <label class="eyebrow" for="jr-${k}">${cmd ? "Its own instructions" : "Its own instructions · optional"}</label>
      <textarea id="jr-${k}" data-jobrules="${id}" maxlength="4800" placeholder="${cmd ? "Run it as operator ammar&#10;Captures go to my Drive folder catchup/my-repo" : "Skip anything that's already on my calendar"}">${esc(S.edits["job:" + j.id] ?? rules.join("\n"))}</textarea>
      <span class="note">One per line. ${cmd ? "The job follows these along with the repo's own rules" : `The job follows these along with ${esc(d.name)}'s own rules`}, every run.</span>
      <div class="row"><button class="btn sm" data-act="job-save" data-job="${id}">Save</button><span class="grow"></span><button class="btn ghost sm danger" data-act="job-remove" data-job="${id}">Remove this job…</button></div>
      ${S.jobOpen["rm:" + j.id] ? `<div class="confirm" style="margin:0"><span>Remove ${esc(jobTitle(j))}${cloudOn(j) ? " and its schedule" : ""}? Its notes stay.</span><button class="btn danger sm" data-act="job-remove-yes" data-job="${id}">Remove</button><button class="btn ghost sm" data-act="job-remove-no" data-job="${id}">Keep it</button></div>` : ""}
    </details></article>`;
}

/* ─── Add a job ─── */
export function jobDraft(d) {
  if (!S.jobDraft[d.id]) S.jobDraft[d.id] = jobDriven(d) && d.jobs.run ? { kind: "command", run: d.jobs.run, repo: null, task: "", title: "", q: "" } : { kind: "task", run: "", repo: null, task: "", title: "", q: "" };
  return S.jobDraft[d.id];
}
function addFormHtml(d) {
  const f = jobDraft(d), err = S.errs["jobadd:" + d.id];
  const chip = (v, l) => `<button type="button" class="chip" data-act="job-kind" data-id="${v}" aria-pressed="${f.kind === v}">${l}</button>`;
  const body = f.kind === "command"
    ? `<span class="eyebrow">Repo</span>${f.repo ? `<div class="people"><span class="person repo-chip"><span>${esc(f.repo)}</span><button type="button" data-act="job-unpick-repo" aria-label="Pick another repo">×</button></span></div>`
        : `<input type="text" id="jb-repoq" data-jobq="1" value="${esc(f.q || "")}" placeholder="Search your repos" autocomplete="off"><div class="repo-list" id="jb-rlist">${jobRepoList(d)}</div>`}
      <label class="eyebrow" for="jb-run">Command</label><input type="text" id="jb-run" data-jobf="run" value="${esc(f.run || "")}" placeholder="/catchup" autocomplete="off" spellcheck="false">
      <span class="note">It runs this command in the repo, in the cloud, under the repo's own rules. Anything that needs your say comes to Asks first.</span>`
    : `<label class="eyebrow" for="jb-task">What should it do?</label><textarea id="jb-task" data-jobf="task" maxlength="900" placeholder="Every Monday, look at my week and tell me which days are overloaded.">${esc(f.task || "")}</textarea>
      <label class="eyebrow" for="jb-title">Name · optional</label><input type="text" id="jb-title" data-jobf="title" maxlength="40" value="${esc(f.title || "")}" placeholder="Week plan">
      <span class="note">It does this with ${esc(d.name)}'s apps${(d.sources || []).length ? "" : " (it has none yet)"}, on its own schedule, and leaves its note in Chat.</span>`;
  return `<div class="card job-add"><h3>Add a job</h3><div class="chips">${chip("task", "Something in plain words")}${chip("command", "A command in a repo")}</div>${body}
    ${err ? `<p class="err">${esc(err)}</p>` : ""}
    <div class="row"><button class="btn pri sm" data-act="job-add-save">Add job</button><button class="btn ghost sm" data-act="job-add-close">Cancel</button></div></div>`;
}
export function jobRepoList(d) {
  if (!S.repos) { if (!S.reposLoading && !S.reposErr) setTimeout(() => loadRepos(), 0); return `<p class="note">${S.reposErr ? `Couldn't list your repos: ${esc(S.reposErr)}. <button type="button" class="link" data-act="repos-retry">Try again</button>` : "Loading your repos…"}</p>`; }
  const f = jobDraft(d), q = String(f.q || "").toLowerCase(), run = String(f.run || "").trim();
  // a repo that already runs this command has its job
  const have = new Set(jobsOf(d).filter(j => run && j.run === run).map(j => j.repo));
  const rows = S.repos.filter(r => !have.has(r.name) && (!q || r.name.toLowerCase().includes(q))).slice(0, 8);
  return rows.length ? rows.map(r => `<button type="button" class="repo-opt" data-act="job-pick-repo" data-id="${esc(r.name)}"><b>${esc(r.name)}</b><small>${esc(r.visibility)}${r.pushedAt ? ` · pushed ${esc(ago(Date.parse(r.pushedAt)))}` : ""}</small></button>`).join("") : `<p class="note">${q ? "No repo matches that." : "Every repo has this job already."}</p>`;
}
export async function saveNewJob(d) {
  const f = jobDraft(d), ek = "jobadd:" + d.id; delete S.errs[ek];
  let body;
  if (f.kind === "command") {
    const run = String(f.run || "").trim();
    if (!f.repo || !REPO_RE.test(f.repo)) S.errs[ek] = "Pick the repo it works in.";
    else if (!RUN_RE.test(run)) S.errs[ek] = "Write the command the way you'd type it in Claude Code, like /catchup.";
    else if (jobsOf(d).some(j => j.repo === f.repo && j.run === run)) S.errs[ek] = `${repoShort(f.repo)} already has a ${run} job.`;
    else body = commandJob(d.id, f.repo, run);
  } else {
    const task = cleanTask(f.task);
    if (task.length < 8) S.errs[ek] = "Say what the job should do, in a sentence or two.";
    else body = taskJob(d.id, task, f.title);
  }
  if (!body) { renderAll(); return; }
  try {
    await addJob(d, body);
    delete S.jobOpen["add:" + d.id]; delete S.jobDraft[d.id];
    toast(`${body.title} added. Give it a schedule below.`);
  } catch (e) { if (e?.code !== "local") diag("db.job.add", e); S.errs[ek] = e?.code === "local" ? e.message : `Couldn't add it (${e?.code || "error"}).`; }
  renderAll();
}

/* ─── a job's questions ───
   Yes-or-no questions ("decisions": a "yes" choice, at most three choices, no free text) show as one short list per
   run; others (a plain-words job's "which day?") show as ordinary question cards. Either way the job carries on with
   your answers in the cloud, once a run's are all in. */
export const isJobQuestion = a => a?.kind === "question" && typeof a.jobId === "string" && !!a.runId;
export const isDecision = a => { if (!isJobQuestion(a) || a.question?.allowText) return false; const cs = questionOf(a).choices; return cs.length <= 3 && cs.some(c => c.id === "yes"); };
export const groupKey = a => a.jobId + ":" + a.runId;
const runQuestions = a => S.actions.filter(x => isJobQuestion(x) && groupKey(x) === groupKey(a));
export const groupOf = a => runQuestions(a).filter(isDecision).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0) || (x.id < y.id ? -1 : 1));
const SRC = { meeting: "Meeting", email: "Email", chat: "Chat", slack: "Slack", doc: "Doc", calendar: "Calendar", code: "Code", note: "Note" };
const saidYes = a => !!a.answer && a.answer.choice !== "no";
const yesWord = n => (n === 1 ? "one" : String(n));
const subFor = a => { const d = S.dots.find(x => x.id === a.dotId), j = S.jobs.find(x => x.id === a.jobId); return d && j ? subOf(d, j) : null; };
export function decisionsSig(grp) { const s = grp[0] ? subFor(grp[0]) : null; return JSON.stringify([grp.map(a => [a.id, a.state, a.title, a.why, a.answer?.text, !!S.busy[a.id]]), s ? firingFor(s) : false, Math.floor(Date.now() / 60000)]); }
export function decisionsHtml(grp, o: { inChat?: boolean } = {}) {
  const a0 = grp[0], d = S.dots.find(x => x.id === a0.dotId), j = S.jobs.find(x => x.id === a0.jobId);
  const open = grp.filter(a => a.state === "pending"), yes = grp.filter(saidYes).length;
  const head = clean(a0.question?.group || "").slice(0, 120) || (grp.length > 1 ? "Needs your say" : clean(a0.title));
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

/* every question from a job's run is answered: start a short follow-up run of that job, once */
export async function afterJobAnswer(a) {
  const qs = runQuestions(a); if (qs.some(x => x.state === "pending")) return;
  const d = S.dots.find(x => x.id === a.dotId), j = S.jobs.find(x => x.id === a.jobId); if (!d || !j) return;
  const yes = qs.filter(saidYes).length, decisions = qs.every(isDecision);
  if (!yes) { toast("All skipped. Nothing to do."); return; }
  if (j.filing?.runId === a.runId && Date.now() - (j.filing.at || 0) < 30 * 60e3) return; // started already, here or on another device
  const what = decisions ? `the ${yesWord(yes)} you said yes to` : qs.length > 1 ? "your answers" : "your answer";
  if (!cloudOn(j) || !NS.mcp) { toast(`Saved. Give ${jobTitle(j)} a schedule so ${d.name} can carry on with ${what}.`, { label: "Schedule", fn: () => openDot(d.id, "schedule") }); return; }
  const mark = { filing: { runId: a.runId, at: Date.now() } };
  try { await userDoc(j.id).update(mark); upsertLocal(S.jobs, j.id, mark); } catch (e) { diag("db.job.followup", e); }
  const ok = await cloudAct("fire", subOf(d, j), { quiet: true, text: `Follow-up run. Act only on the owner's answers to this job's questions (job ${j.id}, run ${a.runId}, and any older answered ones not yet acted on). Do not start a new run of the job.` });
  toast(ok ? `${d.name} is carrying on with ${what}` : `Couldn't start ${d.name}. Your answers are saved; it carries on at its next run.`);
}
export const curJob = id => { const d = curDot(); return d ? S.jobs.find(j => j.id === id && j.dotId === d.id) || null : null; };
