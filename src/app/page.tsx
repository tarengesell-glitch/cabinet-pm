import Link from 'next/link';
import styles from './page.module.css';

export default function HomePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Cabinet design platform</h1>
      <p className={styles.lead}>Early preview. A design goes through these steps, in this order:</p>
      <ol className={styles.steps}>
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
