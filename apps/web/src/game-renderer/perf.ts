export interface PerfStats {
  frames: number;
  fps: number;
  frameMsP95: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  avatarsVisible: number;
  crowdVisible: number;
  effectsStarted: number;
  cuesReceived: number;
}

interface PerfApi extends PerfStats {
  /** Which modelled assets are on screen (false = primitive fallback or still loading). */
  modelsLoaded: { avatars: boolean; crowd: boolean; courtyard: boolean };
  /** How many times each animation clip has been started (for tests and tuning). */
  clipStarts: Record<string, number>;
  /** Reads the canvas and summarizes it: distinct colours and mean brightness. Only with `?probe=1`. */
  pixelStats?: () => { distinctColors: number; meanLuma: number };
}

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

/** `?perf=1` shows the overlay and exposes `window.__perf`; `?probe=1` also keeps the drawing buffer readable for tests. */
export const PERF_ENABLED = params.has('perf') || params.has('probe');
export const PROBE_ENABLED = params.has('probe');
export const PERF_OVERLAY = params.has('perf');

export const perf: PerfApi = {
  frames: 0,
  fps: 0,
  frameMsP95: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  avatarsVisible: 0,
  crowdVisible: 0,
  effectsStarted: 0,
  cuesReceived: 0,
  modelsLoaded: { avatars: false, crowd: false, courtyard: false },
  clipStarts: {},
};

if (PERF_ENABLED && typeof window !== 'undefined') {
  (window as unknown as { __perf: PerfApi }).__perf = perf;
}

/** Frame-time history (ms) used for the 95th percentile. */
const frameTimes: number[] = [];

export function recordFrame(deltaMs: number): void {
  perf.frames++;
  frameTimes.push(deltaMs);
  if (frameTimes.length > 240) frameTimes.shift();
  const mean = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  perf.fps = mean > 0 ? 1000 / mean : 0;
  if (perf.frames % 30 === 0) {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    perf.frameMsP95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  }
}

export function pixelStatsOf(canvas: HTMLCanvasElement): { distinctColors: number; meanLuma: number } {
  const probe = document.createElement('canvas');
  probe.width = 64;
  probe.height = 114;
  const context = probe.getContext('2d');
  if (!context) return { distinctColors: 0, meanLuma: 0 };
  context.drawImage(canvas, 0, 0, probe.width, probe.height);
  const { data } = context.getImageData(0, 0, probe.width, probe.height);
  const colors = new Set<number>();
  let luma = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
    luma += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { distinctColors: colors.size, meanLuma: luma / (data.length / 4) };
}
