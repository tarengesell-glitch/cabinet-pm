"""Builds the pilot's review page from the renders and qa.json: <out>/sheet/index.html plus JPEG copies.

Run: .venv/bin/python -I report/contact_sheet.py jobs/pilot.json output/pilot
"""
import html
import json
import pathlib
import sys

import cv2

TESTS = [
    ("paint", "Paint colour", "Five Sherwin-Williams shortlist colours, each a full render. Dark cabinets darken the "
     "whole room, as they do in life."),
    ("door", "Door style", "Same kitchen, same paint; only the doors change. Rail and stile widths and the raised "
     "panel's bevel are modelled to size."),
    ("handle", "Handle length", "Brushed nickel bar pulls at 5 1/2\", 8\" and 12\" overall. Each visible pull is "
     "measured in the image against its exact length projected through the camera."),
    ("waterfall", "Waterfall island end", "The counter runs down both island ends to the floor. Shown with the "
     "white minimal counter and with dark grey heavy veining."),
    ("stain", "Stain on wood", "Rift white oak, from a real veneer scan, in Natural and Espresso. The stain tints "
     "are set by eye for the pilot; the real library anchors each stain to an approved reference photo."),
]
LABELS = {
    "base": "Base: Pure White shaker, 5 1/2\" pulls",
    "paint_agreeable_gray": "Agreeable Gray SW 7029", "paint_pewter_green": "Pewter Green SW 6208",
    "paint_iron_ore": "Iron Ore SW 7069", "paint_naval": "Naval SW 6244",
    "door_slab": "Slab", "door_slim_shaker": "Slim shaker", "door_raised_panel": "Raised panel",
    "handle_8": "8\" pulls", "handle_12": "12\" pulls",
    "waterfall_white": "Waterfall, pure white minimal", "waterfall_dark_heavy": "Waterfall, dark grey heavy",
    "stain_white_oak_natural": "Rift white oak, Natural", "stain_white_oak_espresso": "Rift white oak, Espresso",
}


def jpg(src: pathlib.Path, dst: pathlib.Path, width=None):
    img = cv2.imread(str(src))
    if img is None:
        raise FileNotFoundError(src)
    if width:
        h = int(img.shape[0] * width / img.shape[1])
        img = cv2.resize(img, (width, h), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(dst), img, [cv2.IMWRITE_JPEG_QUALITY, 88])


def chip(ok, text):
    return f'<span class="chip {"ok" if ok else "bad"}">{html.escape(text)}</span>'


def figure(name, label, chips=""):
    return (f'<figure><a href="img/{name}.jpg"><img src="img/{name}_s.jpg" alt="{html.escape(label)}" '
            f'loading="lazy" width="800" height="533"></a><figcaption><span>{html.escape(label)}</span>'
            f'{chips}</figcaption></figure>')


