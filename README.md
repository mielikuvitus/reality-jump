# Reality Jump - Photo to Platformer Game

A mobile browser game that converts real-world photos into playable platformer levels using AI-powered scene generation. Take a photo of your surroundings and watch it transform into a game level where tables become platforms, fruits become collectibles, and everyday objects become obstacles.

Built with React, TypeScript, Phaser 3, and Vite.

## How It Works

```
User takes a photo on mobile
    ↓
Photo is compressed and uploaded to backend
    ↓
AI analyzes the image: detects objects, surfaces, and layout
    ↓
Returns Scene JSON with normalized coordinates + game roles
    (e.g. table edge → platform, apple → collectible, candle → hazard)
    ↓
Zod validates the response against the SceneV1 schema
    ↓
Preview screen shows detected objects overlaid on the photo
    ↓
Phaser 3 generates a playable platformer level:
  - Platforms placed at detected object coordinates
  - Pickups and exit spawned from AI-determined locations
  - Adaptive physics tuned to the level geometry
    ↓
Player reaches the exit flag → Win!
```

## Current Status

**Playable end-to-end.** The full loop works: capture a photo, upload it, preview the detected objects, and play a platformer level generated from the photo.

**Implemented:**

- Photo capture and compression on mobile
- Backend upload with request tracing
- Zod schema validation of AI responses
- Level preview with debug overlays
- Platformer gameplay with physics, pickups, scoring, and win condition
- Mobile touch controls + keyboard support
- Adaptive jump height based on level geometry
- Runtime icon generation (no external game assets needed)

**Not yet implemented:**

- Obstacle collision
- ECS-style systems (files exist as stubs)
- Real AI integration (backend returns hardcoded scene data)

## Quick Start

```bash
# Install dependencies
npm install

# Run frontend only (with mock data for testing)
npm run dev

# Run frontend + backend together
npm run dev:all
```

Open on mobile: Check terminal for `Network:` URL (e.g., `http://192.168.1.x:8080`)

## Available Commands

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `npm install`       | Install project dependencies       |
| `npm run dev`       | Launch frontend dev server         |
| `npm run dev:all`   | Launch frontend + backend together |
| `npm run server`    | Launch backend only (port 3001)    |
| `npm run build`     | Create production build            |
| `npm run test`      | Run tests (Vitest)                 |
| `npm run test:watch` | Run tests in watch mode           |

## Game Flow

1. **Capture** - User takes a photo using the mobile camera
2. **Upload** - Photo is compressed (max 1024px, JPEG 0.75) and sent to the backend
3. **Validate** - Backend response is validated against the Zod SceneV1 schema
4. **Preview** - Detected objects are shown overlaid on the photo with color-coded bounding boxes
5. **Play** - Phaser creates a platformer level; player navigates platforms, collects pickups, avoids enemies, reaches the exit
6. **Win/Lose** - Win by reaching the exit flag. Lose if health reaches 0. Score screen with options to replay or take a new photo

## Project Structure

### UI Layer (React)

| Path | Description |
| --- | --- |
| `src/App.tsx` | Root component, renders CaptureAndUploadScreen |
| `src/ui/CaptureAndUploadScreen.tsx` | Orchestrates the capture → upload flow |
| `src/ui/CaptureScreen.tsx` | Photo capture interface |
| `src/ui/CameraCapture.tsx` | Mobile camera access + image compression |
| `src/ui/UploadFlow.tsx` | Upload state machine (idle → loading → success/error) |
| `src/ui/PreviewScreen.tsx` | Level preview with debug toggle overlay |
| `src/ui/PlayScreen.tsx` | Gameplay screen with score display |
| `src/ui/MobileControls.tsx` | Touch-friendly left/right/jump buttons |
| `src/ui/WinOverlay.tsx` | Victory screen with score and replay options |
| `src/ui/ValidationErrorScreen.tsx` | Displays Zod validation errors |
| `src/ui/GameContainer.tsx` | Wraps the Phaser game instance |
| `src/ui/screens/` | Loading, Success, Error screen components |

### Game Engine (Phaser 3)

