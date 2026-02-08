import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import { buildLevel, DetectionResponse } from './levelBuilder';

export const config = {
    maxDuration: 60,
    api: {
        bodyParser: false,
    },
};

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
 * Read raw request body as a Buffer.
 */
function getRawBody(req: VercelRequest): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = req as unknown as Readable;
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

/**
 * Extract the image from a multipart/form-data body.
 * Zero external dependencies — parses the boundary manually.
 */
function extractImageFromMultipart(body: Buffer, contentType: string): { buffer: Buffer; mimetype: string } {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
    if (!boundaryMatch) throw new Error('No multipart boundary found');
    const boundary = boundaryMatch[1] || boundaryMatch[2];

    const bodyStr = body.toString('binary');
    const parts = bodyStr.split(`--${boundary}`);

    for (const part of parts) {
        if (part.trim() === '' || part.trim() === '--') continue;

        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;

        const headers = part.substring(0, headerEnd);
        const content = part.substring(headerEnd + 4);

        if (headers.includes('name="image"') && headers.includes('Content-Type:')) {
            const mimeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
            const mimetype = mimeMatch ? mimeMatch[1].trim() : 'image/jpeg';

            let imageData = content;
            if (imageData.endsWith('\r\n')) {
                imageData = imageData.slice(0, -2);
            }

            return {
                buffer: Buffer.from(imageData, 'binary'),
                mimetype,
            };
        }
    }

    throw new Error('No image field found in multipart body');
}

/**
 * POST /api/scene
 * 1) AI detects objects in the photo
 * 2) Deterministic level builder creates a playable SceneV1
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS headers for deployed domain
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-request-id');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

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
        // Parse multipart body manually (no formidable — avoids CJS/ESM bundler issues)
        const rawBody = await getRawBody(req);
        const contentType = req.headers['content-type'] || '';
        const { buffer, mimetype } = extractImageFromMultipart(rawBody, contentType);
        console.log(`[${timestamp}] request=${requestId} image size=${buffer.length} type=${mimetype}`);

        const base64Image = buffer.toString('base64');
        const dataUrl = `data:${mimetype};base64,${base64Image}`;

        // === AI: Detect objects in the photo ===
        console.log(`[${timestamp}] request=${requestId} sending to GPT-4o for object detection...`);

        // Lazy-import OpenAI inside the handler to avoid crashing at module load
        // if OPENAI_API_KEY is missing from the environment
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI();

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

        // Return scene + AI-generated names + raw AI detections for developer mode
        return res.status(200).json({
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
            return res.status(429).json({ error: 'Rate limited by AI provider. Try again shortly.' });
        }

        return res.status(500).json({
            error: 'AI processing failed',
            details: apiErr.message || 'Unknown error',
        });
    }
}
