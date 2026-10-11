# Result thrown away. Line 2.
supabase.table("notes").update({"title": "x"}).eq("id", note_id).execute()

# Kept and checked: fine.
res = supabase.table("notes").update({"title": "x"}).eq("id", note_id).execute()
if not res.data:
    raise RuntimeError("not saved")

# Wrapped in brackets and kept: fine.
res = (
    supabase.table("notes")
    .delete()
    .eq("id", note_id)
    .execute()
)

# Asks for no rows back. Line 18.
res = supabase.table("notes").update({"seen": True}, returning="minimal").eq("id", note_id).execute()

# Marked: fine.
supabase.table("notes").update({"read": True}).is_("read_at", "null").execute()  # wrote-ok: nothing unread is fine
