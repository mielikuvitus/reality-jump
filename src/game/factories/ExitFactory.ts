/**
 * EXIT FACTORY
 * =============
 *
 * Creates the exit/goal sprite with an overlap sensor.
 * Size derived from ComputedPhysics (world-relative).
 */

import type { ComputedPhysics } from '../physics/PhysicsConfig';
import { ensureIconTexture, getIconTextureKey } from '../assets/IconTextureFactory';

export function createExit(
    scene: Phaser.Scene,
    x: number,
    y: number,
    phys: ComputedPhysics,
): Phaser.Physics.Arcade.Sprite {
    const size = phys.exitSizePx;
    ensureIconTexture(scene, 'exit', size, '#fbbf24');
    const key = getIconTextureKey('exit', size);

    // Nudge upward slightly so the flag sits on the platform surface, not inside it
    const sprite = scene.physics.add.sprite(x, y - size * 0.25, key);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);

    return sprite;
}
