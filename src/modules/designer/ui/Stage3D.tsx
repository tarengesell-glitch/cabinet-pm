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
import { formatInches, type Room, type Wall } from '@/core/index';
import { cornerCabinets, direction, halfThickness, insideNormal, insideSpan, wallLength } from '../model/layout';
import type { CabinetView, ItemEdit } from '../model/cabinets';
import { endOpen, TOUCH, type Context } from '../model/ends';
import { cameraPose, FOV, roomFrame, viewName, type CameraPose, type CameraView } from './camera-views';
import { DRAFT_SETTINGS, isHood, itemByCode, standard } from '../model/placeholder-draft';
import type { FinishLook, IslandPanels, PanelLook } from '../model/choices';
import { chosenLook } from '../model/appliance-looks';
import { frontPieces } from '../model/fronts';
import { SELECT_BLUE } from './theme';

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
const SURROUNDINGS = { wall: '#efebe4', floor: '#d3bd9c', plinth: '#2c2c2e', steel: '#c9ccd0', black: '#18181a', glass: '#1d1f22', window: '#cfe0ea', trim: '#f6f4ef', door: '#efece6', interior: '#f3f1ec', reveal: '#57524b', edge: '#8f8a82', handle: '#7d8186' };

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
  /** The room and cabinets drawn now, for framing the camera (camera-views.ts). */
  room: Room | null;
  cabinets: readonly CabinetView[];
  /** The view to tell the page about once a frame with it has been drawn (`data-view`). */
  drawnView: string | null;
  fitted: boolean;
  /** The selected cabinet's grips (when it can be edited), for dragging. */
  handles: THREE.Object3D[];
  /** The selected cabinet, and what dragging it moves (when it can be edited). */
  body: { id: string; data: HandleData } | null;
  /** Something changed since the last frame was drawn. */
  dirty: boolean;
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
  /**
   * A fixed view to show instead of the starting one (the screenshot command's page; the studio
   * doesn't pass it). Once a frame with it is drawn, the view's name is set as `data-view` on the
   * 3D view's box, so a test can wait for it instead of waiting a set time.
   */
  view?: CameraView;
  onPick: (id: string) => void;
  /** A sink, dishwasher or fridge was clicked (its placement ID): the screen offers how it looks (owner, 2026-11-12). */
  onPickAppliance?: (placementId: string) => void;
  /** A click on no cabinet: let go of the selected one. */
  onDeselect?: () => void;
  /**
   * Given when the person may edit: the selected cabinet gets handles to drag it wider or
   * narrower, taller or shorter, deeper or shallower, along the wall, up and down, and out from
   * the wall (owner, 2026-11-12). Each drag is one edit, made on release; false when refused.
   */
  onEdit?: (e: ItemEdit) => boolean;
  onError: (reason: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const s3 = useRef<Scene3D | null>(null);
  const doorsOpen = useRef(props.doorsOpen);
  const onPick = useRef(props.onPick);
  const onPickAppliance = useRef(props.onPickAppliance);
  const onDeselect = useRef(props.onDeselect);
  const onEdit = useRef(props.onEdit);
  const label = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(props.view);
  useEffect(() => {
    onPick.current = props.onPick;
    onPickAppliance.current = props.onPickAppliance;
    onDeselect.current = props.onDeselect;
    onEdit.current = props.onEdit;
    doorsOpen.current = props.doorsOpen;
    viewRef.current = props.view;
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
    // Brighter again, with the fronts' reveal lines and edges carrying the detail (owner, 2026-11-12:
    // "the entire room needs to be brighter, but lines and shadows ... more clearly visible").
    renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // The canvas is drawn at the screen's pixel density and shown at the size of its box.
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 8000);
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
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0xd9d3c9, 0.8), new THREE.AmbientLight(0xffffff, 0.12));
    const s: Scene3D = { renderer, scene, camera, controls, sun, root: null, doors: [], walls: [], mats: new Map(), room: null, cabinets: [], drawnView: null, fitted: false, handles: [], body: null, dirty: true };
    s3.current = s;

    const size = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      s.dirty = true;
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    // A click (not a drag) picks the cabinet under the pointer.
    let down: [number, number] | null = null;
    const ray = new THREE.Raycaster();
    const toNdc = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    // Dragging a handle of the selected cabinet: measured along the handle's own direction (or, for
    // the move handle, across the cabinet's face), shown live, and made one edit on release.
    let drag: { handle: THREE.Object3D; start: THREE.Vector3; plane: THREE.Plane; ghost: THREE.LineSegments; result: ItemEdit | null } | null = null;
    const hitPlane = (e: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null => {
      ray.setFromCamera(toNdc(e), camera);
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    };
    /** The selected cabinet's group under the pointer, and the point hit on it, or null. */
    const bodyHit = (e: PointerEvent): { g: THREE.Group; point: THREE.Vector3 } | null => {
      if (!s.body || !s.root) return null;
      ray.setFromCamera(toNdc(e), camera);
      for (const hit of seenHits(ray, s.root)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData['cabId']) o = o.parent;
        if (!o) continue;
        return o.userData['cabId'] === s.body.id ? { g: o as THREE.Group, point: hit.point } : null;
      }
      return null;
    };
    const onHandleDown = (e: PointerEvent) => {
      if (!s.handles.length || e.button !== 0 || e.shiftKey) return;
      ray.setFromCamera(toNdc(e), camera);
      const hit = ray.intersectObjects(s.handles, true)[0];
      let h: THREE.Object3D | null = hit?.object ?? null;
      while (h && !h.userData['handle']) h = h.parent;
      if (!h) {
        // Dragging the selected cabinet itself moves it (along the wall, or up and down).
        const b = bodyHit(e);
        if (!b || !s.body) return;
        h = new THREE.Object3D();
        h.userData = { ...s.body.data };
        b.g.add(h);
        h.position.copy(b.g.worldToLocal(b.point.clone()));
        h.userData['temporary'] = true;
      }
      const g = h.parent as THREE.Group;
      // The plane the pointer slides on: through the handle, facing the camera as much as the handle's direction allows.
      const local = h.userData['axis'] as THREE.Vector3 | undefined;
      const axis = local ? local.clone().applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion())).normalize() : null;
      const faceN = new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));
      const view = camera.getWorldDirection(new THREE.Vector3());
      const normal = axis ? axis.clone().cross(view).cross(axis).normalize() : faceN;
      if (normal.lengthSq() < 1e-6) return;
      const at = h.getWorldPosition(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, at);
      const start = hitPlane(e, plane);
      if (!start) return;
      controls.enabled = false;
      e.stopPropagation();
      const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: SELECT_BLUE }));
      ghost.raycast = () => {};
      g.add(ghost);
      drag = { handle: h, start, plane, ghost, result: null };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    // Pointing at a handle: its pointer, a little larger, and what it does.
    let hovered: THREE.Object3D | null = null;
    const hover = (e: PointerEvent) => {
      ray.setFromCamera(toNdc(e), camera);
      let h: THREE.Object3D | null = s.handles.length ? (ray.intersectObjects(s.handles, true)[0]?.object ?? null) : null;
      while (h && !h.userData['handle']) h = h.parent;
      if (!h) {
        hovered?.scale.setScalar(1);
        if (hovered) s.dirty = true;
        hovered = null;
        if (label.current) label.current.style.display = 'none';
        el.style.cursor = bodyHit(e) ? 'move' : 'grab';
        return;
      }
      if (h === hovered) {
        if (h && label.current) Object.assign(label.current.style, { left: `${e.clientX - el.getBoundingClientRect().left + 14}px`, top: `${e.clientY - el.getBoundingClientRect().top + 14}px` });
        return;
      }
      hovered?.scale.setScalar(1);
      hovered = h;
      h.scale.setScalar(1.35);
      const kind = h ? (h.userData as HandleData).handle : null;
      el.style.cursor = kind === null ? 'grab' : kind === 'left' || kind === 'right' ? 'ew-resize' : kind === 'top' ? 'ns-resize' : kind === 'move' ? 'move' : 'nesw-resize';
      if (label.current) {
        if (kind) {
          const r = el.getBoundingClientRect();
          Object.assign(label.current.style, { display: 'block', left: `${e.clientX - r.left + 14}px`, top: `${e.clientY - r.top + 14}px` });
          label.current.textContent = HANDLE_NAMES[kind];
        } else label.current.style.display = 'none';
      }
      s.dirty = true;
    };
    const onHandleMove = (e: PointerEvent) => {
      if (!drag) return hover(e);
      const p = hitPlane(e, drag.plane);
      if (!p) return;
      const g = drag.handle.parent as THREE.Group;
      const toLocal = g.getWorldQuaternion(new THREE.Quaternion()).invert();
      const moved = p.clone().sub(drag.start).applyQuaternion(toLocal);
      const out = dragResult(drag.handle.userData as HandleData, moved);
      drag.result = out.edit;
      const b = out.box;
      drag.ghost.scale.set(b.w, b.h, b.d);
      drag.ghost.position.set(b.x, b.y, b.z);
      s.dirty = true;
      if (label.current) {
        const r = el.getBoundingClientRect();
        Object.assign(label.current.style, { display: 'block', left: `${e.clientX - r.left + 14}px`, top: `${e.clientY - r.top + 14}px` });
        label.current.textContent = out.text;
      }
    };
    const onHandleUp = (e: PointerEvent) => {
      if (!drag) return;
      const { result, ghost, handle } = drag;
      if (handle.userData['temporary']) handle.parent?.remove(handle);
      ghost.parent?.remove(ghost);
      ghost.geometry.dispose();
      s.dirty = true;
      drag = null;
      down = null;
      controls.enabled = true;
      if (label.current) label.current.style.display = 'none';
      if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
      if (result) onEdit.current?.(result);
    };
    const onDown = (e: PointerEvent) => (down = drag ? null : [e.clientX, e.clientY]);
    const onUp = (e: PointerEvent) => {
      if (drag || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !s.root) return;
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      for (const h of seenHits(ray, s.root)) {
        let o: THREE.Object3D | null = h.object;
        let appliance: string | null = null;
        while (o && !o.userData['cabId']) {
          if (o.userData['applianceId']) appliance = String(o.userData['applianceId']);
          o = o.parent;
        }
        if (!o) continue;
        onPick.current(String(o.userData['cabId']));
        if (appliance) onPickAppliance.current?.(appliance);
        return;
      }
      // A click on anything else (a wall, the floor, empty space) lets go of the cabinet (owner, 2026-11-13).
      onDeselect.current?.();
    };
    // A double-click turns the view around the point under the pointer.
    const onDouble = (e: MouseEvent) => {
      if (!s.root) return;
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = seenHits(ray, s.root)[0];
      if (!hit) return;
      camera.position.add(hit.point.clone().sub(controls.target));
      controls.target.copy(hit.point);
      s.dirty = true;
    };
    // Zooming in goes toward what is under the pointer, as close as CLOSEST to it: the camera
    // turns around a point at that depth (owner, 2026-11-13: it stopped short, because it turned
    // around a point far behind what was being looked at).
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY >= 0 || !s.root) return;
      ray.setFromCamera(toNdc(e), camera);
      const hit = seenHits(ray, s.root)[0];
      if (!hit) return;
      const view = camera.getWorldDirection(new THREE.Vector3());
      const depth = hit.point.clone().sub(camera.position).dot(view);
      if (depth <= 0) return;
      controls.target.copy(camera.position.clone().add(view.multiplyScalar(depth)));
    };
    renderer.domElement.addEventListener('wheel', onWheel, { capture: true, passive: true });
    renderer.domElement.addEventListener('pointerdown', onHandleDown, { capture: true });
    renderer.domElement.addEventListener('pointermove', onHandleMove);
    renderer.domElement.addEventListener('pointerup', onHandleUp, { capture: true });
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('dblclick', onDouble);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    // Drawn only when something changed (the camera, a door moving, a rebuild, a resize, a drag):
    // a still view costs nothing, so the page stays quick with every detail drawn.
    controls.addEventListener('change', () => (s.dirty = true));
    // Once the person moves the camera, nothing is clipped away in front of it any more (a fixed
    // wall view clips what stands between it and the wall), so they can come in close.
    controls.addEventListener('start', () => {
      if (camera.near !== 1) {
        camera.near = 1;
        camera.updateProjectionMatrix();
      }
    });
    const loop = () => {
      for (const d of s.doors) {
        const target = doorsOpen.current ? (d.userData['dir'] as number) * 1.75 : 0;
        const a = d.userData['angle'] as number;
        if (Math.abs(target - a) < 1e-4) continue;
        d.userData['angle'] = Math.abs(target - a) < 0.002 || reduce ? target : a + (target - a) * 0.09;
        d.rotation.y = d.userData['angle'] as number;
        s.dirty = true;
      }
      controls.update();
      // Grips keep the same size on screen at any zoom.
      if (s.handles.length) {
        const per = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, el.clientHeight);
        for (const h of s.handles) {
          const dist = h.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position);
          const r = GRIP_PX * per * dist;
          if (Math.abs((h.userData['r'] as number | undefined ?? 0) - r) > r * 0.01) {
            h.userData['r'] = r;
            for (const m of h.children) m.scale.setScalar(r);
            s.dirty = true;
          }
        }
      }
      if (!s.dirty) {
        raf = requestAnimationFrame(loop);
        return;
      }
      s.dirty = false;
      // Cut away any wall standing between the camera and the room, with the uppers hung on it.
      const hidden = new Set<string>();
      for (const w of s.walls) {
        w.g.visible = camera.position.clone().sub(w.c).dot(w.n) > 0;
        if (!w.g.visible) hidden.add(w.id);
      }
      for (const g of s.root?.children ?? []) if (g.userData['layer'] === 'upper') g.visible = !hidden.has(String(g.userData['wallId']));
      renderer.render(scene, camera);
      if (s.drawnView !== null) {
        el.dataset['view'] = s.drawnView;
        s.drawnView = null;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('wheel', onWheel, { capture: true });
      renderer.domElement.removeEventListener('pointerdown', onHandleDown, { capture: true });
      renderer.domElement.removeEventListener('pointermove', onHandleMove);
      renderer.domElement.removeEventListener('pointerup', onHandleUp, { capture: true });
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('dblclick', onDouble);
      controls.stopListenToKeyEvents();
      controls.dispose();
      if (s.root) disposeTree(s.root);
      for (const m of s.mats.values()) m.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      s3.current = null;
    };
  }, [onError]);

  // Rebuild the room whenever it, its design or its look changes. The look is compared by value:
  // the screen hands a new but equal one on every render.
  const { room, cabinets, selected } = props;
  const editable = props.onEdit !== undefined;
  const lookKey = JSON.stringify(drawLook(props.look, props.panels));
  const look = useMemo(() => JSON.parse(lookKey) as DrawLook, [lookKey]);
  useEffect(() => {
    const s = s3.current;
    if (!s) return;
    // Doors keep how far open they are across a rebuild (a selection, an edit), so they never start over.
    const angles = new Map(s.doors.map((d) => [String(d.userData['key']), d.userData['angle'] as number]));
    if (s.root) {
      s.scene.remove(s.root);
      disposeTree(s.root);
    }
    s.doors = [];
    s.walls = [];
    s.handles = [];
    s.body = null;
    const root = new THREE.Group();
    buildRoom(s, root, room);
    const ctx: Context = { room, all: cabinets, corners: cornerCabinets(room) };
    for (const c of cabinets) {
      const g = cabinet(s, c, ctx, look, c.id === selected);
      if (g) root.add(g);
      if (g && c.id === selected && editable) {
        const h = addHandles(s, g, c, ctx);
        if (h) {
          s.handles = h.grips;
          s.body = { id: c.id, data: h.body };
        }
      }
    }
    for (const g of counters(s, ctx, look)) root.add(g);
    for (const d of s.doors) {
      const a = angles.get(String(d.userData['key'])) ?? (doorsOpen.current ? (d.userData['dir'] as number) * 1.75 : 0);
      d.userData['angle'] = a;
      d.rotation.y = a;
    }
    s.root = root;
    s.scene.add(root);
    s.dirty = true;
    s.room = room;
    s.cabinets = cabinets;
    // Sun through the first window, if any; framing from the room's size.
    const frame = roomFrame(room, cabinets);
    const [cx, , cz] = frame.centre;
    const span = frame.span;
    const win = room.walls.find((w) => w.openings.some((o) => o.kind === 'window'));
    const n = win ? insideNormal(room, win) : { x: -0.6, y: -0.8 };
    const el = (35 * Math.PI) / 180;
    const dist = span * 2 + 200;
    s.sun.position.set(cx - n.x * Math.cos(el) * dist, Math.sin(el) * dist, cz + n.y * Math.cos(el) * dist);
    s.sun.target.position.set(cx, 0, cz);
    Object.assign(s.sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: dist * 2 });
    s.sun.shadow.camera.updateProjectionMatrix();
    if (!s.fitted) {
      if (!show(s, viewRef.current ?? OVERALL, onError)) return;
      s.fitted = true;
    }
  }, [room, cabinets, look, selected, editable, onError]);

  // A fixed view, when one is asked for (by its name, so an equal view isn't shown again).
  const viewKey = props.view ? viewName(props.view) : null;
  useEffect(() => {
    const s = s3.current;
    if (s?.fitted && viewKey !== null && viewRef.current) show(s, viewRef.current, onError);
  }, [viewKey, onError]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={host} data-testid="stage-3d" style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }} />
      <div
        ref={label}
        data-testid="drag-size"
        style={{ position: 'absolute', display: 'none', pointerEvents: 'none', background: SELECT_BLUE, color: '#fff', font: '600 12px/1.2 system-ui, sans-serif', padding: '4px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}
      />
    </div>
  );
}

