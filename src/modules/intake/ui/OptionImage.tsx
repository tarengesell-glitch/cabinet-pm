'use client';
import { useState } from 'react';
import type { Fidelity, IntakeOption } from '../model/intake';
import s from './IntakeFlow.module.css';

const TO_COME: Record<NonNullable<Fidelity> | 'none', string> = {
  line_drawing: 'Line drawing to come',
  photo: 'Photo to come',
  photo_no_counters: 'Photo (no counters) to come',
  none: 'Image to come',
};

/**
 * The picture for one option. Placeholders are always labelled as placeholders, and a picture
 * that fails to load says so in red rather than leaving a blank tile.
 */
export function OptionImage({ option, fidelity, small = false }: { option: IntakeOption; fidelity: Fidelity; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const badge = !small && <span className={s.placeholderBadge}>Placeholder</span>;

  if (option.image === 'placeholder') {
    if (option.shades) {
      const [door, counter] = option.shades;
      return (
        <div className={`${s.image} ${small ? s.imageSmall : ''}`} aria-hidden="true">
          <div className={s.swatch}>
            <span style={{ background: door, flex: 5 }} />
            <span style={{ background: counter, flex: 1.4 }} />
            <span style={{ background: door, flex: 6 }} />
          </div>
          {badge}
        </div>
      );
    }
    return (
      <div className={`${s.image} ${s.placeholder} ${small ? s.imageSmall : ''}`} aria-hidden="true">
        {!small && <span className={s.placeholderText}>{TO_COME[fidelity ?? 'none']}</span>}
        {badge}
      </div>
    );
  }

  if (failed) {
    return (
      <div className={`${s.image} ${s.imageMissing} ${small ? s.imageSmall : ''}`} role="alert">
        {small ? '!' : `Image missing: ${option.image.src}`}
      </div>
    );
  }
  return (
    <div className={`${s.image} ${small ? s.imageSmall : ''}`}>
      {/* Plain img: the site is exported as static files, with no image server. */}
      <img src={option.image.src} alt="" onError={() => setFailed(true)} />
      {option.image.placeholder && badge}
    </div>
  );
}
