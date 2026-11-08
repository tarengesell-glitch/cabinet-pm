import type { ReactNode } from 'react';
// Fonts from npm, so no font host is needed at runtime (DECISIONS C-2, UX_BRIEF Part 4).
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import '@/core/design-system/tokens.css';

export const metadata = {
  title: 'Cabinet design platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
