import { REPO_RE, loadRepos } from "../features/repos";
import { digest } from "../ai/digest";
import { runDot, runDue, sendReply } from "../ai/flow";
import { readPerms } from "../core/boot";
import { KINDS, SRV, VERSION } from "../core/constants";
import { diag } from "../core/diag";
import { $, autosize, clean, cssKey, fitBytes, fmtTime, fmtWhen, handleOf, slug, toast } from "../core/helpers";
import { refreshCanSend } from "../core/room";
import { NS, S, curDot, userDoc } from "../core/state";
import { answerQuestion, execute, setActionState, undoAction } from "../features/asks";
import { deliver, newDotFrom, paintTell, tellDots } from "../features/tell";
import { cloudAct, cloudCreate, cloudFind, cloudPlan, loadTriggers, paintCloud } from "../features/cloud";
import { deleteDot } from "../features/delete";
import { allow, closeAcct, renderAcct } from "./account";
import { lookOf } from "./characters";
import { cycle, go, openDot } from "./nav";
import { renderAll } from "./shell";
import { paintApps, toggleApp } from "../views/apps";
import { closeSheet, draftOf, draftWithClaude, openNew, paintPeoplePicker, paintRepoField, prefixOf, refreshLook, repoListHtml, saveBuilder, searchPeople } from "../views/builder";
import { paintComposer } from "../views/dot";
import { renderField } from "../views/home";
import { renderHorizon, startDay, watchDay } from "../views/horizon";
import { plant, seedByKey, shareSeed, unshare } from "../views/seeds";

