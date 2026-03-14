import { useState, useEffect, useRef, useCallback } from 'react';

export const useEditorCanvas = () => {
    const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
    const [canvasScale, setCanvasScale] = useState(1);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
    const spaceHeldRef = useRef(false);
    const canvasViewportRef = useRef<HTMLDivElement | null>(null);
    const hasInitializedCanvas = useRef(false);
    const canvasScaleRef = useRef(canvasScale);

    useEffect(() => {
        canvasScaleRef.current = canvasScale;
    }, [canvasScale]);

    // Center canvas content in viewport on mount
    useEffect(() => {
        if (hasInitializedCanvas.current) return;
        hasInitializedCanvas.current = true;
        const vp = canvasViewportRef.current;
        if (!vp) return;
        const vpWidth = vp.clientWidth;
        // Center the node graph (which starts at x=0) in the viewport
        setCanvasOffset({ x: (vpWidth - 400) / 2, y: 20 });
    }, []);

    // Native wheel listener for ctrl+scroll zoom (React onWheel is passive and can't preventDefault)
    useEffect(() => {
        const vp = canvasViewportRef.current;
        if (!vp) return;
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const rect = vp.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const curScale = canvasScaleRef.current;
                const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
                const newScale = Math.min(2, Math.max(0.25, curScale * zoomFactor));
                const scaleRatio = newScale / curScale;
                setCanvasOffset(prev => ({
                    x: mouseX - scaleRatio * (mouseX - prev.x),
                    y: mouseY - scaleRatio * (mouseY - prev.y),
                }));
                setCanvasScale(newScale);
            } else {
                // Normal scroll → pan
                setCanvasOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
            }
        };
        vp.addEventListener('wheel', handleWheel, { passive: false });
        return () => vp.removeEventListener('wheel', handleWheel);
    }, []);

    const startPanning = useCallback((e: React.PointerEvent) => {
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY, offsetX: canvasOffset.x, offsetY: canvasOffset.y };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }, [canvasOffset]);

    const handlePanning = useCallback((e: PointerEvent) => {
        if (!isPanningRef.current) return;
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setCanvasOffset({ x: panStartRef.current.offsetX + dx, y: panStartRef.current.offsetY + dy });
    }, []);

    const stopPanning = useCallback(() => {
        isPanningRef.current = false;
    }, []);

    return {
        canvasOffset,
        setCanvasOffset,
        canvasScale,
        setCanvasScale,
        canvasViewportRef,
        spaceHeldRef,
        isPanning: isPanningRef,
        startPanning,
        handlePanning,
        stopPanning,
    };
};
