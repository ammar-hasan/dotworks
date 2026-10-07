import { appUsable, humanTool, kindOf, shortOf, toolsOf } from "../core/apps";
import { carryOn, emailsOf } from "../ai/flow";
import { answerText, questionOf, questionPlan } from "./questions";
import { afterJobAnswer, decisionsHtml, decisionsSig, groupKey, groupOf, isCommandJob, isDecision, isJobQuestion } from "./jobs";
import { canUndo, inverseOf, receiptHtml, receiptOf, snapshotForUndo, undoAction } from "./receipts";
import { heldAsks, heldLine } from "./attention";
import { applyMemoryAnswer } from "./memory";
import { loadSchema, schemaOf } from "../ai/schemas";
import { FIX, ICON, KINDS, RSVP, SRV, TZ } from "../core/constants";
import { diag } from "../core/diag";
import { $, ago, clean, clone, esc, fmtTime, fmtWhen, hueOf, humanKey, isIdKey, plural, reconcile, toast, upsertLocal } from "../core/helpers";
export { humanKey, isIdKey };
import { NS, S, pending, sendOK, userDoc } from "../core/state";
import { avatarHtml, lookOf } from "../ui/characters";
import { renderAll } from "../ui/shell";

/* ─── asks ─── */
export function toolFields(a) {
  const p = a.payload || {}, inp = p.input || {}, sch = schemaOf(p.server, p.tool)?.inputSchema, props = sch?.properties || {}, ed = S.edits[a.id] || {}, id = esc(a.id);
  if (!schemaOf(p.server, p.tool) && NS.mcp) loadSchema(p.server, p.tool).then(v => { if (v) renderAll(); });
  return Object.keys(inp).map((k, i) => {
    const orig = inp[k], v = k in ed ? ed[k] : orig, pr = props[k] || {}, label = esc(pr.title || humanKey(k)), tip = pr.description ? ` title="${esc(clean(pr.description).slice(0, 240))}"` : "";
    const fid = `f-${id}-${i}`, data = `data-edit="${esc(k)}" data-id="${id}"`;
    if (isIdKey(k) && typeof orig === "string") return `<div class="id-row"${tip}><span>${label}</span><code>${esc(orig)}</code></div>`;
    if (Array.isArray(pr.enum) && typeof orig === "string") return `<label class="fld" for="${fid}"${tip}><span>${label}</span><select id="${fid}" ${data}>${[...new Set([orig, ...pr.enum])].map(o => `<option value="${esc(o)}" ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    if (typeof orig === "boolean") return `<label class="check"${tip}><input type="checkbox" id="${fid}" ${data} ${v ? "checked" : ""}> ${label}</label>`;
    if (Array.isArray(orig) && orig.every(x => typeof x === "string" || typeof x === "number")) return `<label class="fld" for="${fid}"${tip}><span>${label}</span><input type="text" id="${fid}" ${data} value="${esc(Array.isArray(v) ? v.join(", ") : v)}"></label>`;
    if (typeof orig === "string" || typeof orig === "number") {
      const long = typeof orig === "string" && (orig.length > 70 || /\n/.test(orig) || /body|description|comment|text|content|message|agenda|prompt|sql|query/i.test(k));
      return `<label class="fld" for="${fid}"${tip}><span>${label}</span>${long ? `<textarea id="${fid}" ${data}>${esc(v)}</textarea>` : `<input type="text" id="${fid}" ${data} value="${esc(v)}">`}</label>`;
    }
    return `<div class="fld"${tip}><span>${label}</span><pre class="json">${esc(JSON.stringify(orig, null, 1).slice(0, 1500))}</pre></div>`;
  }).join("");
}
export function actionPlan(a) {
  const p = a.payload || {}, ed = S.edits[a.id], id = esc(a.id);
  if (a.kind === "tool") {
    const risky = kindOf(p.server, p.tool) === "risky", c = a.context || {};
    return `<div class="plan">${c.title ? `<div class="plan-ev"><b>${esc(c.title)}</b><span>${c.when ? esc(fmtWhen(Date.parse(c.when))) : ""}</span></div>` : ""}${toolFields(a)}<p class="fine">${risky ? "<b>This can't be undone.</b> " : ""}Runs ${esc(shortOf(p.server))} · ${esc(p.tool)} with these details when you approve. Nothing happens before that.</p></div>`;
  }
  if (a.kind === "reply") {
    if (ed) return `<div class="plan"><label class="sr" for="ed-to-${id}">To</label><input type="text" id="ed-to-${id}" data-edit="to" data-id="${id}" value="${esc(ed.to ?? (p.to || []).join(", "))}" placeholder="To"><label class="sr" for="ed-sub-${id}">Subject</label><input type="text" id="ed-sub-${id}" data-edit="subject" data-id="${id}" value="${esc(ed.subject ?? p.subject ?? "")}" placeholder="Subject"><label class="sr" for="ed-body-${id}">Message</label><textarea id="ed-body-${id}" data-edit="body" data-id="${id}">${esc(ed.body ?? p.body ?? "")}</textarea><p class="fine">Creates a draft in Gmail. Nothing is sent.</p></div>`;
    return `<div class="plan"><div class="plan-row"><span>To</span><b>${esc((p.to || []).join(", "))}</b></div>${(p.cc || []).length ? `<div class="plan-row"><span>Cc</span><b>${esc(p.cc.join(", "))}</b></div>` : ""}<div class="plan-row"><span>Subject</span><b>${esc(p.subject || "(no subject)")}</b></div><div class="draft">${esc(p.body || "")}</div><p class="fine">Creates a draft in Gmail. Nothing is sent.</p></div>`;
  }
  if (a.kind === "rsvp") return `<div class="plan"><div class="plan-ev"><b>${esc(p.eventTitle || "An invite")}</b><span>${p.when ? esc(fmtWhen(Date.parse(p.when))) : ""}</span></div>${p.comment ? `<div class="draft">${esc(p.comment)}</div>` : ""}<p class="fine">You'll ${esc((RSVP[p.response]?.verb || "answer").toLowerCase())}. The organizer sees your answer.</p></div>`;
  if (a.kind === "block") return `<div class="plan"><div class="plan-ev"><b>${esc(p.title || "Focus time")}</b><span>${esc(fmtWhen(Date.parse(p.start)))}–${esc(fmtTime(Date.parse(p.end)))}</span></div><p class="fine">Adds focus time to your calendar. Nobody is invited.</p></div>`;
  if (a.kind === "agenda") {
    const notify = ed?.notify ?? false;
    return `<div class="plan"><div class="plan-ev"><b>${esc(p.eventTitle || "Your meeting")}</b><span>${p.when ? esc(fmtWhen(Date.parse(p.when))) : ""}</span></div><label class="sr" for="ed-ag-${id}">Agenda</label><textarea id="ed-ag-${id}" data-edit="agenda" data-id="${id}">${esc(ed?.agenda ?? p.agenda ?? a.draft ?? "")}</textarea><label class="check"><input type="checkbox" data-edit="notify" data-id="${id}" ${notify ? "checked" : ""}> Email the guests about the change</label><p class="fine">Adds this to the meeting's description, below anything already there. Nothing else about the meeting changes.</p></div>`;
  }
  if (a.kind === "question") return questionPlan(a);
  return a.draft ? `<div class="plan"><div class="draft">${esc(a.draft)}</div><p class="fine">A note for you. Marking it handled doesn't send or change anything${a.draft ? "; copy the text if you need it" : ""}.</p></div>` : "";
}
export function canExecute(a) {
  if (a.kind === "reply") return !!NS.mcp && (a.payload?.to || []).length > 0;
  if (a.kind === "rsvp" || a.kind === "block") return !!NS.mcp && !!a.payload;
  if (a.kind === "agenda") return !!NS.mcp && !!a.payload?.eventId;
  if (a.kind === "tool") return appUsable(a.payload?.server) && (!S.connLoaded || toolsOf(a.payload.server).includes(a.payload.tool));
  return true;
}
// an ask that follows something you told your atoms says so
export function usedHtml(a) {
  const u = Array.isArray(a.memoryUsed) ? a.memoryUsed.filter(x => x && x.text) : [];
  return u.length ? `<p class="used">Because you told me: “${esc(clean(u[0].text).slice(0, 160))}”${u.length > 1 ? ` and ${u.length - 1} more` : ""}</p>` : "";
}
export function askHtml(a, o = {}) {
  if ((a.kind === "agenda" || a.kind === "tool" || a.kind === "question") && !S.edits[a.id]) S.edits[a.id] = {};
  const d = S.dots.find(x => x.id === a.dotId), busy = !!S.busy[a.id], err = S.errs[a.id], k = KINDS[a.kind] || KINDS.note, id = esc(a.id);
  const quiet = a.kind === "note" || a.kind === "followup";
  let primary;
  if (a.kind === "question") primary = "";
  else if (!canExecute(a)) primary = a.draft || a.payload?.body ? `<button class="btn pri sm" data-act="copy" data-id="${id}">Copy</button>` : "";
  else if (a.kind === "tool") {
    const verb = esc(a.verb || humanTool(a.payload.tool).replace(/^./, c => c.toUpperCase()));
    primary = kindOf(a.payload.server, a.payload.tool) !== "risky" ? `<button class="btn pri sm" data-act="exec" data-id="${id}" ${busy ? "disabled" : ""}>${busy ? "Working…" : verb}</button>`
      : S.armed[a.id] ? `<button class="btn risk sm" data-act="exec" data-id="${id}" ${busy ? "disabled" : ""}>${busy ? "Working…" : `Yes, ${verb.toLowerCase()} · can't be undone`}</button>`
      : `<button class="btn risk-o sm" data-act="arm" data-id="${id}">${verb}…</button>`;
  }
  else if (a.kind === "rsvp") primary = `<button class="btn pri sm" data-act="exec" data-id="${id}" ${busy ? "disabled" : ""}>${busy ? "Working…" : esc(RSVP[a.payload.response]?.verb || "Answer")}</button>`;
  else if (quiet && sendOK("send")) primary = `<button class="btn pri sm" data-act="handoff" data-id="${id}">Hand to Claude</button>`;
  else primary = `<button class="btn pri sm" data-act="exec" data-id="${id}" ${busy ? "disabled" : ""}>${busy ? "Working…" : esc(k.verb || "Done")}</button>`;
  const secondary = [
    a.kind === "reply" && canExecute(a) ? `<button class="btn ghost sm" data-act="edit-ask" data-id="${id}">${S.edits[a.id] ? "Done editing" : "Edit"}</button>` : "",
    !quiet && a.kind !== "question" && sendOK("send") ? `<button class="btn ghost sm" data-act="handoff" data-id="${id}">Hand to Claude</button>` : "",
    quiet && sendOK("send") ? `<button class="btn ghost sm" data-act="exec" data-id="${id}">Done</button>` : "",
    quiet && a.draft && canExecute(a) ? `<button class="btn ghost sm" data-act="copy" data-id="${id}">Copy</button>` : "",
    a.link ? `<a class="btn ghost sm" href="${esc(a.link)}" target="_blank" rel="noopener">${ICON.out}Open</a>` : "",
  ].join("");
  const who = (o as any).inChat ? "" : `${d ? avatarHtml(d, { size: 18 }) : ""}<span>${esc(d?.name || "An atom")}</span><span>·</span>`;
  return `<article class="ask" data-key="${id}" style="--h:${hueOf(d)}" data-comment-target>
    <div class="from">${who}<span class="kind">${esc(a.kind === "tool" ? shortOf(a.payload?.server) : k.label)}</span><span>· ${ago(a.createdAt)}</span>${a.source === "cloud" ? `<span class="cloud-tag">· from the cloud</span>` : ""}${a.urgent ? `<span class="urgent-tag">· today</span>` : ""}${a.state === "held" ? `<span class="held-tag">· held back</span>` : ""}<button type="button" class="x" data-act="dismiss" data-id="${id}" aria-label="Not now" title="Not now">×</button></div>
    <h4>${esc(a.title)}</h4>${a.why ? `<p>${esc(a.why)}</p>` : ""}${usedHtml(a)}${actionPlan(a)}
    ${primary || secondary ? `<div class="row">${primary}${secondary}</div>` : ""}${err ? `<p class="err">${esc(err.msg)}</p>` : ""}</article>`;
}
// asks as list items: a job's decisions from one run read as one short list
export function askItems(asks) {
  const out = [], seen = new Set<string>();
  for (const a of asks) {
    if (!isDecision(a)) { out.push({ key: a.id, html: askHtml(a, { withDot: true }), sig: askSig(a) }); continue; }
    const k = groupKey(a); if (seen.has(k)) continue; seen.add(k);
    const grp = groupOf(a); out.push({ key: "grp:" + k, html: decisionsHtml(grp), sig: decisionsSig(grp) });
  }
  return out;
}
export function askSig(a) { const d = S.dots.find(x => x.id === a.dotId); return JSON.stringify([a, !!S.edits[a.id], !!S.armed[a.id], a.kind === "tool" ? !!schemaOf(a.payload?.server, a.payload?.tool) : 0, S.connLoaded, !!S.busy[a.id], S.errs[a.id]?.msg || "", sendOK("send"), !!NS.mcp, d?.name, hueOf(d), d && lookOf(d), Math.floor((Date.now() - (a.createdAt || 0)) / 60000)]); }
export function paintAsks() {
  const list = $("#asksList"); if (!list) return;
  const p = pending(), counts = { all: p.length };
  const bucketOf = a => a.kind === "question" ? "question" : a.kind === "tool" ? a.payload?.server : a.kind === "reply" ? "Gmail" : ["rsvp", "block", "agenda"].includes(a.kind) ? "Google Calendar" : "note";
  for (const a of p) counts[bucketOf(a)] = (counts[bucketOf(a)] || 0) + 1;
  $("#asksTitle").textContent = p.length ? `${plural(p.length, "ask")} waiting` : "All clear";
  const f = [["all", "All"], ...((counts as any).question ? [["question", "Questions"]] : []), ...Object.keys(counts).filter(k => !["all", "note", "question"].includes(k)).map(k => [k, shortOf(k)]), ...((counts as any).note ? [["note", "Notes"]] : [])];
  if (S.askFilter !== "all" && !counts[S.askFilter]) S.askFilter = "all";
  const fh = f.map(([k, l]) => `<button type="button" class="chip" data-act="ask-filter" data-id="${k}" aria-pressed="${S.askFilter === k}">${l}${counts[k] ? ` · ${counts[k]}` : ""}</button>`).join("");
  if ($("#asksFilter").innerHTML !== fh) $("#asksFilter").innerHTML = fh;
  const shown = p.filter(a => S.askFilter === "all" || bucketOf(a) === S.askFilter);
  // with a super atom, what can wait is held back while too much waits: say how much, and show it on request
  const hl = heldLine(), heldItems = S.showHeld ? askItems(heldAsks().filter(a => S.askFilter === "all" || bucketOf(a) === S.askFilter)) : [];
  const extra = [...(hl ? [{ key: "held", html: hl, sig: hl }] : []), ...heldItems];
  if (!shown.length) { const msg = `<p class="calm" data-key="calm">${!S.booted ? "…" : S.uid ? (p.length ? "Nothing of this kind." : "Nothing waiting. When an atom wants to change something, or needs your say, it asks here first.") : "Sign in to see what your atoms ask you."}</p>`; if (extra.length) reconcile(list, [{ key: "calm", html: msg, sig: msg }, ...extra]); else if (list.innerHTML !== msg) list.innerHTML = msg; }
  else reconcile(list, [...askItems(shown), ...extra]);
  const handled = S.actions.filter(a => a.state !== "pending" && a.state !== "held").sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0)), hb = $("#handled");
  if (!handled.length) { hb.innerHTML = ""; return; }
  const wasOpen = !!hb.querySelector("details[open]");
  hb.innerHTML = `<details class="handled" ${wasOpen ? "open" : ""}><summary>Handled lately · ${handled.length}</summary><div style="margin-top:8px;max-width:680px">${handled.slice(0, 10).map(a => {
    const ok = a.state === "done" || a.state === "handed_off", label = a.result?.label || (a.state === "handed_off" ? "Handed to Claude" : a.state === "dismissed" ? "Not now" : "Done");
    const line = a.kind === "question" && a.answer?.text ? `${a.title} → ${a.answer.text}` : `${label} · ${a.title}`;
    return `<div class="done-row${a.result?.undone ? " undone-row" : ""}"><span class="tick ${ok ? "" : "no"}">${ok ? "✓" : "–"}</span><span class="dr-t"><span class="dr-l" title="${esc(a.title)}">${esc(line)}</span>${receiptHtml(a)}</span>${a.result?.url ? `<a href="${esc(a.result.url)}" target="_blank" rel="noopener">open</a>` : a.state === "dismissed" ? `<button class="mini" data-act="undismiss" data-id="${esc(a.id)}">bring back</button>` : "<span></span>"}</div>`;
  }).join("")}<div class="row" style="margin-top:8px"><button class="btn ghost sm" data-act="clear-done">Clear handled</button></div></div></details>`;
}
export async function setActionState(id, state, extra?) {
  const fields = { state, decidedAt: Date.now(), ...(extra || {}) }, prev = S.actions.find(x => x.id === id);
  const before = prev ? clone(prev) : null;
  if (prev) { upsertLocal(S.actions, id, fields); renderAll(); }
  try { await userDoc(id).update(fields); return true; }
  catch (e) { diag("action.update", e); const i = S.actions.findIndex(x => x.id === id); if (before && i >= 0) { S.actions[i] = before; renderAll(); } toast(`Couldn't update that (${e?.code || "error"}).`); return false; }
}
export async function execute(id) {
  const a = S.actions.find(x => x.id === id); if (!a || S.busy[id]) return;
  const ed = S.edits[id] || null;
  S.busy[id] = true; delete S.errs[id]; renderAll();
  let result = null, payloadUpdate = null;
  try {
    if (a.kind === "reply") {
      const base = a.payload || {};
      const p = { ...base, to: emailsOf(ed ? ed.to ?? base.to : base.to), cc: emailsOf(base.cc), subject: clean(ed ? ed.subject ?? base.subject : base.subject), body: clean(ed ? ed.body ?? base.body : base.body) };
      if (!p.to.length || !p.body) throw { code: "local", message: "Add a recipient and a message first." };
      const args = { to: p.to, subject: p.subject || "", body: p.body }; if ((p.cc || []).length) (args as any).cc = p.cc; if (p.replyToMessageId) (args as any).replyToMessageId = p.replyToMessageId;
      const r = await NS.mcp.callTool(SRV.mail, "create_draft", args);
      result = { label: "Draft saved in Gmail", url: (r?.payload as any)?.viewUrl || null, receipt: receiptOf(a, args), undo: inverseOf(SRV.mail, "create_draft", args, r?.payload), edits: editsOf(base, p, ["to", "subject", "body"]) }; if (ed) payloadUpdate = p;
    } else if (a.kind === "rsvp") {
      const args = { eventId: a.payload.eventId, responseStatus: a.payload.response }; if (a.payload.comment) (args as any).responseComment = a.payload.comment;
      await NS.mcp.callTool(SRV.cal, "respond_to_event", args);
      result = { label: RSVP[a.payload.response]?.done || "Answered", url: a.link || null, receipt: receiptOf(a, args) }; NS.mcp.invalidate(SRV.cal).catch(() => {});
    } else if (a.kind === "block") {
      const p = a.payload, base = { summary: p.title, startTime: p.start, endTime: p.end, timeZone: TZ, description: `Blocked from Atoms. ${a.why || ""}`.slice(0, 500) };
      let r; try { r = await NS.mcp.callTool(SRV.cal, "create_event", { ...base, eventType: "FOCUS_TIME" }); } catch (e) { if (e?.code !== "tool_error") throw e; r = await NS.mcp.callTool(SRV.cal, "create_event", { ...base, availability: "AVAILABILITY_BUSY" }); }
      result = { label: "Focus time added", url: r?.payload?.htmlLink || null, receipt: receiptOf(a, base), undo: inverseOf(SRV.cal, "create_event", base, r?.payload) }; NS.mcp.invalidate(SRV.cal).catch(() => {});
    } else if (a.kind === "tool") {
      const p = a.payload, input = clone(p.input || {});
      if (!canExecute(a)) throw { code: "local", message: `${shortOf(p.server)} isn't available here. Check it in Apps.` };
      if (kindOf(p.server, p.tool) === "risky" && !S.armed[id]) throw { code: "local", message: "Tap once more to confirm." };
      for (const [k, v] of Object.entries(ed || {})) {
        if (!(k in input) || isIdKey(k)) continue;
        const o = input[k];
        if (Array.isArray(o)) input[k] = String(v).split(/[,\n]/).map(x => x.trim()).filter(Boolean).map(x => o.length && typeof o[0] === "number" ? Number(x) : x);
        else if (typeof o === "number") { const n = Number(v); if (!Number.isFinite(n)) throw { code: "local", message: `${humanKey(k)} must be a number.` }; input[k] = n; }
        else if (typeof o === "boolean") input[k] = !!v;
        else if (typeof o === "string") input[k] = clean(String(v));
      }
      // for a text-only Calendar update, read the event first so the old text can be put back
      const before = await snapshotForUndo(p.server, p.tool, input);
      const r = await NS.mcp.callTool(p.server, p.tool, input), pl = r?.payload && typeof r.payload === "object" ? r.payload : {};
      const url = [(pl as any).htmlLink, (pl as any).viewUrl, (pl as any).webViewLink, (pl as any).url, (pl as any).permalink, (pl as any).link].find(u => typeof u === "string" && /^https:\/\//.test(u)) || a.link || null;
      result = { label: `${a.verb || humanTool(p.tool)} · done`, url, receipt: receiptOf(a, input), undo: before || inverseOf(p.server, p.tool, input, pl), edits: editsOf(p.input || {}, input, Object.keys(input).filter(k => !isIdKey(k))) }; payloadUpdate = { ...p, input };
      delete S.armed[id]; NS.mcp.invalidate(p.server).catch(() => {});
    } else if (a.kind === "agenda") {
      const agenda = clean(ed?.agenda ?? a.payload.agenda ?? a.draft).trim().slice(0, 4000);
      if (!agenda) throw { code: "local", message: "Write the agenda first." };
      const ev = (await NS.mcp.callTool(SRV.cal, "get_event", { eventId: a.payload.eventId }, { cache: false }))?.payload || {};
      if ((ev as any).status === "cancelled") throw { code: "local", message: "That meeting was cancelled." };
      if (!((ev as any).organizer?.self)) throw { code: "local", message: "You're not the organizer of this meeting, so its description can't be changed from here. Ask the organizer instead." };
      const cur = typeof (ev as any).description === "string" ? (ev as any).description : "";
      const plainCur = cur.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), plainNew = agenda.replace(/\s+/g, " ");
      if (plainCur.includes(plainNew)) result = { label: "The agenda was already there", url: (ev as any).htmlLink || a.link || null };
      else {
        const html = /<[a-z][^>]*>/i.test(cur);
        const block = html ? esc(agenda).replace(/\n/g, "<br>") : agenda;
        const description = cur.trim() ? cur + (html ? "<br><br>" : "\n\n") + block : block;
        await NS.mcp.callTool(SRV.cal, "update_event", { eventId: a.payload.eventId, description, notificationLevel: ed?.notify ? "ALL" : "NONE" });
        // the old description can be put back only if there was one (an empty value may not clear the field)
        const undo = cur.trim() && toolsOf(SRV.cal).includes("update_event") ? { server: SRV.cal, tool: "update_event", input: { eventId: a.payload.eventId, description: cur, notificationLevel: "NONE" }, label: "Take the agenda out" } : null;
        result = { label: ed?.notify ? "Agenda added; guests emailed" : "Agenda added to the invite", url: (ev as any).htmlLink || a.link || null, receipt: receiptOf(a, {}), undo };
      }
      payloadUpdate = { ...a.payload, agenda }; if (result && !result.edits) result.edits = editsOf(a.payload, { agenda }, ["agenda"]); NS.mcp.invalidate(SRV.cal).catch(() => {});
    } else result = { label: "Marked handled" };
    result = { ...result, at: Date.now(), undo: result.undo || null }; if (!result.edits?.length) delete result.edits;
    await setActionState(id, "done", { result, ...(payloadUpdate ? { payload: payloadUpdate } : {}) });
    delete S.edits[id]; cheer(a.dotId); toast(result.label, result.undo ? { label: "Undo", fn: () => undoAction(id) } : undefined);
  } catch (e) {
    if (e?.code !== "local") diag("ask." + a.kind, e);
    const c = e?.code, k = KINDS[a.kind] || {};
    S.errs[id] = { msg: c === "local" ? e.message : c === "tool_error" ? (clean(e.message).slice(0, 200) || "It didn't go through.") : FIX[c] ? `${a.kind === "tool" ? shortOf(a.payload?.server) : a.kind === "reply" ? "Gmail" : "Calendar"} — ${FIX[c]}.` : ["server_unavailable", "upstream_error", "cancelled", "rate_limited"].includes(c) ? `Couldn't confirm it went through. ${k.check || "Check"} before trying again.` : "Something went wrong. Try again in a moment." };
  }
  delete S.busy[id]; renderAll();
}

