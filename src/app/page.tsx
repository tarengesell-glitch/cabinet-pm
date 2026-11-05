import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32, maxWidth: 640 }}>
      <h1>Cabinet design platform</h1>
      <p>Early preview. What exists so far:</p>
      <ul>
        <li>
          <Link href="/rooms/preview">Room drawing</Link>: draw walls, add doors and windows, type exact sizes and see the
          checks live.
        </li>
      </ul>
    </main>
  );
}
