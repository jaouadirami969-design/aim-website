// Minimal in-memory imitation of the supabase-js query builder, for the subset the functions use.
export function makeDb() {
  const tables = { leads: [], email_codes: [], lead_events: [], applications: [], application_drafts: [] };
  let seq = 1;
  const uuid = () => 'id-' + (seq++);
  const matches = (row, filters) => filters.every(([op, col, val]) => {
    const v = row[col];
    if (op === 'eq') return String(v).toLowerCase() === String(val).toLowerCase();
    if (op === 'is') return v === val || (val === null && v == null);
    if (op === 'gte') return v >= val;
    if (op === 'lt') return v < val;
    return true;
  });
  class Q {
    constructor(t) { this.t = t; this.filters = []; this.op = 'select'; this.payload = null; this.orderBy = null; this.lim = null; this.head = false; this.count = false; this.mode = null; }
    select(cols, opts) { if (this.op === 'select') { this.head = !!(opts && opts.head); this.count = !!(opts && opts.count); } this.wantRows = true; return this; }
    insert(p) { this.op = 'insert'; this.payload = p; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    upsert(p, opts) { this.op = 'upsert'; this.payload = p; this.conflict = (opts && opts.onConflict) || 'id'; return this; }
    delete() { this.op = 'delete'; return this; }
    lt(c, v) { this.filters.push(['lt', c, v]); return this; }
    eq(c, v) { this.filters.push(['eq', c, v]); return this; }
    is(c, v) { this.filters.push(['is', c, v]); return this; }
    gte(c, v) { this.filters.push(['gte', c, v]); return this; }
    order(c, o) { this.orderBy = [c, o && o.ascending]; return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    single() { this.mode = 'strict'; return this; }
    then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
    run() {
      const rows = tables[this.t];
      if (this.op === 'insert') {
        const now = new Date().toISOString();
        const r = { id: this.t === 'lead_events' ? seq++ : uuid(), created_at: now, updated_at: now, attempts: 0, consumed_at: null, status: 'pending', request_count: 1, ...this.payload };
        if (this.t === 'applications' && !r.reference) r.reference = 'AIM-27-' + (1001 + rows.length);
        if (this.t === 'leads' && rows.some(x => x.email.toLowerCase() === r.email.toLowerCase())) return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
        rows.push(r);
        return { data: this.mode ? r : [r], error: null };
      }
      if (this.op === 'upsert') {
        const now = new Date().toISOString();
        const key = this.conflict;
        const existing = rows.find(r => String(r[key]).toLowerCase() === String(this.payload[key]).toLowerCase());
        if (existing) { Object.assign(existing, this.payload, { updated_at: now }); return { data: this.mode ? existing : [existing], error: null }; }
        const r = { created_at: now, updated_at: now, reminded_at: null, ...this.payload };
        rows.push(r);
        return { data: this.mode ? r : [r], error: null };
      }
      if (this.op === 'delete') {
        const keep = rows.filter(r => !matches(r, this.filters)); const n = rows.length - keep.length; rows.length = 0; rows.push(...keep);
        return { data: null, error: null, count: n };
      }
      if (this.op === 'update') {
        const hit = rows.filter(r => matches(r, this.filters));
        for (const r of hit) for (const [k, v] of Object.entries(this.payload)) if (v !== undefined) r[k] = v;
        return { data: hit, error: null, count: hit.length };
      }
      let hit = rows.filter(r => matches(r, this.filters));
      if (this.orderBy) { const [c, asc] = this.orderBy; hit.sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1)); }
      if (this.lim) hit = hit.slice(0, this.lim);
      if (this.head) return { data: null, error: null, count: hit.length };
      if (this.mode) return { data: hit[0] || null, error: this.mode === 'strict' && !hit[0] ? { message: 'no rows' } : null };
      return { data: hit.map(r => ({ ...r })), error: null, count: hit.length };
    }
  }
  return { client: { from: (t) => new Q(t) }, tables };
}
