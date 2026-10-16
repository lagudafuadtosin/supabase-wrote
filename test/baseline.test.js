// The baseline: CI fails only on writes the committed baseline does not list.
// Asked on r/Supabase, 11 Oct 2026: "new compared to what?"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const bin = fileURLToPath(new URL('../bin/supabase-wrote.js', import.meta.url))
const run = (dir, ...args) => {
  const r = spawnSync(process.execPath, [bin, 'find', dir, ...args], { encoding: 'utf8' })
  return { code: r.status, out: r.stdout }
}

const two = [
  "export async function rename(id, title) {",
  "  await supabase.from('notes').update({ title }).eq('id', id)",
  "}",
  "export async function drop(id) {",
  "  await supabase.from('notes').delete().eq('id', id)",
  "}",
  "",
].join('\n')

test('without a baseline every write fails, as before', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-base-'))
  writeFileSync(join(dir, 'notes.js'), two)
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /2 writes to check\./)
})

test('--save-baseline passes, writes a file, and later runs fail only on new writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-base-'))
  mkdirSync(join(dir, 'lib'))
  writeFileSync(join(dir, 'lib', 'notes.js'), two)

  const saved = run(dir, '--save-baseline')
  assert.equal(saved.code, 0)
  const file = join(dir, '.supabase-wrote-baseline.json')
  assert.ok(existsSync(file))
  const body = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(body.writes.map((w) => `${w.file} ${w.kind}`), ['lib/notes.js delete', 'lib/notes.js update'])

  // The same code: passes, and says the two are known.
  let r = run(dir)
  assert.equal(r.code, 0)
  assert.match(r.out, /No new unchecked updates or deletes\.\n2 already in the baseline/)

  // Lines added above move both writes down: still matched, still passes.
  writeFileSync(join(dir, 'lib', 'notes.js'), "// a comment\nimport x from 'y'\n\n" + two)
  r = run(dir)
  assert.equal(r.code, 0, r.out)

  // A new unchecked write fails, and only that one is listed.
  writeFileSync(join(dir, 'lib', 'more.js'), "await supabase.from('bids').update({ won: true }).eq('id', id)\n")
  r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /^lib[\\/]more\.js:1 {2}\.update\(\)/m)
  assert.doesNotMatch(r.out, /notes\.js/)
  assert.match(r.out, /1 new write to check\./)

  // --no-baseline shows everything.
  r = run(dir, '--no-baseline')
  assert.match(r.out, /3 writes to check\./)
})

test('the same line twice counts twice, and a fixed write is pointed out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-base-'))
  const line = "await supabase.from('notes').delete().eq('id', id)\n"
  writeFileSync(join(dir, 'a.js'), line + line)
  assert.equal(run(dir, '--save-baseline').code, 0)

  // A third copy of the same line is new.
  writeFileSync(join(dir, 'a.js'), line + line + line)
  assert.equal(run(dir).code, 1)

  // Fix one: passes, and says one is fixed.
  writeFileSync(join(dir, 'a.js'), line + "await supabase.from('notes').delete().eq('id', id).select('id')\n")
  const r = run(dir)
  assert.equal(r.code, 0)
  assert.match(r.out, /1 in the baseline is fixed now\. Run with --save-baseline to drop it\./)
})

test('a renamed file is moved, not new, and a moved line that changed is new', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-base-'))
  mkdirSync(join(dir, 'lib'))
  writeFileSync(join(dir, 'lib', 'notes.js'), two)
  assert.equal(run(dir, '--save-baseline').code, 0)

  // The whole file renamed: both writes are moved, the run passes and says so.
  renameSync(join(dir, 'lib', 'notes.js'), join(dir, 'lib', 'records.js'))
  let r = run(dir)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /No new unchecked updates or deletes\./)
  assert.match(r.out, /Moved, not new: lib\/notes\.js -> lib[\\/]records\.js:2\./)
  assert.match(r.out, /Moved, not new: lib\/notes\.js -> lib[\\/]records\.js:5\./)
  assert.doesNotMatch(r.out, /fixed now/)

  // Saved again, the new place is the baseline.
  assert.equal(run(dir, '--save-baseline').code, 0)
  assert.equal(run(dir).code, 0)

  // Cut to another file and changed on the way: new, and the old one is fixed.
  writeFileSync(join(dir, 'lib', 'records.js'), two.replace("update({ title })", "update({ title, edited: true })"))
  r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /1 new write to check\./)
  assert.match(r.out, /1 in the baseline is fixed now/)
  assert.doesNotMatch(r.out, /Moved/)
})

test('a fixed write and the same line added in another file is new, not moved', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-base-'))
  const line = "await supabase.from('notes').delete().eq('id', id)\n"
  writeFileSync(join(dir, 'a.js'), line)
  assert.equal(run(dir, '--save-baseline').code, 0)

  // a.js fixed and still there, b.js gets the same unchecked line: it must fail.
  writeFileSync(join(dir, 'a.js'), "await supabase.from('notes').delete().eq('id', id).select('id')\n")
  writeFileSync(join(dir, 'b.js'), line)
  const r = run(dir)
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /^b\.js:1/m)
  assert.doesNotMatch(r.out, /Moved/)
})

test('--baseline points at a file somewhere else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-base-'))
  const elsewhere = join(mkdtempSync(join(tmpdir(), 'sw-base-file-')), 'known.json')
  writeFileSync(join(dir, 'notes.js'), two)
  assert.equal(run(dir, '--save-baseline', '--baseline', elsewhere).code, 0)
  assert.ok(existsSync(elsewhere))
  assert.ok(!existsSync(join(dir, '.supabase-wrote-baseline.json')))
  assert.equal(run(dir, '--baseline', elsewhere).code, 0)
})
