import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type ReactNode, useLayoutEffect, useState } from 'react';
import { Boundary } from './Boundary';
import { PERF_ENABLED, PROBE_ENABLED, perf, pixelStatsOf, recordFrame } from './perf';
import type { CameraConfig } from './types';

function CameraRig({ camera }: { camera: CameraConfig }) {
  const three = useThree((state) => state.camera);
  useLayoutEffect(() => {
    three.position.set(...camera.position);
    three.lookAt(...camera.lookAt);
    three.updateProjectionMatrix();
  }, [three, camera]);
  return null;
}

function PerfProbe() {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    if (PROBE_ENABLED) perf.pixelStats = () => pixelStatsOf(gl.domElement);
    return () => {
      perf.pixelStats = undefined;
    };
  }, [gl]);
  useFrame((state, delta) => {
    recordFrame(delta * 1000);
    const { render, memory } = state.gl.info;
    perf.drawCalls = render.calls;
    perf.triangles = render.triangles;
    perf.geometries = memory.geometries;
    perf.textures = memory.textures;
  });
  return null;
}

const RESTORE_TIMEOUT_MS = 3000;

/** The 3D viewport: a fixed camera over a mode-supplied scene, filling its parent. */
export function Stage({ camera, children }: { camera: CameraConfig; children: ReactNode }) {
  // Bumping the key remounts the canvas, which is the fallback if the browser never restores a lost context.
  const [generation, setGeneration] = useState(0);

  return (
    <Boundary label="3D scene">
      <Canvas
        key={generation}
        className="scene-canvas"
        shadows
        dpr={[1, 2]}
        frameloop="always"
        camera={{ fov: camera.fov, near: 0.5, far: 120, position: [...camera.position] }}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: PROBE_ENABLED }}
        onCreated={({ gl }) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          gl.domElement.addEventListener('webglcontextlost', () => {
            timer = setTimeout(() => setGeneration((value) => value + 1), RESTORE_TIMEOUT_MS);
          });
          gl.domElement.addEventListener('webglcontextrestored', () => clearTimeout(timer));
        }}
      >
        <CameraRig camera={camera} />
        {PERF_ENABLED && <PerfProbe />}
        {children}
      </Canvas>
    </Boundary>
  );
}
