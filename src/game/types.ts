/** Schema types for image-to-level JSON data */

export interface LevelData {
    image: ImageMeta;
    detections: Detection[];
    spawns: Spawns;
    surfaces: Surface[];
    rules: Rule[];
}

export interface ImageMeta {
    w: number;
    h: number;
}

export interface BBox {
    /** Normalized x (0–1) */
    x: number;
    /** Normalized y (0–1) */
    y: number;
    /** Normalized width (0–1) */
    w: number;
    /** Normalized height (0–1) */
    h: number;
}

export interface Detection {
    id: string;
    label: string;
    confidence: number;
    bbox: BBox;
    tags: string[];
}

export interface SpawnPoint {
    /** Normalized x (0–1) */
    x: number;
    /** Normalized y (0–1) */
    y: number;
}

export interface EnemySpawn extends SpawnPoint {
    type: string;
    patrol?: { dx: number };
}

export interface PickupSpawn extends SpawnPoint {
    type: string;
}

export interface Spawns {
    player: SpawnPoint;
    exit: SpawnPoint;
    enemies: EnemySpawn[];
    pickups: PickupSpawn[];
}

/** A polygon-based surface (coordinates normalized 0–1) */
export interface Surface {
    type: string;
    /** Array of [x, y] pairs, normalized 0–1 */
    poly: [number, number][];
}

export interface Rule {
    id: string;
    param: number;
}
