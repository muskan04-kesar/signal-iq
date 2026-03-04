import React, { useRef, useEffect, useMemo } from 'react';
import { useMapEvents, useMap } from 'react-leaflet';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { IntersectionStatus, Vehicle } from '../types';

interface SimulationOverlayProps {
    intersections: IntersectionStatus[];
    vehicles: Vehicle[];
    onIntersectionClick: (id: string) => void;
    selectedIntersectionId: string | null;
}

export const SimulationOverlay: React.FC<SimulationOverlayProps> = ({ intersections, vehicles, onIntersectionClick, selectedIntersectionId }) => {
    const map = useMap();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Synchronize canvas size and position with Leaflet's layer system
    const syncCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const size = map.getSize();
        // The top-left corner of the viewport in layer points
        const topLeft = map.containerPointToLayerPoint([0, 0]);

        // Anchor the canvas to the top-left of the viewport within the overlay pane
        L.DomUtil.setPosition(canvas, topLeft);

        // Match the viewport size
        if (canvas.width !== size.x || canvas.height !== size.y) {
            canvas.width = size.x;
            canvas.height = size.y;
        }
    };

    useMapEvents({
        move: () => syncCanvas(),
        zoom: () => syncCanvas(),
        viewreset: () => syncCanvas(),
        resize: () => syncCanvas()
    });

    useEffect(() => {
        syncCanvas();

        const draw = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const zoom = map.getZoom();
            if (zoom < 17) return; // safety check

            const scaleFactor = Math.pow(2, zoom - 18);
            const roadWidth = 44 * scaleFactor;
            const roadLength = 160 * scaleFactor;

            // Get current viewport origin in layer points for relative drawing
            const topLeft = map.containerPointToLayerPoint([0, 0]);

            // If we have a selected intersection, identify its row/col for vehicle filtering
            let selectedRow: number | null = null;
            let selectedCol: number | null = null;

            if (selectedIntersectionId && intersections.length > 0) {
                const target = intersections.find(i => i.id === selectedIntersectionId) || intersections[0];
                selectedRow = Math.round((target.lat - 28.6327) / 0.003) + 2;
                selectedCol = Math.round((target.lng - 77.2197) / 0.003) + 2;
            }

            // Draw each intersection
            intersections.forEach(inter => {
                const layerPoint = map.latLngToLayerPoint([inter.lat, inter.lng]);
                const x = layerPoint.x - topLeft.x;
                const y = layerPoint.y - topLeft.y;

                ctx.save();
                ctx.translate(x, y);

                // --- 1. Asphalt Foundation ---
                ctx.fillStyle = '#111218'; // Darker, more matte asphalt

                // EW Road
                ctx.fillRect(-roadLength / 2, -roadWidth / 2, roadLength, roadWidth);
                // NS Road
                ctx.fillRect(-roadWidth / 2, -roadLength / 2, roadWidth, roadLength);

                // --- 2. Inner Shadow / Depth ---
                ctx.save();
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = 4 * scaleFactor;
                ctx.shadowBlur = 10 * scaleFactor;
                ctx.shadowColor = 'black';

                // Draw edges to create "inner shadow" effect
                ctx.strokeRect(-roadLength / 2, -roadWidth / 2, roadLength, roadWidth);
                ctx.strokeRect(-roadWidth / 2, -roadLength / 2, roadWidth, roadLength);
                ctx.restore();

                // --- 3. Road Texture (Subtle Grain) ---
                ctx.save();
                ctx.globalAlpha = 0.05;
                for (let i = 0; i < 150; i++) {
                    const gx = Math.random() * roadLength - roadLength / 2;
                    const gy = Math.random() * roadWidth - roadWidth / 2;
                    ctx.fillStyle = Math.random() > 0.5 ? 'white' : 'black';
                    ctx.fillRect(gx, gy, 1, 1);
                    ctx.fillRect(gy, gx, 1, 1);
                }
                ctx.restore();

                // --- 4. Markings ---
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.lineWidth = 1.2 * scaleFactor;
                ctx.setLineDash([8 * scaleFactor, 12 * scaleFactor]);

                ctx.beginPath();
                ctx.moveTo(-roadLength / 2, 0); ctx.lineTo(roadLength / 2, 0);
                ctx.moveTo(0, -roadLength / 2); ctx.lineTo(0, roadLength / 2);
                ctx.stroke();
                ctx.setLineDash([]);

                // Stop Lines & Intersection Cross
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 2.5 * scaleFactor;
                ctx.beginPath();
                // Corners of the center square
                const sw = roadWidth / 2;
                ctx.moveTo(-sw, -sw); ctx.lineTo(sw, -sw);
                ctx.moveTo(-sw, sw); ctx.lineTo(sw, sw);
                ctx.moveTo(-sw, -sw); ctx.lineTo(-sw, sw);
                ctx.moveTo(sw, -sw); ctx.lineTo(sw, sw);
                ctx.stroke();

                // --- 5. Signal Equipment ---
                const drawSignalModel = (sx: number, sy: number, state: string, angle: number) => {
                    ctx.save();
                    ctx.translate(sx, sy);
                    ctx.rotate(angle);

                    // Signal Arm/Pole
                    ctx.fillStyle = '#2d3748';
                    ctx.fillRect(0, -2 * scaleFactor, 15 * scaleFactor, 4 * scaleFactor);

                    // Signal Head
                    ctx.fillStyle = '#1a202c';
                    // Check if roundRect is available, otherwise fallback to rect
                    if (typeof ctx.roundRect === 'function') {
                        ctx.roundRect(10 * scaleFactor, -6 * scaleFactor, 10 * scaleFactor, 18 * scaleFactor, 2 * scaleFactor);
                    } else {
                        ctx.fillRect(10 * scaleFactor, -6 * scaleFactor, 10 * scaleFactor, 18 * scaleFactor);
                    }
                    ctx.fill();

                    // Lights
                    const colors = state === 'RED' ? ['#ef4444', '#1a202c', '#1a202c'] :
                        state === 'YELLOW' ? ['#1a202c', '#f59e0b', '#1a202c'] :
                            ['#1a202c', '#1a202c', '#10b981'];

                    colors.forEach((c, i) => {
                        ctx.fillStyle = c;
                        if (c !== '#1a202c') {
                            ctx.shadowBlur = 12 * scaleFactor;
                            ctx.shadowColor = c;
                        }
                        ctx.beginPath();
                        ctx.arc(15 * scaleFactor, -2 * scaleFactor + (i * 5 * scaleFactor), 1.8 * scaleFactor, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                    });
                    ctx.restore();
                };

                const off = roadWidth / 1.8;
                drawSignalModel(-off, -off, inter.nsSignal, 0);
                drawSignalModel(off, -off, inter.ewSignal, Math.PI / 2);
                drawSignalModel(off, off, inter.nsSignal, Math.PI);
                drawSignalModel(-off, off, inter.ewSignal, -Math.PI / 2);

                ctx.restore();
            });

            // Draw Vehicles
            vehicles.forEach(vehicle => {
                const roadType = vehicle.laneId.startsWith('H') ? 'H' : 'V';
                const roadIdx = parseInt(vehicle.laneId.substring(1));

                if (selectedRow !== null && selectedCol !== null) {
                    if (roadType === 'H' && roadIdx !== selectedRow) return;
                    if (roadType === 'V' && roadIdx !== selectedCol) return;
                }

                const lat = roadType === 'H' ? 28.6327 + (roadIdx - 2) * 0.003 : 28.6327;
                const lng = roadType === 'V' ? 77.2197 + (roadIdx - 2) * 0.003 : 77.2197;

                const posOffset = (vehicle.position / 100) * 0.012 - 0.006;
                const vLat = roadType === 'V' ? lat + (vehicle.direction === 'north' ? -posOffset : posOffset) : lat;
                const vLng = roadType === 'H' ? lng + (vehicle.direction === 'west' ? -posOffset : posOffset) : lng;

                const layerPoint = map.latLngToLayerPoint([vLat, vLng]);
                const vx = layerPoint.x - topLeft.x;
                const vy = layerPoint.y - topLeft.y;

                ctx.save();
                ctx.translate(vx, vy);
                if (roadType === 'V') ctx.rotate(Math.PI / 2);
                if (vehicle.direction === 'north' || vehicle.direction === 'west') ctx.rotate(Math.PI);

                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                ctx.fillRect(-6 * scaleFactor, -1 * scaleFactor, 13 * scaleFactor, 7 * scaleFactor);

                // Body
                const vColor = vehicle.type === 'emergency' ? '#3b82f6' : '#cbd5e1';
                ctx.fillStyle = vColor;
                if (vehicle.type === 'emergency') {
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#3b82f6';
                }

                const vw = 12 * scaleFactor;
                const vh = 6 * scaleFactor;
                // Check if roundRect is available, otherwise fallback to rect
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(-vw / 2, -vh / 2, vw, vh, 1 * scaleFactor);
                } else {
                    ctx.fillRect(-vw / 2, -vh / 2, vw, vh);
                }
                ctx.fill();

                // Detailed Windows
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(vw / 6, -vh / 2.5, vw / 8, vh / 1.25); // Windshield
                ctx.fillRect(-vw / 3, -vh / 2.5, vw / 4, vh / 1.25); // Rear

                // Lights
                if (vehicle.speed > 0) {
                    // Front Headlights
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.beginPath();
                    ctx.arc(vw / 2, -vh / 3.5, 0.8 * scaleFactor, 0, Math.PI * 2);
                    ctx.arc(vw / 2, vh / 3.5, 0.8 * scaleFactor, 0, Math.PI * 2);
                    ctx.fill();

                    // Rear Tail Lights
                    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
                    ctx.beginPath();
                    ctx.arc(-vw / 2, -vh / 3.5, 0.6 * scaleFactor, 0, Math.PI * 2);
                    ctx.arc(-vw / 2, vh / 3.5, 0.6 * scaleFactor, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            });

            animationFrameRef.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [intersections, vehicles, selectedIntersectionId, map]);

    // Render the canvas into Leaflet's overlayPane to ensure GPU-accelerated sync
    const pane = map.getPane('overlayPane');
    if (!pane) return null;

    return createPortal(
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                pointerEvents: 'none',
                zIndex: 400,
                // Use will-change to hint browser about upcoming transforms during pan
                willChange: 'transform'
            }}
        />,
        pane
    );
};

export default SimulationOverlay;
