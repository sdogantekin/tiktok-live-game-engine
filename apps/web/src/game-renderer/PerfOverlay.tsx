import { useEffect, useState } from 'react';
import { perf } from './perf';

/** Developer overlay (`?perf=1`): live renderer numbers on top of the broadcast. Not part of the normal view. */
export function PerfOverlay() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <pre className="perf-overlay">
      {`fps ${perf.fps.toFixed(0)}  p95 ${perf.frameMsP95.toFixed(1)}ms\ncalls ${perf.drawCalls}  tris ${perf.triangles}\navatars ${perf.avatarsVisible}  crowd ${perf.crowdVisible}\neffects ${perf.effectsStarted}  cues ${perf.cuesReceived}`}
    </pre>
  );
}
