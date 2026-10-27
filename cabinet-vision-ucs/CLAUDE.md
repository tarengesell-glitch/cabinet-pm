# CLAUDE.md — Cabinet Vision UCS Library

> **In the `cabinet-pm` repo:** this library lives in the `cabinet-vision-ucs/` folder and is a
> separate project from the platform. Every path in this file (`/ucs/`, `/shop/`, …) is relative to
> that folder. The platform's rules, required reading and `npm run check` don't apply here, and
> nothing here is read by the platform.

This repo is the source of truth for our shop's Cabinet Vision User Created Standards (UCSs).
Read this file fully before writing, editing, or reviewing any UCS.

## What this project is

UCSs are rules written in Cabinet Vision's macro language (VB-like, no official name) that run on
every rebuild to add, modify, or delete objects and parameters. They live inside Cabinet Vision
(Utilities → User Created Standards) and apply to ALL jobs.

**You cannot run Cabinet Vision.** Code moves between this repo and Cabinet Vision by copy-paste.
A human pastes code into the Code window, rebuilds a test job, checks the Object Tree, and reports
back. Treat every new UCS as a draft until a human confirms it works.

## Repo structure

```
/CLAUDE.md                     ← this file
/ucs/<CATEGORY>/<CAT - Name>.txt  ← one file per UCS, exact code as pasted into CV
/reference/                    ← text copied from CV help files (System Parameters,
                                  Functions & Operators, A Breakdown on UCSs, Material Parameters)
/shop/construction-standards.md ← our _CV:### standard numbers and what they control
/shop/material-schedules.md    ← schedule IDs (_M:SchedID) and what they are
/shop/custom-parameters.md     ← every custom parameter/attribute name in use, and which UCS owns it
/exports/                      ← raw "User Created Standard List" report exports, dated
/docs/UCS-INDEX.md             ← team-facing index of every UCS (see "The index" below)
/templates/new-ucs.txt         ← starter file with the header block
```

Category prefixes (extend as needed): `VAN` vanities, `BASE`, `UPR` uppers, `TALL`, `DRW` drawers,
`SHF` shelves, `DOOR`, `CNC` machining/operations, `LBL` labels/reports, `GEN` general.

## Rules for Claude

1. **Check before inventing.** Before using any parameter, constant, or function name, look it up in
   `/reference/` or in existing UCSs in `/ucs/`. If you can't find it, mark the line
   `;VERIFY: <what to check>` — never present a guessed name as fact.
2. **Never guess shop values.** Construction standard numbers, schedule IDs, part names and material
   names come from `/shop/`. If missing, ask, or mark `;VERIFY`.
3. **Check for collisions.** Before creating a custom parameter, check `/shop/custom-parameters.md`
   and existing UCSs. Add every new name there.
4. **Reuse proven patterns** from existing UCSs over new approaches.
5. **Flag orientation guesses.** Miter sides, axis directions, FACEWP values and rotation depend on how
   the part is built. Mark these `;VERIFY: orientation` — the human will adjust after a test rebuild.
6. **Give the human a test plan** with every new or changed UCS: what to place in a test job, what to
   toggle, what to look for in the Object Tree / 3D view / S2M preview, and edge cases to try.
7. **Keep the index and custom-parameter list in sync** in the same commit as any UCS change.
8. Commit messages: `<CAT>: <UCS name> — <what changed>`.

## Syntax reference

**Comments:** `;` — everything after is ignored. **The first line must be a comment**; it also becomes
the description shown in the UCS list.

**For Each:** exactly ONE per UCS, at the top. Names the target objects.
```
For Each Cab Assembly
For Each AS Part            ;adjustable shelf
For Each AS|FS Part         ;| for multiple
For Each *HBORE Linebore    ;* and ? wildcards
```
Part codes come from the Object Tree (e.g. AS adjustable shelf, FS fixed shelf, BS drawer box side,
DG drawer guide, UB unfinished back, LF finished left end, TS top stretcher, NA nailer).

**Conditions:** `If … Then` / `Else` / `End If`. Every If needs its own End If
(missing ones cause "unexpected end of UCS"). Use `Exit` to stop the UCS early.

**Operators:**
- `==` compares, `=` assigns. (`If X == 0 Then` vs `X = 0`)
- `=` assigns an *equation* (stays live); `:=` assigns the *calculated value* at that moment.
- `!=` not equal; `and`, `or`; `<`, `<=`, `>`, `>=`.
- Strings in single quotes: `'Floating Vanity?'`, `'BD*'`.

**Null vs 0:** a parameter that doesn't exist is Null; one set to 0 is not Null. But testing a
non-existent parameter for a value returns 0 — so `If X == 0` fires for BOTH missing and zero.
Use `== null` to test existence.