const OVERALL: CameraView = { kind: 'overall' };

/**
 * What the pointer's ray hits that is on screen, nearest first. A wall cut away because the camera
 * stands behind it (and the uppers on it) is hidden but still in the scene; the ray passes through
 * it, so a click or a zoom reaches what is seen behind it (owner, 2026-11-13: zooming in on a wall
 * seen through a cut-away wall stopped at the hidden wall).
 */
export function seenHits(ray: THREE.Raycaster, root: THREE.Object3D): THREE.Intersection[] {
  const shown = (o: THREE.Object3D | null): boolean => {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  return ray.intersectObjects(root.children, true).filter((h) => shown(h.object));
}

/** Puts the camera at a fixed view (camera-views.ts). False, with the reason shown, when it can't be framed. */
function show(s: Scene3D, view: CameraView, onError: (reason: string) => void): boolean {
  if (!s.room) return false;
  const r = s.renderer.domElement.getBoundingClientRect();
  const pose: CameraPose | { problem: string } = cameraPose(s.room, s.cabinets, view, r.width / Math.max(1, r.height));
  if ('problem' in pose) {
    onError(pose.problem);
    return false;
  }
  s.controls.target.set(...pose.target);
  s.camera.position.set(...pose.position);
  s.camera.near = pose.near;
  s.camera.updateProjectionMatrix();
  s.controls.minDistance = pose.minDistance;
  s.controls.maxDistance = pose.maxDistance;
  s.controls.update();
  s.drawnView = viewName(view);
  s.dirty = true;
  return true;
}

function mat(s: Pick<Scene3D, 'mats'>, key: string): THREE.Material {
  const have = s.mats.get(key);
  if (have) return have;
  const [kind, hex = '#888888'] = key.split(':');
  const colour = new THREE.Color(hex);
  const m =
    kind === 'paint'
      ? new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.62, clearcoat: 0.06, clearcoatRoughness: 0.5, envMapIntensity: 0.7 })
      : kind === 'metal'
        ? new THREE.MeshStandardMaterial({ color: colour, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.2 })
        : kind === 'counter'
          ? new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.28, clearcoat: 0.4, envMapIntensity: 0.9 })
          : kind === 'glass'
            ? new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.08, transparent: true, opacity: 0.55 })
            : kind === 'steel'
              ? new THREE.MeshStandardMaterial({ color: colour, metalness: 1, roughness: 0.34, envMapIntensity: 1.1 })
              : kind === 'enamel'
                ? new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.35, clearcoat: 0.5, envMapIntensity: 0.9 })
                : kind === 'line'
                  ? new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.55 })
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

