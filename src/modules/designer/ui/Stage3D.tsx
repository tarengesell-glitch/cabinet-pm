'use client';
/**
 * The customize screen's 3D view, ported from the owner's Kitchen Studio prototype (closet-builder's
 * studio lighting). Drawn only from the room as drawn and its PLACEHOLDER design (P6 for the room;
 * the cabinets are a placeholder until Core holds them). Sizes come from the catalog; finishes from
 * the client's design choices. A visual approximation (BUILD_SPEC 5.5): 1 unit = 1 inch.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Room, Wall } from '@/core/index';
import { direction, halfThickness, insideNormal, wallLength } from '../model/layout';
import { DRAFT_SETTINGS, itemByCode, standard, type PlaceholderCabinet, type PlaceholderDesign } from '../model/placeholder-draft';
import { GOLD } from './theme';

/** How the room looks, from the design choices (the intake's look). */
export interface FinishLook {
  readonly door: string;
  readonly baseDoor: string;
  readonly island: string;
  readonly counter: string;
  readonly style: string;
  readonly doorHw: 'handle' | 'knob' | 'none';
  readonly drawerHw: 'handle' | 'knob' | 'none';
  readonly pullFinish: string;
  readonly knobFinish: string;
  readonly doorOrient: 'vertical' | 'horizontal';
  readonly drawerTop: boolean;
}

const IN = 64;
const inch = (v: number): number => v / IN;
/** Plan (Y up) to the 3D floor: x stays, plan Y becomes −Z. */
const floor = (x: number, y: number): THREE.Vector3 => new THREE.Vector3(inch(x), 0, -inch(y));

const DOOR_T = 0.75;
const GAP = 0.125;
/** Neutral surroundings, from the prototype's studio (drawing only). */
const SURROUNDINGS = { wall: '#e6e2da', floor: '#c9b291', plinth: '#2c2c2e', steel: '#c9ccd0', black: '#18181a', glass: '#1d1f22', window: '#cfe0ea', trim: '#f6f4ef', door: '#efece6', interior: '#f3f1ec' };

interface Scene3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  root: THREE.Group | null;
  doors: THREE.Group[];
  walls: { id: string; g: THREE.Object3D; n: THREE.Vector3; c: THREE.Vector3 }[];
  mats: Map<string, THREE.Material>;
  centre: THREE.Vector3;
  /** Where the starting view looks from: across the room, facing the wall with the most cabinets. */
  facing: THREE.Vector3;
  span: number;
  fitted: boolean;
}

