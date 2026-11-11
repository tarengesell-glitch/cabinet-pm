'use client';
/**
 * The customize screen's 3D view, ported from the owner's Kitchen Studio prototype (closet-builder's
 * studio lighting). Drawn only from the room as drawn and its PLACEHOLDER design (P6 for the room;
 * the cabinets are a placeholder until Core holds them). Sizes come from the catalog; finishes from
 * the client's design choices. A visual approximation (BUILD_SPEC 5.5): 1 unit = 1 inch.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Room, Wall } from '@/core/index';
import { cornerCabinets, direction, halfThickness, insideNormal, insideSpan, wallLength } from '../model/layout';
import type { CabinetView } from '../model/cabinets';
import { endOpen, TOUCH, type Context } from '../model/ends';
import { DRAFT_SETTINGS, isHood, itemByCode, standard } from '../model/placeholder-draft';
import type { FinishLook, IslandPanels, PanelLook } from '../model/choices';
import { GOLD } from './theme';

export type { FinishLook } from '../model/choices';

/** The look as the drawing uses it: the finish plus the island panels it can show as chosen (null: plain). */
export interface DrawLook extends FinishLook {
  readonly islandBack: string | null;
  readonly islandSide: string | null;
}

const chosenPanel = (p: PanelLook): string | null => (p.kind === 'chosen' ? p.option_id : null);

