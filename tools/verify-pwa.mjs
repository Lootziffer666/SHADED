import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const manifest = JSON.parse(read("manifest.webmanifest"));
const html = read("index.html");
const worker = read("service-worker.js");
// SHADED ist der Editor: ein Dokument, ein Startpunkt. editor/index.html gibt
// es nicht mehr (kein zweites UI-/iframe-System) — siehe CLAUDE.md.
const checks = [
  ["manifest name", typeof manifest.name === "string" && manifest.name.includes("SHADED")],
  ["standalone display", manifest.display === "standalone"],
  ["start URL ist das einzige Dokument", manifest.start_url === "./index.html"],
  ["text-only scalable icon", manifest.icons.length === 1 && manifest.icons[0].sizes === "any" && manifest.icons[0].type === "image/svg+xml"],
  ["icon files exist", manifest.icons.every((icon) => fs.existsSync(path.join(root, icon.src)))],
  ["manifest linked", /rel="manifest" href="manifest\.webmanifest"/.test(html)],
  ["engine module linked", /type="module" src="runtime\/shaded-engine\.mjs"/.test(html)],
  ["spatial viewer linked", /type="module" src="runtime\/spatial-viewer\.js"/.test(html)],
  ["install module linked", /type="module" src="runtime\/install\.js/.test(html)],
  ["install button exists", /id="btn-install"/.test(html)],
  ["kein iframe mehr (keine zweite UI-Seite)", !/id="engine-frame"/.test(html) && !fs.existsSync(path.join(root, "editor/index.html"))],
  ["runtime modules cached offline", ["./runtime/spatial-viewer.js","./runtime/install.js","./runtime/spatial-point-cloud.mjs","./runtime/spatial-navigation.mjs","./runtime/spatial-reconstruction.mjs","./runtime/sparse-voxel-world.mjs","./runtime/surface-world-simulation.mjs"].every(file => worker.includes(`'${file}'`))],
  ["index.html cached offline", ["./index.html"].every(file => worker.includes(`'${file}'`))],
  ["editor-Assets (CSS/JS) cached offline", ["./editor/engine-shell.css?v=1","./editor/app.js?v=9","./editor/facade.js","./editor/world-sandbox.css?v=2","./editor/world-sandbox.js?v=3"].every(file => worker.includes(`'${file}'`))],
  ["canonical demo cached offline", ["./file_00000000974871f49fe71f6b456f9579.png","./file_00000000974871f49fe71f6b456f9579_depth.png","./file_00000000c84071f4bcd6ff9afdba7246.png"].every(file => worker.includes(`'${file}'`))],
];
let failed = false;
for (const [label, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", label);
  failed ||= !ok;
}
if (failed) process.exit(1);
console.log("PWA files and cache list statically verified (no browser installation claimed).");
