
import React from 'react';
import { IntersectionStatus } from '../types';
import { Sliders, Clock, Activity } from 'lucide-react';

interface SignalControlPanelProps {
  intersection: IntersectionStatus;
  aiEnabled: boolean;
  setAiEnabled: (val: boolean) => void;
}

const SignalControlPanel: React.FC<SignalControlPanelProps> = ({ intersection, aiEnabled, setAiEnabled }) => {
  const [nsGreenTime, setNsGreenTime] = React.useState(30);
  const [ewGreenTime, setEwGreenTime] = React.useState(25);

  React.useEffect(() => {
    const fetchSignalConfig = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/signals/${intersection.id}`);
        if (res.ok) {
          const data = await res.json();
          setNsGreenTime(data.nsGreenTime || 30);
          setEwGreenTime(data.ewGreenTime || 25);
        }
      } catch (err) {
        console.error("Failed to fetch signal config", err);
      }
    };
    fetchSignalConfig();
    const interval = setInterval(fetchSignalConfig, 500);
    return () => clearInterval(interval);
  }, [intersection.id]);

  const handleUpdate = async (type: 'ns' | 'ew', value: number) => {
    if (type === 'ns') setNsGreenTime(value);
    else setEwGreenTime(value);

    // Debounce or just send? Requirement says "Signal updates must immediately affect". 
    // But slider dragging generates many events. 
    // For now, I'll send it. If it's too much, I might need onMouseUp, but input type="range" with onChange fires continuously.
    // Let's use onChange for state and onMouseUp (commit) for API to avoid flooding, or just fire away if it's local localhost.
    // Actually, "immediately" implies visual feedback.
    
    // Let's try sending on change for responsiveness, assuming local backend can handle it.
    // Optimization: separate state update from API call? 
    // I will simply call the API.
    
    try {
      await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/signals/${intersection.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nsGreenTime: type === 'ns' ? value : nsGreenTime,
          ewGreenTime: type === 'ew' ? value : ewGreenTime,
          mode: 'MANUAL'
        })
      });
      // If we switch to manual, we should update parent state too
      if (aiEnabled) setAiEnabled(false);
    } catch (err) {
      console.error("Failed to update signal", err);
    }
  };

  return (
    <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <Activity size={20} />
          </div>
          <h3 className="font-bold">Signal Control Panel</h3>
        </div>
        <div className="bg-slate-800 px-3 py-1 rounded-full text-[10px] font-mono font-bold text-slate-400 border border-slate-700">
          ID: {intersection.id}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-2">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500">
            <span>NS Green Time</span>
            <span className="text-white font-mono">{nsGreenTime}s</span>
          </div>
          <input 
            type="range" 
            min="10" max="60" 
            value={nsGreenTime} 
            onChange={(e) => handleUpdate('ns', parseInt(e.target.value))}
            className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-full" 
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500">
            <span>EW Green Time</span>
            <span className="text-white font-mono">{ewGreenTime}s</span>
          </div>
          <input 
            type="range" 
            min="10" max="60" 
            value={ewGreenTime} 
            onChange={(e) => handleUpdate('ew', parseInt(e.target.value))}
            className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-full" 
          />
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
        <div className="flex items-center gap-3">
          <Clock size={16} className="text-blue-400" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-slate-500 font-bold">Current Cycle</span>
            <span className="text-sm font-mono font-bold">
              {Math.ceil(intersection.timer)}s remaining ({intersection.nsSignal === 'GREEN' ? 'NS' : 'EW'})
            </span>
          </div>
        </div>
        <div className={`px-2 py-1 rounded-lg text-[10px] font-bold ${aiEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
          {aiEnabled ? 'AI ADJUSTED' : 'MANUAL'}
        </div>
      </div>

      <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-2">
        <Sliders size={12} />
        <span>Manual override will disable AI optimization temporarily.</span>
      </div>
    </div>
  );
};

export default SignalControlPanel;
