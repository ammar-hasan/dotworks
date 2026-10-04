import { boot } from "./core/boot";
import { diag } from "./core/diag";
import { hotSnapshot } from "./core/hot";
import { S } from "./core/state";
import { renderAll } from "./ui/shell";
// modules that register listeners when loaded
import "./core/diag";
import "./ui/events";
import "./views/home";
import "./features/cloud";

/* ═════════ start: once, whichever way the viewer hands us the go-ahead ═════════ */
let started = false;
const start = data => { if (started) return; started = true; boot(data).catch(e => { diag("boot", e); S.booted = true; renderAll(); }); };
renderAll();
try {
  const hot = window.claude && (window.claude as any).hot;
  if (hot && typeof hot.snapshot === "function") hot.snapshot(hotSnapshot);
  if (hot && typeof hot.ready === "function") { hot.ready(start); setTimeout(() => start((hot && hot.data) || {}), 2500); }
  else start((hot && hot.data) || {});
} catch (e) { diag("hot", e); start({}); }
