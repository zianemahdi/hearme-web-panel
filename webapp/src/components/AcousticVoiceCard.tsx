import React, { useState, useEffect } from 'react';
import { Mic, Activity, Volume2, Sparkles, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface AcousticVoiceCardProps {
  theme?: 'dark' | 'light';
  onKeywordTriggered?: () => void;
}

export const AcousticVoiceCard: React.FC<AcousticVoiceCardProps> = ({
  theme = 'dark',
  onKeywordTriggered
}) => {
  const isDark = theme === 'dark';
  const [isListening, setIsListening] = useState(true);
  const [decibels, setDecibels] = useState(38);
  const [lastDetected, setLastDetected] = useState<string | null>(null);
  const [isSimulatingTrigger, setIsSimulatingTrigger] = useState(false);

  // Equalizer bar heights
  const [eqLevels, setEqLevels] = useState<number[]>([40, 65, 30, 85, 95, 60, 45, 75, 90, 50, 70, 35, 80, 60, 40]);

  // Ambient sound fluctuation
  useEffect(() => {
    if (!isListening) return;
    const interval = setInterval(() => {
      // Simulate realistic ambient noise dB changes
      const base = 35;
      const noise = Math.floor(Math.random() * 18);
      setDecibels(base + noise);

      // Randomize eq heights slightly for realistic waveform
      setEqLevels(prev =>
        prev.map(() => Math.floor(Math.random() * 75) + 20)
      );
    }, 180);

    return () => clearInterval(interval);
  }, [isListening]);

  const handleTestKeyword = () => {
    setIsSimulatingTrigger(true);
    setDecibels(82);
    setEqLevels([95, 100, 90, 100, 95, 100, 90, 95, 100, 90, 95, 90, 100, 95, 90]);
    setLastDetected('à l\'instant (« HearMe ! »)');

    if (onKeywordTriggered) {
      onKeywordTriggered();
    }

    setTimeout(() => {
      setIsSimulatingTrigger(false);
    }, 2800);
  };

  return (
    <div
      id="bento-acoustic-voice-card"
      className={`hm-card-interactive rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between ${
        isSimulatingTrigger ? 'ring-2 ring-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.35)]' : ''
      }`}
    >
      {/* Background ambient glow */}
      <div className="hm-bento-glow w-36 h-36 bg-purple-500 top-0 right-0 -mr-10 -mt-10" />

      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-400">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                Écoute Vocale « HearMe »
              </h2>
              <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Détection continue en tâche de fond
              </span>
            </div>
          </div>

          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase border flex items-center gap-1.5 ${
              isSimulatingTrigger
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                : isListening
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSimulatingTrigger ? 'bg-rose-400 animate-ping' : isListening ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span>{isSimulatingTrigger ? 'MOT-CLÉ CAPTÉ !' : isListening ? 'Actif & Armé' : 'En pause'}</span>
          </span>
        </div>

        {/* Dynamic Equalizer Soundwave Visualizer */}
        <div
          className={`rounded-xl p-3.5 border transition-colors mb-3.5 ${
            isDark ? 'bg-black/40 border-white/[0.07]' : 'bg-slate-100/80 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-2">
            <span className={`flex items-center gap-1.5 font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              Spectrogramme Acoustique
            </span>
            <span className="font-mono text-[11px] text-purple-400 font-bold">
              {decibels} dB {decibels < 45 ? '(Calme)' : decibels < 70 ? '(Modéré)' : '(Fort)'}
            </span>
          </div>

          {/* Waveform Equalizer Bars */}
          <div className="h-10 flex items-end justify-between gap-1 px-1 pt-1">
            {eqLevels.map((val, idx) => (
              <div
                key={idx}
                className="flex-1 rounded-full transition-all duration-150 relative overflow-hidden"
                style={{
                  height: `${Math.max(val, 12)}%`,
                  background: isSimulatingTrigger
                    ? 'linear-gradient(180deg, #ec4899 0%, #f43f5e 100%)'
                    : 'linear-gradient(180deg, #a855f7 0%, #3b82f6 100%)',
                  opacity: 0.85 + (val / 100) * 0.15
                }}
              />
            ))}
          </div>
        </div>

        {/* Telemetry info row */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div
            className={`p-2.5 rounded-xl border ${
              isDark ? 'bg-black/30 border-white/[0.06]' : 'bg-white border-slate-200'
            }`}
          >
            <span className={`text-[10px] uppercase font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Sensibilité Micro
            </span>
            <span className={`font-mono font-bold text-xs ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              Ultra-Haute (98%)
            </span>
          </div>

          <div
            className={`p-2.5 rounded-xl border ${
              isDark ? 'bg-black/30 border-white/[0.06]' : 'bg-white border-slate-200'
            }`}
          >
            <span className={`text-[10px] uppercase font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Dernière activation
            </span>
            <span className={`font-mono font-bold text-xs truncate ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>
              {lastDetected || 'Aucune (En veille)'}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Trigger simulation */}
      <button
        onClick={handleTestKeyword}
        disabled={isSimulatingTrigger}
        className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-98 ${
          isSimulatingTrigger
            ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
            : isDark
            ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/30'
            : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
        }`}
      >
        <Sparkles className="w-3.5 h-3.5 text-pink-400" />
        <span>{isSimulatingTrigger ? 'Simulation mot-clé en cours...' : 'Tester le mot-clé « HearMe »'}</span>
      </button>
    </div>
  );
};
