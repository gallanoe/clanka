#!/usr/bin/env node
// antirot — combinatorial-graph figure renderer.
//
// KaTeX renders math, not graphs. Mermaid handles simple node-edge diagrams
// (authored directly in lessons), but can't cleanly do ports / typed connection
// points / precise custom layouts. For those, a lesson-writer authors a structured
// graph SPEC (never raw SVG — that's coordinate hallucination) at
// `.antirot/figures/<id>.json`; this script compiles it to Graphviz dot and
// renders a committed SVG into `<outDir>/assets/<id>.svg`, embedded in the note
// via `![[assets/<id>.svg]]`.
//
//   node build-figures.mjs <manifest.json> [--figures .antirot/figures] [--out <dir>]
//
// Renderer: @hpcc-js/wasm (Graphviz, no system binary) if installed, else a
// system `dot` if on PATH, else warn and skip (figures are an optional toolchain;
// the core pipeline has no npm deps).
//
// Spec shape (validated here and in check.mjs):
//   { "id": "fig-1", "kind": "digraph"|"graph"|"port-graph",
//     "rankdir": "TB"|"LR",
//     "nodes": [ {"id":"a","label":"A","ports":["l","r"]} ],
//     "edges": [ {"from":"a","to":"b","label":"f","fromPort":"r","toPort":"l"} ] }

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith("--"));
if (!manifestPath) {
  console.error("usage: build-figures.mjs <manifest.json> [--figures dir] [--out dir]");
  process.exit(2);
}
const m = JSON.parse(readFileSync(manifestPath, "utf8"));
const figuresDir = valueOf("--figures") ?? join(".antirot", "figures");
const outDir = resolve(valueOf("--out") ?? m.course.outDir);
const assetsDir = join(outDir, "assets");

if (!existsSync(figuresDir)) {
  console.log(`build-figures: no figures dir (${figuresDir}); nothing to render.`);
  process.exit(0);
}
const specFiles = readdirSync(figuresDir).filter((f) => f.endsWith(".json"));
if (!specFiles.length) {
  console.log("build-figures: no figure specs; nothing to render.");
  process.exit(0);
}

const render = await getRenderer();
if (!render) {
  console.warn(
    "build-figures: no renderer available (install @hpcc-js/wasm in the plugin, or put graphviz `dot` on PATH). Skipping — figures not rendered.",
  );
  process.exit(0);
}

mkdirSync(assetsDir, { recursive: true });
let ok = 0;
const errors = [];
for (const f of specFiles) {
  let spec;
  try {
    spec = JSON.parse(readFileSync(join(figuresDir, f), "utf8"));
  } catch (e) {
    errors.push(`${f}: invalid JSON (${e.message})`);
    continue;
  }
  const problem = validateSpec(spec);
  if (problem) {
    errors.push(`${f}: ${problem}`);
    continue;
  }
  let svg;
  try {
    svg = await render(toDot(spec));
  } catch (e) {
    errors.push(`${spec.id}: render failed (${e.message})`);
    continue;
  }
  writeFileSync(join(assetsDir, `${spec.id}.svg`), svg);
  ok++;
}

console.log(`build-figures: ${ok} rendered, ${errors.length} failed → ${assetsDir}`);
for (const e of errors) console.error(`  ERROR ${e}`);
process.exit(errors.length ? 1 : 0);

// ---------------------------------------------------------------------------

export function validateSpec(spec) {
  if (!spec || typeof spec !== "object") return "not an object";
  if (!spec.id || !/^[a-z0-9-]+$/.test(spec.id)) return "missing/invalid id (kebab-case)";
  if (!Array.isArray(spec.nodes) || !spec.nodes.length) return "no nodes";
  if (!Array.isArray(spec.edges)) return "edges must be an array";
  const ids = new Set();
  for (const n of spec.nodes) {
    if (!n.id) return "a node is missing id";
    if (ids.has(n.id)) return `duplicate node id "${n.id}"`;
    ids.add(n.id);
  }
  for (const e of spec.edges) {
    if (!ids.has(e.from)) return `edge from unknown node "${e.from}"`;
    if (!ids.has(e.to)) return `edge to unknown node "${e.to}"`;
  }
  return null;
}

export function toDot(spec) {
  const directed = spec.kind !== "graph"; // port-graph + digraph render directed
  const kw = directed ? "digraph" : "graph";
  const sep = directed ? "->" : "--";
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const lines = [`${kw} G {`];
  if (spec.rankdir) lines.push(`  rankdir=${spec.rankdir};`);
  lines.push(`  node [shape=${spec.kind === "port-graph" ? "record" : "circle"}];`);
  for (const n of spec.nodes) {
    if (n.ports && n.ports.length) {
      const rec = n.ports.map((p) => `<${p}> ${p}`).join("|");
      const label = n.label ? `${n.label}|{${rec}}` : `{${rec}}`;
      lines.push(`  ${q(n.id)} [shape=record label=${q(label)}];`);
    } else {
      lines.push(`  ${q(n.id)} [label=${q(n.label ?? n.id)}];`);
    }
  }
  for (const e of spec.edges) {
    const from = e.fromPort ? `${q(e.from)}:${e.fromPort}` : q(e.from);
    const to = e.toPort ? `${q(e.to)}:${e.toPort}` : q(e.to);
    const attrs = e.label ? ` [label=${q(e.label)}]` : "";
    lines.push(`  ${from} ${sep} ${to}${attrs};`);
  }
  lines.push("}");
  return lines.join("\n");
}

async function getRenderer() {
  // 1) @hpcc-js/wasm (Graphviz WASM) — preferred, no system binary
  try {
    const { Graphviz } = await import("@hpcc-js/wasm/graphviz");
    const gv = await Graphviz.load();
    return async (dot) => gv.layout(dot, "svg", "dot");
  } catch {
    /* not installed — fall through */
  }
  // 2) system graphviz `dot`
  try {
    execFileSync("dot", ["-V"], { stdio: "ignore" });
    return async (dot) => execFileSync("dot", ["-Tsvg"], { input: dot }).toString();
  } catch {
    return null;
  }
}

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
