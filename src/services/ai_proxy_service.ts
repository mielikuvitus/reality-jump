/**
 * AI PROXY SERVICE - Frontend API Client
 * =======================================
 * 
 * Purpose:
 * Upload captured photos to the backend for scene generation.
 * 
 * BACKEND API CONTRACT:
 * ---------------------
 * Endpoint: POST /api/scene
 * Content-Type: multipart/form-data
 * 
 * Request:
 *   - Field name: "image" (required) - the photo file/blob
 *   - Header: "x-request-id" (optional) - for request tracing
 * 
 * Response (200 OK):
 *   {
 *     "version": 1,
 *     "image": { "w": number, "h": number },
 *     "objects": [...],
 *     "spawns": {
 *       "player": { "x": number, "y": number },
 *       "exit": { "x": number, "y": number },
 *       "enemies": [...],
 *       "pickups": [...]
 *     },
 *     "rules": [...]
 *   }
 * 
 * Error Response (4xx/5xx):
 *   { "error": "description" }
 * 
 * TESTING WITH CURL:
 * ------------------
 * curl -i -X POST "http://localhost:3001/api/scene" \
 *   -H "x-request-id: req_CURLTEST" \
 *   -F "image=@/path/to/photo.jpg"
 */

export interface UploadParams {
    blob: Blob;
    filename?: string;
    endpoint?: string;
    requestId?: string;
}

/**
 * Raw response from backend. This is a loose type for transport only.
 * Actual validation happens via Zod (parseSceneV1) before data reaches Phaser.
 */
export interface SceneResponse {
    version: number;
    image: { w: number; h: number };
    objects: unknown[];
    spawns: {
        player: { x: number; y: number };
        exit: { x: number; y: number };
        enemies: unknown[];
        pickups: unknown[];
    };
    rules: unknown[];
    /** AI-generated player name in adjective-adjective-noun format */
    player_name?: string;
    /** AI-generated level name based on photo content */
    level_name?: string;
    /** Raw AI detection data — only present in non-mock responses */
    _debug?: {
        raw_ai_response: string;
        detections: unknown;
    };
}

export class UploadError extends Error {
    constructor(
        message: string,
        public status: number,
        public responseText: string
    ) {
        super(message);
        this.name = 'UploadError';
    }
}

/**
 * Upload an image blob to the backend and receive Scene JSON.
 * 
 * @param params.blob - The compressed image blob to upload
 * @param params.filename - Optional filename (default: "photo.jpg")
 * @param params.endpoint - Optional endpoint URL (default: dev server)
 * @param params.requestId - Optional request ID for tracing
 * @returns Promise resolving to Scene JSON
 * @throws UploadError on non-2xx response
 */
export async function uploadImageForScene(params: UploadParams): Promise<SceneResponse> {
    const {
        blob,
        filename = 'photo.jpg',
        endpoint,
        requestId,
    } = params;

    // Use provided endpoint, or relative URL (works for both Vite proxy in dev and Vercel in prod)
    const url = endpoint || '/api/scene';

    const formData = new FormData();
    formData.append('image', blob, filename);

    const headers: HeadersInit = {};
    if (requestId) {
        headers['x-request-id'] = requestId;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new UploadError(
            `Upload failed: ${response.status} ${response.statusText}`,
            response.status,
            responseText
        );
    }

    try {
        return JSON.parse(responseText) as SceneResponse;
    } catch {
        throw new UploadError(
            'Invalid JSON response from server',
            response.status,
            responseText
        );
    }
}