**Exit filters:** to INCLUDE only certain values, use `!=` joined with AND; to EXCLUDE certain values,
use `==` joined with OR.
```
If t_guide_sched != 143 and t_guide_sched != 192 Then
  Exit
End If
```

**Adding objects:**
```
Dim BOARD as New Part
BOARD.Visible = True
BOARD.DX = ...   BOARD.DY = ...   BOARD.DZ = ...   ;size
BOARD.X = ...    BOARD.Y = ...    BOARD.Z = ...    ;position
BOARD.AX = ...   BOARD.AY = ...   BOARD.AZ = ...   ;rotation
BOARD.Name = 'Bullnose'
```
New operations must attach to a Part: `NEWOP.Owner = Owner`.
Thickness (DZ) of a part normally comes from its material — don't set it unless needed.

**Special settings:** `QTY = 0` deletes the object. `X Adjust Add 2` / `Adjust Mult 1.5` modify the
current value. `REPT` / `SPCNG` for boring repeat and spacing. `UCSMOD = 1` lets UCSs modify
manually added parts.

**Units:** default imperial. `300mm`, `12in`, `Imp(x)` converts mm to inches.

**The basic 9:** X/Y/Z position; DX width, DY length (part) or height (assembly/wall),
DZ thickness (part) or depth (assembly/wall); AX/AY/AZ rotation (applied X, then Y, then Z;
counterclockwise positive). Positions are relative to the parent.

**Tree navigation:**
- `:` up one level (parent). `::` up two. `:DY` = parent's length.
- `.` down to a child (`Case.DE.DY`, `Cab.Class`).
- `@` picks among same-named siblings (`FS@2.DY`, `face.mr@2._m:dz`).
- Example: from a drawer box side to its drawer guide's schedule: `::DG._M:SchedID`.
- If a parameter isn't found on an object, CV searches up the tree; if nothing, it returns 0.

**Useful references:**
- `_CV:238` — reads construction method standard #238 (number is shop-specific; see `/shop/`).
- `_M:DZ` material thickness, `_M:MatID`, `_M:SchedID`. Rough thickness exists only on solid wood
  board materials → reliable hardwood vs sheet-goods filter.
- `FACEWP` — face work plane: 1 = front (opposite origin), 2 = back (origin side).
- `BAND` — edge banding (not "banding").
- Miter: `MiterL`, `MiterR`, `MiterT`, `MiterB` ;VERIFY exact names in /reference/.
- Many parameters (e.g. TOEH toe height, TOER toe recess) only appear in the Object Tree once
  overridden; otherwise they're inherited from the construction method.

**Data types (critical gotcha):** always declare a custom parameter's type on EVERY assignment unless
you want the default `<meas>`. CV does NOT remember the type — `t_x<deg> = 90` then `t_x = 80`
turns it back into a measurement. Undeclared loop indexers break indexed names
(`FS@1.00000000.DY` instead of `FS@1.DY`). System parameters keep their types.
;VERIFY exact type-suffix syntax against existing UCSs and /reference/.

## Sidebar attribute pattern

```
If MT_FLOATVAN == null Then
  MT_FLOATVAN.boolean = 0              ;default false
  MT_FLOATVAN.style = 1                ;1 = sidebar attribute (others: note, hidden)
  MT_FLOATVAN.description = 'Floating Vanity?'
End If
```
Other types: `measure`, `integer`, `text`, `angle`.
Dependent attributes (e.g. a height field) are created only when the parent toggle is true and
deleted in the `Else` branch so they disappear when off. ;VERIFY delete syntax in /reference/.

## Standard UCS structure (five blocks)

```
;<Plain-language one-line summary — shows in the UCS list>
;APPLIES TO: <objects / classes>
;TRIGGER:    <sidebar attribute (name, type, default) OR "automatic: <condition>">
;CREATES:    <custom parameters / attributes / parts>
;DEPENDS ON: <construction method conditions, other UCSs, list position>
;READS:      <_CV:### standards, schedule IDs, key system parameters>
;ORDER:      <Pre-build on/off; must run before/after X>
;CHANGELOG:  YYYY-MM-DD <initials> — <change>

For Each <target>

;--- 1. OFF-SWITCH / FILTERS ---
;Exit early for anything this UCS should never touch

;--- 2. CONTROLS ---
;Attributes and custom parameters (If X == null Then ...)

;--- 3. ACTIONS ---
;Modifications, new parts/operations, sizing

;--- 4. CLEANUP ---
;Close remaining End Ifs; delete t_ temporary parameters
```
The **DEPENDS ON** line is mandatory when construction method conditions are involved — that
behaviour is invisible from the UCS side.

## Conventions

