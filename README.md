# supabase-wrote

Know when a Supabase update or delete did not save, and why.

When row level security blocks an **update** or **delete**, Postgres does not refuse it. The policy works as a filter: the query matches no rows, changes nothing, and comes back `200` with no error. Anything that trusts "no error" tells the user **Saved** for a write that never happened. Blocked inserts fail loudly, so this hides in the quiet paths: notes, renames, toggles, "mark as done".

`supabase-wrote` gives you three things:

1. **`wrote()`**: turns the silent case into an error you can catch, at the moment of saving.
2. **The finder**: a command that lists every update and delete in your code that cannot tell whether it saved. It fails CI on new ones.
3. **`policies.sql`**: a read-only check that lists every table where updates or deletes will silently do nothing, and which policy is missing.

## 1. The helper

```sh
npm install supabase-wrote
```

End the update or delete with `.select()`, so the changed rows come back, and pass the result to `wrote()`:

```ts
import { wrote } from 'supabase-wrote'

const result = await supabase.from('notes').update({ title }).eq('id', id).select('id')
wrote(result, 'rename note') // returns the saved rows, or throws NotSaved
```

Or in one step:

```ts
import { saved } from 'supabase-wrote'

await saved(supabase.from('notes').delete().eq('id', id).select('id'), 'delete note')
```

`NotSaved` has a `reason`:

| reason | what happened |
|---|---|
| `no-rows` | No row matched, so nothing changed. Row level security blocked it, or the row does not exist. |
| `error` | The database refused it. The original error is on `err.cause`. |
| `unchecked` | The query did not end in `.select()`, so there is no way to tell. |

Using `.select().single()` for a one-row save? On zero rows PostgREST answers with error `PGRST116` ("The result contains 0 rows"). `wrote()` reports that as `no-rows` too, so the same check works either way.

### One banner for the whole app

Most save handlers catch nothing, so a thrown error alone can vanish. Listen once and show a message:

```ts
import { onNotSaved } from 'supabase-wrote'

onNotSaved((err) => showBanner(`Not saved: ${err.message}`))
```

Listeners run before the error is thrown. A listener that throws never hides the real failure.

### Edge Functions (Deno)

```ts
import { wrote } from 'npm:supabase-wrote'
```

## 2. The finder

```sh
npx supabase-wrote find .
```

```
lib/notes.ts:9  .update(), no .select() after it: cannot tell if it saved
pages/bids.html:3  .update(), no .select() after it: cannot tell if it saved
worker.ts:235  fetch PATCH, no "return=representation" or "count=exact": cannot tell if it saved
jobs/clean.py:2  .update(), result never checked: data is [] when nothing saved

4 writes to check.
```

What it reads:

| files | what it looks for |
|---|---|
| `.js` `.ts` `.jsx` `.tsx` `.mjs` `.cjs` `.vue` `.svelte` `.astro` `.html` | a `.from(...)` chain with `.update(` or `.delete(` and no `.select(` after it |
| `.dart` (Flutter) | the same rule, because `supabase_flutter` also returns nothing without `.select()` |
| plain `fetch()` to `/rest/v1/` | `PATCH` or `DELETE` with no `Prefer: return=representation` or `count=exact`, so no rows or count come back |
| `.py` | a `.table(...)` or `.from_(...)` chain with `.update(` or `.delete(` whose result is never kept, or that asks for `returning="minimal"` |

It skips `node_modules`, build folders and virtual environments, and exits with code 1 when it finds something, so it can guard CI. It is a quick text scan, not a full parser.

Some writes are meant to change nothing sometimes: marking messages as read when none are unread, or setting a value only once. Mark those with a `wrote-ok` comment (`//` or `#`) on the line above, on the same line, or inside the chain, and the finder skips them:

```ts
await supabase
  .from('messages')
  .update({ read_at: now }) // wrote-ok: nothing unread is fine
  .is('read_at', null)
```

## 3. Why did it not save? `policies.sql`

The most common cause is a table where a policy allows the update, but **no policy allows reading the row**. Postgres has to read a row to find it, so every update and delete there matches zero rows. Paste [`policies.sql`](policies.sql) into the Supabase SQL editor and run it. It only reads. It lists:

