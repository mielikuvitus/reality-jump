# Scene V1 JSON Schema

> Canonical source: `src/shared/schema/scene_v1.schema.ts`
>
> This document describes the Scene JSON contract between the AI backend
> and the game engine. The Zod schema in the source file above is the
> single source of truth; this document is a human-readable companion.

## Overview

When the user uploads a photo, the backend AI pipeline returns a Scene JSON
object describing detected objects, spawn points, and layout information.
All coordinates are **normalized** (0.0 – 1.0 range). The frontend validates
the response with Zod before Phaser renders anything.

## Top-Level Structure

```json
{
  "version": 1,
  "image": { "w": 4032, "h": 3024 },
  "objects": [ ... ],
  "spawns": { ... },
  "rules": []
}
```

| Field     | Type              | Required | Description                                   |
| --------- | ----------------- | -------- | --------------------------------------------- |
| `version` | `1` (literal)     | Yes      | Schema version, always `1`                    |
| `image`   | `{ w, h }`        | Yes      | Original image dimensions (positive integers) |
| `objects`  | `SceneObject[]`  | No       | Detected objects (max 25, defaults to `[]`)   |
| `spawns`  | `Spawns`          | Yes      | Player, exit, enemy, and pickup positions     |
| `rules`   | `unknown[]`       | No       | Reserved for future rule modifiers            |

## Objects

Each entry in `objects[]` describes a detected real-world item mapped to a
gameplay role.

```json
{
  "id": "plat_1",
  "type": "platform",
  "label": "table",
  "confidence": 0.85,
  "bounds_normalized": { "x": 0.1, "y": 0.6, "w": 0.4, "h": 0.05 },
  "surface_type": "solid",
  "category": "furniture",
  "enemy_spawn_anchor": false,
  "game_mechanics": { "damage_amount": 20 }
}
```

### Object Fields

| Field                | Type      | Required | Description                                                  |
| -------------------- | --------- | -------- | ------------------------------------------------------------ |
| `id`                 | string    | Yes      | Unique identifier (non-empty)                                |
| `type`               | enum      | Yes      | Gameplay role (see below)                                    |
| `label`              | string    | No       | Human-readable description (e.g. "table", "plant")           |
| `confidence`         | 0..1      | No       | AI detection confidence                                      |
| `bounds_normalized`  | object    | Yes      | Bounding box `{ x, y, w, h }` — all values 0..1             |
| `surface_type`       | enum      | No       | `solid`, `bouncy`, `slippery`, `breakable`, `soft`           |
| `category`           | enum      | No       | Real-world category (see below)                              |
| `enemy_spawn_anchor` | boolean   | No       | If `true`, AI recommends spawning an enemy near this object  |
| `game_mechanics`     | object    | No       | Optional mechanics: `damage_amount` (0–50), `speed_multiplier` (0.5–2.0) |

### Object Types

| Type           | Max Count | Description                            |
| -------------- | --------- | -------------------------------------- |
| `platform`     | 12        | Surfaces the player can stand on       |
| `obstacle`     | 8         | Blocking objects                       |
| `collectible`  | 10        | Items the player can pick up           |
| `hazard`       | 8         | Damage-dealing areas                   |
| `enemy`        | 2         | Enemy entities                         |

Maximum total objects: **25**

### Object Categories

| Category    | Description                                     | Enemy Spawn Anchor? |
| ----------- | ----------------------------------------------- | ------------------- |
| `plant`     | Plants, flowers, trees                          | **Yes**             |
| `electric`  | Electronics: laptops, monitors, chargers, lamps | **Yes**             |
| `food`      | Food and drink items                            | No                  |
| `furniture` | Tables, chairs, shelves                         | No                  |
| `other`     | Anything that doesn't fit above                 | No                  |

**Enemy Spawn Anchor Rule:** An object is an enemy spawn anchor if:
- `category` is `"plant"` or `"electric"`, OR
- `enemy_spawn_anchor` is explicitly `true`

The engine uses anchors as candidate positions for enemy spawning. Not every
anchor will necessarily produce an enemy; the engine caps enemy count.

## Spawns

```json
{
  "player": { "x": 0.1, "y": 0.85 },
  "exit":   { "x": 0.9, "y": 0.2 },
  "enemies": [{ "x": 0.5, "y": 0.5, "type": "walker" }],
  "pickups": [{ "x": 0.3, "y": 0.6, "type": "coin" }]
}
```

| Field     | Type                           | Required | Description                      |
| --------- | ------------------------------ | -------- | -------------------------------- |
| `player`  | `{ x, y }`                    | Yes      | Player start position            |
| `exit`    | `{ x, y }`                    | Yes      | Goal/exit position               |
| `enemies` | `{ x, y, type? }[]`           | No       | Enemy positions (defaults to `[]`) |
| `pickups` | `{ x, y, type? }[]`           | No       | Pickup positions (defaults to `[]`) |

### Pickup Types

- `coin` — +1 score
- `health` — +5 score

### Enemy Types

- `walker` — walks horizontally

## Backward Compatibility

All new fields (`category`, `enemy_spawn_anchor`, `game_mechanics`) are
**optional**. JSON from older backends that omits them will validate and run
normally. The engine applies sensible defaults when fields are absent.

## Example: Full Scene with Enemy Anchors

```json
{
  "version": 1,
  "image": { "w": 1024, "h": 768 },
  "objects": [
    {
      "id": "plat_1",
      "type": "platform",
      "label": "table",
      "confidence": 0.95,
      "bounds_normalized": { "x": 0.05, "y": 0.75, "w": 0.4, "h": 0.06 },
      "category": "furniture"
    },
    {
      "id": "obs_plant",
      "type": "obstacle",
      "label": "plant",
      "confidence": 0.92,
      "bounds_normalized": { "x": 0.45, "y": 0.50, "w": 0.08, "h": 0.15 },
      "category": "plant",
      "enemy_spawn_anchor": true
    },
    {
      "id": "obs_laptop",
      "type": "obstacle",
      "label": "laptop",
      "confidence": 0.88,
      "bounds_normalized": { "x": 0.75, "y": 0.48, "w": 0.10, "h": 0.08 },
      "category": "electric",
      "enemy_spawn_anchor": true
    }
  ],
  "spawns": {
    "player": { "x": 0.1, "y": 0.85 },
    "exit": { "x": 0.9, "y": 0.2 },
    "enemies": [{ "x": 0.5, "y": 0.5, "type": "walker" }],
    "pickups": [{ "x": 0.3, "y": 0.6, "type": "coin" }]
  },
  "rules": []
}
```
