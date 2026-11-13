"""Stainless appliances, simple but believable: they stay the same in every image."""


def build(kind, fr, name, u0, u1, H, M):
    st, blk = M["steel"], M["black_glass"]
    d = H["base_depth"]
    if kind == "dishwasher":
        fr.box(f"{name}_toe", u0, 0, 0, u1, H["toe"], d - 3, M["toe"], "appliance", bevel=0)
        fr.box(f"{name}_door", u0 + 0.06, H["toe"], 0, u1 - 0.06, H["base_top"] - 0.25, d, st, "appliance",
               bevel=1 / 16)
        fr.bar(f"{name}_handle", (u0 + 2, H["base_top"] - 3, d + 1.2), (u1 - 2, H["base_top"] - 3, d + 1.2), 0.3, st,
               "appliance")
    elif kind == "range":
        top = H["base_top"] + 1.25
        fr.box(f"{name}_body", u0 + 0.06, 0, 0, u1 - 0.06, top - 0.5, d + 1.0, st, "appliance", bevel=1 / 16)
        fr.box(f"{name}_cooktop", u0 + 0.06, top - 0.5, 0, u1 - 0.06, top, d + 0.5, blk, "appliance", bevel=1 / 16)
        fr.box(f"{name}_window", u0 + 4, 9, d + 1.0, u1 - 4, 22, d + 1.05, blk, "appliance", bevel=0)
        fr.box(f"{name}_panel", u0 + 0.06, top - 6, d + 1.0, u1 - 0.06, top - 0.5, d + 1.3, st, "appliance",
               bevel=1 / 16)
        for i in range(5):
            cu = u0 + 4 + i * (u1 - u0 - 8) / 4
            fr.bar(f"{name}_knob{i}", (cu, top - 3.2, d + 1.3), (cu, top - 3.2, d + 2.1), 0.7, M["black_metal"],
                   "appliance")
        fr.bar(f"{name}_handle", (u0 + 2.5, 25.5, d + 2.4), (u1 - 2.5, 25.5, d + 2.4), 0.4, st, "appliance")
        for i, (cu, cw) in enumerate([(u0 + 8, 0), (u1 - 8, 0), (u0 + 8, 1), (u1 - 8, 1)]):
            cv = d * 0.3 if cw == 0 else d * 0.75
            fr.bar(f"{name}_burner{i}", (cu, top, cv), (cu, top + 0.25, cv), 2.2, M["black_metal"], "appliance")
    elif kind == "fridge":
        h, dd = 70.0, 30.0
        split = 28.0
        fr.box(f"{name}_body", u0 + 0.25, 0, 0, u1 - 0.25, h, dd - 1, st, "appliance", bevel=1 / 8)
        fr.box(f"{name}_drawer", u0 + 0.25, 1, dd - 1, u1 - 0.25, split - 0.25, dd, st, "appliance", bevel=1 / 8)
        mid = (u0 + u1) / 2
        fr.box(f"{name}_doorL", u0 + 0.25, split + 0.25, dd - 1, mid - 0.1, h, dd, st, "appliance", bevel=1 / 8)
        fr.box(f"{name}_doorR", mid + 0.1, split + 0.25, dd - 1, u1 - 0.25, h, dd, st, "appliance", bevel=1 / 8)
        for cu in (mid - 1.5, mid + 1.5):
            fr.bar(f"{name}_h{cu}", (cu, split + 6, dd + 2), (cu, h - 6, dd + 2), 0.4, st, "appliance")
        fr.bar(f"{name}_hd", (u0 + 6, split - 3, dd + 2), (u1 - 6, split - 3, dd + 2), 0.4, st, "appliance")
    elif kind == "hood":
        bottom = 66.0
        fr.box(f"{name}_canopy", u0, bottom, 1, u1, bottom + 5, 21, st, "appliance", bevel=1 / 16)
        fr.box(f"{name}_tlo", u0 + 3, bottom + 5, 1, u1 - 3, bottom + 9, 15, st, "appliance", bevel=1 / 16)
        fr.box(f"{name}_duct", u0 + 9, bottom + 9, 1, u1 - 9, H["ceiling"], 11, st, "appliance", bevel=1 / 16)
    else:
        raise ValueError(f"unknown appliance {kind!r}")