def main():
    job = json.loads(pathlib.Path(sys.argv[1]).read_text())
    out = pathlib.Path(sys.argv[2])
    qa = json.loads((out / "qa.json").read_text())
    sheet = out / "sheet"
    (sheet / "img").mkdir(parents=True, exist_ok=True)
    rows = {r["id"]: r for r in qa["variants"]}
    files = []
    for v in job["variants"]:
        src = out / v["id"] / "image.png"
        jpg(src, sheet / "img" / f"{v['id']}.jpg")
        jpg(src, sheet / "img" / f"{v['id']}_s.jpg", 800)
        files += [f"img/{v['id']}.jpg", f"img/{v['id']}_s.jpg"]
        if (out / v["id"] / "recolour.png").exists():
            jpg(out / v["id"] / "recolour.png", sheet / "img" / f"{v['id']}_rc.jpg")
            jpg(out / v["id"] / "recolour.png", sheet / "img" / f"{v['id']}_rc_s.jpg", 800)
            files += [f"img/{v['id']}_rc.jpg", f"img/{v['id']}_rc_s.jpg"]

    # headline numbers
    renders = [qa["base"]["render_seconds"]] + [r["render_seconds"] for r in qa["variants"]]
    avg = sum(renders) / len(renders)
    lock_ok = sum(1 for r in qa["variants"] if r["layout"]["ok"])
    worst_lock = max(r["layout"]["moved_pct"] for r in qa["variants"])
    handles = [h for r in qa["variants"] if r["test"] == "handle" for h in r["handles"]] + qa["base"]["handles"]
    worst_h = max((abs(h["error_px"]) for h in handles), default=None)
    rc = [r["recolour"] for r in qa["variants"] if "recolour" in r and r["recolour"]["from"] != "base"]
    rc_de = max(x["de2000_painted_mean"] for x in rc) if rc else None
    rc_s = max(x["seconds_total"] for x in rc) if rc else None
    renders_needed = 142 + 96 + 155 + 8  # non-colour, stains x 8 species, Tafisa decors, ~8 paint anchors
    hours = renders_needed * avg / 3600
    tiles = [
        ("Layout stays locked", f"{lock_ok} of {len(qa['variants'])}",
         f"variants keep every object in the same pixels outside the changed area (worst {worst_lock:.2f}% moved)"),
        ("Handle lengths", f"{worst_h:.1f} px" if worst_h is not None else "none",
         f"largest error across {len(handles)} measured pulls (limit 2 px)"),
        ("Re-colour", f"ΔE {rc_de:.1f}" if rc_de is not None else "n/a",
         f"worst mean colour difference from a full render when re-coloured from a nearby colour; "
         f"{rc_s:.0f} s each vs {avg / 60:.1f} min to render (under 2 is hard to see)"),
        ("Whole library", f"{hours:.0f} h",
         f"on this Mac, unattended: about {renders_needed} renders at {avg / 60:.1f} min; the 1,728 paint "
         f"colours re-coloured from 8 of them in under an hour"),
    ]

    sections = []
    for test, title, blurb in TESTS:
        ids = [v["id"] for v in job["variants"] if v["test"] == test]
        figs = []
        if test in ("door", "handle"):
            figs.append(figure("base", "Shaker (base)" if test == "door" else "5 1/2\" pulls (base)"))
        if test == "paint":
            figs.append(figure("base", "Pure White SW 7005 (base)"))
        for i in ids:
            r = rows[i]
            c = chip(r["layout"]["ok"], f"layout {r['layout']['moved_pct']:.2f}% moved")
            if "handles" in r:
                worst = max(abs(h["error_px"]) for h in r["handles"]) if r["handles"] else None
                c += chip(worst is not None and worst <= 2, f"{len(r['handles'])} pulls, worst {worst:.1f} px"
                          if worst is not None else "no pull measurable")
            c += f'<span class="chip info">{r["render_seconds"] / 60:.1f} min</span>'
            figs.append(figure(i, LABELS.get(i, i), c))
        rc_figs = []
        if test == "paint":
            for i in ids:
                x = rows[i].get("recolour")
                if x:
                    c = chip(x["de2000_painted_mean"] <= 2.0, f"ΔE {x['de2000_painted_mean']:.1f} (p95 "
                             f"{x['de2000_painted_p95']:.1f})") + f'<span class="chip info">{x["seconds_total"]:.0f} s</span>'
                    src = "white" if x["from"] == "base" else LABELS[x["from"]].split(" SW")[0]
                    rc_figs.append(figure(f"{i}_rc", f"{LABELS[i].split(' SW')[0]}, re-coloured from {src}", c))
        rc_html = (f'<h3>The same colours re-coloured from another render in about a second. From white, '
                   f'a big jump to a dark colour drifts (Iron Ore); from a nearby dark colour it matches.</h3>'
                   f'<div class="grid">{"".join(rc_figs)}</div>' if rc_figs else "")
        sections.append(f'<section id="{test}"><h2>{html.escape(title)}</h2><p class="lede">{html.escape(blurb)}</p>'
                        f'<div class="grid">{"".join(figs)}</div>{rc_html}</section>')

    fails = "".join(f"<li>{html.escape(f)}</li>" for f in qa["failures"]) or "<li>None. Every check passed.</li>"
    tiles_html = "".join(f'<div class="tile"><div class="k">{html.escape(k)}</div><div class="v">{html.escape(v)}</div>'
                         f'<div class="d">{html.escape(d)}</div></div>' for k, v, d in tiles)
    page = TEMPLATE.format(tiles=tiles_html, sections="".join(sections), fails=fails,
                           base_fig=figure("base", LABELS["base"]))
    (sheet / "index.html").write_text(page)
    (sheet / "files.json").write_text(json.dumps(files))
    print(f"wrote {sheet / 'index.html'} with {len(files)} images")


