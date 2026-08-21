// run-experiment.js — Experiment engine for post-GOLD research (EXPERIMENT_ARCHITECTURE.md).
//
// Loads an ExperimentCard JSON, validates it against operators.json, executes
// the specified operator in a subprocess, evaluates metrics, checks class
// regression, and writes results to the content-addressed artifact store.
//
// Usage:
//   node tools/run-experiment.js --experiment <path> --output <dir> [--dry-run]
//
// Exit codes: 0=pass, 1=metric fail, 2=execution error, 3=class regression

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const REPO = path.join(__dirname, '..');
const OPERATORS_JSON = path.join(REPO, 'docs', 'research', 'operators.json');
const EXPECTED_CLASSES = path.join(REPO, 'tools', 'expected-classes.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--experiment') out.experiment = argv[++i];
    else if (argv[i] === '--output') out.output = argv[++i];
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--timeout') out.timeout = parseInt(argv[++i], 10);
    else if (argv[i] === '--log-level') out.logLevel = argv[++i];
  }
  return out;
}

function fail(code, payload) {
  process.stdout.write(JSON.stringify({ status: 'error', ...payload }) + '\n');
  process.exit(code);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function formatRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `run-${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function loadOperators() {
  if (!fs.existsSync(OPERATORS_JSON)) {
    throw new Error(`operators.json not found at ${OPERATORS_JSON}`);
  }
  return JSON.parse(fs.readFileSync(OPERATORS_JSON, 'utf8'));
}

function validateCard(card, operators) {
  const errors = [];
  const warnings = [];

  if (!card.experimentId) errors.push('missing experimentId');
  if (!card.operator) errors.push('missing operator');
  if (!card.donor) errors.push('missing donor');
  if (!operators[card.operator]) {
    errors.push(`operator ${card.operator} not registered in operators.json`);
  } else {
    const op = operators[card.operator];
    if (op.donor && op.donor !== card.donor) {
      warnings.push(`operator ${card.operator} expects donor "${op.donor}", card specifies "${card.donor}"`);
    }
    if (op.configSchema && card.parameters) {
      const schema = op.configSchema;
      if (schema.properties) {
        for (const [key, schemaVal] of Object.entries(schema.properties)) {
          if (schema.required && schema.required.includes(key) && card.parameters[key] === undefined) {
            errors.push(`missing required parameter: ${key}`);
          }
          if (card.parameters[key] !== undefined && schemaVal.enum && !schemaVal.enum.includes(card.parameters[key])) {
            errors.push(`parameter "${key}" value "${card.parameters[key]}" not in enum ${JSON.stringify(schemaVal.enum)}`);
          }
        }
      }
    }
  }

  if (!card.inputs || !Array.isArray(card.inputs)) {
    errors.push('missing inputs array');
  } else {
    for (let i = 0; i < card.inputs.length; i++) {
      const inp = card.inputs[i];
      if (!inp.path) errors.push(`input[${i}] missing path`);
      if (!inp.type) warnings.push(`input[${i}] missing type`);
    }
  }

  if (!card.metrics || !Array.isArray(card.metrics)) {
    errors.push('missing metrics array');
  }

  return { ok: errors.length === 0, errors, warnings };
}

function checkThresholds(metrics, cardMetrics) {
  const results = {};
  let allPassed = true;
  for (const m of cardMetrics) {
    const value = metrics[m.name];
    if (value === undefined) {
      results[m.name] = { value: null, threshold: m.threshold, passed: false, error: 'metric not reported' };
      allPassed = false;
      continue;
    }
    let passed;
    if (m.operator === 'gte') passed = value >= (m.threshold || 0);
    else if (m.operator === 'lte') passed = value <= (m.threshold || Infinity);
    else if (m.operator === 'eq') passed = value === m.threshold;
    else passed = value <= (m.threshold || Infinity); // default: lower is better
    if (!passed) allPassed = false;
    results[m.name] = { value, threshold: m.threshold, passed, operator: m.operator || 'default' };
  }
  return { ok: allPassed, results };
}

function checkClassRegression(classCounts, expectedClassesPath) {
  if (!classCounts || !expectedClassesPath) return { ok: true, results: {} };
  const expected = JSON.parse(fs.readFileSync(expectedClassesPath, 'utf8'));
  const results = {};
  let allPassed = true;

  for (const [sceneName, expectedCounts] of Object.entries(expected)) {
    const actualCounts = classCounts[sceneName] || {};
    for (const [className, expectedCount] of Object.entries(expectedCounts)) {
      const actualCount = actualCounts[className] || 0;
      const delta = Math.abs(actualCount - expectedCount);
      const pctDelta = expectedCount > 0 ? (delta / expectedCount) * 100 : (actualCount > 0 ? 100 : 0);
      const tolerance = Math.max(40, expectedCount * 0.10);
      const withinAbsolute = delta <= tolerance;
      if (!withinAbsolute) allPassed = false;
      results[`${sceneName}.${className}`] = {
        expected: expectedCount,
        actual: actualCount,
        delta: delta,
        pctDelta: parseFloat(pctDelta.toFixed(2)),
        tolerance: tolerance,
        passed: withinAbsolute,
      };
    }
  }

  return { ok: allPassed, results };
}

async function runOperatorSubprocess(operator, parameters, inputs, scratchDir, timeout) {
  return new Promise((resolve, reject) => {
    const scriptName = `operator-${operator.toLowerCase().replace(/[^a-z0-9]/g, '-')}.mjs`;
    const scriptPath = path.join(REPO, 'docs', 'research', 'operators', scriptName);

    const env = { ...process.env };
    env.SHADED_OP_NAME = operator;

    const child = spawn('node', [scriptPath, '--json'], {
      env,
      cwd: REPO,
      timeout: timeout || 300000,
    });

    const stdinData = JSON.stringify({ parameters, inputs, scratchDir, runId: process.env.RUN_ID });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`operator ${operator} exited with code ${code}: ${stderr.substring(0, 500)}`));
      } else {
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed);
        } catch (e) {
          reject(new Error(`operator ${operator} produced invalid JSON: ${e.message}`));
        }
      }
    });

    child.stdin.write(stdinData);
    child.stdin.end();
  });
}

function storeArtifact(outputDef, outputDir, runId) {
  const results = [];
  for (const out of outputDef) {
    if (!fs.existsSync(out.path)) {
      results.push({ logicalName: out.kind, status: 'missing', error: `output not found: ${out.path}` });
      continue;
    }
    const sha256 = sha256File(out.path);
    const hashDir = path.join(outputDir, 'by-sha256', sha256.substring(0, 2));
    fs.mkdirSync(hashDir, { recursive: true });
    const hashPath = path.join(hashDir, sha256.substring(2));
    if (!fs.existsSync(hashPath)) {
      fs.copyFileSync(out.path, hashPath);
    }
    results.push({
      logicalName: out.kind,
      path: out.path,
      sha256,
      size: fs.statSync(out.path).size,
      storagePath: path.relative(outputDir, hashPath),
      deterministic: true,
    });
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.experiment) {
    fail(2, { code: 'missing_input', message: 'Fehlendes --experiment <path> Argument.' });
    return;
  }

  const cardPath = path.resolve(args.experiment);
  if (!fs.existsSync(cardPath)) {
    fail(2, { code: 'missing_input', message: `ExperimentCard nicht gefunden: ${cardPath}` });
    return;
  }

  let card;
  try {
    card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
  } catch (e) {
    fail(2, { code: 'invalid_card', message: `ExperimentCard ist kein gültiges JSON: ${e.message}` });
    return;
  }

  let operators;
  try {
    operators = loadOperators();
  } catch (e) {
    fail(2, { code: 'missing_operators', message: e.message });
    return;
  }

  const validation = validateCard(card, operators);
  if (!validation.ok) {
    fail(2, { code: 'invalid_card', message: 'ExperimentCard validation failed', errors: validation.errors });
    return;
  }

  const opMeta = operators[card.operator] || {};
  const runId = card.runId || process.env.RUN_ID || formatRunId();
  process.env.RUN_ID = runId;

  if (args.dryRun) {
    process.stdout.write(JSON.stringify({
      status: 'dry-run',
      experimentId: card.experimentId,
      operator: card.operator,
      donor: card.donor,
      validation: { ok: validation.ok, errors: validation.errors, warnings: validation.warnings },
      mode: opMeta.mode || 'research',
      impl: opMeta.implType || 'unknown',
      license: opMeta.license || 'unknown',
      runId,
    }, null, 2) + '\n');
    process.exit(0);
    return;
  }

  const outputDir = args.output || path.join(REPO, 'artifacts', runId, card.experimentId);
  const scratchDir = path.join(outputDir, 'scratch');
  fs.mkdirSync(scratchDir, { recursive: true });

  const startTime = Date.now();
  let operatorResult;
  let execError = null;

  try {
    operatorResult = await runOperatorSubprocess(
      card.operator,
      card.parameters,
      card.inputs,
      scratchDir,
      args.timeout || card.timeoutSeconds * 1000
    );
  } catch (e) {
    execError = e.message;
  }

  const wallTimeMs = Date.now() - startTime;

  if (execError) {
    const result = {
      experimentId: card.experimentId,
      status: 'error',
      exitCode: 2,
      runId,
      error: execError,
      runtime: { wallTimeMs },
    };
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'result.json'), JSON.stringify(result, null, 2));
    fail(2, { message: execError, result });
    return;
  }

  // Evaluate metrics
  const metricEval = checkThresholds(operatorResult.metrics || {}, card.metrics);

  // Evaluate class regression
  const classReg = checkClassRegression(
    operatorResult.classCounts || {},
    card.expectedClassCounts ? null : EXPECTED_CLASSES
  );

  // Store artifacts
  const artifactResults = card.outputs ? storeArtifact(card.outputs, outputDir, runId) : [];

  const allPassed = metricEval.ok && classReg.ok;

  const result = {
    experimentId: card.experimentId,
    status: allPassed ? 'pass' : 'fail',
    exitCode: allPassed ? 0 : (metricEval.ok ? 3 : 1),
    runId,
    gitRef: card.gitRef,
    operator: card.operator,
    donor: card.donor,
    mode: opMeta.mode || card.mode,
    metrics: metricEval.results,
    classRegression: classReg.results,
    artifacts: artifactResults,
    runtime: { wallTimeMs, maxMemoryMb: 0 },
    outputs: operatorResult.outputs || [],
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'result.json'), JSON.stringify(result, null, 2));

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.exitCode);
}

main().catch((e) => {
  fail(2, { message: e.message || String(e), stack: e.stack });
});