export function Stage3D(props: {
  room: Room;
  design: PlaceholderDesign;
  look: FinishLook;
  selected: string | null;
  doorsOpen: boolean;
  /** Bump to put the camera back to the starting view. */
  fitToken: number;
  onPick: (id: string) => void;
  onError: (reason: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const s3 = useRef<Scene3D | null>(null);
  const doorsOpen = useRef(props.doorsOpen);
  const onPick = useRef(props.onPick);
  useEffect(() => {
    onPick.current = props.onPick;
    doorsOpen.current = props.doorsOpen;
  });

  // Set up once.
  const onError = props.onError;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      onError(`The 3D view can’t start in this browser (${error instanceof Error ? error.message : String(error)}).`);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // The canvas is drawn at the screen's pixel density and shown at the size of its box.
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 8000);
    const controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minPolarAngle: 0.15, maxPolarAngle: Math.PI / 2 - 0.05 });
    // Studio light: a soft box environment plus a low sun through the window (prototype).
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x7d7a76, side: THREE.BackSide })));
    const softbox = (w: number, h: number, pos: [number, number, number], k: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k * 0.98, k * 0.95), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    softbox(70, 30, [0, 48, 15], 3.2);
    softbox(26, 60, [-48, 8, 26], 2.4);
    softbox(26, 60, [48, 4, 18], 1.3);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.035).texture;
    pm.dispose();
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0xd9d3c9, 0.45));
    const s: Scene3D = { renderer, scene, camera, controls, sun, root: null, doors: [], walls: [], mats: new Map(), centre: new THREE.Vector3(), facing: new THREE.Vector3(0, 0, 1), span: 200, fitted: false };
    s3.current = s;

    const size = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    // A click (not a drag) picks the cabinet under the pointer.
    let down: [number, number] | null = null;
    const ray = new THREE.Raycaster();
    const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !s.root) return;
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      for (const h of ray.intersectObjects(s.root.children, true)) {
        let o: THREE.Object3D | null = h.object;
        while (o && !o.userData['cabId']) o = o.parent;
        if (o) return onPick.current(String(o.userData['cabId']));
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const loop = () => {
      for (const d of s.doors) {
        const target = doorsOpen.current ? (d.userData['dir'] as number) * 1.75 : 0;
        const a = d.userData['angle'] as number;
        d.userData['angle'] = a + (target - a) * (reduce ? 1 : 0.09);
        d.rotation.y = d.userData['angle'] as number;
      }
      controls.update();
      // Cut away any wall standing between the camera and the room, with the uppers hung on it.
      const hidden = new Set<string>();
      for (const w of s.walls) {
        w.g.visible = camera.position.clone().sub(w.c).dot(w.n) > 0;
        if (!w.g.visible) hidden.add(w.id);
      }
      for (const g of s.root?.children ?? []) if (g.userData['layer'] === 'upper') g.visible = !hidden.has(String(g.userData['wallId']));
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      s.root?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const m of s.mats.values()) m.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      s3.current = null;
    };
  }, [onError]);

  // Rebuild the room whenever it, its design or its look changes.
  const { room, design, look, selected } = props;
  useEffect(() => {
    const s = s3.current;
    if (!s) return;
    if (s.root) {
      s.scene.remove(s.root);
      s.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    s.doors = [];
    s.walls = [];
    const root = new THREE.Group();
    buildRoom(s, root, room);
    for (const c of design.cabinets) {
      const g = cabinet(s, c, room, look, c.id === selected);
      if (g) root.add(g);
    }
    s.root = root;
    s.scene.add(root);
    // Sun through the first window, if any; framing from the room's size.
    const pts = room.walls.filter((w) => w.kind === 'room').flatMap((w) => [w.start_point, w.end_point]);
    const xs = pts.map((p) => inch(p.x));
    const zs = pts.map((p) => -inch(p.y));
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const cz = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
    s.span = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 60) : 200;
    s.centre.set(cx, 34, cz);
    const widths = new Map<string, number>();
    for (const c of design.cabinets) widths.set(c.wallId, (widths.get(c.wallId) ?? 0) + c.width);
    const main = room.walls.filter((w) => w.kind === 'room').sort((a, b) => (widths.get(b.wall_id) ?? 0) - (widths.get(a.wall_id) ?? 0))[0];
    if (main) {
      const m = insideNormal(room, main);
      s.facing.set(m.x, 0, -m.y);
    }
    const win = room.walls.find((w) => w.openings.some((o) => o.kind === 'window'));
    const n = win ? insideNormal(room, win) : { x: -0.6, y: -0.8 };
    const el = (35 * Math.PI) / 180;
    const dist = s.span * 2 + 200;
    s.sun.position.set(cx - n.x * Math.cos(el) * dist, Math.sin(el) * dist, cz + n.y * Math.cos(el) * dist);
    s.sun.target.position.set(cx, 0, cz);
    Object.assign(s.sun.shadow.camera, { left: -s.span, right: s.span, top: s.span, bottom: -s.span, near: 10, far: dist * 2 });
    s.sun.shadow.camera.updateProjectionMatrix();
    if (!s.fitted) {
      fit(s);
      s.fitted = true;
    }
  }, [room, design, look, selected]);

  const fitToken = props.fitToken;
  useEffect(() => {
    if (s3.current && fitToken > 0) fit(s3.current);
  }, [fitToken]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={host} data-testid="stage-3d" style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }} />
    </div>
  );
}

