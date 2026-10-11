#!/usr/bin/env node
// supabase-wrote find [folder]
// Lists every Supabase .update() or .delete() with no .select() after it.
// Those writes cannot tell whether they saved. Exit code 1 when any are found.
import { resolve } from 'node:path'
import { findInDir } from '../src/find.js'

const [cmd, dir = '.'] = process.argv.slice(2)
if (cmd !== 'find') {
  console.log('Usage: supabase-wrote find [folder]\n\nLists Supabase updates and deletes with no .select() after them.')
  process.exit(cmd ? 2 : 0)
}

const root = resolve(dir)
const hits = findInDir(root)
for (const h of hits) console.log(`${h.file}:${h.line}  .${h.kind}() with no .select(): cannot tell if it saved`)
console.log(hits.length ? `\n${hits.length} write${hits.length === 1 ? '' : 's'} to check.` : 'No unchecked updates or deletes found.')
process.exit(hits.length ? 1 : 0)
