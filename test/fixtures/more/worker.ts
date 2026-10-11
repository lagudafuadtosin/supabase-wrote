// Plain request, cannot tell. Line 2.
await fetch(`${url}/rest/v1/interviews?id=eq.${id}`, {
  method: 'PATCH',
  headers: { apikey: key, Prefer: 'return=minimal' },
  body: JSON.stringify({ probe: 1 }),
})
// Plain request that gets rows back: fine.
await fetch(`${url}/rest/v1/interviews?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
// Not the database: fine.
await fetch('https://api.resend.com/contacts/x', { method: 'DELETE' })
// Marked: fine.
await fetch(`${url}/rest/v1/logs?old=eq.true`, { method: 'DELETE' }) // wrote-ok: nothing old is fine
