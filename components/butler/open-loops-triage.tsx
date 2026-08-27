'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Circle, Scissors, ArrowRight, Clock, AlertTriangle,
  CheckCircle2, Sparkles, RefreshCw, ChevronRight,
  Zap, Heart, Wallet, Brain, CornerDownRight
} from 'lucide-react';

interface OpenLoop {
  id: string;
  content: string;
  context: any;
  emotion: string | null;
  source: string;
  sourceId: string | null;
  type: string;
  status: string;
  resolution: string | null;
  pillar: string | null;
  urgency: string;
  dedupKey: string | null;
  mentionCount: number;
  deferCount: number;
  nextStep: string | null;
  wakeDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type TriageAction = 'pursued' | 'cut' | 'deferred';

const SESSION_CAP = 7;

const URGENCY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const URGENCY_COLORS: Record<string, string> = {
  critical: 'text-red-600 bg-red-50 border-red-200',
  high: 'text-orange-600 bg-orange-50 border-orange-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-gray-500 bg-gray-50 border-gray-200',
};
const PILLAR_ICONS: Record<string, any> = {
  wealth: Wallet,
  health: Heart,
  relationship: Heart,
};
const SOURCE_LABELS: Record<string, string> = {
  capture: 'Quick capture',
  email: 'Email',
  task: 'Task',
  contact: 'Contact',
  calendar: 'Calendar',
  pattern_engine: 'Pattern detected',
};

export function OpenLoopsTriage() {
  const [allLoops, setAllLoops] = useState<OpenLoop[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalOpen, setTotalOpen] = useState(0);
  // Session tracking
  const [sessionQueue, setSessionQueue] = useState<OpenLoop[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [triageLog, setTriageLog] = useState<{ loop: OpenLoop; action: TriageAction }[]>([]);
  // Action modals
  const [pendingAction, setPendingAction] = useState<TriageAction | null>(null);
  const [deferDays, setDeferDays] = useState(1);
  const [nextStep, setNextStep] = useState('');
  const [resolution, setResolution] = useState('');
  const [acting, setActing] = useState(false);

  const fetchLoops = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/butler/loops?status=open&limit=50');
      if (res.ok) {
        const data = await res.json();
        setAllLoops(data.loops || []);
        setTotalOpen(data.total || 0);
      }
    } catch (e) {
      console.error('Failed to fetch loops:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLoops(); }, [fetchLoops]);

  const startSession = () => {
    // Take top N loops sorted by urgency, deferCount desc
    const sorted = [...allLoops].sort((a, b) => {
      const u = (URGENCY_ORDER[a.urgency] ?? 2) - (URGENCY_ORDER[b.urgency] ?? 2);
      if (u !== 0) return u;
      return b.deferCount - a.deferCount; // most deferred first
    });
    const batch = sorted.slice(0, SESSION_CAP);
    setSessionQueue(batch);
    setCurrentIndex(0);
    setSessionStarted(true);
    setSessionDone(false);
    setTriageLog([]);
  };

  const currentLoop = sessionQueue[currentIndex];

  const executeAction = async (action: TriageAction) => {
    if (!currentLoop) return;
    setActing(true);
    try {
      const body: any = { status: action };
      if (action === 'deferred') {
        body.wakeDate = new Date(Date.now() + deferDays * 86400000).toISOString();
      }
      if (action === 'pursued' && nextStep) {
        body.nextStep = nextStep;
      }
      if (action === 'cut' && resolution) {
        body.resolution = resolution;
      }

      const res = await fetch(`/api/butler/loops/${currentLoop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setTriageLog(prev => [...prev, { loop: currentLoop, action }]);
        // Reset action state
        setPendingAction(null);
        setDeferDays(1);
        setNextStep('');
        setResolution('');
        // Advance
        if (currentIndex + 1 >= sessionQueue.length) {
          setSessionDone(true);
        } else {
          setCurrentIndex(prev => prev + 1);
        }
      }
    } catch (e) {
      console.error('Triage action failed:', e);
    } finally {
      setActing(false);
    }
  };

  const resetSession = () => {
    setSessionStarted(false);
    setSessionDone(false);
    setSessionQueue([]);
    setCurrentIndex(0);
    setTriageLog([]);
    fetchLoops();
  };

  // ─── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-5 h-5 animate-spin text-[#6B8F71]" />
      </div>
    );
  }

  // ─── Empty state ─────────────────────────────────────────
  if (allLoops.length === 0 && !sessionStarted) {
    return (
      <div className="px-4 py-12">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#6B8F71]/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-[#6B8F71]" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">All clear</h3>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            No open loops right now. Capture something with the Quick Capture bar
            or let the Butler detect open loops from your emails and tasks.
          </p>
        </div>
      </div>
    );
  }

  // ─── Session complete ────────────────────────────────────
  if (sessionDone) {
    const pursued = triageLog.filter(t => t.action === 'pursued').length;
    const cut = triageLog.filter(t => t.action === 'cut').length;
    const deferred = triageLog.filter(t => t.action === 'deferred').length;
    const remaining = totalOpen - triageLog.length;

    return (
      <div className="px-4 py-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-[#6B8F71]/10 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7 text-[#6B8F71]" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Session complete</h3>
          <p className="text-sm text-gray-500">Triaged {triageLog.length} open loop{triageLog.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{pursued}</p>
            <p className="text-xs text-green-600">Pursued</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{cut}</p>
            <p className="text-xs text-red-600">Cut</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{deferred}</p>
            <p className="text-xs text-amber-600">Deferred</p>
          </div>
        </div>

        {remaining > 0 && (
          <p className="text-center text-sm text-gray-500">
            {remaining} loop{remaining !== 1 ? 's' : ''} still open
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={resetSession}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700"
          >
            Done
          </button>
          {remaining > 0 && (
            <button
              onClick={() => { resetSession(); setTimeout(startSession, 300); }}
              className="flex-1 py-3 rounded-xl bg-[#6B8F71] text-white text-sm font-medium"
            >
              Next batch
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Pre-session: overview ───────────────────────────────
  if (!sessionStarted) {
    const byUrgency = allLoops.reduce((acc, l) => {
      acc[l.urgency] = (acc[l.urgency] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return (
      <div className="px-4 py-6 space-y-6">
        <div className="text-center space-y-1">
          <h3 className="text-lg font-semibold text-gray-900">Open Loops</h3>
          <p className="text-sm text-gray-500">
            {totalOpen} thing{totalOpen !== 1 ? 's' : ''} on your mind. Let's triage.
          </p>
        </div>

        {/* Urgency breakdown */}
        <div className="flex flex-wrap gap-2 justify-center">
          {['critical', 'high', 'medium', 'low'].map(u => {
            const count = byUrgency[u] || 0;
            if (count === 0) return null;
            return (
              <span key={u} className={`text-xs px-2.5 py-1 rounded-full border ${URGENCY_COLORS[u]}`}>
                {count} {u}
              </span>
            );
          })}
        </div>

        {/* Top 3 preview */}
        <div className="space-y-2">
          {allLoops.slice(0, 3).map(loop => (
            <div key={loop.id} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-100">
              <Circle className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 line-clamp-2">{loop.content}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {SOURCE_LABELS[loop.source] || loop.source}
                  {loop.deferCount > 0 && ` · deferred ${loop.deferCount}x`}
                  {loop.mentionCount > 1 && ` · mentioned ${loop.mentionCount}x`}
                </p>
              </div>
            </div>
          ))}
          {allLoops.length > 3 && (
            <p className="text-xs text-gray-400 text-center">+{allLoops.length - 3} more</p>
          )}
        </div>

        <button
          onClick={startSession}
          className="w-full py-3.5 rounded-xl bg-[#6B8F71] text-white font-medium text-sm flex items-center justify-center gap-2"
        >
          <Brain className="w-4 h-4" />
          Start triage session ({Math.min(allLoops.length, SESSION_CAP)} loops)
        </button>
      </div>
    );
  }

  // ─── Active triage card ──────────────────────────────────
  const progress = currentIndex + 1;
  const PillarIcon = currentLoop?.pillar ? PILLAR_ICONS[currentLoop.pillar] || Circle : Circle;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>{progress} of {sessionQueue.length}</span>
          <span>{triageLog.length} triaged</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#6B8F71] rounded-full transition-all duration-300"
            style={{ width: `${(progress / sessionQueue.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Current loop card */}
      {currentLoop && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header with urgency + meta */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${URGENCY_COLORS[currentLoop.urgency]}`}>
                {currentLoop.urgency}
              </span>
              {currentLoop.pillar && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <PillarIcon className="w-3 h-3" />
                  {currentLoop.pillar}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {currentLoop.type}
            </span>
          </div>

          {/* Content */}
          <div className="px-4 py-4">
            <p className="text-base text-gray-900 leading-relaxed">{currentLoop.content}</p>
            {currentLoop.nextStep && (
              <div className="mt-3 flex items-start gap-2 text-sm text-[#6B8F71]">
                <CornerDownRight className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Next: {currentLoop.nextStep}</span>
              </div>
            )}
          </div>

          {/* Meta footer */}
          <div className="px-4 py-2 border-t border-gray-50 flex items-center gap-3 text-xs text-gray-400">
            <span>{SOURCE_LABELS[currentLoop.source] || currentLoop.source}</span>
            {currentLoop.mentionCount > 1 && <span>Mentioned {currentLoop.mentionCount}x</span>}
            {currentLoop.deferCount > 0 && (
              <span className="text-amber-500 flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" />
                Deferred {currentLoop.deferCount}x
              </span>
            )}
          </div>

          {/* Action buttons or action form */}
          <div className="px-4 py-3 border-t border-gray-100">
            {pendingAction === null ? (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setPendingAction('pursued')}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-colors"
                >
                  <ArrowRight className="w-5 h-5" />
                  <span className="text-xs font-medium">Pursue</span>
                </button>
                <button
                  onClick={() => setPendingAction('cut')}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors"
                >
                  <Scissors className="w-5 h-5" />
                  <span className="text-xs font-medium">Cut</span>
                </button>
                <button
                  onClick={() => setPendingAction('deferred')}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  <Clock className="w-5 h-5" />
                  <span className="text-xs font-medium">Defer</span>
                </button>
              </div>
            ) : pendingAction === 'pursued' ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-medium">What's the next concrete step?</p>
                <input
                  type="text"
                  value={nextStep}
                  onChange={e => setNextStep(e.target.value)}
                  placeholder="e.g. Call dentist Monday morning"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6B8F71]/30 focus:border-[#6B8F71]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPendingAction(null); setNextStep(''); }}
                    className="flex-1 py-2 text-sm text-gray-500 rounded-lg border border-gray-200"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => executeAction('pursued')}
                    disabled={acting}
                    className="flex-1 py-2 text-sm font-medium text-white bg-green-600 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Pursue
                  </button>
                </div>
              </div>
            ) : pendingAction === 'cut' ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-medium">Why cut? (optional)</p>
                <input
                  type="text"
                  value={resolution}
                  onChange={e => setResolution(e.target.value)}
                  placeholder="e.g. Not important anymore"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPendingAction(null); setResolution(''); }}
                    className="flex-1 py-2 text-sm text-gray-500 rounded-lg border border-gray-200"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => executeAction('cut')}
                    disabled={acting}
                    className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Scissors className="w-4 h-4" />
                    Cut it
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-medium">Defer for how long?</p>
                <div className="flex gap-2">
                  {[1, 3, 7, 14].map(d => (
                    <button
                      key={d}
                      onClick={() => setDeferDays(d)}
                      className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                        deferDays === d
                          ? 'bg-amber-100 border-amber-300 text-amber-700 font-medium'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPendingAction(null); setDeferDays(1); }}
                    className="flex-1 py-2 text-sm text-gray-500 rounded-lg border border-gray-200"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => executeAction('deferred')}
                    disabled={acting}
                    className="flex-1 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Clock className="w-4 h-4" />
                    Defer {deferDays}d
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
