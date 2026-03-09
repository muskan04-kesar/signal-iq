
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Siren, AlertCircle, Clock, CheckCircle2, Navigation, MapPin, Target, Zap, Play, ArrowRight } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { CIVIL_LINES_SIGNALS } from '../data/civilLinesSignals';
import { computeShortestPath } from '../services/routing';

interface EmergencyViewProps {
  onDispatch?: (route: string[], type: string) => void;
  isEmergencyActive?: boolean;
  activeEmergencyRoute?: string[];
  emergencyVehiclePos?: [number, number] | null;
}

const EmergencyView: React.FC<EmergencyViewProps> = ({ 
    onDispatch, 
    isEmergencyActive = false, 
    activeEmergencyRoute = [], 
    emergencyVehiclePos = null 
}) => {
  const [activeIncidents, setActiveIncidents] = useState<any[]>([]);
  const [pastIncidentsList, setPastIncidentsList] = useState<any[]>([
    { id: 'INC-765', type: 'Police Pursuit', unit: 'Unit 9', location: 'Highway 10', resolved: '15m ago', result: 'Cleared' },
    { id: 'INC-760', type: 'Medical Emergency', unit: 'Ambulance B-10', location: 'MG Road', resolved: '42m ago', result: 'Success' },
    { id: 'INC-758', type: 'Traffic Accident', unit: 'Tow 12', location: 'Bridgeside Dr', resolved: '1h 20m ago', result: 'Cleared' },
  ]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIncident = activeIncidents.find(i => i.id === selectedId) || activeIncidents[0];

  const prevEmergencyActive = useRef(isEmergencyActive);

  useEffect(() => {
    if (prevEmergencyActive.current && !isEmergencyActive && activeIncidents.length > 0) {
      const finished = activeIncidents[0];
      setPastIncidentsList(prev => [{
        id: finished.id,
        type: finished.type,
        unit: finished.unit,
        location: finished.location,
        resolved: 'Just now',
        result: 'Success'
      }, ...prev]);
      setActiveIncidents([]);
      setSelectedId(null);
    }
    prevEmergencyActive.current = isEmergencyActive;
  }, [isEmergencyActive, activeIncidents]);

  const [startNode, setStartNode] = useState<string | null>(null);
  const [endNode, setEndNode] = useState<string | null>(null);
  const [computedRoute, setComputedRoute] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState('Medical Emergency');

  const handleNodeClick = (id: string) => {
    if (!startNode) {
        setStartNode(id);
    } else if (!endNode && id !== startNode) {
        setEndNode(id);
        const route = computeShortestPath(startNode, id);
        setComputedRoute(route);
    } else {
        // Reset and start over
        setStartNode(id);
        setEndNode(null);
        setComputedRoute([]);
    }
  };

  const clearSelection = () => {
    setStartNode(null);
    setEndNode(null);
    setComputedRoute([]);
  };

  const handleDispatch = () => {
    if (startNode && endNode && computedRoute.length > 0 && onDispatch) {
        onDispatch(computedRoute, selectedType);
        const newIncident = {
            id: `INC-${Math.floor(Math.random() * 900) + 100}`,
            type: selectedType,
            unit: 'Dispatched Unit',
            location: `${startNode} to ${endNode}`,
            status: 'Dispatching',
            eta: 'Calculating...',
            progress: 0
        };
        setActiveIncidents([newIncident]);
        setSelectedId(newIncident.id);
        clearSelection();
    }
  };

  // Convert computed route IDs back to lat/lngs for preview Polyline
  const routeLatLngs = computedRoute.map(id => {
      const s = CIVIL_LINES_SIGNALS.find(sig => sig.id === id);
      return s ? [s.lat, s.lng] as [number, number] : null;
  }).filter(Boolean) as [number, number][];

  // Convert active route IDs back to lat/lngs for live Polyline
  const activeRouteLatLngs = activeEmergencyRoute.map(id => {
      const s = CIVIL_LINES_SIGNALS.find(sig => sig.id === id);
      return s ? [s.lat, s.lng] as [number, number] : null;
  }).filter(Boolean) as [number, number][];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-500/20 text-red-500 rounded-2xl animate-pulse">
            <Siren size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Emergency Response Control</h1>
            <p className="text-slate-400 text-sm">Active priority overrides and incident management</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-3">
            <span className="text-xs text-slate-500 font-bold uppercase">Avg Response Time</span>
            <span className="text-xl font-mono font-bold text-emerald-400">4m 12s</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Incidents List */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <AlertCircle size={20} className="text-red-500" />
            Live Incident Queue
          </h3>
          <div className="space-y-4">
            {activeIncidents.map((incident) => (
              <motion.div 
                key={incident.id}
                onClick={() => setSelectedId(incident.id)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`cursor-pointer transition-all border rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden group ${
                  selectedId === incident.id 
                    ? 'bg-slate-800/60 border-red-500/50 ring-1 ring-red-500/20' 
                    : 'bg-slate-900/40 border-slate-700/50 hover:bg-slate-800/40'
                }`}
              >
                {selectedId === incident.id && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                )}
                <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      selectedId === incident.id ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Navigation size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest bg-red-500/10 px-2 py-0.5 rounded">
                          {incident.status}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">#{incident.id}</span>
                      </div>
                      <h4 className="font-bold text-sm text-white">{incident.type}</h4>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                        <MapPin size={12} /> {incident.location}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-slate-500 font-bold block">ETA</span>
                    <span className="text-lg font-mono font-bold text-white">{incident.eta}</span>
                  </div>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${incident.progress}%` }}
                    className="h-full bg-red-500"
                  />
                </div>
              </motion.div>
            ))}
          </div>

          <h3 className="text-lg font-bold flex items-center gap-2 pt-4">
            <Clock size={20} className="text-slate-500" />
            Response Log
          </h3>
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-4 divide-y divide-slate-800">
            {pastIncidentsList.map((incident) => (
              <div key={incident.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-bold text-white">{incident.type}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{incident.resolved}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500">
                  <CheckCircle2 size={12} />
                  {incident.result.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Route Visualizer Panel */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Target size={20} className="text-blue-400" />
            Tactical Route Map
          </h3>
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[650px] relative">
            {/* Map Header */}
            <div className="p-4 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/10 text-blue-400 rounded-lg flex items-center justify-center">
                  <Zap size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{selectedIncident ? selectedIncident.unit : 'No Active Unit'} Pathing</h4>
                  <p className="text-[10px] text-slate-400">Real-time SignalIQ Override Enabled</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase">Clear Channel</span>
              </div>
            </div>

            {/* Leaflet Interactive Map */}
            <div className="flex-1 bg-[#0a0b1e] relative overflow-hidden group">
              <MapContainer
                center={[25.4515, 81.835]}
                zoom={15}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%', background: '#0a0b1e' }}
                zoomControl={false}
              >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                {/* Draw Computed Route (Preview) */}
                {routeLatLngs.length > 0 && !isEmergencyActive && (
                    <Polyline 
                        positions={routeLatLngs} 
                        color="#3b82f6" 
                        weight={6} 
                        opacity={0.8} 
                        dashArray="10, 10" 
                    />
                )}

                {/* Draw Active Emergency Route */}
                {isEmergencyActive && activeRouteLatLngs.length > 0 && (
                    <Polyline 
                        positions={activeRouteLatLngs} 
                        color="#ef4444" 
                        weight={6} 
                        opacity={0.8} 
                        dashArray="10, 10" 
                        className="animate-pulse" 
                    />
                )}

                {/* Draw Emergency Vehicle Marker */}
                {isEmergencyActive && emergencyVehiclePos && (
                    <CircleMarker
                        center={emergencyVehiclePos}
                        radius={8}
                        color="#ffffff"
                        fillColor="#ef4444"
                        weight={2}
                        fillOpacity={1}
                        className="leaflet-emergency-marker-ev"
                    />
                )}

                {/* Draw Interactive Nodes */}
                {CIVIL_LINES_SIGNALS.map(signal => {
                    const isStart = signal.id === startNode;
                    const isEnd = signal.id === endNode;
                    const inRoute = isEmergencyActive ? activeEmergencyRoute.includes(signal.id) : computedRoute.includes(signal.id);
                    
                    let color = "#334155"; // default neutral
                    if (isStart) color = "#10b981"; // green
                    else if (isEnd) color = "#ef4444"; // red
                    else if (inRoute) color = isEmergencyActive ? "#ef4444" : "#3b82f6"; // route color
                    else if (startNode && !endNode) color = "#64748b"; // selection dim

                    return (
                        <CircleMarker
                            key={signal.id}
                            center={[signal.lat, signal.lng]}
                            radius={isStart || isEnd ? 12 : 8}
                            color={color}
                            fillColor={color}
                            fillOpacity={inRoute ? 1 : 0.6}
                            weight={2}
                            eventHandlers={{ click: () => handleNodeClick(signal.id) }}
                        >
                            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                                <div className="text-xs font-bold">{signal.id}</div>
                                {isStart && <div className="text-[10px] text-emerald-500 uppercase">Origin</div>}
                                {isEnd && <div className="text-[10px] text-red-500 uppercase">Destination</div>}
                            </Tooltip>
                        </CircleMarker>
                    );
                })}
              </MapContainer>

              <style>{`
                  .leaflet-emergency-marker-ev {
                      filter: drop-shadow(0 0 10px #ef4444);
                      animation: strobe-ev 0.5s infinite alternate;
                  }
                  @keyframes strobe-ev {
                      from { filter: drop-shadow(0 0 10px #ef4444); opacity: 0.9; fill: #ef4444; }
                      to { filter: drop-shadow(0 0 20px #3b82f6); opacity: 1; fill: #3b82f6; }
                  }
              `}</style>

              {/* Map Overlays & Selection Panel */}
              <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-3">
                <div className="bg-slate-900/90 backdrop-blur-md p-5 rounded-xl border border-slate-700 shadow-2xl space-y-4 max-w-[280px]">
                  <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Dispatch Control</h5>
                  
                  <div className="space-y-3">
                      <div>
                          <label className="text-xs text-slate-400">Emergency Type</label>
                          <select 
                              className="w-full bg-slate-800 text-sm border border-slate-700 rounded-lg p-2 mt-1 focus:outline-none"
                              value={selectedType}
                              onChange={(e) => setSelectedType(e.target.value)}
                          >
                              <option>Medical Emergency</option>
                              <option>Fire Response</option>
                              <option>Police Pursuit</option>
                              <option>Tactical Convoy</option>
                          </select>
                      </div>

                      <div className="flex items-center gap-2 text-sm justify-between bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                          <div className="flex flex-col items-center">
                              <span className="text-[10px] text-slate-500 uppercase">Origin</span>
                              <span className={`font-bold ${startNode ? 'text-emerald-400' : 'text-slate-600'}`}>
                                  {startNode || 'Select...'}
                              </span>
                          </div>
                          <ArrowRight className="text-slate-600" size={14} />
                          <div className="flex flex-col items-center">
                              <span className="text-[10px] text-slate-500 uppercase">Dest</span>
                              <span className={`font-bold ${endNode ? 'text-red-400' : 'text-slate-600'}`}>
                                  {endNode || 'Select...'}
                              </span>
                          </div>
                      </div>

                      <button 
                          onClick={handleDispatch}
                          disabled={!startNode || !endNode || isEmergencyActive}
                          className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg transition-all ${
                              startNode && endNode && !isEmergencyActive ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                      >
                          <Play size={16} />
                          {isEmergencyActive ? 'Unit En Route...' : 'Dispatch Unit'}
                      </button>
                      
                      {(startNode || endNode) && (
                          <button onClick={clearSelection} className="w-full py-1 text-[10px] text-slate-500 hover:text-slate-300 uppercase tracking-widest text-center mt-2">
                              Clear Selection
                          </button>
                      )}
                  </div>
                </div>
              </div>

              <div className="absolute top-6 right-6">
                <div className="flex flex-col gap-2">
                  <button className="w-10 h-10 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                    <Navigation size={18} />
                  </button>
                  <button className="w-10 h-10 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                    <MapPin size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Routing Stats Footer */}
            <div className="p-4 bg-slate-800/30 grid grid-cols-3 gap-4 border-t border-slate-700/50">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Total Distance</span>
                <span className="text-sm font-mono font-bold">3.2 km</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Signals Handled</span>
                <span className="text-sm font-mono font-bold text-blue-400">7 / 12</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Risk Index</span>
                <span className="text-sm font-mono font-bold text-emerald-400">Low (0.12)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmergencyView;
