const ts = require('typescript');
const fs = require('fs');
const path = require('path'); const base = path.join(__dirname, '..', 'functions') + '/'; const out = path.join(__dirname, '.build'); fs.mkdirSync(out, { recursive: true });
for (const fn of ['request-code', 'verify-code']) {
  fs.mkdirSync(path.join(out, fn), { recursive: true });
  for (const f of ['index.ts', 'common.ts', 'emails.ts', 'gmail.ts']) {
    let src = fs.readFileSync(base + fn + '/' + f, 'utf8');
    src = src.replace('import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";', 'const createClient = globalThis.__createClient;');
    src = src.replace(/from "\.\/(common|emails|gmail)\.ts"/g, 'from "./$1.mjs"');
    src = src.replace('import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";', 'const SMTPClient = globalThis.__SMTPClient;');
    const res = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    fs.writeFileSync(path.join(out, fn, f.replace('.ts', '.mjs')), res.outputText);
  }
}