/** The finish with the island panels: one the view can't show is drawn plain, and the screen says so (`IslandPanels.problems`). */
export const drawLook = (look: FinishLook, panels: IslandPanels): DrawLook => ({ ...look, islandBack: chosenPanel(panels.back), islandSide: chosenPanel(panels.side) });

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
  /** The room's cabinets, appliances and hoods, worked out from the master copy. */
  cabinets: readonly CabinetView[];
  look: FinishLook;
  /** The island panels, checked by `islandPanelsOf`; one it can't show is drawn plain and reported by the screen. */
  panels: IslandPanels;
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
    // Brighter than the prototype's studio, so the cabinets read clearly (owner, 2026-11-10: "fairly dark").
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // The canvas is drawn at the screen's pixel density and shown at the size of its box.
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 8000);
    const controls = new OrbitControls(camera, renderer.domElement);
    // Turn (drag), move (right-drag, Shift-drag, two fingers or the arrow keys) and zoom toward the
    // pointer, so any corner can be looked at closely (owner, 2026-11-10: "the camera position seems fixed").
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: true, screenSpacePanning: true, zoomToCursor: true, keyPanSpeed: 20, minPolarAngle: 0.05, maxPolarAngle: Math.PI / 2 - 0.02 });
    controls.listenToKeyEvents(window);
    // Studio light: a soft box environment plus a low sun through the window (prototype).
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0xa29e97, side: THREE.BackSide })));
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
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0xd9d3c9, 0.95), new THREE.AmbientLight(0xffffff, 0.25));
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
    // A double-click turns the view around the point under the pointer.
    const onDouble = (e: MouseEvent) => {
      if (!s.root) return;
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(s.root.children, true)[0];
      if (!hit) return;
      camera.position.add(hit.point.clone().sub(controls.target));
      controls.target.copy(hit.point);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('dblclick', onDouble);

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
      renderer.domElement.removeEventListener('dblclick', onDouble);
      controls.stopListenToKeyEvents();
      controls.dispose();
      s.root?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const m of s.mats.values()) m.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      s3.current = null;
    };
  }, [onError]);

  // Rebuild the room whenever it, its design or its look changes. The look is compared by value:
  // the screen hands a new but equal one on every render.
  const { room, cabinets, selected } = props;
  const lookKey = JSON.stringify(drawLook(props.look, props.panels));
  const look = useMemo(() => JSON.parse(lookKey) as DrawLook, [lookKey]);
  useEffect(() => {
    const s = s3.current;
    if (!s) return;
    // Doors keep how far open they are across a rebuild (a selection, an edit), so they never start over.
    const angles = new Map(s.doors.map((d) => [String(d.userData['key']), d.userData['angle'] as number]));
    if (s.root) {
      s.scene.remove(s.root);
      s.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    s.doors = [];
    s.walls = [];
    const root = new THREE.Group();
    buildRoom(s, root, room);
    const ctx: Context = { room, all: cabinets, corners: cornerCabinets(room) };
    for (const c of cabinets) {
      const g = cabinet(s, c, ctx, look, c.id === selected);
      if (g) root.add(g);
    }
    for (const g of counters(s, ctx, look)) root.add(g);
    for (const d of s.doors) {
      const a = angles.get(String(d.userData['key'])) ?? (doorsOpen.current ? (d.userData['dir'] as number) * 1.75 : 0);
      d.userData['angle'] = a;
      d.rotation.y = a;
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
    for (const c of cabinets) widths.set(c.wallId, (widths.get(c.wallId) ?? 0) + c.width);
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
  }, [room, cabinets, look, selected]);

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

function mat(s: Pick<Scene3D, 'mats'>, key: string): THREE.Material {
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

function box(s: Pick<Scene3D, 'mats'>, parent: THREE.Object3D, w: number, h: number, d: number, pos: [number, number, number], key: string, shadow = true): THREE.Mesh {
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
  // Its back on the wall face (a room wall's inside face; a floating wall's line), facing into the room.
  const out = (wall.kind === 'room' ? halfThickness(wall) : 0) + depth / 2;
  const x = wall.start_point.x + u.x * along + n.x * out;
  const y = wall.start_point.y + u.y * along + n.y * out;
  return { at: floor(x, y), angle: Math.atan2(n.x, -n.y) };
}

const NO_COUNTER = new Set(['fridge', 'range', 'hood', 'millwork_hood', 'toilet', 'tub', 'shower']);
const COUNTER_TYPES = new Set(['base', 'vanity', 'appliance_opening']);

/** Which way a wall's offsets run in a cabinet's own frame: +1 when local +x is toward the wall's end. */
function alongSign(room: Room, wall: Wall): number {
  const u = direction(wall);
  const n = insideNormal(room, wall);
  return -n.y * u.x + n.x * u.y >= 0 ? 1 : -1;
}

/**
 * Which ends of a cabinet the 3D view covers with a finished end: only the ends whose saved value
 * (end_left / end_right, worked out by model/ends.ts) is a finished one. A cabinet with no saved
 * value (an older design) shows none; Customize says so.
 */
export function finishedEnds(c: CabinetView): ('low' | 'high')[] {
  if (!DRAFT_SETTINGS.ok || !c.ends) return [];
  const finished = DRAFT_SETTINGS.value.ends.finished;
  return (['low', 'high'] as const).filter((at) => {
    const v = at === 'low' ? c.ends!.low : c.ends!.high;
    return v !== null && finished.has(v);
  });
}

/**
 * The counters: one top for each stretch of base cabinets that touch, so there is no break where a
 * cabinet, a filler or the dishwasher opening meets the next (owner, 2026-11-10). Every top has the
 * same front line (the base depth plus the overhang) and the stretch's tallest base cabinet's height;
 * an island's also covers its back panel, and an end with nothing beside it gets the overhang too.
 */
export function counters(s: Pick<Scene3D, 'mats'>, ctx: Context, look: Pick<FinishLook, 'counter'>): THREE.Group[] {
  if (!DRAFT_SETTINGS.ok) return [];
  const v = DRAFT_SETTINGS.value.visual;
  const counterT = inch(v.counter);
  const oh = inch(v.counterOverhang);
  const baseH = standard('base_doors', 'height') ?? 34 * IN;
  const out: THREE.Group[] = [];
  for (const wall of ctx.room.walls) {
    const tops = ctx.all
      .filter((c) => {
        if (c.wallId !== wall.wall_id || c.layer !== 'base' || c.back) return false;
        if (c.code === null) return c.appliance !== null && !NO_COUNTER.has(c.appliance);
        const t = itemByCode(c.code)?.type ?? '';
        return COUNTER_TYPES.has(t) || ((t === 'filler' || t === 'panel') && c.elevation === 0 && c.height <= baseH + TOUCH);
      })
      .sort((a, b) => a.offset - b.offset);
    const runs: { start: number; end: number; height: number | null; depth: number | null; first: CabinetView; last: CabinetView }[] = [];
    for (const c of tops) {
      const t = c.code ? (itemByCode(c.code)?.type ?? '') : '';
      const h = t === 'base' || t === 'vanity' ? c.height : null;
      const d = t === 'base' || t === 'vanity' ? (c.depth ?? (c.code ? standard(c.code, 'depth') : null)) : null;
      const last = runs[runs.length - 1];
      if (last && Math.abs(c.offset - last.end) <= TOUCH) {
        last.end = Math.max(last.end, c.offset + c.width);
        last.height = h === null ? last.height : Math.max(last.height ?? 0, h);
        last.depth = d === null ? last.depth : Math.max(last.depth ?? 0, d);
        last.last = c;
      } else runs.push({ start: c.offset, end: c.offset + c.width, height: h, depth: d, first: c, last: c });
    }
    const island = wall.kind === 'floating';
    const backD = island ? inch(standard('island_back_panel', 'depth') ?? 0) + oh : 0;
    const sign = alongSign(ctx.room, wall);
    for (const r of runs) {
      const h = inch(r.height ?? baseH);
      const d = inch(r.depth ?? standard('base_doors', 'depth') ?? 24 * IN);
      // The counter overhangs an end with nothing beside it, not even an appliance (HARD-011). A
      // cabinet with saved ends overhangs only past a finished one, so the top follows the saved end.
      const overhangs = (c: CabinetView, edge: number, at: 'low' | 'high') => endOpen(ctx, c, wall, edge, at, true) && (!c.ends || finishedEnds(c).includes(at));
      const ohLow = overhangs(r.first, r.start, 'low') ? oh : 0;
      const ohHigh = overhangs(r.last, r.end, 'high') ? oh : 0;
      const g = new THREE.Group();
      g.userData['wallId'] = wall.wall_id;
      g.userData['span'] = [r.start, r.end];
      const p = placement(ctx.room, wall, r.start, r.end - r.start, 0);
      g.position.copy(p.at);
      g.rotation.y = p.angle;
      const w = inch(r.end - r.start) + ohLow + ohHigh;
      box(s, g, w, counterT, d + oh + backD, [(sign * (ohHigh - ohLow)) / 2, h + counterT / 2, (d + oh - backD) / 2], `counter:${look.counter}`);
      out.push(g);
    }
  }
  return out;
}

export function cabinet(s: Pick<Scene3D, 'mats' | 'doors'>, c: CabinetView, ctx: Context, look: DrawLook, isSelected: boolean): THREE.Group | null {
  if (!DRAFT_SETTINGS.ok) return null;
  const v = DRAFT_SETTINGS.value.visual;
  const room = ctx.room;
  const wall = room.walls.find((w) => w.wall_id === c.wallId);
  if (!wall) return null;
  const sign = alongSign(room, wall);
  let doorN = 0;
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
  const d = inch(c.layer === 'upper' && isHood(c.appliance) ? 20 * IN : depthBase);
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
      pv.userData = { dir: -dir, angle: 0, key: `${c.id}:${doorN++}` };
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
  // The counters are drawn per stretch (counters()); an L-shaped corner cabinet draws its own.
  const oh = inch(v.counterOverhang);
  const counterBox = (h: number, x0: number, x1: number, z0: number, z1: number) => b(x1 - x0, counterT, z1 - z0, [(x0 + x1) / 2, h + counterT / 2, (z0 + z1) / 2], counter);
  const baseTop = inch(standard('base_doors', 'height') ?? 34 * IN);
  // Toe kicks are in the cabinet's own door finish (owner, 2026-11-10: "they should match the colour of that cabinet's doors").
  const kick = finish;

  if (c.appliance === 'millwork_hood') {
    // A millwork hood: a box in the door finish (no catalog item yet; drawn for the look only).
    b(w, Math.max(1, top - upperBottom - 12), 20, [0, (top + upperBottom + 12) / 2, 0], finish);
  } else if (c.appliance === 'hood') {
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
      if (c.appliance === 'cooktop') b(w - 6, 0.3, d - 4, [0, baseH + counterT + 0.15, 0], `plain:${SURROUNDINGS.glass}`);
    }
  } else if (item) {
    // Heights come from the design, so every upper and tall cabinet reaches the same top line.
    const h = inch(c.height);
    const front0 = item.front[0];
    if (c.back) {
      // An island's back panel: behind the island's line, from the floor, in the island's finish,
      // looking as chosen (owner, 2026-11-10): door panels lined up with the cabinets in front, or shiplap.
      b(w, h, d, [0, h / 2, -d], finish);
      const face = new THREE.Group();
      face.position.set(0, 0, -1.5 * d);
      face.rotation.y = Math.PI;
      g.add(face);
      if (look.islandBack === 'door_panels') {
        const fronts = ctx.all.filter((o) => o.wallId === c.wallId && !o.back && o.layer === 'base' && o.code !== null && o.offset < c.offset + c.width && o.offset + o.width > c.offset);
        const spans = fronts.length ? fronts.map((o) => [Math.max(o.offset, c.offset), Math.min(o.offset + o.width, c.offset + c.width)] as const) : [[c.offset, c.offset + c.width] as const];
        for (const [a, z] of spans) {
          const sw = inch(z - a);
          const count = sw > 24 ? 2 : 1;
          for (let k = 0; k < count; k++) {
            // Along the panel from its low end, then into the back face's frame (turned half way round).
            const centre = -sign * (inch(a - c.offset) + (sw / count) * (k + 0.5) - w / 2);
            front(face, sw / count - GAP, h - toe - GAP, [centre, toe + (h - toe) / 2, DOOR_T / 2], false);
          }
        }
      } else if (look.islandBack === 'shiplap') {
        for (let x = -w / 2; x < w / 2 - 0.5; x += 6) box(s, face, Math.min(5.85, w / 2 - x), h - 0.2, 0.3, [x + Math.min(5.85, w / 2 - x) / 2, h / 2, 0.15], finish);
      }
    } else if ((item.type === 'filler' || item.type === 'panel') && c.layer === 'base' && top > baseTop + 0.01) {
      // A full-height panel or filler (beside a fridge or a pantry): from the floor to the top line.
      b(w, top, d, [0, top / 2, 0], finish);
    } else if (item.type === 'filler' || item.type === 'panel') {
      // A filler or panel stands on the floor (base) or hangs with the uppers, in the door finish.
      const y0 = c.layer === 'upper' ? inch(c.elevation) : 0;
      b(w, top - y0, d, [0, (y0 + top) / 2, 0], finish);
    } else if (item.type === 'corner_base' || item.type === 'corner_wall') {
      // An L-shaped 90-degree corner cabinet: one leg along this wall, the other along the wall it
      // meets, each as deep as the cabinets beside it, with a door on each inside face.
      const u = direction(wall);
      const n = insideNormal(room, wall);
      const sign = -n.y * u.x + n.x * u.y >= 0 ? 1 : -1;
      const span = insideSpan(room, wall);
      const atHigh = c.offset > span.start + IN && c.offset + c.width >= span.end - IN;
      const cs = (atHigh ? 1 : -1) * sign;
      const inward = -cs;
      const cx0 = (cs * w) / 2;
      const legD = Math.min(d, w, inch(standard(c.layer === 'upper' ? 'upper_doors' : 'base_doors', 'depth') ?? 12 * IN));
      const xr = (a: number, z: number): [number, number] => [Math.min(cx0 + inward * a, cx0 + inward * z), Math.max(cx0 + inward * a, cx0 + inward * z)];
      const upper = c.layer === 'upper';
      const y0 = upper ? inch(c.elevation) : toe;
      const zFace = -d / 2 + legD;
      const block = (x: [number, number], z0: number, z1: number, yA: number, yB: number, key: string, shadow = true) => b(x[1] - x[0], yB - yA, z1 - z0, [(x[0] + x[1]) / 2, (yA + yB) / 2, (z0 + z1) / 2], key, shadow);
      block([-w / 2, w / 2], -d / 2, zFace, y0, top, carcass);
      block(xr(0, legD), zFace, d / 2, y0, top, carcass);
      if (!upper) {
        block([-w / 2, w / 2], -d / 2, zFace - 3, 0, toe, kick, false);
        block(xr(0, legD - 3), zFace - 3, d / 2, 0, toe, kick, false);
        counterBox(h, -w / 2, w / 2, -d / 2, zFace + oh);
        const rx = xr(0, legD + oh);
        counterBox(h, rx[0], rx[1], zFace + oh, d / 2);
      }
      // The door on this wall's face, beside the other leg.
      const [fx0, fx1] = xr(legD, w);
      if (fx1 - fx0 > 1) doorsIn(fx0, fx1, y0, top, 2 * zFace, upper);
      // The door on the other leg's face, turned to face along this wall.
      const fw = d - legD;
      if (fw > 1) {
        const face = new THREE.Group();
        face.position.set(cx0 + inward * legD, 0, (zFace + d / 2) / 2);
        face.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2;
        front(face, fw - GAP, top - y0 - GAP, [0, (y0 + top) / 2, DOOR_T / 2], false);
        // The handle by the inside corner, where the two doors meet.
        hardware(face, (inward > 0 ? 1 : -1) * (fw / 2 - 1.6), upper ? y0 + 5 : top - 5, DOOR_T, look.doorOrient === 'vertical', false);
        g.add(face);
      }
    } else if (item.type === 'appliance_opening') {
      // The dishwasher in its opening: a plain stainless door flush with the cabinet doors (no panel
      // unless one is chosen), the tub behind it, a recessed toe kick and the run's counter over it.
      const inner = h - toe;
      b(w - 0.5, inner - 0.5, d - DOOR_T - 0.75, [0, toe + inner / 2, -DOOR_T / 2 - 0.375], `plain:${SURROUNDINGS.black}`);
      b(w - GAP, inner - GAP, DOOR_T, [0, toe + inner / 2, d / 2 - DOOR_T / 2], `steel:${SURROUNDINGS.steel}`);
      b(Math.max(1, w - 6), 0.6, 0.8, [0, h - 3.5, d / 2 + 0.4], `steel:${SURROUNDINGS.steel}`);
      b(w - 1, toe, d - 3, [0, toe / 2, -1.5], kick, false);
    } else if (c.layer === 'upper') {
      const y0 = inch(c.elevation);
      b(w, h, d, [0, y0 + h / 2, 0], carcass);
      doorsIn(-w / 2, w / 2, y0, top, d, true);
    } else {
      b(w, h - toe, d, [0, toe + (h - toe) / 2, 0], carcass);
      b(w, toe, d - 3, [0, toe / 2, -1.5], kick, false);
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
      if (c.code === 'sink_base') b(Math.min(28, w - 6), 0.3, 16, [0, h + counterT + 0.02, 1], `steel:${SURROUNDINGS.steel}`);
    }
  }

  // Finished ends, as saved on the cabinet (model/ends.ts decides them): covered from the floor
  // (base and tall) or the cabinet's bottom (upper) to its top, flush with the doors (owner,
  // 2026-11-10: "Applied finished ends should go to the floor"). An island's ends follow its side
  // panel choice. Drawn only on the straight cabinets; an L-shaped corner cabinet's ends aren't drawn.
  const ENDED = new Set(['base', 'vanity', 'wall', 'tall']);
  if (item && !c.back && ENDED.has(item.type)) {
    const y0 = c.layer === 'upper' ? inch(c.elevation) : 0;
    for (const side of finishedEnds(c)) {
      const x = (side === 'low' ? -sign : sign) * (w / 2 - 0.37);
      if (island && c.layer === 'base' && look.islandSide === 'waterfall_stone') {
        b(counterT, top + counterT - y0, d + DOOR_T + oh, [(side === 'low' ? -sign : sign) * (w / 2 + counterT / 2), (y0 + top + counterT) / 2, (DOOR_T + oh) / 2], counter);
        continue;
      }
      b(0.76, top - y0, d + DOOR_T, [x, (y0 + top) / 2, DOOR_T / 2], finish);
      if (island && c.layer === 'base' && (look.islandSide === 'detailed_short' || look.islandSide === 'detailed_long')) {
        const face = new THREE.Group();
        const out = side === 'low' ? -sign : sign;
        face.position.set(out * (w / 2 + 0.01), 0, DOOR_T / 2);
        face.rotation.y = out > 0 ? Math.PI / 2 : -Math.PI / 2;
        front(face, d + DOOR_T - 1.5, top - y0 - (look.islandSide === 'detailed_short' ? toe : 0) - 1.5, [0, (top + y0 + (look.islandSide === 'detailed_short' ? toe : 0)) / 2, DOOR_T / 2], false);
        g.add(face);
      }
    }
  }

  if (isSelected) {
    // A warm gold glow on the cabinet itself, plus its outline, so the selection is easy to see.
    // No see-through box around it: one larger than the cabinet poked out of the island's back and
    // looked like a fault in the drawing (owner, 2026-11-10).
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
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sz.x + 0.3, sz.y + 0.3, sz.z + 0.3)), new THREE.LineBasicMaterial({ color: GOLD }));
    edges.position.copy(ctr);
    g.add(edges);
  }
  const p = placement(room, wall, c.offset, c.width, depthBase);
  g.position.copy(p.at);
  g.rotation.y = p.angle;
  return g;
}
