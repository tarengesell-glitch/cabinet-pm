# Step 0 — Mozaik export investigation (manual, before coding)

Goal: find out exactly which files Mozaik writes and what data is in them, without help from anyone else.

Background: other tools (e.g. FileForge/JobForge) work by watching the files Mozaik writes when you click
"Generate 3D SketchUp Model" (Ctrl+Shift+S), and by reading the saved Mozaik job files. You don't need
SketchUp installed; close any SketchUp errors. That approach is reportedly reliable on Mozaik 4.1+.

## A. On the Mozaik computer (Windows)

1. Pick a TEST job with at least two rooms, with some Mozaik notes, hardware and a pricing run. Avoid real client data.
2. Save the job in Mozaik. Note the time.
3. Optional but best: download Process Monitor (Microsoft Sysinternals). Filter: Process Name contains "Mozaik",
   Operation is "WriteFile" or "CreateFile". Start capture.
4. In Mozaik click "Generate 3D SketchUp Model" (Ctrl+Shift+S). Options: Name + Number, Show Operations, Create Floor. OK.
5. Stop capture. Save the list of file paths written (File > Save as CSV).
6. Without Process Monitor, run in PowerShell (change C:\Mozaik if installed elsewhere):

   ```powershell
   Get-ChildItem C:\Mozaik -Recurse -File | Where-Object LastWriteTime -gt (Get-Date).AddMinutes(-10) |
     Select FullName, Length, LastWriteTime | Export-Csv $HOME\Desktop\mozaik-writes.csv -NoTypeInformation
   ```
   Also run it against your Documents folder and %TEMP% in case files land there.
7. Find the job's own folder (where Mozaik saves the job). Open its files in Notepad: readable text/XML or binary?
8. Change one room slightly, save, export again. Repeat steps 3–6.
9. Export the Pricing tab as CSV for the same job.
10. Screenshot the SketchUp options dialog and Mozaik's Help > About (version number).

## B. Put everything in the repo

Copy into `samples/mozaik/`:
- `export-1/` and `export-2/` — the files the button wrote, each time
- `job-folder/` — a copy of the saved job folder
- `pricing.csv`, `mozaik-writes.csv` / Process Monitor CSV, screenshots, and a note of the Mozaik version

## C. In Claude Code

"Read docs/ARCHITECTURE.md and everything in samples/mozaik/. Do not write app code. Write
docs/MOZAIK_EXPORT_FINDINGS.md covering:
- which files the SketchUp button writes, where, and their formats
- what's in the saved job folder and its format
- fields available: job (client, address, notes), rooms, cabinets, parts, dimensions, openings, materials,
  hardware, inserts, Mozaik notes, pricing runs
- whole-job or per-room; stable IDs for jobs/rooms/cabinets that survive renames (or not)
- what changed between export-1 and export-2, and how to detect a new version of a room
- how to get a web-viewable 3D model (convert to glTF/GLB?) and how hard that is
- how a stale export can be detected (export time vs job save time)
- what's missing, and open questions.
Then add the open questions to docs/DECISIONS.md."
