import type { VercelRequest, VercelResponse } from '@vercel/node';
import formidable from 'formidable';
import { readFileSync } from 'fs';
import OpenAI from 'openai';
import { buildLevel, DetectionResponse } from '../server/levelBuilder';

const openai = new OpenAI(); // reads OPENAI_API_KEY from env

export const config = {
    maxDuration: 60, // seconds — Hobby plan caps at 10s, Pro allows up to 60s
    api: {
        bodyParser: false, // disable body parsing so formidable can handle multipart
    },
};

// AI prompt: detection ONLY — no gameplay decisions
const DETECTION_PROMPT = `You are an object detection AI. You receive a photo and detect objects in it.

RESPOND WITH ONLY VALID JSON — no markdown, no backticks, no explanation.

Detect objects visible in the photo. For each object, return its label, category, confidence, and bounding box in normalized coordinates (0.0 to 1.0 relative to image dimensions).

{
  "image": { "w": <estimated_width>, "h": <estimated_height> },
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
- Prefer detecting flat horizontal surfaces (tables, shelves, counters, desks, books, window sills) — these are the most important objects.`;

function parseMultipart(req: VercelRequest): Promise<{ buffer: Buffer; mimetype: string }> {
    return new Promise((resolve, reject) => {
        // Handle formidable v3 CJS/ESM interop — bundlers may wrap the default export
        const makeForm = typeof formidable === 'function'
            ? formidable
            : (formidable as any).default ?? (formidable as any).formidable;

        const form = makeForm({
            maxFileSize: 10 * 1024 * 1024,
            filter: (part) => part.mimetype?.startsWith('image/') ?? false,
        });

        form.parse(req, (err, _fields, files) => {
            if (err) return reject(err);

            const uploaded = files.image;
            if (!uploaded) return reject(new Error('No image field'));

            const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
            if (!file) return reject(new Error('No image file'));

            const buffer = readFileSync(file.filepath);
            resolve({ buffer, mimetype: file.mimetype || 'image/jpeg' });
        });
    });
}

/**
 * POST /api/scene
 * 1) AI detects objects in the photo
 * 2) Deterministic level builder creates a playable SceneV1
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY is not set in environment variables');
        return res.status(500).json({ error: 'Server misconfiguration: missing OPENAI_API_KEY' });
    }

    const requestId = (req.headers['x-request-id'] as string) || 'no-request-id';
    const timestamp = new Date().toISOString();

    try {
        const { buffer, mimetype } = await parseMultipart(req);
        console.log(`[${timestamp}] request=${requestId} image size=${buffer.length} type=${mimetype}`);

        const base64Image = buffer.toString('base64');
        const dataUrl = `data:${mimetype};base64,${base64Image}`;

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
                        { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
                    ],
                },
            ],
        });

        const raw = completion.choices?.[0]?.message?.content;
        if (!raw) {
            console.error(`[${timestamp}] request=${requestId} empty AI response`);
            return res.status(502).json({ error: 'Empty response from AI' });
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
            return res.status(502).json({
                error: 'AI returned invalid JSON',
                details: parseErr instanceof Error ? parseErr.message : 'Unknown parse error',
                raw: raw.substring(0, 500),
            });
        }

        if (!detections.image || !Array.isArray(detections.detections)) {
            console.error(`[${timestamp}] request=${requestId} invalid detection structure`);
            return res.status(502).json({ error: 'AI returned unexpected structure' });
        }

        console.log(`[${timestamp}] request=${requestId} detected ${detections.detections.length} objects, building level...`);

        // === Deterministic level builder ===
        const scene = buildLevel(detections);

        console.log(`[${timestamp}] request=${requestId} level built: ${scene.objects.length} objects, ${scene.spawns.pickups.length} pickups, ${scene.spawns.enemies.length} enemies`);
        return res.status(200).json(scene);

    } catch (err: unknown) {
        const apiErr = err as { status?: number; message?: string };
        console.error(`[${timestamp}] request=${requestId} error:`, apiErr.message || err);

        if (apiErr.status === 429) {
            return res.status(429).json({ error: 'Rate limited by AI provider. Try again shortly.' });
        }

        return res.status(500).json({
            error: 'AI processing failed',
            details: apiErr.message || 'Unknown error',
        });
    }
}
