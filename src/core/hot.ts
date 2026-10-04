import { $ } from "./helpers";
import { S } from "./state";

/* ═════════ hot reload: keep your place when the page is republished ═════════ */
export function hotSnapshot() {
  return { view: S.view, tab: S.tab, selected: S.selected, sheet: S.sheet, formDraft: S.formDraft, editDraft: S.editDraft, reply: $("#reply")?.value || "", edits: S.edits, cloudDraft: S.cloudDraft, cloudOpen: S.cloudOpen, askFilter: S.askFilter };
}
export function restoreHot(h) {
  if (!h || typeof h !== "object") return;
  if (["home", "asks", "seeds", "apps"].includes(h.view)) S.view = h.view;
  if (h.view === "dot" && typeof h.selected === "string") { S.needDot = h.selected; S.tab = ["chat", "activity", "schedule", "settings"].includes(h.tab) ? h.tab : "chat"; }
  if (h.sheet && typeof h.sheet === "object" && h.formDraft && typeof h.formDraft === "object") { S.sheet = h.sheet; S.formDraft = h.formDraft; }
  if (h.editDraft && typeof h.editDraft === "object") S.editDraft = h.editDraft;
  for (const k of ["edits", "cloudDraft", "cloudOpen"]) if (h[k] && typeof h[k] === "object") S[k] = h[k];
  if (typeof h.askFilter === "string") S.askFilter = h.askFilter;
  S.pendingReply = typeof h.reply === "string" ? h.reply : "";
}
