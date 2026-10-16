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

// A formatter that swaps quotes or adds a trailing semicolon or comma does not
// change the query, so those are evened out before matching. Old baselines are
// read through the same step, so they keep matching.
export const norm = (code) => code.replace(/"/g, "'").replace(/[;,]+\s*$/, '').trim()

const keyOf = (h) => `${h.file.replace(/\\/g, '/')}|${h.kind}|${norm(h.code)}`

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

/**
 * Drops the baseline entries that compare() found fixed, and keeps everything
 * else, moved writes included. Unlike saving, it never adds a write that is not
 * already listed, so it cannot be used to wave a new one through.
 */
export function pruneBaseline(path, baseline, left) {
  const writes = [...baseline]
    .map(([key, count]) => [key, count - (left.get(key) ?? 0)])
    .filter(([, count]) => count > 0)
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([key, count]) => {
      const [file, kind, ...code] = key.split('|')
      return { file, kind, code: code.join('|'), count }
    })
  const body = JSON.parse(readFileSync(path, 'utf8'))
  body.writes = writes
  writeFileSync(path, JSON.stringify(body, null, 2) + '\n')
}

/** The saved baseline as key -> count, or null when there is none. */
export function readBaseline(path) {
  if (!existsSync(path)) return null
  const body = JSON.parse(readFileSync(path, 'utf8'))
  const counts = new Map()
  for (const w of body.writes ?? []) {
    const k = `${w.file}|${w.kind}|${norm(w.code)}`
    counts.set(k, (counts.get(k) ?? 0) + (w.count ?? 1))
  }
  return counts
}

/**
 * Splits the writes found now into the ones the baseline already knows, the
 * ones that moved to another file, and the new ones, and counts the baseline
 * entries that are no longer there (fixed).
 *
 * A moved write is a new one whose kind and line of code match a baseline entry
 * whose file no longer exists, so a renamed file does not fail. A line pasted
 * into another file while its old file is still there is new, because a fixed
 * write and an unrelated new one can share the same line of code. A line that
 * moved and changed is new too, because the query itself is different.
 */
export function compare(hits, baseline, fileGone = () => false) {
  const left = new Map(baseline)
  const known = []
  let fresh = []
  for (const h of hits) {
    const k = keyOf(h)
    const n = left.get(k) ?? 0
    if (n > 0) {
      left.set(k, n - 1)
      known.push(h)
    } else fresh.push(h)
  }
  const moved = []
  const paired = new Set()
  for (const h of fresh) {
    const from = [...left].find(([k, n]) => n > 0 && k.slice(k.indexOf('|') + 1) === `${h.kind}|${norm(h.code)}`
      && fileGone(k.slice(0, k.indexOf('|'))))
    if (!from) continue
    left.set(from[0], from[1] - 1)
    paired.add(h)
    moved.push({ ...h, from: from[0].slice(0, from[0].indexOf('|')) })
  }
  fresh = fresh.filter((h) => !paired.has(h))
  const fixed = [...left.values()].reduce((a, n) => a + n, 0)
  return { known, fresh, moved, fixed, left }
}
