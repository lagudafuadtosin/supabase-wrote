#!/usr/bin/env node
// supabase-wrote find [folder]
// Lists every Supabase update or delete that cannot tell whether it saved:
// JavaScript, TypeScript, Vue, Svelte, HTML, Dart, Python, and plain fetch()
// calls to /rest/v1. Exit code 1 when any are found.
import { resolve } from 'node:path'
import { findInDir } from '../src/find.js'

const [cmd, dir = '.'] = process.argv.slice(2)
if (cmd !== 'find') {
  console.log('Usage: supabase-wrote find [folder]\n\nLists Supabase updates and deletes that cannot tell whether they saved.\nMark one where zero rows is expected with a "wrote-ok" comment.')
  process.exit(cmd ? 2 : 0)
}

const root = resolve(dir)
const hits = findInDir(root)
for (const h of hits) console.log(`${h.file}:${h.line}  ${h.kind.startsWith('fetch') ? h.kind : `.${h.kind}()`}, ${h.why}`)
console.log(hits.length ? `\n${hits.length} write${hits.length === 1 ? '' : 's'} to check.` : 'No unchecked updates or deletes found.')
process.exit(hits.length ? 1 : 0)
