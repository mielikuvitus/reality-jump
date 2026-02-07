/**
 * MOBILE CONTROLS
 * ================
 *
 * Touch-friendly on-screen buttons for the platformer.
 * Writes to a shared InputState object that Phaser reads each frame.
 *
 * Left/Right on the left side, Jump on the right.
 * Glassmorphism styling, large touch targets.
 */

import { useCallback } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { InputState } from '../game/input/InputState';
import { Icon } from './Icon';
import './MobileControls.css';

interface MobileControlsProps {
    inputState: InputState;
    disabled?: boolean;
}

export function MobileControls({ inputState, disabled = false }: MobileControlsProps) {
    const handlePointerDown = useCallback((key: keyof InputState) => {
        if (disabled) return;
        inputState[key] = true;
    }, [inputState, disabled]);

    const handlePointerUp = useCallback((key: keyof InputState) => {
        inputState[key] = false;
    }, [inputState]);

    const bind = (key: keyof InputState) => ({
        onPointerDown: () => handlePointerDown(key),
        onPointerUp: () => handlePointerUp(key),
        onPointerLeave: () => handlePointerUp(key),
        onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); handlePointerDown(key); },
        onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); handlePointerUp(key); },
        onTouchCancel: () => handlePointerUp(key),
    });

    return (
        <div className={`mobile-controls ${disabled ? 'mobile-controls--disabled' : ''}`}>
            <div className="mobile-controls__left">
                <button className="mobile-controls__btn" {...bind('left')}>
                    <Icon icon={ArrowLeft} size={28} />
                </button>
                <button className="mobile-controls__btn" {...bind('right')}>
                    <Icon icon={ArrowRight} size={28} />
                </button>
            </div>
            <div className="mobile-controls__right">
                <button className="mobile-controls__btn mobile-controls__btn--jump" {...bind('jump')}>
                    JUMP
                </button>
            </div>
        </div>
    );
}
