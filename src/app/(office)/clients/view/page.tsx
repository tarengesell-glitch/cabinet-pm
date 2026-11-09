import { ClientById } from './ClientById';

export const metadata = { title: 'Client' };

/** A real client, opened by ID (`?id=`): the site is plain pages, so clients added later can't have pages of their own. */
export default function Page() {
  return <ClientById />;
}
