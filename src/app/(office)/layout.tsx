import type { ReactNode } from 'react';
import { OfficeSync } from '../sync/OfficeSync';
import { StaffGate } from '../sync/session';
import { OfficeFrame } from './OfficeFrame';

export default function OfficeLayout({ children }: { children: ReactNode }) {
  return (
    <StaffGate>
      <OfficeFrame>
        <OfficeSync>{children}</OfficeSync>
      </OfficeFrame>
    </StaffGate>
  );
}
