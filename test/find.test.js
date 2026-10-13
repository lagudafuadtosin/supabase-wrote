import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { findInDir, findInText } from '../src/find.js'

const fixtures = fileURLToPath(new URL('./fixtures/app/', import.meta.url))
const text = readFileSync(fixtures + 'notes.ts', 'utf8')

test('finds the update and the delete with no .select(), and nothing else', () => {
  const hits = findInText(text)
  assert.deepEqual(hits.map((h) => h.kind), ['update', 'delete'])
  assert.equal(hits[0].line, 9)
  assert.equal(hits[1].line, 17)
})

test('walks a folder and names the file', () => {
  const hits = findInDir(fixtures)
  assert.equal(hits.length, 2)
  assert.ok(hits.every((h) => h.file === 'notes.ts'))
})

test('a chain that ends with .select() on the next line is fine', () => {
  assert.deepEqual(findInText("await supabase.from('a')\n  .update({ x: 1 })\n  .eq('id', 1)\n  .select()"), [])
})

test('comments with brackets inside the chain do not break it', () => {
  assert.deepEqual(findInText("supabase.from('a').update({ x: 1 }) /* (note) */ .eq('id', 1).select('id')"), [])
})

test('"// wrote-ok" on the line above skips a write where zero rows is expected', () => {
  const src = "// wrote-ok: nothing unread is fine\nawait supabase.from('messages').update({ read: true }).is('read', null)"
  assert.deepEqual(findInText(src), [])
})

test('"// wrote-ok" at the end of the line also skips it', () => {
  assert.deepEqual(findInText("await supabase.from('coaches').update({ terms_at: now }).is('terms_at', null) // wrote-ok"), [])
})

test('"// wrote-ok" inside a multi-line chain skips it', () => {
  assert.deepEqual(findInText("await supabase\n  .from('a')\n  .update({ x: 1 }) // wrote-ok, set once\n  .is('x', null)"), [])
})

test('a wrote-ok two lines up does not skip the next write', () => {
  const src = "// wrote-ok\nconst a = 1\nawait supabase.from('a').update({ x: 1 }).eq('id', 1)"
  assert.equal(findInText(src).length, 1)
})

const more = fileURLToPath(new URL('./fixtures/more/', import.meta.url))
const hitsIn = (name) => findInDir(more).filter((h) => h.file === name).map((h) => `${h.line} ${h.kind}`)

test('HTML pages are read too', () => {
  assert.deepEqual(hitsIn('page.html'), ['3 update'])
})

test('plain fetch() PATCH or DELETE to /rest/v1 with no rows or count back is found, others are not', () => {
  assert.deepEqual(hitsIn('worker.ts'), ['2 fetch PATCH'])
})

test('Dart (Flutter) uses the same rule', () => {
  assert.deepEqual(hitsIn('notes.dart'), ['3 update'])
})

test('Python: a result thrown away or returning minimal is found, kept results and wrote-ok are not', () => {
  assert.deepEqual(hitsIn('notes.py'), ['2 update', '18 update'])
})

test('upserts are left out: Postgres throws when the existing row fails the UPDATE policy, so they are never silent', () => {
  assert.deepEqual(findInText("await supabase.from('a').upsert({ id: 1, x: 1 })"), [])
  assert.deepEqual(findInText("await supabase.from('a').upsert({ id: 1, x: 1 }, { onConflict: 'id' }).eq('id', 1)"), [])
  assert.deepEqual(findInText("fetch('https://x.supabase.co/rest/v1/a', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body })"), [])
  assert.deepEqual(findInText("supabase.table('a').upsert({'id': 1, 'x': 1}).execute()"), [])
})
