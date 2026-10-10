#!/usr/bin/env node
/**
 * AIM website — static build (zero dependencies).
 *
 *   src/pages/*.html     → dist/*.html   (wrapped in src/layouts/base.html)
 *   src/partials/*.html  → included with {{> name }}
 *   src/data/site.json   → available as {{ site.* }}
 *   src/assets/**        → dist/assets/**
 *   src/static/**        → dist/**            (CNAME, robots.txt, favicon…)
 *
 * Template syntax (tiny, Handlebars-like):
 *   {{ site.name }}            escaped value          {{{ page.body }}}   raw value
 *   {{> header }}              include a partial
 *   {{#if page.hero}} … {{else}} … {{/if}}            {{#unless x}} … {{/unless}}
 *   {{#each site.levels}} {{this.title}} {{@index}} {{/each}}
 *   {{nav:program}}            → aria-current="page" when page.nav === "program"
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function lookup(ctx, expr) {
  expr = expr.trim();
  if (expr === 'this') return ctx.this;
  if (expr.startsWith('this.')) return lookup({ ...ctx, ...objectify(ctx.this) }, expr.slice(5));
  if (expr === '@index') return ctx['@index'];
  if (expr === '@first') return ctx['@first'];
  if (expr === '@last') return ctx['@last'];
  return expr.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), ctx);
}
const objectify = (v) => (v && typeof v === 'object' ? v : {});
const truthy = (v) => !(v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && v.length === 0));

/** Find the matching close tag for a block opened at `start`, honouring nesting. Returns [innerStart, innerEnd, afterClose]. */
function findBlockEnd(src, name, start) {
  const open = new RegExp(`\\{\\{#${name}\\b[^}]*\\}\\}`, 'g');
  const close = new RegExp(`\\{\\{/${name}\\}\\}`, 'g');
  let depth = 1;
  let pos = start;
  while (depth > 0) {
    open.lastIndex = pos; close.lastIndex = pos;
    const o = open.exec(src); const c = close.exec(src);
    if (!c) throw new Error(`Unclosed {{#${name}}} block`);
    if (o && o.index < c.index) { depth++; pos = o.index + o[0].length; }
    else { depth--; pos = c.index + c[0].length; if (depth === 0) return [c.index, pos]; }
  }
  throw new Error('unreachable');
}

function render(src, ctx, partials) {
  let out = '';
  let i = 0;
  const tag = /\{\{(#each|#if|#unless|>|\{|nav:|!)?\s*([^}]*?)\s*\}?\}\}/g;
  while (i < src.length) {
    tag.lastIndex = i;
    const m = tag.exec(src);
    if (!m) { out += src.slice(i); break; }
    out += src.slice(i, m.index);
    const [whole, kind, expr] = m;
    const afterTag = m.index + whole.length;
    if (kind === '!') { i = afterTag; continue; }                       // comment
    if (kind === '>') {                                                   // partial
      const name = expr.trim();
      if (!(name in partials)) throw new Error(`Unknown partial: ${name}`);
      out += render(partials[name], ctx, partials);
      i = afterTag; continue;
    }
    if (kind === '{') {                                                   // raw
      const v = lookup(ctx, expr);
      out += v == null ? '' : String(v);
      i = afterTag; continue;
    }
    if (kind === 'nav:') {                                                // nav helper
      out += ctx.page && ctx.page.nav === expr.trim() ? ' aria-current="page"' : '';
      i = afterTag; continue;
    }
    if (kind === '#each') {
      const [innerEnd, after] = findBlockEnd(src, 'each', afterTag);
      const inner = src.slice(afterTag, innerEnd);
      const list = lookup(ctx, expr);
      if (Array.isArray(list)) {
        list.forEach((item, idx) => {
          out += render(inner, { ...ctx, this: item, '@index': idx, '@first': idx === 0, '@last': idx === list.length - 1 }, partials);
        });
      }
      i = after; continue;
    }
    if (kind === '#if' || kind === '#unless') {
      const name = kind.slice(1);
      const [innerEnd, after] = findBlockEnd(src, name, afterTag);
      let inner = src.slice(afterTag, innerEnd);
      let elseInner = '';
      const elseIdx = findElse(inner);
      if (elseIdx >= 0) { elseInner = inner.slice(elseIdx + '{{else}}'.length); inner = inner.slice(0, elseIdx); }
      const cond = truthy(lookup(ctx, expr));
      const chosen = (kind === '#if') === cond ? inner : elseInner;
      out += render(chosen, ctx, partials);
      i = after; continue;
    }
    const v = lookup(ctx, expr);                                          // escaped value
    out += v == null ? '' : escapeHtml(v);
    i = afterTag;
  }
  return out;
}

/** Position of a top-level {{else}} inside a block body (ignores nested blocks). */
function findElse(inner) {
  let depth = 0;
  const re = /\{\{(#if|#unless|#each|\/if|\/unless|\/each|else)\b[^}]*\}\}/g;
  let m;
  while ((m = re.exec(inner))) {
    const k = m[1];
    if (k.startsWith('#')) depth++;
    else if (k.startsWith('/')) depth--;
    else if (k === 'else' && depth === 0) return m.index;
  }
  return -1;
}

function parseFrontMatter(text, file) {
  const m = text.match(/^\s*<!--page\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`${file}: missing <!--page { … } --> front matter`);
  let meta;
  try { meta = JSON.parse(m[1]); } catch (e) { throw new Error(`${file}: invalid JSON front matter — ${e.message}`); }
  return { meta, body: text.slice(m[0].length) };
}

async function readDir(dir, ext) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith(ext)).map((e) => path.join(dir, e.name)).sort();
  } catch { return []; }
}

async function copyDir(from, to) {
  try { await fs.access(from); } catch { return; }
  await fs.cp(from, to, { recursive: true });
}

export async function build() {
  const started = Date.now();
  const site = JSON.parse(await fs.readFile(path.join(SRC, 'data', 'site.json'), 'utf8'));
  site.year = new Date().getFullYear();
  const layout = await fs.readFile(path.join(SRC, 'layouts', 'base.html'), 'utf8');
  const partials = {};
  for (const f of await readDir(path.join(SRC, 'partials'), '.html')) {
    partials[path.basename(f, '.html')] = await fs.readFile(f, 'utf8');
  }

  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });
  await copyDir(path.join(SRC, 'assets'), path.join(DIST, 'assets'));
  await copyDir(path.join(SRC, 'static'), DIST);

  const pages = [];
  for (const f of await readDir(path.join(SRC, 'pages'), '.html')) {
    const { meta, body } = parseFrontMatter(await fs.readFile(f, 'utf8'), path.relative(ROOT, f));
    const slug = meta.slug || path.basename(f);
    const page = { ...meta, slug, url: `${site.url.replace(/\/$/, '')}/${slug === 'index.html' ? '' : slug}` };
    const ctx = { site, page };
    const content = render(body, ctx, partials);
    const html = render(layout, { ...ctx, content }, partials);
    await fs.writeFile(path.join(DIST, slug), html);
    pages.push(page);
  }

  // sitemap.xml (only indexable pages)
  const urls = pages.filter((p) => !p.noindex).map((p) => `  <url><loc>${escapeHtml(p.url)}</loc></url>`).join('\n');
  await fs.writeFile(path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

  console.log(`✔ built ${pages.length} pages → dist/ in ${Date.now() - started} ms`);
  return pages;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((e) => { console.error('✖ build failed:', e.message); process.exit(1); });
}
