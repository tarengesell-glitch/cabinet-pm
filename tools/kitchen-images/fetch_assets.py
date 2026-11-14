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
    "painted_plaster_wall": "Wall surface (normal map only, so painted walls aren't perfectly flat)",
}
# Scanned 3D models (glTF with their textures): real objects make the room read as a photo.
MODELS = {
    "bar_chair_round_01": "Counter stools at the island",
    "potted_plant_02": "Plant on the floor by the open wall",
    "ceramic_vase_03": "Vase on the side-run counter",
    "wooden_bowl_02": "Bowl on the island",
}
# Outdoor light probe: what the window looks out on, and the daylight coming in.
HDRIS = {"residential_garden": "Daylight and the view through the window"}
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
    for asset, purpose in MODELS.items():
        entry = get_json(f"https://api.polyhaven.com/files/{asset}")["gltf"][RES]["gltf"]
        folder = ASSETS / "models" / asset
        (folder / "textures").mkdir(parents=True, exist_ok=True)
        parts = [(entry["url"], folder / f"{asset}.gltf", entry.get("md5"))]
        parts += [(v["url"], folder / k, v.get("md5")) for k, v in entry["include"].items()]
        for url, dest, md5 in parts:
            if not (dest.exists() and md5 and hashlib.md5(dest.read_bytes()).hexdigest() == md5):
                fetch(url, dest)
            if md5 and hashlib.md5(dest.read_bytes()).hexdigest() != md5:
                print(f"{dest.name}: checksum doesn't match Poly Haven's; stopping.", file=sys.stderr)
                return 1
            record.append({"file": str(dest.relative_to(ASSETS)), "asset": asset, "purpose": purpose, "url": url,
                           "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
                           "licence": "CC0 (https://polyhaven.com/license)"})
        print(f"ok model {asset}")
    for asset, purpose in HDRIS.items():
        entry = get_json(f"https://api.polyhaven.com/files/{asset}")["hdri"][RES]["exr"]
        dest = ASSETS / f"{asset}.exr"
        if not (dest.exists() and hashlib.md5(dest.read_bytes()).hexdigest() == entry["md5"]):
            fetch(entry["url"], dest)
        if hashlib.md5(dest.read_bytes()).hexdigest() != entry["md5"]:
            print(f"{dest.name}: checksum doesn't match Poly Haven's; stopping.", file=sys.stderr)
            return 1
        record.append({"file": dest.name, "asset": asset, "purpose": purpose, "url": entry["url"],
                       "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
                       "licence": "CC0 (https://polyhaven.com/license)"})
        print(f"ok hdri {asset}")
    (HERE / "licenses.json").write_text(json.dumps(record, indent=2) + "\n")
    print(f"{len(record)} files, recorded in licenses.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
