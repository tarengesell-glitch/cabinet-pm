/**
 * Mouldings for the 3D view (owner, 2026-11-13): a profile swept along a path of straight
 * segments, mitred at every corner, so a top trim or light valance can run along a cabinet's face
 * and wrap back along a finished end, or follow both inside faces of an L-shaped corner cabinet.
 *
 * Coordinates are a cabinet's own frame: x along the wall, z out from the wall, y up, in inches. A
 * profile point is (out, up): how far it stands out from the path (positive away from the cabinet)
 * and how high it is above the path's base. The sizes come from data (placeholder-draft.json
 * "visual.trim", PROPOSED stand-ins); only the light rail's shape is drawn here, as proportions of
 * its height and thickness.
 */
import * as THREE from 'three';

export type Pt = readonly [number, number];

/** A top trim stepping out as it rises: `steps` bands, each standing further out than the one below, set into the doors' thickness at the back. */
export function stepProfile(height: number, projection: number, steps: number, backIn: number): Pt[] {
  const out: Pt[] = [[-backIn, 0]];
  const step = height / steps;
  for (let k = 0; k < steps; k++) {
    const reach = (projection * (k + 1)) / steps;
    out.push([reach, k * step], [reach, (k + 1) * step]);
  }
  out.push([-backIn, height]);
  return out;
}

/** A flat valance hanging below its base, its face flush with the path. */
export function flatValanceProfile(height: number, thickness: number): Pt[] {
  return [
    [-thickness, 0],
    [0, 0],
    [0, -height],
    [-thickness, -height],
  ];
}

/**
 * A light rail hanging below its base, its face flush with the path (owner, 2026-11-13: "Light
 * valence shaped should be more like the attached", a maple light rail): a flat face at the top, a
 * cove cut into it, a small bead and a step at the bottom.
 */
export function lightRailProfile(height: number, thickness: number): Pt[] {
  const h = height;
  const t = thickness;
  const out: Pt[] = [
    [-t, 0],
    [0, 0],
    [0, -0.45 * h],
  ];
  // The cove: a quarter ellipse hollowed out of the face, from the flat face down to half the thickness.
  for (let k = 1; k <= 8; k++) {
    const a = Math.PI / 2 + (k / 8) * (Math.PI / 2);
    out.push([0.5 * t * Math.cos(a), -0.75 * h + 0.3 * h * Math.sin(a)]);
  }
  // The bead: a half round standing out again below the cove.
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI / 2 - (k / 8) * Math.PI;
    out.push([-0.5 * t + 0.4 * t * Math.cos(a), -0.86 * h + 0.09 * h * Math.sin(a)]);
  }
  out.push([-0.5 * t, -h], [-t, -h]);
  return out;
}

/** The unit normal of a segment, to its left as it is travelled: (-dz, dx). */
function normal(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [-dz / l, dx / l];
}

/**
 * The path in the order that puts the profile's "out" on the side `outward` points to on its first
 * segment (a path is walked so its outside is on the left).
 */
export function orient(path: readonly Pt[], outward: Pt): Pt[] {
  if (path.length < 2) return [...path];
  const n = normal(path[0]!, path[1]!);
  return n[0] * outward[0] + n[1] * outward[1] >= 0 ? [...path] : [...path].reverse();
}

/**
 * A profile swept along a path at height `base`, mitred at each corner and closed at both ends.
 * The path's outside is on its left (see `orient`). Flat-shaded, so every face of the profile reads.
 */
export function sweep(path: readonly Pt[], profile: readonly Pt[], base: number): THREE.BufferGeometry {
  const n = path.length;
  const segN = path.slice(1).map((p, j) => normal(path[j]!, p));
  // At a corner the profile is pushed along the bisector, scaled so both faces stay parallel to their segments.
  const miter = path.map((_, j): Pt => {
    const a = segN[Math.max(0, j - 1)]!;
    const b = segN[Math.min(segN.length - 1, j)]!;
    if (j === 0) return b;
    if (j === n - 1) return a;
    const d = 1 + a[0] * b[0] + a[1] * b[1];
    return d < 1e-6 ? b : [(a[0] + b[0]) / d, (a[1] + b[1]) / d];
  });
  const at = (j: number, i: number): [number, number, number] => {
    const [o, y] = profile[i]!;
    return [path[j]![0] + o * miter[j]![0], base + y, path[j]![1] + o * miter[j]![1]];
  };
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  const m = profile.length;
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < m; i++) {
      const i2 = (i + 1) % m;
      const p00 = at(j, i);
      const p01 = at(j, i2);
      const p10 = at(j + 1, i);
      const p11 = at(j + 1, i2);
      tri(p00, p10, p11);
      tri(p00, p11, p01);
    }
  const caps = THREE.ShapeUtils.triangulateShape(
    profile.map(([o, y]) => new THREE.Vector2(o, y)),
    [],
  );
  for (const j of [0, n - 1]) for (const f of caps) tri(at(j, f[0]!), at(j, f[1]!), at(j, f[2]!));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
