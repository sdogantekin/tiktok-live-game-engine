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
  /** Measurement helpers for the performance harness. */
  resetWindow?: () => void;
  windowStats?: () => WindowStats;
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



/** Frame-time history (ms) used for the live overlay's 95th percentile. */
const frameTimes: number[] = [];

/** Frame times (ms) since the last `resetWindow()`, for a proper measurement run. */
let windowFrames: number[] = [];
let windowLongTasks = { count: 0, totalMs: 0 };
let windowMixerMs = 0;
const latencySamples: number[] = [];

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
  if (windowFrames.length < 120_000) windowFrames.push(deltaMs);
}

/** Adds time spent updating animation mixers this frame (only measured when perf is enabled). */
export function addMixerMs(ms: number): void {
  windowMixerMs += ms;
}

/**
 * Marks that a batch of cues whose oldest input was ingested at `origin` (server epoch ms) has just been handed to
 * the scene; records how long until it has been drawn (two animation frames later, i.e. after the frame that shows it).
 */
export function markCueOrigin(origin: number): void {
  if (!PERF_ENABLED) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      latencySamples.push(Date.now() - origin);
      if (latencySamples.length > 20_000) latencySamples.shift();
    }),
  );
}

const percentile = (sorted: number[], fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;

export interface WindowStats {
  frames: number;
  avgFps: number;
  /** Frame time percentiles in ms. */
  frameMs: { p50: number; p95: number; p99: number; max: number };
  /** FPS corresponding to the slowest 1% of frames. */
  onePercentLowFps: number;
  /** Share of frames slower than 33.3 ms (i.e. below 30 FPS). */
  slowFrameShare: number;
  longTasks: { count: number; totalMs: number };
  mixerMsPerFrame: number;
  jsHeapMB: number | null;
  /** Server-ingest-to-drawn latency of cues (ms), over the whole run so far. */
  latencyMs: { count: number; p50: number; p95: number; p99: number; max: number };
}

export function windowStats(): WindowStats {
  const sorted = [...windowFrames].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0);
  const latency = [...latencySamples].sort((a, b) => a - b);
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return {
    frames: sorted.length,
    avgFps: total > 0 ? (sorted.length / total) * 1000 : 0,
    frameMs: { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99), max: sorted.at(-1) ?? 0 },
    onePercentLowFps: 1000 / (percentile(sorted, 0.99) || 1),
    slowFrameShare: sorted.length ? sorted.filter((ms) => ms > 1000 / 30).length / sorted.length : 0,
    longTasks: { ...windowLongTasks },
    mixerMsPerFrame: sorted.length ? windowMixerMs / sorted.length : 0,
    jsHeapMB: memory ? memory.usedJSHeapSize / 1048576 : null,
    latencyMs: {
      count: latency.length,
      p50: percentile(latency, 0.5),
      p95: percentile(latency, 0.95),
      p99: percentile(latency, 0.99),
      max: latency.at(-1) ?? 0,
    },
  };
}

/** Starts a fresh measurement window (frame times, long tasks, mixer cost, latency samples). */
export function resetWindow(): void {
  windowFrames = [];
  windowLongTasks = { count: 0, totalMs: 0 };
  windowMixerMs = 0;
  latencySamples.length = 0;
}

/** A numeric URL override for sweeps (`?perf=1&cap=36`). Ignored unless perf mode is on. */
export function perfParam(name: string): number | undefined {
  if (!PERF_ENABLED) return undefined;
  const value = Number(params.get(name));
  return params.has(name) && Number.isFinite(value) ? value : undefined;
}

if (PERF_ENABLED && typeof PerformanceObserver !== 'undefined') {
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        windowLongTasks.count++;
        windowLongTasks.totalMs += entry.duration;
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    /* long-task timing is not available in every browser */
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

if (PERF_ENABLED && typeof window !== 'undefined') {
  perf.resetWindow = resetWindow;
  perf.windowStats = windowStats;
  (window as unknown as { __perf: PerfApi }).__perf = perf;
}
