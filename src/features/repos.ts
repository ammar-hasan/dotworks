import { NS, S } from "../core/state";
import { FIX, SRV } from "../core/constants";
import { diag } from "../core/diag";
import { clean } from "../core/helpers";
import { paintRepoField } from "../views/builder";
import { paintApps } from "../views/apps";
/* GitHub repos a dot works on: none, some, or all you can reach through Claude */
export const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
export function normRepos(r) {
  const list = [...new Set((Array.isArray(r?.list) ? r.list : []).map(x => String(x).trim()).filter(x => REPO_RE.test(x)))].slice(0, 20);
  const mode = r?.mode === "all" ? "all" : r?.mode === "some" && list.length ? "some" : "none";
  return { mode, list: mode === "some" ? list : [] };
}
export const repoShort = x => String(x).split("/").pop();
export function reposLine(d) { const r = normRepos(d.repos); return r.mode === "all" ? "all your repos" : r.mode === "some" ? (r.list.length > 2 ? `${repoShort(r.list[0])} +${r.list.length - 1}` : r.list.map(repoShort).join(" + ")) : ""; }
export async function loadRepos(force?) {
  if (!NS.mcp || S.reposLoading || (S.repos && !force && Date.now() - S.reposAt < 600000)) return;
  S.reposLoading = true; S.reposErr = null;
  try {
    const r = await NS.mcp.callTool(SRV.cloud, "list_repos", { limit: 200 });
    S.repos = ((r?.payload as any)?.repos || []).filter(x => REPO_RE.test(String(x?.full_name || ""))).map(x => ({ name: x.full_name, visibility: x.visibility || "", pushedAt: x.pushed_at || null, url: /^https:\/\/github\.com\//.test(String(x.url || "")) ? x.url : null }));
    S.reposAt = Date.now();
  } catch (e) { diag("repos.list", e); S.reposErr = FIX[e?.code] ? `scheduled tasks — ${FIX[e.code]}` : clean(e?.message).slice(0, 140) || "try again"; }
  S.reposLoading = false;
  for (const m of ["new", "edit"]) paintRepoField(m);
  if (S.view === "apps") paintApps();
}
