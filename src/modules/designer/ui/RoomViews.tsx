'use client';
/**
 * The 3D view of a room at one fixed view, for the screenshot command (`npm run views`): no
 * picking, doors closed (or all open with `?open=all`), nothing selected. The studio doesn't use it; its 3D view is unchanged.
 */
import { useCallback, useMemo, useState } from 'react';
import type { Room } from '@/core/index';
import { cabinetViews } from '../model/cabinets';
import type { CameraView } from './camera-views';
import { islandPanelsOf, type DesignChoices } from '../model/choices';
import { Stage3D } from './Stage3D';

export function RoomViews({ room, choices, view, open = null }: { room: Room; choices: DesignChoices; view: CameraView; open?: 'all' | null }) {
  const cabinets = useMemo(() => cabinetViews(room), [room]);
  const panels = islandPanelsOf(choices);
  const [problem, setProblem] = useState<string | null>(null);
  const onPick = useCallback(() => undefined, []);
  return (
    <>
      {problem && (
        <p role="alert" data-testid="views-problem" style={{ position: 'absolute', zIndex: 1, margin: 16 }}>
          {problem}
        </p>
      )}
      <Stage3D room={room} cabinets={cabinets} look={choices.look} panels={panels} selected={null} open={open} insides={{ cornerInsert: choices.cornerInsert, garbage: choices.garbage }} view={view} onPick={onPick} onError={setProblem} />
    </>
  );
}
