/** What the standings need to know about a horse to show how far behind it is. */
export interface GapRacer {
  distance: number;
  speed: number;
  place: number | null;
  finishTime: number | null;
}

/** Minutes and seconds with a tenth, for a finishing time: 2:31.4 */
export function formatTime(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths - minutes * 600) / 10;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

/** How far behind, like a Formula 1 timing screen: +0.8s, +12s, +1:05. */
export function formatGap(seconds: number): string {
  if (!(seconds >= 0.05)) return '';
  if (seconds < 10) return `+${seconds.toFixed(1)}s`;
  const whole = Math.round(seconds);
  if (whole < 60) return `+${whole}s`;
  return `+${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Seconds a racer is behind the leader. While racing it is the distance between them divided by the racer's own speed, that is, how long the
 * racer needs to reach the place the leader is at now (16 m behind at 16 m/s is 1.0 s). Between two finishers it is the difference of their
 * finishing times; a horse that is still running behind a finisher is measured to the line.
 */
export function gapSeconds(leader: GapRacer, racer: GapRacer, finishLine: number): number {
  if (racer.finishTime !== null && leader.finishTime !== null) return Math.max(0, racer.finishTime - leader.finishTime);
  const target = leader.place !== null ? finishLine : leader.distance;
  const behind = target - racer.distance;
  return behind <= 0 ? 0 : behind / Math.max(racer.speed, 1);
}

/** The text for the gap column: the leader shows its time once it has finished, the others how far behind they are. */
export function gapLabel(leader: GapRacer, racer: GapRacer, finishLine: number): string {
  if (racer === leader) return leader.finishTime !== null ? formatTime(leader.finishTime) : '';
  return formatGap(gapSeconds(leader, racer, finishLine));
}
