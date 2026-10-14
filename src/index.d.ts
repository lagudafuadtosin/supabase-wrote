export type WriteResult<T> = { data: T[] | T | null; error: { message: string; code?: string; details?: string } | null }

/** Why a write did not save. */
export declare class NotSaved extends Error {
  name: 'NotSaved'
  /**
   * error: the database refused it.
   * no-rows: no row matched, so nothing changed. Row level security blocked it, the row does not exist, or another filter in the query did not match, like a version check.
   * unchecked: the query did not end in .select(), so there is no way to tell.
   */
  reason: 'error' | 'no-rows' | 'unchecked'
  constructor(reason: NotSaved['reason'], message: string, cause?: unknown)
}

/** Call fn every time a write does not save, before the error is thrown. Returns a remover. */
export declare function onNotSaved(fn: (err: NotSaved) => void): () => void

/** Check the result of an update or delete that ends in .select(). Returns the saved rows. Throws NotSaved. */
export declare function wrote<T>(result: WriteResult<T>, what?: string): T[]

/** Await a query and check it in one step. */
export declare function saved<T>(query: PromiseLike<WriteResult<T>>, what?: string): Promise<T[]>
