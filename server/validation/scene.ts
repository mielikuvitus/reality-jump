/**
 * Zod schema for Scene V1 — validates & clamps AI output.
 */

import { z } from 'zod';

// ── Helpers ──────────────────────────────────────────────────

/** Normalized float 0.0–1.0, clamped rather than rejected */
const norm = z.number().transform((v) => Math.min(1, Math.max(0, v)));

const ALLOWED_LABELS = [
    'chair', 'table', 'door', 'window', 'screen', 'lamp',
    'plant', 'shelf', 'bed', 'sofa', 'unknown',
] as const;

const ALLOWED_TAGS = [
    'solid', 'platform_candidate', 'hazard_candidate', 'decor',
] as const;

const ALLOWED_ENEMY_TYPES = ['crawler', 'hopper'] as const;
const ALLOWED_PICKUP_TYPES = ['coin'] as const;
const ALLOWED_RULE_IDS = ['gravity multiplier', 'speed multiplier'] as const;

// ── Sub-schemas ──────────────────────────────────────────────

const BboxSchema = z.object({
    x: norm,
    y: norm,
    w: norm,
    h: norm,
});

const DetectionSchema = z.object({
    id: z.string(),
    label: z.enum(ALLOWED_LABELS).catch('unknown'),
    confidence: z.number().min(0).max(1).optional().default(0.5),
    bbox: BboxSchema,
    tags: z.array(z.enum(ALLOWED_TAGS).catch('decor')).default([]),
});

const PointSchema = z.object({
    x: norm,
    y: norm,
});

const EnemySchema = z.object({
    type: z.enum(ALLOWED_ENEMY_TYPES).catch('crawler'),
    x: norm,
    y: norm,
    param: z.record(z.number()).optional().default({}),
});

const PickupSchema = z.object({
    type: z.enum(ALLOWED_PICKUP_TYPES).catch('coin'),
    x: norm,
    y: norm,
});

const SpawnsSchema = z.object({
    player: PointSchema,
    exit: PointSchema,
    enemies: z.array(EnemySchema).default([]),
    pickups: z.array(PickupSchema).default([]),
});

const SurfaceSchema = z.object({
    type: z.enum(['platform', 'wall', 'hazard']).catch('platform'),
    poly: z.array(z.tuple([norm, norm])).min(3),
});

const RuleSchema = z.object({
    id: z.enum(ALLOWED_RULE_IDS).catch('gravity multiplier'),
    param: z.number(),
});

// ── Main schema ──────────────────────────────────────────────

export const SceneV1Schema = z.object({
    version: z.literal(1),
    image: z.object({ w: z.number(), h: z.number() }),
    detections: z.array(DetectionSchema).default([]),
    spawns: SpawnsSchema,
    surfaces: z.array(SurfaceSchema).default([]),
    rules: z.array(RuleSchema).default([]),
});

export type SceneV1 = z.infer<typeof SceneV1Schema>;

// ── Hard-cap enforcement ─────────────────────────────────────

const CAPS = {
    detections: 30,
    surfaces: 20,
    enemies: 10,
    pickups: 20,
    rules: 3,
} as const;

/**
 * Validate raw data against SceneV1Schema, clamp coordinates,
 * and enforce array hard caps.
 *
 * @returns `{ ok: true, scene }` or `{ ok: false, errors }`
 */
export function validateScene(raw: unknown):
    | { ok: true; scene: SceneV1 }
    | { ok: false; errors: string[] } {

    const result = SceneV1Schema.safeParse(raw);

    if (!result.success) {
        const errors = result.error.issues.map(
            (i) => `${i.path.join('.')}: ${i.message}`
        );
        return { ok: false, errors };
    }

    const scene = result.data;

    // Enforce hard caps (truncate silently)
    scene.detections = scene.detections.slice(0, CAPS.detections);
    scene.surfaces = scene.surfaces.slice(0, CAPS.surfaces);
    scene.spawns.enemies = scene.spawns.enemies.slice(0, CAPS.enemies);
    scene.spawns.pickups = scene.spawns.pickups.slice(0, CAPS.pickups);
    scene.rules = scene.rules.slice(0, CAPS.rules);

    return { ok: true, scene };
}

/**
 * Extract JSON from a string that may be wrapped in markdown code fences.
 */
export function extractJson(text: string): string {
    // Strip ```json ... ``` or ``` ... ```
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    // Maybe raw JSON
    return text.trim();
}
