// Writes dist/capabilities.json: what your copy of Dotworks declares when it is published.
// It is config/capabilities.json (the same for everyone) plus one MCP entry per connector *you* have in Claude,
// so each teammate's copy offers exactly their own apps.
//
//   node scripts/manifest.mjs [connectors.json] [--out dist/capabilities.json]
//
// connectors.json (default local/connectors.json) is either
//   { "connectors": [ ...rows from Claude's ListConnectors... ], "tools": [ "mcp__Gmail__search_threads", ... ] }
//     (what the dotworks skill writes: your connectors plus the tool names your Claude session sees), or
//   { "Gmail": ["search_threads", ...], "Google Calendar": [...] }
//     (a plain map from connector display name to tool names).
//
// Platform limits it enforces: every server lists its tools explicitly, at most maxToolsPerServer (128) per server.
// Widening the list later makes each viewer approve the new tools once.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const outAt = argv.indexOf("--out");
const out = path.resolve(root, outAt >= 0 ? argv[outAt + 1] : "dist/capabilities.json");
const inFile = path.resolve(root, argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out") || "local/connectors.json");

const cfg = JSON.parse(fs.readFileSync(path.join(root, "config/capabilities.json"), "utf8"));
if (!fs.existsSync(inFile)) {
  console.error(`No connector list at ${path.relative(root, inFile)}.\nAsk Claude to "set up Dotworks" (it writes this file), or write a map like {"Gmail": ["search_threads", ...]}.`);
  process.exit(1);
}
const input = JSON.parse(fs.readFileSync(inFile, "utf8"));
const MAX = cfg.maxToolsPerServer || 128;
const skip = new Set(cfg.skipServers || []);
const warn = [];

// Claude names a connector's tools mcp__<display name with anything but letters, digits, - and _ as _>__<tool>
const idOf = name => String(name).replace(/[^A-Za-z0-9_-]/g, "_");

/** @type {Map<string, string[]>} display name → tool names */
const servers = new Map();
if (Array.isArray(input.tools)) {
  const tools = input.tools.map(String);
  const rows = Array.isArray(input.connectors) ? input.connectors : null;
  if (rows) {
    for (const row of rows) {
      const name = String(row?.name || "").trim();
      if (!name || skip.has(name)) continue;
      if (row.connected === false) { warn.push(`${name}: not connected in Claude, left out`); continue; }
      const prefix = `mcp__${idOf(name)}__`;
      const mine = tools.filter(t => t.startsWith(prefix)).map(t => t.slice(prefix.length));
      if (!mine.length) { warn.push(`${name}: no tools visible in this session${row.enabledInChat === false ? " (it's turned off for this chat)" : ""}, left out`); continue; }
      servers.set(name, mine);
    }
  } else {
    // no connector rows: group by the id in the tool name and turn _ back into spaces
    for (const t of tools) {
      const m = /^mcp__(.+?)__(.+)$/.exec(t); if (!m) continue;
      const name = m[1].replace(/_/g, " ");
      if (skip.has(m[1]) || skip.has(name)) continue;
      servers.set(name, [...(servers.get(name) || []), m[2]]);
    }
    warn.push("no connector rows given: display names were guessed from tool names (underscores → spaces)");
  }
} else {
  for (const [name, tools] of Object.entries(input)) if (!name.startsWith("$") && !skip.has(name) && Array.isArray(tools)) servers.set(name, tools.map(String));
}

// a connector that offers more tools than a page may declare: drop the configured ones first, then the least useful
const LOW_VALUE = /(^|_)(secret|secrets|dependents|rag_index|rag_indexes|assignable_users|compile|turn_comment|more_tools)(_|$)/;
const trimmed = {};
for (const [name, list] of servers) {
  const never = new Set(cfg.excludeTools?.[name] || []);
  let tools = [...new Set(list)].filter(t => !never.has(t)).sort();
  if (tools.length > MAX) {
    const before = new Set(tools);
    const first = new Set(cfg.trimFirst?.[name] || []);
    tools = tools.filter(t => !first.has(t));
    for (const t of [...tools].reverse()) if (tools.length > MAX && LOW_VALUE.test(t)) tools = tools.filter(x => x !== t);
    if (tools.length > MAX) tools = tools.slice(0, MAX);
    trimmed[name] = [...before].filter(t => !tools.includes(t));
    warn.push(`${name}: offers ${before.size} tools, a page may declare ${MAX}; left out ${trimmed[name].join(", ")}`);
  }
  servers.set(name, tools);
}

// scheduling: the app makes one routine per dot through Claude Code Remote; same tools for everyone
const cloud = cfg.cloud;
servers.delete(cloud.server);
if (Array.isArray(input.tools) && !input.tools.some(t => String(t).startsWith(cloud.toolPrefix)))
  warn.push(`${cloud.server}: not seen in this session. Dots can still wake in the app, but "Keep it awake" needs Claude Code on the web.`);
servers.set(cloud.server, cloud.tools);

const capabilities = { ...cfg.capabilities, mcp: { servers: [...servers].map(([server, tools]) => ({ server, tools })) } };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(capabilities, null, 2) + "\n");

const width = Math.max(...[...servers.keys()].map(n => n.length));
console.log(`wrote ${path.relative(root, out)}`);
for (const [name, tools] of servers) console.log(`  ${name.padEnd(width)}  ${String(tools.length).padStart(3)} tools${name === cloud.server ? "  (scheduling)" : ""}`);
for (const w of warn) console.log(`  ! ${w}`);
