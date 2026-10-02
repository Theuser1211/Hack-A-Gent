import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface IntentExample {
  intent: string;
  text: string;
}

export interface IntentDataset {
  project: string;
  description: string;
  labels: string[];
  examples: IntentExample[];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadDataset(file = 'data/intents.json'): IntentDataset {
  const full = path.join(ROOT, file);
  const raw = JSON.parse(readFileSync(full, 'utf8')) as IntentDataset;
  if (!Array.isArray(raw.labels) || !Array.isArray(raw.examples)) {
    throw new Error(`invalid dataset: ${full} (expected labels[] and examples[])`);
  }
  return raw;
}
