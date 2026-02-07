/**
 * GAME ICON REGISTRY
 * ===================
 *
 * Edit this file to change which icons are used for gameplay sprites.
 *
 * This is the ONLY source of truth for which Lucide icons represent
 * gameplay entities. All Phaser scenes and factories resolve icon
 * names through this registry — never via hardcoded Lucide names.
 *
 * To swap an icon: change the Lucide icon name string in GAME_ICONS.
 * To change a sprite colour: update GAME_ICON_COLORS.
 */

/** Semantic roles that can appear as Phaser sprites. */
export type GameIconKey = 'player' | 'enemy' | 'exit' | 'coin' | 'health';

/**
 * Maps each gameplay role to a Lucide icon name.
 * The texture factory resolves these names to SVG path data at runtime.
 */
export const GAME_ICONS: Record<GameIconKey, string> = {
    player: 'User',
    enemy:  'Angry',
    exit:   'Flag',
    coin:   'CirclePoundSterling',
    health: 'Heart',
};

/**
 * Default stroke colour for each role.
 * Factories may override this when calling ensureIconTexture().
 */
export const GAME_ICON_COLORS: Record<GameIconKey, string> = {
    player: '#22d3ee',
    enemy:  '#ef4444',
    exit:   '#fbbf24',
    coin:   '#fbbf24',
    health: '#ef4444',
};
