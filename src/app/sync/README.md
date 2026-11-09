# app/sync

Keeps the design studio's work in the shared database (owner, 2026-11-09: "live work shouldn't live solely in a browser"; saving is automatic). DECISIONS "The shared database, step 0b".

- `session.tsx`: the staff gate.
  - With the database set up (the live site), the studio and the office screens need a signed-in person on the staff list. Sign-in is by an emailed link, for invited people only.
  - Without the database settings (a developer's machine, the automated tests), work stays in this browser and the header says so, with the labelled preview user.
- `JobWorkspace.tsx`:
  - opens a studio job from the database before any screen reads it;
  - asks which copy to keep when this browser's unsaved changes clash with a newer saved version;
  - saves every change as the person works;
  - hands the save status to the header ("Saved to the shared database", "Saving…", or "Not saved" in red with the reason).

  It warns before the page is closed with changes not yet saved.
- `OfficeSync.tsx`: brings every demo client's job into step before Today and Clients read their progress.
- `job-sync.ts`: the rules (tested in `__tests__/job-sync.test.ts`, with the store's MOCKED in-memory database).
  - A job is its design choices plus each room's master copy. For each piece, the browser remembers the version it last matched.
  - **Opening:**
    - take the saved copy, unless this browser changed it;
    - save this browser's change if it was made from the newest version;
    - otherwise ask.
  - **Saving:** a piece that changed and has stayed the same for one pass (about a second) is saved as a new version made from the one it started from.
  - **If someone else saved first,** nothing is overwritten: saving stops, and reopening asks which copy to keep.
- `working-copy.ts`: reads and writes the browser copy only through the intake and designer contracts.
- `canonical.ts`: a fingerprint that ignores key order, because the database stores JSON with sorted keys.
