import Phaser from 'phaser';
import { LevelData, Detection, Surface, EnemySpawn, PickupSpawn, Rule } from './types';

/**
 * Converts a LevelData JSON (normalized 0–1 coordinates) into
 * actual Phaser game objects within the given scene.
 */
export class LevelLoader {
    private scene: Phaser.Scene;
    private worldW: number;
    private worldH: number;

    // Created game objects — exposed so the scene can use them
    platforms: Phaser.Physics.Arcade.StaticGroup;
    detections: Phaser.GameObjects.Rectangle[] = [];
    enemies: Phaser.Physics.Arcade.Sprite[] = [];
    pickups: Phaser.Physics.Arcade.Sprite[] = [];
    exitZone: Phaser.GameObjects.Zone | null = null;
    playerSpawn: { x: number; y: number } = { x: 0, y: 0 };
    activeRules: Rule[] = [];

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.worldW = Number(scene.game.config.width);
        this.worldH = Number(scene.game.config.height);
        this.platforms = scene.physics.add.staticGroup();
    }

    /** Convert normalized x to pixel x */
    private nx(val: number): number { return val * this.worldW; }
    /** Convert normalized y to pixel y */
    private ny(val: number): number { return val * this.worldH; }

    /** Load an entire level from JSON data */
    load(data: LevelData): void {
        this.buildSurfaces(data.surfaces);
        this.buildDetections(data.detections);
        this.buildSpawns(data.spawns.enemies, data.spawns.pickups);
        this.buildExit(data.spawns.exit);
        this.playerSpawn = {
            x: this.nx(data.spawns.player.x),
            y: this.ny(data.spawns.player.y),
        };
        this.activeRules = data.rules;
    }

    // ── Surfaces / Platforms ──────────────────────────────────────

    private buildSurfaces(surfaces: Surface[]): void {
        for (const surf of surfaces) {
            if (surf.poly.length < 3) continue;

            // Compute axis-aligned bounding rect of the polygon
            const pxPoly = surf.poly.map(([px, py]) => ({ x: this.nx(px), y: this.ny(py) }));
            const xs = pxPoly.map(p => p.x);
            const ys = pxPoly.map(p => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const w = maxX - minX;
            const h = maxY - minY;
            const cx = minX + w / 2;
            const cy = minY + h / 2;

            // Visual polygon
            const gfx = this.scene.add.graphics();
            gfx.fillStyle(this.surfaceColor(surf.type), 0.7);
            gfx.beginPath();
            gfx.moveTo(pxPoly[0].x, pxPoly[0].y);
            for (let i = 1; i < pxPoly.length; i++) {
                gfx.lineTo(pxPoly[i].x, pxPoly[i].y);
            }
            gfx.closePath();
            gfx.fillPath();

            // Physics body (rectangle approximation)
            const plat = this.scene.add.rectangle(cx, cy, w, h) as Phaser.GameObjects.Rectangle;
            this.platforms.add(plat);
            (plat.body as Phaser.Physics.Arcade.StaticBody).setSize(w, h);
            plat.setVisible(false);
        }
    }

    private surfaceColor(type: string): number {
        switch (type) {
            case 'platform': return 0x4488aa;
            case 'wall': return 0x886644;
            case 'hazard': return 0xcc3333;
            default: return 0x555555;
        }
    }

    // ── Detected objects (visual debug outlines) ─────────────────

    private buildDetections(detections: Detection[]): void {
        for (const det of detections) {
            const x = this.nx(det.bbox.x);
            const y = this.ny(det.bbox.y);
            const w = this.nx(det.bbox.w);
            const h = this.ny(det.bbox.h);

            // Draw a semi-transparent rect to show detected region
            const rect = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h);
            rect.setStrokeStyle(2, 0xffff00, 0.5);
            rect.setFillStyle(0xffff00, 0.05);

            // Label
            this.scene.add.text(x + 4, y + 2, `${det.label} (${Math.round(det.confidence * 100)}%)`, {
                fontFamily: 'Arial', fontSize: 11, color: '#ffff88',
            }).setAlpha(0.7);

            this.detections.push(rect);
        }
    }

    // ── Enemies & Pickups ────────────────────────────────────────

    private buildSpawns(enemies: EnemySpawn[], pickups: PickupSpawn[]): void {
        for (const e of enemies) {
            const ex = this.nx(e.x);
            const ey = this.ny(e.y);
            const enemy = this.scene.physics.add.sprite(ex, ey, 'enemy');
            enemy.setData('type', e.type);

            // Simple patrol behavior
            if (e.patrol) {
                const dx = this.nx(e.patrol.dx);
                enemy.setData('patrolLeft', ex - dx);
                enemy.setData('patrolRight', ex + dx);
                enemy.setData('patrolSpeed', 60);
                (enemy.body as Phaser.Physics.Arcade.Body).setVelocityX(60);
            }

            this.enemies.push(enemy);
        }

        for (const p of pickups) {
            const px = this.nx(p.x);
            const py = this.ny(p.y);
            const pickup = this.scene.physics.add.sprite(px, py, 'pickup');
            pickup.setData('type', p.type);
            this.pickups.push(pickup);
        }
    }

    // ── Exit zone ────────────────────────────────────────────────

    private buildExit(exit: { x: number; y: number }): void {
        const ex = this.nx(exit.x);
        const ey = this.ny(exit.y);
        this.exitZone = this.scene.add.zone(ex, ey, 40, 40);
        this.scene.physics.add.existing(this.exitZone, true);

        // Visual marker
        const marker = this.scene.add.graphics();
        marker.lineStyle(2, 0x00ff00, 0.8);
        marker.strokeRect(ex - 20, ey - 20, 40, 40);
        this.scene.add.text(ex, ey - 28, 'EXIT', {
            fontFamily: 'Arial', fontSize: 12, color: '#00ff00',
        }).setOrigin(0.5);
    }

    // ── Rules ────────────────────────────────────────────────────

    /** Get a rule value by id, or return fallback */
    getRule(id: string, fallback: number): number {
        const rule = this.activeRules.find(r => r.id === id);
        return rule ? rule.param : fallback;
    }

    /** Per-frame update for patrol enemies */
    updateEnemies(): void {
        for (const enemy of this.enemies) {
            const left = enemy.getData('patrolLeft') as number | undefined;
            const right = enemy.getData('patrolRight') as number | undefined;
            const speed = enemy.getData('patrolSpeed') as number | undefined;
            if (left == null || right == null || speed == null) continue;

            const body = enemy.body as Phaser.Physics.Arcade.Body;
            if (enemy.x <= left) {
                body.setVelocityX(speed);
            } else if (enemy.x >= right) {
                body.setVelocityX(-speed);
            }
        }
    }
}
