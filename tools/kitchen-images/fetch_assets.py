"""Downloads the pilot's CC0 textures from Poly Haven into assets/, and records each file's
source, licence and SHA-256 in assets/LICENSES.json (committed as licenses.json next to this file).

Run: .venv/bin/python -I fetch_assets.py
Every texture is CC0 (https://polyhaven.com/license). A file that can't be fetched stops the run
with the reason (CLAUDE.md rule 7): no partial asset set is left looking complete.
"""
import hashlib
import json
import pathlib
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE / "assets"
RES = "2k"

# Poly Haven asset id -> what it is for. Maps (kinds) fetched for each: colour, normal, roughness.
TEXTURES = {
    "white_oak_veneer": "Rift white oak cabinet fronts (stain tests)",
    "red_oak_veneer": "Red oak cabinet fronts",
    "white_maple_veneer": "Maple cabinet fronts",
    "cherry_veneer": "Cherry cabinet fronts",
    "walnut_veneer": "Walnut cabinet fronts",
    "plank_flooring_02": "Kitchen floor (first try; too knotty)",
    "laminate_floor_02": "Kitchen floor",
}
MAPS = {"Diffuse": "diff", "nor_gl": "nor", "Rough": "rough"}


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "kitchen-images-pilot/1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fetch(url: str, dest: pathlib.Path) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "kitchen-images-pilot/1"})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    dest.write_bytes(data)
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    ASSETS.mkdir(exist_ok=True)
    record = []
    for asset, purpose in TEXTURES.items():
        files = get_json(f"https://api.polyhaven.com/files/{asset}")
        for key, short in MAPS.items():
            try:
                entry = files[key][RES]["jpg"]
            except KeyError:
                print(f"Poly Haven has no {RES} jpg {key} map for {asset}; stopping.", file=sys.stderr)
                return 1
            dest = ASSETS / f"{asset}_{short}.jpg"
            if dest.exists() and entry.get("md5") and hashlib.md5(dest.read_bytes()).hexdigest() == entry["md5"]:
                sha = hashlib.sha256(dest.read_bytes()).hexdigest()  # already here and unchanged
            else:
                sha = fetch(entry["url"], dest)
            if entry.get("md5") and hashlib.md5(dest.read_bytes()).hexdigest() != entry["md5"]:
                print(f"{dest.name}: checksum doesn't match Poly Haven's; stopping.", file=sys.stderr)
                return 1
            record.append({"file": dest.name, "asset": asset, "purpose": purpose, "url": entry["url"],
                           "sha256": sha, "licence": "CC0 (https://polyhaven.com/license)"})
            print(f"ok {dest.name}")
    (HERE / "licenses.json").write_text(json.dumps(record, indent=2) + "\n")
    print(f"{len(record)} files, recorded in licenses.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
