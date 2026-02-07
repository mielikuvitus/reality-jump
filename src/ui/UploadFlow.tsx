/**
 * UPLOAD FLOW COMPONENT
 * =====================
 *
 * Orchestrates the image upload → scene generation → preview flow.
 *
 * FLOW STATES:
 * 1. idle - Waiting for user to click "Upload" (blob must exist)
 * 2. loading - Upload in progress, showing loading animation
 * 3. success - Backend returned Scene JSON
 * 4. error - Upload failed
 * 5. preview - Showing Phaser level preview
 * 6. validationError - Scene JSON failed Zod validation
 *
 * Props:
 * - blob: Blob | null - The compressed photo to upload
 * - photoUrl: string | null - Object URL for the photo (for Phaser preview)
 * - onRetake: () => void - Callback to return to photo capture
 * - onUploadStart: () => void - Callback when upload begins
 * - autoStart: boolean - If true, starts upload immediately
 * - demoRandom: boolean - 50/50 show success or error after real success
 * - mockMode: boolean - Return fake data instead of calling backend
 * - mockFallback: boolean - Try backend first, fall back to mock data on error
 */

import { useState, useCallback, useEffect } from "react";
import { CloudUpload, ChevronUp, ChevronDown } from "lucide-react";
import {
    uploadImageForScene,
    SceneResponse,
    UploadError,
} from "../services/ai_proxy_service";
import { makeRequestId, formatNow } from "../services/request_trace";
import { parseSceneV1 } from "../shared/schema/scene_v1.schema";
import type { SceneV1 } from "../shared/schema/scene_v1.types";
import { Icon } from "./Icon";
import { UploadLoading } from "./screens/UploadLoading";
import { UploadSuccess } from "./screens/UploadSuccess";
import { UploadError as UploadErrorScreen } from "./screens/UploadError";
import { PreviewScreen } from "./PreviewScreen";
import { PlayScreen } from "./PlayScreen";
import { ValidationErrorScreen } from "./ValidationErrorScreen";
import "./UploadFlow.css";

export type UploadFlowState = "idle" | "loading" | "success" | "error" | "preview" | "play" | "validationError";

// Internal alias for readability
type FlowState = UploadFlowState;

interface UploadFlowProps {
    blob: Blob | null;
    photoUrl?: string | null;
    onRetake: () => void;
    onUploadStart?: () => void;
    onFlowStateChange?: (state: UploadFlowState) => void;
    autoStart?: boolean;
    demoRandom?: boolean;
    mockMode?: boolean;
    mockFallback?: boolean;
    showSceneJson?: boolean;
}

// Mock response for testing without backend (matches SceneV1 Zod schema)
// Cast needed because SceneResponse is a loose type; Zod validates the real shape.
const MOCK_SCENE_RESPONSE = {
    version: 1,
    image: { w: 1024, h: 768 },
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
            { x: 0.6, y: 0.4, type: 'health' },
        ],
    },
    surfaces: [],
    rules: [],
} as SceneResponse;

