'use client';
import { KITCHEN_INTAKE } from '@/modules/intake/contract';
import { IntakeFlow } from '@/modules/intake/ui/index';
import { PREVIEW_USER } from '@/platform/index';

export function IntakePreview() {
  // MOCKED user until sign-in exists (rule 14); the screen shows that it is mocked.
  return <IntakeFlow user={PREVIEW_USER} intake={KITCHEN_INTAKE} title="Kitchen intake" />;
}
