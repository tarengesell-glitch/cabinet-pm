import Link from 'next/link';
import s from './home.module.css';

export default function HomePage() {
  return (
    <div className={s.page}>
      <header className={s.top}>
        <span className={s.logo} aria-hidden="true">
          C
        </span>
        <div>
          <div className={s.brand}>Cabinet design platform</div>
          <div className={s.sub}>Early preview</div>
        </div>
        <span className={s.spacer} />
        <span className={s.flag}>Preview · kept in this browser · signed-in user mocked</span>
      </header>
      <main className={s.main}>
        <h1 className={s.h1}>Cabinet design platform</h1>
        <p className={s.lead}>A design goes through these steps, in this order. The design studio takes one job through them, room by room.</p>
        <Link className={s.studio} href="/studio/">
          <span className={s.studioName}>Open the design studio</span>
          <span className={s.studioNote}>Every room’s choices, then each room drawn to size. AI design and Customize come later.</span>
        </Link>
        <h2 className={s.h2}>Each step on its own</h2>
        <ol className={s.steps}>
          <li>
            <Link href="/intake">Design choices</Link>
            <span>: the client picks the layout, look, colours, hardware and inserts for each room, one question at a time with pictures.</span>
          </li>
          <li>
            <Link href="/rooms/preview">Room drawing</Link>
            <span>: draw walls, add doors and windows, mark the cabinet runs and appliances, type exact sizes and see the checks live.</span>
          </li>
        </ol>
      </main>
    </div>
  );
}
