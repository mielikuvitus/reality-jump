/**
 * PLATFORM FACTORY
 * =================
 *
 * Creates static Arcade Physics bodies from validated SceneV1 objects
 * where type === 'platform'.
 *
 * Each platform is a Zone with a static physics body (invisible collider)
 * plus a row of Lucide icon tiles for the visual.
 *
 * VISUAL LAYOUT:
 *   Each platform is tiled with square boxes (width ≈ platform height).
 *   The platform width is divided into the closest number of full boxes
 *   that fit, then each box is slightly stretched/compressed to fill
 *   the platform edge-to-edge with no gaps.
 *
 *   Each surface type maps to a different Lucide icon via game_icons.ts:
 *     solid     → SquareSquare     (green)
 *     soft      → SquareArrowDown  (purple)
 *     bouncy    → SquareActivity   (yellow)
 *     slippery  → SquareCode       (blue)
 *     breakable → SquareX          (red)
 *
 *   Tiles are stored on the zone via zone.setData('tiles', [...]).
 *
 * Minimum dimensions come from ComputedPhysics (world-relative).
 */

import type { SceneObject } from '../../shared/schema/scene_v1.types';
import { normRectToWorldRect } from '../utils/coords';
import type { ComputedPhysics } from '../physics/PhysicsConfig';
import type { GameIconKey } from '../assets/game_icons';
import { ensureIconTexture, getIconTextureKey } from '../assets/IconTextureFactory';

/** Map surface type string → GameIconKey for platform icons */
const SURFACE_ICON: Record<string, GameIconKey> = {
    solid:     'platform_solid',
    bouncy:    'platform_bouncy',
    slippery:  'platform_slippery',
    breakable: 'platform_breakable',
    soft:      'platform_soft',
};

const DEFAULT_ICON: GameIconKey = 'platform_solid';

/** Texture size for platform tile icons (px). Scaled to actual tile dimensions. */
const ICON_RENDER_SIZE = 64;

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

        // Use the full height from the scene data
        const h = rect.h;

        const cx = rect.x + rect.w / 2;
        const cy = rect.y + h / 2;

        const surfaceType = obj.surface_type ?? 'solid';

        // Resolve the Lucide icon for this surface type
        const iconKey = SURFACE_ICON[surfaceType] ?? DEFAULT_ICON;
        ensureIconTexture(scene, iconKey, ICON_RENDER_SIZE);
        const textureKey = getIconTextureKey(iconKey, ICON_RENDER_SIZE);

        // --- Visual: fit square tiles (width ≈ height), stretch to fill ---
        const tileCount = Math.max(1, Math.round(rect.w / h));
        const boxW = rect.w / tileCount;
        const leftEdge = rect.x;
        const tiles: Phaser.GameObjects.Image[] = [];

        for (let i = 0; i < tileCount; i++) {
            const boxCx = leftEdge + boxW * i + boxW / 2;
            const tile = scene.add.image(boxCx, cy, textureKey)
                .setDisplaySize(boxW, h)
                .setAlpha(0.7);
            tiles.push(tile);
        }

        // --- Physics: single zone spanning the full platform width ---
        const zone = scene.add.zone(cx, cy, rect.w, h);
        scene.physics.add.existing(zone, true); // true = static body

        // Store surface type so GameScene can read it during collisions
        zone.setData('surfaceType', surfaceType);

        // Store tiles for future sprite swaps
        zone.setData('tiles', tiles);

        group.add(zone);
    }

    console.info(`[PlatformFactory] Created ${group.getLength()} platforms from ${platforms.length} objects`);

    return group;
}
