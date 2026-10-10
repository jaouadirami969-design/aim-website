#!/usr/bin/env node
/**
 * Quality checks on dist/ (run after `npm run build`):
 *   1. every local link, image, script and stylesheet points to a file that exists;
 *   2. every page has a <title>, a meta description and exactly one <h1>;
 *   3. only the brand colours are used in the CSS (sky blue, white, yellow — and their approved shades).
 * Exit code 1 when something is wrong, so CI fails loudly.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const BRAND = new Set([
  '#3FA9F5', '#FFFFFF', '#FFC72C',                       // the 3 colours
  '#2B8FD8', '#0B2F5B', '#1E3A5F', '#EAF6FE', '#BFE2FB', '#D7ECFB', // shades of the blue
  '#F2AE0F', '#B07A10', '#FFF6DC', '#FFE9A8',             // shades of the yellow
  '#5A7089',                                             // blue-grey for secondary text
]);

const problems = [];
const files = (await fs.readdir(DIST, { recursive: true })).map((f) => path.join(DIST, f));
const html = files.filter((f) => f.endsWith('.html'));
const css = files.filter((f) => f.endsWith('.css'));

for (const file of html) {
  const text = await fs.readFile(file, 'utf8');
  const rel = path.relative(DIST, file);
  if (!/<title>[^<]+<\/title>/.test(text)) problems.push(`${rel}: missing <title>`);
  if (!/<meta name="description" content="[^"]+"/.test(text)) problems.push(`${rel}: missing meta description`);
  const h1s = (text.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) problems.push(`${rel}: expected exactly one <h1>, found ${h1s}`);
  const refs = [...text.matchAll(/(?:href|src|poster)="([^"#?]+)[^"]*"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|data:|javascript:)/.test(ref) || ref.startsWith('//')) continue;
    const target = ref.startsWith('/') ? path.join(DIST, ref) : path.join(path.dirname(file), ref);
    const candidates = [target, target.endsWith('/') ? path.join(target, 'index.html') : `${target}.html`];
    let ok = false;
    for (const c of candidates) { try { await fs.access(c); ok = true; break; } catch { /* keep looking */ } }
    if (!ok) problems.push(`${rel}: broken link → ${ref}`);
  }
}

for (const file of css) {
  const text = await fs.readFile(file, 'utf8');
  const colours = new Set((text.match(/#[0-9a-fA-F]{6}\b/g) || []).map((c) => c.toUpperCase()));
  for (const c of colours) if (!BRAND.has(c)) problems.push(`${path.relative(DIST, file)}: colour ${c} is not in the brand palette`);
}

if (problems.length) {
  console.error(`✖ ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✔ ${html.length} pages checked — links, titles, descriptions and brand colours are all good`);