| Path | Description |
| --- | --- |
| `src/game/scenes/GameScene.ts` | Main gameplay scene - physics, player, platforms, pickups, exit |
| `src/game/scenes/PreviewScene.ts` | Preview scene - renders debug overlays on photo |
| `src/game/factories/PlatformFactory.ts` | Creates static platform zones from scene data |
| `src/game/factories/PlayerFactory.ts` | Creates the player sprite with collision body |
| `src/game/factories/PickupFactory.ts` | Creates coin and health pickup sprites |
| `src/game/factories/ExitFactory.ts` | Creates the exit flag goal sprite |
| `src/game/factories/EnemyFactory.ts` | Creates enemy sprites from spawn data |
| `src/game/assets/IconTextureFactory.ts` | Runtime Canvas-based sprite generation (no external assets) |
| `src/game/assets/lucide_icon_map.ts` | SVG path data for game icons |
| `src/game/physics/PhysicsConfig.ts` | Adaptive physics calculations (jump height, speed) |
| `src/game/physics/CollisionLayers.ts` | Collision layer definitions |
| `src/game/input/InputState.ts` | Shared input state between React and Phaser |
| `src/game/utils/coords.ts` | Normalized → world coordinate conversion |
| `src/game/debug/DebugOverlay.ts` | Debug bounding box and spawn marker rendering |
| `src/game/debug/DebugRenderer.ts` | Debug rendering utilities |
| `src/game/events/EventBus.ts` | React ↔ Phaser event bridge |
| `src/game/events/GameEvents.ts` | Game event type definitions |

### Shared Schema & Types

| Path | Description |
| --- | --- |
| `src/shared/schema/scene_v1.schema.ts` | **Single source of truth:** Zod schema, TS types, parse helper, enemy anchor helpers |
| `src/shared/schema/scene_v1.types.ts` | Re-export shim (backward compat) — delegates to schema.ts |
| `src/shared/schema/SceneV1.ts` | Re-export shim (backward compat) — delegates to schema.ts |
| `src/shared/schema/scene_v1.schema.test.ts` | Schema validation tests |
| `src/shared/types/` | Type stubs (Detection, RuleModifier, Spawn, Surface) |

### Services

| Path | Description |
| --- | --- |
| `src/services/ai_proxy_service.ts` | Backend API client (`uploadImageForScene`) |
| `src/services/image_processing_service.ts` | Image downscaling (max 1024px, JPEG 0.75) |
| `src/services/request_trace.ts` | Request ID generation for cross-service logging |

### Backend (Express)

| Path | Description |
| --- | --- |
| `server/index.ts` | Express server (port 3001), CORS, health check |
| `server/routes/scene.ts` | `POST /api/scene` - multipart upload, returns hardcoded scene JSON |
| `server/tsconfig.json` | Backend TypeScript config |

### Stub Files (Planned Architecture)

These files exist but are currently empty, representing planned ECS-style systems:

| Path | Description |
| --- | --- |
| `src/game/systems/` | CollisionSystem, EnemySystem, MovementSystem, RuleModifiersSystem, SpawnSystem |
| `src/game/entities/` | Player, Enemy, Pickup entity classes |
| `src/game/generation/` | SceneGenerator, PlatformDeriver, SeededRng |
| `src/game/state/` | GameStateMachine |
| `src/game/controllers/` | GameFlowController |
| `src/game/scenes/` (stubs) | BootScene, CaptureScene, GenerateScene, EndScene, PlayScene |

### Documentation

| Path | Description |
| --- | --- |
| `docs/ai_scene_schema.md` | Scene V1 JSON schema documentation |
| `docs/backend_contract.md` | API specification for backend team |
| `docs/testing_upload.md` | Testing guide with curl examples |

## Scene Data Format (SceneV1)

> **Full schema documentation:** [`docs/ai_scene_schema.md`](docs/ai_scene_schema.md)
>
> **Canonical source:** `src/shared/schema/scene_v1.schema.ts`

The AI returns a JSON object describing detected objects and spawn points. All coordinates are **normalized** (0.0 to 1.0).

### Schema Structure

```json
{
  "version": 1,
  "image": { "w": 4032, "h": 3024 },
  "objects": [
    {
      "id": "table_01",
      "type": "platform",
      "label": "table",
      "confidence": 0.85,
      "bounds_normalized": { "x": 0.1, "y": 0.6, "w": 0.4, "h": 0.05 },
      "surface_type": "solid",
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
    }
  ],
  "spawns": {
    "player": { "x": 0.1, "y": 0.5 },
    "exit": { "x": 0.9, "y": 0.3 },
    "enemies": [{ "x": 0.5, "y": 0.5, "type": "walker" }],
    "pickups": [{ "x": 0.5, "y": 0.4, "type": "coin" }]
  },
  "rules": []
}
```

### Object Types & Caps

| Type | Max Count | Description |
| --- | --- | --- |
| `platform` | 12 | Surfaces the player can stand on |
| `obstacle` | 8 | Blocking objects |
| `collectible` | 10 | Items the player can pick up |
| `hazard` | 8 | Damage-dealing areas |
| `enemy` | 2 | Enemy entities |

