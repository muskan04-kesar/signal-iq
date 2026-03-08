import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Sliders, Zap, Search, ArrowRightLeft, Clock, Power } from 'lucide-react';
import { IntersectionSummary, SignalDetails } from '../types';
import { CIVIL_LINES_SIGNALS } from '../data/civilLinesSignals';

const SignalControlView: React.FC = () => {
  const [intersections, setIntersections] = useState<IntersectionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<SignalDetails | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch Intersections List
  useEffect(() => {
    const fetchIntersections = async () => {
        try {
            const res = await fetch('http://localhost:8001/api/intersections');
            if (res.ok) {
                // Replace backend list with the real map intersections
                const mappedSignals = CIVIL_LINES_SIGNALS.map(s => ({
                   id: s.id,
                   name: `Intersection ${s.id}`,
                   status: 'active'
                })) as IntersectionSummary[];
                
                setIntersections(mappedSignals);
                if (!selectedId && mappedSignals.length > 0) {
                    setSelectedId(mappedSignals[0].id);
                }
            }
        } catch (e) {
            console.error("Failed to fetch intersections", e);
        }
    };
    fetchIntersections(); // Initial
  }, []);

  // Poll Signal Details
  useEffect(() => {
      if (!selectedId) return;

      const fetchDetails = async () => {
          try {
              const res = await fetch(`http://localhost:8001/api/signals/${selectedId}`);
              if (res.ok) {
                  const data = await res.json();
                  setDetails(data);
                  return;
              }
          } catch (e) {
              // Fallback to local simulation below
          }
          
          // Fallback mock simulation for frontend-only signals
          setDetails(prev => {
              const seed = parseInt(selectedId.replace(/\D/g, '')) || 0;
              const nsT = prev?.nsGreenTime || 45 + (seed % 10);
              const ewT = prev?.ewGreenTime || 35 + (seed % 5);
              const aiEnabled = prev?.aiEnabled !== undefined ? prev.aiEnabled : true;
              
              const totalCycle = nsT + ewT;
              const now = Math.floor(Date.now() / 1000);
              const currentPos = now % totalCycle;
              
              let currentPhase = 'NS';
              let timerRemaining = nsT - currentPos;
              if (currentPos >= nsT) {
                  currentPhase = 'EW';
                  timerRemaining = totalCycle - currentPos;
              }

              return {
                  intersectionId: selectedId,
                  currentPhase,
                  timerRemaining,
                  nsGreenTime: nsT,
                  ewGreenTime: ewT,
                  flowRate: prev?.flowRate || 300 + (seed * 17 % 500),
                  pedestrianDemand: prev?.pedestrianDemand || (seed % 3 === 0 ? 'High' : 'Low'),
                  aiEnabled
              };
          });
      };

      fetchDetails();
      const interval = setInterval(fetchDetails, 500);
      return () => clearInterval(interval);
  }, [selectedId]);

  const handleUpdateTiming = async (type: 'ns' | 'ew', val: number) => {
      if (!selectedId || !details) return;
      
      // Optimistic update
      setDetails(prev => prev ? ({
          ...prev,
          nsGreenTime: type === 'ns' ? val : prev.nsGreenTime,
          ewGreenTime: type === 'ew' ? val : prev.ewGreenTime
      }) : null);

      try {
          await fetch(`http://localhost:8001/api/signals/${selectedId}/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  nsGreenTime: type === 'ns' ? val : details.nsGreenTime,
                  ewGreenTime: type === 'ew' ? val : details.ewGreenTime,
                  mode: 'MANUAL' // Force manual on slider change
              })
          });
      } catch (e) {
          console.error("Failed to update timing", e);
      }
  };

  const handleToggleAi = async () => {
      if (!selectedId || !details) return;
      const newAiState = !details.aiEnabled;
      
      // Optimistic
      setDetails(prev => prev ? ({ ...prev, aiEnabled: newAiState }) : null);

      try {
          await fetch(`http://localhost:8001/api/signals/${selectedId}/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  mode: newAiState ? 'AI_OPTIMIZED' : 'MANUAL'
              })
          });
      } catch (e) {
          console.error("Failed to toggle AI", e);
      }
  };


  const [successMsg, setSuccessMsg] = useState('');

  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleBulkOptimize = async () => {
    setIsOptimizing(true);
    try {
        const res = await fetch('http://localhost:8001/api/signals/optimize-all', {
            method: 'POST'
        });
        if (res.ok) {
            setSuccessMsg('Global AI Optimization Applied');
             // Force refresh details if selected
              if (selectedId) {
                  const detailsRes = await fetch(`http://localhost:8001/api/signals/${selectedId}`);
                  if (detailsRes.ok) {
                      const data = await detailsRes.json();
                      setDetails(data);
                  }
              }
            setTimeout(() => setSuccessMsg(''), 3000);
        }
    } catch (e) {
        console.error("Failed to optimize all", e);
    } finally {
        setIsOptimizing(false);
    }
  };

  const handleApplyPattern = async (pattern: string) => {
      // Map UI names to API enum
      const map: Record<string, string> = {
          'Rush Hour': 'rush_hour',
          'Night Mode': 'night_mode',
          'Event': 'event',
          'Holiday': 'holiday'
      };
      
      const apiPattern = map[pattern];
      if (!apiPattern) return;

      try {
          const res = await fetch('http://localhost:8001/api/signals/pattern', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pattern: apiPattern })
          });
          
          if (res.ok) {
              setSuccessMsg(`Applied ${pattern} Pattern`);
              
              // Force refresh details if selected
              if (selectedId) {
                  const detailsRes = await fetch(`http://localhost:8001/api/signals/${selectedId}`);
                  if (detailsRes.ok) {
                      const data = await detailsRes.json();
                      setDetails(data);
                  }
              }
              
              setTimeout(() => setSuccessMsg(''), 3000);
          }
      } catch (e) {
          console.error("Failed to apply pattern", e);
      }
  };

  const filteredIntersections = intersections.filter(i => 
    i.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Advanced Signal Control</h1>
          <p className="text-slate-400 text-sm">Direct intersection overriding and cycle management</p>
        </div>
        <div className="flex gap-3">
            {successMsg && (
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold flex items-center gap-2"
                >
                    <Activity size={14} />
                    {successMsg}
                </motion.div>
            )}
          <button 
            onClick={handleBulkOptimize}
            disabled={isOptimizing}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-bold shadow-lg ${isOptimizing ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'}`}
          >
            <Zap size={16} className={isOptimizing ? 'animate-pulse' : ''} />
            {isOptimizing ? 'Optimizing...' : 'Bulk AI Optimize'}
          </button>

          <button className="flex items-center gap-2 px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/30 rounded-xl transition-all text-sm font-bold">
            <Power size={16} />
            Emergency Flush
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search ID or Name..." 
              className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-4 space-y-1 max-h-[600px] overflow-y-auto custom-scrollbar">
             <h3 className="text-[10px] uppercase text-slate-500 font-bold mb-3 tracking-widest">Active Intersections</h3>
             {filteredIntersections.map(i => (
               <button 
                 key={i.id}
                 onClick={() => setSelectedId(i.id)}
                 className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${
                   selectedId === i.id ? 'bg-blue-600/10 border border-blue-500/20' : 'hover:bg-slate-800 border border-transparent'
                 }`}
               >
                 <div>
                   <p className={`text-sm font-bold ${selectedId === i.id ? 'text-blue-400' : 'text-white'}`}>{i.id}</p>
                   <p className="text-[10px] text-slate-500">{i.name}</p>
                 </div>
                 <div className={`w-2 h-2 rounded-full ${i.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
               </button>
             ))}
          </div>
        </div>

        {/* Main Control Panel */}
        <div className="lg:col-span-3 space-y-6">
           {details ? (
            <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                key={selectedId} // Re-animate on switch
                className="bg-slate-900/60 border border-slate-700/50 rounded-3xl p-8 relative overflow-hidden"
            >
                {/* Control Schematic */}
                <div className="flex flex-col md:flex-row gap-10">
                <div className="flex-1 space-y-8">
                    <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center">
                        <ArrowRightLeft size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">{details.intersectionId}</h2>
                        <p className="text-xs text-slate-500">
                             Current Phase: <span className="text-blue-400 font-bold">{details.currentPhase}</span>
                        </p>
                    </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block">North-South (Primary)</label>
                        <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold font-mono ${details.currentPhase.includes('NS') ? 'bg-emerald-500/20 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-slate-800 text-slate-500'}`}>
                            {details.currentPhase.includes('NS') ? details.timerRemaining : 'R'}
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between text-xs text-slate-400">
                            <span>Green Duration</span>
                            <span>{details.nsGreenTime}s</span>
                            </div>
                            <input 
                                type="range" 
                                min="10" max="60"
                                className="w-full h-1 bg-slate-800 rounded-full accent-blue-500" 
                                value={details.nsGreenTime}
                                onChange={(e) => handleUpdateTiming('ns', parseInt(e.target.value))}
                            />
                        </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block">East-West (Secondary)</label>
                        <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold font-mono ${details.currentPhase.includes('EW') ? 'bg-emerald-500/20 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-slate-800 text-slate-500'}`}>
                            {details.currentPhase.includes('EW') ? details.timerRemaining : 'R'}
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between text-xs text-slate-400">
                            <span>Green Duration</span>
                            <span>{details.ewGreenTime}s</span>
                            </div>
                            <input 
                                type="range" 
                                min="10" max="60"
                                className="w-full h-1 bg-slate-800 rounded-full accent-blue-500" 
                                value={details.ewGreenTime}
                                onChange={(e) => handleUpdateTiming('ew', parseInt(e.target.value))}
                            />
                        </div>
                        </div>
                    </div>
                    </div>

                    <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex gap-6">
                        <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-slate-500 font-bold">Flow Rate</span>
                        <motion.span 
                            key={details.flowRate}
                            initial={{ opacity: 0.5 }}
                            animate={{ opacity: 1 }}
                            className="text-sm font-mono font-bold text-emerald-400"
                        >
                            {details.flowRate} v/h
                        </motion.span>
                        </div>
                        <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-slate-500 font-bold">Pedestrian Demand</span>
                        <span className="text-sm font-mono font-bold text-blue-400">{details.pedestrianDemand}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500 font-bold">AI Optimization</span>
                        <button 
                        onClick={handleToggleAi}
                        className={`relative w-12 h-6 rounded-full transition-colors ${details.aiEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                        >
                        <motion.div 
                            animate={{ x: details.aiEnabled ? 26 : 4 }}
                            className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-md"
                        />
                        </button>
                    </div>
                    </div>
                </div>

                <div className="w-full md:w-64 bg-slate-800/40 rounded-2xl p-6 border border-slate-700/50 space-y-4">
                    <h4 className="font-bold text-sm">Action Queue</h4>
                    <div className="space-y-3">
                    <div className="flex items-center gap-3 p-2 bg-slate-900 rounded-lg text-xs border border-slate-700">
                        <Clock size={14} className="text-blue-400" />
                        <span className="flex-1">Next Cycle: {details.timerRemaining}s</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-slate-900 rounded-lg text-xs border border-slate-700">
                        <Zap size={14} className="text-emerald-400" />
                        <span className="flex-1">{details.aiEnabled ? 'AI Controlling' : 'Manual Override'}</span>
                    </div>
                    <button className="w-full py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg text-[10px] font-bold uppercase transition-all">
                        Commit Changes
                    </button>
                    </div>
                </div>
                </div>
            </motion.div>
           ) : (
               <div className="flex items-center justify-center h-64 text-slate-500">
                   <div className="flex flex-col items-center gap-2">
                       <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                       <span className="text-xs">Loading signal telemetry...</span>
                   </div>
               </div>
           )}

          <div className="grid grid-cols-2 gap-6">
             <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-6 space-y-4">
               <div className="flex items-center gap-3">
                 <Sliders size={20} className="text-slate-400" />
                 <h4 className="font-bold">Pattern Override</h4>
               </div>
               <div className="grid grid-cols-2 gap-3">
                 {['Rush Hour', 'Night Mode', 'Event', 'Holiday'].map(m => (
                   <button 
                    key={m} 
                    onClick={() => handleApplyPattern(m)}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] font-bold text-slate-300 transition-colors"
                   >
                     {m}
                   </button>
                 ))}
               </div>
             </div>
             <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-2">
               <Activity size={32} className="text-emerald-500 animate-pulse" />
               <p className="text-sm font-bold">Signal Health: Optimal</p>
               <p className="text-[10px] text-slate-500">Latency: 42ms • Uptime: 99.9%</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignalControlView;
