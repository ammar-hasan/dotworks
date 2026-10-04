import { CADENCE } from "./constants";

/* ═════════ state ═════════ */
// One mutable object for the whole app; views read it and repaint. Fields not listed here are added at runtime.
const init = {
  booted: false, uid: null, me: null, isOwner: false, canShare: null,
  dots: [], dotsLoaded: false, actions: [], seeds: [], seedsLoaded: false, adopts: {}, myAdopts: [],
  runs: [], runsLoaded: false, latest: {}, pruned: new Set(),
  unsubRuns: null, settingsKey: "", appUrl: "", appUrlLoaded: false,
  repos: null, reposAt: 0, reposLoading: false, reposErr: null, reposOpen: false,
  appsOff: new Set(), appsPrefsVer: null, schemas: new Map(), armed: {}, appOpen: {},
  view: "home", tab: "chat", selected: null, askFilter: "all", sheet: null, acctOpen: false, confirmDel: false,
  formDraft: null, editDraft: null, formFile: null, editFile: null,
  running: null, chat: null, replyImage: null, busy: {}, errs: {}, edits: {},
  peers: [], canSend: "off", perms: {}, conn: {}, connLoaded: false, toolsOK: null, imagesOK: null,
  triggers: null, trigErr: null, trigLoading: false, cloudOpen: {}, cloudDraft: {}, cloudFiring: {}, cloudBusy: {}, cloudStep: {}, cloudEnv: null, gone: new Set(), trigTried: {},
  day: null, dayErr: null, dayKey: null, dayUnsub: null, hzSel: null,
  digest: null, digestBusy: false, digestTried: false, digestOff: false, assetsUsage: null, diag: [],
  env: { claude: false, use: false, hot: false, caps: {} } as Record<string, any>, capsLeft: 0, commentsOff: false, fresh: new Map(), seen: new Set(),
};
export type State = typeof init & { [k: string]: any };
export const S: State = init;
// The capability namespaces this view got from claude.use(), typed by the platform's own definitions.
export type Namespaces = { -readonly [K in keyof ClaudeCapabilityMap]?: ClaudeCapabilityMap[K] | null };
export const NS: Namespaces = {};
// this artifact's own claude.ai address, as recorded by setup (meta/app); "" until then
export const artifactUrl = (): string => S.appUrl || "";
export const runsCol = id => NS.db.collection("data/users/" + S.uid).doc(id).collection("runs");
export const userDoc = id => NS.db.collection("data/users/" + S.uid).doc(id);
export const curDot = () => (S.view === "dot" ? S.dots.find(d => d.id === S.selected) || null : null);
export const isNarrow = () => { try { return !!window.matchMedia && matchMedia("(max-width: 760px)").matches; } catch { return false; } };
export const pending = () => S.actions.filter(a => a.state === "pending");
export const cloudOn = d => !!d?.cloud?.triggerId;
export const isDue = d => !cloudOn(d) && (!d.lastRunAt || Date.now() - d.lastRunAt > (CADENCE[d.cadence] || CADENCE.daily));
export const dueDots = () => S.dots.filter(isDue);
export const sendOK = (mode = "stage") => S.canSend === "available" || (mode === "send" && S.canSend === "available_if_summoned");
export const connPerm = server => S.perms["mcp:" + server];
