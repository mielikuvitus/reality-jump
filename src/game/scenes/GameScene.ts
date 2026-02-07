/**
 * GAME SCENE (Step 4) — Playable Platformer
 * ==========================================
 *
 * A small playable slice: movement, collisions, win condition, pickups.
 *
 * Receives validated SceneV1 data and a photo URL via init data.
 * Same data as PreviewScene, but with Arcade Physics enabled.
 *
 * All physics values (gravity, speed, jump, sizes) are computed relative
 * to the world dimensions so the game feels identical on any device.
 *
 * Controls:
 * - Keyboard: Arrow keys / WASD + Space to jump
 * - Mobile: InputState written by React MobileControls overlay
 *
 * Win condition: player overlaps exit sprite.
 * Collectibles: overlap pickups -> score increment.
 * Health: player starts with 10 HP. Enemy contact costs 2 HP.
 */

import { Scene } from 'phaser';
import { type SceneV1, isEnemySpawnAnchor } from '../../shared/schema/scene_v1.schema';
import { normToWorldX, normToWorldY } from '../utils/coords';
import { computePhysics, type ComputedPhysics } from '../physics/PhysicsConfig';
import { createPlayer } from '../factories/PlayerFactory';
import { createPlatforms } from '../factories/PlatformFactory';
import { createExit } from '../factories/ExitFactory';
import { createPickups, PickupSprite } from '../factories/PickupFactory';
import { createEnemies, type EnemySprite } from '../factories/EnemyFactory';
import { EventBus } from '../EventBus';
import type { InputState } from '../input/InputState';

export interface GameSceneData {
    photoUrl: string;
    sceneData: SceneV1;
    inputState: InputState;
    debugEnabled: boolean;
}

export class GameScene extends Scene {
    private sceneData!: SceneV1;
    private photoUrl!: string;
    private inputState!: InputState;
    private debugEnabled!: boolean;

    /** Texture key for the loaded photo */
    private photoTextureKey?: string;

    private worldW = 960;
    private worldH = 640;

    /** World-relative physics values — computed once in create() */
    private phys!: ComputedPhysics;

    private player!: Phaser.Physics.Arcade.Sprite;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
    private spaceKey!: Phaser.Input.Keyboard.Key;

    private score = 0;
    private health = 10;
    private gameWon = false;
    private gameLost = false;

    /** Brief invulnerability after taking damage (prevents instant multi-hits) */
    private invulnerableUntil = 0;

    /** Enemy group — needed for patrol update logic */
    private enemyGroup?: Phaser.Physics.Arcade.Group;

    /** Current surface type the player is standing on (updated by collider callback) */
    private currentSurfaceType: string = 'solid';

    // Debug layer
    private debugLayer!: Phaser.GameObjects.Container;
    private debugGraphics!: Phaser.GameObjects.Graphics;

    constructor() {
        super('GameScene');
    }

    init(data: GameSceneData) {
        this.photoUrl = data.photoUrl;
        this.sceneData = data.sceneData;
        this.inputState = data.inputState;
        this.debugEnabled = data.debugEnabled ?? true;
        this.score = 0;
        this.health = 10;
        this.gameWon = false;
        this.gameLost = false;
        this.invulnerableUntil = 0;
        this.photoTextureKey = undefined;

        // World dimensions from game config (PlayScreen sets these to photo dimensions)
        this.worldW = this.scale.width || 960;
        this.worldH = this.scale.height || 640;

        // Compute physics values relative to world size + scene layout.
        // Jump height adapts to the largest vertical gap in the level.
        this.phys = computePhysics(this.worldW, this.worldH, this.sceneData);

        const anchors = this.sceneData.objects.filter(isEnemySpawnAnchor);
        console.info('[GameScene] init:', {
            worldW: this.worldW,
            worldH: this.worldH,
            playerSizePx: this.phys.playerSizePx,
            gravityY: Math.round(this.phys.gravityY),
            jumpVelocity: Math.round(this.phys.jumpVelocity),
            playerSpeed: Math.round(this.phys.playerSpeed),
            objects: this.sceneData.objects.length,
            enemySpawnAnchors: anchors.map(a => a.id),
        });
    }

