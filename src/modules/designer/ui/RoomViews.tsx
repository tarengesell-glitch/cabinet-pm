'use client';
/**
 * The 3D view of a room at one fixed view, for the screenshot command (`npm run views`): no
 * picking, doors closed, nothing selected. The studio doesn't use it; its 3D view is unchanged.
 */
import { useCallback, useMemo, useState } from 'react';
import type { Room } from '@/core/index';
import { cabinetViews } from '../model/cabinets';
import type { CameraView } from './camera-views';
import { Stage3D, type FinishLook } from './Stage3D';

export function RoomViews({ room, look, view }: { room: Room; look: FinishLook; view: CameraView }) {
  const cabinets = useMemo(() => cabinetViews(room), [room]);
  const [problem, setProblem] = useState<string | null>(null);
  const onPick = useCallback(() => undefined, []);
  return (
    <>
      {problem && (
        <p role="alert" data-testid="views-problem" style={{ position: 'absolute', zIndex: 1, margin: 16 }}>
          {problem}
        </p>
      )}
      <Stage3D room={room} cabinets={cabinets} look={look} selected={null} doorsOpen={false} fitToken={0} view={view} onPick={onPick} onError={setProblem} />
    </>
  );
}
