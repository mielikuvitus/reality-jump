/**
 * PLATFORM FACTORY
 * =================
 *
 * Creates static Arcade Physics bodies from validated SceneV1 objects
 * where type === 'platform'.
 *
 * Each platform is a Zone with a static physics body (invisible collider)
 * plus a visible rectangle overlay for feedback.
 *
 * Surface types get distinct colors:
 *   - solid (default): green
 *   - soft: purple — reduces player speed, dampens jump
 *
 * Minimum dimensions come from ComputedPhysics (world-relative).
 */

import type { SceneObject } from '../../shared/schema/scene_v1.types';
import { normRectToWorldRect } from '../utils/coords';
import type { ComputedPhysics } from '../physics/PhysicsConfig';

/** Color config per surface type */
const SURFACE_COLORS: Record<string, { fill: number; stroke: number }> = {
    solid:     { fill: 0x4ade80, stroke: 0x4ade80 },
    bouncy:    { fill: 0xfbbf24, stroke: 0xfbbf24 },
    slippery:  { fill: 0x38bdf8, stroke: 0x38bdf8 },
    breakable: { fill: 0xf87171, stroke: 0xf87171 },
    soft:      { fill: 0xc084fc, stroke: 0xc084fc },
};

const DEFAULT_COLORS = SURFACE_COLORS.solid;

export function createPlatforms(
    scene: Phaser.Scene,
    objects: SceneObject[],
    worldW: number,
    worldH: number,
    phys: ComputedPhysics,
): Phaser.Physics.Arcade.StaticGroup {
    const group = scene.physics.add.staticGroup();

    const platforms = objects.filter(o => o.type === 'platform');

    for (const obj of platforms) {
        const rect = normRectToWorldRect(obj.bounds_normalized, worldW, worldH);

        // Skip tiny platforms that would be unplayable
        if (rect.w < phys.minPlatformWidth || rect.h < phys.minPlatformHeight) {
            continue;
        }

        // Cap height so platforms look slim
        const maxH = worldH * 0.025;
        const h = Math.min(rect.h, maxH);

        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2 + (rect.h - h) / 2; // align to top of original bounds

        const surfaceType = obj.surface_type ?? 'solid';
        const colors = SURFACE_COLORS[surfaceType] ?? DEFAULT_COLORS;

        // Visual: semi-transparent rectangle with surface-type color
        scene.add.rectangle(cx, cy, rect.w, h, colors.fill, 0.25)
            .setStrokeStyle(1, colors.stroke, 0.5);

        // Physics: use a Zone with a static body for reliable collisions
        const zone = scene.add.zone(cx, cy, rect.w, h);
        scene.physics.add.existing(zone, true); // true = static body

        // Store surface type so GameScene can read it during collisions
        zone.setData('surfaceType', surfaceType);

        group.add(zone);
    }

    console.info(`[PlatformFactory] Created ${group.getLength()} platforms from ${platforms.length} objects`);

    return group;
}
