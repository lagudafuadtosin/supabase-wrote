import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NotSaved, onNotSaved, saved, wrote } from '../src/index.js'

test('rows back means it saved, and the rows are returned', () => {
  assert.deepEqual(wrote({ data: [{ id: 1 }], error: null }), [{ id: 1 }])
})

test('.single() gives one object, returned as a list of one', () => {
  assert.deepEqual(wrote({ data: { id: 1 }, error: null }), [{ id: 1 }])
})

test('an empty list is a silent refusal: no-rows', () => {
  assert.throws(() => wrote({ data: [], error: null }, 'rename note'), (e) => e instanceof NotSaved && e.reason === 'no-rows' && e.message.includes('rename note') && e.message.includes('does not exist'))
})

test('no data and no error means the query had no .select(): unchecked', () => {
  assert.throws(() => wrote({ data: null, error: null }), (e) => e instanceof NotSaved && e.reason === 'unchecked' && e.message.includes('.select()'))
})

test('an error from the database is passed on with its message', () => {
  const error = { message: 'permission denied for table notes' }
  assert.throws(() => wrote({ data: null, error }), (e) => e.reason === 'error' && e.message.includes('permission denied') && e.cause === error)
})

test('listeners hear every failure before it is thrown, and can be removed', () => {
  const heard = []
  const stop = onNotSaved((e) => heard.push(e.reason))
  assert.throws(() => wrote({ data: [], error: null }))
  stop()
  assert.throws(() => wrote({ data: [], error: null }))
  assert.deepEqual(heard, ['no-rows'])
})

test('a listener that throws does not hide the real failure', () => {
  const stop = onNotSaved(() => {
    throw new Error('broken banner')
  })
  assert.throws(() => wrote({ data: [], error: null }), (e) => e instanceof NotSaved)
  stop()
})

test('saved() awaits the query and checks it', async () => {
  assert.deepEqual(await saved(Promise.resolve({ data: [{ id: 2 }], error: null })), [{ id: 2 }])
  await assert.rejects(saved(Promise.resolve({ data: [], error: null })), (e) => e.reason === 'no-rows')
})
