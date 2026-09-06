// GOAL_FOUNDATION.md F-0310: `.claude/skills/shaded-geometry` was generalized/renamed to a
// project-wide Living Skill; "the final name must cleanly migrate all references/skill-discovery."
// Negative test (per the session's own discipline: proving the new thing exists is not proof the
// old thing was removed) -- checks BOTH that shaded-living exists correctly AND that no reachable
// repo file still points at the old path.
import {existsSync, readFileSync, statSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

const OLD_DIR = join(REPO_ROOT, '.claude', 'skills', 'shaded-geometry');
const NEW_DIR = join(REPO_ROOT, '.claude', 'skills', 'shaded-living');

ok(!existsSync(OLD_DIR), 'the old .claude/skills/shaded-geometry directory no longer exists (old owner is gone, not just donor mention)');
ok(existsSync(NEW_DIR), '.claude/skills/shaded-living exists (new owner)');
for (const file of ['SKILL.md', 'REFERENCE.md', 'RULES.md']) {
  ok(existsSync(join(NEW_DIR, file)), `shaded-living/${file} exists`);
}

const skillMd = readFileSync(join(NEW_DIR, 'SKILL.md'), 'utf8');
const frontmatterMatch = skillMd.match(/^---\n([\s\S]*?)\n---/);
ok(frontmatterMatch !== null, 'shaded-living/SKILL.md has YAML frontmatter');
ok(/^name:\s*shaded-living\s*$/m.test(frontmatterMatch[1]), 'SKILL.md frontmatter name is exactly "shaded-living" (skill-discovery uses this)');
ok(!/^name:\s*shaded-geometry\s*$/m.test(frontmatterMatch[1]), 'SKILL.md frontmatter name is NOT the old "shaded-geometry"');

// F-0311: the existing geometry Denkgrammatik is retained as a named module, not lost or renamed
// into something unrecognizable.
ok(/Geometry\s*\/\s*Spatial Construction/i.test(skillMd), 'SKILL.md names Geometry/Spatial Construction as a retained module (F-0311)');
ok(skillMd.includes('OBSERVE') && skillMd.includes('VERIFY'), 'SKILL.md still documents the geometry OBSERVE...VERIFY grammar (F-0311: content retained, not discarded)');

// F-0312 (honest scope): the skill structurally allows further domain modules, but none beyond
// Geometry are claimed to exist -- no fabricated modules.
ok(/noch nicht gebaut/i.test(skillMd) || /not yet built/i.test(skillMd), 'SKILL.md is explicit that the other named domain modules do not exist yet (no fabricated F-0312 completion)');

// REFERENCE.md/RULES.md content preserved (not truncated or lost in the move).
const referenceMd = readFileSync(join(NEW_DIR, 'REFERENCE.md'), 'utf8');
const rulesMd = readFileSync(join(NEW_DIR, 'RULES.md'), 'utf8');
ok(referenceMd.length > 15000, `REFERENCE.md content preserved through the move (${referenceMd.length} chars, expected >15000)`);
ok(rulesMd.length > 2000, `RULES.md content preserved through the move (${rulesMd.length} chars, expected >2000)`);
ok(!/^name:\s*shaded-geometry/m.test(referenceMd), 'REFERENCE.md no longer carries a stray skill-discovery frontmatter naming the old skill');

// Negative check: no reachable, tracked repo file still references the old .claude/skills path.
// (git ls-files, not a raw filesystem walk, so this matches what's actually versioned.)
const trackedFiles = execSync('git ls-files', {cwd: REPO_ROOT, encoding: 'utf8'}).trim().split('\n');
const stillReferencing = [];
for (const rel of trackedFiles) {
  if (rel.startsWith('.claude/skills/shaded-living/')) continue; // the skill's own historical self-references are fine
  if (rel === 'GOAL.md' || rel === 'GOAL_FOUNDATION.md') continue; // canonical spec text describing the pre-migration state; not rewritten by this migration
  if (rel === 'AUDIT_REPORT.md' || rel === 'tools/claim-db/scripts/generate_audit_report.py') continue; // quotes GOAL_FOUNDATION.md's own F-0310 text verbatim
  if (rel.includes('corpus/sources/0002-full-markdown-inventory.json')) continue; // append-only historical ledger (A-0104): old path's source entry is retained history, not a live reference
  if (rel === 'claim.db') continue; // same historical ledger, binary form: old source rows genuinely store the old path text, by design (A-0104 never deletes/rewrites them)
  if (rel === 'docs/geometry-library/README.md') continue; // explicitly says "vormals `shaded-geometry`" (formerly) -- a historical note, not a stale live reference
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) continue;
  let content;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    continue; // binary file, not text-searchable
  }
  if (content.includes('.claude/skills/shaded-geometry') || content.includes('`shaded-geometry`')) {
    stillReferencing.push(rel);
  }
}
ok(
  stillReferencing.length === 0,
  stillReferencing.length === 0
    ? 'no tracked repo file (outside the canonical GOAL docs and the historical corpus ledger) still references the old shaded-geometry skill path'
    : `still referencing the old path: ${stillReferencing.join(', ')}`,
);

console.log('\n✅ living-skill-migration (F-0310/F-0311): shaded-geometry fully replaced by shaded-living (old dir gone, new dir correct, all live references migrated), geometry content retained as a named module, no fabricated F-0312 modules claimed');
