// Did that write actually happen.
//
// Postgres applies a row level security USING clause to UPDATE and DELETE as a
// filter, not a refusal. When a user is not allowed to change a row, the query
// matches no rows, changes nothing, and comes back 200 with an empty list. No
// error. Anything that trusts "no error" tells the user Saved for a write that
// never happened. Inserts are different: a blocked insert fails loudly.
//
// wrote() turns the quiet case into an error you can catch, and tells any
// listener so the screen can say "not saved".

/** Why a write did not save. */
export class NotSaved extends Error {
  /**
   * @param {'error' | 'no-rows' | 'unchecked'} reason
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(reason, message, cause) {
    super(message)
    this.name = 'NotSaved'
    this.reason = reason
    if (cause !== undefined) this.cause = cause
  }
}

const listeners = new Set()

/**
 * Call fn every time a write does not save, before the error is thrown.
 * Use it to show one "not saved" banner for the whole app.
 * Returns a function that removes the listener.
 * @param {(err: NotSaved) => void} fn
 */
export function onNotSaved(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function fail(err) {
  for (const fn of listeners) {
    try {
      fn(err)
    } catch {
      /* a broken listener must not hide the real failure */
    }
  }
  throw err
}

const label = (what) => (what ? ` (${what})` : '')

/**
 * Check the result of an update or delete that ends in .select().
 * Returns the saved rows. Throws NotSaved when nothing was saved.
 *
 * @template T
 * @param {{ data: T[] | T | null, error: { message: string } | null }} result
 * @param {string} [what] a few words for the message, like "rename note"
 * @returns {T[]}
 */
export function wrote(result, what) {
  const { data, error } = result ?? {}
  if (error) return fail(new NotSaved('error', `Not saved${label(what)}: ${error.message}`, error))
  if (data === null || data === undefined) {
    return fail(
      new NotSaved(
        'unchecked',
        `Cannot tell if this saved${label(what)}: end the query with .select() so the changed rows come back.`,
      ),
    )
  }
  const rows = Array.isArray(data) ? data : [data]
  if (rows.length === 0) {
    return fail(
      new NotSaved(
        'no-rows',
        `Nothing was saved${label(what)}: no row matched. Row level security blocked it, or the row does not exist.`,
      ),
    )
  }
  return rows
}

/**
 * Await a query and check it in one step.
 * @template T
 * @param {PromiseLike<{ data: T[] | T | null, error: { message: string } | null }>} query
 * @param {string} [what]
 * @returns {Promise<T[]>}
 */
export async function saved(query, what) {
  return wrote(await query, what)
}
