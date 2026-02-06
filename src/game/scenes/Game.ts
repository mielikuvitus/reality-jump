import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import { LevelLoader } from '../LevelLoader';
import { LevelData } from '../types';
import { SAMPLE_LEVEL } from '../sampleLevel';
import { askNPC, captureScreenshot } from '../openai';

export class Game extends Scene
{
    player: Phaser.Physics.Arcade.Sprite;
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
    playerSpeed: number = 200;
    level: LevelLoader;
    scoreText: Phaser.GameObjects.Text;
    score: number = 0;
    textboxOpen: boolean = false;
    inputElement: HTMLInputElement | null = null;
    inputContainer: HTMLDivElement | null = null;
    npc: Phaser.Physics.Arcade.Sprite;
    npcLabel: Phaser.GameObjects.Text;
    speechBubbleBg: Phaser.GameObjects.Graphics | null = null;
    speechBubbleText: Phaser.GameObjects.Text | null = null;

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

        // H key to toggle textbox
        this.input.keyboard!.on('keydown-H', () => {
            if (!this.textboxOpen) {
                this.openTextbox();
            }
        });

        EventBus.emit('current-scene-ready', this);
    }

    openTextbox (): void {
        this.textboxOpen = true;
        // Disable game keyboard input while typing
        this.input.keyboard!.enabled = false;

        // Create overlay container
        const container = document.createElement('div');
        container.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            display: flex; justify-content: center; align-items: center;
            background: rgba(0,0,0,0.5); z-index: 1000;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: #1a1a2e; border: 2px solid #4488aa; border-radius: 8px;
            padding: 20px; display: flex; flex-direction: column; gap: 12px;
            min-width: 400px;
        `;

        const label = document.createElement('div');
        label.textContent = 'Enter text (Enter to submit, Esc to cancel)';
        label.style.cssText = 'color: #aaa; font-family: Arial; font-size: 14px;';

        const input = document.createElement('input');
        input.type = 'text';
        input.style.cssText = `
            background: #0d0d1a; color: #ffffff; border: 1px solid #4488aa;
            border-radius: 4px; padding: 10px 14px; font-size: 16px;
            font-family: Arial; outline: none; width: 100%; box-sizing: border-box;
        `;
        input.placeholder = 'Type here...';

        box.appendChild(label);
        box.appendChild(input);
        container.appendChild(box);

        // Mount into the game container div
        const gameContainer = this.game.canvas.parentElement!;
        gameContainer.style.position = 'relative';
        gameContainer.appendChild(container);

        this.inputElement = input;
        this.inputContainer = container;

        input.focus();

        input.addEventListener('keydown', (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                const text = input.value;
                this.closeTextbox();
                this.onTextSubmit(text);
            } else if (e.key === 'Escape') {
                this.closeTextbox();
            }
        });

        // Close if clicking outside the box
        container.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.target === container) {
                this.closeTextbox();
            }
        });
    }

    closeTextbox (): void {
        if (this.inputContainer) {
            this.inputContainer.remove();
            this.inputContainer = null;
            this.inputElement = null;
        }
        this.textboxOpen = false;
        this.input.keyboard!.enabled = true;
    }

    onTextSubmit (text: string): void {
        console.log('Textbox submitted:', text);
        if (!text.trim()) return;

        // Capture current game screen
        const screenshot = captureScreenshot(this.game.canvas);

        // Show a "thinking" bubble while waiting for the API
        this.showSpeechBubble('...');

        askNPC(text, screenshot).then((reply) => {
            this.showSpeechBubble(reply);
        });
    }

    showSpeechBubble (text: string): void {
        // Remove previous bubble if any
        this.speechBubbleBg?.destroy();
        this.speechBubbleText?.destroy();

        // Measure text to size the bubble
        const padding = 12;
        const maxWidth = 200;
        const tempText = this.add.text(0, 0, text, {
            fontFamily: 'Arial', fontSize: 14, color: '#ffffff',
            wordWrap: { width: maxWidth }
        });
        const textW = tempText.width;
        const textH = tempText.height;
        tempText.destroy();

        const bubbleW = textW + padding * 2;
        const bubbleH = textH + padding * 2;
        const tailH = 10;

        // Position bubble above the NPC
        const bx = this.npc.x - bubbleW / 2;
        const by = this.npc.y - 32 - bubbleH - tailH;

        // Draw bubble background
        const gfx = this.add.graphics();
        gfx.fillStyle(0x222244, 0.9);
        gfx.fillRoundedRect(bx, by, bubbleW, bubbleH, 8);
        gfx.lineStyle(2, 0x4488ff, 1);
        gfx.strokeRoundedRect(bx, by, bubbleW, bubbleH, 8);
        // Tail triangle pointing down to NPC
        gfx.fillStyle(0x222244, 0.9);
        gfx.fillTriangle(
            this.npc.x - 6, by + bubbleH,
            this.npc.x + 6, by + bubbleH,
            this.npc.x, by + bubbleH + tailH
        );
        gfx.setDepth(200);
        this.speechBubbleBg = gfx;

        // Draw text inside bubble
        this.speechBubbleText = this.add.text(bx + padding, by + padding, text, {
            fontFamily: 'Arial', fontSize: 14, color: '#ffffff',
            wordWrap: { width: maxWidth }
        }).setDepth(201);

        // Auto-hide: stay for 15 seconds, then fade out over 2 seconds
        this.time.delayedCall(15000, () => {
            const targets = [this.speechBubbleBg, this.speechBubbleText].filter(Boolean);
            if (targets.length > 0) {
                this.tweens.add({
                    targets,
                    alpha: 0,
                    duration: 2000,
                    ease: 'Power2',
                    onComplete: () => {
                        this.speechBubbleBg?.destroy();
                        this.speechBubbleText?.destroy();
                        this.speechBubbleBg = null;
                        this.speechBubbleText = null;
                    }
                });
            }
        });
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

        // Create AI NPC (blue square) near the right side of the level
        this.npc = this.physics.add.sprite(512, this.level.playerSpawn.y, 'npc');
        this.npc.setCollideWorldBounds(true);
        this.physics.add.collider(this.npc, this.level.platforms);

        // NPC label
        this.npcLabel = this.add.text(512, this.level.playerSpawn.y - 28, 'AI NPC', {
            fontFamily: 'Arial', fontSize: 11, color: '#4488ff'
        }).setOrigin(0.5);

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

        // Keep NPC label following the NPC
        if (this.npc && this.npcLabel) {
            this.npcLabel.setPosition(this.npc.x, this.npc.y - 28);
        }
    }

    changeScene ()
    {
        this.scene.start('MainMenu');
    }
}
