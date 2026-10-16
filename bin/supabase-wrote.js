#!/usr/bin/env node
// supabase-wrote find [folder] [--save-baseline] [--baseline <file>] [--no-baseline]
// Lists every Supabase update or delete that cannot tell whether it saved:
// JavaScript, TypeScript, Vue, Svelte, HTML, Dart, Python, and plain fetch()
// calls to /rest/v1. Exit code 1 when any are found, or, when the folder has a
// baseline file, when any are found that the baseline does not list.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { findInDir } from '../src/find.js'
import { BASELINE_FILE, compare, readBaseline, saveBaseline } from '../src/baseline.js'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const valueOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const plain = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--baseline')
const [cmd, dir = '.'] = plain

if (cmd !== 'find') {
  console.log(`Usage: supabase-wrote find [folder] [options]

Lists Supabase updates and deletes that cannot tell whether they saved.
Mark one where zero rows is expected with a "wrote-ok" comment.

  --save-baseline     save what is found now to ${BASELINE_FILE} and pass. Commit that file.
                      From then on only writes it does not list fail.
  --baseline <file>   use a baseline file somewhere else
  --no-baseline       ignore the baseline and list everything`)
  process.exit(cmd ? 2 : 0)
}

const root = resolve(dir)
const file = valueOf('--baseline') ? resolve(valueOf('--baseline')) : join(root, BASELINE_FILE)
const hits = findInDir(root)
const show = (h) => `${h.file}:${h.line}  ${h.kind.startsWith('fetch') ? h.kind : `.${h.kind}()`}, ${h.why}`

if (flag('--save-baseline')) {
  saveBaseline(file, hits)
  console.log(`Saved ${hits.length} write${hits.length === 1 ? '' : 's'} to ${file}.`)
  console.log('Commit it. From now on only writes it does not list fail.')
  process.exit(0)
}

const baseline = flag('--no-baseline') ? null : readBaseline(file)
if (!baseline) {
  for (const h of hits) console.log(show(h))
  console.log(hits.length ? `\n${hits.length} write${hits.length === 1 ? '' : 's'} to check.` : 'No unchecked updates or deletes found.')
  process.exit(hits.length ? 1 : 0)
}

const { known, fresh, moved, fixed } = compare(hits, baseline, (f) => !existsSync(join(root, f)))
for (const h of fresh) console.log(show(h))
const lines = []
lines.push(fresh.length ? `\n${fresh.length} new write${fresh.length === 1 ? '' : 's'} to check.` : 'No new unchecked updates or deletes.')
if (known.length) lines.push(`${known.length} already in the baseline. Run with --no-baseline to see them.`)
for (const h of moved) lines.push(`Moved, not new: ${h.from} -> ${h.file.replace(/\\/g, '/')}:${h.line}. Run with --save-baseline to record the new place.`)
if (fixed) lines.push(`${fixed} in the baseline ${fixed === 1 ? 'is' : 'are'} fixed now. Run with --save-baseline to drop ${fixed === 1 ? 'it' : 'them'}.`)
console.log(lines.join('\n'))
process.exit(fresh.length ? 1 : 0)
