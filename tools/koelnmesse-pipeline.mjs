#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const EXPERIMENT_DIR = resolve(ROOT, 'docs/research/experiments');

export async function loadExperimentCard(id) {
    const cardPath = resolve(EXPERIMENT_DIR, `${id}.json`);
    if (!existsSync(cardPath)) {
        throw new Error(`Experiment card not found: ${cardPath}`);
    }
    const card = JSON.parse(readFileSync(cardPath, 'utf-8'));
    return card;
}

export function listExperimentCards() {
    const results = [];
    for (const f of ['koelnmesse-geometry-3060-a', 'koelnmesse-material-max-2', 'koelnmesse-verify-3060-b', 'koelnmesse-pipeline-orchestration']) {
        const p = resolve(EXPERIMENT_DIR, `${f}.json`);
        if (existsSync(p)) {
            const card = JSON.parse(readFileSync(p, 'utf-8'));
            results.push({
                id: card.experimentId,
                title: card.title,
                mode: card.mode,
                status: card.blockedOn ? 'blocked' : (card.runsInSandbox ? 'rannable' : 'environment-blocked'),
                hardwareConstraint: card.hardwareConstraint,
                childExperiments: card.childExperiments || []
            });
        }
    }
    return results;
}

export function summarizePipeline() {
    const cards = listExperimentCards();
    console.log('=== Koelnmesse Pipeline Status ===\n');
    for (const c of cards) {
        const statusIcon = c.status === 'rannable' ? '🟢' : c.status === 'blocked' ? '🟡' : '🔴';
        console.log(`${statusIcon} ${c.id}`);
        console.log(`   Title: ${c.title}`);
        console.log(`   Status: ${c.status} | HW: ${c.hardwareConstraint}`);
        if (c.childExperiments.length) {
            console.log(`   Children: ${c.childExperiments.join(', ')}`);
        }
        console.log();
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const cmd = process.argv[2];
    if (cmd === 'list') {
        console.log(JSON.stringify(listExperimentCards(), null, 2));
    } else if (cmd === 'summary') {
        summarizePipeline();
    } else {
        console.log('Usage: node tools/koelnmesse-pipeline.mjs [list|summary]');
        console.log('  list    - JSON list of experiment cards');
        console.log('  summary - human-readable pipeline status');
    }
}
