/**
 * SCENE V1 SCHEMA TESTS
 * ======================
 *
 * Tests ordered: failures first, then successes.
 * This verifies that Zod rejects bad data before Phaser ever sees it.
 *
 * Run: npm test
 */

import { describe, it, expect } from 'vitest';
import { parseSceneV1, isEnemySpawnAnchor, getEnemySpawnAnchors, type SceneObject } from './scene_v1.schema';

// ---------------------------------------------------------------------------
// Helper: minimal valid scene (reused as base, then mutated for failure tests)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validScene(): Record<string, any> {
    return {
        version: 1,
        image: { w: 1024, h: 768 },
        objects: [
            {
                id: 'plat_1',
                type: 'platform',
                label: 'table',
                confidence: 0.9,
                bounds_normalized: { x: 0.1, y: 0.7, w: 0.4, h: 0.06 },
            },
        ],
        spawns: {
            player: { x: 0.1, y: 0.85 },
            exit: { x: 0.9, y: 0.2 },
            enemies: [{ x: 0.5, y: 0.5, type: 'walker' }],
            pickups: [{ x: 0.3, y: 0.6, type: 'coin' }],
        },
        rules: [],
    };
}

// ============================================================
//  FAILURE TESTS — these should all return { ok: false }
// ============================================================

describe('parseSceneV1 — invalid inputs', () => {
    it('rejects empty object', () => {
        const result = parseSceneV1({});
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.length).toBeGreaterThan(0);
        }
    });

    it('rejects null', () => {
        const result = parseSceneV1(null);
        expect(result.ok).toBe(false);
    });

    it('rejects undefined', () => {
        const result = parseSceneV1(undefined);
        expect(result.ok).toBe(false);
    });

    it('rejects a string', () => {
        const result = parseSceneV1('not a scene');
        expect(result.ok).toBe(false);
    });

    it('rejects wrong version number', () => {
        const scene = validScene();
        scene.version = 2 as never;
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some(e => e.includes('version'))).toBe(true);
        }
    });

    it('rejects missing spawns', () => {
        const scene = validScene();
        delete (scene as Record<string, unknown>).spawns;
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects missing player spawn', () => {
        const scene = validScene();
        delete (scene.spawns as Record<string, unknown>).player;
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects missing exit spawn', () => {
        const scene = validScene();
        delete (scene.spawns as Record<string, unknown>).exit;
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects missing image dimensions', () => {
        const scene = validScene();
        delete (scene as Record<string, unknown>).image;
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects negative image dimensions', () => {
        const scene = validScene();
        scene.image = { w: -100, h: 768 };
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects out-of-range coordinates (x > 1)', () => {
        const scene = validScene();
        scene.spawns.player = { x: 1.5, y: 0.5 };
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects out-of-range coordinates (y < 0)', () => {
        const scene = validScene();
        scene.spawns.exit = { x: 0.5, y: -0.1 };
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects out-of-range bounds_normalized', () => {
        const scene = validScene();
        scene.objects[0].bounds_normalized = { x: 0.5, y: 0.5, w: 1.5, h: 0.1 };
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects unknown object type', () => {
        const scene = validScene();
        (scene.objects[0] as Record<string, unknown>).type = 'spaceship';
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects object with empty id', () => {
        const scene = validScene();
        scene.objects[0].id = '';
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects confidence > 1', () => {
        const scene = validScene();
        scene.objects[0].confidence = 1.5;
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects more than 25 total objects', () => {
        const scene = validScene();
        scene.objects = Array.from({ length: 26 }, (_, i) => ({
            id: `plat_${i}`,
            type: 'platform' as const,
            bounds_normalized: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
        }));
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects too many platforms (cap: 12)', () => {
        const scene = validScene();
        scene.objects = Array.from({ length: 13 }, (_, i) => ({
            id: `plat_${i}`,
            type: 'platform' as const,
            bounds_normalized: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
        }));
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some(e => e.includes('platform'))).toBe(true);
        }
    });

    it('rejects too many hazards (cap: 8)', () => {
        const scene = validScene();
        scene.objects = Array.from({ length: 9 }, (_, i) => ({
            id: `haz_${i}`,
            type: 'hazard' as const,
            bounds_normalized: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
        }));
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some(e => e.includes('hazard'))).toBe(true);
        }
    });

    it('rejects too many enemies (cap: 2)', () => {
        const scene = validScene();
        scene.objects = Array.from({ length: 3 }, (_, i) => ({
            id: `enemy_${i}`,
            type: 'enemy' as const,
            bounds_normalized: { x: 0.1, y: 0.1, w: 0.06, h: 0.1 },
        }));
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some(e => e.includes('enemy'))).toBe(true);
        }
    });

    it('rejects game_mechanics.damage_amount > 50', () => {
        const scene = validScene();
        scene.objects.push({
            id: 'e1', type: 'enemy',
            bounds_normalized: { x: 0.5, y: 0.5, w: 0.06, h: 0.1 },
            game_mechanics: { damage_amount: 100 },
        });
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects game_mechanics.speed_multiplier < 0.5', () => {
        const scene = validScene();
        scene.objects.push({
            id: 'e1', type: 'enemy',
            bounds_normalized: { x: 0.5, y: 0.5, w: 0.06, h: 0.1 },
            game_mechanics: { speed_multiplier: 0.1 },
        });
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects unknown surface_type', () => {
        const scene = validScene();
        (scene.objects[0] as Record<string, unknown>).surface_type = 'lava';
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });

    it('rejects unknown category', () => {
        const scene = validScene();
        (scene.objects[0] as Record<string, unknown>).category = 'alien';
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(false);
    });
});

