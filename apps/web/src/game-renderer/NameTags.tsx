import { useEffect, useSyncExternalStore } from 'react';
import type { TagBoard } from './name-tags';

const FALLBACK_COLOR = '#8a8a99';

/**
 * Name tags over the 3D scene, as plain DOM text positioned in stage fractions. Names come from viewers, so
 * they are only ever rendered as React text nodes (never as HTML) and are length-limited again in CSS.
 */
export function NameTags({ board, teamColors }: { board: TagBoard; teamColors: Readonly<Record<string, string>> }) {
  const labels = useSyncExternalStore(board.subscribe, board.getSnapshot);

  useEffect(() => {
    const timer = setInterval(() => board.tick(), 250);
    return () => clearInterval(timer);
  }, [board]);

  return (
    <div className="name-tags" aria-hidden="true">
      {labels.map((label) => {
        const color = teamColors[label.teamId] ?? FALLBACK_COLOR;
        const at = label.emphasized ? label.big : label.small;
        return (
          <span
            key={label.key}
            className={`name-tag ${label.side}${label.emphasized ? ' emphasized' : ''}`}
            data-team={label.teamId}
            style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, borderLeftColor: label.emphasized ? '#fff' : color, background: label.emphasized ? color : undefined }}
          >
            {label.name}
          </span>
        );
      })}
    </div>
  );
}
