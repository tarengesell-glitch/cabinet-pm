# Cabinet Vision discovery samples (Phase 0)

Put the raw material from one shop here, untouched. Claude reads it in `prompts/00-cabinet-vision-discovery.md` to write the ORDX format reference. Anything the samples don't show becomes an open question; nothing is guessed. So the more varied the jobs, the fewer the guesses.

**Use test or old jobs, or remove customer names and addresses first.** This folder is committed to git.

## What to collect

1. **15 to 30 completed jobs** from Cabinet Vision. For each job, one folder `jobs/<short-name>/` holding:
   - its **ORDX export**;
   - its **engineered output**: a cutlist and/or materials report (CSV or PDF, whatever Cabinet Vision produces);
   - a **screenshot or PDF of the plan and elevations**, so the files can be checked against the picture;
   - a short `notes.txt`: what the job is, anything unusual, and anything fixed by hand after import.
2. **Variety.** Include at least some jobs with:
   - angled walls;
   - corners (blind and lazy Susan);
   - islands and peninsulas;
   - fillers and end panels;
   - modified cabinets;
   - more than one door style or finish;
   - uppers, talls and moldings.
3. **The same job, changed once.** Export one job, change one cabinet's width, export again. Put both in `jobs/<name>-v1/` and `jobs/<name>-v2/`. This shows what a change looks like in the file.
4. **The shop's catalog / library export** in `catalog/`.
5. **Versions:** a screenshot of Cabinet Vision's Help > About and the S2M version, in `versions/`.
6. **Database (if the shop allows it):** where Cabinet Vision's SQL database lives and which SQL Server version it uses. Note it in `versions/database.txt`. Don't copy the database itself yet.

Note in `notes.txt` at the top of this folder: who at the shop helped, the date, and anything they said about how they normally import or fix jobs.