| level | finding |
|---|---|
| 1 | Every UPDATE (or DELETE) by this role silently changes nothing: a policy allows it, but no SELECT policy lets it find the row. |
| 2 | The role is granted UPDATE (or DELETE) but no policy allows it, so every one silently changes nothing. |

Each row comes with the line to fix it. Nothing is run for you. `service_role` skips row level security, so it is never affected and not listed.

## Other languages

The same check, without the package:

```python
# supabase-py returns the changed rows by default
res = supabase.table("notes").update({"title": title}).eq("id", note_id).execute()
if not res.data:
    raise RuntimeError("Nothing was saved: row level security blocked it, or the row does not exist")
```

```dart
// supabase_flutter: end with .select() so the changed rows come back
final rows = await supabase.from('notes').update({'title': title}).eq('id', id).select('id');
if (rows.isEmpty) throw Exception('Nothing was saved: row level security blocked it, or the row does not exist');
```

## Testing your own saves

The service_role key skips row security, so a test that saves with it always passes and can never catch a blocked write. Use it for setup and cleanup only, and run the save under test as a real signed-in user. Then test the other way round too: another user tries to change the row, and the test expects the refusal.

```ts
import { wrote, NotSaved } from 'supabase-wrote'

// admin = service_role client, for setup only. alice and bob = clients signed in as each user.
const { data: note } = await admin.from('notes').insert({ owner: aliceId, title: 'a' }).select('id').single()

// Alice can change her own note.
wrote(await alice.from('notes').update({ title: 'b' }).eq('id', note.id).select('id'))

// Bob cannot, and nothing changed.
await assert.rejects(async () => wrote(await bob.from('notes').update({ title: 'x' }).eq('id', note.id).select('id')), NotSaved)
const { data: after } = await admin.from('notes').select('title').eq('id', note.id).single()
assert.equal(after.title, 'b')
```

## What about `maxAffected()`?

PostgREST 13 can refuse an update or delete that touches **more** rows than you allow (`.maxAffected(n)` in `supabase-js`, `Prefer: max-affected` with `handling=strict`). That guards the top, not the bottom: zero rows still passes. Use both if you want both ends covered.

## Tested against the real thing

`npm test` runs the unit and finder tests. `test/live/` runs real Postgres row level security behind PostgREST 12.2.3 (the server every Supabase project uses), called through `@supabase/postgrest-js` (what `supabase-js` uses). `test/policies/` runs `policies.sql` on a table for each finding and checks the exact output. What the database does, and what `wrote()` makes of it:

| case | database | `wrote()` |
|---|---|---|
| change your own row | 200, one row back | saved |
| change someone else's row, blocked by row security | **200, no error, empty list** | `no-rows` |
| change a row that does not exist | 200, no error, empty list | `no-rows` |
| delete someone else's row, blocked | 200, no error, empty list | `no-rows` |
| update with no `.select()` | 204, no data | `unchecked` |
| table with no grant | 403, permission denied | `error` |
| allowed to update, not allowed to read | 200, empty list, **and nothing changed** | `no-rows` |
| blocked row with `.select().single()` | 406, PGRST116, 0 rows | `no-rows` |
| row found, but `WITH CHECK` refuses the new value | 403, new row violates row-level security policy | `error` |

So `USING` and `WITH CHECK` behave differently. When `USING` hides the row, the update is silent. When the row is found but `WITH CHECK` refuses the new value, Postgres raises an error. Only the silent kind needs this package, but `wrote()` reports both.

The "allowed to update, not allowed to read" row answers a fair worry: could it be a false alarm? No. Postgres needs read rights to find the row before it can update it, so nothing changes and the empty list is the truth. `policies.sql` flags that same table before anyone hits it.

## Limits

- `no-rows` cannot tell a blocked write from a row that does not exist. Both mean nothing was saved, and the message says so. `policies.sql` tells you when a policy is the cause.
- `policies.sql` reads permissive policies for `anon` and `authenticated` in the `public` schema. It does not judge what your policies' conditions allow.
- The finder is a text scan. A write built in an unusual way can slip past it, and a `wrote-ok` comment silences a false alarm.

## Licence

MIT. By Fuad Laguda.
