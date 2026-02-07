import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { analyzeImage } from '../services/vision';
import { FALLBACK_SCENE } from '../fallback';

// ── Multer config ────────────────────────────────────────────

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
    },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    },
});

export const sceneRouter = Router();

// ── Constants ────────────────────────────────────────────────

const MAX_WIDTH = 1024;
const JPEG_QUALITY = 75;

// ── POST /api/scene ──────────────────────────────────────────

sceneRouter.post('/', upload.single('image'), async (req: Request, res: Response) => {
    const file = req.file;
    const requestId = (req.headers['x-request-id'] as string) || 'no-request-id';
    const ts = new Date().toISOString();

    if (!file) {
        console.log(`[${ts}] req=${requestId} error=no_image`);
        res.status(400).json({
            error: 'No image file provided',
            hint: 'Send multipart/form-data with field name "image"',
        });
        return;
    }

    console.log(`[${ts}] req=${requestId} received size=${file.size} type=${file.mimetype}`);

    try {
        // ── 1. Downscale / compress with sharp ───────────────
        const image = sharp(file.buffer);
        const meta = await image.metadata();
        const origW = meta.width ?? MAX_WIDTH;
        const origH = meta.height ?? 768;

        let processedBuffer: Buffer;
        let finalW: number;
        let finalH: number;

        if (origW > MAX_WIDTH) {
            const ratio = MAX_WIDTH / origW;
            finalW = MAX_WIDTH;
            finalH = Math.round(origH * ratio);
            processedBuffer = await image
                .resize(finalW, finalH, { fit: 'inside' })
                .jpeg({ quality: JPEG_QUALITY })
                .toBuffer();
        } else {
            finalW = origW;
            finalH = origH;
            // Still convert to JPEG for consistent encoding
            processedBuffer = await image
                .jpeg({ quality: JPEG_QUALITY })
                .toBuffer();
        }

        console.log(`[${ts}] req=${requestId} processed ${origW}×${origH} → ${finalW}×${finalH} (${processedBuffer.length} bytes)`);

        // ── 2. Convert to base64 for OpenAI ──────────────────
        const base64 = processedBuffer.toString('base64');

        // ── 3. Call vision service ───────────────────────────
        const result = await analyzeImage(base64, 'image/jpeg', finalW, finalH);

        console.log(`[${ts}] req=${requestId} source=${result.source} duration=${result.durationMs}ms`);

        // Override image dimensions with actual values
        result.scene.image = { w: finalW, h: finalH };

        res.json(result.scene);
    } catch (err: any) {
        console.error(`[${ts}] req=${requestId} unhandled error:`, err?.message ?? err);
        // Return fallback on any unhandled error
        res.json(FALLBACK_SCENE);
    }
});

// ── Error handling (multer) ──────────────────────────────────

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