/** One box's twelve edges, shared by every outline and scaled to each box (no geometry made per box). */
const UNIT_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));

/** Thin lines along a box's edges, so the edges of doors, drawers and panels read in a bright room (owner, 2026-11-12). */
function outline(s: Pick<Scene3D, 'mats'>, mesh: THREE.Mesh): THREE.Mesh {
  const p = (mesh.geometry as THREE.BoxGeometry).parameters;
  const lines = new THREE.LineSegments(UNIT_EDGES, mat(s, `line:${SURROUNDINGS.edge}`) as THREE.LineBasicMaterial);
  lines.scale.set(p.width, p.height, p.depth);
  lines.raycast = () => {};
  lines.userData['shared'] = true;
  mesh.add(lines);
  return mesh;
}

/** An outline of a box of this size at `pos`, with no box (for a front made of several boxes). */
function edgeLines(s: Pick<Scene3D, 'mats'>, parent: THREE.Object3D, w: number, h: number, d: number, pos: [number, number, number]): void {
  const lines = new THREE.LineSegments(UNIT_EDGES, mat(s, `line:${SURROUNDINGS.edge}`) as THREE.LineBasicMaterial);
  lines.scale.set(w, h, d);
  lines.position.set(...pos);
  lines.raycast = () => {};
  lines.userData['shared'] = true;
  parent.add(lines);
}

