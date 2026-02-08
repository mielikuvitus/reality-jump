/**
 * WIN OVERLAY
 * ============
 *
 * Glassmorphism overlay shown when the player reaches the exit.
 * Shows score and action buttons (Play Again, Retake Photo, Share Level).
 */

import { useState } from 'react';
import { Trophy, RefreshCw, Camera, Share2, Check, Loader2 } from 'lucide-react';
import { Icon } from './Icon';
import './WinOverlay.css';

interface WinOverlayProps {
    score: number;
    onPlayAgain: () => void;
    onRetake: () => void;
    onShare?: () => Promise<void>;
    playerName?: string;
    levelName?: string;
}

type ShareState = 'idle' | 'sharing' | 'shared' | 'error';

export function WinOverlay({ score, onPlayAgain, onRetake, onShare, playerName, levelName }: WinOverlayProps) {
    const [shareState, setShareState] = useState<ShareState>('idle');

    const handleShareSubmit = async () => {
        if (!onShare) return;
        setShareState('sharing');
        try {
            await onShare();
            setShareState('shared');
        } catch {
            setShareState('error');
            setTimeout(() => setShareState('idle'), 2000);
        }
    };

    return (
        <div className="win-overlay">
            <div className="win-overlay__card">
                <div className="win-overlay__icon">
                    <Icon icon={Trophy} size={48} />
                </div>
                <h2 className="win-overlay__title">You Win!</h2>
                {score > 0 && (
                    <p className="win-overlay__score">Score: {score}</p>
                )}

                <div className="win-overlay__names">
                    <p className="win-overlay__player-name">{playerName}</p>
                    {levelName && <p className="win-overlay__level-name">{levelName}</p>}
                </div>

                {shareState === 'sharing' && (
                    <div className="win-overlay__share-status">
                        <Icon icon={Loader2} size={20} className="spin" /> Sharing...
                    </div>
                )}

                {shareState === 'shared' && (
                    <div className="win-overlay__share-status win-overlay__share-status--success">
                        <Icon icon={Check} size={20} /> Level shared!
                    </div>
                )}

                {shareState === 'error' && (
                    <div className="win-overlay__share-status win-overlay__share-status--error">
                        Failed to share. Try again.
                    </div>
                )}

                {(shareState === 'idle' || shareState === 'error') && (
                    <div className="win-overlay__actions">
                        {onShare && (
                            <>
                                <button className="glass-button glass-button--hero" onClick={handleShareSubmit}>
                                    <Icon icon={Share2} size={16} /> Share Level
                                </button>
                            </>
                        )}
                        <button className="glass-button glass-button--hero" onClick={onPlayAgain}>
                            <Icon icon={RefreshCw} size={16} /> Play Again
                        </button>
                        <button className="glass-button glass-button--secondary" onClick={onRetake}>
                            <Icon icon={Camera} size={16} /> New Photo
                        </button>
                    </div>
                )}

                {shareState === 'shared' && (
                    <div className="win-overlay__actions">
                        <button className="glass-button glass-button--hero" onClick={onPlayAgain}>
                            <Icon icon={RefreshCw} size={16} /> Play Again
                        </button>
                        <button className="glass-button glass-button--secondary" onClick={onRetake}>
                            <Icon icon={Camera} size={16} /> New Photo
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
