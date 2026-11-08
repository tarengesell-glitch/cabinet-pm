import { DEMO_CLIENTS } from '../../../demo-data';
import { ClientPage } from './ClientPage';

export const metadata = { title: 'Client' };

/** The demo clients are a fixed list, so their pages are made when the site is built. */
export function generateStaticParams() {
  return DEMO_CLIENTS.map((c) => ({ id: c.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientPage id={id} />;
}
