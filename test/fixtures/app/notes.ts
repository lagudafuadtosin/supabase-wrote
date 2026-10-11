// Checked: ends in .select()
export async function rename(id: string, title: string) {
  const { data, error } = await supabase.from('notes').update({ title }).eq('id', id).select('id')
  return wrote({ data, error })
}

// Unchecked: no .select(). Line 9.
export async function archive(id: string) {
  const { error } = await supabase.from('notes').update({ archived: true }).eq('id', id)
  if (error) throw error
}

// Unchecked delete across lines, with a ")" inside a string. Line 15.
export async function remove(id: string) {
  await supabase
    .from('notes')
    .delete()
    .eq('title', 'weird ) title')
}

// Checked across lines.
export async function touch(id: string) {
  return saved(
    supabase
      .from('notes')
      .update({ seen: true })
      .eq('id', id)
      .select(),
  )
}

// Not Supabase: a Map, never reported.
const cache = new Map()
cache.delete('x')
