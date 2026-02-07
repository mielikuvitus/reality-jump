/**
 * ENEMY FACTORY
 * ==============
 *
 * Creates enemy sprites from scene spawn data.
 * Uses the "enemy" semantic key from game_icons.ts, which resolves
 * to the Lucide "Angry" icon by default.
 *
 * Enemies spawn at their designated position and fall with gravity
 * until they land on a platform or the ground. Once landed they
 * patrol back and forth, reversing at platform edges or walls.
 *
 * Size derived from ComputedPhysics (world-relative).
 */

import type { ComputedPhysics } from '../physics/PhysicsConfig';
import { ensureIconTexture, getIconTextureKey } from '../assets/IconTextureFactory';

export interface EnemySprite extends Phaser.Physics.Arcade.Sprite {
    enemyType: string;
    damageAmount: number;
    /** Left edge of the current patrol surface (set on landing) */
    patrolLeft: number;
    /** Right edge of the current patrol surface (set on landing) */
    patrolRight: number;
    /** Whether patrol bounds have been set (enemy has landed) */
    patrolReady: boolean;
    /** Patrol speed in px/s */
    patrolSpeed: number;
}

/** Patrol speed as a fraction of world width per second */
const PATROL_SPEED_FRACTION = 0.09;

export function createEnemies(
    scene: Phaser.Scene,
    enemies: Array<{ x: number; y: number; type?: string }>,
    worldW: number,
    worldH: number,
    phys: ComputedPhysics,
): Phaser.Physics.Arcade.Group {
    const group = scene.physics.add.group();

    const size = phys.enemySizePx;
    const patrolSpeed = PATROL_SPEED_FRACTION * worldW;

    // Ensure the enemy texture exists (uses 'Angry' via game_icons.ts)
    ensureIconTexture(scene, 'enemy', size);

    const key = getIconTextureKey('enemy', size);

    for (const e of enemies) {
        const ex = e.x * worldW;
        const ey = e.y * worldH;

        const sprite = scene.physics.add.sprite(ex, ey, key) as EnemySprite;
        sprite.enemyType = e.type ?? 'walker';
        sprite.damageAmount = 20;
        sprite.patrolLeft = 0;
        sprite.patrolRight = worldW;
        sprite.patrolReady = false;
        sprite.patrolSpeed = patrolSpeed;

        // IMPORTANT: add to group FIRST, then configure body.
        // group.add() can reset body properties to group defaults.
        group.add(sprite);

        const body = sprite.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(true);
        body.setCollideWorldBounds(true);
        body.setBounce(0, 0);
        // Start moving left; patrol logic will reverse at edges
        body.setVelocityX(-patrolSpeed);
    }

    return group;
}
