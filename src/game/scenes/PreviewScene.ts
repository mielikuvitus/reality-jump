/**
 * PREVIEW SCENE (Step 3)
 * ======================
 *
 * Renders the user's photo as a background, with debug overlay markers
 * for all scene objects, spawns, enemies, and pickups.
 *
 * THIS IS PREVIEW ONLY:
 * - No player movement
 * - No physics / collisions
 * - No enemy AI
 * - No win/lose conditions
 *
 * The scene receives validated SceneV1 data and a photo URL via init data.
 * All positions are normalized (0..1) and converted to world coords here.
 *
 * The world size is set to match the photo's actual aspect ratio so
 * nothing gets squashed. Phaser Scale.FIT handles fitting it into the
 * container on screen.
 *
 * Debug overlay can be toggled via EventBus from React.
 */

import { Scene } from 'phaser';
import { type SceneV1, type SceneObject, isEnemySpawnAnchor } from '../../shared/schema/scene_v1.schema';
import { normToWorldX, normToWorldY, normRectToWorldRect } from '../utils/coords';
import { EventBus } from '../EventBus';

/** Color map for object types */
const TYPE_COLORS: Record<string, number> = {
    platform:    0x4ade80, // green
    obstacle:    0xfbbf24, // amber
    collectible: 0x60a5fa, // blue
    hazard:      0xef4444, // red
    enemy:       0xef4444, // red
};

const TYPE_ALPHA: Record<string, number> = {
    platform:    0.4,
    obstacle:    0.35,
    collectible: 0.35,
    hazard:      0.4,
    enemy:       0.45,
};

export interface PreviewSceneData {
    photoUrl: string;
    sceneData: SceneV1;
    debugEnabled: boolean;
}

export class PreviewScene extends Scene {
    private sceneData!: SceneV1;
    private photoUrl!: string;
    private debugEnabled!: boolean;

    /** Actual world size - derived from the photo dimensions */
    private worldW = 960;
    private worldH = 640;

    // Debug layer container - holds all debug visuals
    private debugLayer!: Phaser.GameObjects.Container;
    private debugGraphics!: Phaser.GameObjects.Graphics;
    private debugLabels: Phaser.GameObjects.Text[] = [];

    constructor() {
        super('PreviewScene');
    }

    init(data: PreviewSceneData) {
        this.photoUrl = data.photoUrl;
        this.sceneData = data.sceneData;
        this.debugEnabled = data.debugEnabled ?? true;

        console.info('[PreviewScene] init:', {
            hasPhoto: !!this.photoUrl,
            objects: this.sceneData?.objects?.length ?? 0,
            enemies: this.sceneData?.spawns?.enemies?.length ?? 0,
            pickups: this.sceneData?.spawns?.pickups?.length ?? 0,
            debug: this.debugEnabled,
        });
    }

    preload() {
        if (this.photoUrl) {
            const key = 'user-photo-' + Date.now();
            this.load.image(key, this.photoUrl);
            this.data.set('photoKey', key);
        }
    }

    create() {
        const photoKey = this.data.get('photoKey') as string | undefined;

        if (photoKey && this.textures.exists(photoKey)) {
            // Get the actual photo dimensions from the loaded texture
            const frame = this.textures.getFrame(photoKey);
            const photoW = frame.width;
            const photoH = frame.height;

            console.info(`[PreviewScene] Photo loaded: ${photoW}x${photoH}`);

            // Resize the game to match the photo's aspect ratio.
            // Use the photo's native dimensions as the world size.
            // Phaser Scale.FIT will handle fitting it into the container.
            this.worldW = photoW;
            this.worldH = photoH;
            this.scale.resize(photoW, photoH);

            // Render photo at its native size - no stretching
            const photo = this.add.image(0, 0, photoKey).setOrigin(0, 0);
            photo.setDisplaySize(photoW, photoH);

            console.info(`[PreviewScene] World resized to ${photoW}x${photoH}`);
        } else {
            // Fallback: keep default size, dark background
            this.add.rectangle(this.worldW / 2, this.worldH / 2, this.worldW, this.worldH, 0x1a1a2e);
            this.add.text(this.worldW / 2, this.worldH / 2, 'Photo not available', {
                fontSize: '20px',
                color: '#ffffff',
                backgroundColor: 'rgba(0,0,0,0.5)',
                padding: { x: 16, y: 8 },
            }).setOrigin(0.5);
            console.warn('[PreviewScene] Photo not loaded, showing fallback');
        }

        // Create debug layer
        this.debugLayer = this.add.container(0, 0);
        this.debugGraphics = this.add.graphics();
        this.debugLayer.add(this.debugGraphics);

        // Draw all debug visuals
        this.drawObjectOverlays();
        this.drawSpawnMarkers();

        // Apply initial debug visibility
        this.debugLayer.setVisible(this.debugEnabled);

        // Listen for debug toggle from React
        EventBus.on('toggle-debug', this.handleToggleDebug, this);

        // Notify React that scene is ready
        EventBus.emit('current-scene-ready', this);
    }

