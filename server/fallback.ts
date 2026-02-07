/**
 * Fallback Scene JSON — returned when AI fails or response is unrepairable.
 * Provides a basic playable level with 3 platforms and 3 coins.
 */

import type { SceneV1 } from './validation/scene';

export const FALLBACK_SCENE: SceneV1 = {
    version: 1,
    image: { w: 1024, h: 768 },
    detections: [],
    spawns: {
        player: { x: 0.05, y: 0.85 },
        exit: { x: 0.90, y: 0.15 },
        enemies: [],
        pickups: [
            { type: 'coin', x: 0.30, y: 0.75 },
            { type: 'coin', x: 0.50, y: 0.55 },
            { type: 'coin', x: 0.70, y: 0.35 },
        ],
    },
    surfaces: [
        { type: 'platform', poly: [[0.0, 0.90], [1.0, 0.90], [1.0, 0.95], [0.0, 0.95]] },
        { type: 'platform', poly: [[0.20, 0.70], [0.45, 0.70], [0.45, 0.74], [0.20, 0.74]] },
        { type: 'platform', poly: [[0.55, 0.50], [0.80, 0.50], [0.80, 0.54], [0.55, 0.54]] },
    ],
    rules: [],
};
