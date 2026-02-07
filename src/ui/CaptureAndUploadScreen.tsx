/**
 * CAPTURE AND UPLOAD SCREEN
 * =========================
 * 
 * Orchestrates the full flow:
 * 1. Photo capture (CameraCapture)
 * 2. Photo upload → Scene JSON (UploadFlow)
 * 3. Level preview (handled inside UploadFlow)
 * 
 * DEV PANEL:
 * Context-aware - shows only relevant toggles for the current step:
 * - Capture step: Image Info
 * - Upload step: Image Info, Mock/Backend toggles
 * - Success step: Show JSON (logs to console), Player/Exit coords
 * - Preview step: (none needed here, PreviewScreen has its own debug)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Minus, Plus, RefreshCw } from 'lucide-react';
import { CameraCapture, CaptureData } from './CameraCapture';
import { UploadFlow } from './UploadFlow';
import type { UploadFlowState } from './UploadFlow';
import { Icon } from './Icon';
import { SplashLogo } from './SplashLogo';
import './CaptureAndUploadScreen.css';
import './screens/UploadScreens.css';

type ScreenState = 'capture' | 'preview' | 'uploading';

const isDev = import.meta.env.DEV;

const STORAGE_KEYS = {
    showImageInfo: 'dev_showImageInfo',
    showSceneJson: 'dev_showSceneJson',
    demoRandom: 'dev_demoRandom',
    mockMode: 'dev_mockMode',
    mockFallback: 'dev_mockFallback',
};

export function CaptureAndUploadScreen() {
    const [screenState, setScreenState] = useState<ScreenState>('capture');
    const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const photoUrlRef = useRef<string | null>(null);

    // Track the UploadFlow's internal state for dev panel context
    const [flowState, setFlowState] = useState<UploadFlowState | null>(null);

    // Dev panel state
    const [devPanelOpen, setDevPanelOpen] = useState(true);
    const [showImageInfo, setShowImageInfo] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.showImageInfo);
        return stored === 'true';
    });
    const [showSceneJson, setShowSceneJson] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.showSceneJson);
        return stored === 'true';
    });
    const [demoRandom, setDemoRandom] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.demoRandom);
        return stored === 'true';
    });
    const [mockMode, setMockMode] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.mockMode);
        return stored === 'true';
    });
    const [mockFallback, setMockFallback] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.mockFallback);
        return stored === 'true';
    });

    // Persist toggles
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.showImageInfo, String(showImageInfo));
    }, [showImageInfo]);
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.showSceneJson, String(showSceneJson));
    }, [showSceneJson]);
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.demoRandom, String(demoRandom));
    }, [demoRandom]);
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.mockMode, String(mockMode));
    }, [mockMode]);
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.mockFallback, String(mockFallback));
    }, [mockFallback]);

    const handleCapture = useCallback((data: CaptureData) => {
        setCapturedBlob(data.compressedBlob);
        const url = URL.createObjectURL(data.compressedBlob);
        if (photoUrlRef.current) {
            URL.revokeObjectURL(photoUrlRef.current);
        }
        photoUrlRef.current = url;
        setPhotoUrl(url);
        setScreenState('preview');
    }, []);

    const handleRetake = useCallback(() => {
        setCapturedBlob(null);
        if (photoUrlRef.current) {
            URL.revokeObjectURL(photoUrlRef.current);
            photoUrlRef.current = null;
        }
        setPhotoUrl(null);
        setFlowState(null);
        setScreenState('capture');
    }, []);

    const handleUploadStart = useCallback(() => {
        setScreenState('uploading');
    }, []);

    const handleFlowStateChange = useCallback((state: UploadFlowState) => {
        setFlowState(state);
    }, []);

    // Determine which step we're in for the dev panel
    // Note: screenState 'preview' = photo preview (before upload)
    //       flowState 'preview' = Phaser level preview (after success)
    const getDevStep = (): string => {
        if (flowState === 'preview' || flowState === 'play') return 'phaser_preview';
        if (flowState === 'validationError') return 'validationError';
        if (flowState === 'success' || flowState === 'error') return flowState;
        if (screenState === 'uploading' || flowState === 'loading') return 'uploading';
        if (screenState === 'preview') return 'photo_preview';
        return 'capture';
    };
    const currentStep = getDevStep();

    const getSubtitle = () => {
        switch (currentStep) {
            case 'capture': return 'Take a photo to create your level';
            case 'photo_preview': return 'Review your photo or upload';
            case 'uploading': return 'Generating your scene...';
            case 'success': return 'Scene ready';
            case 'phaser_preview': return 'Level preview';
            default: return '';
        }
    };

    // Hide dev panel during Phaser preview (PreviewScreen has its own debug toggle)
    const showDevPanel = isDev && currentStep !== 'phaser_preview' && currentStep !== 'validationError';

    return (
        <div className="capture-upload-screen">
            {/* Large background logo — decorative, behind all content */}
            <SplashLogo className="capture-upload-screen__bg-logo" />

            <nav className="capture-upload-screen__nav">
                <div className="capture-upload-screen__nav-logo">
                    <span className="capture-upload-screen__nav-title logo">Reality Jump</span>
                    <SplashLogo className="capture-upload-screen__nav-svg" />
                </div>
            </nav>

            <div className={`capture-upload-screen__content ${screenState === 'capture' ? 'capture-upload-screen__content--centered' : ''}`}>
                {/* --- Capture state: intro card with Take Photo inside --- */}
                {screenState === 'capture' && (
                    <div className="capture-upload-screen__intro-card">
                        <h1 className="screen-title">
                            Hey Level Designer!
                        </h1>
                        <p className="summary-label" style={{ textAlign: 'center' }}>
                            Turn your world into a game!<br />
                            Snap a photo and let's start building.
                        </p>
                        <div className="capture-upload-screen__intro-action">
                            <CameraCapture 
                                onCapture={handleCapture}
                                onRetake={handleRetake}
                                showDebugInfo={showImageInfo}
                            />
                        </div>
                    </div>
                )}

                {/* --- Preview state: photo + retake + upload --- */}
                {screenState === 'preview' && photoUrl && (
                    <div className="capture-upload-screen__preview-section">
                        <img
                            src={photoUrl}
                            alt="Captured photo"
                            className="capture-upload-screen__preview-img"
                        />
                        <p className="capture-upload-screen__preview-hint">Review your photo or generate a level</p>
                        <div className="capture-upload-screen__preview-actions">
                            <button
                                type="button"
                                className="capture-upload-screen__retake-btn"
                                onClick={handleRetake}
                            >
                                <Icon icon={RefreshCw} size={16} /> Retake
                            </button>
                        </div>
                        {capturedBlob && (
                            <div className="capture-upload-screen__upload-section">
                                <UploadFlow 
                                    blob={capturedBlob}
                                    photoUrl={photoUrl}
                                    onRetake={handleRetake}
                                    onUploadStart={handleUploadStart}
                                    onFlowStateChange={handleFlowStateChange}
                                    demoRandom={demoRandom}
                                    mockMode={mockMode}
                                    mockFallback={mockFallback}
                                    showSceneJson={showSceneJson}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* --- Uploading state --- */}
                {screenState === 'uploading' && (
                    <UploadFlow 
                        blob={capturedBlob}
                        photoUrl={photoUrl}
                        onRetake={handleRetake}
                        onFlowStateChange={handleFlowStateChange}
                        autoStart={true}
                        demoRandom={demoRandom}
                        mockMode={mockMode}
                        mockFallback={mockFallback}
                        showSceneJson={showSceneJson}
                    />
                )}
            </div>

            {/* Dev Panel - context-aware, hidden during Phaser preview */}
            {showDevPanel && (
                <div className={`dev-panel ${!devPanelOpen ? 'dev-panel--minimized' : ''}`}>
                    <div className="dev-panel__header">
                        <span className="dev-panel__title">Dev</span>
                        <button 
                            className="dev-panel__toggle-btn"
                            onClick={() => setDevPanelOpen(!devPanelOpen)}
                        >
                            <Icon icon={devPanelOpen ? Minus : Plus} size={14} />
                        </button>
                    </div>
                    
                    {devPanelOpen && (
                        <div className="dev-panel__content">
                            {/* Image Info toggle - only after photo is taken */}
                            {currentStep === 'photo_preview' && (
                                <div className="dev-panel__item">
                                    <span className="dev-panel__label">Image Info</span>
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={showImageInfo}
                                            onChange={(e) => setShowImageInfo(e.target.checked)}
                                        />
                                        <span className="toggle-switch__slider"></span>
                                    </label>
                                </div>
                            )}

                            {/* Upload toggles - only during capture/photo preview/uploading/error */}
                            {(currentStep === 'capture' || currentStep === 'photo_preview' || currentStep === 'uploading' || currentStep === 'error') && (
                                <>
                                    {currentStep === 'photo_preview' && <div className="dev-panel__divider"></div>}
                                    <div className="dev-panel__section">
                                        <div className="dev-panel__section-title">Backend</div>
                                        <div className="dev-panel__item">
                                            <span className="dev-panel__label">Demo Random</span>
                                            <label className="toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={demoRandom}
                                                    onChange={(e) => setDemoRandom(e.target.checked)}
                                                />
                                                <span className="toggle-switch__slider"></span>
                                            </label>
                                        </div>
                                        <div className="dev-panel__item">
                                            <span className="dev-panel__label">Mock Fallback</span>
                                            <label className="toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={mockFallback}
                                                    onChange={(e) => setMockFallback(e.target.checked)}
                                                />
                                                <span className="toggle-switch__slider"></span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="dev-panel__divider"></div>
                                    <div className="dev-panel__section">
                                        <div className="dev-panel__section-title">No Backend</div>
                                        <div className="dev-panel__item">
                                            <span className="dev-panel__label">Mock Mode</span>
                                            <label className="toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={mockMode}
                                                    onChange={(e) => setMockMode(e.target.checked)}
                                                />
                                                <span className="toggle-switch__slider"></span>
                                            </label>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Scene JSON toggle - only on success step */}
                            {currentStep === 'success' && (
                                <div className="dev-panel__item">
                                    <span className="dev-panel__label">Scene JSON</span>
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={showSceneJson}
                                            onChange={(e) => setShowSceneJson(e.target.checked)}
                                        />
                                        <span className="toggle-switch__slider"></span>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
