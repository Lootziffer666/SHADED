// retention-sweep.js — Content-addressed artifact retention policy enforcer.
//
// Implements RETENTION_AND_ARTIFACT_SPEC.md §4: sweeps artifacts/ by retention
// class TTL, archives before deletion, enforces size budget.
//
// Usage:
//   node tools/retention-sweep.js --age pass:90d fail:30d error:14d teacher:180d \
//     --archive-days 1 --budget-gb 10 --dry-run=false
//
// Exit codes: 0=success, 1=config error

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const ARTIFACTS_DIR = path.join(REPO, 'artifacts');
const CONFIG_PATH = path.join(REPO, 'tools', 'retention-config.json');
const DEFAULT_CONFIG = {
  totalBudgetGb: 10,
  archiveDays: 1,
  classes: {
    GOLD: { ttlDays: 0, sweepable: false },
    PASS: { ttlDays: 90, sweepable: true },
    FAIL: { ttlDays: 30, sweepable: true },
    ERROR: { ttlDays: 14, sweepable: true },
    TEACHER: { ttlDays: 180, sweepable: true },
    REFERENCE: { ttlDays: 0, sweepable: false },
  },
};

function parseArgs(argv) {
  const out = { dryRun: true, age: {}, archiveDays: 1, budgetGb: 10 };
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === '--dry-run=false') out.dryRun = false;
    else if (argv[i] === '--dry-run=true') out.dryRun = true;
    else if (argv[i] === '--age') {
      const spec = argv[++i];
      for (const part of spec.split(',')) {
        const [cls, days] = part.split(':');
        out.age[cls.trim().toUpperCase()] = parseInt(days, 10);
      }
    } else if (argv[i] === '--archive-days') out.archiveDays = parseInt(argv[++i], 10);
    else if (argv[i] === '--budget-gb') out.budgetGb = parseInt(argv[++i], 10);
    else if (argv[i] === '--log-file') out.logFile = argv[++i];
    i++;
  }
  return out;
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return { ...DEFAULT_CONFIG, ...cfg };
    } catch (e) {
      console.error('Warning: could not parse ' + CONFIG_PATH + ': ' + e.message);
    }
  }
  return { ...DEFAULT_CONFIG };
}

function fileAgeDays(filePath) {
  const stat = fs.statSync(filePath);
  const mtime = stat.mtimeMs;
  return (Date.now() - mtime) / (1000 * 60 * 60 * 24);
}

function dirSizeBytes(dirPath) {
  let total = 0;
  if (!fs.existsSync(dirPath)) return 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else total += entry.size;
  }
  return total;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const log = [];

  const logLine = (msg) => { log.push(msg); };

  if (!fs.existsSync(ARTIFACTS_DIR)) {
    console.log('artifacts/ directory does not exist');
    process.exit(0);
    return;
  }

  const archiveDir = path.join(ARTIFACTS_DIR, 'archive', 'swept-' + Date.now());
  let totalFreed = 0;
  let totalSize = dirSizeBytes(ARTIFACTS_DIR) / (1024 ** 3);
  logLine('Total artifacts size: ' + totalSize.toFixed(2) + ' GB');

  // 1. TTL sweep
  for (const cls of ['PASS', 'FAIL', 'ERROR', 'TEACHER']) {
    const clsDir = path.join(ARTIFACTS_DIR, cls.toLowerCase());
    if (!fs.existsSync(clsDir)) continue;

    const ttl = args.age[cls] ?? config.classes[cls].ttlDays;
    if (ttl === 0 || !config.classes[cls].sweepable) {
      logLine('Skipping ' + cls + ' (not sweepable or TTL=0)');
      continue;
    }

    const entries = fs.readdirSync(clsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(clsDir, entry.name);
      const age = fileAgeDays(entryPath);

      if (age > ttl) {
        const size = dirSizeBytes(entryPath);
        const relPath = path.relative(ARTIFACTS_DIR, entryPath);

        if (args.dryRun) {
          logLine('[DRY RUN] Would archive ' + relPath + ' (age: ' + age.toFixed(1) + 'd, size: ' + (size/1024/1024).toFixed(1) + 'MB)');
        } else {
          const archivePath = path.join(archiveDir, cls, entry.name);
          fs.mkdirSync(path.dirname(archivePath), { recursive: true });
          fs.renameSync(entryPath, archivePath);
          totalFreed += size;
          logLine('Archived ' + relPath + ' -> ' + path.relative(ARTIFACTS_DIR, archivePath));
        }
      }
    }
  }

  // 2. Size budget enforcement
  if (!args.dryRun) {
    totalSize = dirSizeBytes(ARTIFACTS_DIR) / (1024 ** 3);
    if (totalSize > args.budgetGb) {
      logLine('Size budget exceeded: ' + totalSize.toFixed(2) + ' GB > ' + args.budgetGb + ' GB');

      for (const cls of ['ERROR', 'FAIL', 'PASS', 'TEACHER']) {
        const clsDir = path.join(ARTIFACTS_DIR, cls.toLowerCase());
        if (!fs.existsSync(clsDir)) continue;
        if (!config.classes[cls].sweepable) continue;

        const entries = fs.readdirSync(clsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => ({
            name: e.name,
            path: path.join(clsDir, e.name),
            mtime: fs.statSync(path.join(clsDir, e.name)).mtimeMs,
            size: dirSizeBytes(path.join(clsDir, e.name)),
          }))
          .sort((a, b) => a.mtime - b.mtime);

        for (const entry of entries) {
          if (totalSize * 1024 ** 3 <= args.budgetGb * 1024 ** 3) break;
          const archivePath = path.join(archiveDir, cls, entry.name);
          fs.mkdirSync(path.dirname(archivePath), { recursive: true });
          fs.renameSync(entry.path, archivePath);
          totalFreed += entry.size;
          totalSize -= entry.size / (1024 ** 3);
          logLine('Budget sweep: archived ' + entry.name + ' (' + (entry.size/1024/1024).toFixed(1) + 'MB)');
        }
      }
    }
  }

  // 3. Archive cleanup
  const archiveRoot = path.join(ARTIFACTS_DIR, 'archive');
  if (fs.existsSync(archiveRoot)) {
    for (const sub of fs.readdirSync(archiveRoot, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const subPath = path.join(archiveRoot, sub.name);
      const age = fileAgeDays(subPath);
      if (age > args.archiveDays) {
        if (args.dryRun) {
          logLine('[DRY RUN] Would delete archive ' + sub.name + ' (age: ' + age.toFixed(1) + 'd)');
        } else {
          const size = dirSizeBytes(subPath);
          fs.rmSync(subPath, { recursive: true, force: true });
          totalFreed += size;
          logLine('Deleted archive ' + sub.name);
        }
      }
    }
  }

  const finalSize = dirSizeBytes(ARTIFACTS_DIR) / (1024 ** 3);
  logLine('Done. Final size: ' + finalSize.toFixed(2) + ' GB (freed: ' + (totalFreed/1024/1024).toFixed(1) + 'MB)');
  console.log(log.join('\n'));
  process.exit(0);
}

main();
