import { Box3 } from "three";

// SkinnedMesh maintains its inverse bind transform only in updateMatrixWorld.
// Updating the other matrix API before sampling skin bounds can multiply the
// wrapper's world transform twice and launch a floor correction into the sky.
export function refreshSkinnedBounds(root, bounds = new Box3()) {
  root.updateMatrixWorld(true);
  root.traverse((node) => { if (node.isSkinnedMesh) node.computeBoundingBox(); });
  return bounds.setFromObject(root);
}

export function groundClearance(bounds, floor = 0.8) {
  if (!Number.isFinite(bounds?.min?.y) || !Number.isFinite(floor)) return 0;
  return Math.max(0, floor - bounds.min.y);
}
