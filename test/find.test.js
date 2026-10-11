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