- **Custom parameter prefix:** `MT_` for our persistent custom parameters/attributes
  ;(change to the shop's chosen prefix). `t_` for temporary parameters — delete them by the end
  of the UCS so the Object Tree stays clean.
- Never reuse an existing system parameter name; check `/reference/` system parameters.
- **Indent** every nested If (2 spaces). Push code fully left before indenting.
- **Comment the why**, especially any hard-coded number (`;5/8 max side for Blum 563H`).
- **UCS list names:** `<CAT> - <Name>` (e.g. `VAN - Floating Vanity`). Do NOT reorder the
  CV list alphabetically — list order is evaluation order (top to bottom; later UCSs can
  override earlier ones). Record required order in the ORDER line.
- **Pre-build:** if a UCS sets values the build depends on (e.g. toe height), it likely needs
  Pre-build on. The floating vanity behaved backwards until Pre-build was enabled.

## Best practices

1. **Don't hard-code.** Defaults follow the construction method (`_CV:###`) so designers keep control
   and future standard changes flow through. Size off the parent (`:DY`, `DZ + 1`) so parts follow
   the cabinet. Hard-code only fixed shop rules, with a comment explaining why.
2. **Automate fully when no decision is needed.** If the rule can be inferred from the cabinet's data
   (schedule, material, size), use filters and no toggle. Add a sidebar attribute only for genuine
   designer choices.
3. **Scope tightly.** Filter by class/type/schedule so attributes only appear on relevant objects,
   and Exit early so the UCS does minimal work (UCS complexity contributes to slow rebuilds).
4. **Split work between UCS and construction method Conditions.** E.g. condition `MT_FLOATVAN==1`
   removes the nailer, zeroes back scribe, changes back material — set at system level.
5. **Minimize duplication.** Put only what differs inside an If (e.g. left vs right side: branch on
   `AZ` for the X position only, not the whole block).
6. **Build incrementally.** Start with rough numbers to see where things land, then make them smart.
   Change one thing per test.
7. **Use reference parameters while debugging** (write the value you're filtering on to a visible
   `t_` parameter, check it in the Object Tree), then remove them when done.

## Designer-facing usability

- Toggles phrased as questions (`'Add Bullnose?'`); units in measure labels (`'Bullnose Height (in)'`);
  designer vocabulary, never parameter names.
- A designer who ignores every toggle must still get a correct standard cabinet.
- Hide dependent options until their parent is on.
- For very common variants, a catalog object with the toggle preset is fine — still one UCS behind it.

## The index (/docs/UCS-INDEX.md)

One entry per UCS, sorted by category:

| UCS (list name) | What it does | Applies to | Designer sees | Auto trigger | CM conditions | List position / Pre-build | Owner |
|---|---|---|---|---|---|---|---|

Designers search it ("is there something that does X?"); maintainers check it before writing a
new UCS. Rebuild it from the latest `/exports/` report and flag any UCS missing a header block or
missing from the index.

## Workflow

**New UCS:** read this file → check index for overlap → check /shop/ and /reference/ → draft from
`/templates/new-ucs.txt` → mark VERIFY lines → write test plan → human tests in CV → apply fixes →
update index and custom-parameters list → commit.

**Edit made directly in CV:** human pastes the updated code back into the repo file; Claude
diffs it, updates the changelog line, index, and custom-parameters list.

**Sync check:** export Report Center → "User Created Standard List" to `/exports/YYYY-MM-DD.txt`.
Compare against `/ucs/` and report anything in CV but not in the repo (or vice versa) or different.

## First-time setup tasks

1. Create the folder structure above and `/templates/new-ucs.txt`.
2. Parse the first `/exports/` report into one file per UCS in `/ucs/<CATEGORY>/`, guessing categories
   and listing guesses for the human to confirm.
3. Build `/shop/custom-parameters.md` from every custom parameter found.
4. Build `/docs/UCS-INDEX.md`; flag UCSs with no header, unclear purpose, hard-coded numbers,
   duplicated logic, or leftover temporary parameters.
5. List what's missing from `/reference/` and `/shop/` for the human to supply.

**Status (2026-10-27):** task 1 done. Tasks 2–4 wait on the first export in `/exports/`.
Task 5 is in `/README.md` ("What's still needed").

## Known reference caveats

- Hexagon's help Sample #1 mixes `=` and `==` in conditions — use `==` for comparisons.
- Hexagon's Sample #6 sets `VBORE.DY` twice (second likely meant DZ).
- The Wikibooks "Last Mile" Exit example uses `=` in conditions and omits the Exit line — follow
  its logic, not its code.
- Syntax can vary between CV versions; prefer patterns proven in our own `/ucs/` files.

Sources: Hexagon CABINET VISION 2026 help ("A Breakdown on UCSs"); Planit Canada "UCS for Beginners"
(floating vanity); bullnose-shelf and drawer-side-route tutorials; Wikibooks "Cabinet Vision:
The Last Mile" (UCS structure and techniques); Craftsman Engineering UCS tutorials.
