// SHADED Provider Registry — complete list of all 58+ providers across tiers.
// Maps provider names to their runtime metadata: tier, CLI invocation, category,
// model_version, and capabilities. Used by gpu-spatial.mjs and benchmark tools.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const REGISTRY_PATH = join(__dirname, 'gpu-providers.all.json');

export function loadRegistry() {
  const raw = readFileSync(REGISTRY_PATH, 'utf8');
  const config = JSON.parse(raw);
  return config.providers || {};
}

export const PROVIDER_REGISTRY = loadRegistry();

export function getProviderConfig(name) {
  const entry = PROVIDER_REGISTRY[name];
  if (!entry) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return entry;
}

export function listProvidersByTier(tier) {
  return Object.entries(PROVIDER_REGISTRY)
    .filter(([, e]) => e.tier === tier)
    .map(([name, e]) => ({ name, ...e }));
}

export function listAllProviders() {
  return Object.entries(PROVIDER_REGISTRY)
    .map(([name, e]) => ({ name, ...e }));
}

export function getCliForProvider(name) {
  const entry = PROVIDER_REGISTRY[name];
  if (!entry) return null;
  return entry.cli || null;
}

export function getDoctorArgsForProvider(name) {
  const entry = PROVIDER_REGISTRY[name];
  if (!entry) return null;
  return entry.doctorArgs || null;
}

export const TIERS = {
  NUMPY: 'numpy',
  TORCH: 'torch',
  API: 'api',
};