    preload() {
        if (this.photoUrl) {
            this.photoTextureKey = 'game-photo-' + Date.now();
            this.load.image(this.photoTextureKey, this.photoUrl);
        }
    }

    create() {
        // --- Set gravity at runtime (not in config, since it depends on world size) ---
        this.physics.world.gravity.y = this.phys.gravityY;

        // --- Photo background (darkened + blur for gameplay visibility) ---
        if (this.photoTextureKey && this.textures.exists(this.photoTextureKey)) {
            const photo = this.add.image(0, 0, this.photoTextureKey).setOrigin(0, 0);
            photo.setDisplaySize(this.worldW, this.worldH);
            photo.setAlpha(0.5);

            // Apply a slight blur via Phaser's built-in pipeline
            if (photo.postFX) {
                photo.postFX.addBlur(0, 2, 2, 1);
            }

            // Dark overlay on top of the photo for extra contrast
            this.add.rectangle(
                this.worldW / 2, this.worldH / 2,
                this.worldW, this.worldH,
                0x000000, 0.25,
            );
        } else {
            this.add.rectangle(
                this.worldW / 2, this.worldH / 2,
                this.worldW, this.worldH,
                0x1a1a2e,
            );
        }

        // --- World bounds ---
        this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

        // --- Platforms ---
        const platformGroup = createPlatforms(
            this, this.sceneData.objects, this.worldW, this.worldH, this.phys,
        );

        // Ground at the very bottom so the player can't fall off-screen
        const ground = this.add.zone(this.worldW / 2, this.worldH - 2, this.worldW, 4);
        this.physics.add.existing(ground, true);
        platformGroup.add(ground);

        // --- Player ---
        const spawn = this.sceneData.spawns.player;
        const playerX = normToWorldX(spawn.x, this.worldW);
        const playerY = normToWorldY(spawn.y, this.worldH);
        this.player = createPlayer(this, playerX, playerY, this.phys);

        // Player <-> Platforms collision (callback tracks surface type)
        this.physics.add.collider(this.player, platformGroup, (_player, platObj) => {
            const zone = platObj as Phaser.GameObjects.Zone;
            const surfaceType = zone.getData('surfaceType') as string | undefined;
            if (surfaceType) {
                this.currentSurfaceType = surfaceType;
            }
        });

        // --- Exit ---
        const exitSpawn = this.sceneData.spawns.exit;
        const exitSprite = createExit(
            this,
            normToWorldX(exitSpawn.x, this.worldW),
            normToWorldY(exitSpawn.y, this.worldH),
            this.phys,
        );

        // Player overlaps exit -> win
        this.physics.add.overlap(this.player, exitSprite, () => {
            if (!this.gameWon) {
                this.gameWon = true;
                this.handleWin();
            }
        });

        // --- Pickups ---
        if (this.sceneData.spawns.pickups.length > 0) {
            const pickupGroup = createPickups(
                this,
                this.sceneData.spawns.pickups,
                this.worldW,
                this.worldH,
                this.phys,
            );

            this.physics.add.overlap(this.player, pickupGroup, (_player, pickup) => {
                const p = pickup as PickupSprite;

                if (p.pickupType === 'health') {
                    // Health pickup: restore 5 HP, capped at 10. Skip if already full.
                    if (this.health >= 10) return;
                    p.disableBody(true, true);
                    this.health = Math.min(10, this.health + 5);
                    EventBus.emit('health-update', this.health);
                } else {
                    // Coin pickup: +1 score
                    p.disableBody(true, true);
                    this.score += 1;
                    EventBus.emit('score-update', this.score);
                }
            });
        }

        // --- Enemies ---
        if (this.sceneData.spawns.enemies.length > 0) {
            this.enemyGroup = createEnemies(
                this,
                this.sceneData.spawns.enemies,
                this.worldW,
                this.worldH,
                this.phys,
            );

            // Enemies collide with platforms — callback sets patrol bounds on landing
            this.physics.add.collider(this.enemyGroup, platformGroup, (enemyObj, platObj) => {
                const enemy = enemyObj as EnemySprite;
                const platBody = (platObj as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody;
                const enemyBody = enemy.body as Phaser.Physics.Arcade.Body;

                // Detect landing: enemy bottom is at or just above the platform top
                // (position-based check — more reliable than blocked.down in callbacks)
                const enemyBottom = enemyBody.y + enemyBody.height;
                const platTop = platBody.y;
                if (enemyBottom > platTop + 4) return; // side collision, not landing

                const halfEnemy = enemyBody.width / 2;
                const platLeft = platBody.x;
                const platRight = platBody.x + platBody.width;

                enemy.patrolLeft = platLeft + halfEnemy;
                enemy.patrolRight = platRight - halfEnemy;
                enemy.patrolReady = true;
            });

            // Player overlaps enemy -> take damage
            this.physics.add.overlap(this.player, this.enemyGroup, () => {
                if (this.gameWon || this.gameLost) return;
                if (this.time.now < this.invulnerableUntil) return;

                this.health = Math.max(0, this.health - 2);
                this.invulnerableUntil = this.time.now + 1000; // 1s invulnerability
                EventBus.emit('health-update', this.health);

                // Brief red flash to indicate damage
                this.player.setTintFill(0xff4444);
                this.time.delayedCall(200, () => {
                    this.player.clearTint();
                });

                if (this.health <= 0) {
                    this.gameLost = true;
                    this.handleLose();
                }
            });
        }

        // Emit initial health so UI is in sync
        EventBus.emit('health-update', this.health);

        // Score is shown in the React header — no in-game HUD needed

        // --- Debug overlay ---
        this.debugLayer = this.add.container(0, 0).setDepth(90);
        this.debugGraphics = this.add.graphics();
        this.debugLayer.add(this.debugGraphics);
        this.drawDebugOverlays();
        this.debugLayer.setVisible(this.debugEnabled);

        // --- Keyboard input ---
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.wasd = {
                W: this.input.keyboard.addKey('W'),
                A: this.input.keyboard.addKey('A'),
                D: this.input.keyboard.addKey('D'),
            };
            this.spaceKey = this.input.keyboard.addKey('SPACE');
        }

        // --- Listen for debug toggle from React ---
        EventBus.on('toggle-debug', this.handleToggleDebug, this);

        // --- Camera follows player ---
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

        console.info('[GameScene] create: DONE');
        EventBus.emit('current-scene-ready', this);
    }

