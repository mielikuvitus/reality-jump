/**
 * ICON TEXTURE FACTORY
 * =====================
 *
 * Generates Phaser textures at runtime from Lucide icon SVG path data.
 * No external sprite assets are required — everything is drawn onto
 * an offscreen Canvas via the Path2D API and registered synchronously.
 *
 * The factory uses **semantic keys** (GameIconKey) and resolves the
 * actual Lucide icon name + default colour via game_icons.ts.
 *
 * Usage:
 *   ensureIconTexture(scene, 'player', 48);
 *   const key = getIconTextureKey('player', 48);
 *   const sprite = scene.add.sprite(x, y, key);
 */

import { GAME_ICONS, GAME_ICON_COLORS, type GameIconKey } from './game_icons';

// ---------------------------------------------------------------------------
// Internal Lucide SVG path data (viewBox 0 0 24 24, stroke-based)
// Only the icons referenced by GAME_ICONS are included.
// ---------------------------------------------------------------------------

interface LucideSvgDef {
    /** SVG path `d` strings (stroke-based, 24×24 coordinate space). */
    paths: string[];
    /** If true, the first path is filled with the icon color. */
    fillFirst?: boolean;
    /** Color for detail paths (index > 0) when fillFirst is true. Defaults to icon color. */
    detailColor?: string;
}

/**
 * Minimal whitelist of Lucide SVG paths keyed by Lucide icon name.
 * Circles are encoded as arc-based paths so everything can be
 * rendered with Path2D.stroke() in a single pass.
 *
 * Sources: lucide-icons (MIT licence), extracted manually.
 */
const SVG_DATA: Record<string, LucideSvgDef> = {
    /* ---- User (player) ---- */
    User: {
        paths: [
            // body
            'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2',
            // head (circle cx=12, cy=7, r=4 as arc path)
            'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
        ],
    },

    /* ---- Angry (enemy) ---- */
    Angry: {
        paths: [
            // face circle (cx=12, cy=12, r=10) — stroke only, no fill
            'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
            // angry mouth
            'M16 16s-1.5-2-4-2-4 2-4 2',
            // left eyebrow
            'M7.5 8 10 9',
            // right eyebrow
            'M14 9l2.5-1',
            // left eye dot
            'M9 10h.01',
            // right eye dot
            'M15 10h.01',
        ],
    },

    /* ---- Flag (exit) ---- */
    Flag: {
        paths: [
            'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z',
            'M4 22v-7',
        ],
    },

    /* ---- CirclePoundSterling (coin) ---- */
    CirclePoundSterling: {
        paths: [
            // circle (cx=12, cy=12, r=10)
            'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
            // pound sign top arc
            'M10 16V9.5a1 1 0 0 1 5 0',
            // horizontal bar
            'M8 12h4',
            // baseline
            'M8 16h7',
        ],
    },

    /* ---- Heart (health) ---- */
    Heart: {
        paths: [
            'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
        ],
        fillFirst: true,
    },
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render a Lucide icon onto a Canvas context using Path2D.
 * Scales from the 24×24 Lucide viewBox to the requested pixel size.
 */
function renderLucideIcon(
    ctx: CanvasRenderingContext2D,
    lucideIconName: string,
    size: number,
    color: string,
) {
    const def = SVG_DATA[lucideIconName];

    if (!def) {
        // Unknown icon: draw a fallback filled circle
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    const scale = size / 24;

    ctx.save();
    ctx.scale(scale, scale);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < def.paths.length; i++) {
        const path2d = new Path2D(def.paths[i]);

        if (i === 0 && def.fillFirst) {
            // Fill the background shape (circle, heart, etc.)
            ctx.fillStyle = color;
            ctx.fill(path2d);
            ctx.stroke(path2d);
        } else if (i > 0 && def.fillFirst && def.detailColor) {
            // Detail paths use a contrasting color so they're visible on the fill
            ctx.strokeStyle = def.detailColor;
            ctx.stroke(path2d);
            ctx.strokeStyle = color; // restore for any subsequent non-detail paths
        } else {
            ctx.stroke(path2d);
        }
    }

    ctx.restore();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic Phaser texture key from a semantic role and size.
 */
export function getIconTextureKey(icon: GameIconKey, sizePx: number): string {
    return `icon_${icon}_${sizePx}`;
}

/**
 * Ensure a Phaser texture exists for the given gameplay role and size.
 *
 * Looks up the Lucide icon name from game_icons.ts, renders the SVG
 * paths onto an offscreen Canvas via Path2D, and registers the result
 * as a Phaser texture. Fully synchronous — no async loading.
 *
 * @returns The texture key (same value as getIconTextureKey).
 */
export function ensureIconTexture(
    scene: Phaser.Scene,
    icon: GameIconKey,
    sizePx: number,
    color?: string,
): string {
    const key = getIconTextureKey(icon, sizePx);

    // Fast path: already registered
    if (scene.textures.exists(key)) return key;

    const resolvedColor = color ?? GAME_ICON_COLORS[icon] ?? '#ffffff';
    const lucideName = GAME_ICONS[icon];

    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d')!;

    renderLucideIcon(ctx, lucideName, sizePx, resolvedColor);

    scene.textures.addCanvas(key, canvas);
    console.info(`[IconTextureFactory] Created texture: ${key} (${lucideName})`);

    return key;
}
