import { Router, Request, Response } from 'express';
import multer from 'multer';

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

/**
 * POST /api/scene
 * Accepts multipart/form-data with an "image" field
 * Returns hardcoded Scene JSON (v1 schema)
 */
sceneRouter.post('/', upload.single('image'), (req: Request, res: Response) => {
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

    // Log received image info with request ID for tracing
    console.log(`[${timestamp}] request=${requestId} received image size=${file.size} type=${file.mimetype}`);

    // Return hardcoded Scene JSON matching SceneV1 Zod schema
    const sceneResponse = {
        version: 1,
        image: {
            w: 1024,
            h: 768,
        },
        objects: [
            { id: 'plat_1', type: 'platform', label: 'table', confidence: 0.95, bounds_normalized: { x: 0.05, y: 0.75, w: 0.4, h: 0.06 }, category: 'furniture' },
            { id: 'plat_2', type: 'platform', label: 'cushion', confidence: 0.88, bounds_normalized: { x: 0.55, y: 0.55, w: 0.35, h: 0.05 }, category: 'furniture', surface_type: 'soft' },
            { id: 'plat_3', type: 'platform', label: 'ledge', confidence: 0.85, bounds_normalized: { x: 0.15, y: 0.35, w: 0.30, h: 0.05 } },
            { id: 'plat_4', type: 'platform', label: 'beam', confidence: 0.80, bounds_normalized: { x: 0.65, y: 0.22, w: 0.30, h: 0.04 } },
            { id: 'obs_plant', type: 'obstacle', label: 'plant', confidence: 0.92, bounds_normalized: { x: 0.45, y: 0.50, w: 0.08, h: 0.15 }, category: 'plant', enemy_spawn_anchor: true },
            { id: 'obs_chair', type: 'obstacle', label: 'chair', confidence: 0.82, bounds_normalized: { x: 0.3, y: 0.6, w: 0.12, h: 0.15 }, category: 'furniture' },
            { id: 'col_1', type: 'collectible', label: 'cup', confidence: 0.78, bounds_normalized: { x: 0.2, y: 0.7, w: 0.05, h: 0.05 }, category: 'food' },
            { id: 'haz_1', type: 'hazard', label: 'spill', confidence: 0.70, bounds_normalized: { x: 0.7, y: 0.85, w: 0.15, h: 0.04 } },
        ],
        detections: [],
        spawns: {
            player: { x: 0.1, y: 0.85 },
            exit: { x: 0.9, y: 0.2 },
            enemies: [
                { x: 0.45, y: 0.50, type: 'walker' },
            ],
            pickups: [
                { x: 0.3, y: 0.6, type: 'coin' },
            ],
        },
        rules: [],
    };

    console.log(`[${timestamp}] request=${requestId} response sent status=200`);
    res.json(sceneResponse);
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
