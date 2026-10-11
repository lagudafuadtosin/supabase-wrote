// Live test: real Postgres row level security, real PostgREST (what Supabase runs),
// real Supabase client library. Start the server first: test/live/setup.sh.
// Each case says what the database does, then what wrote() makes of it.
import { createHmac } from 'node:crypto'
import { PostgrestClient } from '@supabase/postgrest-js'
import { wrote } from '../../src/index.js'

const URL = process.env.POSTGREST_URL ?? 'http://localhost:3000'
const SECRET = 'a-test-secret-that-is-at-least-32-characters-long'

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function token(sub) {
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ role: 'authenticated', sub, exp: Math.floor(Date.now() / 1000) + 600 })
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
const as = (sub) => new PostgrestClient(URL, { headers: { Authorization: `Bearer ${token(sub)}` } })
const alice = as('alice')

let fails = 0
async function check(name, run, expect) {
  const res = await run()
  let verdict
  try {
    verdict = `saved ${wrote(res).length} row(s)`
  } catch (e) {
    verdict = `NotSaved: ${e.reason}`
  }
  const ok = verdict === expect
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}\n     database: status ${res.status}, error ${res.error ? JSON.stringify(res.error.message) : 'none'}, data ${JSON.stringify(res.data)}\n     wrote(): ${verdict}${ok ? '' : `   (expected ${expect})`}`)
}

await check('alice renames her own note', () => alice.from('notes').update({ title: 'renamed' }).eq('owner', 'alice').select('id'), 'saved 1 row(s)')

await check("alice tries to rename bob's note (row security blocks it)", () => alice.from('notes').update({ title: 'hacked' }).eq('owner', 'bob').select('id'), 'NotSaved: no-rows')

await check('alice renames a note that does not exist', () => alice.from('notes').update({ title: 'x' }).eq('id', 9999).select('id'), 'NotSaved: no-rows')

await check("alice deletes bob's note (row security blocks it)", () => alice.from('notes').delete().eq('owner', 'bob').select('id'), 'NotSaved: no-rows')

await check('an update with no .select() cannot tell', () => alice.from('notes').update({ title: 'again' }).eq('owner', 'alice'), 'NotSaved: unchecked')

await check('a table with no grant at all', () => alice.from('locked').update({ body: 'x' }).eq('id', 1).select('id'), 'NotSaved: error')

// Allowed to update but not to read back. Postgres needs read rights to find a row
// before it can update it, so nothing changes: the empty list is the truth, not a
// false alarm. (Checked in psql after the run: the draft still says "first draft".)
await check('allowed to update but not to read back: nothing changes', () => alice.from('drafts').update({ body: 'edited' }).eq('id', 1).select('id'), 'NotSaved: no-rows')

// .select().single() on a blocked row: PostgREST says it out loud (PGRST116, 0 rows).
await check("alice renames bob's note with .select().single()", () => alice.from('notes').update({ title: 'hacked' }).eq('owner', 'bob').select('id').single(), 'NotSaved: no-rows')

console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
