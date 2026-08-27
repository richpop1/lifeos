'use client';
import { useState } from 'react';
import { Sun, Moon, Clock, Zap, ChevronDown, ChevronUp, Battery, MessageSquare, Sparkles, Lightbulb, Heart, Trash2, Edit3, RefreshCw, Loader2, X, Check, MessageCircle, Target, Calendar, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

const MOODS: Record<string, { emoji: string; label: string }> = {
  energized: { emoji: '✨', label: 'Energized' },
  calm: { emoji: '🌿', label: 'Calm' },
  focused: { emoji: '🎯', label: 'Focused' },
  happy: { emoji: '☀️', label: 'Happy' },
  neutral: { emoji: '🌤️', label: 'Neutral' },
  anxious: { emoji: '🌪️', label: 'Anxious' },
  tired: { emoji: '🌙', label: 'Tired' },
  stressed: { emoji: '💨', label: 'Stressed' },
};

interface Props {
  entries: any[];
  onEntryDeleted?: (id: string) => void;
  onEntryUpdated?: (entry: any) => void;
  onContinue?: (entry: any) => void;
}

export function JournalTimeline({ entries, onEntryDeleted, onEntryUpdated, onContinue }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [resummarizing, setResummarizing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this journal entry? This cannot be undone.')) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/journal/${id}`, { method: 'DELETE' });
      if (r.ok) {
        toast.success('Entry deleted');
        onEntryDeleted?.(id);
      } else toast.error('Failed to delete');
    } catch { toast.error('Failed'); }
    setDeleting(null);
  };

  const handleResummarize = async (id: string) => {
    setResummarizing(id);
    try {
      const r = await fetch(`/api/journal/${id}/resummarize`, { method: 'POST' });
      if (r.ok) {
        const updated = await r.json();
        toast.success('Re-summarized!');
        onEntryUpdated?.(updated);
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Failed to re-summarize');
      }
    } catch { toast.error('Failed'); }
    setResummarizing(null);
  };

  const startEditing = (entry: any) => {
    setEditingId(entry.id);
    setEditForm({
      dayTitle: entry.dayTitle || '',
      focusItem: entry.focusItem || '',
      cleanWin: entry.cleanWin || '',
      focusRazor: entry.focusRazor || '',
      signal: entry.signal || '',
      personalMirror: entry.personalMirror || '',
      humanClose: entry.humanClose || '',
      dailyLine: entry.dailyLine || '',
      razorSummary: entry.razorSummary || '',
      date: new Date(entry.date).toISOString().split('T')[0],
    });
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/journal/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (r.ok) {
        const updated = await r.json();
        toast.success('Saved');
        onEntryUpdated?.(updated);
        setEditingId(null);
      } else toast.error('Failed to save');
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  if (!entries || entries.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
        <p className="text-sm text-muted-foreground">No journal entries yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Start your first razor session above.</p>
      </div>
    );
  }

  // Group by date
  const grouped: Record<string, any[]> = {};
  entries.forEach((entry: any) => {
    const dateKey = new Date(entry.date).toLocaleDateString('en-SG', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(entry);
  });

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([dateKey, dayEntries]) => (
        <div key={dateKey}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-mono text-muted-foreground px-2">{dateKey}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-3">
            {dayEntries.map((entry: any) => {
              const isExpanded = expandedId === entry.id;
              const moodStartData = MOODS[entry.moodStart || ''];
              const moodEndData = MOODS[entry.moodEnd || ''];
              const isMorning = entry.sessionType === 'morning';
              const hasRazorData = entry.dayTitle || entry.focusItem || entry.razorSummary;
              const hasChatMessages = entry.chatMessages && Array.isArray(entry.chatMessages) && entry.chatMessages.length > 0;
              const memories = Array.isArray(entry.keyMemories) ? entry.keyMemories : [];
              const ideas = Array.isArray(entry.ideas) ? entry.ideas : [];
              const mediaUrls: Array<{url: string; type: string; cloudPath?: string}> = Array.isArray(entry.mediaUrls) ? entry.mediaUrls : [];
              const hasLifeInsights = memories.length > 0 || ideas.length > 0;

              return (
                <button
                  key={entry.id}
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full text-left bg-card rounded-xl p-4 transition-all hover:shadow-md"
                  style={{ boxShadow: 'var(--shadow-sm)' }}
                >
                  {/* Header Row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isMorning
                        ? <Sun className="w-3.5 h-3.5 text-amber-500" />
                        : <Moon className="w-3.5 h-3.5 text-indigo-500" />
                      }
                      <span className="text-xs font-medium capitalize">{entry.sessionType}</span>
                      {moodStartData && moodEndData && (
                        <span className="text-xs">{moodStartData.emoji} → {moodEndData.emoji}</span>
                      )}
                      {entry.energy && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Battery className="w-3 h-3" /> {entry.energy}/5
                        </span>
                      )}
                      {entry.goal && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-0.5">
                          <Target className="w-2.5 h-2.5" />{entry.goal.title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(entry.date).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Day Title or Razor Summary Preview */}
                  {entry.dayTitle && (
                    <p className="text-sm font-display font-semibold mb-1">"{entry.dayTitle}"</p>
                  )}
                  {!entry.dayTitle && entry.razorSummary && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{entry.razorSummary}</p>
                  )}
                  {!entry.dayTitle && !entry.razorSummary && entry.focusItem && (
                    <p className="text-xs"><span className="text-muted-foreground">🎯 </span>{entry.focusItem}</p>
                  )}

                  {/* Preview badges for memories/ideas/media */}
                  {!isExpanded && (hasLifeInsights || mediaUrls.length > 0) && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {mediaUrls.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                          <ImageIcon className="w-2.5 h-2.5" /> {mediaUrls.length} {mediaUrls.length === 1 ? 'attachment' : 'attachments'}
                        </span>
                      )}
                      {memories.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-50 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-800">
                          <Heart className="w-2.5 h-2.5" /> {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
                        </span>
                      )}
                      {ideas.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          <Lightbulb className="w-2.5 h-2.5" /> {ideas.length} {ideas.length === 1 ? 'idea' : 'ideas'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Legacy entries (old format with responses) */}
                  {!hasRazorData && !hasChatMessages && entry.responses && Array.isArray(entry.responses) && entry.responses.length > 0 && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{entry.responses[0]?.answer || ''}</p>
                  )}

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2.5" onClick={(e) => e.stopPropagation()}>
                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 mb-2">
                        <button onClick={() => editingId === entry.id ? setEditingId(null) : startEditing(entry)}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                          <Edit3 className="w-3 h-3" /> {editingId === entry.id ? 'Cancel Edit' : 'Edit'}
                        </button>
                        {hasChatMessages && (
                          <>
                            <button onClick={() => onContinue?.(entry)}
                              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors">
                              <MessageCircle className="w-3 h-3" /> Continue
                            </button>
                            <button onClick={() => handleResummarize(entry.id)} disabled={resummarizing === entry.id}
                              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                              {resummarizing === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              {resummarizing === entry.id ? 'Re-summarizing...' : 'AI Re-summarize'}
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDelete(entry.id)} disabled={deleting === entry.id}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-50 ml-auto">
                          {deleting === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Delete
                        </button>
                      </div>
                      {/* Inline Edit Form */}
                      {editingId === entry.id ? (
                        <div className="space-y-2">
                          {[
                            { key: 'dayTitle', label: '📌 Day Title' },
                            { key: 'focusItem', label: '🎯 Focus' },
                            { key: 'cleanWin', label: '✅ Clean Win' },
                            { key: 'focusRazor', label: '🔪 Razor' },
                            { key: 'signal', label: '📡 Signal' },
                            { key: 'personalMirror', label: '🪞 Mirror' },
                            { key: 'humanClose', label: '❤️ Close' },
                            { key: 'dailyLine', label: '✨ Daily Line' },
                          ].map(({ key, label }) => (
                            <div key={key}>
                              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</label>
                              <input
                                type="text"
                                value={editForm[key] || ''}
                                onChange={(e) => setEditForm((p: any) => ({ ...p, [key]: e.target.value }))}
                                className="w-full text-xs mt-0.5 rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                                placeholder={`Enter ${label.replace(/[^\w\s]/g, '').trim().toLowerCase()}...`}
                              />
                            </div>
                          ))}
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">📋 Razor Summary</label>
                            <textarea
                              value={editForm.razorSummary || ''}
                              onChange={(e) => setEditForm((p: any) => ({ ...p, razorSummary: e.target.value }))}
                              rows={3}
                              className="w-full text-xs mt-0.5 rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                              placeholder="Enter razor summary..."
                            />
                          </div>
                          {/* Date picker */}
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">📅 Entry Date</label>
                            <input
                              type="date"
                              value={editForm.date || ''}
                              onChange={(e) => setEditForm((p: any) => ({ ...p, date: e.target.value }))}
                              className="w-full text-xs mt-0.5 rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                            <p className="text-[9px] text-muted-foreground mt-0.5">Change the date without affecting the original timestamp</p>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => saveEdit(entry.id)} disabled={saving}
                              className="flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50">
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-md bg-secondary text-muted-foreground">
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                      {entry.focusItem && (
                        <div>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">🎯 Focus</span>
                          <p className="text-xs mt-0.5">{entry.focusItem}</p>
                        </div>
                      )}
                      {entry.cleanWin && (
                        <div>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">✅ Clean Win</span>
                          <p className="text-xs mt-0.5">{entry.cleanWin}</p>
                        </div>
                      )}
                      {entry.focusRazor && (
                        <div>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">🔪 Razor</span>
                          <p className="text-xs mt-0.5 text-amber-600 dark:text-amber-400">{entry.focusRazor}</p>
                        </div>
                      )}
                      {entry.signal && (
                        <div>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">📡 Signal</span>
                          <p className="text-xs mt-0.5">{entry.signal}</p>
                        </div>
                      )}
                      {entry.personalMirror && (
                        <div>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">🪞 Mirror</span>
                          <p className="text-xs mt-0.5 font-medium">{entry.personalMirror}</p>
                        </div>
                      )}
                      {entry.humanClose && (
                        <div>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">❤️ Close</span>
                          <p className="text-xs mt-0.5">{entry.humanClose}</p>
                        </div>
                      )}
                      {entry.dailyLine && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs italic text-center text-muted-foreground">"{entry.dailyLine}"</p>
                        </div>
                      )}
                      {entry.razorSummary && (
                        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10 mt-2">
                          <span className="text-[10px] font-mono text-primary uppercase tracking-wider">Razor Summary</span>
                          <p className="text-xs mt-1 leading-relaxed">{entry.razorSummary}</p>
                        </div>
                      )}

                      {/* Media Gallery */}
                      {mediaUrls.length > 0 && (
                        <div className="mt-2">
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-2">
                            <ImageIcon className="w-3 h-3" /> Media
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {mediaUrls.map((media: any, i: number) => (
                              <div key={i} className="relative rounded-lg overflow-hidden bg-muted aspect-square">
                                {media.type?.startsWith('video') ? (
                                  <video
                                    src={media.url}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <img
                                    src={media.url}
                                    alt={`Journal media ${i + 1}`}
                                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => window.open(media.url, '_blank')}
                                    loading="lazy"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                        </>)}


                      {/* Key Memories */}
                      {memories.length > 0 && (
                        <div className="bg-pink-50/50 dark:bg-pink-950/10 rounded-lg p-3 border border-pink-200/50 dark:border-pink-800/30 mt-2">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Heart className="w-3.5 h-3.5 text-pink-500" />
                            <span className="text-[10px] font-mono text-pink-600 dark:text-pink-400 uppercase tracking-wider">Key Memories</span>
                          </div>
                          <div className="space-y-2">
                            {memories.map((mem: any, i: number) => (
                              <div key={i} className="text-xs">
                                <p className="font-medium">{mem.moment}</p>
                                {mem.context && <p className="text-muted-foreground mt-0.5">{mem.context}</p>}
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {mem.emotion && (
                                    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">
                                      {mem.emotion}
                                    </span>
                                  )}
                                  {mem.personName && (
                                    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                                      @{mem.personName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ideas */}
                      {ideas.length > 0 && (
                        <div className="bg-amber-50/50 dark:bg-amber-950/10 rounded-lg p-3 border border-amber-200/50 dark:border-amber-800/30 mt-2">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 uppercase tracking-wider">Ideas & Sparks</span>
                          </div>
                          <div className="space-y-2">
                            {ideas.map((idea: any, i: number) => (
                              <div key={i} className="text-xs">
                                <p className="font-medium">{idea.idea}</p>
                                {idea.context && <p className="text-muted-foreground mt-0.5">{idea.context}</p>}
                                {idea.category && (
                                  <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                    {idea.category}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Legacy responses */}
                      {!hasRazorData && entry.responses && Array.isArray(entry.responses) && entry.responses.length > 0 && (
                        <div className="space-y-2">
                          {entry.responses.map((r: any, i: number) => (
                            <div key={i}>
                              <span className="text-[10px] text-muted-foreground">{r.question}</span>
                              <p className="text-xs mt-0.5">{r.answer}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}