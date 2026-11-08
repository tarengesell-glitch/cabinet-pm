/**
 * Which placeholder picture each option gets, drawn from what the client has picked so far.
 * The colours of the feel pictures below are part of the placeholder pictures, not business
 * values: real photos replace them (BUILD_PLAN 7b).
 */
import type { FieldDef } from '../model/definition';
import { Intake, type Answer, type Option } from '../model/engine';
import { backPanel, corner, doorClose, elevation, hardwareClose, interior, islandScene, plan, sidePanel, unitClose, type Look } from './art';

const NEUTRAL_DOOR = '#DAD6CE';
const NEUTRAL_COUNTER = '#B4ADA3';
const DARK = '#262626';

/** Placeholder looks for the five feel pictures. */
const FEEL_LOOK: Readonly<Record<string, Partial<Look>>> = {
  ultra_modern: { door: '#3B3836', style: 'ultra_modern', doorHw: 'none', drawerHw: 'none', toCeiling: true },
  modern: { door: '#EEEBE4', style: 'modern', doorHw: 'handle', drawerHw: 'handle', pullFinish: DARK },
  transitional: { door: '#C9C6BE', style: 'transitional', doorHw: 'handle', drawerHw: 'handle', pullFinish: '#A7A8A4' },
  country: { door: '#A3B09B', style: 'country', doorHw: 'knob', drawerHw: 'knob', knobFinish: '#B39257' },
  classic: { door: '#F2EFE6', style: 'classic', doorHw: 'knob', drawerHw: 'knob', knobFinish: '#B39257', topTrim: 'crown' },
};

