# supabase-wrote

Know when a Supabase update or delete did not save.

When row level security blocks an **update** or **delete**, Postgres does not refuse it. The policy works as a filter: the query matches no rows, changes nothing, and comes back `200` with no error. Anything that trusts "no error" tells the user **Saved** for a write that never happened. Blocked inserts fail loudly, so this hides in the quiet paths: notes, renames, toggles, "mark as done".

`supabase-wrote` turns that silent case into an error you can catch, and gives you a command that finds every update and delete in your code that cannot tell whether it saved.

## The helper

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

### One banner for the whole app

Most save handlers catch nothing, so a thrown error alone can vanish. Listen once and show a message:

```ts
import { onNotSaved } from 'supabase-wrote'

onNotSaved((err) => showBanner(`Not saved: ${err.message}`))
```

Listeners run before the error is thrown. A listener that throws never hides the real failure.

## The finder

```sh
npx supabase-wrote find src
```

```
lib/notes.ts:9  .update() with no .select(): cannot tell if it saved
lib/notes.ts:17  .delete() with no .select(): cannot tell if it saved

2 writes to check.
```

It reads `.js`, `.ts`, `.jsx`, `.tsx`, `.vue` and `.svelte` files, skips `node_modules` and build folders, and exits with code 1 when it finds something, so it can run in CI. It is a quick text scan, not a full parser: it looks for a `.from(...)` chain with `.update(` or `.delete(` and no `.select(` after it.

## Tested against the real thing

`npm test` runs the unit and finder tests. `test/live/` runs real Postgres row level security behind PostgREST 12.2.3 (the server every Supabase project uses), called through `@supabase/postgrest-js` (what `supabase-js` uses). What the database does, and what `wrote()` makes of it:

| case | database | `wrote()` |
|---|---|---|
| change your own row | 200, one row back | saved |
| change someone else's row, blocked by row security | **200, no error, empty list** | `no-rows` |
| change a row that does not exist | 200, no error, empty list | `no-rows` |
| delete someone else's row, blocked | 200, no error, empty list | `no-rows` |
| update with no `.select()` | 204, no data | `unchecked` |
| table with no grant | 403, permission denied | `error` |
| allowed to update, not allowed to read | 200, empty list, **and nothing changed** | `no-rows` |

The last row answers a fair worry: could a user who may update a row but not read it trigger a false alarm? No. Postgres needs read rights to find the row before it can update it, so nothing changes and the empty list is the truth. Without `.select()`, that same update returns 204 and still changes nothing.

## Limits

- `no-rows` cannot tell a blocked write from a row that does not exist. Both mean nothing was saved, and the message says so.
- It does not test your policies for you. It tells you, at the moment of saving, whether the save happened.

## Licence

MIT. By Fuad Laguda.
