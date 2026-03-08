
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Map as MapIcon, Layers, Maximize2, MousePointer2, Info, Compass, Shield, Wind } from 'lucide-react';
import { GridOverview, RoadOverview, IntersectionStatus, Vehicle } from '../types';
import CityMap from './CityMap';
import { CIVIL_LINES_SIGNALS } from '../data/civilLinesSignals';

interface LiveMapViewProps {
    isEmergencyActive?: boolean;
    activeEmergencyRoute?: string[];
    emergencyVehiclePos?: [number, number] | null;
}

const LiveMapView: React.FC<LiveMapViewProps> = ({ isEmergencyActive = false, activeEmergencyRoute = [], emergencyVehiclePos = null }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedZone, setSelectedZone] = useState('Central District');
  const [gridOverview, setGridOverview] = useState<GridOverview | null>(null);
  const [intersections, setIntersections] = useState<IntersectionStatus[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    const fetchGridState = async () => {
      try {
        const response = await fetch('http://localhost:8001/api/grid/state');
        if (!response.ok) return;
        const data = await response.json();

        const enrichedIntersections = CIVIL_LINES_SIGNALS.map((signal, idx) => {
          const backendNode = data.intersections?.[idx % (data.intersections?.length || 1)] || {};
          const row = Math.floor(idx / 5);
          const col = idx % 5;
          const vehicleCount = (data.vehicles || []).filter((v: any) => v.laneId.includes(String(row)) || v.laneId.includes(String(col))).length;
          
          // Generate a smooth simulated density heatmap curve
          const density = Math.min((vehicleCount + (Math.sin(idx + Date.now()/10000) + 1) * 2) / 10, 1) * 0.8 + 0.1;

          return {
            ...backendNode,
            id: signal.id,
            lat: signal.lat,
            lng: signal.lng,
            armAngles: signal.armAngles,
            type: signal.armAngles?.length === 4 ? 'FOUR_WAY' : signal.armAngles?.length === 3 ? 'T' : signal.armAngles?.length > 4 ? 'ROUNDABOUT' : 'COMPLEX',
            density: density,
            aiPrediction: {
              congestionLevel: density > 0.7 ? 'CRITICAL' : density > 0.4 ? 'MODERATE' : 'STABLE',
              flowImprovement: density > 0.5 ? '+14%' : 'N/A'
            }
          };
        });

        setIntersections(enrichedIntersections);
        if (data.vehicles) setVehicles(data.vehicles);
      } catch (error) {
        console.error("Failed to fetch grid state:", error);
      }
    };

    const interval = setInterval(fetchGridState, 200);
    fetchGridState();
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Poll Backend
  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await fetch('http://localhost:8001/api/grid/overview');
        if (res.ok) {
          const data = await res.json();
          setGridOverview(data);
        }
      } catch (e) {
        console.error("Failed to fetch grid overview", e);
      }
    };

    fetchOverview(); // Initial
    const interval = setInterval(fetchOverview, 500);
    return () => clearInterval(interval);
  }, []);

  const getZoneColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'congested': return 'text-red-400';
      case 'moderate': return 'text-amber-400';
      default: return 'text-emerald-400';
    }
  };



  return (
    <div className="flex flex-col h-full space-y-6 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">City-Wide Traffic Grid</h1>
          <p className="text-slate-400 text-sm">Real-time macro-simulation of municipal traffic flow</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-1">
            {['Standard', 'Thermal', 'AI Nodes'].map(v => (
              <button
                key={v}
                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-lg transition-all ${v === 'Standard' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <button className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors">
            <Layers size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Main Map Canvas */}
        <div ref={containerRef} className="flex-1 bg-[#0a0b1e] rounded-3xl border border-slate-700/50 shadow-2xl relative overflow-hidden">
          <CityMap
            intersections={intersections}
            vehicles={vehicles}
            emergencyActive={isEmergencyActive}
            emergencyVehicle={null}
            onIntersectionClick={(id) => console.log('Selected', id)}
            showHeatmapEdges={true}
            activeEmergencyRoute={activeEmergencyRoute.length > 0 ? activeEmergencyRoute.map(id => {
                const s = CIVIL_LINES_SIGNALS.find(sig => sig.id === id);
                return s ? [s.lat, s.lng] : null;
            }).filter(Boolean) as [number, number][] : undefined}
            emergencyVehiclePos={emergencyVehiclePos}
          />

          {/* Map Controls */}
          <div className="absolute bottom-6 left-6 flex flex-col gap-2">
            <button className="w-10 h-10 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-xl">
              <Maximize2 size={18} />
            </button>
            <button className="w-10 h-10 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-xl">
              <Compass size={18} />
            </button>
          </div>

          <div className="absolute bottom-6 right-6 flex flex-col gap-3">
            <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700 p-4 rounded-2xl shadow-2xl space-y-3 min-w-[200px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Traffic Flow</span>
                <Info size={14} className="text-slate-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                  Free Flow
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300">
                  <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
                  Moderate Load
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300">
                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                  Congested
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="w-80 flex flex-col gap-6 shrink-0">
          {/* Active Districts */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-6 flex flex-col gap-4 shadow-xl flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-widest text-slate-500">Zone Monitoring</h3>
              <Shield size={16} className="text-blue-400" />
            </div>
            <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-2">
              {gridOverview?.zones.map(d => (
                <button
                  key={d.name}
                  onClick={() => setSelectedZone(d.name)}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex flex-col gap-2 ${selectedZone === d.name ? 'bg-blue-600/10 border-blue-500/30' : 'bg-slate-800/40 border-transparent hover:border-slate-700'
                    }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white">{d.name}</span>
                    <span className={`text-[10px] font-bold uppercase ${getZoneColor(d.status)}`}>{d.status}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${d.load * 100}%` }}
                        className={`h-full ${d.load > 0.8 ? 'bg-red-500' : d.load > 0.5 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-400">{Math.round(d.load * 100)}%</span>
                  </div>
                </button>
              ))}

              {!gridOverview && (
                <div className="text-center text-slate-500 text-xs py-10 animate-pulse">
                  loading zone data...
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Weather Impact</span>
              <Wind size={16} className="text-cyan-400" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xl font-bold">Low (5%)</span>
              <p className="text-[10px] text-slate-400">Visibility: 10km • Precip: 0mm</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMapView;
