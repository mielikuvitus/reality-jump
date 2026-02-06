const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string;
const API_URL = 'https://api.openai.com/v1/chat/completions';

import npcConfig from './npcConfig.json';

// Build the system prompt from the JSON config
const SYSTEM_PROMPT = [
    npcConfig.system_prompt,
    `Personality: ${npcConfig.personality}`,
    `Game context: ${npcConfig.context}`,
    `Rules:\n${npcConfig.rules.map(r => `- ${r}`).join('\n')}`,
    'You can see the current game screen. Use it to give specific, situational advice about what the player should do next based on what you observe (player position, nearby platforms, enemies, pickups, etc).',
].join('\n\n');

// Flexible message content type for vision support
type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }>;

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: MessageContent;
}

/** Maintains conversation history for context */
const conversationHistory: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT }
];

/** Capture the Phaser canvas as a base64 data URL */
export function captureScreenshot(canvas: HTMLCanvasElement): string {
    return canvas.toDataURL('image/png');
}

export async function askNPC(userMessage: string, screenshotBase64?: string): Promise<string> {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-api-key-here') {
        return '(No API key set — add your key to .env as VITE_OPENAI_API_KEY)';
    }

    // Build the user message with optional screenshot
    if (screenshotBase64) {
        conversationHistory.push({
            role: 'user',
            content: [
                { type: 'text', text: userMessage },
                {
                    type: 'image_url',
                    image_url: {
                        url: screenshotBase64,
                        detail: 'low' // low detail to save tokens
                    }
                }
            ]
        });
    } else {
        conversationHistory.push({ role: 'user', content: userMessage });
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: conversationHistory,
                max_tokens: 150,
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('OpenAI API error:', err);
            return `(API error: ${response.status})`;
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content?.trim() ?? '(No response)';

        conversationHistory.push({ role: 'assistant', content: reply });

        // Keep history manageable (system + last 10 exchanges)
        if (conversationHistory.length > 21) {
            conversationHistory.splice(1, 2);
        }

        return reply;
    } catch (err) {
        console.error('OpenAI fetch failed:', err);
        return '(Failed to reach AI — check your connection)';
    }
}