/** Disposes a drawn group's own geometry (not the shared outline). */
function disposeTree(o: THREE.Object3D): void {
  o.traverse((x) => {
    if (!x.userData['shared']) (x as THREE.Mesh).geometry?.dispose();
  });
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
function placement(room: Room, wall: Wall, offset: number, width: number, depth: number, setback = 0): { at: THREE.Vector3; angle: number } {
  const u = direction(wall);
  const n = insideNormal(room, wall);
  const along = offset + width / 2;
  // Its back on the wall face (a room wall's inside face; a floating wall's line), or as far out from it as set, facing into the room.
  const out = (wall.kind === 'room' ? halfThickness(wall) : 0) + setback + depth / 2;
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
      const xc = (sign * (ohHigh - ohLow)) / 2;
      const z0 = -backD;
      const z1 = d + oh;
      // Each sink in this stretch: a hole in the counter with its bowls below (owner, 2026-11-12).
      const sinks = ctx.all
        .filter((c) => c.wallId === wall.wall_id && c.housed?.kind === 'sink' && c.offset < r.end && c.offset + c.width > r.start)
        .map((c) => {
          const hw = Math.max(8, inch(c.housed!.width) - 2);
          const x = sign * inch(c.housed!.offset + c.housed!.width / 2 - (r.start + r.end) / 2);
          return { c, x0: x - hw / 2, x1: x + hw / 2, z0: z1 - 3.5 - 17, z1: z1 - 3.5 };
        })
        .sort((a, b) => a.x0 - b.x0);
      const key = `counter:${look.counter}`;
      const slab = (xa: number, xb: number, za: number, zb: number) => {
        if (xb - xa > 0.01 && zb - za > 0.01) box(s, g, xb - xa, counterT, zb - za, [(xa + xb) / 2, h + counterT / 2, (za + zb) / 2], key);
      };
      let x = xc - w / 2;
      for (const k of sinks) {
        slab(x, k.x0, z0, z1);
        slab(k.x0, k.x1, z0, k.z0);
        slab(k.x0, k.x1, k.z1, z1);
        x = k.x1;
        g.add(sinkBowls(s, k, h + counterT));
      }
      slab(x, xc + w / 2, z0, z1);
      out.push(g);
    }
  }
  return out;
}