    update() {
        if (this.gameWon || this.gameLost) return;

        const body = this.player.body as Phaser.Physics.Arcade.Body;

        // Read input from keyboard OR mobile controls
        const left = this.inputState.left
            || this.cursors?.left?.isDown
            || this.wasd?.A?.isDown;

        const right = this.inputState.right
            || this.cursors?.right?.isDown
            || this.wasd?.D?.isDown;

        const jump = this.inputState.jump
            || this.cursors?.up?.isDown
            || this.spaceKey?.isDown
            || this.wasd?.W?.isDown;

        // Surface modifiers (soft = slower movement, normal jump)
        const onSoft = body.blocked.down && this.currentSurfaceType === 'soft';
        const speedMul = onSoft ? 0.6 : 1;
        const jumpMul = 1;

        // Horizontal movement (world-relative speed)
        const speed = this.phys.playerSpeed * speedMul;
        if (left) {
            body.setVelocityX(-speed);
        } else if (right) {
            body.setVelocityX(speed);
        } else {
            body.setVelocityX(0);
        }

        // Jump (only when touching ground, world-relative velocity)
        if (jump && body.blocked.down) {
            body.setVelocityY(this.phys.jumpVelocity * jumpMul);
        }

        // Reset surface type when airborne (will be set again on next landing)
        if (!body.blocked.down) {
            this.currentSurfaceType = 'solid';
        }

        // Consume jump to prevent continuous jumping from held button
        if (jump && !body.blocked.down) {
            this.inputState.jump = false;
        }

        // --- Enemy patrol logic ---
        this.updateEnemyPatrol();
    }

