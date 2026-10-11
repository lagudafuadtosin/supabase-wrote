Future<void> rename(String id, String title) async {
  // Unchecked. Line 3.
  await supabase.from('notes').update({'title': title}).eq('id', id);
  // Checked.
  final rows = await supabase.from('notes').update({'title': title}).eq('id', id).select('id');
}