    private handleToggleDebug = (enabled: boolean) => {
        this.debugEnabled = enabled;
        this.debugLayer.setVisible(enabled);
    };

    private drawObjectOverlays() {
        const g = this.debugGraphics;

        if (!this.sceneData.objects || this.sceneData.objects.length === 0) {
            console.info('[PreviewScene] No objects to draw');
            return;
        }

        for (const obj of this.sceneData.objects) {
            this.drawSingleObject(g, obj);
        }

        console.info(`[PreviewScene] Drew ${this.sceneData.objects.length} object overlays`);
    }

    private drawSingleObject(g: Phaser.GameObjects.Graphics, obj: SceneObject) {
        const color = TYPE_COLORS[obj.type] ?? 0xffffff;
        const alpha = TYPE_ALPHA[obj.type] ?? 0.3;
        const rect = normRectToWorldRect(obj.bounds_normalized, this.worldW, this.worldH);

        if (obj.type === 'collectible') {
            const cx = rect.x + rect.w / 2;
            const cy = rect.y + rect.h / 2;
            const radius = Math.max(Math.min(rect.w, rect.h) / 2, 8);
            g.fillStyle(color, alpha);
            g.fillCircle(cx, cy, radius);
            g.lineStyle(2, color, 0.8);
            g.strokeCircle(cx, cy, radius);
        } else {
            g.fillStyle(color, alpha);
            g.fillRect(rect.x, rect.y, rect.w, rect.h);
            g.lineStyle(2, color, 0.8);
            g.strokeRect(rect.x, rect.y, rect.w, rect.h);
        }

        // Label above the object
        const anchorTag = isEnemySpawnAnchor(obj) ? ' [ANCHOR]' : '';
        const categoryTag = obj.category ? ` [${obj.category}]` : '';
        const labelText = obj.label
            ? `${obj.id} · ${obj.label} (${obj.type})${categoryTag}${anchorTag}`
            : `${obj.id} (${obj.type})${categoryTag}${anchorTag}`;

        const label = this.add.text(rect.x + 4, rect.y - 14, labelText, {
            fontSize: '8px',
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.7)',
            padding: { x: 4, y: 2 },
        });
        this.debugLabels.push(label);
        this.debugLayer.add(label);
    }

    private drawSpawnMarkers() {
        const spawns = this.sceneData.spawns;

        for (let i = 0; i < spawns.enemies.length; i++) {
            const e = spawns.enemies[i];
            const typeLabel = e.type ? ` (${e.type})` : '';
            this.createSpawnMarker(
                normToWorldX(e.x, this.worldW),
                normToWorldY(e.y, this.worldH),
                `ENEMY ${i + 1}${typeLabel}`,
                0xef4444,
                10
            );
        }

        for (let i = 0; i < spawns.pickups.length; i++) {
            const p = spawns.pickups[i];
            const typeLabel = p.type ? ` (${p.type})` : '';
            this.createSpawnMarker(
                normToWorldX(p.x, this.worldW),
                normToWorldY(p.y, this.worldH),
                `PICKUP ${i + 1}${typeLabel}`,
                0x60a5fa,
                10
            );
        }
    }

    private createSpawnMarker(x: number, y: number, label: string, color: number, size: number) {
        const g = this.debugGraphics;

        g.fillStyle(color, 0.85);
        g.beginPath();
        g.moveTo(x, y - size);
        g.lineTo(x + size, y);
        g.lineTo(x, y + size);
        g.lineTo(x - size, y);
        g.closePath();
        g.fillPath();

        g.lineStyle(2, 0xffffff, 0.9);
        g.beginPath();
        g.moveTo(x, y - size);
        g.lineTo(x + size, y);
        g.lineTo(x, y + size);
        g.lineTo(x - size, y);
        g.closePath();
        g.strokePath();

        const text = this.add.text(x + size + 6, y - 8, label, {
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.75)',
            padding: { x: 5, y: 3 },
        });
        this.debugLabels.push(text);
        this.debugLayer.add(text);
    }

    shutdown() {
        EventBus.off('toggle-debug', this.handleToggleDebug, this);
    }
}
