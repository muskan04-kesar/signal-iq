
import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import KPISection from './components/KPISection';
import CityMap from './components/CityMap';
import AIDecisionPanel from './components/AIDecisionPanel';
import SignalControlPanel from './components/SignalControlPanel';
import EmergencyCard from './components/EmergencyCard';
import InfraStatus from './components/InfraStatus';
import AnalyticsWidget from './components/AnalyticsWidget';
import AnalyticsView from './components/AnalyticsView';
import EmergencyView from './components/EmergencyView';
import SignalControlView from './components/SignalControlView';
import InfrastructureView from './components/InfrastructureView';
import LiveMapView from './components/LiveMapView';
import { IntersectionStatus } from './types';
import { CIVIL_LINES_SIGNALS } from './data/civilLinesSignals';
import { fetchIntersections } from './services/osmIntersections';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isEmergencyActive, setEmergencyActive] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [selectedIntersectionId, setSelectedIntersectionId] = useState('I-101');

  const handleSetAiEnabled = (enabled: boolean) => {
    setAiEnabled(enabled);
    fetch('http://localhost:8001/api/signals/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, scope: "GLOBAL" })
    }).catch(e => console.error("Failed to toggle AI", e));
  };

  const handleSetEmergencyActive = (active: boolean) => {
    setEmergencyActive(active);
    const endpoint = active ? 'start' : 'stop';
    fetch(`http://localhost:8001/api/emergency/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch(e => console.error(`Failed to ${endpoint} emergency`, e));
  };

  // Multi-Intersection Simulation State (5x5 Grid - 25 intersections)
  // Matching the image: 5 roads horizontal, 5 roads vertical = 25 intersections
  const [intersections, setIntersections] = useState<IntersectionStatus[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]); // Using any for now, refine with proper Vehicle type later
  const [emergencyVehicle, setEmergencyVehicle] = useState<any>(null);
  const emergencyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Custom Local Dispatch State
  const [activeEmergencyRoute, setActiveEmergencyRoute] = useState<string[]>([]);
  const [emergencyVehiclePos, setEmergencyVehiclePos] = useState<[number, number] | null>(null);

  const handleDispatchEmergency = async (route: string[], type: string) => {
      // Optimistic UI state
      setActiveEmergencyRoute(route);
      setEmergencyActive(true);
      
      const startNode = CIVIL_LINES_SIGNALS.find(s => s.id === route[0]);
      if (startNode) {
          setEmergencyVehiclePos([startNode.lat, startNode.lng]);
      }
      
      // Notify backend to spin up true simulation
      try {
        await fetch(`http://localhost:8001/api/emergency/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ route, type })
        });
      } catch (e) {
        console.error("Failed to post emergency dispatch", e);
      }
  };

  const [osmSignals, setOsmSignals] = useState<Partial<IntersectionStatus>[]>(CIVIL_LINES_SIGNALS as any[]);
  const osmSignalsRef = useRef<Partial<IntersectionStatus>[]>(CIVIL_LINES_SIGNALS as any[]);

  useEffect(() => {
    // Rely exclusively on static CIVIL_LINES_SIGNALS topographical dataset
  }, []);

  // Fetch grid state from backend
  useEffect(() => {
    const fetchGridState = async () => {
      try {
        const response = await fetch('http://localhost:8001/api/grid/state');
        if (!response.ok) return;
        const data = await response.json();

        // Enrich intersections with coordinates and density
        // Backend returns ~25 nodes, we map them directly to our cached signals
        const enrichedIntersections = osmSignalsRef.current.map((osmNode: any) => {
          const interData = (data.intersections || []).find((i: any) => i.id === osmNode.id) || {};

          // Estimate density if vehicles data is passed
          // Just a proxy to avoid breaking physics Engine
          const density = Math.random() * 0.8; // Stubbed for realistic variance

          return {
            ...interData,
            id: osmNode.id,
            lat: osmNode.lat, 
            lng: osmNode.lng,
            type: osmNode.type || 'TRAFFIC_SIGNAL',
            connections: osmNode.connections || 4,
            armAngles: osmNode.armAngles,
            // NATIVE: Backend now controls this data natively instead of fake mapped values
            congestionScore: interData.congestionScore || density, 
            density: interData.density || density,
            nsSignal: interData.nsSignal || 'RED',
            ewSignal: interData.ewSignal || 'GREEN',
            aiPrediction: interData.aiPrediction || {
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

    const fetchEmergencyState = async () => {
      try {
        const response = await fetch('http://localhost:8001/api/emergency/state');
        if (!response.ok) return;
        const data = await response.json();

        if (data.emergency && data.emergency.active) {
          // New valid active data: clear any pending timeout
          if (emergencyTimeoutRef.current) {
            clearTimeout(emergencyTimeoutRef.current);
            emergencyTimeoutRef.current = null;
          }

          setEmergencyActive(data.emergency.active);
          
          // BACKEND NATIVE: Accept the real route and true position from physics engine
          if (data.emergency.route) setActiveEmergencyRoute(data.emergency.route);
          if (data.emergency.lat !== undefined && data.emergency.lng !== undefined) {
             setEmergencyVehiclePos([data.emergency.lat, data.emergency.lng]);
          }
          
          setEmergencyVehicle({
            id: data.emergency.vehicleId || 'EMG-1',
            type: 'emergency',
            active: data.emergency.active
          });
        } else {
          // No emergency currently tracking
          setEmergencyActive(false);
          setActiveEmergencyRoute([]);

          // Linger visual briefly before erasing
          if (!emergencyTimeoutRef.current && emergencyVehiclePos) {
            emergencyTimeoutRef.current = setTimeout(() => {
              setEmergencyVehicle(null);
              setEmergencyVehiclePos(null);
              emergencyTimeoutRef.current = null;
            }, 2000);
          }
        }
      } catch (error) {
        console.error("Failed to fetch emergency state:", error);
      }
    };

    // Optimization: Reduce polling to 100ms (10Hz) which is sufficient for UI
    const interval = setInterval(fetchGridState, 100);
    const emergencyInterval = setInterval(fetchEmergencyState, 200); // 5Hz for emergency is fine

    fetchGridState(); // Initial fetch
    fetchEmergencyState();

    return () => {
      clearInterval(interval);
      clearInterval(emergencyInterval);
    };
  }, []);

  const selectedInter = intersections.find(i => i.id === selectedIntersectionId) || intersections[0];

  if (intersections.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0b1e] text-slate-400">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm font-mono animate-pulse">Initializing SignalIQ Grid...</span>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'Analytics':
        return <AnalyticsView />;
      case 'Emergency':
        return <EmergencyView 
           onDispatch={handleDispatchEmergency} 
           isEmergencyActive={isEmergencyActive}
           activeEmergencyRoute={activeEmergencyRoute}
           emergencyVehiclePos={emergencyVehiclePos}
        />;
      case 'Signal Control':
        return <SignalControlView />;
      case 'Infrastructure':
        return <InfrastructureView />;
      case 'Live Map':
        return <LiveMapView 
          isEmergencyActive={isEmergencyActive} 
          activeEmergencyRoute={activeEmergencyRoute} 
          emergencyVehiclePos={emergencyVehiclePos} 
        />;
      case 'Dashboard':
      default:
        return (
          <div className="flex flex-col gap-6">
            <KPISection />
            <div className="grid grid-cols-12 gap-6 flex-1 min-h-[600px]">
              <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
                <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl overflow-hidden flex-1 relative group shadow-2xl min-h-[500px]">
                  <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
                    <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">OSM Neural Grid Active</span>
                    <h2 className="text-xl font-bold">SignalIQ Central Command</h2>
                  </div>

                  <div className="absolute top-4 right-4 z-20 flex gap-2">
                    <div className="bg-black/60 px-3 py-1.5 rounded-full border border-slate-700 flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full animate-pulse ${isEmergencyActive ? 'bg-red-500' : 'bg-green-500'}`} />
                      <span className="text-xs font-mono uppercase tracking-tighter">System: {isEmergencyActive ? 'Critical' : 'Nominal'}</span>
                    </div>
                  </div>

                  <CityMap 
                      intersections={intersections} 
                      vehicles={vehicles} 
                      emergencyActive={isEmergencyActive} 
                      emergencyVehicle={emergencyVehicle} 
                      onIntersectionClick={setSelectedIntersectionId} 
                      activeEmergencyRoute={
                          activeEmergencyRoute.length > 0 ? activeEmergencyRoute.map(id => {
                              const s = CIVIL_LINES_SIGNALS.find(sig => sig.id === id);
                              return s ? [s.lat, s.lng] : null;
                          }).filter(Boolean) as [number, number][] : undefined
                      }
                      emergencyVehiclePos={emergencyVehiclePos}
                  />

                  <div className="absolute bottom-4 left-4 z-20 flex gap-4 bg-black/40 backdrop-blur-sm p-3 rounded-xl border border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                      <span className="text-[10px] uppercase font-bold text-emerald-500">Flowing</span>
                    </div>
                    <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                      <div className="w-3 h-3 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                      <span className="text-[10px] uppercase font-bold text-red-400">EMERGENCY ACTIVE</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <SignalControlPanel intersection={selectedInter} aiEnabled={aiEnabled} setAiEnabled={handleSetAiEnabled} />
                  <AnalyticsWidget />
                </div>
              </div>

              <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                <AIDecisionPanel aiEnabled={aiEnabled} onApply={() => handleSetAiEnabled(true)} />
                <EmergencyCard isActive={isEmergencyActive} setActive={handleSetEmergencyActive} />
                <InfraStatus />
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0b1e] text-slate-200 overflow-hidden font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden p-6 gap-6 custom-scrollbar">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
