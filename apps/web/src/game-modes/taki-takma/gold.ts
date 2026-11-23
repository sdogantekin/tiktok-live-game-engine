import * as THREE from 'three';

const PIECE_SIZE = 0.11;

/**
 * The gold pieces guests carry up to the couple: one shared instanced mesh with an instance per guest slot, so any number
 * of walking guests costs a single draw call. Lives outside React; the mesh is attached once it exists.
 */
export class GoldPieces {
  private mesh: THREE.InstancedMesh | null = null;
  private readonly scratch = new THREE.Object3D();

  attach(mesh: THREE.InstancedMesh | null): void {
    this.mesh = mesh;
    if (mesh) for (let i = 0; i < mesh.count; i++) this.hide(i);
  }

  show(index: number, x: number, y: number, z: number, size: number): void {
    this.place(index, x, y, z, PIECE_SIZE * size);
  }

  hide(index: number): void {
    this.place(index, 0, 0, 0, 0);
  }

  private place(index: number, x: number, y: number, z: number, scale: number): void {
    const { mesh, scratch } = this;
    if (!mesh) return;
    scratch.position.set(x, y, z);
    scratch.scale.setScalar(scale);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }
}