const str = (v: Answer | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

/** What the room looks like so far. Unchosen things are drawn in neutral placeholder colours. */
export function lookOf(x: Intake): Look {
  const feel = FEEL_LOOK[str(x.effKey('feel')) ?? ''] ?? {};
  const field = (k: string) => x.def.fields.get(k);
  const first = (k: string) => {
    const f = field(k);
    return f ? x.options(f)[0]?.hex : undefined;
  };
  const cab = x.hexOf(x.effKey('cabinet_colour')) ?? first('cabinet_colour') ?? feel.door ?? NEUTRAL_DOOR;
  const base = (x.effKey('base_colour_mode') === 'own' && x.hexOf(x.effKey('base_colour'))) || cab;
  const im = x.effKey('island_colour_mode');
  const island = im === 'own' ? (x.hexOf(x.effKey('island_colour')) ?? cab) : im === 'base' ? base : cab;
  const sec = x.effKey('secondary_colour_mode') === 'add' ? x.hexOf(x.effKey('secondary_colour')) : null;
  const trim = (mode: Answer | undefined, other: string) => (mode === 'secondary' ? (sec ?? cab) : mode === 'other' ? (x.hexOf(x.effKey(other)) ?? cab) : cab);
  const hwField = field('hardware');
  const hwOpt = hwField ? x.options(hwField).find((o) => o.id === x.effKey('hardware'))?.def : undefined;
  const style = str(x.effKey('door_style')) ?? str(x.effKey('feel')) ?? 'modern';
  const drawers = str(x.effKey('drawer_level'));
  return {
    door: cab,
    baseDoor: base,
    island,
    counter: x.hexOf(x.effKey('counter_colour')) ?? first('counter_colour') ?? NEUTRAL_COUNTER,
    style,
    wood: x.effKey('material') === 'wood',
    doorHw: hwOpt?.door ?? feel.doorHw ?? 'handle',
    drawerHw: hwOpt?.drawer ?? feel.drawerHw ?? 'handle',
    pullFinish: x.hexOf(x.effKey('handle_finish')) ?? feel.pullFinish ?? DARK,
    knobFinish: x.hexOf(x.effKey('knob_finish')) ?? feel.knobFinish ?? DARK,
    doorOrient: x.effKey('handle_position_doors') === 'horizontal' ? 'horizontal' : 'vertical',
    drawerTop: x.effKey('handle_position_drawers') === 'near_top',
    drawers: drawers === 'moderate' || drawers === 'maximum' ? drawers : 'minimum',
    toCeiling: x.effKey('cabinet_height') === 'to_ceiling',
    topTrim: str(x.effKey('top_trim_style')) ?? feel.topTrim ?? null,
    trimHex: trim(x.effKey('top_trim_colour'), 'top_trim_colour_other'),
    valance: str(x.effKey('light_valance')) ?? null,
    valanceHex: trim(x.effKey('light_valance_colour'), 'light_valance_colour_other'),
    plain: !x.isPrimary(),
    counters: true,
  };
}

/** The room's main picture: with the island in front when the kitchen has one. */
export function scene(x: Intake): string {
  const look = lookOf(x);
  const shape = x.def.fields.get('shape');
  const hasIsland = x.isPrimary() && !!shape?.options?.find((o) => o.id === x.effKey('shape'))?.island;
  return hasIsland ? islandScene(look) : elevation(look);
}

/** The picture for one option of a picture question. */
export function optionPicture(x: Intake, f: FieldDef, o: Option): string {
  const look = lookOf(x);
  const plainStyle = look.style === 'ultra_modern' ? 'modern' : look.style;
  switch (f.art) {
    case 'plan':
      return plan(o.id);
    case 'feel':
      return elevation({ ...look, plain: !x.isPrimary(), toCeiling: false, topTrim: null, valance: null, ...FEEL_LOOK[o.id], baseDoor: FEEL_LOOK[o.id]?.door ?? look.door, counters: false });
    case 'material': {
      const style = FEEL_LOOK[String(x.effKey('feel'))]?.style ?? 'transitional';
      const door = o.id === 'wood' ? '#B08A5E' : '#D9DCD5';
      return doorClose({ ...look, style, wood: o.id === 'wood', doorHw: 'none' }, door);
    }
    case 'tone': {
      const [d, c] = o.id.split('.');
      const pal = x.def.colours.door_palettes[x.effKey('material') === 'wood' ? 'wood' : 'painted'];
      const door = pal.find((t) => t.id === d)?.subs[0] ?? look.door;
      const counter = x.def.colours.counter_tones.find((t) => t.id === c)?.subs[0] ?? look.counter;
      return elevation({ ...look, door, baseDoor: door, counter });
    }
    case 'door': {
      const fl = FEEL_LOOK[o.id] ?? {};
      return doorClose({ ...look, style: o.id, doorHw: fl.doorHw ?? 'handle', drawerHw: fl.drawerHw ?? 'handle' }, look.door);
    }
    case 'hardware': {
      const d = o.def;
      return unitClose({ ...look, style: plainStyle, doorHw: d?.door ?? 'handle', drawerHw: d?.drawer ?? 'handle', drawerTop: false, doorOrient: 'vertical' });
    }
    case 'handle':
      return hardwareClose('handle', o.id, look.baseDoor, look.pullFinish);
    case 'knob':
      return hardwareClose('knob', o.id, look.baseDoor, look.knobFinish);
    case 'door_position':
      return doorClose({ ...look, style: plainStyle, doorHw: 'handle', doorOrient: o.id === 'horizontal' ? 'horizontal' : 'vertical' }, look.baseDoor);
    case 'drawer_position': {
      const knob = look.drawerHw === 'knob';
      const spec = knob ? (str(x.effKey('knob_style')) ?? 'round') : (str(x.effKey('handle_style')) ?? 'bar');
      return hardwareClose(knob ? 'knob' : 'handle', spec, look.baseDoor, knob ? look.knobFinish : look.pullFinish, o.id === 'near_top');
    }
    case 'back_panel':
      return backPanel(look, o.id);
    case 'side_panel':
      return sidePanel(look, o.id);
    case 'top_trim':
      return elevation({ ...look, topTrim: o.id, toCeiling: false, valance: null }, '0 0 400 120');
    case 'valance':
      return elevation({ ...look, valance: o.id }, '0 60 400 120');
    case 'corner':
      return corner(o.id);
    case 'interior':
      return interior(o.id, look);
    case 'drawers':
      return elevation({ ...look, drawers: o.id === 'moderate' || o.id === 'maximum' ? o.id : 'minimum' }, '0 152 400 110');
    case 'preset': {
      if (!o.answers) return '';
      const copy = JSON.parse(JSON.stringify(x.state)) as typeof x.state;
      const room = copy.rooms[x.roomIndex];
      if (!room) return '';
      room.answers = { ...room.answers, ...o.answers };
      const y = new Intake(x.def, copy);
      return y.inRoom(x.roomIndex, () => elevation(lookOf(y)));
    }
    default:
      return '';
  }
}

export { elevation };
