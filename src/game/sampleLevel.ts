import { LevelData } from './types';

/**
 * Sample level matching the JSON schema.
 * Replace this with data from the OpenAI API at runtime.
 */
export const SAMPLE_LEVEL: LevelData = {
    image: { w: 1280, h: 720 },
    detections: [
        {
            id: "obj_1",
            label: "chair",
            confidence: 0.78,
            bbox: { x: 0.12, y: 0.35, w: 0.22, h: 0.40 },
            tags: ["solid", "platform_candidate"]
        }
    ],
    spawns: {
        player: { x: 0.10, y: 0.80 },
        exit:   { x: 0.90, y: 0.20 },
        enemies: [
            { type: "crawler", x: 0.55, y: 0.78, patrol: { dx: 0.15 } }
        ],
        pickups: [
            { type: "coin", x: 0.30, y: 0.55 },
            { type: "coin", x: 0.50, y: 0.30 },
            { type: "coin", x: 0.75, y: 0.60 },
        ]
    },
    surfaces: [
        // Ground
        { type: "platform", poly: [[0.0, 0.85], [1.0, 0.85], [1.0, 0.90], [0.0, 0.90]] },
        // Floating platform (left)
        { type: "platform", poly: [[0.18, 0.60], [0.42, 0.60], [0.42, 0.63], [0.18, 0.63]] },
        // Floating platform (right)
        { type: "platform", poly: [[0.60, 0.45], [0.82, 0.45], [0.82, 0.48], [0.60, 0.48]] },
        // Small step (middle)
        { type: "platform", poly: [[0.40, 0.35], [0.55, 0.35], [0.55, 0.38], [0.40, 0.38]] },
    ],
    rules: [
        { id: "low_grav_in_dark", param: 0.85 }
    ]
};
