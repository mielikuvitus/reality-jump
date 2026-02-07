/**
 * @deprecated — Import from './scene_v1.schema' instead.
 *
 * This barrel file exists only for backward compatibility.
 * The canonical schema module is scene_v1.schema.ts.
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