/**
 * A sink's bowls under its hole in the counter, with a faucet behind (owner, 2026-11-12): the
 * colour, the bowls (single, equal double or 60/40) and the faucet finish as chosen on the sink;
 * stainless with a single bowl until chosen. Picking any of it opens the sink's choices.
 */
function sinkBowls(s: Pick<Scene3D, 'mats'>, k: { c: CabinetView; x0: number; x1: number; z0: number; z1: number }, top: number): THREE.Group {
  const g = new THREE.Group();
  const housed = k.c.housed!;
  g.userData['applianceId'] = housed.placementId;
  g.userData['cabId'] = k.c.id;
  const look = { kind: housed.kind, selections: housed.selections };
  const colour = chosenLook(look, 'colour');
  const split = chosenLook(look, 'bowls')?.split ?? [1];
  const faucet = chosenLook(look, 'faucet');
  const bowl = colour?.hex ? `enamel:${colour.hex}` : `steel:${SURROUNDINGS.steel}`;
  const depth = 9;
  const t = 0.3;
  const w = k.x1 - k.x0;
  const zc = (k.z0 + k.z1) / 2;
  const zd = k.z1 - k.z0;
  const wall = (bw: number, bd: number, x: number, z: number) => box(s, g, bw, depth, bd, [x, top - depth / 2, z], bowl, false);
  wall(w, t, (k.x0 + k.x1) / 2, k.z0 + t / 2);
  wall(w, t, (k.x0 + k.x1) / 2, k.z1 - t / 2);
  wall(t, zd, k.x0 + t / 2, zc);
  wall(t, zd, k.x1 - t / 2, zc);
  const total = split.reduce((a, b) => a + b, 0);
  let at = k.x0;
  split.forEach((part, i) => {
    const bw = (w * part) / total;
    box(s, g, bw, t, zd, [at + bw / 2, top - depth, zc], bowl, false);
    // The drain, toward the back of each bowl.
    const drain = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.1, 24), mat(s, `plain:${SURROUNDINGS.black}`));
    drain.position.set(at + bw / 2, top - depth + t / 2 + 0.06, zc - zd * 0.15);
    g.add(drain);
    if (i < split.length - 1) box(s, g, 0.6, depth - 0.75, zd, [at + bw, top - (depth - 0.75) / 2, zc], bowl, false);
    at += bw;
  });
  // The faucet: a round base, a riser and a gooseneck spout over the first bowl.
  const fm = mat(s, faucet?.hex ? (faucet.code === 'black' ? `enamel:${faucet.hex}` : `metal:${faucet.hex}`) : `metal:${SURROUNDINGS.steel}`);
  const fx = k.x0 + (w * split[0]!) / total / 2;
  const fz = k.z0 - 2;
  const part = (geo: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, fm);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.castShadow = true;
    g.add(m);
  };
  part(new THREE.CylinderGeometry(1.1, 1.2, 1.2, 24), [fx, top + 0.6, fz]);
  part(new THREE.CylinderGeometry(0.5, 0.55, 12, 20), [fx, top + 6.6, fz]);
  // Half a ring over the top, reaching forward, then a short drop at the end.
  part(new THREE.TorusGeometry(4, 0.5, 12, 32, Math.PI), [fx, top + 12.6, fz + 4], [0, Math.PI / 2, 0]);
  part(new THREE.CylinderGeometry(0.5, 0.45, 3, 20), [fx, top + 11.1, fz + 8]);
  part(new THREE.BoxGeometry(0.4, 0.4, 4.5), [fx + 1.2, top + 2.5, fz + 0.2], [-0.5, 0, 0]);
  return g;
}

/** What each handle does, said when the pointer is on it. */
const HANDLE_NAMES: Record<HandleData['handle'], string> = {
  left: 'Width (from the left)',
  right: 'Width (from the right)',
  top: 'Height',
  front: 'Depth',
  move: 'Move along the wall, or up and down',
};

/** What a handle does, in the cabinet's own frame (inches), as stored on it for a drag. */
interface HandleData {
  handle: 'left' | 'right' | 'top' | 'front' | 'move';
  axis?: THREE.Vector3;
  id: string;
  /** +1 when the cabinet's local +x runs toward the wall's end (offsets grow that way). */
  sign: number;
  /** The cabinet's size and place now: width, height, depth, bottom, setback, in inches. */
  w: number;
  h: number;
  d: number;
  y0: number;
  setback: number;
}

const SNAP = 1 / 16;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const units = (inches: number) => Math.round(inches * IN);

/**
 * A drag's edit and the outline to show: `moved` is how far the pointer went in the cabinet's
 * frame. Widths, heights and depths snap to 1/16" and never go below 1".
 */
export function dragResult(h: HandleData, moved: { x: number; y: number; z: number }): { edit: ItemEdit | null; box: { w: number; h: number; d: number; x: number; y: number; z: number }; text: string } {
  const dx = snap(moved.x);
  const dy = snap(moved.y);
  const dz = snap(moved.z);
  const at = { w: h.w, h: h.h, d: h.d, x: 0, y: h.y0 + h.h / 2, z: 0 };
  switch (h.handle) {
    case 'left':
    case 'right': {
      const grow = h.handle === 'left' ? -dx : dx;
      const w = Math.max(1, h.w + grow);
      const x = h.handle === 'left' ? (h.w - w) / 2 : (w - h.w) / 2;
      // Left as seen from the front is the cabinet's −x: the wall's start when +x runs toward its end.
      const side: 'low' | 'high' = (h.handle === 'left') === h.sign > 0 ? 'low' : 'high';
      return { edit: w === h.w ? null : { kind: 'resize', id: h.id, side, width: units(w) }, box: { ...at, w, x }, text: `Width ${formatInches(units(w))}` };
    }
    case 'top': {
      const hh = Math.max(1, h.h + dy);
      return { edit: hh === h.h ? null : { kind: 'box', id: h.id, height: units(hh) }, box: { ...at, h: hh, y: h.y0 + hh / 2 }, text: `Height ${formatInches(units(hh))}` };
    }
    case 'front': {
      const d = Math.max(1, h.d + dz);
      return { edit: d === h.d ? null : { kind: 'box', id: h.id, depth: units(d) }, box: { ...at, d, z: (d - h.d) / 2 }, text: `Depth ${formatInches(units(d))}` };
    }
    case 'move': {
      // Along the wall or up and down, whichever the pointer went further.
      if (Math.abs(dx) >= Math.abs(dy)) {
        return { edit: dx === 0 ? null : { kind: 'move', id: h.id, by: units(dx * h.sign) }, box: { ...at, x: dx }, text: `Moved ${formatInches(units(Math.abs(dx)))} ${dx < 0 ? 'left' : 'right'}` };
      }
      const y0 = Math.max(0, h.y0 + dy);
      return { edit: y0 === h.y0 ? null : { kind: 'box', id: h.id, elevation: units(y0) }, box: { ...at, y: y0 + h.h / 2 }, text: `Off the floor ${formatInches(units(y0))}` };
    }
  }
}

