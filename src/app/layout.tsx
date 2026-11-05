import type { ReactNode } from 'react';

export const metadata = {
  title: 'Cabinet design platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
