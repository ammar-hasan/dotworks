// Builds Dotworks into the one self-contained page a Claude artifact needs:
// dist/dotworks.html = page head bits + inlined CSS + markup + one classic <script>.
// The artifact publisher wraps it in its own document skeleton, so this is a fragment, not a full document.
// It also writes the documents setup puts in the artifact's store (dist/data/): the cloud wake runbook (meta/runbook)
// and the starter seeds (library/starter), from config/.
//   node scripts/build.mjs            build once
//   node scripts/build.mjs --watch    rebuild on change
//   node scripts/build.mjs --preview  also write dist/preview.html, runnable in a plain browser with a mock Claude runtime
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const args = new Set(process.argv.slice(2));
const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });

const jsOptions = {
  entryPoints: [path.join(root, "src/main.ts")],
  bundle: true, format: "iife", target: "es2022", platform: "browser", write: false, charset: "utf8", legalComments: "none",
  define: { __VERSION__: JSON.stringify(pkg.version.replace(/\.0$/, "")) },
  logLevel: "warning",
};
const cssOptions = { entryPoints: [path.join(root, "src/styles/index.css")], bundle: true, write: false, charset: "utf8", logLevel: "warning" };

// what setup writes into the artifact's store, ready for ArtifactData set with file_path
function writeData() {
  const runbook = fs.readFileSync(path.join(root, "config/runbook.md"), "utf8").trim();
  const v = Number((/\(v(\d+)\)/.exec(runbook.split("\n")[0]) || [])[1]);
  if (!v) throw new Error("config/runbook.md: the first line must end with its version, like (v4)");
  const seeds = JSON.parse(fs.readFileSync(path.join(root, "config/seeds/starter.json"), "utf8"));
  const data = path.join(dist, "data");
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, "runbook.json"), JSON.stringify({ text: runbook + "\n", version: v, updatedAt: Date.now() }, null, 2) + "\n");
  fs.writeFileSync(path.join(data, "starter.json"), JSON.stringify({ starter: true, updatedAt: Date.now(), templates: seeds.templates }, null, 2) + "\n");
  return v;
}

async function build() {
  const [js, css] = await Promise.all([esbuild.build(jsOptions), esbuild.build(cssOptions)]);
  const head = fs.readFileSync(path.join(root, "src/page/head.html"), "utf8").trim();
  const body = fs.readFileSync(path.join(root, "src/page/body.html"), "utf8").trim();
  const script = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const page = `${head}\n<style>\n${css.outputFiles[0].text.trim()}\n</style>\n\n${body}\n\n<script>\n${script.trim()}\n</script>\n`;
  fs.writeFileSync(path.join(dist, "dotworks.html"), page);
  if (args.has("--preview")) {
    const mock = fs.readFileSync(path.join(root, "test/mock-browser.js"), "utf8");
    fs.writeFileSync(path.join(dist, "preview.html"), `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n<script>window.__scene = new URLSearchParams(location.search).get("scene") || "full";</script>\n<script>\n${mock}\n</script>\n${page}</body></html>\n`);
  }
  const runbookV = writeData();
  const kb = (Buffer.byteLength(page) / 1024).toFixed(0);
  console.log(`built dist/dotworks.html · ${kb} KB · v${pkg.version} · runbook v${runbookV}${args.has("--preview") ? " · dist/preview.html" : ""}`);
}

if (args.has("--watch")) {
  const ctx = await esbuild.context({ ...jsOptions, plugins: [{ name: "page", setup(b) { b.onEnd(() => build().catch(e => console.error(e.message))); } }] });
  await ctx.watch(); console.log("watching src/ …");
} else await build();
