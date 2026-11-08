import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32, maxWidth: 640 }}>
      <h1>Cabinet design platform</h1>
      <p>Early preview. A design goes through these steps, in this order:</p>
      <ol>
        <li>
          <Link href="/intake">Design choices</Link>: the client picks the layout, look, colours, hardware and inserts for each room, one
          question at a time with pictures.
        </li>
        <li>
          <Link href="/rooms/preview">Room drawing</Link>: draw walls, add doors and windows, mark the cabinet runs and appliances, type
          exact sizes and see the checks live.
        </li>
      </ol>
    </main>
  );
}
