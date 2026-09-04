// Guards the "meta" surface of the UI-zero pivot (docs/UI_ZERO.md, UI_ZERO_REMNANT_AUDIT.md):
// starter scripts, local bridge, skills. tools/verify-no-legacy-ui.mjs already guards the
// runtime surface (index.html/service-worker.js/ENTRYPOINTS_AND_CONTRACTS.md); this script
// covers the surrounding files an operator actually launches SHADED with, plus the skill docs
// that describe how to work in this repo, so a re-introduced `/editor/` reference (the deleted
// production UI tree) fails fast instead of silently rotting into stale instructions again.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const fail = message => {
  console.error(`META GUARD: ${message}`);
  process.exitCode = 1;
};

if (fs.existsSync(path.join(root, 'runtime/install.js'))) {
  fail('runtime/install.js exists again — it depended on the deleted #btn-install and duplicated index.html\'s own service-worker registration');
}

for (const file of ['SHADED_WINDOWS.cmd', 'WINDOWS.md', 'tools/shaded-local-bridge.mjs']) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const text = read(file);
  if (/\/editor\//i.test(text)) {
    fail(`${file} references the deleted editor/ tree`);
  }
}

// Skill docs describe how to operate this repo; a stray editor/ reference there rots into a
// wrong instruction the same way the starter scripts did. Allowlist: skills that deliberately
// document the still-open tools/verify.js break (docs/UI_ZERO_REMNANT_AUDIT.md #10) by NAME the
// deleted DOM/paths as a known bug, not as current instruction — that is intentional history,
// not a remnant to guard against.
const EDITOR_REFERENCE_ALLOWLIST = new Set([
  '.claude/skills/shaded-visual-verify/SKILL.md',
]);
const skillsRoot = path.join(root, '.claude/skills');
if (fs.existsSync(skillsRoot)) {
  for (const dir of fs.readdirSync(skillsRoot, {withFileTypes: true})) {
    if (!dir.isDirectory()) continue;
    const relative = `.claude/skills/${dir.name}/SKILL.md`;
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (/\/editor\//i.test(text) && !EDITOR_REFERENCE_ALLOWLIST.has(relative)) {
      fail(`${relative} references the deleted editor/ tree (not on the documented-history allowlist)`);
    }
  }
}

if (!process.exitCode) {
  console.log('META GUARD: PASS — starter scripts, local bridge and skill docs stay clear of the deleted editor/ tree.');
}
