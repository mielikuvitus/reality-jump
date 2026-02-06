import { Scene } from 'phaser';

export class Boot extends Scene
{
    constructor ()
    {
        super('Boot');
    }

    create ()
    {
        // Generate a simple player texture (32x32 green rounded square)
        const playerGfx = this.make.graphics({ x: 0, y: 0 });
        playerGfx.fillStyle(0x00ff88, 1);
        playerGfx.fillRoundedRect(0, 0, 32, 32, 6);
        playerGfx.generateTexture('player', 32, 32);
        playerGfx.destroy();

        // Generate enemy texture (24x24 red square)
        const enemyGfx = this.make.graphics({ x: 0, y: 0 });
        enemyGfx.fillStyle(0xff4444, 1);
        enemyGfx.fillRect(0, 0, 24, 24);
        enemyGfx.generateTexture('enemy', 24, 24);
        enemyGfx.destroy();

        // Generate pickup texture (16x16 yellow circle)
        const pickupGfx = this.make.graphics({ x: 0, y: 0 });
        pickupGfx.fillStyle(0xffdd44, 1);
        pickupGfx.fillCircle(8, 8, 8);
        pickupGfx.generateTexture('pickup', 16, 16);
        pickupGfx.destroy();

        this.scene.start('Game');
    }
}
