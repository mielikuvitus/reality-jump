/**
 * PICKUP FACTORY
 * ===============
 *
 * Creates collectible pickup sprites from scene spawns.
 * Size derived from ComputedPhysics (world-relative).
 */

import type { ComputedPhysics } from '../physics/PhysicsConfig';
import { ensureIconTexture, getIconTextureKey } from '../assets/IconTextureFactory';

export interface PickupSprite extends Phaser.Physics.Arcade.Sprite {
    pickupType: string;
}

export function createPickups(
    scene: Phaser.Scene,
    pickups: Array<{ x: number; y: number; type?: string }>,
    worldW: number,
    worldH: number,
    phys: ComputedPhysics,
): Phaser.Physics.Arcade.Group {
    const group = scene.physics.add.group({ allowGravity: false, immovable: true });

    const size = phys.pickupSizePx;

    // Ensure textures
    ensureIconTexture(scene, 'coin', size, '#fbbf24');
    ensureIconTexture(scene, 'health', size, '#ef4444');

    for (const p of pickups) {
        const iconName = p.type === 'health' ? 'health' : 'coin';
        const key = getIconTextureKey(iconName, size);
        const isCoin = iconName === 'coin';

        const px = p.x * worldW;
        const py = p.y * worldH;

        // Coins spawn as a stack of 2; health spawns as a single pickup
        const count = isCoin ? 2 : 1;
        const spacing = size * 1.2;
        const bobDuration = 1200 + Math.random() * 400; // shared per stack

        const stackSprites: Phaser.Physics.Arcade.Sprite[] = [];

        for (let i = 0; i < count; i++) {
            const sy = py - i * spacing;

            const sprite = scene.physics.add.sprite(px, sy, key) as PickupSprite;
            sprite.pickupType = p.type ?? 'coin';
            const body = sprite.body as Phaser.Physics.Arcade.Body;
            body.setAllowGravity(false);
            body.setImmovable(true);

            stackSprites.push(sprite);
            group.add(sprite);
        }

        if (isCoin) {
            // Coins: bob up and down together
            scene.tweens.add({
                targets: stackSprites,
                y: `-=${size * 0.6}`,
                duration: bobDuration,
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1,
            });
        } else {
            // Health: orbit in a tiny circle
            const radius = size * 0.4;
            const orbitDuration = 2000;
            let angle = 0;
            const sprite = stackSprites[0];
            const originX = px;
            const originY = py;

            scene.tweens.addCounter({
                from: 0,
                to: 360,
                duration: orbitDuration,
                repeat: -1,
                onUpdate: (tween) => {
                    angle = Phaser.Math.DegToRad(tween.getValue());
                    sprite.x = originX + Math.cos(angle) * radius;
                    sprite.y = originY + Math.sin(angle) * radius;
                },
            });
        }
    }

    return group;
}
