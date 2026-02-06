import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import { LevelLoader } from '../LevelLoader';
import { LevelData } from '../types';
import { SAMPLE_LEVEL } from '../sampleLevel';

export class Game extends Scene
{
    player: Phaser.Physics.Arcade.Sprite;
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
    playerSpeed: number = 200;
    level: LevelLoader;
    scoreText: Phaser.GameObjects.Text;
    score: number = 0;

    constructor ()
    {
        super('Game');
    }

    create ()
    {
        // Simple grid background for spatial reference
        const gfx = this.add.graphics();
        gfx.lineStyle(1, 0x333355, 0.3);
        for (let x = 0; x < 1024; x += 64) {
            gfx.lineBetween(x, 0, x, 768);
        }
        for (let y = 0; y < 768; y += 64) {
            gfx.lineBetween(0, y, 1024, y);
        }

        // ── Load level from JSON ─────────────────────────────────
        this.level = new LevelLoader(this);
        this.loadLevel(SAMPLE_LEVEL);

        // Set up keyboard controls
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasd = {
            W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };

        // HUD
        this.add.text(16, 16, 'Arrow Keys / WASD to move', {
            fontFamily: 'Arial', fontSize: 16, color: '#666666'
        });
        this.scoreText = this.add.text(16, 40, 'Score: 0', {
            fontFamily: 'Arial', fontSize: 16, color: '#ffffff'
        });

        EventBus.emit('current-scene-ready', this);
    }

    /** Build the level from a LevelData object */
    loadLevel(data: LevelData): void {
        this.level.load(data);

        // Create player at the level's spawn point
        this.player = this.physics.add.sprite(
            this.level.playerSpawn.x,
            this.level.playerSpawn.y,
            'player'
        );
        this.player.setCollideWorldBounds(true);

        // Apply gravity rule if present
        const gravScale = this.level.getRule('low_grav_in_dark', 1.0);
        (this.player.body as Phaser.Physics.Arcade.Body).setGravityY(300 * gravScale);

        // Collide player with platforms
        this.physics.add.collider(this.player, this.level.platforms);

        // Collide enemies with platforms too
        for (const enemy of this.level.enemies) {
            this.physics.add.collider(enemy, this.level.platforms);
        }

        // Overlap: player ↔ pickups
        for (const pickup of this.level.pickups) {
            this.physics.add.overlap(this.player, pickup, () => {
                pickup.destroy();
                this.score += 10;
                this.scoreText.setText(`Score: ${this.score}`);
            });
        }

        // Overlap: player ↔ enemies
        for (const enemy of this.level.enemies) {
            this.physics.add.overlap(this.player, enemy, () => {
                // Flash red and respawn at start
                this.player.setTint(0xff0000);
                this.player.setPosition(this.level.playerSpawn.x, this.level.playerSpawn.y);
                this.time.delayedCall(200, () => this.player.clearTint());
            });
        }

        // Overlap: player ↔ exit
        if (this.level.exitZone) {
            this.physics.add.overlap(this.player, this.level.exitZone, () => {
                this.add.text(512, 384, '🎉 LEVEL COMPLETE!', {
                    fontFamily: 'Arial Black', fontSize: 48, color: '#00ff00',
                    stroke: '#000000', strokeThickness: 6,
                    align: 'center'
                }).setOrigin(0.5).setDepth(100);
                this.player.setVelocity(0);
                this.player.body!.enable = false;
            });
        }
    }

    update ()
    {
        if (!this.player || !this.player.body?.enable) return;

        // Reset horizontal velocity each frame (gravity handles vertical)
        this.player.setVelocityX(0);

        // Horizontal movement
        if (this.cursors.left.isDown || this.wasd.A.isDown) {
            this.player.setVelocityX(-this.playerSpeed);
        } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
            this.player.setVelocityX(this.playerSpeed);
        }

        // Jump (only when on the ground)
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if ((this.cursors.up.isDown || this.wasd.W.isDown) && body.blocked.down) {
            this.player.setVelocityY(-350);
        }

        // Update patrol enemies
        this.level.updateEnemies();
    }

    changeScene ()
    {
        this.scene.start('MainMenu');
    }
}
