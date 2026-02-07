/**
 * OpenAI Vision Service
 * Sends an image to GPT-4o and asks for Scene JSON.
 */

import OpenAI from 'openai';
import { extractJson, validateScene, type SceneV1 } from '../validation/scene';
import { FALLBACK_SCENE } from '../fallback';

// ── OpenAI client (reads OPENAI_API_KEY from env) ────────────

const openai = new OpenAI();

// ── System prompt ────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a computer-vision AI that analyses photos of real environments and converts them into 2D platformer game level descriptions.

OUTPUT FORMAT: Respond with **pure JSON only** — no markdown fences, no explanations, no extra text.

The JSON must follow this exact schema:

{
  "version": 1,
  "image": { "w": <image_width_px>, "h": <image_height_px> },
  "detections": [
    {
      "id": "obj_1",
      "label": "<label>",
      "confidence": <0.0-1.0>,
      "bbox": { "x": <norm>, "y": <norm>, "w": <norm>, "h": <norm> },
      "tags": ["<tag>", ...]
    }
  ],
  "spawns": {
    "player": { "x": <norm>, "y": <norm> },
    "exit":   { "x": <norm>, "y": <norm> },
    "enemies": [ { "type": "<enemy_type>", "x": <norm>, "y": <norm>, "param": { "patrolDx": <norm> } } ],
    "pickups": [ { "type": "coin", "x": <norm>, "y": <norm> } ]
  },
  "surfaces": [
    { "type": "platform", "poly": [ [<norm>,<norm>], [<norm>,<norm>], [<norm>,<norm>], [<norm>,<norm>] ] }
  ],
  "rules": [
    { "id": "<rule_id>", "param": <number> }
  ]
}

COORDINATE RULES:
- All coordinates are **normalized floats between 0.0 and 1.0**.
- Origin is the **top-left** corner of the image.
- x increases to the right; y increases downward.

DETECTION RULES:
- Allowed labels: chair, table, door, window, screen, lamp, plant, shelf, bed, sofa, unknown
- Allowed tags: solid, platform_candidate, hazard_candidate, decor
- Max 30 detections.

SPAWN RULES:
- player spawn: should be near the bottom-left of the scene (high y, low x).
- exit spawn: should be somewhere reachable, ideally upper-right area.
- Enemy types: crawler, hopper. Max 10 enemies.
- Pickup type: coin. Max 20 pickups. Place them on or near platforms.

SURFACE RULES:
- Create platforms from detected flat surfaces (table tops, shelves, floor lines, etc.).
- Each surface is a polygon with at least 4 [x,y] points (typically a rectangle).
- Always include a ground platform near the bottom (y ≈ 0.88-0.95).
- Max 20 surfaces.

RULE MODIFIERS:
- Optionally suggest 1-3 rule modifiers based on scene mood.
- Allowed rule IDs: "gravity multiplier", "speed multiplier"
- dark/moody scene → { "id": "gravity multiplier", "param": 0.7 }
- bright/energetic scene → { "id": "speed multiplier", "param": 1.3 }
- Keep param values between 0.5 and 2.0.

IMPORTANT: Make the level fun and playable. Ensure platforms are reachable by jumping. Place coins to guide the player toward the exit.`;

// ── Repair prompt (appended on retry) ────────────────────────

function buildRepairPrompt(errors: string[]): string {
    return `Your previous JSON response had validation errors:
${errors.map((e) => `  - ${e}`).join('\n')}

Please fix these issues and return corrected JSON only. Keep all the same data but fix the errors listed above. Remember:
- "version" must be exactly 1
- "spawns.player" and "spawns.exit" are required objects with x and y
- All coordinate values must be numbers between 0.0 and 1.0`;
}

// ── Main API call ────────────────────────────────────────────

export interface VisionResult {
    scene: SceneV1;
    source: 'ai' | 'ai_repaired' | 'fallback';
    durationMs: number;
}

/**
 * Send an image to GPT-4o vision and return validated Scene JSON.
 *
 * Flow:
 * 1. Call GPT-4o with the image
 * 2. Parse & validate the response
 * 3. If invalid → one repair attempt
 * 4. If still invalid → return fallback
 */
export async function analyzeImage(
    imageBase64: string,
    mimeType: string = 'image/jpeg',
    imageWidth: number = 1024,
    imageHeight: number = 768,
): Promise<VisionResult> {

    const t0 = Date.now();

    // ── First attempt ────────────────────────────────────────
    let rawText: string;
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 4096,
            temperature: 0.4,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${imageBase64}`,
                                detail: 'low',     // cheaper & faster
                            },
                        },
                        {
                            type: 'text',
                            text: `Analyze this photo and generate a platformer level. The image dimensions are ${imageWidth}×${imageHeight}px.`,
                        },
                    ],
                },
            ],
        });

        rawText = response.choices[0]?.message?.content ?? '';
    } catch (err: any) {
        console.error('[vision] OpenAI API error:', err?.message ?? err);
        return { scene: FALLBACK_SCENE, source: 'fallback', durationMs: Date.now() - t0 };
    }

    console.log('[vision] Raw AI response length:', rawText.length);

    // ── Parse first attempt ──────────────────────────────────
    let parsed: unknown;
    try {
        parsed = JSON.parse(extractJson(rawText));
    } catch {
        console.warn('[vision] Failed to parse JSON from first attempt');
        parsed = null;
    }

    if (parsed) {
        const v = validateScene(parsed);
        if (v.ok) {
            console.log('[vision] First attempt valid ✓');
            return { scene: v.scene, source: 'ai', durationMs: Date.now() - t0 };
        }
        console.warn('[vision] First attempt invalid:', v.errors);

        // ── Repair attempt ───────────────────────────────────
        try {
            const repairResponse = await openai.chat.completions.create({
                model: 'gpt-4o',
                max_tokens: 4096,
                temperature: 0.2,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${mimeType};base64,${imageBase64}`,
                                    detail: 'low',
                                },
                            },
                            {
                                type: 'text',
                                text: `Analyze this photo and generate a platformer level. The image dimensions are ${imageWidth}×${imageHeight}px.`,
                            },
                        ],
                    },
                    { role: 'assistant', content: rawText },
                    { role: 'user', content: buildRepairPrompt(v.errors) },
                ],
            });

            const repairText = repairResponse.choices[0]?.message?.content ?? '';
            const repairParsed = JSON.parse(extractJson(repairText));
            const rv = validateScene(repairParsed);

            if (rv.ok) {
                console.log('[vision] Repair attempt valid ✓');
                return { scene: rv.scene, source: 'ai_repaired', durationMs: Date.now() - t0 };
            }

            console.warn('[vision] Repair also invalid:', rv.errors);
        } catch (err: any) {
            console.error('[vision] Repair attempt error:', err?.message ?? err);
        }
    }

    // ── Fallback ─────────────────────────────────────────────
    console.warn('[vision] Returning fallback scene');
    return { scene: FALLBACK_SCENE, source: 'fallback', durationMs: Date.now() - t0 };
}
