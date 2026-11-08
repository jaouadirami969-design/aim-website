#!/usr/bin/env node
// The Edge Functions share common.ts (and some share emails.ts / gmail.ts). The source of truth lives in
// request-code/; this copies the shared files into the other functions so every deployment stays identical.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN = path.join(ROOT, 'supabase', 'functions');
const TARGETS = {
  'verify-code': ['common.ts', 'emails.ts', 'gmail.ts'],
  'submit-application': ['common.ts', 'gmail.ts'],
  'confirm-application': ['common.ts'],
  'save-draft': ['common.ts'],
  'remind-drafts': ['common.ts'],
};
for (const [fn, files] of Object.entries(TARGETS)) {
  for (const f of files) {
    await fs.copyFile(path.join(FN, 'request-code', f), path.join(FN, fn, f));
    console.log(`✔ ${f} → ${fn}/`);
  }
}
