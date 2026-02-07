import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { sceneRouter } from './routes/scene';

const PORT = process.env.PORT || 3001;

if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY not set — AI vision will fail and fallback scene will be used');
}

const app = express();

// CORS configuration for frontend dev server
app.use(cors({
    origin: [
        'http://localhost:8080',
        'http://localhost:5173',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:5173',
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount scene routes
app.use('/api/scene', sceneRouter);

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Scene:  POST http://localhost:${PORT}/api/scene\n`);
});
