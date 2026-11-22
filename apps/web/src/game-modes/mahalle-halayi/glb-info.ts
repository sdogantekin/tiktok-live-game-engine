import { readFileSync } from 'node:fs';

interface Accessor {
  count: number;
  max?: number[];
}
interface GltfJson {
  nodes: { name?: string; mesh?: number }[];
  meshes: { name?: string; primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  skins?: { joints: number[] }[];
  animations?: { name: string; samplers: { input: number }[] }[];
  accessors: Accessor[];
  materials?: unknown[];
  images?: unknown[];
  textures?: unknown[];
}

export interface GlbInfo {
  bytes: number;
  nodeNames: string[];
  meshNames: string[];
  clipNames: string[];
  /** Longest sampler input time per clip, in seconds. */
  clipSeconds: Record<string, number>;
  jointCount: number;
  triangles: number;
  trianglesByMesh: Record<string, number>;
  primitivesPerMesh: Record<string, number>;
  withVertexColors: boolean;
  images: number;
  textures: number;
}

/** Reads a binary glTF and summarizes what the budgets and contracts care about. No dependencies. */
export function readGlb(path: URL | string): GlbInfo {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${String(path)} is not a GLB file`);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')) as GltfJson;

  const trianglesByMesh: Record<string, number> = {};
  const primitivesPerMesh: Record<string, number> = {};
  let withVertexColors = true;
  json.meshes.forEach((mesh, index) => {
    const name = mesh.name ?? `mesh${index}`;
    primitivesPerMesh[name] = mesh.primitives.length;
    trianglesByMesh[name] = mesh.primitives.reduce((sum, primitive) => {
      const accessor = json.accessors[primitive.indices ?? primitive.attributes.POSITION!]!;
      if (!('COLOR_0' in primitive.attributes)) withVertexColors = false;
      return sum + accessor.count / 3;
    }, 0);
  });

  const clipSeconds: Record<string, number> = {};
  for (const animation of json.animations ?? []) {
    clipSeconds[animation.name] = Math.max(...animation.samplers.map((sampler) => json.accessors[sampler.input]!.max?.[0] ?? 0));
  }

  return {
    bytes: buffer.length,
    nodeNames: json.nodes.map((node) => node.name ?? ''),
    meshNames: json.meshes.map((mesh, i) => mesh.name ?? `mesh${i}`),
    clipNames: (json.animations ?? []).map((animation) => animation.name),
    clipSeconds,
    jointCount: json.skins?.[0]?.joints.length ?? 0,
    triangles: Object.values(trianglesByMesh).reduce((a, b) => a + b, 0),
    trianglesByMesh,
    primitivesPerMesh,
    withVertexColors,
    images: json.images?.length ?? 0,
    textures: json.textures?.length ?? 0,
  };
}
