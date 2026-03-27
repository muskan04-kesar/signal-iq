
import React, { useState } from 'react';
import { BrainCircuit, TrendingDown, ArrowUpRight, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AIDecisionPanelProps {
  aiEnabled: boolean;
  onApply: () => void;
}

import { AIStatus } from '../types';

const AIDecisionPanel: React.FC<AIDecisionPanelProps> = ({ aiEnabled, onApply }) => {
  const [loading, setLoading] = useState(false);
  const [aiData, setAiData] = useState<AIStatus | null>(null);

  React.useEffect(() => {
    const fetchAIStatus = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/ai/status`);
            if (res.ok) {
                const data = await res.json();
                setAiData(data);
            }
        } catch (e) {
            console.error("Failed to fetch AI status", e);
        }
    };

    fetchAIStatus();
    const interval = setInterval(fetchAIStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleApply = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onApply();
    }, 1500);
  };

  return (
    <div className="bg-slate-900/40 border border-slate-700/50 rounded-2xl p-6 flex flex-col gap-6 shadow-xl h-full max-h-[450px]">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
          <BrainCircuit size={20} />
        </div>
        <h3 className="font-bold text-lg">AI Traffic Decision Engine</h3>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Congestion Prediction</span>
          <p className="text-sm font-medium">
            {aiData?.prediction?.location || "Loading..."} predicted congestion in <span className="text-amber-400 font-bold">{aiData?.prediction?.time || 0} minutes</span>
          </p>
          <div className="mt-2 w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (aiData?.prediction?.time || 0) * 10)}%` }} // Arbitrary scaling
              className="h-full bg-amber-500"
            />
          </div>
        </div>

        <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Signal Recommendation</span>
          <p className="text-sm font-medium">
             {aiData?.recommendation?.action || "Analyzing..."} by <span className="text-emerald-400 font-bold">{aiData?.recommendation?.value || ""}</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-400 font-bold">
            <ArrowUpRight size={12} />
            <span>Estimated Flow Improvement: {aiData?.efficiency || 0}%</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-auto">
        <button
          onClick={handleApply}
          disabled={aiEnabled || loading}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            aiEnabled 
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 cursor-default' 
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
          }`}
        >
          {loading ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <Zap size={18} />
            </motion.div>
          ) : (
            <Zap size={18} className={aiEnabled ? 'text-emerald-500' : ''} />
          )}
          {aiEnabled ? 'AI Optimization Active' : loading ? 'Processing...' : 'Apply AI Optimization'}
        </button>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center p-2 rounded-lg bg-slate-800/30 border border-white/5">
            <span className="text-[8px] uppercase text-slate-500 font-bold">Delay Before</span>
            <span className="text-xs font-mono font-bold">42s</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-slate-800/30 border border-white/5">
            <span className="text-[8px] uppercase text-slate-500 font-bold">Delay After</span>
            <span className="text-xs font-mono font-bold text-emerald-400">28s</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-[8px] uppercase text-emerald-500 font-bold">Improve %</span>
            <span className="text-xs font-mono font-bold text-emerald-400">+{aiData?.efficiency || 0}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIDecisionPanel;
