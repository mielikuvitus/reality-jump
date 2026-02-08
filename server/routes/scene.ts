import { Router, Request, Response } from 'express';
import multer from 'multer';
import OpenAI from 'openai';

const openai = new OpenAI(); // reads OPENAI_API_KEY from env

// Configure multer to store files in memory (no disk storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
    fileFilter: (_req, file, cb) => {
        // Accept only image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    },
});

export const sceneRouter = Router();

// Pass 1: Describe the image — what objects are where
const DESCRIBE_PROMPT = `You are a precise visual analyst. Study this photo carefully.

List EVERY distinct object you can see. For EACH object, provide:
1. What it is (e.g. "wooden table", "laptop", "potted plant")
2. Its approximate position as a fraction of the image (0.0-1.0 for both x and y, where 0,0 is top-left)
3. Its approximate width and height as a fraction of the image
4. Whether its TOP SURFACE is flat/horizontal (could someone stand on it?)

Focus especially on:
- Flat horizontal surfaces at different heights (tables, shelves, window sills, books, boxes) — these become PLATFORMS
- Small items (cups, bottles, fruit, pens, toys) — these become COLLECTIBLES
- Potentially dangerous items (sharp edges, electronics, hot surfaces) — these become HAZARDS
- Large blocking items (chairs, bags, bins) — these become OBSTACLES
- Plants and electronics — these are ENEMY SPAWN points

Format your response as a numbered list. Be precise about positions.`;

// Pass 2: Convert the description into game JSON
const GENERATE_PROMPT = `You are a game level designer for a 2D side-scrolling platformer called Reality Jump.

You will receive a description of objects detected in a photo. Convert this into a playable platformer level.

GAME DESIGN PRINCIPLES:
- The player starts bottom-left and must reach an exit at top-right
- Create a path of platforms the player can JUMP between to reach the exit
- Platforms should be at DIFFERENT HEIGHTS creating a staircase-like path upward
- Space platforms so the player can reach them with jumps (vertical gap ~0.10-0.20, horizontal gap ~0.15-0.30)
- Place collectibles along the path to reward exploration
- Place 1-2 enemies on wider platforms for challenge

Return ONLY valid JSON (no markdown, no backticks, no explanation):

{
  "version": 1,
  "image": { "w": 1280, "h": 720 },
  "objects": [
    {
      "id": "<unique_string>",
      "type": "platform" | "obstacle" | "collectible" | "hazard",
      "label": "<what the real-world object is>",
      "confidence": <0.0-1.0>,
      "bounds_normalized": { "x": <0.0-1.0>, "y": <0.0-1.0>, "w": <0.0-1.0>, "h": <0.0-1.0> },
      "surface_type": "solid" | "soft",
      "category": "furniture" | "food" | "plant" | "electric" | "other",
      "enemy_spawn_anchor": <boolean>
    }
  ],
  "spawns": {
    "player": { "x": <0.0-1.0>, "y": <0.0-1.0> },
    "exit": { "x": <0.0-1.0>, "y": <0.0-1.0> },
    "enemies": [{ "x": <0.0-1.0>, "y": <0.0-1.0>, "type": "walker" }],
    "pickups": [{ "x": <0.0-1.0>, "y": <0.0-1.0>, "type": "coin" | "health" }]
  },
  "rules": []
}

COORDINATE RULES:
- ALL coordinates normalized 0.0-1.0
- bounds_normalized: x,y is the TOP-LEFT corner
- Platform "h" MUST be thin: 0.02-0.06 (top walking surface only)
- y-axis goes DOWN: y=0.0 is TOP, y=1.0 is BOTTOM

PLATFORM LAYOUT (most important):
- You MUST create a jumpable path from bottom-left to top-right
- LOWEST platform around y=0.80-0.85 (near bottom)
- HIGHEST platform around y=0.15-0.25 (near top, where exit goes)
- Create 4-8 platforms at STAGGERED heights between these
- Each platform must be reachable from at least one other platform
- Minimum platform width: 0.10, typical: 0.15-0.35

OBJECT LIMITS:
- Max 25 total (12 platforms, 8 obstacles, 10 collectibles, 8 hazards)
- MUST have at least 4 platforms
- Unique ids: "plat_1", "obs_1", "col_1", "haz_1"

CATEGORY & ENEMY ANCHORS:
- enemy_spawn_anchor: true for "plant" or "electric" categories

SPAWN RULES:
- Player: bottom-left (x: 0.05-0.15, y: 0.75-0.85) ON a platform
- Exit: top-right (x: 0.80-0.95, y: 0.10-0.25) ON a platform
- 1-2 enemies "walker" ON wider platforms
- 3-8 pickups (mix "coin"/"health") ON platforms

CRITICAL: Level MUST be playable — player must be able to jump platform-to-platform from spawn to exit. Return ONLY JSON.`;

