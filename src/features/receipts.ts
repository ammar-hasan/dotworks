import { shortOf, toolsOf } from "../core/apps";
import { diag } from "../core/diag";
import { clean, esc, fmtTime, fmtWhen, humanKey, isIdKey, toast, upsertLocal } from "../core/helpers";
import { NS, S, userDoc } from "../core/state";
import { renderAll } from "../ui/shell";

/* Receipts: every ask you approve records what it changed, with a link back and, where there's a safe way to
   take it back, an Undo. Undo only ever reverses exactly what the ask did (the draft it made, the event it made,
   the labels it set, the text it replaced) and only for a day. */
export const UNDO_MS = 24 * 3600e3;
export type Undo = { server: string; tool: string; input: Record<string, any>; label: string };

// actions with a clean inverse: the inverse tool and its input, from the original input and what the app returned
const INVERSE: Record<string, (i: any, o: any) => Omit<Undo, "server"> | null> = {
  "Gmail/create_draft": (i, o) => o?.id ? { tool: "delete_draft", input: { draftId: String(o.id) }, label: "Delete the draft" } : null,
  // an event with guests already sent invitations, so taking it back quietly isn't clean: no undo then
  "Google Calendar/create_event": (i, o) => o?.id && !(i.attendees?.length || i.attendeeEmails?.length) ? { tool: "delete_event", input: { eventId: String(o.id), ...(i.calendarId ? { calendarId: i.calendarId } : {}), notificationLevel: "NONE" }, label: "Remove the event" } : null,
  "Gmail/label_thread": i => i.threadId && i.labelIds ? { tool: "unlabel_thread", input: { threadId: i.threadId, labelIds: i.labelIds }, label: "Remove the labels" } : null,
  "Gmail/unlabel_thread": i => i.threadId && i.labelIds ? { tool: "label_thread", input: { threadId: i.threadId, labelIds: i.labelIds }, label: "Put the labels back" } : null,
  "Gmail/label_message": i => i.messageId && i.labelIds ? { tool: "unlabel_message", input: { messageId: i.messageId, labelIds: i.labelIds }, label: "Remove the labels" } : null,
  "Gmail/unlabel_message": i => i.messageId && i.labelIds ? { tool: "label_message", input: { messageId: i.messageId, labelIds: i.labelIds }, label: "Put the labels back" } : null,
  "Gmail/trash_thread": i => i.threadId ? { tool: "untrash_thread", input: { threadId: i.threadId }, label: "Take it out of Trash" } : null,
  "Gmail/trash_message": i => i.messageId ? { tool: "untrash_message", input: { messageId: i.messageId }, label: "Take it out of Trash" } : null,
  "Gmail/mark_thread_spam": i => i.threadId ? { tool: "unmark_thread_spam", input: { threadId: i.threadId }, label: "Not spam after all" } : null,
  "Gmail/mark_message_spam": i => i.messageId ? { tool: "unmark_message_spam", input: { messageId: i.messageId }, label: "Not spam after all" } : null,
};
export function inverseOf(server: string, tool: string, input, out): Undo | null {
  const f = INVERSE[`${server}/${tool}`], u = f ? f(input || {}, out && typeof out === "object" ? out : {}) : null;
  return u && toolsOf(server).includes(u.tool) ? { server, ...u } : null;
}

// Calendar updates that only change text: read the event first, so the old text can be put back.
// Only when every field had text before (an empty value may not clear a field, so it couldn't be restored reliably).
const TEXT_FIELDS = ["description", "summary", "location"];
const PLUMBING = ["eventId", "calendarId", "notificationLevel"];
export async function snapshotForUndo(server: string, tool: string, input): Promise<Undo | null> {
  if (server !== "Google Calendar" || tool !== "update_event" || !input?.eventId) return null;
  const keys = Object.keys(input), touched = keys.filter(k => TEXT_FIELDS.includes(k));
  if (!touched.length || keys.some(k => !TEXT_FIELDS.includes(k) && !PLUMBING.includes(k))) return null;
  if (!toolsOf(server).includes("get_event") || !toolsOf(server).includes("update_event") || !NS.mcp) return null;
  try {
    const ev: any = (await NS.mcp.callTool(server, "get_event", { eventId: input.eventId, ...(input.calendarId ? { calendarId: input.calendarId } : {}) }, { cache: false }))?.payload || {};
    const old: Record<string, string> = {};
    for (const k of touched) { if (typeof ev[k] !== "string" || !ev[k].trim()) return null; old[k] = ev[k]; }
    return { server, tool: "update_event", input: { eventId: input.eventId, ...(input.calendarId ? { calendarId: input.calendarId } : {}), ...old, notificationLevel: "NONE" }, label: "Put it back as it was" };
  } catch (e) { diag("undo.snapshot", e); return null; }
}

