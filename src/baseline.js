// A baseline: the unchecked writes a project already has, saved in a file it
// commits, so CI fails only on new ones.
//
// Without it the finder fails on every unchecked write on every run, so a
// project with forty of them goes red on day one and stays red until somebody
// quietly deletes the step (asked on r/Supabase, 11 Oct 2026).
//
// A write is matched by its file, its kind and its line of code with the
// spacing evened out, never by line number, so code moving up or down does not
// break it. The same line twice in one file is counted twice.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export const BASELINE_FILE = '.supabase-wrote-baseline.json'

const keyOf = (h) => `${h.file.replace(/\\/g, '/')}|${h.kind}|${h.code}`

/** Saves these writes as the baseline. */
export function saveBaseline(path, hits) {
  const counts = new Map()
  for (const h of hits) counts.set(keyOf(h), (counts.get(keyOf(h)) ?? 0) + 1)
  const writes = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => {
    const [file, kind, ...code] = key.split('|')
    return { file, kind, code: code.join('|'), count }
  })
  const body = {
    about: 'Unchecked Supabase writes this project already had when the baseline was saved. `supabase-wrote find` fails only on writes not listed here. Fix one and run `supabase-wrote find --save-baseline` to drop it.',
    writes,
  }
  writeFileSync(path, JSON.stringify(body, null, 2) + '\n')
  return writes.length
}

/** The saved baseline as key -> count, or null when there is none. */
export function readBaseline(path) {
  if (!existsSync(path)) return null
  const body = JSON.parse(readFileSync(path, 'utf8'))
  const counts = new Map()
  for (const w of body.writes ?? []) counts.set(`${w.file}|${w.kind}|${w.code}`, w.count ?? 1)
  return counts
}

/**
 * Splits the writes found now into the ones the baseline already knows and the
 * new ones, and counts the baseline entries that are no longer there (fixed).
 */
export function compare(hits, baseline) {
  const left = new Map(baseline)
  const known = []
  const fresh = []
  for (const h of hits) {
    const k = keyOf(h)
    const n = left.get(k) ?? 0
    if (n > 0) {
      left.set(k, n - 1)
      known.push(h)
    } else fresh.push(h)
  }
  const fixed = [...left.values()].reduce((a, n) => a + n, 0)
  return { known, fresh, fixed }
}
