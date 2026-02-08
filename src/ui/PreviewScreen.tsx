/**
 * PREVIEW SCREEN (Step 3)
 * ========================
 * Shows the Phaser level preview. Lucide icons replace emojis.
 */

import { useState } from 'react';
import { ArrowLeft, Bug, BugOff } from 'lucide-react';
import { GameContainer } from '../game/GameContainer';
import { Icon } from './Icon';
import type { SceneV1 } from '../shared/schema/scene_v1.types';
import './PreviewScreen.css';

const isDev = import.meta.env.DEV;

interface PreviewScreenProps {
    photoUrl: string;
    sceneData: SceneV1;
    onBack: () => void;
}

export function PreviewScreen({ photoUrl, sceneData, onBack }: PreviewScreenProps) {
    const [debugEnabled, setDebugEnabled] = useState(true);

    return (
        <div className="preview-screen">
            <div className="preview-screen__header">
                <button className="preview-screen__back-btn" onClick={onBack}>
                    <Icon icon={ArrowLeft} size={16} /> Back
                </button>
                <h1 className="preview-screen__title">Level Preview</h1>
                <button
                    className={`preview-screen__debug-btn ${debugEnabled ? 'preview-screen__debug-btn--active' : ''}`}
                    onClick={() => setDebugEnabled(!debugEnabled)}
                >
                    <Icon icon={debugEnabled ? Bug : BugOff} size={14} />
                </button>
            </div>

            <div className="preview-screen__canvas">
                <GameContainer
                    photoUrl={photoUrl}
                    sceneData={sceneData}
                    debugEnabled={debugEnabled}
                />
            </div>

            <div className="preview-screen__info">
                <div className="preview-screen__stat">
                    <span className="preview-screen__stat-label">Objects</span>
                    <span className="preview-screen__stat-value">{sceneData.objects.length}</span>
                </div>
                <div className="preview-screen__stat">
                    <span className="preview-screen__stat-label">Enemies</span>
                    <span className="preview-screen__stat-value">{sceneData.spawns.enemies.length}</span>
                </div>
                <div className="preview-screen__stat">
                    <span className="preview-screen__stat-label">Pickups</span>
                    <span className="preview-screen__stat-value">{sceneData.spawns.pickups.length}</span>
                </div>
            </div>
        </div>
    );
}