    /** Move each enemy back and forth within its patrol bounds. */
    private updateEnemyPatrol() {
        if (!this.enemyGroup) return;

        for (const obj of this.enemyGroup.getChildren()) {
            const enemy = obj as EnemySprite;
            if (!enemy.active) continue;

            const eb = enemy.body as Phaser.Physics.Arcade.Body;
            const speed = enemy.patrolSpeed;

            // While falling (not on ground), just keep current horizontal velocity
            if (!eb.blocked.down) continue;

            // Ensure the enemy is always moving at patrol speed
            if (eb.velocity.x === 0) {
                eb.setVelocityX(-speed);
            }

            const movingLeft = eb.velocity.x < 0;

            // --- Reverse at world bounds (walls / sides of play area) ---
            if (eb.blocked.left || enemy.x <= eb.halfWidth) {
                enemy.x = Math.max(enemy.x, eb.halfWidth);
                eb.setVelocityX(speed);
                enemy.setFlipX(true);
                continue;
            }
            if (eb.blocked.right || enemy.x >= this.worldW - eb.halfWidth) {
                enemy.x = Math.min(enemy.x, this.worldW - eb.halfWidth);
                eb.setVelocityX(-speed);
                enemy.setFlipX(false);
                continue;
            }

            // --- Reverse at platform edges (only if bounds are known) ---
            if (enemy.patrolReady) {
                if (movingLeft && enemy.x <= enemy.patrolLeft) {
                    enemy.x = enemy.patrolLeft;
                    eb.setVelocityX(speed);
                    enemy.setFlipX(true);
                } else if (!movingLeft && enemy.x >= enemy.patrolRight) {
                    enemy.x = enemy.patrolRight;
                    eb.setVelocityX(-speed);
                    enemy.setFlipX(false);
                }
            }
        }
    }

    private handleWin() {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        body.setAllowGravity(false);
        EventBus.emit('game-won', { score: this.score });
    }

    private handleLose() {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        body.setAllowGravity(false);
        this.player.setTintFill(0xff0000);
        EventBus.emit('game-lost', { score: this.score });
    }

    private handleToggleDebug = (enabled: boolean) => {
        this.debugEnabled = enabled;
        this.debugLayer.setVisible(enabled);
    };

    private drawDebugOverlays() {
        const g = this.debugGraphics;
        const markerR = Math.max(this.worldH * 0.008, 4);
        const fontSize = `${Math.max(Math.round(this.worldH * 0.014), 8)}px`;

        for (const obj of this.sceneData.objects) {
            const rect = {
                x: obj.bounds_normalized.x * this.worldW,
                y: obj.bounds_normalized.y * this.worldH,
                w: obj.bounds_normalized.w * this.worldW,
                h: obj.bounds_normalized.h * this.worldH,
            };

            const colors: Record<string, number> = {
                platform: 0x4ade80, obstacle: 0xfbbf24,
                collectible: 0x60a5fa, hazard: 0xef4444,
                enemy: 0xef4444,
            };
            const color = colors[obj.type] ?? 0xffffff;
            g.lineStyle(1, color, 0.5);
            g.strokeRect(rect.x, rect.y, rect.w, rect.h);

            // Mark enemy spawn anchors with a small orange diamond
            if (isEnemySpawnAnchor(obj)) {
                const cx = rect.x + rect.w / 2;
                const cy = rect.y + rect.h / 2;
                g.fillStyle(0xf97316, 0.7);
                g.fillTriangle(cx, cy - 6, cx + 6, cy, cx, cy + 6);
                g.fillTriangle(cx, cy - 6, cx - 6, cy, cx, cy + 6);
            }

            const anchorTag = isEnemySpawnAnchor(obj) ? ' [ANCHOR]' : '';
            const label = this.add.text(rect.x + 2, rect.y - markerR * 2, `${obj.id}${anchorTag}`, {
                fontSize, color: '#fff',
                backgroundColor: 'rgba(0,0,0,0.6)',
                padding: { x: 3, y: 1 },
            });
            this.debugLayer.add(label);
        }

    }
}
