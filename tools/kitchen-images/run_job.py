"""Renders every variant of a job, one Blender process each, skipping ones already rendered.

Run: .venv/bin/python -I run_job.py jobs/pilot.json output/pilot [--force] [--only id,id]
A failed render stops the run with Blender's own error (rule 7).
"""
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"


def main() -> int:
    job_path, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    force = "--force" in sys.argv
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    job = json.loads(job_path.read_text())
    for v in job["variants"]:
        if only and v["id"] not in only:
            continue
        if (out / v["id"] / "meta.json").exists() and not force:
            print(f"skip {v['id']} (already rendered)")
            continue
        cmd = [BLENDER, "-b", "--factory-startup", "--python", str(HERE / "blender" / "render_job.py"), "--",
               "--job", str(job_path), "--variant", v["id"], "--out", str(out)]
        r = subprocess.run(cmd, capture_output=True, text=True)
        done = [l for l in r.stdout.splitlines() if l.startswith("RENDERED")]
        if r.returncode != 0 or not done:
            print(r.stdout[-3000:], r.stderr[-3000:], sep="\n")
            print(f"FAILED {v['id']}", file=sys.stderr)
            return 1
        print(done[0], flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
