/**
 * PREVIEW SCREEN (Step 3)
 * ========================
 * Shows the Phaser level preview. Lucide icons replace emojis.
 * Bug icon toggles a JSON panel below the preview showing LLM response + scene data.
 */

import { useState } from 'react';
import { ArrowLeft, Bug, BugOff } from 'lucide-react';
import { GameContainer } from '../game/GameContainer';
import { Icon } from './Icon';
import type { SceneV1 } from '../shared/schema/scene_v1.types';
import type { SceneResponse } from '../services/ai_proxy_service';
import './PreviewScreen.css';

type JsonTab = 'llm' | 'scene';

interface PreviewScreenProps {
    photoUrl: string;
    sceneData: SceneV1;
    rawSceneData?: SceneResponse | null;
    onBack: () => void;
}

export function PreviewScreen({ photoUrl, sceneData, rawSceneData, onBack }: PreviewScreenProps) {
    const [debugEnabled, setDebugEnabled] = useState(true);
    const [showJson, setShowJson] = useState(false);
    const [activeTab, setActiveTab] = useState<JsonTab>('llm');

    // Extract debug data for LLM tab
    const debugData = rawSceneData?._debug;
    let llmJson: string | null = null;
    if (debugData) {
        try {
            const parsed = typeof debugData.raw_ai_response === 'string'
                ? JSON.parse(debugData.raw_ai_response)
                : debugData.raw_ai_response;
            llmJson = JSON.stringify(parsed, null, 2);
        } catch {
            llmJson = debugData.raw_ai_response;
        }
    }

    // Scene JSON (without _debug)
    const sceneOnly = rawSceneData ? { ...rawSceneData } : { ...sceneData };
    delete (sceneOnly as any)._debug;
    const sceneJson = JSON.stringify(sceneOnly, null, 2);

    const handleBugClick = () => {
        setShowJson(!showJson);
        if (!showJson) setDebugEnabled(true);
    };

    return (
        <div className="preview-screen">
            <div className="preview-screen__header">
                <button className="preview-screen__back-btn" onClick={onBack}>
                    <Icon icon={ArrowLeft} size={16} /> Back
                </button>
                <h1 className="preview-screen__title">Level Preview</h1>
                <button
                    className={`preview-screen__debug-btn ${showJson ? 'preview-screen__debug-btn--active' : ''}`}
                    onClick={handleBugClick}
                >
                    <Icon icon={showJson ? Bug : BugOff} size={14} />
                </button>
            </div>

            <div className="preview-screen__canvas">
                <GameContainer
                    photoUrl={photoUrl}
                    sceneData={sceneData}
                    debugEnabled={debugEnabled}
                />
            </div>


            {/* JSON panel — below the preview, toggled by debug button */}
            {showJson && (
                <div className="preview-screen__json-section">
                    <div className="preview-screen__json-tabs">
                        {llmJson && (
                            <button
                                className={`preview-screen__json-tab ${activeTab === 'llm' ? 'preview-screen__json-tab--active' : ''}`}
                                onClick={() => setActiveTab('llm')}
                            >
                                LLM Response
                            </button>
                        )}
                        <button
                            className={`preview-screen__json-tab ${activeTab === 'scene' ? 'preview-screen__json-tab--active' : ''}`}
                            onClick={() => setActiveTab('scene')}
                        >
                            Scene JSON
                        </button>
                    </div>
                    <pre className="preview-screen__json-viewer">
                        {activeTab === 'llm' && llmJson ? llmJson : sceneJson}
                    </pre>
                </div>
            )}
        </div>
    );
}