function fit(s: Scene3D): void {
  const r = s.renderer.domElement.getBoundingClientRect();
  const aspect = Math.max(0.5, r.width / Math.max(1, r.height));
  const dist = (s.span / (2 * Math.tan((s.camera.fov * Math.PI) / 360)) / Math.min(1, aspect)) * 1.25 + 40;
  // From across the room, a little to one side and above, looking at the main wall.
  const el = 0.6;
  const dir = s.facing.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.45).multiplyScalar(Math.cos(el) * dist);
  s.controls.target.copy(s.centre);
  s.camera.position.set(s.centre.x + dir.x, s.centre.y + Math.sin(el) * dist, s.centre.z + dir.z);
  s.controls.minDistance = dist * 0.25;
  s.controls.maxDistance = dist * 2.2;
  s.controls.update();
}

function mat(s: Scene3D, key: string): THREE.Material {
  const have = s.mats.get(key);
  if (have) return have;
  const [kind, hex = '#888888'] = key.split(':');
  const colour = new THREE.Color(hex);
  const m =
    kind === 'paint'
      ? new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.62, clearcoat: 0.06, clearcoatRoughness: 0.5, envMapIntensity: 0.85 })
      : kind === 'metal'
        ? new THREE.MeshStandardMaterial({ color: colour, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.2 })
        : kind === 'counter'
          ? new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.28, clearcoat: 0.4, envMapIntensity: 0.9 })
          : kind === 'glass'
            ? new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.08, transparent: true, opacity: 0.55 })
            : kind === 'steel'
              ? new THREE.MeshStandardMaterial({ color: colour, metalness: 1, roughness: 0.34, envMapIntensity: 1.1 })
              : new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8 });
  s.mats.set(key, m);
  return m;
}

function box(s: Scene3D, parent: THREE.Object3D, w: number, h: number, d: number, pos: [number, number, number], key: string, shadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(s, key));
  mesh.position.set(...pos);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildRoom(s: Scene3D, root: THREE.Group, room: Room): void {
  const ceiling = inch(room.ceiling_height.value);
  const roomWalls = room.walls.filter((w) => w.kind === 'room');
  // Floor: the room's outline, or a square under the walls.
  if (roomWalls.length >= 3) {
    const shape = new THREE.Shape();
    roomWalls.forEach((w, i) => (i ? shape.lineTo(inch(w.start_point.x), inch(w.start_point.y)) : shape.moveTo(inch(w.start_point.x), inch(w.start_point.y))));
    const f = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat(s, `plain:${SURROUNDINGS.floor}`));
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    root.add(f);
  }
  for (const w of roomWalls) {
    const len = inch(wallLength(w));
    const u = direction(w);
    const n = insideNormal(room, w);
    const mid = floor((w.start_point.x + w.end_point.x) / 2, (w.start_point.y + w.end_point.y) / 2);
    const g = new THREE.Group();
    g.position.copy(mid);
    // Local +z points into the room; local +x runs along the wall one way or the other.
    g.rotation.y = Math.atan2(n.x, -n.y);
    const sign = -n.y * u.x + n.x * u.y >= 0 ? 1 : -1;
    root.add(g);
    s.walls.push({ id: w.wall_id, g, n: new THREE.Vector3(n.x, 0, -n.y), c: mid.clone().add(new THREE.Vector3(n.x, 0, -n.y).multiplyScalar(inch(halfThickness(w)))) });
    const t = Math.max(inch(w.thickness?.value ?? 0), 0.5);
    box(s, g, len, ceiling, t, [0, ceiling / 2, 0], `plain:${SURROUNDINGS.wall}`);
    for (const o of w.openings) {
      const along = inch(o.offset.value + o.width.value / 2) - len / 2;
      const x = along * sign;
      const ow = inch(o.width.value);
      const oh = inch(o.height.value);
      const y = inch(o.sill_height.value) + oh / 2;
      const face = t / 2 + 0.3;
      box(s, g, ow, oh, 0.4, [x, y, face], o.kind === 'window' ? `glass:${SURROUNDINGS.window}` : o.kind === 'door' ? `plain:${SURROUNDINGS.door}` : `plain:#bdb6ab`, false);
      for (const [bw, bh, dx, dy] of [
        [2.5, oh + 2.5, -ow / 2 - 1.25, 0],
        [2.5, oh + 2.5, ow / 2 + 1.25, 0],
        [ow + 5, 2.5, 0, oh / 2 + 1.25],
        ...(o.kind === 'window' ? [[ow + 5, 2.5, 0, -oh / 2 - 1.25]] : []),
      ] as [number, number, number, number][])
        box(s, g, bw, bh, 0.8, [x + dx, y + dy, face + 0.2], `plain:${SURROUNDINGS.trim}`, false);
    }
  }
}

