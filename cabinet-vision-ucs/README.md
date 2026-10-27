# Cabinet Vision UCS Library

The master record of every User Created Standard (UCS) we use in Cabinet Vision. When you ask
Claude to write or fix a UCS, it reads this library first, so it knows every UCS, custom
parameter and shop setting we already have, and doesn't clash with them.

Claude can't run Cabinet Vision. You paste its code into Cabinet Vision, rebuild a test job,
and tell it what happened. Nothing here counts as working until you've confirmed it.

## What's where

| Folder / file | What goes in it |
|---|---|
| `CLAUDE.md` | The rules and syntax notes Claude follows for every UCS. |
| `ucs/<CATEGORY>/` | One `.txt` file per UCS: the exact code as pasted into Cabinet Vision. |
| `reference/` | Text copied from the Cabinet Vision help files. |
| `shop/` | Our construction standard numbers, material schedules and custom parameter names. |
| `exports/` | The "User Created Standard List" report, exported from Cabinet Vision, one dated file per export. |
| `docs/UCS-INDEX.md` | One line per UCS: what it does and what designers see. Search here first. |
| `templates/new-ucs.txt` | The starting point for every new UCS. |

## What's still needed

Claude can't fill in the library until you supply these:

1. **The first export.** In Cabinet Vision: Report Center → "User Created Standard List".
   Save it as `exports/YYYY-MM-DD.txt` (today's date). Claude will split it into one file per UCS,
   build the index and the custom parameter list, and flag anything that needs tidying.
2. **Help-file text for `reference/`** (see `reference/README.md`): System Parameters,
   Functions & Operators, A Breakdown on UCSs, Material Parameters.
3. **Shop settings for `shop/`:** the construction standard numbers (`_CV:###`) we rely on, and
   our material schedule IDs. Screenshots or a pasted list are fine.
4. **Two answers:**
   - Which Cabinet Vision version are we on? (Syntax can differ between versions.)
   - What prefix should our own parameters use? `MT_` is a placeholder until you choose.
