'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Search, Plus, Pin, PinOff, Archive, Trash2, Pencil, X, Check,
  Loader2, Bot, User, BookOpen, Mail, Zap, Filter, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface MemoryItem {
  id: string;
  type: string;
  key: string;
  content: string;
  weight: number;
  decay: number;
  provenance: string | null;
  entityType: string | null;
  entityId: string | null;
  isArchived: boolean;
  effectiveWeight: number;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const TYPE_META: Record<string, { label: string; color: string; desc: string }> = {
  profile: { label: 'Profile', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', desc: 'Who you are — preferences, traits, patterns' },
  semantic: { label: 'Semantic', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', desc: 'Facts and knowledge — things you know' },
  episodic: { label: 'Episodic', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', desc: 'Events and experiences — things that happened' },
  working: { label: 'Working', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300', desc: 'Short-term context — fades quickly' },
};

const PROVENANCE_META: Record<string, { label: string; icon: typeof Bot; color: string }> = {
  pattern_engine: { label: 'AI', icon: Bot, color: 'text-violet-600' },
  user_edit: { label: 'You', icon: User, color: 'text-emerald-600' },
  journal: { label: 'Journal', icon: BookOpen, color: 'text-amber-600' },
  email: { label: 'Email', icon: Mail, color: 'text-blue-600' },
  capture: { label: 'Capture', icon: Zap, color: 'text-pink-600' },
};

function ProvenanceBadge({ provenance }: { provenance: string | null }) {
  const meta = PROVENANCE_META[provenance || ''] || { label: provenance || 'Unknown', icon: Bot, color: 'text-muted-foreground' };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${meta.color}`}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  );
}

function WeightBar({ weight, isPinned }: { weight: number; isPinned: boolean }) {
  const pct = Math.max(0, Math.min(100, weight * 100));
  const color = isPinned ? 'bg-primary' : pct > 60 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-500' : 'bg-rose-400';
  return (
    <div className="flex items-center gap-1.5" title={`Strength: ${pct.toFixed(0)}%${isPinned ? ' (pinned)' : ''}`}>
      <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {isPinned && <Pin className="w-3 h-3 text-primary" />}
    </div>
  );
}

export function SecondBrainSection() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [provenanceFilter, setProvenanceFilter] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [newType, setNewType] = useState('semantic');
  const [newKey, setNewKey] = useState('');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (provenanceFilter) params.set('provenance', provenanceFilter);
      if (search) params.set('q', search);
      if (showArchived) params.set('archived', 'true');
      params.set('page', String(page));
      params.set('limit', '50');
      const res = await fetch(`/api/butler/memories?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setMemories(data.memories || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, provenanceFilter, search, showArchived, page]);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  const handlePin = async (id: string, currentlyPinned: boolean) => {
    try {
      await fetch(`/api/butler/memories/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: !currentlyPinned }),
      });
      toast.success(currentlyPinned ? 'Unpinned' : 'Pinned — won\'t decay');
      fetchMemories();
    } catch { toast.error('Failed'); }
  };

  const handleArchive = async (id: string) => {
    try {
      await fetch(`/api/butler/memories/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      });
      toast.success('Archived');
      fetchMemories();
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this memory?')) return;
    try {
      await fetch(`/api/butler/memories/${id}`, { method: 'DELETE' });
      toast.success('Deleted');
      fetchMemories();
    } catch { toast.error('Failed'); }
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await fetch(`/api/butler/memories/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      setEditingId(null);
      toast.success('Updated');
      fetchMemories();
    } catch { toast.error('Failed'); }
  };

  const handleCreate = async () => {
    if (!newKey.trim() || !newContent.trim()) {
      toast.error('Key and content are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/butler/memories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType, key: newKey.trim(), content: newContent.trim() }),
      });
      if (!res.ok) throw new Error();
      setShowComposer(false);
      setNewKey(''); setNewContent('');
      toast.success('Knowledge saved');
      fetchMemories();
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Group by type
  const grouped = memories.reduce((acc, m) => {
    const t = m.type || 'unknown';
    if (!acc[t]) acc[t] = [];
    acc[t].push(m);
    return acc;
  }, {} as Record<string, MemoryItem[]>);

  const typeOrder = ['profile', 'semantic', 'episodic', 'working'];
  const sortedTypes = Object.keys(grouped).sort((a, b) => {
    const ai = typeOrder.indexOf(a), bi = typeOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" /> Second Brain
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Everything your Butler remembers — from you, journals, emails, and AI patterns.
            <span className="ml-1 font-medium">{total} memories</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setPage(1); fetchMemories(); }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" onClick={() => setShowComposer(!showComposer)} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      </div>

      {/* Composer */}
      {showComposer && (
        <div className="bg-card border rounded-xl p-4 space-y-3 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Add Knowledge</h3>
            <button onClick={() => setShowComposer(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            {typeOrder.map(t => (
              <button key={t} onClick={() => setNewType(t)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  newType === t ? TYPE_META[t]?.color || 'bg-secondary' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                }`}>
                {TYPE_META[t]?.label || t}
              </button>
            ))}
          </div>
          <Input placeholder="Key (e.g. preference.coffee, fact.birthday.mom)" value={newKey} onChange={e => setNewKey(e.target.value)} className="text-sm" />
          <textarea placeholder="What do you want to remember?" value={newContent} onChange={e => setNewContent(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none min-h-[80px] focus:outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowComposer(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search memories..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 text-sm h-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1 h-9">
          <Filter className="w-3.5 h-3.5" /> {showFilters ? 'Hide' : 'Filters'}
        </Button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2 animate-in fade-in">
          <div className="flex gap-1 items-center">
            <span className="text-xs text-muted-foreground mr-1">Type:</span>
            <button onClick={() => { setTypeFilter(''); setPage(1); }}
              className={`px-2 py-0.5 rounded text-xs ${!typeFilter ? 'bg-primary/15 text-primary font-medium' : 'bg-secondary text-muted-foreground'}`}>All</button>
            {typeOrder.map(t => (
              <button key={t} onClick={() => { setTypeFilter(t); setPage(1); }}
                className={`px-2 py-0.5 rounded text-xs ${typeFilter === t ? TYPE_META[t]?.color || 'bg-secondary' : 'bg-secondary text-muted-foreground'}`}>
                {TYPE_META[t]?.label || t}
              </button>
            ))}
          </div>
          <div className="flex gap-1 items-center">
            <span className="text-xs text-muted-foreground mr-1">Source:</span>
            <button onClick={() => { setProvenanceFilter(''); setPage(1); }}
              className={`px-2 py-0.5 rounded text-xs ${!provenanceFilter ? 'bg-primary/15 text-primary font-medium' : 'bg-secondary text-muted-foreground'}`}>All</button>
            {Object.entries(PROVENANCE_META).map(([k, v]) => (
              <button key={k} onClick={() => { setProvenanceFilter(k); setPage(1); }}
                className={`px-2 py-0.5 rounded text-xs ${provenanceFilter === k ? 'bg-primary/15 text-primary font-medium' : 'bg-secondary text-muted-foreground'}`}>
                {v.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={e => { setShowArchived(e.target.checked); setPage(1); }} className="rounded" />
            Show archived
          </label>
        </div>
      )}

      {/* Memory list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : memories.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No memories yet</p>
          <p className="text-xs mt-1">Your Butler will learn as you journal, capture thoughts, and interact. You can also add knowledge manually.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedTypes.map(type => {
            const meta = TYPE_META[type] || { label: type, color: 'bg-secondary text-foreground', desc: '' };
            const items = grouped[type];
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                  <span className="text-[11px] text-muted-foreground">{meta.desc}</span>
                  <span className="text-[11px] text-muted-foreground ml-auto">{items.length}</span>
                </div>
                <div className="space-y-1">
                  {items.map(m => {
                    const isExpanded = expandedIds.has(m.id);
                    const isLong = m.content.length > 120;
                    const isEditing = editingId === m.id;
                    return (
                      <div key={m.id}
                        className={`group bg-card border rounded-lg px-3 py-2.5 transition-colors hover:border-primary/30 ${
                          m.isArchived ? 'opacity-50' : ''
                        }`}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]" title={m.key}>{m.key}</span>
                              <ProvenanceBadge provenance={m.provenance} />
                              <WeightBar weight={m.effectiveWeight} isPinned={m.isPinned} />
                            </div>
                            {isEditing ? (
                              <div className="space-y-2 mt-1">
                                <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                                  className="w-full border rounded-lg px-2.5 py-1.5 text-sm bg-background resize-none min-h-[60px] focus:outline-none focus:ring-1 focus:ring-primary" />
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 text-xs">Cancel</Button>
                                  <Button size="sm" onClick={() => handleSaveEdit(m.id)} className="h-7 text-xs gap-1"><Check className="w-3 h-3" />Save</Button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm text-foreground whitespace-pre-wrap">
                                  {isLong && !isExpanded ? m.content.slice(0, 120) + '...' : m.content}
                                </p>
                                {isLong && (
                                  <button onClick={() => toggleExpand(m.id)} className="text-xs text-primary mt-0.5 flex items-center gap-0.5">
                                    {isExpanded ? <><ChevronUp className="w-3 h-3" />Less</> : <><ChevronDown className="w-3 h-3" />More</>}
                                  </button>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                              </span>
                              {m.entityType && (
                                <span className="text-[10px] text-muted-foreground">
                                  → {m.entityType}{m.entityId ? ` #${m.entityId.slice(-6)}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => handlePin(m.id, m.isPinned)} className="p-1 rounded hover:bg-secondary" title={m.isPinned ? 'Unpin' : 'Pin'}>
                              {m.isPinned ? <PinOff className="w-3.5 h-3.5 text-primary" /> : <Pin className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                            <button onClick={() => { setEditingId(m.id); setEditContent(m.content); }} className="p-1 rounded hover:bg-secondary" title="Edit">
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                            {!m.isArchived && (
                              <button onClick={() => handleArchive(m.id)} className="p-1 rounded hover:bg-secondary" title="Archive">
                                <Archive className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                            )}
                            <button onClick={() => handleDelete(m.id)} className="p-1 rounded hover:bg-secondary" title="Delete">
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {total > 50 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-xs text-muted-foreground">Page {page} of {Math.ceil(total / 50)}</span>
              <Button variant="ghost" size="sm" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