/* ═════════ events ═════════ */
document.addEventListener("click", ev => {
  const pop = $("#acctPop");
  if (S.acctOpen && !pop.contains(ev.target) && !(ev.target as any).closest('[data-act="acct"]')) closeAcct();
  const menu = $("#dvMenu"); if (menu?.open && !menu.contains(ev.target)) menu.open = false;
  if ((ev.target as any).id === "scrim") { closeSheet(); return; }
  const nav = (ev.target as any).closest("[data-nav]"); if (nav) { go(nav.dataset.nav); return; }
  const tab = (ev.target as any).closest("[data-tab]"); if (tab) { S.tab = tab.dataset.tab; renderAll(); return; }
  const b = (ev.target as any).closest("[data-act]"); if (!b || b.disabled) return;
  const id = b.dataset.id, act = b.dataset.act, d = curDot();
  switch (act) {
    case "open-dot": openDot(id); break;
    case "new": openNew(null); break;
    case "plant": plant(id); break;
    case "plant-open": { const s = seedByKey(id); if (s) openNew(s); break; }
    case "close-sheet": closeSheet(); break;
    case "unshare": unshare(id); break;
    case "tab": S.tab = id; if (menu) menu.open = false; renderAll(); break;
    case "acct": S.acctOpen = !S.acctOpen; if (S.acctOpen) { readPerms().then(() => renderAcct()); } renderAcct(); break;
    case "clear-diag": S.diag = []; renderAll(); if (NS.db && S.uid) userDoc("diag_log").set({ v: VERSION, at: Date.now(), entries: [] }).catch(() => {}); break;
    case "draft-ai": draftWithClaude(); break;
    case "drop-file": { const f = draftOf(id); if (f) { f.dropFile = true; f.notesName = null; const n = $(`#${prefixOf(id)}-fileNote`); if (n) n.textContent = "The file will be removed when you save."; } break; }
    case "repo-mode": { const mode = b.dataset.mode, f = draftOf(mode); if (f) { f.repoMode = ["none", "some", "all"].includes(id) ? id : "none"; paintRepoField(mode); if (f.repoMode === "some") setTimeout(() => $(`#${prefixOf(mode)}-repoq`)?.focus(), 0); } break; }
    case "pick-repo": { const mode = b.dataset.mode, f = draftOf(mode); if (f && REPO_RE.test(id)) { f.repoList = [...new Set([...(f.repoList || []), id])].slice(0, 20); f.repoQ = ""; paintRepoField(mode); $(`#${prefixOf(mode)}-repoq`)?.focus(); } break; }
    case "unpick-repo": { const mode = b.dataset.mode, f = draftOf(mode); if (f) { f.repoList = (f.repoList || []).filter(x => x !== id); paintRepoField(mode); } break; }
    case "repos-retry": loadRepos(true); break;
    case "repos-toggle": S.reposOpen = !S.reposOpen; if (S.reposOpen) loadRepos(); paintApps(); break;
    case "pick-person": { const mode = b.dataset.mode, f = draftOf(mode); if (f) { f.vips = [...new Set([...(f.vips || []), id])].slice(0, 5); const p = prefixOf(mode); $(`#${p}-people`).value = ""; $(`#${p}-plist`).hidden = true; paintPeoplePicker(mode); $(`#${p}-people`).focus(); } break; }
    case "unpick-person": { const mode = b.dataset.mode, f = draftOf(mode); if (f) { f.vips = (f.vips || []).filter(x => x !== id); paintPeoplePicker(mode); } break; }
    case "run": if (d) runDot(d.id); break;
    case "stop": S.running?.ctl.abort(); break;
    case "run-due": runDue(); break;
    case "suggest": sendReply(id); break;
    case "share": if (d) shareSeed(d); if (menu) menu.open = false; break;
    case "delete-dot": S.confirmDel = true; if (menu) menu.open = false; renderAll(); break;
    case "cancel-del": S.confirmDel = false; renderAll(); break;
    case "confirm-del": if (d) deleteDot(d.id); break;
    case "chat-stop": S.chat?.ctl.abort(); break;
    case "drop-img": S.replyImage = null; paintComposer(); break;
    case "exec": execute(id); break;
    case "answer": answerQuestion(id, b.dataset.choice); break;
    case "undo": undoAction(id); break;
    case "tell-pick": { const t = S.tell, dd = S.dots.find(x => x.id === id); S.tell = null; paintTell(); if (t && dd) deliver(dd, t.text); break; }
    case "tell-new": { const t = S.tell; S.tell = null; paintTell(); if (t) newDotFrom(t.text); break; }
    case "tell-cancel": { const t = S.tell; S.tell = null; paintTell(); const inp = $("#tellIn"); if (inp && t) { inp.value = t.text; inp.focus(); } break; }
    case "edit-ask": { const a = S.actions.find(x => x.id === id); if (!a) break; if (S.edits[id]) delete S.edits[id]; else S.edits[id] = { to: (a.payload?.to || []).join(", "), subject: a.payload?.subject || "", body: a.payload?.body || "" }; renderAll(); if (S.edits[id]) $(`#ed-body-${cssKey(id)}`)?.focus(); break; }
    case "dismiss": setActionState(id, "dismissed").then(ok => ok && toast("Moved out of the way", { label: "Undo", fn: () => setActionState(id, "pending") })); break;
    case "undismiss": setActionState(id, "pending"); break;
    case "ask-filter": S.askFilter = id; renderAll(); break;
    case "copy": {
      const a = S.actions.find(x => x.id === id), ed = S.edits[id], text = ed?.body ?? a?.payload?.body ?? a?.draft ?? "";
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast("Copied"), () => toast("Select the text to copy it.")); else toast("Select the text to copy it.");
      break; }
    case "handoff": {
      // stays synchronous inside the click: the platform proves the gesture from this call
      const a = S.actions.find(x => x.id === id); if (!a || !NS.room) break;
      const dot = S.dots.find(x => x.id === a.dotId), p = a.payload || {};
      const details = a.kind === "reply" ? `To: ${(p.to || []).join(", ")}\nSubject: ${p.subject || ""}\nReply to message id: ${p.replyToMessageId || "none"}\n\n${p.body || ""}` : a.kind === "rsvp" ? `Event id: ${p.eventId}\nEvent: ${p.eventTitle || ""}\nAnswer: ${p.response}` : a.kind === "tool" ? `Use ${p.server} · ${p.tool} with these arguments:\n${JSON.stringify(p.input || {}, null, 2)}` : a.kind === "agenda" ? `Add this agenda to the description of the owner's meeting (event id ${p.eventId}, "${p.eventTitle || ""}"), keeping what's already there:\n\n${p.agenda || a.draft || ""}` : a.kind === "block" ? `Title: ${p.title}\nStart: ${p.start}\nEnd: ${p.end}` : (a.draft || "");
      NS.room.sendToClaudeSession(fitBytes({ label: `${(KINDS[a.kind] || KINDS.note).label}: ${clean(a.title)}`.slice(0, 120), kind: a.kind, title: clean(a.title), why: clean(a.why), from_dot: clean(dot?.name || ""), details: clean(details).slice(0, 2500), instruction: "The owner approved this action proposed by one of their atoms in Atoms. Help them carry it out with their connected tools, and confirm with them before sending or changing anything." }), { deliver: "send" })
        .then(() => { toast("Handed to Claude — check the conversation"); setActionState(id, "handed_off"); }, e => { diag("room.send", e); toast(e?.code === "claude_unavailable" ? "No Claude conversation is open beside this page." : "Couldn't hand it over."); refreshCanSend(); });
      break; }
    case "ask-claude": {
      const r = S.runs.find(x => x.id === id); if (!r || !NS.room || !d) break;
      NS.room.sendToClaudeSession(fitBytes({ label: `Note from ${clean(d.name)}`.slice(0, 120), dot: clean(d.name), dotId: d.id, runId: r.id, written: fmtWhen(r.startedAt), note: clean(r.text).slice(0, 2600) }))
        .then(() => toast("Added to your Claude message — ask away"), e => { diag("room.stage", e); toast(e?.code === "claude_unavailable" ? "No Claude conversation is open beside this page." : "Couldn't add it."); refreshCanSend(); });
      break; }
    case "clear-done": (async () => { for (const a of S.actions.filter(x => x.state !== "pending")) await userDoc(a.id).delete().catch(() => {}); })(); break;
    case "export": {
      const r = S.runs.find(x => x.id === id); if (!r || !NS.downloads || !d) break;
      if (menu) menu.open = false;
      const thread = (r.thread || []).map(t => `**${t.role === "dot" ? d.name : "You"}** · ${fmtTime(t.at)}\n\n${t.text}`).join("\n\n");
      const body = `# ${d.name} · note\n\n_${new Date(r.startedAt).toLocaleString()} · ${r.source === "cloud" ? "woke in the cloud" : "woke here"} · ${r.status}_\n\n${r.text || ""}\n\n## What it looked at\n${(r.steps || []).map(s => `- ${s.label}`).join("\n") || "- nothing"}\n${thread ? `\n## Conversation\n\n${thread}\n` : ""}`;
      NS.downloads.save({ filename: `${slug(d.name)}-${new Date(r.startedAt).toISOString().slice(0, 10)}.md`, data: body }).then(() => toast("Saved"), e => { if (e?.code !== "declined") { diag("downloads.save", e); toast("Couldn't save the file here."); } });
      break; }
    case "comment": { const el = b.closest("[data-comment-target]") || b; NS.comments?.openComposer({ element: el }).catch(e => { if (["unavailable", "not_granted", "forbidden", "capability_disabled", "capability_removed"].includes(e?.code)) { S.commentsOff = true; toast("Comments aren't available in this view."); renderAll(); } else diag("comments.open", e); }); break; }
    case "perms": NS.permissions?.manage().then(async () => { await readPerms(); startDay(); renderAll(); }, () => toast("Open the artifact's Permissions menu to change access.")); break;
    case "allow": allow(id); break;
    case "app-toggle": toggleApp(id); break;
    case "arm": S.armed[id] = true; renderAll(); setTimeout(() => { if (S.armed[id]) { delete S.armed[id]; renderAll(); } }, 10000); break;
    case "app-tools": S.appOpen[id] = !S.appOpen[id]; paintApps(); break;
    case "allow-all": allow(null); break;
    case "allow-day": allow(SRV.cal); break;
    case "hz-ev": S.hzSel = S.hzSel === id ? null : id; renderHorizon(); break;
    case "digest": digest(false); break;
    case "digest-refresh": digest(true); break;
    case "cloud-open": if (d) { S.cloudOpen[d.id] = true; if (d.cloudPending) userDoc(d.id).update({ cloudPending: null }).catch(() => {}); paintCloud(); } break;
    case "cloud-close": if (d) { S.cloudOpen[d.id] = false; paintCloud(); } break;
    case "cloud-check": loadTriggers(true); break;
    case "cloud-forget": if (d) userDoc(d.id).update({ cloud: null, cloudPending: null }).catch(e => { diag("cloud.forget", e); toast("Couldn't update that."); }); break;
    case "cloud-cancel": if (d) userDoc(d.id).update({ cloudPending: null }).catch(() => {}); break;
    case "cloud-find": if (d) cloudFind(d); break;
    case "cloud-fire": if (d) cloudAct("fire", d); break;
    case "cloud-pause": if (d) cloudAct("pause", d); break;
    case "cloud-resume": if (d) cloudAct("resume", d); break;
    case "cloud-sleep": if (d) cloudAct("sleep", d); break;
    case "cloud-create": if (d) cloudCreate(d); break;
  }
});
document.addEventListener("click", ev => {
  const o = (ev.target as any).closest("[data-look]"); if (!o) return;
  const mode = o.closest(".builder")?.dataset.draft, f = draftOf(mode); if (!f) return;
  f.look = { ...lookOf(f), [o.dataset.look]: o.dataset.v }; refreshLook(mode);
});
document.addEventListener("input", ev => {
  const t = ev.target, mode = (t as any).closest?.(".builder")?.dataset.draft, f = mode ? draftOf(mode) : null;
  if ((t as any).dataset?.f && f) {
    const k = (t as any).dataset.f;
    if (k === "src") f.sources = [...document.querySelectorAll(`#${prefixOf(mode)}-srcs input[data-src]`)].filter(x => (x as any).checked).map(x => (x as any).dataset.src);
    else if (k === "hue") { f.hue = Number((t as any).value); (t as any).closest(".builder").querySelectorAll(".b-look .av").forEach(av => av.style.setProperty("--h", (t as any).value)); }
    else f[k] = (t as any).value;
    if (k === "name") { const h = $(`#${prefixOf(mode)}-handle`); if (h) h.textContent = handleOf(f); }
  }
  if ((t as any).dataset?.edit && S.edits[(t as any).dataset.id]) S.edits[(t as any).dataset.id][(t as any).dataset.edit] = (t as any).type === "checkbox" ? (t as any).checked : (t as any).value;
  if ((t as any).dataset?.people) searchPeople((t as any).dataset.people, (t as any).value);
  if ((t as any).dataset?.repoq) { const mode = (t as any).dataset.repoq, f = draftOf(mode); if (f) { f.repoQ = (t as any).value; const l = $(`#${prefixOf(mode)}-rlist`); if (l) l.innerHTML = repoListHtml(f, mode); } }
  if ((t as any).id === "reply") autosize(t);
});
document.addEventListener("change", ev => {
  const t = ev.target, mode = (t as any).closest?.(".builder")?.dataset.draft, f = mode ? draftOf(mode) : null;
  if ((t as any).dataset?.file) { if ((t as any).dataset.file === "new") S.formFile = (t as any).files?.[0] || null; else S.editFile = (t as any).files?.[0] || null; }
  if ((t as any).id === "replyImg") { const file = (t as any).files?.[0]; if (file) { S.replyImage = file; paintComposer(); } (t as any).value = ""; }
  if ((t as any).dataset?.f === "src" && f) f.sources = [...document.querySelectorAll(`#${prefixOf(mode)}-srcs input[data-src]`)].filter(x => (x as any).checked).map(x => (x as any).dataset.src);
  if ((t as any).dataset?.f && (t as any).tagName === "SELECT" && f) f[(t as any).dataset.f] = (t as any).value;
  if ((t as any).dataset?.cloud) { const d = curDot(); if (d) { const p = cloudPlan(d); S.cloudDraft[d.id] = { when: p.when, hour: p.hour, push: p.push, [(t as any).dataset.cloud]: (t as any).type === "checkbox" ? (t as any).checked : (t as any).value }; paintCloud(); } }
});
document.addEventListener("focusin", ev => { if ((ev.target as any).dataset?.people) searchPeople((ev.target as any).dataset.people, (ev.target as any).value || ""); });
document.addEventListener("focusout", ev => {
  if ((ev.target as any).dataset?.people) { const p = prefixOf((ev.target as any).dataset.people); setTimeout(() => { if (!document.activeElement?.closest?.(".people-pick")) { const l = $(`#${p}-plist`); if (l) l.hidden = true; $(`#${p}-people`)?.setAttribute("aria-expanded", "false"); } }, 160); }
});
document.addEventListener("submit", ev => {
  ev.preventDefault();
  if ((ev.target as any).classList.contains("builder")) saveBuilder((ev.target as any).dataset.draft);
  if ((ev.target as any).id === "composer") sendReply();
  if ((ev.target as any).id === "tell") { const inp = $("#tellIn"), v = inp?.value || ""; if (v.trim()) { inp.value = ""; tellDots(v); } }
});
document.addEventListener("paste", ev => { if ((ev.target as any).id !== "reply" || !S.imagesOK) return; const f = [...(ev.clipboardData?.files || [])].find(x => x.type.startsWith("image/")); if (f) { S.replyImage = f; paintComposer(); } });
document.addEventListener("keydown", ev => {
  const t = ev.target, typing = (t as any).closest?.("input,textarea,select,[contenteditable]");
  if ((t as any).id === "sh-ask" && ev.key === "Enter") { ev.preventDefault(); draftWithClaude(); return; }
  if ((t as any).dataset?.edit === "answer" && ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); answerQuestion((t as any).dataset.id, "own"); return; }
  if ((t as any).id === "reply" && ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); sendReply(); return; }
  if (ev.key === "Escape") {
    if ((t as any).dataset?.people) { const l = $(`#${prefixOf((t as any).dataset.people)}-plist`); if (l) l.hidden = true; return; }
    if (S.sheet) { closeSheet(); return; }
    if (S.acctOpen) { closeAcct(); return; }
    if (S.view !== "home") go("home");
    return;
  }
  if (typing || ev.metaKey || ev.ctrlKey || ev.altKey || S.sheet) return;
  if (ev.key === "n" || ev.key === "N") { if (S.uid) { ev.preventDefault(); openNew(null); } }
  else if ((ev.key === "w" || ev.key === "W") && S.view === "dot") { ev.preventDefault(); runDot(S.selected); }
  else if (ev.key === "]") { if (S.dots.length) { ev.preventDefault(); cycle(1); } }
  else if (ev.key === "[") { if (S.dots.length) { ev.preventDefault(); cycle(-1); } }
  else if (ev.key === "/" && S.view === "dot") { ev.preventDefault(); if (S.tab !== "chat") { S.tab = "chat"; renderAll(); } $("#reply")?.focus(); }
});
document.addEventListener("keydown", ev => {
  // arrow keys move between tabs (tablist pattern)
  const t = ev.target; if (!(t as any).matches?.('#dvTabs [role="tab"]') || !["ArrowLeft", "ArrowRight"].includes(ev.key)) return;
  const tabs = ["chat", "activity", "schedule", "settings"], i = tabs.indexOf(S.tab);
  S.tab = tabs[(i + (ev.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]; renderAll(); $(`#tab-${S.tab}`)?.focus(); ev.preventDefault();
});
window.addEventListener("resize", () => { if (S.view === "home") renderField(); });

/* clock: horizon "now", timers, freshness — repaint only, no writes */
setInterval(() => {
  const key = new Date(); key.setHours(0, 0, 0, 0);
  if (S.dayUnsub && S.dayKey !== key.toDateString()) watchDay();
  if (!S.running && !S.chat) renderAll();
}, 30000);
setInterval(() => { if (document.visibilityState !== "hidden") refreshCanSend(); }, 45000);
