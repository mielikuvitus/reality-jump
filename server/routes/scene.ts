import { Router, Request, Response } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { buildLevel, DetectionResponse } from '../levelBuilder';

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

// AI prompt: detection + name generation
const DETECTION_PROMPT = `You are an object detection AI. You receive a photo and detect objects in it.

RESPOND WITH ONLY VALID JSON — no markdown, no backticks, no explanation.

Detect objects visible in the photo. For each object, return its label, category, confidence, and bounding box in normalized coordinates (0.0 to 1.0 relative to image dimensions).

Also generate:
1. A fun player name in the format "adjective-adjective-noun" (noun must be a nature thing or animal)
2. A creative level name inspired by what you see in the photo (2-4 words, title case)

{
  "image": { "w": <estimated_width>, "h": <estimated_height> },
  "player_name": "<adjective-adjective-noun>",
  "level_name": "<creative level name based on photo>",
  "detections": [
    {
      "label": "<what the object is>",
      "category": "furniture | food | plant | electric | other",
      "confidence": <0.0-1.0>,
      "bounds_normalized": { "x": <left>, "y": <top>, "w": <width>, "h": <height> }
    }
  ]
}

RULES:
- bounds_normalized: x,y is the top-left corner. w,h is width and height as fraction of image.
- Detect ALL visible objects: tables, chairs, books, cups, plants, screens, cables, boxes, shelves, food, etc.
- Estimate image dimensions from typical phone photos (e.g. 4032x3024). If unsure use 1280x720.
- Return up to 15 detections, prioritizing larger and more distinct objects.
- Be accurate with bounding boxes — they should tightly fit the object.
- category must be one of: furniture, food, plant, electric, other.
- Prefer detecting flat horizontal surfaces (tables, shelves, counters, desks, books, window sills) — these are the most important objects.
- player_name: always lowercase with hyphens, family-friendly. Use fun adjectives and an animal or nature noun. Examples: "brave-sparkly-penguin", "fuzzy-cosmic-otter", "cheerful-mighty-fox".
- level_name: a short creative title inspired by the scene in the photo. Family-friendly, title case. Examples: "Kitchen Quest", "Sunny Garden Dash", "Cozy Bookshelf Canyon".`;

/**
 * POST /api/scene
 * Accepts multipart/form-data with an "image" field
 * 1) AI detects objects in the photo
 * 2) Deterministic level builder creates a playable SceneV1
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

        // === AI: Detect objects in the photo ===
        console.log(`[${timestamp}] request=${requestId} sending to GPT-4o for object detection...`);

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 1500,
            temperature: 0.2,
            messages: [
                { role: 'system', content: DETECTION_PROMPT },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Detect all objects in this photo.' },
                        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
                    ],
                },
            ],
        });

        const raw = completion.choices?.[0]?.message?.content;
        if (!raw) {
            console.error(`[${timestamp}] request=${requestId} empty AI response`);
            res.status(502).json({ error: 'Empty response from AI' });
            return;
        }

        console.log(`[${timestamp}] request=${requestId} AI detection done (${raw.length} chars)`);

        // Strip markdown fences if present
        let cleaned = raw.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '');
        }

        let detections: DetectionResponse;
        try {
            detections = JSON.parse(cleaned) as DetectionResponse;
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

        // Validate detections structure minimally
        if (!detections.image || !Array.isArray(detections.detections)) {
            console.error(`[${timestamp}] request=${requestId} invalid detection structure`);
            res.status(502).json({ error: 'AI returned unexpected structure' });
            return;
        }

        console.log(`[${timestamp}] request=${requestId} detected ${detections.detections.length} objects, building level...`);

        // === Deterministic level builder ===
        const scene = buildLevel(detections);

        console.log(`[${timestamp}] request=${requestId} level built: ${scene.objects.length} objects, ${scene.spawns.pickups.length} pickups, ${scene.spawns.enemies.length} enemies`);

        // Return scene + AI-generated names + raw AI detections for developer mode
        res.json({
            ...scene,
            player_name: detections.player_name || 'happy-little-adventurer',
            level_name: detections.level_name || 'Mystery Level',
            _debug: {
                raw_ai_response: cleaned,
                detections,
            },
        });

    } catch (err: unknown) {
        const apiErr = err as { status?: number; message?: string };
        console.error(`[${timestamp}] request=${requestId} error:`, apiErr.message || err);

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
