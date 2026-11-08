import type { ReactNode } from 'react';
import { OfficeFrame } from './OfficeFrame';

export default function OfficeLayout({ children }: { children: ReactNode }) {
  return <OfficeFrame>{children}</OfficeFrame>;
}