// a few plain lines about what changed
const short = (v, n = 70) => { const s = clean(Array.isArray(v) ? v.join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v ?? "")).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
export function receiptOf(a, input): { app: string; lines: string[] } {
  const p = a.payload || {};
  if (a.kind === "tool") {
    const lines = Object.keys(input || {}).filter(k => !isIdKey(k) && k !== "notificationLevel" && input[k] !== "" && input[k] != null).slice(0, 3).map(k => `${humanKey(k)}: ${short(input[k])}`);
    return { app: `${shortOf(p.server)} · ${clean(p.tool).replace(/_/g, " ")}`, lines };
  }
  if (a.kind === "reply") return { app: "Gmail draft", lines: [`To ${short(input?.to)}`, ...(input?.subject ? [`“${short(input.subject, 60)}”`] : [])] };
  if (a.kind === "block") return { app: "Calendar", lines: [`${short(p.title, 50)}, ${fmtWhen(Date.parse(p.start))}–${fmtTime(Date.parse(p.end))}`] };
  if (a.kind === "agenda") return { app: "Calendar", lines: [`Agenda added to “${short(p.eventTitle || "the meeting", 60)}”`] };
  if (a.kind === "rsvp") return { app: "Calendar", lines: p.eventTitle ? [short(p.eventTitle, 60)] : [] };
  return { app: "", lines: [] };
}

export const canUndo = a => !!(a?.state === "done" && a.result?.undo && !a.result.undone && Date.now() - (a.decidedAt || 0) < UNDO_MS && NS.mcp);

export function receiptHtml(a) {
  const r = a.result || {}, rc = r.receipt, busy = !!S.busy["undo:" + a.id];
  const text = rc && (rc.app || rc.lines?.length) ? [rc.app, ...(rc.lines || [])].filter(Boolean).join(" · ") : "";
  const undo = canUndo(a) ? `<button type="button" class="mini" data-act="undo" data-id="${esc(a.id)}" ${busy ? "disabled" : ""}>${busy ? "Undoing…" : esc(r.undo.label || "Undo")}</button>`
    : r.undone ? `<span class="undone">undone</span>` : "";
  return text || undo ? `<span class="rc">${text ? `<span class="rc-t">${esc(text)}</span>` : ""}${undo}</span>` : "";
}

export async function undoAction(id: string) {
  const a = S.actions.find(x => x.id === id), u: Undo = a?.result?.undo;
  if (!a || !u || a.result?.undone || S.busy["undo:" + id] || !NS.mcp) return;
  if (Date.now() - (a.decidedAt || 0) >= UNDO_MS) { toast("It's been more than a day, so undo it in the app itself."); return; }
  S.busy["undo:" + id] = true; renderAll();
  try {
    await NS.mcp.callTool(u.server, u.tool, u.input);
    NS.mcp.invalidate(u.server).catch(() => {});
    const result = { ...a.result, undone: { at: Date.now() } }, prev = a.result;
    upsertLocal(S.actions, id, { result }); renderAll();
    try { await userDoc(id).update({ result }); } catch (e) { diag("db.undo", e); upsertLocal(S.actions, id, { result: prev }); }
    toast("Undone");
  } catch (e) {
    diag("undo", e);
    toast(e?.code === "tool_error" ? `Couldn't undo it: ${clean(e.message).slice(0, 120) || "it changed since"}` : "Couldn't undo it. Check it in the app.");
  }
  delete S.busy["undo:" + id]; renderAll();
}