export function UploadFlow({
    blob,
    photoUrl,
    onRetake,
    onUploadStart,
    onFlowStateChange,
    autoStart = false,
    demoRandom = false,
    mockMode = false,
    mockFallback = false,
    showSceneJson = false,
}: UploadFlowProps) {
    const [state, _setState] = useState<FlowState>(
        autoStart ? "loading" : "idle",
    );

    // Wrapper that notifies parent of state changes
    const setState = useCallback((newState: FlowState) => {
        _setState(newState);
        onFlowStateChange?.(newState);
    }, [onFlowStateChange]);

    // Notify parent of initial state on mount
    useEffect(() => {
        onFlowStateChange?.(autoStart ? "loading" : "idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [requestId, setRequestId] = useState<string>("");
    const [sceneData, setSceneData] = useState<SceneResponse | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [lastRealResponse, setLastRealResponse] =
        useState<SceneResponse | null>(null);
    const [showDebugResponse, setShowDebugResponse] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);

    // Validated scene data for Phaser preview
    const [validatedScene, setValidatedScene] = useState<SceneV1 | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    const performUpload = useCallback(async () => {
        if (!blob) return;

        const newRequestId = makeRequestId();
        setRequestId(newRequestId);
        setState("loading");
        setError(null);

        console.info(`[${formatNow()}] Upload started: ${newRequestId}${mockMode ? ' (MOCK MODE)' : ''}`);

        // Mock mode: return fake data after a short delay
        if (mockMode) {
            await new Promise(resolve => setTimeout(resolve, 800));
            console.info(
                `[${formatNow()}] Mock response: ${newRequestId}`,
                `objects=${(Array.isArray((MOCK_SCENE_RESPONSE as unknown as Record<string, unknown>).objects) ? ((MOCK_SCENE_RESPONSE as unknown as Record<string, unknown>).objects as unknown[]).length : 0)}`,
                `enemies=${MOCK_SCENE_RESPONSE.spawns.enemies.length}`,
                `pickups=${MOCK_SCENE_RESPONSE.spawns.pickups.length}`,
            );
            setLastRealResponse(MOCK_SCENE_RESPONSE);
            setSceneData(MOCK_SCENE_RESPONSE);
            setState("success");
            return;
        }

        try {
            const response = await uploadImageForScene({
                blob,
                requestId: newRequestId,
            });

            setLastRealResponse(response);

            console.info(
                `[${formatNow()}] Upload success: ${newRequestId}`,
                `detections=${response.detections.length}`,
                `enemies=${response.spawns.enemies.length}`,
                `pickups=${response.spawns.pickups.length}`,
            );

            // Apply demo mode logic
            if (demoRandom) {
                if (Math.random() < 0.5) {
                    console.info(`[${formatNow()}] Demo mode: showing fake error`);
                    setError(new Error("Demo mode: simulated failure"));
                    setState("error");
                    return;
                }
            }

            setSceneData(response);
            setState("success");
        } catch (err) {
            const uploadErr = err as UploadError;
            console.error(`[${formatNow()}] Upload failed: ${newRequestId}`, uploadErr.message);

            if (mockFallback) {
                console.info(`[${formatNow()}] Mock fallback: using mock data after error`);
                setLastRealResponse(MOCK_SCENE_RESPONSE);
                setSceneData(MOCK_SCENE_RESPONSE);
                setState("success");
                return;
            }

            setError(uploadErr);
            setState("error");
        }
    }, [blob, demoRandom, mockMode, mockFallback]);

    // Auto-start upload if requested
    useEffect(() => {
        if (autoStart && blob && !hasStarted) {
            setHasStarted(true);
            performUpload();
        }
    }, [autoStart, blob, hasStarted, performUpload]);

    const handleUpload = useCallback(() => {
        if (onUploadStart) {
            onUploadStart();
        }
        performUpload();
    }, [onUploadStart, performUpload]);

    const handleRetry = useCallback(() => {
        performUpload();
    }, [performUpload]);

    const handleUploadAgain = useCallback(() => {
        setState("idle");
        setSceneData(null);
        setError(null);
        setHasStarted(false);
        setValidatedScene(null);
        setValidationErrors([]);
    }, []);

    const handlePreview = useCallback(() => {
        if (!sceneData) return;

        // Validate with Zod before opening Phaser
        const result = parseSceneV1(sceneData);
        if (!result.ok) {
            setValidationErrors(result.errors);
            setState("validationError");
            return;
        }

        setValidatedScene(result.data);
        setState("preview");
    }, [sceneData]);

    const handlePlay = useCallback(() => {
        if (!sceneData) return;

        // Validate with Zod before starting game
        const result = parseSceneV1(sceneData);
        if (!result.ok) {
            setValidationErrors(result.errors);
            setState("validationError");
            return;
        }

        setValidatedScene(result.data);
        setState("play");
    }, [sceneData]);

    const handleBackFromPreview = useCallback(() => {
        setState("success");
    }, []);

    const handleBackFromPlay = useCallback(() => {
        setState("success");
    }, []);

    const handleBackFromValidationError = useCallback(() => {
        setState("success");
    }, []);

    // No blob yet
    if (!blob) {
        return null;
    }

    // Preview screen (full-screen, replaces everything)
    if (state === "preview" && validatedScene && photoUrl) {
        return (
            <PreviewScreen
                photoUrl={photoUrl}
                sceneData={validatedScene}
                onBack={handleBackFromPreview}
            />
        );
    }

    // Play screen (full-screen, replaces everything)
    if (state === "play" && validatedScene && photoUrl) {
        return (
            <PlayScreen
                photoUrl={photoUrl}
                sceneData={validatedScene}
                onBack={handleBackFromPlay}
                onRetake={onRetake}
            />
        );
    }

    // Validation error screen (full-screen)
    if (state === "validationError") {
        return (
            <ValidationErrorScreen
                errors={validationErrors}
                onBack={handleBackFromValidationError}
            />
        );
    }

    return (
        <div className="upload-flow">
            <div className="upload-flow__content">
                {state === "idle" && (
                    <div className="upload-flow__idle">
                        <button
                            className="upload-flow__upload-button"
                            onClick={handleUpload}
                        >
                            <Icon icon={CloudUpload} size={20} /> Upload & Generate Level
                        </button>
                    </div>
                )}

                {state === "loading" && <UploadLoading requestId={requestId} />}

                {state === "success" && sceneData && (
                    <UploadSuccess
                        requestId={requestId}
                        sceneData={sceneData}
                        onUploadAgain={handleUploadAgain}
                        onRetake={onRetake}
                        onPreview={handlePreview}
                        onPlay={handlePlay}
                        showSceneJson={showSceneJson}
                    />
                )}

                {state === "error" && error && (
                    <>
                        <UploadErrorScreen
                            requestId={requestId}
                            error={
                                error as Error & {
                                    status?: number;
                                    responseText?: string;
                                }
                            }
                            onRetry={handleRetry}
                            onRetake={onRetake}
                        />

                        {lastRealResponse && demoRandom && (
                            <div className="debug-response">
                                <button
                                    className="debug-response__toggle"
                                    onClick={() =>
                                        setShowDebugResponse(!showDebugResponse)
                                    }
                                >
                                    <Icon icon={showDebugResponse ? ChevronUp : ChevronDown} size={12} />{" "}Last
                                    Response (debug)
                                </button>
                                {showDebugResponse && (
                                    <div className="debug-response__content">
                                        {JSON.stringify(
                                            lastRealResponse,
                                            null,
                                            2,
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
