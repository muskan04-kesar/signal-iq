
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
  const [emergencySegmentIndex, setEmergencySegmentIndex] = useState(0);

  const handleDispatchEmergency = (route: string[], type: string) => {
      setActiveEmergencyRoute(route);
      setEmergencySegmentIndex(0);
      setEmergencyActive(true);
      const startNode = CIVIL_LINES_SIGNALS.find(s => s.id === route[0]);
      if (startNode) {
          setEmergencyVehiclePos([startNode.lat, startNode.lng]);
      }
      
      // Notify backend strictly for analytics/switch logs
      fetch(`http://localhost:8001/api/emergency/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(e => console.error("Failed to start emergency", e));
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
        const enrichedIntersections = osmSignalsRef.current.map((osmNode: any, idx: number) => {
          const interData = (data.intersections || [])[idx] || {};

          // Estimate density if vehicles data is passed
          // Just a proxy to avoid breaking physics Engine
          const density = Math.random() * 0.8; // Stubbed for realistic variance

          return {
            ...interData,
            id: osmNode.id || interData.id || `osm-${idx}`,
            lat: osmNode.lat, 
            lng: osmNode.lng,
            type: osmNode.type || 'TRAFFIC_SIGNAL',
            connections: osmNode.connections || 4,
            armAngles: osmNode.armAngles,
            congestionScore: osmNode.congestionScore || density, // mapping density to expected variable
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
          setEmergencyVehicle({
            id: 'EMG-1',
            laneId: data.emergency.laneId,
            position: data.emergency.position,
            speed: data.emergency.speed,
            type: 'emergency',
            active: data.emergency.active
          });
        } else {
          setEmergencyActive(false);

          // If we currently have a vehicle and no timeout is active, start persistence timer
          // We can't check 'emergencyVehicle' state directly here due to closure staleness,
          // so we rely on the fact that if we had one, the user sees it, and we want to keep it.
          // But simpler: just set the timeout. If it was already null, setting it to null again in 2s is fine.
          // Crucially, we do NOT set it to null immediately here.

          if (!emergencyTimeoutRef.current) {
            emergencyTimeoutRef.current = setTimeout(() => {
              setEmergencyVehicle(null);
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

  // Emergency Vehicle Routing Telemetry Loop
  useEffect(() => {
    if (!isEmergencyActive || activeEmergencyRoute.length < 2) return;

    let currentSegmentIndex = 0;
    let progress = 0; // 0 to 1
    const speed = 0.05; // 5% per frame (faster simulated driving)

    const interval = setInterval(() => {
        progress += speed;

        if (progress >= 1) {
            currentSegmentIndex++;
            setEmergencySegmentIndex(currentSegmentIndex);
            progress = 0;
            if (currentSegmentIndex >= activeEmergencyRoute.length - 1) {
                // Reached destination!
                clearInterval(interval);
                setTimeout(() => {
                    setEmergencyActive(false);
                    setActiveEmergencyRoute([]);
                    setEmergencyVehiclePos(null);
                    fetch(`http://localhost:8001/api/emergency/stop`, { method: 'POST' }).catch(() => {});
                }, 4000); // Linger on destination before clearing
                return;
            }
        }

        const s1 = CIVIL_LINES_SIGNALS.find(s => s.id === activeEmergencyRoute[currentSegmentIndex]);
        const s2 = CIVIL_LINES_SIGNALS.find(s => s.id === activeEmergencyRoute[currentSegmentIndex + 1]);

        if (s1 && s2) {
            const lat = s1.lat + (s2.lat - s1.lat) * progress;
            const lng = s1.lng + (s2.lng - s1.lng) * progress;
            setEmergencyVehiclePos([lat, lng]);
        }
    }, 100); // 10 ticks per second

    return () => clearInterval(interval);
  }, [isEmergencyActive, activeEmergencyRoute]);

  // Apply preemption logic for active emergency routes
  const displayIntersections = intersections.map(inter => {
      if (isEmergencyActive && activeEmergencyRoute.length > 0) {
          const isPreempted = inter.id === activeEmergencyRoute[emergencySegmentIndex] || 
                              inter.id === activeEmergencyRoute[emergencySegmentIndex + 1];
          if (isPreempted) {
              return { 
                  ...inter, 
                  nsSignal: 'GREEN' as const, 
                  ewSignal: 'GREEN' as const,
                  congestionScore: 0.1 // Force visual clear
              };
          }
      }
      return inter;
  });

  const selectedInter = displayIntersections.find(i => i.id === selectedIntersectionId) || displayIntersections[0];

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
                      intersections={displayIntersections} 
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
