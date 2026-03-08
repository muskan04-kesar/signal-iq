import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMapEvents, useMap, Tooltip, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { IntersectionStatus, Vehicle } from '../types';
import SimulationOverlay from './SimulationOverlay';
import { CIVIL_LINES_EDGES } from '../data/civilLinesEdges';

// Zoom Level Tracker
const ZoomLevelTracker = ({ onChange }: { onChange: (zoom: number) => void }) => {
    const map = useMapEvents({
        zoomend: () => {
            onChange(map.getZoom());
        },
    });
    return null;
};

// Map flyTo Controller
const MapFlyTo = ({ target }: { target: { lat: number, lng: number } | null }) => {
    const map = useMap();
    useEffect(() => {
        if (target) {
            map.flyTo([target.lat, target.lng], 18, {
                duration: 1.5,
                easeLinearity: 0.25
            });
        }
    }, [target, map]);
    return null;
};

interface CityMapProps {
    intersections: IntersectionStatus[];
    vehicles: Vehicle[];
    emergencyActive: boolean;
    emergencyVehicle: any;
    onIntersectionClick: (id: string) => void;
    showHeatmapEdges?: boolean;
}

const CityMap: React.FC<CityMapProps> = ({ intersections, vehicles, emergencyActive, emergencyVehicle, onIntersectionClick, showHeatmapEdges = false }) => {
    const [zoom, setZoom] = useState(13);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [flyToTarget, setFlyToTarget] = useState<{ lat: number, lng: number } | null>(null);

    const center: [number, number] = [25.473034, 81.878357]; // Subhash Chauraha
    const zoomLevel = 17;

    const handleNodeClick = useCallback((inter: IntersectionStatus) => {
        setSelectedId(inter.id);
        setFlyToTarget({ lat: inter.lat, lng: inter.lng });
        onIntersectionClick(inter.id);
    }, [onIntersectionClick]);

    // Helper to get color based on type
    const getTypeColor = (type?: string) => {
        switch (type) {
            case 'T': return '#ffd000';
            case 'FOUR_WAY': return '#00ffa6';
            case 'COMPLEX': return '#ff8c00';
            case 'ROUNDABOUT': return '#00aaff';
            case 'TRAFFIC_SIGNAL': return '#00ffa6';
            default: return '#00ffa6';
        }
    };

    const getTypeRadius = (type?: string) => {
        switch (type) {
            case 'T': return 7;
            case 'FOUR_WAY': return 9;
            case 'COMPLEX': return 10;
            case 'ROUNDABOUT': return 12;
            default: return 9;
        }
    };

    // Helper to get color based on density
    const getDensityColor = (density: number) => {
        if (density > 0.7) return '#ef4444'; // Red
        if (density > 0.4) return '#f59e0b'; // Amber
        return '#3b82f6'; // Blue
    };

    const getGlowColor = (density: number) => {
        if (density > 0.7) return 'rgba(239, 68, 68, 0.4)'; // Red glow
        if (density > 0.4) return 'rgba(245, 158, 11, 0.4)'; // Amber glow
        return 'rgba(59, 130, 246, 0.4)'; // Blue glow
    };

    // Emergency Path (Just pick a simple path from real intersections)
    const emergencyPath: [number, number][] = intersections
        .slice(0, 5)
        .map(i => [i.lat, i.lng]);

    return (
        <div className="w-full h-full relative">
            <MapContainer
                center={[25.4515, 81.835]}
                zoom={15}
                minZoom={14}
                maxZoom={18}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%', background: '#0a0b1e' }}
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                <ZoomLevelTracker onChange={setZoom} />
                <MapFlyTo target={flyToTarget} />

                {/* Heatmap Glowing Connections */}
                {showHeatmapEdges && CIVIL_LINES_EDGES.map((edge, idx) => {
                    const sourceNode = intersections.find(i => i.id === edge.source);
                    const targetNode = intersections.find(i => i.id === edge.target);
                    if (!sourceNode || !targetNode) return null;
                    
                    // The heat is the max density of the two connecting nodes
                    const edgeDensity = Math.max(sourceNode.density || 0, targetNode.density || 0);
                    const color = getDensityColor(edgeDensity);
                    const glow = getGlowColor(edgeDensity);

                    return (
                        <React.Fragment key={`edge-${idx}`}>
                            {/* Outer Glow */}
                            <Polyline
                                positions={[[sourceNode.lat, sourceNode.lng], [targetNode.lat, targetNode.lng]]}
                                color={color}
                                weight={12}
                                opacity={0.25}
                                interactive={false}
                            />
                            {/* Inner Core */}
                            <Polyline
                                positions={[[sourceNode.lat, sourceNode.lng], [targetNode.lat, targetNode.lng]]}
                                color={color}
                                weight={4}
                                opacity={0.9}
                                interactive={false}
                            />
                        </React.Fragment>
                    );
                })}

                {/* ZOOM 12-14: Heat Circles */}
                {zoom >= 12 && zoom <= 14 && intersections.map(inter => (
                    <CircleMarker
                        key={inter.id}
                        center={[inter.lat, inter.lng]}
                        radius={selectedId === inter.id ? 20 : 15}
                        fillColor={getDensityColor(inter.density)}
                        color={selectedId === inter.id ? '#ffffff' : 'none'}
                        weight={2}
                        fillOpacity={0.6}
                        eventHandlers={{
                            click: () => handleNodeClick(inter)
                        }}
                    >
                        <Tooltip>
                            <div className="bg-slate-900 text-white p-2 rounded border border-slate-700">
                                <div className="font-bold">{inter.id}</div>
                                <div className="text-xs">Density: {(inter.density * 100).toFixed(0)}%</div>
                            </div>
                        </Tooltip>
                    </CircleMarker>
                ))}


                
                {/* ZOOM 15+: Glowing Nodes (Kept visible endlessly on Heatmap Mode) */}
                {(zoom >= 15 && (zoom <= 17 || showHeatmapEdges)) && intersections.map(inter => (
                    <CircleMarker
                        key={inter.id}
                        center={[inter.lat, inter.lng]}
                        radius={9}
                        color="#00ffa6"
                        fillColor="#00ffa6"
                        weight={2}
                        fillOpacity={0.9}
                        pathOptions={{
                            color: "#00ffa6",
                        }}
                        className={`leaflet-intersection-node ${selectedId === inter.id ? "selected-intersection-pulse" : ""}`}
                        eventHandlers={{
                            click: () => handleNodeClick(inter)
                        }}
                    >
                        <Tooltip>
                            <div className="bg-slate-900 text-white p-2 rounded border border-slate-700">
                                <span className="font-bold">Intersection {inter.id}</span><br />
                                <span className="text-xs">Type: {inter.type} | NS: {inter.nsSignal} | EW: {inter.ewSignal}</span>
                                <div className="w-full h-1 bg-slate-800 mt-1 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500" style={{ width: `${inter.density * 100}%` }}></div>
                                </div>
                            </div>
                        </Tooltip>
                    </CircleMarker>
                ))}

                <style>{`
                    .leaflet-intersection-node {
                        filter: drop-shadow(0 0 6px #00ffa6);
                    }
                    .selected-intersection-pulse {
                        filter: drop-shadow(0 0 12px #3b82f6);
                        stroke-width: 4px;
                        animation: active-glow 2s infinite alternate;
                    }
                    @keyframes active-glow {
                        from { filter: drop-shadow(0 0 8px #3b82f6); opacity: 0.8; }
                        to { filter: drop-shadow(0 0 20px #3b82f6); opacity: 1; }
                    }
                `}</style>

                {/* ZOOM 17+: Detailed Simulation Layer (Disabled if Heatmap is isolated) */}
                {zoom >= 17 && !showHeatmapEdges && (
                    <SimulationOverlay
                        intersections={intersections}
                        vehicles={vehicles}
                        onIntersectionClick={onIntersectionClick}
                        selectedIntersectionId={selectedId}
                    />
                )}

                {/* EMERGENCY ROUTE */}
                {emergencyActive && (
                    <Polyline
                        positions={emergencyPath}
                        color="#3b82f6"
                        weight={6}
                        opacity={0.8}
                        dashArray="10, 10"
                        className="animate-pulse"
                    />
                )}
            </MapContainer>

            {/* Float Info */}
            <div className="absolute top-4 right-4 z-[1000] bg-slate-900/90 p-3 rounded-xl border border-slate-700 backdrop-blur-md">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Current Layer</div>
                <div className="text-xs font-mono text-blue-400">
                    {zoom <= 14 ? 'City Heat (Aggregated)' : zoom <= 17 ? 'Flow Nodes (Real-time)' : 'Micro-Simulation (Physics)'}
                </div>
            </div>
        </div>
    );
};

export default CityMap;
