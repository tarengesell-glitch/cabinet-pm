'use client';
/**
 * TEST ONLY: the 3D view of a test job at one fixed view, for the screenshot command (`npm run
 * views`, `views/capture.spec.ts`). The command leaves a drawn room (no cabinets) in this
 * browser's storage and opens `/test/views/?view=wall-A` (or overall, island). The page runs the
 * real design step on it (the designer's `draftRoom`, as the studio does) and shows the result.
 * Not part of the app: on the live site (a production build) it shows only a note.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { JobSchema, type Room } from '@/core/index';
import { PREVIEW_USER } from '@/platform/index';
import { draftRoom, importRoomData, type DesignChoices } from '@/modules/designer/contract';
import type { CameraView } from '@/modules/designer/ui/index';

const RoomViews = dynamic(() => import('@/modules/designer/ui/index').then((m) => m.RoomViews), { ssr: false });

/** Where the screenshot command leaves the job to show. */
export const TEST_VIEWS_KEY = 'cabinet-pm.test-views.job';

/**
 * Fixed design choices for the screenshots, so they compare: drawer banks, a Lazy Susan corner, a
 * garbage cabinet, cabinets to the ceiling, placeholder colours, island door panels and detailed sides.
 */
const CHOICES: DesignChoices = {
  roomKind: 'kitchen',
  cabinetTop: 'ceiling',
  drawerLevel: { status: 'chosen', option_id: 'maximum' },
  cornerInsert: 'lazy_susan',
  garbage: 'dedicated_cabinet',
  islandBackPanel: { status: 'chosen', option_id: 'door_panels' },
  islandSidePanel: { status: 'chosen', option_id: 'detailed_short' },
  look: {
    door: '#eeebe4',
    baseDoor: '#c9c6be',
    island: '#5b6b73',
    counter: '#d8d4cc',
    style: 'transitional',
    doorHw: 'handle',
    drawerHw: 'handle',
    pullFinish: '#262626',
    knobFinish: '#262626',
    doorOrient: 'vertical',
    drawerTop: false,
    topTrim: 'crown',
    trimHex: '#eeebe4',
    valance: 'flat',
    valanceHex: '#eeebe4',
  },
};

export function TestViews() {
  const [state, setState] = useState<{ room: Room; view: CameraView } | { problem: string } | null>(null);
  useEffect(() => {
    void import('@/modules/designer/ui/index').then(({ parseView }) => {
      const name = new URLSearchParams(window.location.search).get('view') ?? 'overall';
      const view = parseView(name);
      if (!view) return setState({ problem: `"${name}" isn't a view: use overall, island or wall-A, wall-B…` });
      const raw = window.localStorage.getItem(TEST_VIEWS_KEY);
      if (!raw) return setState({ problem: 'No test room in this browser. Run npm run views.' });
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        return setState({ problem: `The test job can't be read: ${error instanceof Error ? error.message : String(error)}` });
      }
      const job = JobSchema.safeParse(data);
      if (!job.success) return setState({ problem: `The test job isn't a valid master copy: ${job.error.message}` });
      const drawn = job.data.rooms[0];
      if (!drawn) return setState({ problem: 'The test job has no room.' });
      // The real design step, as the studio runs it: the layout with its ends, saved in this browser.
      const kept = importRoomData(drawn.room_id, { drawing: { job: job.data, wallDefaults: null }, design: null });
      if (kept) return setState({ problem: kept });
      const room = draftRoom(drawn.room_id, CHOICES, PREVIEW_USER.id);
      if (!room.ok) return setState({ problem: room.reason });
      setState({ room: room.value, view });
    });
  }, []);
  if (process.env.NODE_ENV === 'production') return <p style={{ padding: 16 }}>This page is only for the screenshot command in development.</p>;
  if (!state) return <p style={{ padding: 16 }}>Loading…</p>;
  if ('problem' in state)
    return (
      <p role="alert" data-testid="views-problem" style={{ padding: 16 }}>
        {state.problem}
      </p>
    );
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#f4f2ee' }}>
      <RoomViews room={state.room} choices={CHOICES} view={state.view} />
    </div>
  );
}
