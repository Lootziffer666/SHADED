import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const manifest = JSON.parse(read("manifest.webmanifest"));
const html = read("index.html");
const worker = read("service-worker.js");
const checks = [
  ["manifest name", typeof manifest.name === "string" && manifest.name.includes("SHADED")],
  ["standalone display", manifest.display === "standalone"],
  ["editor start URL", manifest.start_url === "./editor/index.html"],
  ["text-only scalable icon", manifest.icons.length === 1 && manifest.icons[0].sizes === "any" && manifest.icons[0].type === "image/svg+xml"],
  ["icon files exist", manifest.icons.every((icon) => fs.existsSync(path.join(root, icon.src)))],
  ["legacy renderer manifest linked", /rel="manifest" href="manifest\.webmanifest"/.test(html)],
  ["legacy renderer install module linked", /type="module" src="runtime\/install\.js"/.test(html)],
  ["spatial viewer linked", /type="module" src="runtime\/spatial-viewer\.js"/.test(html)],
  ["runtime modules cached offline", ["./runtime/spatial-viewer.js","./runtime/install.js","./runtime/spatial-navigation.mjs","./runtime/spatial-reconstruction.mjs","./runtime/sparse-voxel-world.mjs","./runtime/surface-world-simulation.mjs"].every(file => worker.includes(String.fromCharCode(39)+file+String.fromCharCode(39)))],
  ["editor cached offline", ["./editor/index.html","./editor/app.js"].every(file => worker.includes(String.fromCharCode(39)+file+String.fromCharCode(39)))],
];
let failed = false;
for (const [label, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", label);
  failed ||= !ok;
}
if (failed) process.exit(1);
console.log("PWA verification passed.");
