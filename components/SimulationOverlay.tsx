import React, { useRef, useEffect, useState } from 'react';
import { useMapEvents, useMap } from 'react-leaflet';
import { IntersectionStatus, Vehicle } from '../types';

interface SimulationOverlayProps {
    intersections: IntersectionStatus[];
    vehicles: Vehicle[];
    onIntersectionClick: (id: string) => void;
    selectedIntersectionId: string | null;
}

interface RoundaboutVehicle {
    id: string;
    pathType: 'entry' | 'circle' | 'exit';
    startArmIndex: number;
    endArmIndex: number;
    progress: number;
    circleAngle: number;
    exitAngle: number;
    speed: number;
    color: string;
    trail: { x: number; y: number; angle: number }[];
}

// Helpers for OSM geometry
const distHaversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const getBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

export const SimulationOverlay: React.FC<SimulationOverlayProps> = ({ intersections, selectedIntersectionId }) => {
    const map = useMap();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number | null>(null);
    const vehiclesRef = useRef<RoundaboutVehicle[]>([]);
    const mousePosRef = useRef<{ x: number, y: number } | null>(null);

    const signalTimerRef = useRef<number>(0);
    const getRoadData = (inter: IntersectionStatus) => {
        const isRoundabout = inter.type === 'ROUNDABOUT';
        let armAngles = [0, 90, 180, 270]; // Default FOUR_WAY
        if (inter.armAngles && inter.armAngles.length > 0) {
            armAngles = inter.armAngles;
        } else if (isRoundabout) {
            armAngles = [0, 60, 120, 180, 240, 300];
        } else if (inter.type === 'T') {
            armAngles = [0, 90, 180];
        } else if (inter.type === 'COMPLEX') {
            armAngles = [0, 72, 144, 216, 288];
        }

        const arms = armAngles.map(angle => ({
            angle: (angle - 90) * (Math.PI / 180),
            length: 50,
            path: [] as { lat: number, lng: number }[]
        }));

        return { snapCenter: { lat: inter.lat, lng: inter.lng }, arms };
    };

    const samplePolyline = (pts: { x: number, y: number }[], t: number) => {
        if (!pts || pts.length < 2) return pts?.[0] ? { ...pts[0], angle: 0 } : { x: 0, y: 0, angle: 0 };
        if (t <= 0) return { ...pts[0], angle: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) };
        if (t >= 1) return { ...pts[pts.length - 1], angle: Math.atan2(pts[pts.length - 1].y - pts[pts.length - 2].y, pts[pts.length - 1].x - pts[pts.length - 2].x) };

        let totalLen = 0;
        const lens: number[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const d = Math.sqrt((pts[i + 1].x - pts[i].x) ** 2 + (pts[i + 1].y - pts[i].y) ** 2);
            lens.push(d);
            totalLen += d;
        }

        const targetDist = t * totalLen;
        let currDist = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            if (currDist + lens[i] >= targetDist) {
                const segT = lens[i] > 0 ? (targetDist - currDist) / lens[i] : 0;
                return {
                    x: pts[i].x + (pts[i + 1].x - pts[i].x) * segT,
                    y: pts[i].y + (pts[i + 1].y - pts[i].y) * segT,
                    angle: Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
                };
            }
            currDist += lens[i];
        }
        return { ...pts[pts.length - 1], angle: 0 };
    };

    const resizeCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const size = map.getSize();
        if (canvas.width !== size.x || canvas.height !== size.y) {
            canvas.width = size.x;
            canvas.height = size.y;
        }
    };

    useMapEvents({
        mousemove: (e) => {
            const pt = map.latLngToContainerPoint(e.latlng);
            mousePosRef.current = { x: pt.x, y: pt.y };
        },
        mouseout: () => {
            mousePosRef.current = null;
        },
        move: resizeCanvas,
        zoom: resizeCanvas,
        viewreset: resizeCanvas,
        resize: resizeCanvas
    });

    // OSM Fetching removed to prevent 429 Rate Limits
    useEffect(() => {
        // We now rely purely on real intersection coordinates passed via props
    }, [intersections]);

    useEffect(() => {
        resizeCanvas();

        const draw = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const zoom = map.getZoom();
            if (zoom < 15) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                animationFrameRef.current = requestAnimationFrame(draw);
                return;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const scale = Math.pow(2, zoom - 17);
            const circleRadius = 18 * scale;
            const isHighZoom = zoom >= 17;

            // --- 1. Map Mask Layer (Fade background tiles) removed per user request to preserve map brightness ---

            // --- 2. Signal Logic ---
            signalTimerRef.current += 1;
            const getSignalInfo = (index: number) => {
                const cycleTime = 600;
                const offset = index * (cycleTime / 6);
                const localTime = (signalTimerRef.current + offset) % cycleTime;
                if (localTime < cycleTime * 0.6) return 'RED';
                if (localTime < cycleTime * 0.7) return 'YELLOW';
                return 'GREEN';
            };

            // --- 2. Per-Intersection Rendering ---
            intersections.forEach(inter => {
                const { snapCenter, arms } = getRoadData(inter);
                const centerPoint = map.latLngToContainerPoint(snapCenter);
                const ix = centerPoint.x, iy = centerPoint.y;

                const roadColor = isHighZoom ? '#3a3f45' : '#2c2f33';
                const markingColor = '#e0e0e0';
                const roadWidth = 14 * scale;
                const hw = roadWidth / 2;

                // Precompute arm points
                const processedArms = arms.map(arm => {
                    let pts: { x: number, y: number }[] = [];
                    if (arm.path && arm.path.length > 1) {
                        pts = arm.path.map(pt => map.latLngToContainerPoint(pt));
                    } else {
                        const armLen = arm.length * scale;
                        pts = [
                            { x: ix, y: iy },
                            { x: ix + Math.cos(arm.angle) * armLen, y: iy + Math.sin(arm.angle) * armLen }
                        ];
                    }
                    const totalLen = Math.sqrt((pts[pts.length - 1].x - pts[0].x) ** 2 + (pts[pts.length - 1].y - pts[0].y) ** 2) || 1;
                    return { ...arm, pts, totalLen };
                });

                // Background Glow/Blend (only at low zoom for feathered style)
                if (!isHighZoom) {
                    const radialGrad = ctx.createRadialGradient(ix, iy, circleRadius, ix, iy, circleRadius * 4);
                    radialGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
                    radialGrad.addColorStop(1, 'transparent');
                    ctx.fillStyle = radialGrad;
                    ctx.beginPath(); ctx.arc(ix, iy, circleRadius * 4, 0, Math.PI * 2); ctx.fill();
                }

                if (inter.density > 0.4) {
                    ctx.save();
                    ctx.shadowBlur = 15 * scale;
                    ctx.shadowColor = 'rgba(0, 255, 150, 0.4)';
                    ctx.fillStyle = 'rgba(0, 255, 150, 0.1)';
                    ctx.beginPath(); ctx.arc(ix, iy, circleRadius + 10 * scale, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }

                // PASS 1: Road Surfaces
                processedArms.forEach((arm) => {
                    const { pts } = arm;
                    ctx.save();
                    ctx.lineCap = isHighZoom ? 'butt' : 'round';
                    ctx.lineJoin = 'round';
                    ctx.lineWidth = roadWidth;

                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);

                    if (isHighZoom) {
                        ctx.strokeStyle = roadColor;
                    } else {
                        const armGrad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
                        armGrad.addColorStop(0, roadColor);
                        armGrad.addColorStop(0.8, roadColor);
                        armGrad.addColorStop(1, 'transparent');
                        ctx.strokeStyle = armGrad;
                    }
                    ctx.stroke();
                    ctx.restore();
                });

                // PASS 2: Intersection Center (Solid block for SUMO style with glow)
                if (isHighZoom) {
                    ctx.save();
                    ctx.shadowBlur = 20 * scale;
                    ctx.shadowColor = 'rgba(0, 255, 180, 0.25)';
                    ctx.fillStyle = roadColor;
                    ctx.beginPath();
                    ctx.arc(ix, iy, circleRadius + 2 * scale, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }

                // PASS 3: Road Details (Zebra Crossings, Stop Lines, Dividers)
                processedArms.forEach((arm, i) => {
                    const { pts, totalLen } = arm;

                    // Lane Divider
                    ctx.save();
                    ctx.strokeStyle = markingColor;
                    ctx.globalAlpha = 0.7;
                    ctx.lineWidth = isHighZoom ? 1.5 * scale : 1 * scale;
                    ctx.setLineDash([6 * scale, 6 * scale]);
                    ctx.beginPath();

                    const divStartDist = isHighZoom ? circleRadius + 20 * scale : circleRadius;
                    const divStartPt = samplePolyline(pts, Math.min(1, divStartDist / totalLen));
                    ctx.moveTo(divStartPt.x, divStartPt.y);
                    for (let j = 1; j < pts.length; j++) {
                        // Rough check to prevent drawing inside the intersection
                        const d = Math.sqrt((pts[j].x - ix) ** 2 + (pts[j].y - iy) ** 2);
                        if (d >= divStartDist) {
                            ctx.lineTo(pts[j].x, pts[j].y);
                        }
                    }
                    ctx.stroke();
                    ctx.restore();

                    // Road Boundaries (SUMO style)
                    if (isHighZoom) {
                        ctx.save();
                        ctx.strokeStyle = markingColor;
                        ctx.lineWidth = 1 * scale;
                        ctx.beginPath();
                        // Draw boundaries approx
                        const boundStartPt = samplePolyline(pts, Math.min(1, (circleRadius - 2 * scale) / totalLen));
                        const nx = -Math.sin(boundStartPt.angle), ny = Math.cos(boundStartPt.angle);

                        // We would need to offset the entire polyline. For now, just drawing simple side segments starting past crosswalk
                        const sideStartDist = circleRadius + 2 * scale;
                        const sideStartPt = samplePolyline(pts, sideStartDist / totalLen);
                        const s_nx = -Math.sin(sideStartPt.angle), s_ny = Math.cos(sideStartPt.angle);

                        // Right edge
                        ctx.moveTo(sideStartPt.x + s_nx * hw, sideStartPt.y + s_ny * hw);
                        ctx.lineTo(pts[pts.length - 1].x + s_nx * hw, pts[pts.length - 1].y + s_ny * hw);

                        // Left edge
                        ctx.moveTo(sideStartPt.x - s_nx * hw, sideStartPt.y - s_ny * hw);
                        ctx.lineTo(pts[pts.length - 1].x - s_nx * hw, pts[pts.length - 1].y - s_ny * hw);
                        ctx.stroke();
                        ctx.restore();
                    }

                    // Zebra Crossing and Stop Line
                    if (isHighZoom) {
                        const crossDist = circleRadius + 5 * scale;
                        const crossPt = samplePolyline(pts, crossDist / totalLen);
                        const nx = -Math.sin(crossPt.angle);
                        const ny = Math.cos(crossPt.angle);

                        // Draw Zebra stripes
                        ctx.save();
                        ctx.fillStyle = markingColor;
                        const numStripes = 6;
                        const stripeWidth = 2 * scale;
                        const stripeLen = 10 * scale;
                        const gap = roadWidth / numStripes;
                        for (let s = 0; s < numStripes; s++) {
                            const offset = -hw + gap / 2 + s * gap;
                            const sx = crossPt.x + nx * offset;
                            const sy = crossPt.y + ny * offset;

                            ctx.translate(sx, sy);
                            ctx.rotate(crossPt.angle);
                            ctx.fillRect(-stripeLen / 2, -stripeWidth / 2, stripeLen, stripeWidth);
                            ctx.rotate(-crossPt.angle);
                            ctx.translate(-sx, -sy);
                        }
                        ctx.restore();

                        // Stop line (thick behind zebra crossing)
                        const stopDist = crossDist + 8 * scale;
                        const stopPt = samplePolyline(pts, stopDist / totalLen);
                        const st_nx = -Math.sin(stopPt.angle), st_ny = Math.cos(stopPt.angle);
                        ctx.strokeStyle = markingColor;
                        ctx.lineWidth = 3 * scale;
                        ctx.beginPath();
                        ctx.moveTo(stopPt.x - st_nx * hw, stopPt.y - st_ny * hw);
                        ctx.lineTo(stopPt.x + st_nx * hw, stopPt.y + st_ny * hw);
                        ctx.stroke();
                    } else {
                        // Standard low-zoom stop line
                        const stopDist = circleRadius + 15 * scale;
                        const stopPt = samplePolyline(pts, stopDist / totalLen || 0.1);
                        const nx = -Math.sin(stopPt.angle), ny = Math.cos(stopPt.angle);
                        ctx.strokeStyle = '#cfd3d7';
                        ctx.lineWidth = 3 * scale;
                        ctx.beginPath();
                        ctx.moveTo(stopPt.x - nx * 14 * scale, stopPt.y - ny * 14 * scale);
                        ctx.lineTo(stopPt.x + nx * 14 * scale, stopPt.y + ny * 14 * scale);
                        ctx.stroke();
                    }

                    // Signal Indicator
                    const sigDist = circleRadius + (isHighZoom ? 25 * scale : 35 * scale);
                    const sigPt = samplePolyline(pts, sigDist / totalLen || 0.2);
                    const state = getSignalInfo(i);
                    ctx.fillStyle = '#1e293b';
                    ctx.fillRect(sigPt.x - 4 * scale, sigPt.y - 18 * scale, 8 * scale, 18 * scale);

                    const drawLamp = (color: string, idx: number, active: boolean) => {
                        ctx.save();
                        ctx.globalAlpha = active ? 1 : 0.2;
                        ctx.fillStyle = active ? color : '#0f172a';
                        if (active) { ctx.shadowBlur = 8 * scale; ctx.shadowColor = color; }
                        ctx.beginPath(); ctx.arc(sigPt.x, sigPt.y - 15 * scale + idx * 5 * scale, 2.5 * scale, 0, Math.PI * 2); ctx.fill();
                        ctx.restore();
                    };
                    drawLamp('#ef4444', 0, state === 'RED');
                    drawLamp('#f59e0b', 1, state === 'YELLOW');
                    drawLamp('#22c55e', 2, state === 'GREEN');
                });

                // HUD Label
                const isHovered = mousePosRef.current && 
                    Math.sqrt(Math.pow(mousePosRef.current.x - ix, 2) + Math.pow(mousePosRef.current.y - iy, 2)) < (circleRadius + 15 * scale);
                
                if (zoom >= 17 && isHovered) {
                    ctx.save();
                    ctx.translate(ix + 20 * scale, iy - 70 * scale);
                    ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
                    ctx.strokeStyle = '#0ea5e9';
                    ctx.strokeRect(0, 0, 80 * scale, 45 * scale);
                    ctx.fillRect(0, 0, 80 * scale, 45 * scale);
                    ctx.fillStyle = '#0ea5e9';
                    ctx.font = `bold ${Math.floor(10 * scale)}px monospace`;
                    ctx.fillText(inter.id.substring(0, 8), 5 * scale, 15 * scale);
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = `${Math.floor(8 * scale)}px sans-serif`;
                    ctx.fillText(`FLOW: ${Math.floor(inter.density * 100)}%`, 5 * scale, 28 * scale);
                    ctx.fillText(`WAIT: ${Math.floor(inter.density * 50)}s`, 5 * scale, 38 * scale);
                    ctx.restore();
                }

                // --- 3. Vehicle Simulation (Local Spawn) ---
                if (vehiclesRef.current.length < 25 && Math.random() < 0.05) {
                    const startArmIdx = Math.floor(Math.random() * arms.length);
                    let endArmIdx = Math.floor(Math.random() * arms.length);
                    while (endArmIdx === startArmIdx) endArmIdx = Math.floor(Math.random() * arms.length);

                    vehiclesRef.current.push({
                        id: `v-${Math.random()}`,
                        pathType: 'entry',
                        startArmIndex: startArmIdx,
                        endArmIndex: endArmIdx,
                        progress: 0,
                        circleAngle: arms[startArmIdx].angle,
                        exitAngle: arms[endArmIdx].angle,
                        speed: (1.4 + Math.random()) * scale,
                        color: '#f8fafc',
                        trail: []
                    });
                }
            });

            // --- 4. Global Vehicle Update & Render ---
            vehiclesRef.current = vehiclesRef.current.map(v => {
                const inter = intersections.find(i => i.type === 'ROUNDABOUT') || intersections[0];
                const { snapCenter, arms } = getRoadData(inter);
                const arm = arms[v.startArmIndex];
                const exitArm = arms[v.endArmIndex];
                if (!arm || !exitArm) return v;

                const centerPoint = map.latLngToContainerPoint(snapCenter);
                const ix = centerPoint.x, iy = centerPoint.y;

                const entryPts = arm.path && arm.path.length > 1 ? arm.path.map(pt => map.latLngToContainerPoint(pt)) : [{ x: ix, y: iy }, { x: ix + Math.cos(arm.angle) * 120 * scale, y: iy + Math.sin(arm.angle) * 120 * scale }];
                const exitPts = exitArm.path && exitArm.path.length > 1 ? exitArm.path.map(pt => map.latLngToContainerPoint(pt)) : [{ x: ix, y: iy }, { x: ix + Math.cos(exitArm.angle) * 120 * scale, y: iy + Math.sin(exitArm.angle) * 120 * scale }];

                // The path 0 index is the intersection center.
                // An entering vehicle travels from t=1 to t=0
                // An exiting vehicle travels from t=0.1 to t=1

                const armLen = arm.length * scale || 150 * scale;
                const sigState = getSignalInfo(v.startArmIndex);

                if (v.pathType === 'entry') {
                    if (v.progress > 0.65 && v.progress < 0.7 && sigState === 'RED') return v;
                    v.progress += (v.speed / armLen);
                    if (v.progress >= 0.85) { v.pathType = 'circle'; }
                } else if (v.pathType === 'circle') {
                    v.circleAngle += (v.speed / 1.5) / circleRadius;
                    let diff = v.circleAngle - v.exitAngle;
                    while (diff < 0) diff += Math.PI * 2;
                    while (diff > Math.PI * 2) diff -= Math.PI * 2;
                    if (diff < 0.1) { v.pathType = 'exit'; v.progress = 0.1; }
                } else {
                    v.progress += (v.speed / armLen);
                }

                let vx, vy, vAngle;

                if (v.pathType === 'entry') {
                    const t = 1.0 - v.progress;
                    const sample = samplePolyline(entryPts, t);
                    vx = sample.x; vy = sample.y; vAngle = sample.angle + Math.PI; // flip towards center
                } else if (v.pathType === 'circle') {
                    // Start of circle is entryPts near t=0 (e.g. t=0.15)
                    const p0 = samplePolyline(entryPts, 0.15);
                    const p2 = samplePolyline(exitPts, 0.15);
                    const p1 = { x: ix, y: iy }; // Control point = intersection center

                    // Convert angle diff to normalize bezier bounds (since circleAngle ticks linearly)
                    let entryAng = arm.angle;
                    let exitAng = exitArm.angle;
                    let totalArc = exitAng - entryAng;
                    while (totalArc < 0) totalArc += Math.PI * 2;
                    let currentArc = v.circleAngle - entryAng;
                    while (currentArc < 0) currentArc += Math.PI * 2;

                    let bt = currentArc / totalArc;
                    if (bt > 1) bt = 1; if (bt < 0) bt = 0;

                    const mt = 1 - bt;
                    vx = mt * mt * p0.x + 2 * mt * bt * p1.x + bt * bt * p2.x;
                    vy = mt * mt * p0.y + 2 * mt * bt * p1.y + bt * bt * p2.y;
                    const dx = 2 * mt * (p1.x - p0.x) + 2 * bt * (p2.x - p1.x);
                    const dy = 2 * mt * (p1.y - p0.y) + 2 * bt * (p2.y - p1.y);
                    vAngle = Math.atan2(dy, dx);
                } else {
                    const sample = samplePolyline(exitPts, v.progress);
                    vx = sample.x; vy = sample.y; vAngle = sample.angle;
                }

                // Render Vehicle
                v.trail.push({ x: vx, y: vy, angle: vAngle });
                if (v.trail.length > 15) v.trail.shift();

                v.trail.forEach((t, idx) => {
                    ctx.save();
                    ctx.translate(t.x, t.y);
                    ctx.rotate(t.angle + Math.PI / 2);
                    ctx.fillStyle = v.color;
                    ctx.globalAlpha = (idx / v.trail.length) * 0.3;
                    ctx.fillRect(-2 * scale, -2 * scale, 4 * scale, 6 * scale);
                    ctx.restore();
                });

                ctx.save();
                ctx.translate(vx, vy);
                ctx.rotate(vAngle + Math.PI / 2);
                ctx.fillStyle = v.color;
                ctx.fillRect(-2 * scale, -4 * scale, 4 * scale, 8 * scale);
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0, -4 * scale, 1 * scale, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                return v;
            }).filter(v => v.progress < 1.0);

            animationFrameRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
    }, [map, intersections]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: 1000,
                width: '100%',
                height: '100%'
            }}
        />
    );
};

export default SimulationOverlay;
