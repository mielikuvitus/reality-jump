/**
 * PLAY SCREEN (Step 4)
 * =====================
 *
 * Wraps the Phaser GameScene with React UI:
 * - Mobile controls overlay
 * - Back button + debug toggle
 * - Win overlay on game completion
 *
 * Creates a separate Phaser Game instance for play mode (with Arcade Physics).
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { ArrowLeft, Share2 } from 'lucide-react';
import { AUTO, Game } from 'phaser';
import { GameScene } from '../game/scenes/GameScene';
import { EventBus } from '../game/EventBus';
import { createInputState } from '../game/input/InputState';
import { Icon } from './Icon';
import { MobileControls } from './MobileControls';
import { WinOverlay } from './WinOverlay';
import { shareLevel, isSupabaseConfigured } from '../services/supabase';
import type { SceneV1 } from '../shared/schema/scene_v1.types';
import './PlayScreen.css';

const isDev = import.meta.env.DEV;

interface PlayScreenProps {
    photoUrl: string;
    sceneData: SceneV1;
    onBack: () => void;
    onRetake: () => void;
    playerName?: string;
    levelName?: string;
}

export function PlayScreen({ photoUrl, sceneData, onBack, onRetake, playerName = 'happy-little-adventurer', levelName = 'Mystery Level' }: PlayScreenProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Game | null>(null);
    const inputState = useMemo(() => createInputState(), []);

    const [debugEnabled, setDebugEnabled] = useState(false);
    const [won, setWon] = useState(false);
    const [lost, setLost] = useState(false);
    const [score, setScore] = useState(0);
    const [health, setHealth] = useState(10);
    const [loseShareState, setLoseShareState] = useState<'idle' | 'sharing' | 'shared' | 'error'>('idle');

    // Preload photo dimensions, then create Phaser game
    useEffect(() => {
        if (!containerRef.current) return;
        if (gameRef.current) {
            gameRef.current.destroy(true);
            gameRef.current = null;
        }

        let cancelled = false;

        // Load photo dimensions first
        const img = new Image();
        img.src = photoUrl;

        const startGame = (w: number, h: number) => {
            if (cancelled || !containerRef.current) return;

            console.info(`[PlayScreen] Starting Phaser game: ${w}x${h}`);

            const config: Phaser.Types.Core.GameConfig = {
                type: AUTO,
                width: w,
                height: h,
                parent: containerRef.current,
                backgroundColor: '#1a1a2e',
                physics: {
                    default: 'arcade',
                    arcade: {
                        // Gravity is set at runtime by GameScene (world-relative).
                        gravity: { x: 0, y: 0 },
                        debug: false,
                    },
                },
                scale: {
                    mode: Phaser.Scale.FIT,
                    autoCenter: Phaser.Scale.CENTER_BOTH,
                },
                scene: [],
            };

            const game = new Game(config);
            gameRef.current = game;

            const sceneInitData: import('../game/scenes/GameScene').GameSceneData = {
                photoUrl,
                sceneData,
                inputState,
                debugEnabled,
            };

            // Handle both sync and async boot:
            // Phaser boots synchronously when document is already loaded,
            // which means 'ready' fires during the constructor — before
            // we can attach a listener. Check isBooted as a fallback.
            const addScene = () => {
                if (cancelled) return;
                console.info('[PlayScreen] Game ready — adding GameScene');
                game.scene.add('GameScene', GameScene, true, sceneInitData);
            };

            if (game.isBooted) {
                addScene();
            } else {
                game.events.once('ready', addScene);
            }
        };

        if (img.complete && img.naturalWidth > 0) {
            startGame(img.naturalWidth, img.naturalHeight);
        } else {
            img.onload = () => startGame(img.naturalWidth, img.naturalHeight);
            img.onerror = () => startGame(960, 640);
        }

        return () => {
            cancelled = true;
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [photoUrl, sceneData]);

    // Listen for game events
    useEffect(() => {
        const handleWin = (data: { score: number }) => {
            setWon(true);
            setScore(data.score);
        };
        const handleLose = (data: { score: number }) => {
            setLost(true);
            setScore(data.score);
        };
        const handleScore = (newScore: number) => {
            setScore(newScore);
        };
        const handleHealth = (newHealth: number) => {
            setHealth(newHealth);
        };

        EventBus.on('game-won', handleWin);
        EventBus.on('game-lost', handleLose);
        EventBus.on('score-update', handleScore);
        EventBus.on('health-update', handleHealth);

        return () => {
            EventBus.off('game-won', handleWin);
            EventBus.off('game-lost', handleLose);
            EventBus.off('score-update', handleScore);
            EventBus.off('health-update', handleHealth);
        };
    }, []);

    // Toggle debug
    useEffect(() => {
        EventBus.emit('toggle-debug', debugEnabled);
    }, [debugEnabled]);

    // Share handler — uses AI-generated names
    const handleShare = useCallback(async () => {
        const response = await fetch(photoUrl);
        const blob = await response.blob();
        await shareLevel(playerName, levelName, sceneData, blob, score);
    }, [photoUrl, sceneData, score, playerName, levelName]);

    const canShare = isSupabaseConfigured();

    const handleLoseShare = useCallback(async () => {
        setLoseShareState('sharing');
        try {
            const response = await fetch(photoUrl);
            const blob = await response.blob();
            await shareLevel(playerName, levelName, sceneData, blob, score);
            setLoseShareState('shared');
        } catch {
            setLoseShareState('error');
            setTimeout(() => setLoseShareState('idle'), 2000);
        }
    }, [photoUrl, sceneData, score, playerName, levelName]);

    const handlePlayAgain = () => {
        setWon(false);
        setLost(false);
        setScore(0);
        setHealth(10);
        setLoseShareState('idle');
        // Restart the scene
        if (gameRef.current) {
            const scene = gameRef.current.scene.getScene('GameScene');
            if (scene) {
                scene.scene.restart({
                    photoUrl,
                    sceneData,
                    inputState,
                    debugEnabled,
                });
            }
        }
    };

    return (
        <div className="play-screen">
            <div className="play-screen__header">
                <button className="play-screen__back-btn" onClick={onBack}>
                    <Icon icon={ArrowLeft} size={16} /> Back
                </button>
                <div className="play-screen__stats">
                    <span className="play-screen__score">Score: {score}</span>
                    <span className={`play-screen__health ${health <= 2 ? 'play-screen__health--low' : ''}`}>
                        HP: {health}
                    </span>
                </div>
                {/* Spacer to keep header layout balanced */}
                <div style={{ width: 32 }} />
            </div>

            <div className="play-screen__game">
                <div ref={containerRef} className="play-screen__canvas" />
                {won && (
                    <WinOverlay
                        score={score}
                        onPlayAgain={handlePlayAgain}
                        onRetake={onRetake}
                        onShare={canShare ? handleShare : undefined}
                        playerName={playerName}
                        levelName={levelName}
                    />
                )}
                {lost && (
                    <div className="lose-overlay">
                        <div className="lose-overlay__card">
                            <h2 className="lose-overlay__title">Game Over</h2>
                            {score > 0 && <p className="lose-overlay__score">Score: {score}</p>}
                            <div className="lose-overlay__names">
                                <p className="lose-overlay__player-name">{playerName}</p>
                                <p className="lose-overlay__level-name">{levelName}</p>
                            </div>
                            <div className="lose-overlay__actions">
                                {canShare && loseShareState !== 'shared' && (
                                    <>
                                        <button className="glass-button glass-button--hero" onClick={handleLoseShare}
                                            disabled={loseShareState === 'sharing'}>
                                            {loseShareState === 'sharing' ? 'Sharing...' : <><Icon icon={Share2} size={16} /> Share Level</>}
                                        </button>
                                    </>
                                )}
                                {loseShareState === 'shared' && (
                                    <p style={{ color: '#4ade80', textAlign: 'center' }}>Level shared!</p>
                                )}
                                {loseShareState === 'error' && (
                                    <p style={{ color: '#f87171', textAlign: 'center' }}>Failed. Try again.</p>
                                )}
                                <button className="glass-button lose-overlay__retry-btn" onClick={handlePlayAgain}>
                                    Try Again
                                </button>
                                <button className="glass-button glass-button--secondary" onClick={onRetake}>
                                    New Photo
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <MobileControls inputState={inputState} disabled={won || lost} />
        </div>
    );
}
