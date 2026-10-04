import { SRV } from "./constants";
import { NS, S } from "./state";
/* Your apps: every connector this copy of Dotworks was published with (see scripts/manifest.mjs), as listTools()
   reports them for the viewer. A dot reads with an app's read tools and may propose any of its other tools as an ask;
   nothing runs until you approve, and anything that can't be undone needs a second tap.
   KNOWN_APPS only gives familiar apps a short name, a line about what they hold and a colour; any other connector
   works the same way with a generated name and colour. */
export const KNOWN_APPS: Record<string, { short: string; does: string; hue: number }> = {
  "Google Calendar": { short: "Calendar", does: "events, invites, focus time", hue: 214 },
  "Gmail": { short: "Gmail", does: "mail, drafts, labels", hue: 8 },
  "Google Drive": { short: "Drive", does: "files and docs", hue: 140 },
  "Google Sheets": { short: "Sheets", does: "spreadsheets", hue: 118 },
  "Slack": { short: "Slack", does: "channels, threads, people", hue: 300 },
  "Supabase": { short: "Supabase", does: "projects, tables, logs", hue: 158 },
  "ElevenLabs": { short: "ElevenLabs", does: "voice agents and audio", hue: 32 },
  "Disrupt Hub": { short: "Disrupt Hub", does: "AI-engineering knowledge hub, read-only", hue: 262 },
};
const hueOfName = (n: string) => { let h = 7; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const appInfo = (n: string) => KNOWN_APPS[n] || { short: n, does: "", hue: hueOfName(n) };
// servers that are Dotworks' own plumbing, not apps a dot reads
const isPlumbing = (n: string) => n === SRV.cloud || S.conn[n]?.kind === "artifact";
// the viewer's apps: what listTools() reported (the manifest ∩ their connected connectors)
export const appNames = (): string[] => Object.keys(S.conn).filter(n => !isPlumbing(n)).sort((a, b) => appInfo(a).short.localeCompare(appInfo(b).short));
// dots made before apps were generic stored "calendar"/"gmail"
export const LEGACY_SRC = { calendar: "Google Calendar", gmail: "Gmail" };
export const srcName = s => LEGACY_SRC[s] || s;
export const normSources = (arr): string[] => [...new Set((Array.isArray(arr) ? arr : []).map(x => srcName(String(x)).trim()).filter(n => n && n.length <= 80 && n !== SRV.cloud))];
export const shortOf = n => appInfo(srcName(n)).short;
// what a tool does, from its own annotations first, then its name
export const stripTool = t => String(t).replace(/^(slack|agents|creative)_/, "");
export const RISKY = /(^|_)(send|forward|reply|delete|trash|spam|share|execute|apply|deploy|merge|reset|rebase|pause|restore|archive|clear|drop|revoke|regenerate|run|generate|design|transcribe|edit_image|interrupt|remove|bulk)(_|$)|_sql$|create_project|create_branch|create_deployment|^schedule_message$/;
export function kindOf(server, tool) {
  const ann = S.conn[server]?.ann?.[tool] || {};
  if (ann.readOnlyHint === true) return "read";
  const t = stripTool(tool);
  const draftOnly = /draft/.test(t) && !/delete|trash/.test(t);
  if (ann.destructiveHint === true || (!draftOnly && (RISKY.test(t) || RISKY.test(tool)))) return "risky";
  if (/^(list|get|search|read|query|fetch|find|suggest|download|semantic_search|calculate)(_|$)/.test(t)) return "read";
  return "act";
}
export const toolsOf = server => S.conn[server]?.tools || [];
export const appUsable = n => !!NS.mcp && !!n && !isPlumbing(n) && !S.appsOff.has(n) && (!S.connLoaded || !!S.conn[n]);
export const appsAvail = () => appNames().filter(n => !S.appsOff.has(n));
// apps your dots read that this copy can't reach: disconnected in Claude, or not among the apps it was published with
export const appsMissing = (): string[] => !NS.mcp || !S.connLoaded ? [] :
  [...new Set(S.dots.flatMap(d => normSources(d.sources)))].filter(n => !S.conn[n] && !isPlumbing(n)).sort((a, b) => appInfo(a).short.localeCompare(appInfo(b).short));
export const humanTool = t => stripTool(t).replace(/_/g, " ");
