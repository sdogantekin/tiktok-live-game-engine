import { useEffect, useRef, useSyncExternalStore } from 'react';
import { type TagBoard, tagShift } from './name-tags';

const FALLBACK_COLOR = '#8a8a99';

/**
 * Name tags over the 3D scene, as plain DOM text positioned in stage fractions. Names come from viewers, so
 * they are only ever rendered as React text nodes (never as HTML) and are length-limited again in CSS.
 */
export function NameTags({ board, teamColors }: { board: TagBoard; teamColors: Readonly<Record<string, string>> }) {
  const labels = useSyncExternalStore(board.subscribe, board.getSnapshot);
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(labels);
  useEffect(() => {
    latest.current = labels;
  }, [labels]);

  // The avatar lines walk; every frame the tags are moved by the same amount (CSS variables, no React render).
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      const root = container.current;
      if (root) {
        const byKey = new Map(latest.current.map((label) => [label.key, label]));
        for (const el of root.querySelectorAll<HTMLElement>('.name-tag, .chat-bubble')) {
          const label = byKey.get(el.dataset.key ?? '');
          if (!label) continue;
          const spot = board.dynamic.get(label.key);
          if (spot) {
            // A subject the scene moves itself: put the tag where the scene says (the label's anchor is only the starting point).
            const bubble = el.classList.contains('chat-bubble');
            const base = bubble || label.emphasized ? label.big : label.small;
            const target = bubble || label.emphasized ? spot.big : spot.small;
            el.style.setProperty('--dx', `${(target.x - base.x) * 100}%`);
            el.style.setProperty('--dy', `${(target.y - base.y) * 100}%`);
            el.style.visibility = spot.visible ? 'visible' : 'hidden';
            continue;
          }
          const shift = tagShift(label.perMetre, board.travel);
          el.style.setProperty('--dx', `${shift.x * 100}%`);
          el.style.setProperty('--dy', `${shift.y * 100}%`);
        }
      }
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [board]);

  useEffect(() => {
    const timer = setInterval(() => board.tick(), 250);
    return () => clearInterval(timer);
  }, [board]);

  return (
    <div className="name-tags" aria-hidden="true" ref={container}>
      {labels.flatMap((label) => {
        const color = teamColors[label.teamId] ?? FALLBACK_COLOR;
        const at = label.emphasized ? label.big : label.small;
        const tag = (
          <span
            key={label.key}
            className={`name-tag ${label.side}${label.emphasized ? ' emphasized' : ''}${label.leader ? ' leader' : ''}`}
            data-team={label.teamId}
            data-key={label.key}
            style={{ left: `calc(${at.x * 100}% + var(--dx, 0%))`, top: `calc(${at.y * 100}% + var(--dy, 0%))`, borderLeftColor: label.emphasized ? '#fff' : color, background: label.emphasized ? color : undefined }}
          >
            {label.name}
          </span>
        );
        if (label.bubble === null) return [tag];
        // What the player said: a speech bubble above their head (text only, never markup; the server already moderated it).
        return [
          tag,
          <span
            key={`${label.key}-said`}
            className={`chat-bubble${label.emphasized ? ' raised' : ''}`}
            data-team={label.teamId}
            data-key={label.key}
            style={{ left: `calc(${label.big.x * 100}% + var(--dx, 0%))`, top: `calc(${label.big.y * 100}% + var(--dy, 0%))`, borderColor: color }}
          >
            {label.bubble}
          </span>,
        ];
      })}
    </div>
  );
}
