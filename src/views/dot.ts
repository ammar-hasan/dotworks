import { normSources, shortOf } from "../core/apps";
import { reposLine } from "../features/repos";
import { ICON, SAMPLE_WHY, TIERS } from "../core/constants";
import { $, ago, dayLabel, esc, fmtTime, fmtWhen, handleOf, headlineOf, hueOf, md, plural, reconcile } from "../core/helpers";
import { NS, S, awake, cloudOn, curDot, jobDriven, isNarrow, jobsOf, pending, sendOK } from "../core/state";
import { askHtml, askSig } from "../features/asks";
import { decisionsHtml, decisionsSig, groupKey, groupOf, isDecision, jobTitle } from "../features/jobs";
import { receiptHtml } from "../features/receipts";
import { canListen, canSpeak } from "../features/voice";
import { appsMissingFor, cloudFiringFor, paintCloud } from "../features/cloud";
import { avatarHtml, isLead, lookOf, stateOf } from "../ui/characters";
import { markRead } from "../features/attention";
import { candidateMem } from "../features/memory";
import { paintKnow } from "./know";
import { dotStatus } from "../ui/shell";
import { builderHtml, draftFromDot, paintPeoplePicker } from "./builder";

/* ─── dot view ─── */
export function paintDot() {
  const d = curDot(); if (!d || !$("#dvName")) return;
  const live = S.running?.dotId === d.id, cloud = awake(d), [st, cl] = dotStatus(d), jobbed = jobDriven(d), jobs = jobsOf(d);
  const avh = avatarHtml(d, { size: isNarrow() ? 40 : 56, state: stateOf(d) });
  const avb = $("#dvAv"); if (avb.dataset.sig !== avh) { avb.innerHTML = avh; avb.dataset.sig = avh; }
  $("#dvName").textContent = d.name;
  const srcs = normSources(d.sources).map(shortOf).join(" + ") || "nothing yet";
  const rl = jobbed ? (jobs.length > 2 ? `${jobTitle(jobs[0])} +${jobs.length - 1}` : jobs.map(jobTitle).join(" + ")) : reposLine(d);
  // an atom with jobs besides its main job says how many
  const more = !jobbed && jobs.length ? `<span class="rd">+ ${plural(jobs.length, "job")}</span>` : "";
  const meta = `<span class="hd">${esc(handleOf(d))}</span><span class="${cl}">${esc(st)}</span><span class="rd">reads ${esc(srcs)}</span>${rl ? `<span class="rd">${jobbed ? "jobs" : "repos"} ${esc(rl)}</span>` : ""}${more}`;
  if ($("#dvMeta").innerHTML !== meta) $("#dvMeta").innerHTML = meta;
  // an atom driven by jobs runs them in the cloud; the others wake here with Claude
  const canRun = jobbed ? !!NS.mcp : !!NS.sample && !S.running && (S.perms as any).sample !== "denied";
  const runTitle = jobbed ? "Run its jobs now, in the cloud (W)" : NS.sample ? "Wake it now for its main job (W)" : "Waking needs Claude in this view";
  const act = `${live ? `<button class="btn" data-act="stop" aria-label="Stop">${ICON.stop}<span class="lbl">Stop</span></button>` : `<button class="btn pri" data-act="run" aria-label="${jobbed ? "Run now" : "Wake"}" ${canRun ? "" : "disabled"} title="${runTitle}">${ICON.bolt}<span class="lbl">${jobbed ? "Run now" : "Wake"}</span></button>`}
    <details class="menu" id="dvMenu"><summary class="icon-btn" aria-label="More">${ICON.more}</summary><div class="menu-list">
      ${NS.db && S.canShare !== false ? `<button data-act="share">Share as an element</button>` : ""}
      ${NS.downloads && S.runs[0]?.text ? `<button data-act="export" data-id="${esc(S.runs[0].id)}">Save latest note (.md)</button>` : ""}
      <button data-act="tab" data-id="settings">Change its look or job</button>
      ${jobbed ? `<button data-act="tab" data-id="schedule">Its jobs and schedules</button>` : ""}
      <button class="danger" data-act="delete-dot">Delete…</button></div></details>`;
  const actBox = $("#dvAct"), wasOpen = !!$("#dvMenu")?.open;
  if (actBox.dataset.sig !== act) { actBox.innerHTML = act; actBox.dataset.sig = act; if (wasOpen) $("#dvMenu").open = true; }
  $("#dvConfirm").innerHTML = S.confirmDel ? `<span>Delete ${esc(d.name)}, its notes${jobs.length ? `, its ${plural(jobs.length, "job")}` : ""}${cloud ? ` and ${jobs.length ? "their" : "its"} cloud schedule${jobs.filter(cloudOn).length > 1 ? "s" : ""}` : ""}${isLead(d) ? ", and everything it knows about you" : ""}?</span><button class="btn danger sm" data-act="confirm-del">Delete</button><button class="btn ghost sm" data-act="cancel-del">Keep it</button>` : "";
  // what waits in its chat (a super atom's "Is this right?" counts on its You tab instead)
  const asks = pending().filter(a => a.dotId === d.id && !a.memoryId).length;
  // the super atom has one more tab: what it knows about you, and your attention budget
  const lead = isLead(d), cands = lead ? candidateMem().length : 0;
  if (!lead && S.tab === "know") S.tab = "chat";
  const tabs = [["chat", "Chat", asks ? `<span class="count">${asks}</span>` : ""], ...(lead ? [["know", "You", cands ? `<span class="count" title="Waiting for your yes">${cands}</span>` : ""]] : []), ["activity", "Activity", ""], ["schedule", "Jobs", cloud ? (appsMissingFor(d) ? '<span class="count" title="Apps not attached">!</span>' : '<span class="cloud-tag">●</span>') : ""], ["settings", "Settings", ""]];
  const th = tabs.map(([k, l, extra]) => `<button role="tab" id="tab-${k}" data-tab="${k}" aria-controls="tp-${k}" aria-selected="${S.tab === k}" tabindex="${S.tab === k ? 0 : -1}">${l}${extra}</button>`).join("");
  if ($("#dvTabs").innerHTML !== th) $("#dvTabs").innerHTML = th;
  for (const k of ["chat", "know", "activity", "schedule", "settings"]) $("#tp-" + k).hidden = S.tab !== k;
  if (S.tab === "chat") { paintChat(); paintComposer(); if (S.runsLoaded) markRead(d); }
  else if (S.tab === "know") paintKnow();
  else if (S.tab === "activity") paintActivity();
  else if (S.tab === "schedule") paintCloud();
  else paintSettings();
}
export function threadHtml(steps) { return steps?.length ? `<ul class="thread">${steps.map(s => `<li><span class="node ${esc(s.state)}"></span><span>${esc(s.label)}</span></li>`).join("")}</ul>` : ""; }
export function statusCopy(r) {
  const m = { stopped: "Stopped before it finished.", truncated: "The note was cut short. Narrow the job and wake it again.", refused: "Claude declined this one. Reword the job." };
  return m[r.errorCode] || SAMPLE_WHY[r.errorCode] || m[r.status] || `It didn't finish${r.errorCode ? ` (${r.errorCode})` : ""}. Try waking it again.`;
}
export function noteBlock(r, d) {
  const tierNote = r.tierApplied && r.tierAsked && r.tierApplied !== r.tierAsked ? ` · ran on ${TIERS[r.tierApplied] || r.tierApplied}` : "";
  const steps = r.steps?.length ? `<details class="steps-sum"><summary>${plural(r.steps.length, "step")} · ${r.steps.filter(s => s.state === "ok").length} ok</summary>${threadHtml(r.steps)}</details>` : "";
  const status = r.status === "done" ? "" : `<p class="status ${r.status === "failed" ? "bad" : ""}">${esc(statusCopy(r))}</p>`;
  const acts = [
    canSpeak() && r.text ? `<button class="btn ghost sm" data-act="speak-note" data-id="${esc(r.id)}" aria-pressed="${S.speakingNote === r.id}">${ICON.voice}${S.speakingNote === r.id ? "Stop" : "Read aloud"}</button>` : "",
    sendOK() && r.text ? `<button class="btn ghost sm" data-act="ask-claude" data-id="${esc(r.id)}">Ask Claude about this</button>` : "",
    NS.downloads && r.text ? `<button class="btn ghost sm" data-act="export" data-id="${esc(r.id)}">Save .md</button>` : "",
    NS.comments && !S.commentsOff ? `<button class="btn ghost sm" data-act="comment">Comment</button>` : "",
  ].join("");
  // a note from one of its jobs says which one
  const job = r.jobId ? S.jobs.find(j => j.id === r.jobId) : null, jobTag = r.jobId ? `<span class="job-tag">${esc(job ? jobTitle(job) : "a job")}</span> · ` : "";
  return `<div class="msg dot" data-key="note:${esc(r.id)}" data-comment-target><span class="m-av">${avatarHtml(d, { size: 30 })}</span><div class="m-body"><div class="m-meta">${esc(d.name)} · ${jobTag}${esc(fmtTime(r.startedAt))} · ${r.source === "cloud" ? `<span class="cloud-tag">${r.jobId ? "ran in the cloud" : "woke in the cloud"}</span>` : r.jobId ? "ran here" : "woke here"}${esc(tierNote)}</div>${steps}${r.text ? `<div class="letter">${md(r.text)}</div>` : ""}${status}${acts ? `<div class="m-acts">${acts}</div>` : ""}</div></div>`;
}
export function paintChat() {
  const box = $("#msgs"), d = curDot(); if (!box || !d) return;
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 120 || !box.dataset.ready;
  const blocks = [];
  if (!S.runsLoaded) blocks.push({ key: "loading", html: `<div data-key="loading" class="col"><div class="skel" style="width:40%"></div><div class="skel" style="height:90px"></div></div>`, sig: "l" });
  const runs = S.runs.slice().reverse(), myActs = S.actions.filter(a => a.dotId === d.id);
  if (S.runsLoaded && !runs.length && !S.running) {
    const how = jobDriven(d) ? `My jobs are on the Jobs tab: give each a schedule and I'll run ${esc(d.jobs?.run || "them")} there in the cloud. Anything that needs your say comes to Asks first.` : "Tap Wake and I'll do it now, or just ask me something.";
    blocks.push({ key: "intro", sig: "i" + d.name + d.responsibility + hueOf(d) + JSON.stringify(lookOf(d)) + how, html: `<div class="msg dot" data-key="intro"><span class="m-av">${avatarHtml(d, { size: 30 })}</span><div class="m-body"><div class="m-meta">${esc(d.name)} · ${esc(handleOf(d))}</div><div class="intro-card">Hi, I'm ${esc(d.name)}. ${jobDriven(d) ? "What I do" : "My main job"}: ${esc(d.responsibility)} <br><br>${how}</div></div></div>` });
  }
  let lastDay = "";
  const shown = new Set<string>();
  for (const r of runs) {
    const dl = dayLabel(r.startedAt);
    if (dl !== lastDay) { lastDay = dl; blocks.push({ key: "day:" + dl, html: `<div class="daysep" data-key="day:${esc(dl)}">${esc(dl)}</div>`, sig: dl }); }
    if (r.kind !== "chat") { const html = noteBlock(r, d); blocks.push({ key: "note:" + r.id, html, sig: html.length + ":" + JSON.stringify([r.text, r.status, r.steps, sendOK(), !!NS.downloads, !!NS.comments && !S.commentsOff, hueOf(d), lookOf(d), d.name, S.speakingNote === r.id]) }); }
    const items = [
      ...(Array.isArray(r.thread) ? r.thread : []).map((t, i) => ({ at: t.at || 0, kind: "turn", t, i })),
      ...myActs.filter(a => a.runId === r.id).map(a => ({ at: a.createdAt || 0, kind: "ask", a })),
    ].sort((x, y) => x.at - y.at);
    for (const it of items) {
      if (it.kind === "turn") { if (it.t.kind !== "answer") blocks.push(turnBlock(it.t, `t:${r.id}:${it.i}`, d)); }
      else if (isDecision(it.a)) { if (!shown.has(it.a.id)) blocks.push(decisionBlock(it.a, shown)); }
      else { shown.add(it.a.id); blocks.push(askBlock(it.a)); }
    }
  }
  for (const a of myActs.filter(a => (a.state === "pending" || a.state === "held") && !shown.has(a.id)).reverse()) blocks.push(isDecision(a) ? decisionBlock(a, shown) : askBlock(a));
  if (S.running?.dotId === d.id) {
    const lv = S.running, lj = lv.jobId ? S.jobs.find(j => j.id === lv.jobId) : null;
    blocks.push({ key: "live", sig: JSON.stringify([lv.steps, lv.text, lv.jobId]), html: `<div class="msg dot" data-key="live"><span class="m-av">${avatarHtml(d, { size: 30, state: stateOf(d) })}</span><div class="m-body"><div class="m-meta">${esc(d.name)} · ${lv.jobId ? `<span class="job-tag">${esc(lj ? jobTitle(lj) : "a job")}</span> · running now` : "awake now"}</div>${threadHtml(lv.steps)}${lv.text ? `<div class="letter">${md(lv.text)}</div>` : `<div class="typing"><i></i><i></i><i></i><span>${lv.steps.length ? "putting the note together" : "waking up — the first time, Claude asks you to allow it and the apps it reads"}</span></div>`}</div></div>` });
  } else if (cloudFiringFor(d)) {
    blocks.push({ key: "firing", sig: "f", html: `<div class="msg dot" data-key="firing"><span class="m-av">${avatarHtml(d, { size: 30, state: "live cloud" })}</span><div class="m-body"><div class="typing"><i></i><i></i><i></i><span>waking in the cloud — its note lands here in a few minutes</span></div></div></div>` });
  }
  if (S.chat && S.chat.dotId === d.id) {
    const c = S.chat;
    blocks.push({ key: "cu", sig: c.user.text, html: `<div class="msg you" data-key="cu"><div class="bubble">${esc(c.user.text)}</div>${c.user.image ? `<span class="img-tag">image · ${esc(c.user.image)}</span>` : ""}</div>` });
    blocks.push({ key: "cd", sig: JSON.stringify([c.steps, c.text]), html: `<div class="msg dot" data-key="cd"><span class="m-av">${avatarHtml(d, { size: 30, state: stateOf(d) })}</span><div class="m-body">${threadHtml(c.steps)}${c.text ? `<div class="letter sm">${md(c.text)}</div>` : `<div class="typing"><i></i><i></i><i></i></div>`}</div></div>` });
  }
  reconcile(box, blocks);
  box.dataset.ready = "1";
  if (stick) box.scrollTop = box.scrollHeight;
}
export function turnBlock(t, key, d) {
  const html = t.role === "dot"
    ? `<div class="msg dot" data-key="${esc(key)}"><span class="m-av">${avatarHtml(d, { size: 30 })}</span><div class="m-body">${t.steps?.length ? threadHtml(t.steps) : ""}<div class="letter sm">${md(t.text)}</div><span class="when">${esc(fmtTime(t.at))}</span></div></div>`
    : `<div class="msg you" data-key="${esc(key)}"><div class="bubble">${esc(t.text)}</div>${t.image ? `<span class="img-tag">image · ${esc(t.image)}</span>` : ""}<span class="when">${esc(fmtTime(t.at))}</span></div>`;
  return { key, html, sig: html };
}
// a job's decisions from one run: one short list, answered rows included
export function decisionBlock(a, shown: Set<string>) {
  const grp = groupOf(a); for (const x of grp) shown.add(x.id);
  return { key: "grp:" + groupKey(a), sig: decisionsSig(grp), html: `<div class="msg ask-row" data-key="grp:${esc(groupKey(a))}"><span class="m-av"></span><div class="m-body">${decisionsHtml(grp, { inChat: true })}</div></div>` };
}
export function askBlock(a) {
  // a held-back ask shows in full here too, marked held back: you can act on it any time
  if (a.state === "pending" || a.state === "held") return { key: "ask:" + a.id, sig: askSig(a), html: `<div class="msg ask-row" data-key="ask:${esc(a.id)}"><span class="m-av"></span><div class="m-body">${askHtml(a, { inChat: true })}</div></div>` };
  const ok = a.state === "done" || a.state === "handed_off";
  // an answered question reads as the question and your answer; the dot's reply follows in the thread
  if (a.kind === "question" && a.state === "done" && a.answer?.text) {
    const html = `<div class="msg ask-row" data-key="ask:${esc(a.id)}"><span class="m-av"></span><div class="m-body"><div class="done-line q-done"><span class="tick">?</span><span>${esc(a.title)}</span><b class="q-ans">${esc(a.answer.text)}</b></div></div></div>`;
    return { key: "ask:" + a.id, sig: html, html };
  }
  const label = a.result?.label || (a.state === "handed_off" ? "Handed to Claude" : a.state === "dismissed" ? "Not now" : "Done");
  const html = `<div class="msg ask-row" data-key="ask:${esc(a.id)}"><span class="m-av"></span><div class="m-body"><div class="done-line${a.result?.undone ? " undone-row" : ""}"><span class="tick">${ok ? "✓" : "–"}</span><span class="dl-t"><span class="dl-l">${esc(label)} · ${esc(a.title)}</span>${receiptHtml(a)}</span>${a.result?.url ? `<a href="${esc(a.result.url)}" target="_blank" rel="noopener">open</a>` : a.state === "dismissed" ? `<button class="mini" data-act="undismiss" data-id="${esc(a.id)}">bring back</button>` : ""}</div></div></div>`;
  return { key: "ask:" + a.id, sig: html, html };
}
export function paintComposer() {
  const f = $("#composer"), d = curDot(); if (!f || !d) return;
  const busy = !!(S.chat && S.chat.dotId === d.id), ta = $("#reply"), live = S.running?.dotId === d.id;
  const can = !!NS.sample && (S.perms as any).sample !== "denied";
  const mic = can && canListen();
  ta.placeholder = !can ? (NS.sample ? "Allow Claude on this page to talk to your atoms" : "Open this page inside Claude to talk to your atoms")
    : S.listening ? "Listening…" : S.voiceOn && !mic ? `Talk with your keyboard's mic; it sends when you pause` : `Message ${handleOf(d)}…`;
  ta.disabled = busy || !can || live || !S.runsLoaded;
  const send = $("#replySend");
  if (busy) { send.dataset.act = "chat-stop"; send.type = "button"; send.innerHTML = ICON.stop; send.setAttribute("aria-label", "Stop"); }
  else { delete send.dataset.act; send.type = "submit"; send.innerHTML = ICON.send; send.setAttribute("aria-label", "Send"); }
  send.disabled = !busy && (!can || live || !S.runsLoaded);
  $("#attachLbl").hidden = !S.imagesOK || !can;
  const micBtn = $("#micBtn");
  if (micBtn) { micBtn.hidden = !mic; micBtn.setAttribute("aria-pressed", String(!!S.listening)); micBtn.disabled = busy || live || !S.runsLoaded; micBtn.setAttribute("aria-label", S.listening ? "Stop listening" : "Talk"); }
  const src = normSources(d.sources), q = S.runs[0]?.text ? ["What should I do first?", "What should I do first?"]
    : src.includes("Google Calendar") ? ["What's on tomorrow?", "What's on my calendar tomorrow?"]
    : src.includes("Gmail") ? ["Anything urgent?", "Is anything urgent in my inbox?"] : null;
  const voiceChip = can && canSpeak() ? `<button type="button" class="chip voice-chip" data-act="voice-toggle" aria-pressed="${!!S.voiceOn}" title="${S.voiceOn ? "Voice on: replies are read aloud" : "Turn on voice: replies are read aloud"}">${ICON.voice}Voice${S.voiceOn ? " on" : ""}</button>` : "";
  const chips = live ? `<button type="button" class="chip" data-act="stop">${ICON.stop}Stop waking</button>`
    : can && !busy ? `<button type="button" class="chip" data-act="run" ${S.running || (jobDriven(d) && !NS.mcp) ? "disabled" : ""}>${ICON.bolt}${jobDriven(d) ? "Run its jobs" : "Wake now"}</button>${q && S.runsLoaded ? `<button type="button" class="chip" data-act="suggest" data-id="${esc(q[1])}">${esc(q[0])}</button>` : ""}${voiceChip}` : voiceChip;
  const cb = $("#cmpChips"); if (cb.innerHTML !== chips) cb.innerHTML = chips;
  const att = $("#replyAtt");
  if (S.replyImage) {
    if (att.dataset.name !== S.replyImage.name) { att.dataset.name = S.replyImage.name; let src = ""; try { src = URL.createObjectURL(S.replyImage); } catch { src = ""; } att.innerHTML = `<span class="att">${src ? `<img alt="" src="${src}">` : ""}<span>${esc(S.replyImage.name)}</span><button type="button" data-act="drop-img" aria-label="Remove image">×</button></span>`; }
  } else { att.innerHTML = ""; att.dataset.name = ""; }
}
export function paintActivity() {
  const box = $("#activity"), d = curDot(); if (!box || !d) return;
  if (!S.runsLoaded) { box.innerHTML = '<div class="skel" style="height:60px"></div>'; return; }
  if (!S.runs.length) { box.innerHTML = `<p class="calm">Nothing yet. Every time ${esc(d.name)} wakes, here or in the cloud, it shows up here with what it looked at.</p>`; return; }
  const open = new Set([...box.querySelectorAll("details.act-row[open]")].map(x => x.dataset.id));
  box.innerHTML = S.runs.map(r => {
    const asks = S.actions.filter(a => a.runId === r.id).length, replies = (r.thread || []).filter(t => t.role !== "dot").length;
    const head = r.kind === "chat" ? "Conversation" : headlineOf(r.text) || statusCopy(r);
    return `<details class="act-row" data-id="${esc(r.id)}" ${open.has(r.id) ? "open" : ""}><summary><span class="sd ${r.status === "done" ? "ok" : r.status === "failed" ? "bad" : ""}"></span><span class="t"><b>${esc(head.slice(0, 140))}</b><small>${esc(fmtWhen(r.startedAt))} · ${r.source === "cloud" ? "cloud" : "here"} · ${plural((r.steps || []).length, "step")}${asks ? ` · ${plural(asks, "ask")}` : ""}${replies ? ` · ${plural(replies, "reply", "replies")}` : ""}</small></span><span class="note mono">${ago(r.startedAt)}</span></summary><div class="inner">${threadHtml(r.steps)}${r.text ? `<div class="letter">${md(r.text)}</div>` : ""}</div></details>`;
  }).join("");
}
export function paintSettings() {
  const box = $("#settings"), d = curDot(); if (!box || !d) return;
  if (!S.editDraft || S.editDraft.id !== d.id) S.editDraft = draftFromDot(d);
  const key = d.id + ":" + (S.editDraft.rev || 0);
  if (S.settingsKey === key) return;
  S.settingsKey = key;
  box.innerHTML = builderHtml(S.editDraft, "edit") + `<section class="card"><span class="eyebrow">Share or remove</span><div class="row">${NS.db && S.canShare !== false ? `<button class="btn sm" data-act="share">Share as an element</button>` : ""}<button class="btn ghost sm danger" data-act="delete-dot">Delete ${esc(d.name)}…</button></div></section>`;
  paintPeoplePicker("edit");
}
