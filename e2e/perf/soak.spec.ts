import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { addViewers, button, openBroadcast, openOperator, startFreshGame } from '../helpers';

const MINUTES = Number(process.env.SOAK_MINUTES ?? 30);
const SAMPLE_SECONDS = 30;

interface Sample {
  minute: number;
  serverRssMB: number;
  browserHeapMB: number | null;
  operatorHeapMB: number | null;
  domNodes: number;
  geometries: number;
  textures: number;
  fps: number;
  frameP95: number;
  slowFrameShare: number;
  longTasks: number;
  latencyP95: number;
  phase: string;
}

interface PerfWindow {
  __perf: { resetWindow: () => void; windowStats: () => { avgFps: number; frameMs: { p95: number }; slowFrameShare: number; longTasks: { count: number }; jsHeapMB: number | null; latencyMs: { p95: number } }; geometries: number; textures: number };
}

const serverRssMB = () => {
  const pid = execSync('lsof -ti tcp:3001 -sTCP:LISTEN').toString().trim().split('\n')[0]!;
  return Number(execSync(`ps -o rss= -p ${pid}`).toString().trim()) / 1024;
};

/** Least-squares slope of y over x. */
function slope(points: { x: number; y: number }[]): number {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const num = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const den = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  return den === 0 ? 0 : num / den;
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

async function restartTraffic(operator: Page) {
  await button(operator, 'Stop playback').click();
  await operator.getByLabel('Scenario', { exact: true }).selectOption('steady');
  await operator.getByLabel('Scenario viewers').fill('200');
  await operator.getByLabel('Scenario seconds').fill('600');
  await button(operator, 'Run').click();
  await expect(operator.getByTestId('last-result')).toHaveText('sim_scenario: ok');
}

test(`soak: ${MINUTES} minutes at 200 participants`, async ({ browser }) => {
  const operatorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const operator = await openOperator(operatorContext);
  await startFreshGame(operator);
  await addViewers(operator, 200);
  await restartTraffic(operator); // the round loops automatically (countdown → active → results → next round)

  const broadcastContext = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const broadcast = await openBroadcast(broadcastContext, '?perf=1');
  const samples: Sample[] = [];

  const operatorHeap = () => operator.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0).then((b) => (b ? b / 1048576 : null));

  const start = Date.now();
  let nextTraffic = start + 8 * 60_000;
  let nextGg = start + 60_000;
  let nextBig = start + 3 * 60_000;
  let nextBurst = start + 2 * 60_000;
  await broadcast.evaluate(() => (window as unknown as PerfWindow).__perf.resetWindow());

  while (Date.now() - start < MINUTES * 60_000) {
    const sampleEnd = Date.now() + SAMPLE_SECONDS * 1000;
    while (Date.now() < sampleEnd) {
      const now = Date.now();
      if (now >= nextTraffic) {
        await restartTraffic(operator);
        nextTraffic = now + 8 * 60_000;
      }
      if (now >= nextGg) {
        await operator.getByLabel('Gift').selectOption('gg');
        await button(operator, 'Send gift').click();
        nextGg = now + 60_000;
      }
      if (now >= nextBig) {
        await operator.getByLabel('Gift').selectOption('big_celebration');
        await button(operator, 'Send gift').click();
        nextBig = now + 3 * 60_000;
      }
      if (now >= nextBurst) {
        await operator.getByLabel('Burst viewers').fill('200');
        await operator.getByLabel('Burst spread ms').fill('1500');
        await operator.getByLabel('Burst word').selectOption('halay');
        await button(operator, 'Send burst').click();
        nextBurst = now + 2 * 60_000;
      }
      await broadcast.waitForTimeout(1000);
    }

    const stats = await broadcast.evaluate(() => {
      const perf = (window as unknown as PerfWindow).__perf;
      const w = perf.windowStats();
      perf.resetWindow();
      return { ...w, geometries: perf.geometries, textures: perf.textures, domNodes: document.getElementsByTagName('*').length };
    });
    const sample: Sample = {
      minute: Number(((Date.now() - start) / 60_000).toFixed(2)),
      serverRssMB: Number(serverRssMB().toFixed(1)),
      browserHeapMB: stats.jsHeapMB === null ? null : Number(stats.jsHeapMB.toFixed(1)),
      operatorHeapMB: await operatorHeap(),
      domNodes: stats.domNodes,
      geometries: stats.geometries,
      textures: stats.textures,
      fps: Number(stats.avgFps.toFixed(1)),
      frameP95: Number(stats.frameMs.p95.toFixed(1)),
      slowFrameShare: Number(stats.slowFrameShare.toFixed(4)),
      longTasks: stats.longTasks.count,
      latencyP95: Number(stats.latencyMs.p95.toFixed(0)),
      phase: (await operator.getByTestId('phase').textContent()) ?? '',
    };
    samples.push(sample);
    console.log(
      `t=${sample.minute.toFixed(1)}min server ${sample.serverRssMB}MB heap ${sample.browserHeapMB}MB opHeap ${sample.operatorHeapMB && Math.round(sample.operatorHeapMB)}MB ` +
        `dom ${sample.domNodes} geo ${sample.geometries} tex ${sample.textures} fps ${sample.fps} p95 ${sample.frameP95}ms slow ${(sample.slowFrameShare * 100).toFixed(1)}% lat ${sample.latencyP95}ms phase ${sample.phase}`,
    );
  }

  // Trend analysis: ignore the first 5 minutes (JIT, caches, first allocations), then compare early and late.
  const steady = samples.filter((s) => s.minute >= 5);
  const rssSlope = slope(steady.map((s) => ({ x: s.minute, y: s.serverRssMB })));
  const heapSamples = steady.filter((s) => s.browserHeapMB !== null);
  const heapSlope = slope(heapSamples.map((s) => ({ x: s.minute, y: s.browserHeapMB! })));
  const half = Math.floor(steady.length / 2);
  const early = steady.slice(0, Math.max(1, half));
  const late = steady.slice(half);
  const summary = {
    minutes: MINUTES,
    samples: samples.length,
    server: { rssMBPerMinute: Number(rssSlope.toFixed(3)), firstMedianMB: median(early.map((s) => s.serverRssMB)), lastMedianMB: median(late.map((s) => s.serverRssMB)), maxMB: Math.max(...samples.map((s) => s.serverRssMB)) },
    browserHeap: { MBPerMinute: Number(heapSlope.toFixed(3)), firstMedianMB: median(early.map((s) => s.browserHeapMB ?? 0)), lastMedianMB: median(late.map((s) => s.browserHeapMB ?? 0)) },
    operatorHeap: { firstMedianMB: median(early.map((s) => s.operatorHeapMB ?? 0)), lastMedianMB: median(late.map((s) => s.operatorHeapMB ?? 0)) },
    gpuResources: { geometriesMinMax: [Math.min(...samples.map((s) => s.geometries)), Math.max(...samples.map((s) => s.geometries))], texturesMinMax: [Math.min(...samples.map((s) => s.textures)), Math.max(...samples.map((s) => s.textures))] },
    domNodesMinMax: [Math.min(...samples.map((s) => s.domNodes)), Math.max(...samples.map((s) => s.domNodes))],
    fps: { min: Math.min(...samples.map((s) => s.fps)), median: median(samples.map((s) => s.fps)) },
    maxSlowFrameShare: Math.max(...samples.map((s) => s.slowFrameShare)),
    maxLatencyP95: Math.max(...samples.map((s) => s.latencyP95)),
    phasesSeen: [...new Set(samples.map((s) => s.phase))],
  };
  writeFileSync(process.env.SOAK_OUT ?? 'docs/perf/soak.json', JSON.stringify({ measuredAt: new Date().toISOString(), summary, samples }, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  await broadcastContext.close();
  await operatorContext.close();

  // Generous bounds: this is a leak detector, not a benchmark.
  expect(summary.server.rssMBPerMinute, 'server memory growth (MB/min)').toBeLessThan(1);
  expect(summary.browserHeap.lastMedianMB - summary.browserHeap.firstMedianMB, 'browser JS heap growth (MB)').toBeLessThan(20);
  expect(summary.gpuResources.geometriesMinMax[1]! - summary.gpuResources.geometriesMinMax[0]!, 'three.js geometry count must not grow').toBeLessThanOrEqual(8);
  expect(summary.gpuResources.texturesMinMax[1]! - summary.gpuResources.texturesMinMax[0]!, 'three.js texture count must not grow').toBeLessThanOrEqual(2);
  expect(summary.fps.min, 'lowest 30 s average frame rate').toBeGreaterThanOrEqual(50);
});
