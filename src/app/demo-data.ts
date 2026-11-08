/**
 * DEMO DATA for the placeholder Today, Tasks and Clients screens (owner, 2026-11-08: "add in
 * placeholder Today, Tasks, Clients"), from the owner's Kitchen Studio prototype. The people are
 * made up. Nothing here is saved or sent anywhere; the screens say it is demo data (rule 14).
 * Replaced by the projects module (customers, jobs) and the connectors (calendar, meetings).
 */

export interface DemoClient {
  readonly id: string;
  readonly name: string;
  readonly primary: string;
  readonly secondary?: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
  readonly notes: string;
}

export interface DemoMeeting {
  readonly id: string;
  readonly clientId: string;
  readonly title: string;
  /** Days from today, hour and minute. */
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly platform: string;
  readonly visit: number;
  readonly prior?: string;
}

export interface DemoTask {
  readonly id: string;
  readonly clientId: string | null;
  readonly title: string;
  readonly detail?: string;
  /** Days from today and the hour it is due, or null for no date. */
  readonly due: { readonly day: number; readonly hour: number } | null;
}

export const DEMO_CLIENTS: readonly DemoClient[] = [
  { id: 'c1', name: 'Dana & Marcus Whitfield', primary: 'Dana Whitfield', secondary: 'Marcus Whitfield', email: 'dana.whitfield@example.com', phone: '(403) 555-0148', address: '412 Silverhorn Ridge NW, Calgary, AB', notes: 'New build. Possession in six weeks: install must land before move-in.' },
  { id: 'c2', name: 'Priya Raman', primary: 'Priya Raman', email: 'priya.raman@example.com', phone: '(403) 555-0193', address: '88 Mahogany Terrace SE, Calgary, AB', notes: 'Renovation. Wants wood grain throughout. Budget-conscious on hardware.' },
  { id: 'c3', name: 'Tom & Erin Beaulieu', primary: 'Tom Beaulieu', secondary: 'Erin Beaulieu', email: 'tom.beaulieu@example.com', phone: '(587) 555-0112', address: '15 Aspen Stone Blvd SW, Calgary, AB', notes: 'Erin makes the decisions. Copy Tom on everything.' },
  { id: 'c4', name: 'Sandeep Gill', primary: 'Sandeep Gill', email: 's.gill@example.com', phone: '(403) 555-0177', address: '2201 Riverbend Gate SE, Calgary, AB', notes: 'Referred by the Whitfields.' },
];

export const DEMO_MEETINGS: readonly DemoMeeting[] = [
  { id: 'm1', clientId: 'c3', title: 'Kitchen design review', day: 0, hour: 10, minute: 0, platform: 'Google Meet', visit: 2, prior: 'Walked the L-shape with island. Erin wants the sink centred under the window and asked about a pull-out spice rack.' },
  { id: 'm2', clientId: 'c1', title: 'Initial consultation', day: 0, hour: 14, minute: 0, platform: 'Zoom', visit: 1 },
  { id: 'm3', clientId: 'c2', title: 'Design choices', day: 1, hour: 9, minute: 30, platform: 'Google Meet', visit: 2, prior: 'Picked a galley. Deciding between light-medium and dark-medium wood: send both samples.' },
  { id: 'm4', clientId: 'c4', title: 'Initial consultation', day: 1, hour: 15, minute: 0, platform: 'Teams', visit: 1 },
  { id: 'm5', clientId: 'c3', title: 'Final sign-off', day: 2, hour: 11, minute: 0, platform: 'Google Meet', visit: 3, prior: 'Design agreed. Waiting on Erin to confirm the handle finish before it goes to the shop.' },
];

export const DEMO_TASKS: readonly DemoTask[] = [
  { id: 't1', clientId: 'c2', title: 'Send wood samples to Priya', detail: 'Light-medium and dark-medium. Courier before her call tomorrow.', due: { day: 0, hour: 17 } },
  { id: 't2', clientId: 'c3', title: 'Confirm handle finish with Erin', detail: 'Last open item before the Beaulieu kitchen can go to the shop.', due: { day: 0, hour: 12 } },
  { id: 't6', clientId: 'c1', title: 'Prep the Whitfield intake', detail: 'First call at 2 pm. New build: ask for the builder’s plans and appliance list.', due: { day: 0, hour: 13 } },
  { id: 't7', clientId: 'c2', title: 'Chase Priya’s ceiling height', detail: 'She said 8′ but the plans say 9′.', due: { day: -1, hour: 16 } },
  { id: 't3', clientId: 'c1', title: 'Book site measure, Whitfield', detail: 'Measure inside two weeks to protect the install date.', due: { day: 4, hour: 9 } },
  { id: 't4', clientId: 'c4', title: 'Send Sandeep the referral discount', detail: 'Confirm with accounts before quoting.', due: null },
];

export const demoClient = (id: string | null): DemoClient | null => DEMO_CLIENTS.find((c) => c.id === id) ?? null;

/** A demo client's design job: one per client, named after them. */
export const jobName = (c: DemoClient): string => `${c.name.split(/\s+/).pop()} design`;

/** A date from "days from today" and a time, in this browser's time zone. */
export function demoDate(day: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + day);
  d.setHours(hour, minute, 0, 0);
  return d;
}
