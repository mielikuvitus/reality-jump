/**
 * SCENE V1 TYPES  —  Re-export shim
 * ====================================
 *
 * All types are now defined in scene_v1.schema.ts (single source of truth).
 * This file re-exports them for backward compatibility so existing imports
 * continue to work without modification.
 *
 * For new code, import directly from './scene_v1.schema'.
 */

export type {
    SceneV1,
    SceneObject,
    SceneObjectType,
    SceneObjectCategory,
    BoundsNormalized,
    SceneSpawns,
    GameMechanics,
    NormalizedPoint,
} from './scene_v1.schema';

export {
    SceneV1Schema,
    parseSceneV1,
    validateCaps,
    isEnemySpawnAnchor,
    getEnemySpawnAnchors,
} from './scene_v1.schema';
