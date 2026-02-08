/**
 * GAME CONTAINER - React → Phaser Bridge
 * ========================================
 *
 * This component creates and manages a Phaser.Game instance specifically
 * for the Level Preview (Step 3).
 *
 * ASPECT RATIO FIX:
 * We pre-load the photo in an HTML <img> to read its natural dimensions
 * BEFORE creating the Phaser game. This lets us set the correct width/height
 * in the Phaser config so Scale.FIT preserves the photo's aspect ratio.
 *
 * Props:
 * - photoUrl: string - Object URL of the captured photo
 * - sceneData: SceneV1 - Validated scene data
 * - debugEnabled: boolean - Whether to show debug overlays
 * - onExit?: () => void - Optional callback when user wants to leave
 */

import { useEffect, useRef, useState } from 'react';
import { AUTO, Game } from 'phaser';
import { PreviewScene } from './scenes/PreviewScene';
import { EventBus } from './EventBus';
import type { SceneV1 } from '../shared/schema/scene_v1.types';
import './GameContainer.css';

interface GameContainerProps {
    photoUrl: string;
    sceneData: SceneV1;
    debugEnabled: boolean;
    onExit?: () => void;
}

/** Load an image and return its natural dimensions */
function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('Failed to load image for dimensions'));
        img.src = url;
    });
}

export function GameContainer({ photoUrl, sceneData, debugEnabled }: GameContainerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Game | null>(null);
    const [photoDims, setPhotoDims] = useState<{ width: number; height: number } | null>(null);

    // Step 1: Pre-load photo dimensions
    useEffect(() => {
        let cancelled = false;
        setPhotoDims(null);

        loadImageDimensions(photoUrl).then((dims) => {
            if (!cancelled) {
                console.info(`[GameContainer] Photo dimensions: ${dims.width}x${dims.height}`);
                setPhotoDims(dims);
            }
        }).catch((err) => {
            console.error('[GameContainer] Failed to read photo dimensions:', err);
            // Fallback to a reasonable default
            if (!cancelled) setPhotoDims({ width: 960, height: 640 });
        });

        return () => { cancelled = true; };
    }, [photoUrl]);

    // Step 2: Create Phaser game once we know the photo dimensions
    useEffect(() => {
        if (!containerRef.current || !photoDims) return;
        if (gameRef.current) {
            gameRef.current.destroy(true);
            gameRef.current = null;
        }

        const config: Phaser.Types.Core.GameConfig = {
            type: AUTO,
            width: photoDims.width,
            height: photoDims.height,
            parent: containerRef.current,
            backgroundColor: '#111111',
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.NO_CENTER,
            },
            scene: [],
        };

        const game = new Game(config);
        gameRef.current = game;

        const sceneInitData = { photoUrl, sceneData, debugEnabled };

        // Handle both sync and async boot (Phaser boots synchronously
        // when document is already loaded, so 'ready' may have already fired).
        const addScene = () => {
            game.scene.add('PreviewScene', PreviewScene, true, sceneInitData);
        };

        if (game.isBooted) {
            addScene();
        } else {
            game.events.once('ready', addScene);
        }

        return () => {
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [photoUrl, sceneData, photoDims]);

    // Toggle debug via EventBus when prop changes
    useEffect(() => {
        EventBus.emit('toggle-debug', debugEnabled);
    }, [debugEnabled]);

    return (
        <div className="game-container-wrapper">
            {!photoDims && (
                <div className="game-container-loading">Loading preview...</div>
            )}
            <div ref={containerRef} className="game-container-canvas" />
        </div>
    );
}