Maximum total objects: **25**

### Object Categories

| Category | Enemy Spawn Anchor? |
| --- | --- |
| `plant` | Yes |
| `electric` | Yes |
| `food` | No |
| `furniture` | No |
| `other` | No |

Objects with `category: "plant"` or `"electric"` (or explicit `enemy_spawn_anchor: true`) are treated as candidate enemy spawn positions.

### Surface Types

`solid`, `bouncy`, `slippery`, `breakable`

### Pickup Types

`coin` (+1 score), `health` (+5 score)

### Health System

- Player starts with **10 HP**
- Enemy contact deals **2 damage** (with 1 second invulnerability cooldown)
- Health reaches 0 → Game Over
- HP displayed in header next to score (turns red when low)

## For Backend Developer

**Start here:** `docs/backend_contract.md`

### Quick Test

```bash
# Start backend
npm run server

# Test endpoint
curl -i -X POST "http://localhost:3001/api/scene" \
  -H "x-request-id: req_TEST" \
  -F "image=@photo.jpg"
```

### Backend Files

```
server/
├── index.ts              # Express server setup (port 3001)
├── routes/scene.ts       # POST /api/scene (hardcoded response, replace with AI)
└── tsconfig.json

docs/
├── backend_contract.md   # API spec (START HERE)
└── testing_upload.md     # Testing guide

src/services/
└── ai_proxy_service.ts   # Frontend client (shows expected API format)
```

### Endpoint Details

- **Endpoint:** `POST /api/scene`
- **Content-Type:** `multipart/form-data`
- **Field:** `image` (max 10MB, image/* only)
- **Header:** `x-request-id` (optional, for tracing)
- **Response:** SceneV1 JSON or error JSON
- **CORS:** `localhost:5173`, `localhost:8080`

## Key Architecture Decisions

### Runtime Icon Generation

Game sprites (player, exit, coin, health) are generated at runtime using the Canvas 2D API. No external image assets are needed for gameplay -- the `IconTextureFactory` draws shapes programmatically and caches them in Phaser's texture manager.

### Adaptive Physics

Jump height automatically adapts to the level geometry. The engine analyzes the largest vertical gap between platforms and sets jump height to clear it with a 15% margin (clamped between 15-45% of world height). This ensures every generated level is completable.

### Normalized Coordinates

All positions from the AI use normalized coordinates (0.0 to 1.0). The game world matches the photo's aspect ratio, and `coords.ts` converts normalized values to world pixels. This makes levels work at any resolution.

### React ↔ Phaser Bridge

An `EventBus` (Phaser EventEmitter) bridges React and Phaser. Mobile controls write to a shared `InputState` object that Phaser reads each frame. Game events (`game-won`, `game-lost`, `score-update`, `health-update`, `toggle-debug`) flow from Phaser to React.

### Schema Validation

All backend responses are validated with Zod before reaching the game engine. Invalid data shows a `ValidationErrorScreen` with specific errors rather than crashing.

## Dev Panel (Development Mode)

A floating panel appears in the bottom-right corner during development:

| Toggle | Description |
| --- | --- |
| **Demo Random** | 50/50 chance of fake error after real success (test error UI) |
| **Mock Fallback** | Try backend first, fall back to mock data on error |
| **Mock Mode** | Skip backend entirely, always return mock data |
| **Image Info** | Show compression stats after photo capture |

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 19, TypeScript 5.7, Vite 6.3 |
| **Game Engine** | Phaser 3.90 (Arcade Physics) |
| **Validation** | Zod |
| **Backend** | Express, Multer (multipart uploads) |
| **Testing** | Vitest |
| **Styling** | Vanilla CSS with glassmorphism |
| **Icons** | Lucide React (UI), Canvas-drawn (game) |

---

## Phaser Template Reference

This project was bootstrapped from the [Phaser React TypeScript template](https://github.com/phaserjs/template-react-ts).

### React Bridge

`PhaserGame.tsx` initializes the Phaser game and bridges events between React and Phaser via `EventBus`.

### Handling Assets

Static files go in `public/assets`. Imported files are bundled by Vite:

```js
import logoImg from "./assets/logo.png";
```

### Deploying to Production

```bash
npm run build
# Upload contents of dist/ to your web server
```

### About log.js

`log.js` sends anonymous usage data to Phaser Studio. To disable, use `npm run dev-nolog` or delete `log.js`.

### Phaser Community

[phaser.io](https://phaser.io) | [Discord](https://discord.gg/phaser) | [Docs](https://newdocs.phaser.io)
