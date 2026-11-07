/**
 * The kitchen intake, from data/kitchen.json (seeded from docs/intake/kitchen.md).
 * A bad data file fails loudly when the app starts; it is never filled in.
 */
import raw from '../data/kitchen.json';
import { readIntake, type Intake } from './intake';

const read = readIntake(raw);
if (!read.ok) throw new Error(read.reason);

export const KITCHEN_INTAKE: Intake = read.value;
