Read CLAUDE.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md and docs/MOZAIK_EXPORT_FINDINGS.md.
Work only in src/modules/mozaik-import/ (plus a Supabase Edge Function under supabase/functions/mozaik-import/ if needed).

Task: Mozaik import via manual upload. No desktop watcher yet.

1. An upload screen on a job: drag and drop the Mozaik export files and/or zipped job folder.
2. Store raw files untouched in Supabase Storage (bucket mozaik-imports), one folder per import. Never overwrite.
3. Parse into a validated (Zod) internal structure: job info, rooms, cabinets, parts, hardware, notes, pricing runs.
   Use the real samples in samples/mozaik/ as test fixtures.
4. Match to an existing job and room using Mozaik's stable IDs where the findings say they exist; fall back to
   job and room names. Show the match and let the user choose: new job, existing job, or leave pending.
   Never auto-create or auto-assign silently.
5. Each import of a room creates a new room_version (v1, v2...). Old versions stay viewable. Never edit an approved version.
6. Warn if the export is older than the saved Mozaik job (stale export).
7. Any unparsed or unmatched record raises an alert. Never skip silently.
8. Design the upload endpoint so a future desktop uploader can call it with a per-device API key (document the
   request format in the module README), but don't build the key system yet.

Event: mozaik.room_version_imported. Tests use the real sample files.