/** Where a cabinet stands: its centre on the floor, and which way its front faces. */
function placement(room: Room, wall: Wall, offset: number, width: number, depth: number): { at: THREE.Vector3; angle: number } {
  const u = direction(wall);
  const n = insideNormal(room, wall);
  const along = offset + width / 2;
  // On a room wall the cabinet stands against the inside face; on a floating wall it is centred on the line.
  const out = wall.kind === 'room' ? halfThickness(wall) + depth / 2 : 0;
  const x = wall.start_point.x + u.x * along + n.x * out;
  const y = wall.start_point.y + u.y * along + n.y * out;
  return { at: floor(x, y), angle: Math.atan2(n.x, -n.y) };
}

function cabinet(s: Scene3D, c: PlaceholderCabinet, room: Room, look: FinishLook, isSelected: boolean): THREE.Group | null {
  if (!DRAFT_SETTINGS.ok) return null;
  const v = DRAFT_SETTINGS.value.visual;
  const wall = room.walls.find((w) => w.wall_id === c.wallId);
  if (!wall) return null;
  const item = c.code ? itemByCode(c.code) : null;
  const w = inch(c.width);
  const toe = inch(v.toeKick);
  const counterT = inch(v.counter);
  const upperBottom = inch(v.upperBottom);
  const island = wall.kind === 'floating';
  const doorHex = island ? look.island : c.layer === 'upper' || item?.type === 'tall' ? look.door : look.baseDoor;
  const finish = `paint:${doorHex}`;
  const carcass = `paint:${SURROUNDINGS.interior}`;
  const counter = `counter:${look.counter}`;
  const dCode = c.depth ?? (c.code ? standard(c.code, 'depth') : null);
  const depthBase = c.appliance === 'fridge' ? v.fridgeDepth : c.appliance === 'range' ? v.rangeDepth : (dCode ?? standard('base_doors', 'depth') ?? 24 * IN);
  const d = inch(c.layer === 'upper' && c.appliance === 'hood' ? 20 * IN : depthBase);
  const g = new THREE.Group();
  g.userData['cabId'] = c.id;
  g.userData['wallId'] = c.wallId;
  g.userData['layer'] = c.layer;
  const top = inch(c.elevation + c.height);
  const b = (bw: number, bh: number, bd: number, pos: [number, number, number], key: string, shadow = true) => box(s, g, bw, bh, bd, pos, key, shadow);

  const front = (parent: THREE.Object3D, fw: number, fh: number, pos: [number, number, number], drawer: boolean) => {
    const frame = ({ transitional: 1, country: 2.25, classic: 2.25 } as Record<string, number>)[look.style];
    if (frame && !(drawer && fh < 7)) {
      const fr = Math.min(frame, fh / 4, fw / 4);
      const at = (dx: number, dy: number, dz: number): [number, number, number] => [pos[0] + dx, pos[1] + dy, pos[2] + dz];
      box(s, parent, fr, fh, DOOR_T, at(-fw / 2 + fr / 2, 0, 0), finish);
      box(s, parent, fr, fh, DOOR_T, at(fw / 2 - fr / 2, 0, 0), finish);
      box(s, parent, fw - 2 * fr, fr, DOOR_T, at(0, fh / 2 - fr / 2, 0), finish);
      box(s, parent, fw - 2 * fr, fr, DOOR_T, at(0, -fh / 2 + fr / 2, 0), finish);
      box(s, parent, fw - 2 * fr + 0.2, fh - 2 * fr + 0.2, 0.375, at(0, 0, -0.2), finish);
      if (look.style === 'classic' && fh > 8 && fw > 8) box(s, parent, fw - 2 * fr - 2.5, fh - 2 * fr - 2.5, 0.5, at(0, 0, 0), finish);
    } else box(s, parent, fw, fh, DOOR_T, pos, finish);
  };
  const hardware = (parent: THREE.Object3D, x: number, y: number, z: number, vertical: boolean, onDrawer: boolean) => {
    const kind = onDrawer ? look.drawerHw : look.doorHw;
    if (kind === 'none') return;
    const m = mat(s, `metal:${kind === 'knob' ? look.knobFinish : look.pullFinish}`);
    const mesh = kind === 'knob' ? new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 12), m) : new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 6.85, 16), m);
    mesh.position.set(x, y, z + 1);
    if (kind === 'handle' && !vertical) mesh.rotation.z = Math.PI / 2;
    mesh.castShadow = true;
    parent.add(mesh);
  };
  const doorsIn = (x0: number, x1: number, y0: number, y1: number, depth: number, upper: boolean) => {
    const ww = x1 - x0;
    const count = ww > 24 ? 2 : 1;
    const dw = ww / count - GAP;
    const dh = y1 - y0 - GAP;
    const cy = (y0 + y1) / 2;
    for (let k = 0; k < count; k++) {
      const dir = count === 1 ? 1 : k === 0 ? 1 : -1;
      const hinge = dir === 1 ? x0 : x1;
      const pv = new THREE.Group();
      pv.position.set(hinge, 0, depth / 2 + DOOR_T);
      const cx = dir === 1 ? dw / 2 + GAP / 2 : -dw / 2 - GAP / 2;
      front(pv, dw, dh, [cx, cy, -DOOR_T / 2], false);
      hardware(pv, cx + (dir === 1 ? dw / 2 - 1.6 : -dw / 2 + 1.6), upper ? y0 + 5 : y1 - 5, 0, look.doorOrient === 'vertical', false);
      pv.userData = { dir: -dir, angle: 0 };
      s.doors.push(pv);
      g.add(pv);
    }
  };
  const drawers = (heights: number[], depth: number, y0: number) => {
    let y = y0;
    for (const h of heights) {
      const cy = y + h / 2;
      front(g, w - GAP, h - GAP, [0, cy, depth / 2 + DOOR_T / 2], true);
      hardware(g, 0, look.drawerTop ? y + h - 2.2 : cy, depth / 2 + DOOR_T, false, true);
      y += h;
    }
  };
  const counterTop = (h: number) => b(w, counterT, d + inch(v.counterOverhang), [0, h + counterT / 2, inch(v.counterOverhang) / 2], counter);

  if (c.appliance === 'hood') {
    b(w, 8, 20, [0, upperBottom + 14, 0], `steel:${SURROUNDINGS.steel}`);
    b(12, Math.max(1, top - upperBottom - 18), 10, [0, (top + upperBottom + 18) / 2, -5], `steel:${SURROUNDINGS.steel}`);
  } else if (c.appliance) {
    const baseH = inch(standard('base_doors', 'height') ?? 34 * IN);
    if (c.appliance === 'fridge') {
      const fh = inch(v.fridgeHeight);
      b(w - 0.5, fh, d, [0, fh / 2, 0], `steel:${SURROUNDINGS.steel}`);
      b(0.4, fh - 4, 0.2, [0, fh / 2, d / 2 + 0.1], `plain:${SURROUNDINGS.black}`, false);
    } else if (c.appliance === 'range') {
      b(w - 0.25, baseH + counterT, d, [0, (baseH + counterT) / 2, 0], `steel:${SURROUNDINGS.steel}`);
      b(w - 1, 0.4, d - 2, [0, baseH + counterT + 0.2, 0], `plain:${SURROUNDINGS.black}`);
      b(w - 4, 14, 0.4, [0, 18, d / 2 + 0.1], `plain:${SURROUNDINGS.glass}`);
    } else {
      // A cooktop, microwave, wine fridge or anything else: a box with a dark front, under the counter.
      b(w, baseH - toe, d, [0, toe + (baseH - toe) / 2, 0], c.appliance === 'cooktop' ? carcass : `steel:${SURROUNDINGS.steel}`);
      b(w - 3, Math.min(14, baseH - toe - 4), 0.6, [0, toe + (baseH - toe) / 2, d / 2 + 0.2], `plain:${SURROUNDINGS.glass}`);
      counterTop(baseH);
      if (c.appliance === 'cooktop') b(w - 6, 0.3, d - 4, [0, baseH + counterT + 0.15, 0], `plain:${SURROUNDINGS.glass}`);
    }
  } else if (item) {
    // Heights come from the design, so every upper and tall cabinet reaches the same top line.
    const h = inch(c.height);
    const front0 = item.front[0];
    if (item.type === 'filler' || item.type === 'panel') {
      const y0 = c.layer === 'upper' ? inch(c.elevation) : toe;
      b(w, top - y0, d, [0, (y0 + top) / 2, 0], finish);
      if (c.layer === 'base') counterTop(h);
    } else if (c.layer === 'upper') {
      const y0 = inch(c.elevation);
      b(w, h, d, [0, y0 + h / 2, 0], carcass);
      doorsIn(-w / 2, w / 2, y0, top, d, true);
    } else {
      b(w, h - toe, d, [0, toe + (h - toe) / 2, 0], carcass);
      b(w - 1, toe, d - 3, [0, toe / 2, -1.5], `plain:${SURROUNDINGS.plinth}`, false);
      const inner = h - toe;
      if (front0?.kind === 'drawers' && (front0.count ?? 1) >= 3) drawers(Array.from({ length: front0.count ?? 3 }, () => inner / (front0.count ?? 3)), d, toe);
      else if (front0?.kind === 'drawers' && (front0.count ?? 1) === 2) {
        drawers([6, 6], d, h - 12);
        doorsIn(-w / 2, w / 2, toe, h - 12, d, false);
      } else if ((front0?.kind === 'drawers' && front0.count === 1 && item.code !== 'garbage_pullout') || c.code === 'sink_base') {
        drawers([6], d, h - 6);
        doorsIn(-w / 2, w / 2, toe, h - 6, d, false);
      } else if (item.code === 'garbage_pullout' || front0?.kind === 'pullout') drawers([inner], d, toe);
      else doorsIn(-w / 2, w / 2, toe, h, d, false);
      if (item.type !== 'tall' && item.type !== 'appliance_opening') counterTop(h);
      if (item.type === 'appliance_opening') {
        b(w - 0.25, inner, d, [0, toe + inner / 2, 0], `steel:${SURROUNDINGS.steel}`);
        counterTop(h);
      }
      if (c.code === 'sink_base') b(Math.min(28, w - 6), 0.3, 16, [0, h + counterT + 0.02, 1], `steel:${SURROUNDINGS.steel}`);
    }
  }

  if (isSelected) {
    // A warm gold glow on the cabinet itself, plus its outline, so the selection is easy to see.
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material;
      if (m instanceof THREE.MeshStandardMaterial) {
        const lit = m.clone();
        lit.emissive = new THREE.Color(GOLD);
        lit.emissiveIntensity = 0.45;
        mesh.material = lit;
      }
    });
    // Measured before the cabinet is moved into place, so the outline is in its own frame.
    const b3 = new THREE.Box3().setFromObject(g);
    const sz = b3.getSize(new THREE.Vector3());
    const ctr = b3.getCenter(new THREE.Vector3());
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sz.x + 0.8, sz.y + 0.8, sz.z + 0.8)), new THREE.LineBasicMaterial({ color: GOLD }));
    edges.position.copy(ctr);
    g.add(edges);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(sz.x + 1.4, sz.y + 1.4, sz.z + 1.4), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.22, depthWrite: false }));
    glow.position.copy(ctr);
    g.add(glow);
  }
  const p = placement(room, wall, c.offset, c.width, depthBase);
  g.position.copy(p.at);
  g.rotation.y = p.angle;
  return g;
}
