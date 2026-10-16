#!/usr/bin/env node
// supabase-wrote find [folder] [--save-baseline] [--prune-baseline] [--baseline <file>] [--no-baseline]
// Lists every Supabase update or delete that cannot tell whether it saved:
// JavaScript, TypeScript, Vue, Svelte, HTML, Dart, Python, and plain fetch()
// calls to /rest/v1. Exit code 1 when any are found, or, when the folder has a
// baseline file, when any are found that the baseline does not list.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { findInDir } from '../src/find.js'
import { BASELINE_FILE, compare, pruneBaseline, readBaseline, saveBaseline } from '../src/baseline.js'

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
  --prune-baseline    drop the writes in the baseline that are fixed now. Unlike
                      --save-baseline it never adds one, so new writes still fail.
  --baseline <file>   use a baseline file somewhere else
  --no-baseline       ignore the baseline and list everything`)
  process.exit(cmd ? 2 : 0)
}

const root = resolve(dir)
const file = valueOf('--baseline') ? resolve(valueOf('--baseline')) : join(root, BASELINE_FILE)
const hits = findInDir(root)
const show = (h) => `${h.file}:${h.line}  ${h.kind.startsWith('fetch') ? h.kind : `.${h.kind}()`}, ${h.why}`
// In GitHub Actions each write is also marked on its line in the pull request.
const annotate = (h) => {
  if (process.env.GITHUB_ACTIONS !== 'true') return
  const file = join(dir, h.file).replace(/\\/g, '/').replace(/^\.\//, '')
  console.log(`::error file=${file},line=${h.line},title=supabase-wrote::${h.kind.startsWith('fetch') ? h.kind : `.${h.kind}()`}, ${h.why}`)
}

if (flag('--save-baseline')) {
  saveBaseline(file, hits)
  console.log(`Saved ${hits.length} write${hits.length === 1 ? '' : 's'} to ${file}.`)
  console.log('Commit it. From now on only writes it does not list fail.')
  process.exit(0)
}

const baseline = flag('--no-baseline') ? null : readBaseline(file)
if (flag('--prune-baseline') && !baseline) {
  console.log(`No baseline at ${file}. Save one first with --save-baseline.`)
  process.exit(2)
}
if (!baseline) {
  for (const h of hits) { console.log(show(h)); annotate(h) }
  console.log(hits.length ? `\n${hits.length} write${hits.length === 1 ? '' : 's'} to check.` : 'No unchecked updates or deletes found.')
  process.exit(hits.length ? 1 : 0)
}

const { known, fresh, moved, fixed, left } = compare(hits, baseline, (f) => !existsSync(join(root, f)))
if (flag('--prune-baseline')) {
  pruneBaseline(file, baseline, left)
  console.log(fixed ? `Dropped ${fixed} fixed write${fixed === 1 ? '' : 's'} from ${file}.` : 'Nothing in the baseline is fixed yet.')
}
for (const h of fresh) { console.log(show(h)); annotate(h) }
const lines = []
lines.push(fresh.length ? `\n${fresh.length} new write${fresh.length === 1 ? '' : 's'} to check.` : 'No new unchecked updates or deletes.')
if (known.length) lines.push(`${known.length} already in the baseline. Run with --no-baseline to see them.`)
for (const h of moved) lines.push(`Moved, not new: ${h.from} -> ${h.file.replace(/\\/g, '/')}:${h.line}. Run with --save-baseline to record the new place.`)
if (fixed && !flag('--prune-baseline')) lines.push(`${fixed} in the baseline ${fixed === 1 ? 'is' : 'are'} fixed now. Run with --prune-baseline to drop ${fixed === 1 ? 'it' : 'them'}.`)
console.log(lines.join('\n'))
process.exit(fresh.length ? 1 : 0)