TEMPLATE = """<title>Kitchen Render Pilot</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: one column of test sections, each a grid of renders; verdict numbers up top. */
:root {{
  --bg: #F3F4F2; --panel: #FFFFFF; --fg: #1E2422; --muted: #5A6461; --line: #D9DDDA;
  --accent: #2F6F5E; --ok: #2E7D4F; --bad: #B23A2E; --info: #4D5A66;
  --display: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --body: "Source Sans 3", "Segoe UI", Arial, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #141917; --panel: #1C2220; --fg: #E6EAE8; --muted: #9AA4A0; --line: #2E3633;
  --accent: #7CC2AC; --ok: #6CC48F; --bad: #F08A7D; --info: #A9B6C2; color-scheme: dark }} }}
:root[data-theme="dark"] {{
  --bg: #141917; --panel: #1C2220; --fg: #E6EAE8; --muted: #9AA4A0; --line: #2E3633;
  --accent: #7CC2AC; --ok: #6CC48F; --bad: #F08A7D; --info: #A9B6C2; color-scheme: dark }}
body {{ background: var(--bg); color: var(--fg); font: 16px/1.55 var(--body);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 32px 64px; }}
main {{ max-width: 1240px; margin: 0 auto; display: grid; gap: 48px; }}
h1, h2, h3 {{ font-family: var(--display); text-wrap: balance; margin: 0; }}
h1 {{ font-size: clamp(28px, 4vw, 40px); font-weight: 700; letter-spacing: -0.01em; }}
h2 {{ font-size: 24px; font-weight: 700; }}
h3 {{ font-size: 17px; font-weight: 500; color: var(--muted); margin-top: 8px; }}
.eyebrow {{ font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }}
header {{ display: grid; gap: 12px; }}
header p {{ max-width: 68ch; margin: 0; color: var(--muted); }}
.tiles {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }}
.tile {{ background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 16px; display: grid; gap: 4px; align-content: start; }}
.tile .k {{ font-size: 13px; color: var(--muted); }}
.tile .v {{ font: 600 26px/1.2 var(--mono); font-variant-numeric: tabular-nums; }}
.tile .d {{ font-size: 14px; color: var(--muted); }}
section {{ display: grid; gap: 16px; }}
.lede {{ margin: 0; max-width: 72ch; color: var(--muted); }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); gap: 16px; }}
figure {{ margin: 0; display: grid; gap: 8px; min-width: 0; }}
figure img {{ width: 100%; height: auto; display: block; border-radius: 4px; border: 1px solid var(--line); background: var(--panel); }}
figure a:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }}
figcaption {{ display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; font-size: 15px; }}
figcaption > span:first-child {{ font-weight: 600; margin-right: auto; }}
.chip {{ font: 500 12px/1 var(--mono); padding: 5px 7px; border-radius: 3px; border: 1px solid currentColor; white-space: nowrap; font-variant-numeric: tabular-nums; }}
.chip.ok {{ color: var(--ok); }} .chip.bad {{ color: var(--bad); }} .chip.info {{ color: var(--info); }}
.notes {{ background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 16px 20px; display: grid; gap: 8px; }}
.notes ul {{ margin: 0; padding-left: 20px; }}
.hero figure img {{ border-radius: 6px; }}
</style>
<main>
<header>
  <div class="eyebrow">Image library pilot · L-shape with island · Blender 5.3, rendered on this Mac</div>
  <h1>Kitchen render pilot</h1>
  <p>Every image below is a full 3D render of the same kitchen from the same camera. Each test changes one thing.
  The numbers are what the automatic checks measured. The question for you: are these good enough to show a client?</p>
</header>
<div class="tiles">{tiles}</div>
<div class="hero">{base_fig}</div>
{sections}
<div class="notes">
  <h2>Check failures</h2>
  <ul>{fails}</ul>
  <h3>What the pilot leaves out</h3>
  <ul>
    <li>Other room shapes, knobs, slab handleless, slats and wainscotting, Tafisa decors.</li>
    <li>Counter colours and stain tints are set by eye; the library version anchors each one to an approved reference photo.</li>
    <li>Rift and rotary cuts use the same veneer scan for now.</li>
  </ul>
</div>
</main>
"""

if __name__ == "__main__":
    main()
