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
export type GameIconKey =
    | 'player' | 'enemy' | 'exit' | 'coin' | 'health'
    | 'platform_solid' | 'platform_soft' | 'platform_bouncy'
    | 'platform_slippery' | 'platform_breakable';

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

    platform_solid:     'SquareSquare',
    platform_soft:      'SquareArrowDown',
    platform_bouncy:    'SquareActivity',
    platform_slippery:  'SquareCode',
    platform_breakable: 'SquareX',
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

    platform_solid:     '#4ade80',
    platform_soft:      '#c084fc',
    platform_bouncy:    '#fbbf24',
    platform_slippery:  '#38bdf8',
    platform_breakable: '#f87171',
};
