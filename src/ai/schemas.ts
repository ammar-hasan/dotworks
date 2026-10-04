import { appUsable, normSources, shortOf, toolsOf } from "../core/apps";
import { clean, sleep } from "../core/helpers";
import { NS, S } from "../core/state";

/* ═════════ tool definitions ═════════ */
export const schemaOf = (server, tool) => S.schemas.get(server + "/" + tool) || null;
export async function loadSchema(server, tool) {
  const k = server + "/" + tool; if (S.schemas.has(k) || !NS.mcp?.describeTool) return S.schemas.get(k) || null;
  S.schemas.set(k, null);
  try { const d = await NS.mcp.describeTool(server, tool); const v = { description: clean(d?.description).slice(0, 1200), inputSchema: d?.inputSchema && typeof d.inputSchema === "object" ? d.inputSchema : null }; S.schemas.set(k, v); return v; }
  catch { S.schemas.delete(k); return null; }
}
// before a dot thinks: learn the tools of the apps it reads (a few seconds at most)
export async function ensureSchemas(d) {
  const want = [];
  for (const n of normSources(d.sources)) if (appUsable(n)) for (const t of toolsOf(n).slice(0, 60)) if (!S.schemas.has(n + "/" + t)) want.push([n, t]);
  if (!want.length) return;
  await Promise.race([Promise.allSettled(want.map(([n, t]) => loadSchema(n, t))), sleep(4000)]);
}
export const toolSlug = (server, tool) => (shortOf(server).toLowerCase().replace(/[^a-z0-9]/g, "") + "_" + tool).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
export function argsLine(sch) {
  const pr = sch?.inputSchema?.properties || {}, req = new Set(sch?.inputSchema?.required || []);
  return Object.entries(pr).slice(0, 14).map(([k, v]) => `${k}${req.has(k) ? "*" : ""}${Array.isArray((v as any)?.enum) ? `(${(v as any).enum.slice(0, 5).join("|")})` : (v as any)?.type ? `:${(v as any).type}` : ""}`).join(", ");
}
export function trimPayload(x) { let t; try { t = typeof x === "string" ? x : JSON.stringify(x); } catch { t = String(x); } return t.length > 12000 ? t.slice(0, 12000) + " …(cut short)" : t; }
