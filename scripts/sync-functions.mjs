#!/usr/bin/env node
// The two Edge Functions share common.ts and emails.ts. The source of truth lives in request-code/;
// this copies them into verify-code/ so both deployments stay identical.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN = path.join(ROOT, 'supabase', 'functions');
for (const f of ['common.ts', 'emails.ts', 'gmail.ts']) {
  await fs.copyFile(path.join(FN, 'request-code', f), path.join(FN, 'verify-code', f));
  console.log(`✔ ${f} → verify-code/`);
}
