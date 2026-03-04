import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMapEvents, useMap, Tooltip, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { IntersectionStatus, Vehicle } from '../types';
import SimulationOverlay from './SimulationOverlay';

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
}

const CityMap: React.FC<CityMapProps> = ({ intersections, vehicles, emergencyActive, emergencyVehicle, onIntersectionClick }) => {
    const [zoom, setZoom] = useState(13);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [flyToTarget, setFlyToTarget] = useState<{ lat: number, lng: number } | null>(null);

    const center: [number, number] = [28.6327, 77.2197]; // Delhi Center

    const handleNodeClick = useCallback((inter: IntersectionStatus) => {
        setSelectedId(inter.id);
        setFlyToTarget({ lat: inter.lat, lng: inter.lng });
        onIntersectionClick(inter.id);
    }, [onIntersectionClick]);

    // Helper to get color based on density
    const getDensityColor = (density: number) => {
        if (density > 0.7) return '#ef4444'; // Red
        if (density > 0.4) return '#f59e0b'; // Amber
        return '#10b981'; // Green
    };

    // Emergency Path
    const emergencyPath: [number, number][] = intersections
        .filter(i => i.id.startsWith('I-10') && parseInt(i.id.slice(3)) <= 5)
        .map(i => [i.lat, i.lng]);

    return (
        <div className="w-full h-full relative">
            <MapContainer
                center={center}
                zoom={13}
                style={{ height: '100%', width: '100%', background: '#0a0b1e' }}
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                <ZoomLevelTracker onChange={setZoom} />
                <MapFlyTo target={flyToTarget} />

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

                {/* ZOOM 15-17: Glowing Nodes */}
                {zoom >= 15 && zoom <= 17 && intersections.map(inter => (
                    <CircleMarker
                        key={inter.id}
                        center={[inter.lat, inter.lng]}
                        radius={selectedId === inter.id ? (zoom - 2) : (zoom - 5)}
                        fillColor={inter.nsSignal === 'GREEN' ? '#10b981' : '#ef4444'}
                        color={selectedId === inter.id ? '#ffffff' : '#ffffff'}
                        weight={selectedId === inter.id ? 4 : 2}
                        fillOpacity={0.8}
                        className={selectedId === inter.id ? "selected-intersection-pulse" : ""}
                        eventHandlers={{
                            click: () => handleNodeClick(inter)
                        }}
                    >
                        <Tooltip>
                            <div className="bg-slate-900 text-white p-2 rounded border border-slate-700">
                                <span className="font-bold">Intersection {inter.id}</span><br />
                                <span className="text-xs">NS: {inter.nsSignal} | EW: {inter.ewSignal}</span>
                                <div className="w-full h-1 bg-slate-800 mt-1 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500" style={{ width: `${inter.density * 100}%` }}></div>
                                </div>
                            </div>
                        </Tooltip>
                    </CircleMarker>
                ))}

                <style>{`
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

                {/* ZOOM 18+: Detailed Simulation Layer */}
                {zoom >= 18 && selectedId && (
                    <SimulationOverlay
                        intersections={intersections.filter(i => i.id === selectedId)}
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