/** A grip's radius on screen, in CSS pixels: the same however near or far the camera is. */
const GRIP_PX = 7;

/**
 * The selected cabinet's grips, added to its group (its own frame). Researched against the common
 * planners and 3D editors (owner, 2026-11-13: "a complete jumbled mess … research good UI"): small
 * round grips sitting on the cabinet's own edges, the same size on screen at any zoom, each named
 * and with its own pointer when pointed at; the cabinet itself is dragged to move it. Width: the
 * middle of each side; height: the middle of the top front edge; depth: the middle of the top of
 * its right side. Returns the grips, and what a drag of the cabinet itself moves.
 */
function addHandles(s: Pick<Scene3D, 'mats'>, g: THREE.Group, c: CabinetView, ctx: Context): { grips: THREE.Object3D[]; body: HandleData } | null {
  if (!c.code || c.back || !DRAFT_SETTINGS.ok) return null;
  const wall = ctx.room.walls.find((w) => w.wall_id === c.wallId);
  if (!wall) return null;
  const w = inch(c.width);
  const hh = inch(c.height);
  const y0 = inch(c.elevation);
  const d = inch(c.depth ?? standard(c.code, 'depth') ?? 24 * IN);
  const zf = d / 2 + DOOR_T;
  const data = { id: c.id, sign: alongSign(ctx.room, wall), w, h: hh, d, y0, setback: inch(c.setback ?? 0) };
  // Drawn over everything, so a grip is never hidden behind a door or counter.
  const own = (key: string, color: string): THREE.Material => {
    const have = s.mats.get(key);
    if (have) return have;
    const made = new THREE.MeshBasicMaterial({ color, depthTest: false, toneMapped: false });
    s.mats.set(key, made);
    return made;
  };
  const blue = own('handle:blue', SELECT_BLUE);
  const white = own('handle:white', '#ffffff');
  const grips: THREE.Object3D[] = [];
  const add = (handle: HandleData['handle'], pos: [number, number, number], axis: THREE.Vector3) => {
    const o = new THREE.Group();
    o.position.set(...pos);
    o.userData = { ...data, handle, axis, grip: true } satisfies HandleData & { grip: true };
    // A white dot in a blue ring (unit size; the frame loop sizes it to GRIP_PX on screen).
    const ring = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), blue);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12), white);
    ring.renderOrder = 10;
    dot.renderOrder = 11;
    o.add(ring, dot);
    g.add(o);
    grips.push(o);
  };
  const ym = y0 + hh / 2;
  add('left', [-w / 2, ym, zf], new THREE.Vector3(1, 0, 0));
  add('right', [w / 2, ym, zf], new THREE.Vector3(1, 0, 0));
  add('top', [0, y0 + hh, zf], new THREE.Vector3(0, 1, 0));
  add('front', [w / 2, y0 + hh, 0], new THREE.Vector3(0, 0, 1));
  return { grips, body: { ...data, handle: 'move' } };
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
    const at = (dx: number, dy: number, dz: number): [number, number, number] => [pos[0] + dx, pos[1] + dy, pos[2] + dz];
    // A dark reveal just behind and just larger than the front: the gaps between fronts read as
    // shadow lines, as they do on real cabinets (owner, 2026-11-12: "lines and shadows on doors and
    // between cabinets need to be more clearly visible"). It moves with a door as it opens.
    box(s, parent, fw + GAP * 0.9, fh + GAP * 0.9, 0.1, at(0, 0, -DOOR_T / 2 - 0.08), `plain:${SURROUNDINGS.reveal}`, false);
    if (frame && !(drawer && fh < 7)) {
      const fr = Math.min(frame, fh / 4, fw / 4);
      box(s, parent, fr, fh, DOOR_T, at(-fw / 2 + fr / 2, 0, 0), finish);
      box(s, parent, fr, fh, DOOR_T, at(fw / 2 - fr / 2, 0, 0), finish);
      box(s, parent, fw - 2 * fr, fr, DOOR_T, at(0, fh / 2 - fr / 2, 0), finish);
      box(s, parent, fw - 2 * fr, fr, DOOR_T, at(0, -fh / 2 + fr / 2, 0), finish);
      box(s, parent, fw - 2 * fr + 0.2, fh - 2 * fr + 0.2, 0.375, at(0, 0, -0.2), finish);
      if (look.style === 'classic' && fh > 8 && fw > 8) box(s, parent, fw - 2 * fr - 2.5, fh - 2 * fr - 2.5, 0.5, at(0, 0, 0), finish);
      // Two outlines a door: the frame's outer edge and its inner edge.
      edgeLines(s, parent, fw, fh, DOOR_T, pos);
      edgeLines(s, parent, fw - 2 * fr, fh - 2 * fr, DOOR_T, pos);
    } else outline(s, box(s, parent, fw, fh, DOOR_T, pos, finish));
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
  /** One door hung from its hinge edge, so it swings open with "Open doors". `handle` false: no handle (a corner cabinet's second door). */
  const hangDoor = (x0: number, x1: number, y0: number, y1: number, depth: number, hinge: 'left' | 'right', handleY: number, handle: boolean) => {
    const dw = x1 - x0 - GAP;
    const dh = y1 - y0 - GAP;
    const dir = hinge === 'left' ? 1 : -1;
    const pv = new THREE.Group();
    pv.position.set(hinge === 'left' ? x0 : x1, 0, depth / 2 + DOOR_T);
    const cx = dir * (dw / 2 + GAP / 2);
    front(pv, dw, dh, [cx, (y0 + y1) / 2, -DOOR_T / 2], false);
    if (handle) hardware(pv, cx + dir * (dw / 2 - 1.6), handleY, 0, look.doorOrient === 'vertical', false);
    pv.userData = { dir: -dir, angle: 0, key: `${c.id}:${doorN++}` };
    s.doors.push(pv);
    g.add(pv);
  };
  /** A cabinet's face as laid out by model/fronts.ts (sections, door rule, drawer heights, handles). */
  const drawFace = (x0: number, x1: number, y0: number, y1: number, depth: number) => {
    if (!item) return;
    const pieces = frontPieces(
      { item, x0, x1, y0, y1, hinge: c.selections?.['hinge_side'] ?? null, sections: c.sections ?? null, drawerHandleTop: look.drawerTop, sinkFront: c.selections?.['sink_front'] ?? null },
      DRAFT_SETTINGS.ok ? DRAFT_SETTINGS.value.fronts : { maxSingleDoor: 20, maxDoorHeight: 48, topDrawer: 6.8125, upperBottom: 54, baseTop: 34.75 },
    );
    const inner = `paint:${SURROUNDINGS.interior}`;
    for (const p of pieces) {
      if (p.kind === 'door') hangDoor(p.x0, p.x1, p.y0, p.y1, depth, p.hinge, p.handleY, p.handle);
      else if (p.kind === 'drawer') {
        const fw = p.x1 - p.x0;
        front(g, fw - GAP, p.y1 - p.y0 - GAP, [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, depth / 2 + DOOR_T / 2], true);
        hardware(g, (p.x0 + p.x1) / 2, p.handleY, depth / 2 + DOOR_T, false, true);
      } else if (p.kind === 'shelf') b(p.x1 - p.x0 - 1.5, 0.75, depth - 2, [(p.x0 + p.x1) / 2, p.y, 0], inner, false);
      else if (p.kind === 'rollout') {
        // A roll-out tray: a shallow box behind the doors.
        b(p.x1 - p.x0 - 2.5, 0.5, depth - 3, [(p.x0 + p.x1) / 2, p.y, 0], inner, false);
        b(p.x1 - p.x0 - 2.5, 3, 0.5, [(p.x0 + p.x1) / 2, p.y + 1.5, depth / 2 - 1.75], inner, false);
      } else if (p.kind === 'divider') b(p.x1 - p.x0, p.y1 - p.y0, depth, [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0.01], carcass);
      else if (p.kind === 'open') b(p.x1 - p.x0 - 1.5, p.y1 - p.y0 - 1.5, 0.3, [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, -depth / 2 + 0.75], `paint:${doorHex}`, false);
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
      // A French-door fridge with a freezer drawer, its front as chosen (owner, 2026-11-12: brushed
      // aluminum, black, white, or panelled to match the doors; stainless until chosen), with handles.
      const fh = inch(v.fridgeHeight);
      const chosen = c.housed ? chosenLook({ kind: c.housed.kind, selections: c.housed.selections }, 'front') : null;
      const panelled = chosen?.code === 'panelled';
      const skin = chosen?.hex ? (chosen.code === 'brushed_aluminum' ? `steel:${chosen.hex}` : `enamel:${chosen.hex}`) : `steel:${SURROUNDINGS.steel}`;
      const app = new THREE.Group();
      app.userData['applianceId'] = c.housed?.placementId ?? '';
      g.add(app);
      box(s, app, w - 0.5, fh, d - 1.5, [0, fh / 2, -0.75], panelled ? `paint:${SURROUNDINGS.interior}` : skin);
      const drawerH = Math.min(26, fh * 0.32);
      const doorH = fh - drawerH - 1;
      const zf = d / 2 - 0.75;
      const fw = w - 0.75;
      for (const k of [-1, 1]) {
        const cx = (k * fw) / 4;
        if (panelled) front(app, fw / 2 - GAP, doorH - GAP, [cx, drawerH + 1 + doorH / 2, zf], false);
        else outline(s, box(s, app, fw / 2 - GAP, doorH - GAP, 1.5, [cx, drawerH + 1 + doorH / 2, zf], skin));
        // The handles meet in the middle, as on a French-door fridge.
        if (panelled) hardware(app, -k * 1.6, drawerH + 1 + doorH * 0.45, zf + DOOR_T / 2, true, false);
        else {
          box(s, app, 0.8, doorH * 0.55, 0.8, [-k * 1.8, drawerH + 1 + doorH * 0.5, zf + 2.2], `steel:${SURROUNDINGS.steel}`);
          for (const y of [-1, 1]) box(s, app, 0.6, 0.6, 1.6, [-k * 1.8, drawerH + 1 + doorH * 0.5 + (y * doorH * 0.55) / 2.2, zf + 1.2], `steel:${SURROUNDINGS.steel}`);
        }
      }
      if (panelled) {
        front(app, fw - GAP, drawerH - GAP, [0, drawerH / 2 + 0.5, zf], true);
        hardware(app, 0, drawerH - 3, zf + DOOR_T / 2, false, true);
      } else {
        outline(s, box(s, app, fw - GAP, drawerH - GAP, 1.5, [0, drawerH / 2 + 0.5, zf], skin));
        box(s, app, Math.max(2, fw - 8), 0.8, 0.8, [0, drawerH - 3, zf + 2.2], `steel:${SURROUNDINGS.steel}`);
      }
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
      // One door on this wall's face, beside the other leg, with the only handle (owner,
      // 2026-11-12: "Corner cabinets shouldn't have handles on both doors"): hinged by the inside
      // corner, the handle on the far edge ("not in the corner … on the far opposite edge from
      // where the hinge is").
      const [fx0, fx1] = xr(legD, w);
      if (fx1 - fx0 > 1) hangDoor(fx0, fx1, y0, top, 2 * zFace, inward > 0 ? 'left' : 'right', upper ? y0 + 5 : top - 5, true);
      // The door on the other leg's face, turned to face along this wall.
      const fw = d - legD;
      if (fw > 1) {
        const face = new THREE.Group();
        face.position.set(cx0 + inward * legD, 0, (zFace + d / 2) / 2);
        face.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2;
        // The second door folds with the first: no handle of its own.
        front(face, fw - GAP, top - y0 - GAP, [0, (y0 + top) / 2, DOOR_T / 2], false);
        g.add(face);
      }
    } else if (item.type === 'appliance_opening') {
      // The dishwasher in its opening, flush with the cabinet doors: its front as chosen (owner,
      // 2026-11-12: brushed aluminum, black, white, or panelled to match the doors; stainless until
      // chosen), with a handle, the tub behind it, a recessed toe kick and the run's counter over it.
      const inner = h - toe;
      const chosen = c.housed ? chosenLook({ kind: c.housed.kind, selections: c.housed.selections }, 'front') : null;
      b(w - 0.5, inner - 0.5, d - DOOR_T - 0.75, [0, toe + inner / 2, -DOOR_T / 2 - 0.375], `plain:${SURROUNDINGS.black}`);
      const app = new THREE.Group();
      app.userData['applianceId'] = c.housed?.placementId ?? '';
      g.add(app);
      if (chosen?.code === 'panelled') {
        front(app, w - GAP, inner - GAP, [0, toe + inner / 2, d / 2 - DOOR_T / 2], false);
        hardware(app, 0, h - 4, d / 2, false, true);
      } else {
        const key = chosen?.hex ? `enamel:${chosen.hex}` : `steel:${SURROUNDINGS.steel}`;
        outline(s, box(s, app, w - GAP, inner - GAP, DOOR_T, [0, toe + inner / 2, d / 2 - DOOR_T / 2], chosen?.code === 'brushed_aluminum' ? `steel:${chosen.hex}` : key));
        // A bar handle on two posts across the top.
        const hw = `metal:${SURROUNDINGS.handle}`;
        box(s, app, Math.max(1, w - 5), 0.7, 0.7, [0, h - 3.2, d / 2 + 1.35], hw);
        for (const x of [-(w - 7) / 2, (w - 7) / 2]) box(s, app, 0.6, 0.6, 1.2, [x, h - 3.2, d / 2 + 0.6], hw);
      }
      b(w - 1, toe, d - 3, [0, toe / 2, -1.5], kick, false);
    } else if (c.layer === 'upper') {
      const y0 = inch(c.elevation);
      b(w, h, d, [0, y0 + h / 2, 0], carcass);
      drawFace(-w / 2, w / 2, y0, top, d);
    } else {
      b(w, h - toe, d, [0, toe + (h - toe) / 2, 0], carcass);
      b(w, toe, d - 3, [0, toe / 2, -1.5], kick, false);
      drawFace(-w / 2, w / 2, toe, h, d);
    }
    // A finished back, as chosen on the cabinet (owner, 2026-11-12): a panel, or door panels like the fronts.
    const back = c.selections?.['back'];
    if (!c.back && (back === 'finished_panel' || back === 'finished_door')) {
      const y0 = c.layer === 'upper' ? inch(c.elevation) : 0;
      const face = new THREE.Group();
      face.position.set(0, 0, -d / 2 - 0.01);
      face.rotation.y = Math.PI;
      g.add(face);
      if (back === 'finished_panel') outline(s, box(s, face, w, top - y0, DOOR_T, [0, (y0 + top) / 2, DOOR_T / 2], finish));
      else {
        const count = w > 20 ? 2 : 1;
        for (let k = 0; k < count; k++) front(face, w / count - GAP, top - y0 - (c.layer === 'upper' ? 0 : toe) - GAP, [-w / 2 + (w / count) * (k + 0.5), (top + y0 + (c.layer === 'upper' ? 0 : toe)) / 2, DOOR_T / 2], false);
      }
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
      // An integrated finished end is the cabinet's own side, finished: flush with the box, behind
      // the doors. An applied one is a panel over the side, flush with the doors' faces.
      const integrated = (side === 'low' ? c.ends?.low : c.ends?.high) === 'finished';
      if (integrated) b(0.76, top - y0, d, [x, (y0 + top) / 2, 0], finish);
      else outline(s, b(0.76, top - y0, d + DOOR_T, [x, (y0 + top) / 2, DOOR_T / 2], finish));
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
    // A blue glow (the usual selection colour; owner, 2026-11-12, was gold) on the cabinet itself, plus its outline, so the selection is easy to see.
    // No see-through box around it: one larger than the cabinet poked out of the island's back and
    // looked like a fault in the drawing (owner, 2026-11-10).
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material;
      if (m instanceof THREE.MeshStandardMaterial) {
        const lit = m.clone();
        lit.emissive = new THREE.Color(SELECT_BLUE);
        lit.emissiveIntensity = 0.45;
        mesh.material = lit;
      }
    });
    // Measured before the cabinet is moved into place, so the outline is in its own frame.
    const b3 = new THREE.Box3().setFromObject(g);
    const sz = b3.getSize(new THREE.Vector3());
    const ctr = b3.getCenter(new THREE.Vector3());
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sz.x + 0.3, sz.y + 0.3, sz.z + 0.3)), new THREE.LineBasicMaterial({ color: SELECT_BLUE }));
    edges.position.copy(ctr);
    g.add(edges);
  }
  const p = placement(room, wall, c.offset, c.width, depthBase, c.setback ?? 0);
  g.position.copy(p.at);
  g.rotation.y = p.angle;
  return g;
}