/* what you changed before approving (field, before, after), so your super atom can learn from it; a few short lines */
export function editsOf(before, after, keys: string[]) {
  const show = v => clean(Array.isArray(v) ? v.join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v ?? "")).replace(/\s+/g, " ").trim();
  return keys.filter(k => show(before?.[k]) !== show(after?.[k])).slice(0, 3).map(k => ({ field: k, from: show(before?.[k]).slice(0, 200), to: show(after?.[k]).slice(0, 200) }));
}
// the atom that asked does a little hop when you say yes or answer it
export function cheer(dotId) { if (!dotId) return; S.cheer[dotId] = Date.now(); setTimeout(() => renderAll(), 1600); }

// you answered a dot's question: save it, then let the dot carry on with it
export async function answerQuestion(id: string, choiceId: string) {
  const a = S.actions.find(x => x.id === id); if (!a || a.kind !== "question" || (a.state !== "pending" && a.state !== "held") || S.busy[id]) return;
  const text = answerText(a, choiceId); if (!text) return;
  S.busy[id] = true; renderAll();
  const answer = { choice: choiceId === "own" ? null : choiceId, text, at: Date.now() };
  const ok = await setActionState(id, "done", { answer, result: { label: "Answered", at: Date.now() } });
  delete S.busy[id];
  if (!ok) { renderAll(); return; }
  delete S.edits[id]; cheer(a.dotId); renderAll();
  // "Is this right?" from the super atom: your answer keeps or drops what it learned, and that's all
  if (a.memoryId) { applyMemoryAnswer({ ...a, answer }, choiceId); return; }
  // a job's question carries on here like the main job's; a job that runs a command in a repo carries on in the
  // cloud instead, once all of that run's questions are answered
  if (isJobQuestion(a)) { const j = S.jobs.find(x => x.id === a.jobId); if (!j || isCommandJob(j)) { afterJobAnswer({ ...a, answer, state: "done" }); return; } }
  const d = S.dots.find(x => x.id === a.dotId);
  if (d) carryOn(d, { ...a, answer, state: "done" });
}
export { canUndo, questionOf, undoAction };