/**
 * POST /api/scene
 * Accepts multipart/form-data with an "image" field
 * Two-pass AI: 1) Describe image → 2) Generate level JSON
 */
sceneRouter.post('/', upload.single('image'), async (req: Request, res: Response) => {
    const file = req.file;
    const requestId = req.headers['x-request-id'] || 'no-request-id';
    const timestamp = new Date().toISOString();

    if (!file) {
        console.log(`[${timestamp}] request=${requestId} error=no_image`);
        res.status(400).json({
            error: 'No image file provided',
            hint: 'Send a multipart/form-data request with field name "image"',
        });
        return;
    }

    console.log(`[${timestamp}] request=${requestId} received image size=${file.size} type=${file.mimetype}`);

    try {
        const base64Image = file.buffer.toString('base64');
        const mimeType = file.mimetype || 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64Image}`;

        // === PASS 1: Describe the image ===
        console.log(`[${timestamp}] request=${requestId} Pass 1: describing image...`);

        const describeResult = await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 1500,
            temperature: 0.2,
            messages: [
                { role: 'system', content: DESCRIBE_PROMPT },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Describe all objects in this photo with their positions.' },
                        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
                    ],
                },
            ],
        });

        const description = describeResult.choices?.[0]?.message?.content;
        if (!description) {
            console.error(`[${timestamp}] request=${requestId} Pass 1: empty response`);
            res.status(502).json({ error: 'AI returned empty description' });
            return;
        }

        console.log(`[${timestamp}] request=${requestId} Pass 1 done (${description.length} chars)`);

        // === PASS 2: Generate level JSON from description ===
        console.log(`[${timestamp}] request=${requestId} Pass 2: generating level...`);

        const generateResult = await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 2500,
            temperature: 0.3,
            messages: [
                { role: 'system', content: GENERATE_PROMPT },
                {
                    role: 'user',
                    content: `Here are the objects detected in the photo:\n\n${description}\n\nGenerate a playable platformer level JSON based on these objects.`,
                },
            ],
        });

        const raw = generateResult.choices?.[0]?.message?.content;
        if (!raw) {
            console.error(`[${timestamp}] request=${requestId} Pass 2: empty response`);
            res.status(502).json({ error: 'AI returned empty level data' });
            return;
        }

        console.log(`[${timestamp}] request=${requestId} Pass 2 done (${raw.length} chars)`);

        // Strip markdown fences if present
        let cleaned = raw.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '');
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(cleaned);
        } catch (parseErr) {
            console.error(`[${timestamp}] request=${requestId} JSON parse error:`, parseErr);
            console.error(`[${timestamp}] request=${requestId} raw:`, raw);
            res.status(502).json({
                error: 'AI returned invalid JSON',
                details: parseErr instanceof Error ? parseErr.message : 'Unknown parse error',
                raw: raw.substring(0, 500),
            });
            return;
        }

        console.log(`[${timestamp}] request=${requestId} response sent status=200`);
        res.json(parsed);

    } catch (err: unknown) {
        const apiErr = err as { status?: number; message?: string };
        console.error(`[${timestamp}] request=${requestId} OpenAI error:`, apiErr.message || err);

        if (apiErr.status === 429) {
            res.status(429).json({ error: 'Rate limited by AI provider. Try again shortly.' });
            return;
        }

        res.status(500).json({
            error: 'AI processing failed',
            details: apiErr.message || 'Unknown error',
        });
    }
});

// Error handling middleware for multer errors
sceneRouter.use((err: Error, _req: Request, res: Response, _next: Function) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
            return;
        }
        res.status(400).json({ error: err.message });
        return;
    }
    
    if (err.message === 'Only image files are allowed') {
        res.status(415).json({ error: err.message });
        return;
    }

    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
