'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Play, Pause, RotateCcw } from 'lucide-react';

const PRESETS = [30, 60, 90, 120, 180] as const;

interface RestTimerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSeconds?: number;
}

export function RestTimer({ isOpen, onClose, defaultSeconds = 90 }: RestTimerProps) {
  const [totalSeconds, setTotalSeconds] = useState(defaultSeconds);
  const [remaining, setRemaining] = useState(defaultSeconds);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const doneRef = useRef(false);

  // Play a distinct 3-tone alarm ONCE (resumes the audio context so it works after
  // an auto-start with no direct tap, e.g. on mobile), plus a vibration pattern.
  const playAlarm = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const beepAt = (offset: number, freq: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.37);
      };
      beepAt(0, 880);
      beepAt(0.45, 880);
      beepAt(0.9, 1175);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([250, 120, 250, 120, 400]);
      }
    } catch { /* silent */ }
  }, []);

  // Countdown: a single interval driven only by `running`. Stops at 0 (never loops).
  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  // When it hits zero: stop and fire the alarm exactly once.
  useEffect(() => {
    if (remaining > 0) { doneRef.current = false; return; }
    if (started && !doneRef.current) {
      doneRef.current = true;
      setRunning(false);
      playAlarm();
    }
  }, [remaining, started, playAlarm]);

  // Auto-start when opened — sync to the caller's requested duration each time
  useEffect(() => {
    if (isOpen) {
      setTotalSeconds(defaultSeconds);
      setRemaining(defaultSeconds);
      setRunning(true);
      setStarted(true);
      doneRef.current = false;
    } else {
      setRunning(false);
      setStarted(false);
    }
  }, [isOpen, defaultSeconds]);

  const selectPreset = (seconds: number) => {
    setTotalSeconds(seconds);
    setRemaining(seconds);
    setRunning(true);
    setStarted(true);
  };

  const togglePause = () => setRunning(!running);

  const reset = () => {
    setRemaining(totalSeconds);
    setRunning(true);
  };

  if (!isOpen) return null;

  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const circumference = 2 * Math.PI * 110;
  const strokeDashoffset = circumference * (1 - progress);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isComplete = started && remaining === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[340px] rounded-2xl bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
          <h3 className="font-display font-bold text-sm">Rest Timer</h3>
          <div className="w-8" />
        </div>

        {/* Subtitle */}
        <p className="text-xs text-muted-foreground text-center mb-6">
          Choose a duration below or set your own.
        </p>

        {/* Circular timer */}
        <div className="relative flex items-center justify-center mb-6">
          <svg width="240" height="240" viewBox="0 0 240 240">
            {/* Background circle */}
            <circle cx="120" cy="120" r="110" fill="none" stroke="currentColor" strokeWidth="6" className="text-secondary" />
            {/* Progress circle */}
            <circle
              cx="120" cy="120" r="110" fill="none"
              stroke={isComplete ? '#22c55e' : '#38bdf8'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 120 120)"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isComplete ? (
              <p className="text-2xl font-bold text-green-500">Done!</p>
            ) : (
              <>
                {/* Preset buttons inside circle */}
                <div className="flex flex-col items-center gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p}
                      onClick={() => selectPreset(p)}
                      className={`text-sm font-mono transition-colors ${
                        totalSeconds === p && started
                          ? 'text-sky-400 font-bold'
                          : 'text-foreground/70 hover:text-foreground'
                      }`}
                    >
                      {Math.floor(p / 60)}:{(p % 60).toString().padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Time display when running */}
        {started && !isComplete && (
          <div className="text-center mb-4">
            <p className="text-4xl font-bold font-mono">{mins}:{secs.toString().padStart(2, '0')}</p>
          </div>
        )}

        {/* Controls */}
        {started && (
          <div className="flex justify-center gap-3 mb-4">
            <button
              onClick={togglePause}
              className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            >
              {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button
              onClick={reset}
              className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Custom timer input */}
        {!started && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={600}
                value={totalSeconds}
                onChange={e => {
                  const v = parseInt(e.target.value) || 60;
                  setTotalSeconds(Math.max(5, Math.min(600, v)));
                }}
                className="flex-1 text-center bg-secondary rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <span className="text-xs text-muted-foreground">seconds</span>
            </div>
            <button
              onClick={() => { setRemaining(totalSeconds); setRunning(true); setStarted(true); }}
              className="w-full py-2.5 bg-secondary hover:bg-secondary/80 rounded-lg text-sm font-semibold transition-colors"
            >
              Start Timer
            </button>
          </div>
        )}

        {/* Skip / close button when complete */}
        {isComplete && (
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold"
          >
            Continue Workout
          </button>
        )}
      </div>
    </div>
  );
}