// ============================================================
//  SUCCESS TESTS — these should all return { ok: true }
// ============================================================

describe('parseSceneV1 — valid inputs', () => {
    it('accepts a minimal valid scene', () => {
        const result = parseSceneV1(validScene());
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.version).toBe(1);
            expect(result.data.objects.length).toBe(1);
            expect(result.data.spawns.player.x).toBe(0.1);
        }
    });

    it('accepts a scene with no objects (empty array)', () => {
        const scene = validScene();
        scene.objects = [];
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.objects.length).toBe(0);
        }
    });

    it('accepts a scene with objects omitted (defaults to [])', () => {
        const scene = validScene();
        delete (scene as Record<string, unknown>).objects;
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.objects).toEqual([]);
        }
    });

    it('accepts a scene with no enemies or pickups', () => {
        const scene = validScene();
        scene.spawns.enemies = [];
        scene.spawns.pickups = [];
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.spawns.enemies.length).toBe(0);
            expect(result.data.spawns.pickups.length).toBe(0);
        }
    });

    it('accepts all five object types', () => {
        const scene = validScene();
        scene.objects = [
            { id: 'p1', type: 'platform', bounds_normalized: { x: 0, y: 0, w: 0.5, h: 0.1 } },
            { id: 'o1', type: 'obstacle', bounds_normalized: { x: 0.1, y: 0.1, w: 0.1, h: 0.2 } },
            { id: 'c1', type: 'collectible', bounds_normalized: { x: 0.3, y: 0.3, w: 0.05, h: 0.05 } },
            { id: 'h1', type: 'hazard', bounds_normalized: { x: 0.5, y: 0.8, w: 0.2, h: 0.04 } },
            { id: 'e1', type: 'enemy', bounds_normalized: { x: 0.6, y: 0.5, w: 0.06, h: 0.1 } },
        ];
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.objects.length).toBe(5);
        }
    });

    it('accepts enemy with game_mechanics', () => {
        const scene = validScene();
        scene.objects.push({
            id: 'e1', type: 'enemy', label: 'angry', confidence: 0.9,
            bounds_normalized: { x: 0.5, y: 0.5, w: 0.06, h: 0.1 },
            game_mechanics: { damage_amount: 20, speed_multiplier: 1.2 },
        });
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
    });

    it('accepts enemy without game_mechanics', () => {
        const scene = validScene();
        scene.objects.push({
            id: 'e1', type: 'enemy',
            bounds_normalized: { x: 0.5, y: 0.5, w: 0.06, h: 0.1 },
        });
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
    });

    it('accepts boundary coordinates (0 and 1)', () => {
        const scene = validScene();
        scene.spawns.player = { x: 0, y: 0 };
        scene.spawns.exit = { x: 1, y: 1 };
        scene.objects[0].bounds_normalized = { x: 0, y: 0, w: 1, h: 1 };
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
    });

    it('accepts all valid surface types', () => {
        const surfaces = ['solid', 'bouncy', 'slippery', 'breakable', 'soft'] as const;
        for (const surface of surfaces) {
            const scene = validScene();
            (scene.objects[0] as Record<string, unknown>).surface_type = surface;
            const result = parseSceneV1(scene);
            expect(result.ok).toBe(true);
        }
    });

    it('accepts exactly 12 platforms (at the cap)', () => {
        const scene = validScene();
        scene.objects = Array.from({ length: 12 }, (_, i) => ({
            id: `plat_${i}`,
            type: 'platform' as const,
            bounds_normalized: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
        }));
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
    });

    it('accepts exactly 25 mixed objects (at the total cap)', () => {
        const scene = validScene();
        scene.objects = [
            ...Array.from({ length: 12 }, (_, i) => ({
                id: `plat_${i}`, type: 'platform' as const,
                bounds_normalized: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
            })),
            ...Array.from({ length: 8 }, (_, i) => ({
                id: `obs_${i}`, type: 'obstacle' as const,
                bounds_normalized: { x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
            })),
            ...Array.from({ length: 5 }, (_, i) => ({
                id: `col_${i}`, type: 'collectible' as const,
                bounds_normalized: { x: 0.3, y: 0.3, w: 0.05, h: 0.05 },
            })),
        ];
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.objects.length).toBe(25);
        }
    });

    it('preserves all data fields through parsing', () => {
        const scene = validScene();
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
        if (result.ok) {
            const obj = result.data.objects[0];
            expect(obj.id).toBe('plat_1');
            expect(obj.type).toBe('platform');
            expect(obj.label).toBe('table');
            expect(obj.confidence).toBe(0.9);
            expect(obj.bounds_normalized).toEqual({ x: 0.1, y: 0.7, w: 0.4, h: 0.06 });

            expect(result.data.image).toEqual({ w: 1024, h: 768 });
            expect(result.data.spawns.enemies[0]).toEqual({ x: 0.5, y: 0.5, type: 'walker' });
            expect(result.data.spawns.pickups[0]).toEqual({ x: 0.3, y: 0.6, type: 'coin' });
        }
    });

    it('accepts object with category', () => {
        const scene = validScene();
        scene.objects[0].category = 'furniture';
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
    });

    it('accepts all valid categories', () => {
        const categories = ['plant', 'electric', 'food', 'furniture', 'other'] as const;
        for (const cat of categories) {
            const scene = validScene();
            scene.objects[0].category = cat;
            const result = parseSceneV1(scene);
            expect(result.ok).toBe(true);
        }
    });

    it('accepts object without category (backward compatible)', () => {
        const scene = validScene();
        // No category field at all — must still pass
        delete scene.objects[0].category;
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
    });

    it('accepts object with enemy_spawn_anchor flag', () => {
        const scene = validScene();
        scene.objects[0].enemy_spawn_anchor = true;
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
    });

    it('accepts object with category + enemy_spawn_anchor together', () => {
        const scene = validScene();
        scene.objects[0].category = 'plant';
        scene.objects[0].enemy_spawn_anchor = true;
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.objects[0].category).toBe('plant');
            expect(result.data.objects[0].enemy_spawn_anchor).toBe(true);
        }
    });

    it('strips unknown extra fields (Zod default behavior)', () => {
        const scene = {
            ...validScene(),
            foo: 'bar',
            extraField: 123,
        };
        const result = parseSceneV1(scene);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect((result.data as Record<string, unknown>).foo).toBeUndefined();
            expect((result.data as Record<string, unknown>).extraField).toBeUndefined();
        }
    });
});

