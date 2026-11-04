import React, { useState, useEffect } from 'react';
import { Cpu, Cloud, Check, Loader2, Server } from 'lucide-react';
import { modelConfigApi } from '../../services/api/modelConfig';

export const ModelModeSwitcher: React.FC = () => {
  const [mode, setMode] = useState<'sarvam' | 'local' | 'api'>(() => {
    try {
      const saved = localStorage.getItem('voxora_model_mode') as 'sarvam' | 'local' | 'api';
      if (saved === 'sarvam' || saved === 'api' || saved === 'local') return saved;
    } catch (_) {}
    return 'sarvam';
  });
  const [localReady, setLocalReady] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await modelConfigApi.getModelMode();
      setMode(data.mode);
      setLocalReady(data.local_server_ready);
      try {
        localStorage.setItem('voxora_model_mode', data.mode);
      } catch (_) {}
    } catch (e) {
      console.debug('Failed to fetch model mode status:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    if (isLoading) return;
    setIsLoading(true);
    const previousMode = mode;
    // Cycle modes: sarvam -> local -> api -> sarvam
    let nextMode: 'sarvam' | 'local' | 'api' = 'sarvam';
    if (previousMode === 'sarvam') {
      nextMode = 'local';
    } else if (previousMode === 'local') {
      nextMode = 'api';
    } else {
      nextMode = 'sarvam';
    }

    // Optimistically update state and storage
    setMode(nextMode);
    try {
      localStorage.setItem('voxora_model_mode', nextMode);
    } catch (_) {}

    try {
      const res = await modelConfigApi.toggleModelMode(nextMode);
      setMode(res.mode);
      try {
        localStorage.setItem('voxora_model_mode', res.mode);
      } catch (_) {}
      const label =
        res.mode === 'sarvam'
          ? 'Switched to Sarvam AI (Bulbul v3 + Saaras v3)'
          : res.mode === 'local'
          ? 'Switched to 100% Local GPU (Whisper + Kokoro)'
          : 'Switched to Dograh Cloud API';
      setNotification(label);
      setTimeout(() => setNotification(null), 4500);
    } catch (err: any) {
      setMode(previousMode);
      try {
        localStorage.setItem('voxora_model_mode', previousMode);
      } catch (_) {}
      setNotification(`Failed to switch mode: ${err.message || 'Error'}`);
      setTimeout(() => setNotification(null), 4500);
    } finally {
      setIsLoading(false);
    }
  };

  const isSarvam = mode === 'sarvam';
  const isLocal = mode === 'local';

  return (
    <div className="relative inline-flex items-center">
      {/* Mode Switch Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        title={
          isSarvam
            ? 'Running on Sarvam AI (Bulbul v3 + Saaras v3 Indic Voice). Click to cycle to 100% Local GPU.'
            : isLocal
            ? 'Running 100% Local (Gemma 4 + Whisper CUDA + Kokoro ONNX). Click to cycle to Cloud API.'
            : 'Running on Cloud API. Click to cycle to Sarvam AI.'
        }
        className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all duration-300 cursor-pointer shadow-sm select-none ${
          isSarvam
            ? 'bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
            : isLocal
            ? 'bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/5 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
            : 'bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-indigo-500/5 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 hover:border-indigo-500/60 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
        }`}
      >
        {/* Animated Glow Dot */}
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isSarvam ? 'bg-amber-400' : isLocal ? 'bg-emerald-400' : 'bg-indigo-400'
            }`}
          />
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isSarvam ? 'bg-amber-500' : isLocal ? 'bg-emerald-500' : 'bg-indigo-500'
            }`}
          />
        </span>

        {/* Icon & Label */}
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-current" />
        ) : isLocal ? (
          <Cpu className="w-3.5 h-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
        ) : !isSarvam ? (
          <Cloud className="w-3.5 h-3.5 text-indigo-500 group-hover:scale-110 transition-transform" />
        ) : null}

        <span className="hidden sm:inline tracking-tight font-medium">
          {isLoading ? (
            'Switching...'
          ) : isSarvam ? (
            <span>
              <span className="font-bold text-amber-600 dark:text-amber-400">Sarvam AI</span> Voice
            </span>
          ) : isLocal ? (
            <span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">100% Local</span> GPU
            </span>
          ) : (
            <span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">Cloud API</span> Mode
            </span>
          )}
        </span>

        <span className="sm:hidden font-bold">
          {isLoading ? '...' : isSarvam ? 'Sarvam' : isLocal ? 'Local' : 'API'}
        </span>

        {/* Switch Hint Badge */}
        <span
          className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-md font-mono uppercase transition-colors hidden md:inline-block ${
            isSarvam
              ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
              : isLocal
              ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
              : 'bg-indigo-500/20 text-indigo-800 dark:text-indigo-200'
          }`}
        >
          {isSarvam ? 'Indic' : isLocal ? 'GPU' : 'Cloud'}
        </span>
      </button>

      {/* Floating Status Notification Popup */}
      {notification && (
        <div className="absolute right-0 top-12 z-50 w-72 p-2.5 rounded-xl bg-slate-900/95 text-white text-xs border border-white/10 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <p className="font-semibold">{notification}</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">
                {isSarvam
                  ? 'All calls synthesize with Sarvam Bulbul v3 and transcribe via Saaras v3'
                  : isLocal
                  ? 'All voice AI inferences run offline on your local GPU'
                  : 'All voice AI inferences routed through Dograh Cloud'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
