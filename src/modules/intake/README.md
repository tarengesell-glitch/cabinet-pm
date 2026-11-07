# intake

The visual intake (image selector): questions, options, images and answers per room type. Option IDs are the source of truth.

Status: **kitchen intake preview** (2026-11-07). Try it at `/intake/preview`. See `CLAUDE.md` in this folder for the rules.

## What's here

- `data/kitchen.json`: the kitchen questions, options, images and conditions, seeded from `docs/intake/kitchen.md`. This is data (CLAUDE.md rule 6): change the intake by editing this file, not the code.
- `model/intake.ts`: reads and checks an intake file. A bad file stops the app with every problem listed, for example:
  - a condition on an option that doesn't exist;
  - a condition on a later question;
  - a missing option set;
  - a duplicate ID;
  - an option with no image entry.
- `model/flow.ts`: which questions are asked given the answers so far, checking answers, and progress. Pure functions, no clock.
- `ui/`: the screen (UX_BRIEF screen 04 / V11).

## How the screen behaves

- One question at a time with large pictures. Clicking a picture picks it and moves on by itself. Number keys pick, and the arrow keys go back and forward.
- The summary on the right shows every question asked so far. Click one to go back to it.
- Each answer is picked, "not sure", skipped or "needs follow-up". The review says "all answered" only when every question asked has a picked answer.
- **Conditions** come from the data. For example, island questions are asked only for "L-Shape with Island" and "Double Island". An answer to a question that stops being asked is kept, but doesn't count.
- **Questions whose options haven't been supplied** (for example colours, handles and trims) show "Options not supplied yet" and can only be flagged for follow-up or skipped. Nothing is made up.
- **Images are placeholders.** Each is labelled "Placeholder". Shape has simple plan drawings in `public/intake/placeholders/kitchen/`. Colour tones have placeholder swatches that are not real colours. An image file that fails to load shows "Image missing" in red.
- **No prices.** The only price the intake asks for, the drawer cost at "Maximum", says "not available yet", because live pricing isn't built.
- **Saved in this browser only**, until jobs exist. Saved answers that no longer fit the intake (for example a removed option) are listed in red and not used.
- **The user is mocked** (no sign-in yet). Permissions are `intake.view` and `intake.answer`.

## Not done yet

- Real photos and drawings for every option (BUILD_PLAN 7b).
- Linking options to catalog options. The catalog has no finish or hardware options yet.
- Answers saved against a job and room. Today there are no jobs.
- Designer "confirmed" status, and presentation vs designer mode.
- Other room types (IK-7).

## Public API
`contract.ts`: `readIntake`, `KITCHEN_INTAKE`, `askedQuestions`, `setAnswer`, `checkSavedAnswers`, `progress`, `describeAnswer` and their types. AI Design will read the answers through it (OA-3).