// ============================================================
//  ENEMY SPAWN ANCHOR HELPER TESTS
// ============================================================

describe('isEnemySpawnAnchor', () => {
    const base: SceneObject = {
        id: 'test',
        type: 'obstacle',
        bounds_normalized: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
    };

    it('returns true for category "plant"', () => {
        expect(isEnemySpawnAnchor({ ...base, category: 'plant' })).toBe(true);
    });

    it('returns true for category "electric"', () => {
        expect(isEnemySpawnAnchor({ ...base, category: 'electric' })).toBe(true);
    });

    it('returns true when enemy_spawn_anchor is true', () => {
        expect(isEnemySpawnAnchor({ ...base, enemy_spawn_anchor: true })).toBe(true);
    });

    it('returns false for category "furniture"', () => {
        expect(isEnemySpawnAnchor({ ...base, category: 'furniture' })).toBe(false);
    });

    it('returns false when neither category nor flag is set', () => {
        expect(isEnemySpawnAnchor(base)).toBe(false);
    });
});

describe('getEnemySpawnAnchors', () => {
    it('filters only anchor objects', () => {
        const objects: SceneObject[] = [
            { id: 'p1', type: 'platform', category: 'furniture', bounds_normalized: { x: 0, y: 0, w: 0.5, h: 0.1 } },
            { id: 'o1', type: 'obstacle', category: 'plant', bounds_normalized: { x: 0.3, y: 0.3, w: 0.1, h: 0.2 } },
            { id: 'o2', type: 'obstacle', category: 'electric', bounds_normalized: { x: 0.6, y: 0.6, w: 0.1, h: 0.1 } },
            { id: 'o3', type: 'obstacle', bounds_normalized: { x: 0.8, y: 0.8, w: 0.05, h: 0.05 } },
        ];
        const anchors = getEnemySpawnAnchors(objects);
        expect(anchors.length).toBe(2);
        expect(anchors.map(a => a.id)).toEqual(['o1', 'o2']);
    });
});
