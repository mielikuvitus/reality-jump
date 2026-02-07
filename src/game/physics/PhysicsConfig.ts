/**
 * PHYSICS CONFIG — Adaptive, scene-aware
 * ========================================
 *
 * All gameplay values are defined as fractions of world dimensions so the
 * game feels identical regardless of photo resolution.
 *
 * When scene data is provided, the jump height adapts to the largest
 * vertical gap the player must clear. This ensures every LLM-generated
 * level is always completable, no matter where platforms land.
 *
 * Usage:
 *   const phys = computePhysics(worldW, worldH, sceneData);
 *   // phys.gravityY, phys.playerSpeed, phys.jumpVelocity, etc.
 */

import type { SceneV1 } from '../../shared/schema/scene_v1.types';

// ---------------------------------------------------------------------------
// Tuning ratios — tweak these to change how the game *feels*.
// All values are unitless fractions.
// ---------------------------------------------------------------------------

const RATIOS = {
    /** Player sprite height as fraction of worldH */
    playerSize: 0.06,

    /** Exit sprite size as fraction of worldH */
    exitSize: 0.06,

    /** Pickup sprite size as fraction of worldH */
    pickupSize: 0.04,

    /** Enemy sprite size as fraction of worldH */
    enemySize: 0.055,

    /** Player physics body width relative to sprite size */
    bodyWidthRatio: 0.58,

    /** Player physics body height relative to sprite size */
    bodyHeightRatio: 0.75,

    /** Gravity as multiplier of worldH — stays constant regardless of scene */
    gravityMultiplier: 1.2,

    /** Fallback jump height when no scene data is available */
    defaultJumpHeightFraction: 0.35,

    /** Extra headroom added on top of the largest gap (fraction, e.g. 0.15 = 15%) */
    jumpMargin: 0.15,

    /** Absolute min/max for the adaptive jump fraction */
    minJumpFraction: 0.15,
    maxJumpFraction: 0.45,

    /** Player horizontal speed — fraction of worldW per second */
    speedFraction: 0.40,

    /** Minimum platform width (fraction of worldW) to be considered playable */
    minPlatformWidthFraction: 0.025,

    /** Minimum platform height (fraction of worldH) */
    minPlatformHeightFraction: 0.008,
} as const;

// ---------------------------------------------------------------------------
// Scene gap analysis
// ---------------------------------------------------------------------------

/**
 * Scan the scene data and return the jump-height fraction the player needs.
 *
 * Only PHYSICAL SURFACES count as "landing" positions — the player can
 * only jump from a surface, not from thin air. The exit is included as
 * a target the player must reach (mid-jump overlap counts).
 *
 * 1. Collect landing Y-positions (normalized 0..1):
 *    - ground (1.0)
 *    - each platform's top edge (bounds_normalized.y)
 *    - exit position (must be reachable)
 *    NOTE: player spawn is NOT included — the player falls to the
 *    nearest surface below, so it would mask the real gap.
 * 2. Sort ascending (top = 0, bottom = 1)
 * 3. Find the largest gap between consecutive positions
 * 4. Add margin, clamp to [min, max]
 */
function analyzeSceneGaps(sceneData: SceneV1): number {
    const yPositions: number[] = [];

    // Ground — the bottom of the world
    yPositions.push(1.0);

    // Platform top edges — actual surfaces the player can stand on
    for (const obj of sceneData.objects) {
        if (obj.type === 'platform') {
            yPositions.push(obj.bounds_normalized.y);
        }
    }

    // Exit — the player must be able to reach this height
    yPositions.push(sceneData.spawns.exit.y);

    // Sort ascending (top of screen first)
    yPositions.sort((a, b) => a - b);

    // Find the largest gap between consecutive positions
    let maxGap = 0;
    for (let i = 1; i < yPositions.length; i++) {
        const gap = yPositions[i] - yPositions[i - 1];
        if (gap > maxGap) maxGap = gap;
    }

    // Add margin and clamp
    const required = maxGap * (1 + RATIOS.jumpMargin);
    const clamped = Math.min(
        Math.max(required, RATIOS.minJumpFraction),
        RATIOS.maxJumpFraction,
    );

    console.info(
        `[PhysicsConfig] Scene gap analysis: positions=[${yPositions.map(y => y.toFixed(2)).join(', ')}], ` +
        `maxGap=${maxGap.toFixed(3)}, required=${required.toFixed(3)}, ` +
        `jumpFraction=${clamped.toFixed(3)}`,
    );

    return clamped;
}

// ---------------------------------------------------------------------------
// Computed physics — pixel values derived from world size
// ---------------------------------------------------------------------------

export interface ComputedPhysics {
    gravityY: number;
    playerSpeed: number;
    jumpVelocity: number;
    playerSizePx: number;
    playerBodyWidth: number;
    playerBodyHeight: number;
    exitSizePx: number;
    pickupSizePx: number;
    enemySizePx: number;
    minPlatformWidth: number;
    minPlatformHeight: number;
}

/**
 * Compute all pixel-based physics values from world dimensions.
 *
 * When `sceneData` is provided the jump height adapts to the largest
 * vertical gap in the level. Without it the default fraction is used.
 *
 * Call once per scene creation. All factories receive the result.
 */
export function computePhysics(
    worldW: number,
    worldH: number,
    sceneData?: SceneV1,
): ComputedPhysics {
    const playerSizePx = Math.max(Math.round(RATIOS.playerSize * worldH), 16);
    const exitSizePx = Math.max(Math.round(RATIOS.exitSize * worldH), 16);
    const pickupSizePx = Math.max(Math.round(RATIOS.pickupSize * worldH), 12);
    const enemySizePx = Math.max(Math.round(RATIOS.enemySize * worldH), 16);

    const gravityY = RATIOS.gravityMultiplier * worldH;

    // Adaptive or fallback jump fraction
    const jumpFraction = sceneData
        ? analyzeSceneGaps(sceneData)
        : RATIOS.defaultJumpHeightFraction;

    // v = sqrt(2 * g * h)   where h = jumpFraction × worldH
    const jumpH = jumpFraction * worldH;
    const jumpVelocity = -Math.sqrt(2 * gravityY * jumpH);

    const playerSpeed = RATIOS.speedFraction * worldW;

    return {
        gravityY,
        playerSpeed,
        jumpVelocity,
        playerSizePx,
        playerBodyWidth: Math.round(playerSizePx * RATIOS.bodyWidthRatio),
        playerBodyHeight: Math.round(playerSizePx * RATIOS.bodyHeightRatio),
        exitSizePx,
        pickupSizePx,
        enemySizePx,
        minPlatformWidth: RATIOS.minPlatformWidthFraction * worldW,
        minPlatformHeight: RATIOS.minPlatformHeightFraction * worldH,
    };
}
