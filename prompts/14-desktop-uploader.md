Read CLAUDE.md, docs/ARCHITECTURE.md, docs/MOZAIK_EXPORT_FINDINGS.md and src/modules/mozaik-import/README.md.
Work only in desktop-uploader/ (a separate app in this repo) and the API-key parts of src/core/.

Task: a small Windows tray app that replaces manual upload.

1. Propose the stack (e.g. .NET/C# or Node + Electron/Tauri) and wait for my confirmation.
2. Watch the folder(s) where Mozaik writes its SketchUp export (path is a setting, default from the findings doc).
3. When an export appears, wait until writing finishes, collect the export files plus the saved job files,
   and warn if the export is older than the saved job ("save in Mozaik first?" / skip).
4. Upload to the existing mozaik-import endpoint using a per-device API key. The user then confirms the match in the web app.
5. Settings: API key + test connection, watched folder, start with Windows, notifications.
6. Log every failure locally and send it as an alert; show a tray notification. Never fail silently.
7. Core: API keys table (hashed), create/revoke screen for permitted users, audit logged.
8. A build script producing an installer; document unsigned-installer warnings in docs/DEVELOPMENT.md.
