'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Mail, Calendar, Brain, Users, BookOpen, Wallet,
  Plus, X, Loader2, CheckCircle2, Check, ChevronRight, Save, Trash2,
  RefreshCw, Shield, Zap, Clock, Eye, EyeOff, Target, ListChecks, Pencil, Tag,
  Sparkles, Info, MessageSquare, BarChart3, Lightbulb, Database
} from 'lucide-react';
import { SecondBrainSection } from '@/components/second-brain-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

import { Bell } from 'lucide-react';
import { Globe } from 'lucide-react';
type Section = 'general' | 'ai' | 'email' | 'calendar' | 'journal' | 'finance' | 'people' | 'tasks' | 'notifications' | 'second-brain';

const SECTIONS: { key: Section; label: string; icon: any; desc: string }[] = [
  { key: 'general', label: 'General', icon: Globe, desc: 'Timezone, language, display' },
  { key: 'ai', label: 'AI Preferences', icon: Brain, desc: 'Task rules, email rules, priorities' },
  { key: 'tasks', label: 'Task & Scheduling', icon: ListChecks, desc: 'Auto-calendar, duration, time blocking' },
  { key: 'email', label: 'Email Accounts', icon: Mail, desc: 'IMAP accounts, sync settings' },
  { key: 'calendar', label: 'Calendar', icon: Calendar, desc: 'Subscriptions, sync status' },
  { key: 'journal', label: 'Journal', icon: BookOpen, desc: 'Session settings, AI coach' },
  { key: 'finance', label: 'Finance', icon: Wallet, desc: 'Currency, budgets, tags' },
  { key: 'people', label: 'People & Contacts', icon: Users, desc: 'Catch-up reminders, circles' },
  { key: 'notifications', label: 'Notifications', icon: Bell, desc: 'Morning & evening briefings' },
  { key: 'second-brain', label: 'Second Brain', icon: Database, desc: 'Memory & knowledge store' },
];

export function SettingsView() {
  const [active, setActive] = useState<Section>('general');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-display font-bold">Settings</h1>
      </div>

      <div className="flex gap-4 flex-col md:flex-row">
        <div className="md:w-56 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible scrollbar-hide pb-2 md:pb-0 flex-shrink-0">
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => setActive(s.key)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-colors flex-shrink-0 ${
                active === s.key ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-secondary text-muted-foreground'
              }`}>
              <s.icon className="w-4 h-4 flex-shrink-0" />
              <div className="hidden md:block">
                <p className="text-sm">{s.label}</p>
                <p className="text-[10px] text-muted-foreground font-normal">{s.desc}</p>
              </div>
              <span className="md:hidden text-xs whitespace-nowrap">{s.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {active === 'general' && <GeneralSection />}
          {active === 'ai' && <AiSection />}
          {active === 'tasks' && <TasksSection />}
          {active === 'email' && <EmailSection />}
          {active === 'calendar' && <CalendarSection />}
          {active === 'journal' && <JournalSection />}
          {active === 'finance' && <FinanceSection />}
          {active === 'people' && <PeopleSection />}
          {active === 'notifications' && <NotificationsSection />}
          {active === 'second-brain' && <SecondBrainSection />}
        </div>
      </div>
    </div>
  );
}

// ──── GENERAL (TIMEZONE) ────
function GeneralSection() {
  const [prefs, setPrefs] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => {
      const ap = d?.aiPreferences || {};
      setPrefs({ timezone: ap.timezone || 'Asia/Singapore' });
    }).catch(() => {});
  }, []);

  const save = async (key: string, value: any) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaving(true);
    try {
      const r = await fetch('/api/profile');
      const profile = await r.json();
      const ap = profile?.aiPreferences || {};
      await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiPreferences: { ...ap, ...updated } }) });
      toast.success('Timezone saved');
    } catch { toast.error('Failed to save'); }
    setSaving(false);
  };

  if (!prefs) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-6">
      <SectionCard title="Your Timezone" icon={Globe}>
        <p className="text-xs text-muted-foreground mb-3">Used for all scheduling — task times, briefings, reminders, and calendar events.</p>
        <select value={prefs.timezone} onChange={(e) => save('timezone', e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
        </select>
        <TimezonePreview tz={prefs.timezone} />
      </SectionCard>
    </div>
  );
}

// ──── AI PREFERENCES ────
function AiSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<any>({ taskRules: [], emailRules: [], replyTone: '', priorities: [], autoCalendar: false });
  const [profile, setProfile] = useState<any>({});
  const [newRule, setNewRule] = useState('');
  const [newEmailRule, setNewEmailRule] = useState('');
  const [newPriority, setNewPriority] = useState('');

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      setProfile(p);
      if (p.aiPreferences) setPrefs({ taskRules: [], emailRules: [], replyTone: '', priorities: [], autoCalendar: false, ...p.aiPreferences });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async (data?: any) => {
    setSaving(true);
    try {
      const body = data || { aiPreferences: prefs };
      await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      toast.success('Saved');
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const addItem = (field: string, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    setPrefs((p: any) => ({ ...p, [field]: [...(p[field] || []), value.trim()] }));
    setter('');
  };
  const removeItem = (field: string, idx: number) => {
    setPrefs((p: any) => ({ ...p, [field]: p[field].filter((_: any, i: number) => i !== idx) }));
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <LearnedPatternsSection profile={profile} prefs={prefs} onPrefsUpdate={(updated: any) => setPrefs(updated)} />

      <SectionCard title="North Star & Identity" icon={Target}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">North Star (your WHY)</label>
            <Input value={profile.northStar || ''} onChange={(e: any) => setProfile({ ...profile, northStar: e.target.value })} placeholder="e.g. Financial freedom by 40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Mission</label>
            <Input value={profile.mission || ''} onChange={(e: any) => setProfile({ ...profile, mission: e.target.value })} placeholder="What drives you daily?" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Identity</label>
            <Input value={profile.identity || ''} onChange={(e: any) => setProfile({ ...profile, identity: e.target.value })} placeholder="Who are you becoming?" />
          </div>
          <Button size="sm" onClick={() => save({ northStar: profile.northStar, mission: profile.mission, identity: profile.identity })} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />} Save
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Task Prioritization Rules" icon={ListChecks}>
        <p className="text-xs text-muted-foreground mb-2">These are injected directly into the AI prompt. Be specific.</p>
        <RuleList items={prefs.taskRules} onRemove={(i) => removeItem('taskRules', i)} />
        <div className="flex gap-2 mt-2">
          <Input placeholder='e.g. "Revenue tasks first on Mon/Tue"' value={newRule} onChange={(e: any) => setNewRule(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === 'Enter') addItem('taskRules', newRule, setNewRule); }} className="h-8 text-sm" />
          <Button size="sm" variant="outline" onClick={() => addItem('taskRules', newRule, setNewRule)} className="h-8"><Plus className="w-4 h-4" /></Button>
        </div>
      </SectionCard>

      <SectionCard title="Email Handling Rules" icon={Mail}>
        <p className="text-xs text-muted-foreground mb-2">Rules for AI email triage — e.g. "Never delete from Joel" or "Auto-archive newsletters"</p>
        <RuleList items={prefs.emailRules} onRemove={(i) => removeItem('emailRules', i)} />
        <div className="flex gap-2 mt-2">
          <Input placeholder='e.g. "Archive all from no-reply@"' value={newEmailRule} onChange={(e: any) => setNewEmailRule(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === 'Enter') addItem('emailRules', newEmailRule, setNewEmailRule); }} className="h-8 text-sm" />
          <Button size="sm" variant="outline" onClick={() => addItem('emailRules', newEmailRule, setNewEmailRule)} className="h-8"><Plus className="w-4 h-4" /></Button>
        </div>
      </SectionCard>

      <SectionCard title="Reply Tone" icon={Brain}>
        <select value={prefs.replyTone} onChange={(e: any) => setPrefs({ ...prefs, replyTone: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="">Default (professional)</option>
          <option value="casual">Casual & friendly</option>
          <option value="professional">Professional & formal</option>
          <option value="concise">Concise & direct</option>
          <option value="warm">Warm & empathetic</option>
        </select>
      </SectionCard>

      <SectionCard title="Current Life Priorities" icon={Zap}>
        <p className="text-xs text-muted-foreground mb-2">What matters most right now? AI uses this across all decisions.</p>
        <RuleList items={prefs.priorities} onRemove={(i) => removeItem('priorities', i)} highlight />
        <div className="flex gap-2 mt-2">
          <Input placeholder="e.g. Launch MVP by March" value={newPriority} onChange={(e: any) => setNewPriority(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === 'Enter') addItem('priorities', newPriority, setNewPriority); }} className="h-8 text-sm" />
          <Button size="sm" variant="outline" onClick={() => addItem('priorities', newPriority, setNewPriority)} className="h-8"><Plus className="w-4 h-4" /></Button>
        </div>
      </SectionCard>

      <Button onClick={() => save()} className="w-full" disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save All AI Preferences
      </Button>
    </div>
  );
}

// ──── TASKS & SCHEDULING ────
function TasksSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<any>({ autoCalendar: false, workStartTime: '09:00', workEndTime: '18:00', defaultDurationMins: 30 });

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      if (p.aiPreferences) setPrefs({ autoCalendar: false, workStartTime: '09:00', workEndTime: '18:00', defaultDurationMins: 30, ...p.aiPreferences });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiPreferences: prefs }) });
      toast.success('Saved');
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <SectionCard title="Auto-Schedule to Calendar" icon={Calendar}>
        <p className="text-xs text-muted-foreground mb-3">When you run AI Prioritize, tasks get plotted on your calendar with time blocks. Missed tasks are auto-rescheduled.</p>
        <ToggleRow label="Enable auto-calendar" checked={prefs.autoCalendar} onChange={(v) => setPrefs({ ...prefs, autoCalendar: v })} />
      </SectionCard>

      <SectionCard title="Work Schedule" icon={Clock}>
        <p className="text-xs text-muted-foreground mb-3">Define your work window. AI will schedule tasks only within these hours.</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Start Time</label>
              <input type="time" value={prefs.workStartTime || '09:00'}
                onChange={(e) => setPrefs({ ...prefs, workStartTime: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">End Time</label>
              <input type="time" value={prefs.workEndTime || '18:00'}
                onChange={(e) => setPrefs({ ...prefs, workEndTime: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Default Task Duration (minutes)</label>
            <select value={prefs.defaultDurationMins || 30}
              onChange={(e) => setPrefs({ ...prefs, defaultDurationMins: parseInt(e.target.value) })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <option value={15}>15 min</option>
              <option value={25}>25 min (Pomodoro)</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Time Blocking Colors" icon={Target}>
        <p className="text-xs text-muted-foreground mb-2">Tasks are color-coded by urgency on your calendar:</p>
        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10 text-xs space-y-1">
          <p>🔴 Critical tasks → Red blocks</p>
          <p>🟡 High urgency → Amber blocks</p>
          <p>🟢 Normal tasks → Sage green blocks</p>
        </div>
      </SectionCard>

      <SectionCard title="Duration Learning" icon={Brain}>
        <p className="text-xs text-muted-foreground mb-2">AI learns from your actual task completion times.</p>
        <ToggleRow label="Enable duration auto-adjustment" checked={prefs.durationLearning !== false} onChange={(v) => setPrefs({ ...prefs, durationLearning: v })} />
        <p className="text-[10px] text-muted-foreground mt-2">After 3+ logged tasks, AI adjusts estimates based on your actual pace. If you consistently take longer, estimates go up.</p>
      </SectionCard>

      <Button onClick={save} className="w-full" disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save Task Settings
      </Button>
    </div>
  );
}

// ──── EMAIL ACCOUNTS ────
function EmailSection() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [learnedFilters, setLearnedFilters] = useState<any[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/email/accounts').then(r => r.json()).then(d => { setAccounts(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const loadLearnedFilters = async () => {
    setLoadingFilters(true);
    try {
      const res = await fetch('/api/email/learned-filters');
      if (res.ok) { const data = await res.json(); setLearnedFilters(data.filters || []); }
    } catch {}
    setLoadingFilters(false);
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Remove this email account? All synced emails will be deleted.')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/email/accounts?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAccounts(a => a.filter(acc => acc.id !== id));
        toast.success('Account removed');
      } else toast.error('Failed to remove');
    } catch { toast.error('Error removing account'); }
    setDeleting(null);
  };

  useEffect(() => { loadLearnedFilters(); }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <SectionCard title="Connected Email Accounts" icon={Mail}>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No email accounts connected. Go to Inbox to set up.</p>
        ) : accounts.map((acc: any) => (
          <div key={acc.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg mb-2">
            <div>
              <p className="text-sm font-medium">{acc.label}</p>
              <p className="text-xs text-muted-foreground">{acc.email}</p>
              <p className="text-[10px] text-muted-foreground">IMAP: {acc.imapHost}:{acc.imapPort} · SMTP: {acc.smtpHost}:{acc.smtpPort}</p>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <button onClick={() => deleteAccount(acc.id)} disabled={deleting === acc.id}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-500">
                {deleting === acc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground mt-2">Add new accounts from the Inbox tab. Supports Gmail, Zoho, Outlook, Yahoo, and custom IMAP servers.</p>
      </SectionCard>

      <SectionCard title="Learned Email Filters" icon={Shield}>
        <p className="text-xs text-muted-foreground mb-2">The AI learns from your actions. These are patterns it has detected.</p>
        {loadingFilters ? (
          <div className="flex items-center gap-2 py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Loading learned patterns...</span></div>
        ) : learnedFilters.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No patterns detected yet. Use your email more and the AI will learn from your actions.</p>
        ) : (
          <div className="space-y-2">
            {learnedFilters.map((f: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2.5 bg-secondary/30 rounded-lg">
                <div className="flex-1">
                  <p className="text-xs font-medium">{f.pattern}</p>
                  <p className="text-[10px] text-muted-foreground">{f.action} · {f.count} times</p>
                </div>
                <PromoteToRuleBtn pattern={f.pattern} action={f.action} />
              </div>
            ))}
          </div>
        )}
        <Button size="sm" variant="outline" onClick={loadLearnedFilters} className="mt-2">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </SectionCard>
    </div>
  );
}

// Promote a learned filter to an AI email rule
function PromoteToRuleBtn({ pattern, action }: { pattern: string; action: string }) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const promote = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/profile');
      const profile = await res.json();
      const prefs = profile.aiPreferences || {};
      const emailRules: string[] = prefs.emailRules || [];
      const ruleText = `Auto-${action} emails matching: ${pattern}`;
      if (emailRules.some((r: string) => r.includes(pattern))) {
        toast('Already added as a rule');
        setDone(true);
        setSaving(false);
        return;
      }
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiPreferences: { ...prefs, emailRules: [...emailRules, ruleText] } }),
      });
      toast.success('Added as email rule');
      setDone(true);
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  if (done) return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
  return (
    <button onClick={promote} disabled={saving}
      className="text-[10px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 flex-shrink-0 whitespace-nowrap">
      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : '+ Add as rule'}
    </button>
  );
}

// ──── CALENDAR ────
function CalendarSection() {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newSub, setNewSub] = useState({ name: '', url: '', color: '#6B8F71' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch('/api/calendar/subscriptions').then(r => r.json()).then(d => { setSubs(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const syncSub = async (id: string) => {
    setSyncing(id);
    try {
      const res = await fetch('/api/calendar/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subId: id }) });
      const d = await res.json().catch(() => ({}));
      if (d.needsAttention) {
        toast.error(d.error || 'Calendar URL needs attention', { duration: 10000 });
      } else if (res.ok) {
        toast.success(`Synced ${d.synced} events`);
      } else {
        toast.error(d.error || 'Sync failed');
      }
    } catch { toast.error('Sync failed'); }
    setSyncing(null);
  };

  const deleteSub = async (id: string) => {
    if (!confirm('Remove this calendar subscription?')) return;
    await fetch(`/api/calendar/subscriptions?id=${id}`, { method: 'DELETE' });
    setSubs(p => p.filter(s => s.id !== id));
    toast.success('Removed');
  };

  const addSub = async () => {
    if (!newSub.name.trim() || !newSub.url.trim()) { toast.error('Name and URL required'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/calendar/subscriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSub),
      });
      if (res.ok) {
        const sub = await res.json();
        setSubs(p => [...p, sub]);
        setNewSub({ name: '', url: '', color: '#6B8F71' });
        setShowAdd(false);
        toast.success('Added! Syncing...');
        syncSub(sub.id);
      } else { const e = await res.json(); toast.error(e.error || 'Failed'); }
    } catch { toast.error('Failed to add'); }
    setAdding(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <SectionCard title="Calendar Subscriptions" icon={Calendar}>
        {subs.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground mb-3">No calendar subscriptions yet.</p>
        ) : subs.map((s: any) => (
          <div key={s.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg mb-2">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                <p className="text-sm font-medium">{s.name}</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[250px]">{s.url}</p>
              <p className="text-[10px] text-muted-foreground">{s.lastSynced ? `Last synced: ${new Date(s.lastSynced).toLocaleString('en-SG')}` : 'Never synced'}</p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => syncSub(s.id)} disabled={syncing === s.id} className="p-1.5 rounded-lg hover:bg-secondary">
                <RefreshCw className={`w-3.5 h-3.5 ${syncing === s.id ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => deleteSub(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        {showAdd ? (
          <div className="border border-border rounded-lg p-3 space-y-2 mt-2">
            <Input placeholder="Calendar name" value={newSub.name} onChange={(e: any) => setNewSub({ ...newSub, name: e.target.value })} className="h-8 text-sm" />
            <Input placeholder="iCal URL (https://...)" value={newSub.url} onChange={(e: any) => setNewSub({ ...newSub, url: e.target.value })} className="h-8 text-sm" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Color:</label>
              <input type="color" value={newSub.color} onChange={(e) => setNewSub({ ...newSub, color: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addSub} disabled={adding}>
                {adding ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />} Add
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} className="mt-2">
            <Plus className="w-3 h-3 mr-1" /> Add Calendar
          </Button>
        )}
      </SectionCard>

      <CalendarFeedSection />

      <SectionCard title="How to get your iCal URL" icon={RefreshCw}>
        <div className="space-y-3 text-xs text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground">Google Calendar</p>
            <p>Settings → select calendar → &quot;Integrate calendar&quot; → <strong className="text-foreground">Secret address in iCal format</strong> (NOT the public URL)</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Outlook / Microsoft 365</p>
            <p>Settings → Calendar → Shared calendars → Publish a calendar → ICS link</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Apple Calendar (iCloud)</p>
            <p>Calendar app → Share calendar → Public Calendar → copy link</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ──── CALENDAR FEED (Export to Google) ────
function CalendarFeedSection() {
  const [feedToken, setFeedToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/calendar/feed/token').then(r => r.json()).then(d => { setFeedToken(d.token || null); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const generateToken = async () => {
    setGenerating(true);
    try {
      const r = await fetch('/api/calendar/feed/token', { method: 'POST' });
      if (r.ok) { const d = await r.json(); setFeedToken(d.token); toast.success('Feed URL generated!'); }
    } catch { toast.error('Failed'); }
    setGenerating(false);
  };

  const revokeToken = async () => {
    if (!confirm('Revoke feed? Google Calendar will stop seeing your events.')) return;
    await fetch('/api/calendar/feed/token', { method: 'DELETE' });
    setFeedToken(null);
    toast.success('Feed revoked');
  };

  const feedUrl = feedToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/calendar/feed?token=${feedToken}` : '';

  const copyUrl = () => {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    toast.success('Copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return null;

  return (
    <SectionCard title="Share to Google Calendar" icon={Calendar}>
      <p className="text-xs text-muted-foreground mb-3">
        Subscribe from Google Calendar to see your Life OS events and tasks.
      </p>

      {feedToken ? (
        <div className="space-y-3">
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-muted-foreground mb-1">Your feed URL</p>
            <p className="text-xs font-mono break-all select-all text-foreground/80">{feedUrl}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={copyUrl}>
              {copied ? <><Check className="w-3 h-3 mr-1" /> Copied</> : 'Copy URL'}
            </Button>
            <Button size="sm" variant="outline" onClick={revokeToken} className="text-red-500 hover:bg-red-50">
              Revoke
            </Button>
          </div>
          <div className="bg-primary/5 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-foreground">How to subscribe in Google Calendar:</p>
            <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
              <li>Open <strong>Google Calendar</strong> on desktop</li>
              <li>Click <strong>+</strong> next to "Other calendars" → <strong>From URL</strong></li>
              <li>Paste the URL above</li>
              <li>Click <strong>Add calendar</strong></li>
            </ol>
            <p className="text-[10px] text-muted-foreground mt-1">📱 Changes sync every 12-24 hours (Google's polling rate).</p>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={generateToken} disabled={generating}>
          {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
          Generate Feed URL
        </Button>
      )}
    </SectionCard>
  );
}

// ──── JOURNAL ────
function JournalSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>({});
  const [prefs, setPrefs] = useState<any>({ journalCoachStyle: 'razor', journalReminders: true });

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      setProfile(p);
      if (p.aiPreferences) setPrefs({ journalCoachStyle: 'razor', journalReminders: true, ...p.aiPreferences });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alterEgoName: profile.alterEgoName,
          alterEgoDescription: profile.alterEgoDescription,
          alterEgoMantra: profile.alterEgoMantra,
          aiPreferences: prefs,
        }),
      });
      toast.success('Saved');
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <SectionCard title="Alter Ego" icon={Brain}>
        <p className="text-xs text-muted-foreground mb-3">Your journal AI takes on this persona during sessions.</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Alter Ego Name</label>
            <Input value={profile.alterEgoName || ''} onChange={(e: any) => setProfile({ ...profile, alterEgoName: e.target.value })} placeholder="e.g. Marcus, Seneca" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Who is this person?</label>
            <textarea value={profile.alterEgoDescription || ''} onChange={(e: any) => setProfile({ ...profile, alterEgoDescription: e.target.value })}
              placeholder="A direct, no-BS mentor who cuts through noise..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Daily Mantra</label>
            <Input value={profile.alterEgoMantra || ''} onChange={(e: any) => setProfile({ ...profile, alterEgoMantra: e.target.value })} placeholder="e.g. Clarity over comfort." />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="AI Coach Style" icon={Target}>
        <p className="text-xs text-muted-foreground mb-3">How should the journal AI talk to you?</p>
        <select value={prefs.journalCoachStyle || 'razor'}
          onChange={(e: any) => setPrefs({ ...prefs, journalCoachStyle: e.target.value })}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="razor">Razor Sharp — Direct, no fluff, ADHD-optimized</option>
          <option value="gentle">Gentle Guide — Warm, patient, encouraging</option>
          <option value="socratic">Socratic — Asks questions, makes you think</option>
          <option value="coach">Performance Coach — High-energy, accountability</option>
          <option value="therapist">Reflective Therapist — Emotional depth, patterns</option>
        </select>
      </SectionCard>

      <SectionCard title="Session Types" icon={BookOpen}>
        <p className="text-xs text-muted-foreground mb-3">Your journal has two modes designed for ADHD focus:</p>
        <div className="space-y-3">
          <div className="bg-amber-50/50 dark:bg-amber-900/10 rounded-lg p-3">
            <p className="text-sm font-semibold">☀️ Morning Razor</p>
            <p className="text-xs text-muted-foreground">Energy check → today's focus → clean win → razor → execute</p>
          </div>
          <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-lg p-3">
            <p className="text-sm font-semibold">🌙 Evening Reflection</p>
            <p className="text-xs text-muted-foreground">Energy → focus review → day title → reality → signal → mirror</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Auto-Extraction" icon={Zap}>
        <p className="text-xs text-muted-foreground mb-2">What the AI automatically extracts from each session:</p>
        <div className="space-y-1.5">
          <ToggleRow label="Key memories & milestones" checked={prefs.extractMemories !== false} onChange={(v) => setPrefs({ ...prefs, extractMemories: v })} />
          <ToggleRow label="Ideas & sparks" checked={prefs.extractIdeas !== false} onChange={(v) => setPrefs({ ...prefs, extractIdeas: v })} />
          <ToggleRow label="People mentions → auto-link contacts" checked={prefs.extractPeople !== false} onChange={(v) => setPrefs({ ...prefs, extractPeople: v })} />
          <ToggleRow label="Auto-create new contacts from mentions" checked={prefs.autoCreateContacts !== false} onChange={(v) => setPrefs({ ...prefs, autoCreateContacts: v })} />
        </div>
      </SectionCard>

      <Button onClick={save} className="w-full" disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save Journal Settings
      </Button>
    </div>
  );
}

// ──── FINANCE ────
function FinanceSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<any>({ currency: 'SGD', monthlyBudget: '', savingsTarget: '' });
  const [tags, setTags] = useState<any[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagParent, setNewTagParent] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/profile').then(r => r.json()),
      fetch('/api/finance/tags').then(r => r.json()).catch(() => []),
    ]).then(([p, t]) => {
      if (p.aiPreferences) setPrefs({ currency: 'SGD', monthlyBudget: '', savingsTarget: '', ...p.aiPreferences });
      setTags(Array.isArray(t) ? t : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiPreferences: prefs }) });
      toast.success('Saved');
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const addTag = async () => {
    if (!newTagName.trim()) return;
    const res = await fetch('/api/finance/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTagName.trim(), parentId: newTagParent || null }) });
    if (res.ok) { const tag = await res.json(); setTags(prev => [...prev, tag]); setNewTagName(''); toast.success('Tag added'); }
  };

  const deleteTag = async (id: string) => {
    await fetch(`/api/finance/tags?id=${id}`, { method: 'DELETE' });
    setTags(prev => prev.filter(t => t.id !== id));
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  // Build tree for display
  const rootTags = tags.filter(t => !t.parentId);
  const childrenOf = (pid: string) => tags.filter(t => t.parentId === pid);

  return (
    <div className="space-y-6">
      <SectionCard title="Finance Preferences" icon={Wallet}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Default Currency</label>
            <select value={prefs.currency || 'SGD'}
              onChange={(e: any) => setPrefs({ ...prefs, currency: e.target.value })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <option value="SGD">SGD (S$)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="MYR">MYR (RM)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="AUD">AUD (A$)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Monthly Budget Target</label>
            <Input type="number" value={prefs.monthlyBudget || ''}
              onChange={(e: any) => setPrefs({ ...prefs, monthlyBudget: e.target.value ? parseFloat(e.target.value) : '' })}
              placeholder="e.g. 3000" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Monthly Savings Target</label>
            <Input type="number" value={prefs.savingsTarget || ''}
              onChange={(e: any) => setPrefs({ ...prefs, savingsTarget: e.target.value ? parseFloat(e.target.value) : '' })}
              placeholder="e.g. 1000" />
          </div>
        </div>
      </SectionCard>

      {/* Tag Management */}
      <SectionCard title="Transaction Tags" icon={Tag}>
        <p className="text-xs text-muted-foreground mb-3">Hierarchical tags for categorizing transactions (e.g. Food / Hawker, Transport / Grab).</p>
        {rootTags.length === 0 && tags.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No tags yet. Add your first tag below.</p>}
        <div className="space-y-1 mb-3">
          {rootTags.map(rt => (
            <div key={rt.id}>
              <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/50">
                <span className="text-sm font-medium">{rt.name}</span>
                <button onClick={() => deleteTag(rt.id)} className="text-muted-foreground hover:text-red-500"><X className="w-3 h-3" /></button>
              </div>
              {childrenOf(rt.id).map(ct => (
                <div key={ct.id} className="flex items-center justify-between py-1 px-2 pl-6 rounded-lg hover:bg-secondary/50">
                  <span className="text-xs text-muted-foreground">└ {ct.name}</span>
                  <button onClick={() => deleteTag(ct.id)} className="text-muted-foreground hover:text-red-500"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={newTagParent} onChange={e => setNewTagParent(e.target.value)}
            className="w-28 rounded-lg border border-input bg-background px-2 py-1.5 text-xs">
            <option value="">(root)</option>
            {rootTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Input placeholder="Tag name" value={newTagName} onChange={(e: any) => setNewTagName(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === 'Enter') addTag(); }} className="h-8 text-sm flex-1" />
          <Button size="sm" variant="outline" onClick={addTag} className="h-8"><Plus className="w-4 h-4" /></Button>
        </div>
      </SectionCard>

      <SectionCard title="Data Sources" icon={RefreshCw}>
        <p className="text-xs text-muted-foreground mb-2">Currently tracks:</p>
        <div className="space-y-2 text-xs">
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="font-medium text-foreground">Transactions & Investments</p>
            <p className="text-muted-foreground">Manually entered via the Finance tab.</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="font-medium text-foreground">Market Prices</p>
            <p className="text-muted-foreground">Yahoo Finance (stocks/ETFs) · CoinGecko (crypto). Auto-refreshes every 5 min.</p>
          </div>
        </div>
      </SectionCard>

      <Button onClick={save} className="w-full" disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save Finance Settings
      </Button>
    </div>
  );
}

// ──── PEOPLE ────
function PeopleSection() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', color: '#6B8F71' });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<any>({ defaultCatchUpDays: 30 });

  useEffect(() => {
    fetch('/api/contacts/groups').then(r => r.json()).then(d => { setGroups(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
    fetch('/api/profile').then(r => r.json()).then(p => {
      if (p.aiPreferences) setPrefs({ defaultCatchUpDays: 30, ...p.aiPreferences });
    }).catch(() => {});
  }, []);

  const addGroup = async () => {
    if (!newGroup.name.trim()) { toast.error('Name required'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/contacts/groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroup),
      });
      if (res.ok) {
        const g = await res.json();
        setGroups(p => [...p, { ...g, _count: { contacts: 0 } }]);
        setNewGroup({ name: '', color: '#6B8F71' });
        setShowAdd(false);
        toast.success('Group added');
      } else { const e = await res.json(); toast.error(e.error || 'Failed'); }
    } catch { toast.error('Failed'); }
    setAdding(false);
  };

  const updateGroup = async (id: string) => {
    setSaving(true);
    try {
      await fetch(`/api/contacts/groups/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, color: editColor }),
      });
      setGroups(p => p.map(g => g.id === id ? { ...g, name: editName, color: editColor } : g));
      setEditingId(null);
      toast.success('Updated');
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const deleteGroup = async (id: string) => {
    const g = groups.find(g => g.id === id);
    if (g?._count?.contacts > 0 && !confirm(`This group has ${g._count.contacts} contact(s). They will be ungrouped. Continue?`)) return;
    try {
      await fetch(`/api/contacts/groups/${id}`, { method: 'DELETE' });
      setGroups(p => p.filter(g => g.id !== id));
      toast.success('Deleted');
    } catch { toast.error('Failed'); }
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiPreferences: prefs }) });
      toast.success('Saved');
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <SectionCard title="Contact Groups" icon={Users}>
        <p className="text-xs text-muted-foreground mb-3">Organize your contacts into circles. Drag to reorder, edit names & colors.</p>
        <div className="space-y-2">
          {groups.map((g: any) => (
            <div key={g.id} className="flex items-center gap-2 p-2.5 bg-secondary/30 rounded-lg">
              {editingId === g.id ? (
                <>
                  <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="w-6 h-6 rounded border-0 cursor-pointer flex-shrink-0" />
                  <Input value={editName} onChange={(e: any) => setEditName(e.target.value)}
                    onKeyDown={(e: any) => { if (e.key === 'Enter') updateGroup(g.id); }}
                    className="h-7 text-sm flex-1" />
                  <button onClick={() => updateGroup(g.id)} className="p-1 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-secondary rounded"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{g.name}</p>
                    <p className="text-[10px] text-muted-foreground">{g._count?.contacts || 0} contacts</p>
                  </div>
                  <button onClick={() => { setEditingId(g.id); setEditName(g.name); setEditColor(g.color); }}
                    className="p-1 text-muted-foreground hover:bg-secondary rounded"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteGroup(g.id)}
                    className="p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
          ))}
        </div>

        {showAdd ? (
          <div className="border border-border rounded-lg p-3 space-y-2 mt-2">
            <div className="flex items-center gap-2">
              <input type="color" value={newGroup.color} onChange={(e) => setNewGroup({ ...newGroup, color: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer" />
              <Input placeholder="Group name" value={newGroup.name} onChange={(e: any) => setNewGroup({ ...newGroup, name: e.target.value })}
                onKeyDown={(e: any) => { if (e.key === 'Enter') addGroup(); }}
                className="h-8 text-sm flex-1" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addGroup} disabled={adding}>
                {adding ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />} Add
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} className="mt-2">
            <Plus className="w-3 h-3 mr-1" /> New Group
          </Button>
        )}
      </SectionCard>

      <SectionCard title="Catch-up Reminders" icon={Clock}>
        <p className="text-xs text-muted-foreground mb-3">Default catch-up frequency for new contacts. Individual contacts can override this.</p>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Default Catch-up Every (days)</label>
          <select value={prefs.defaultCatchUpDays || 30}
            onChange={(e: any) => setPrefs({ ...prefs, defaultCatchUpDays: parseInt(e.target.value) })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value={7}>Weekly (7 days)</option>
            <option value={14}>Bi-weekly (14 days)</option>
            <option value={30}>Monthly (30 days)</option>
            <option value={60}>Every 2 months</option>
            <option value={90}>Quarterly (90 days)</option>
            <option value={180}>Every 6 months</option>
            <option value={365}>Yearly</option>
          </select>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Overdue catch-ups show amber alerts in the People tab. Last contact date auto-updates when they're mentioned in your journal.</p>
      </SectionCard>

      <SectionCard title="Relationship Circles" icon={Users}>
        <p className="text-xs text-muted-foreground mb-2">Default relationship types for contacts:</p>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {['Family', 'Close Friend', 'Friend', 'Work', 'Mentor', 'Acquaintance'].map(r => (
            <div key={r} className="bg-secondary/30 rounded-lg p-2">
              <p className="font-medium text-foreground">{r}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Set relationship type on each contact in the People tab.</p>
      </SectionCard>

      <Button onClick={savePrefs} className="w-full" disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save People Settings
      </Button>
    </div>
  );
}

// ──── LEARNED PATTERNS (AI Intelligence) ────
function LearnedPatternsSection({ profile, prefs, onPrefsUpdate }: { profile: any; prefs: any; onPrefsUpdate: (p: any) => void }) {
  const [patterns, setPatterns] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [lastLearned, setLastLearned] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);

  useEffect(() => {
    fetch('/api/ai/learn').then(r => r.json()).then(d => {
      setPatterns(d.patterns || []);
      setStats(d.stats || null);
      setLastLearned(d.lastLearnedAt || null);
    }).catch(() => {});
  }, []);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const r = await fetch('/api/ai/learn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) });
      if (r.ok) {
        const d = await r.json();
        if (d.skipped) { toast.success('Already up to date'); }
        else {
          setPatterns(d.patterns || []);
          toast.success(d.summary || `Found ${d.patterns?.length || 0} patterns`);
        }
      } else { toast.error('Analysis failed'); }
    } catch { toast.error('Analysis failed'); }
    setAnalyzing(false);
  };

  const handlePatternAction = async (patternId: string, action: 'reject' | 'promote') => {
    setActioning(patternId);
    try {
      const r = await fetch('/api/ai/learn', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patternId, action }) });
      if (r.ok) {
        if (action === 'reject') {
          setPatterns(prev => prev.filter(p => p.id !== patternId));
          toast.success('Pattern dismissed');
        } else {
          setPatterns(prev => prev.filter(p => p.id !== patternId));
          toast.success('Promoted to permanent rule!');
          // Refresh prefs
          fetch('/api/profile').then(r => r.json()).then(p => {
            if (p.aiPreferences) onPrefsUpdate({ ...prefs, ...p.aiPreferences });
          }).catch(() => {});
        }
      }
    } catch { toast.error('Failed'); }
    setActioning(null);
  };

  const CONFIDENCE_COLORS: Record<string, string> = {
    high: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
    medium: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
    low: 'bg-gray-100 dark:bg-gray-800/30 text-gray-600 dark:text-gray-400',
  };
  const CATEGORY_LABELS: Record<string, string> = {
    task_preference: 'Tasks', email_preference: 'Email', productivity_habit: 'Productivity',
    triage_preference: 'Triage', priority_pattern: 'Priorities',
  };

  return (
    <>
      <SectionCard title="How Jarvis Learns" icon={Sparkles}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground leading-relaxed flex-1">
              Jarvis auto-detects patterns from your behaviour and gets smarter over time.
            </p>
            <button onClick={() => setShowExplainer(!showExplainer)} className="text-[10px] text-primary ml-2 flex-shrink-0">
              {showExplainer ? 'Hide' : 'How?'}
            </button>
          </div>

          {showExplainer && (
            <div className="space-y-2">
              {[
                { icon: Target, title: 'North Star & Priorities', desc: 'Everything Jarvis does is filtered through your North Star and current priorities.' },
                { icon: ListChecks, title: 'Task & Email Rules', desc: 'Your explicit rules are injected into every AI decision.' },
                { icon: BarChart3, title: 'Resolution Patterns', desc: 'Jarvis learns from how you resolve tasks — completed, delegated, or dismissed.' },
                { icon: Lightbulb, title: 'Triage Feedback', desc: 'Accepting or dismissing AI suggestions trains what tasks to create.' },
              ].map((item, i) => (
                <div key={i} className="flex gap-2.5 p-2 rounded-lg bg-secondary/30">
                  <item.icon className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Knowledge summary badges */}
          <div className="flex flex-wrap gap-1.5">
            {prefs.priorities?.length > 0 && <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">{prefs.priorities.length} priorities</span>}
            {prefs.taskRules?.length > 0 && <span className="text-[10px] px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">{prefs.taskRules.length} task rules</span>}
            {prefs.emailRules?.length > 0 && <span className="text-[10px] px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300">{prefs.emailRules.length} email rules</span>}
            {patterns.length > 0 && <span className="text-[10px] px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300">{patterns.length} learned patterns</span>}
            {profile.northStar && <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary">North Star set</span>}
          </div>

          {stats && (
            <p className="text-[10px] text-muted-foreground">
              Analyzed: {stats.triageDecisions} triage decisions, {stats.taskResolutions} task resolutions, {stats.emailOverrides} email corrections
              {lastLearned && <> · Last: {new Date(lastLearned).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</>}
            </p>
          )}
        </div>
      </SectionCard>

      {/* Learned Patterns */}
      <SectionCard title="Learned Patterns" icon={Brain}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Patterns Jarvis detected from your behaviour. Promote good ones to permanent rules, dismiss bad ones.</p>
            <button onClick={runAnalysis} disabled={analyzing}
              className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline disabled:opacity-50 flex-shrink-0 ml-2">
              {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {analyzing ? 'Analyzing...' : 'Retrain'}
            </button>
          </div>

          {patterns.length === 0 ? (
            <div className="text-center py-4">
              <Brain className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1.5" />
              <p className="text-[11px] text-muted-foreground">No patterns detected yet.</p>
              <p className="text-[10px] text-muted-foreground">Use the app more — triage tasks, resolve tasks, handle emails — then hit Retrain.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {patterns.map((p: any) => (
                <div key={p.id} className="p-2.5 rounded-xl bg-card border border-border" style={{ boxShadow: 'var(--shadow-sm)' }}>
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium">{p.explanation}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full ${CONFIDENCE_COLORS[p.confidence] || CONFIDENCE_COLORS.low}`}>
                          {p.confidence} ({p.signals} signals)
                        </span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          {CATEGORY_LABELS[p.category] || p.category}
                        </span>
                      </div>
                      {p.examples?.length > 0 && (
                        <p className="text-[9px] text-muted-foreground mt-1 truncate">
                          e.g. {p.examples.slice(0, 2).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-2 ml-5">
                    <button onClick={() => handlePatternAction(p.id, 'promote')} disabled={actioning === p.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50">
                      <CheckCircle2 className="w-3 h-3" /> Make Permanent
                    </button>
                    <button onClick={() => handlePatternAction(p.id, 'reject')} disabled={actioning === p.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium text-red-500/70 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50">
                      <X className="w-3 h-3" /> Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </>
  );
}

// ──── REUSABLE COMPONENTS ────
function SectionCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl p-4 sm:p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function RuleList({ items, onRemove, highlight }: { items: string[]; onRemove: (i: number) => void; highlight?: boolean }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-1.5">
      {items.map((r: string, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className={`text-sm flex-1 px-3 py-1.5 rounded-lg ${highlight ? 'bg-primary/5 border border-primary/10' : 'bg-secondary/50'}`}>{r}</span>
          <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

function TimezonePreview({ tz }: { tz: string }) {
  const [time, setTime] = useState<string>('');
  useEffect(() => {
    if (!tz) return;
    const update = () => setTime(new Date().toLocaleString('en-SG', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true, weekday: 'short', day: 'numeric', month: 'short' }));
    update();
    const iv = setInterval(update, 30000);
    return () => clearInterval(iv);
  }, [tz]);
  if (!time) return null;
  return <p className="text-[10px] text-muted-foreground mt-2">Current time: {time}</p>;
}

const TIMEZONES = [
  'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Australia/Sydney', 'Pacific/Auckland',
];

function NotificationsSection() {
  const [prefs, setPrefs] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => {
      const ap = d?.aiPreferences || {};
      setPrefs({
        morningBriefing: ap.morningBriefing !== false,
        eveningReflection: ap.eveningReflection !== false,
        smartNudges: ap.smartNudges !== false,
        morningBriefingTime: ap.morningBriefingTime || '07:00',
        eveningReflectionTime: ap.eveningReflectionTime || '21:00',
        timezone: ap.timezone || 'Asia/Singapore',
      });
    }).catch(() => {});
  }, []);

  const save = async (key: string, value: any) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaving(true);
    try {
      const r = await fetch('/api/profile');
      const profile = await r.json();
      const ap = profile?.aiPreferences || {};
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiPreferences: { ...ap, ...updated } }),
      });
      toast.success('Saved');
    } catch { toast.error('Failed to save'); }
    setSaving(false);
  };

  if (!prefs) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Timezone */}
      <div className="game-card p-4 space-y-3">
        <h3 className="font-display font-bold text-sm">Your Timezone</h3>
        <p className="text-xs text-muted-foreground">Used for scheduling briefings and reminders.</p>
        <select value={prefs.timezone} onChange={(e) => save('timezone', e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {/* Email Briefings */}
      <div className="game-card p-4 space-y-3">
        <h3 className="font-display font-bold text-sm">Email Briefings</h3>
        <p className="text-xs text-muted-foreground">Receive AI-generated briefings to your email.</p>
        <div className="space-y-3">
          <div className="space-y-2">
            <ToggleRow label="Morning Briefing" checked={prefs.morningBriefing} onChange={(v) => save('morningBriefing', v)} />
            {prefs.morningBriefing && (
              <div className="flex items-center gap-2 ml-1">
                <span className="text-xs text-muted-foreground">Time:</span>
                <input type="time" value={prefs.morningBriefingTime} onChange={(e) => save('morningBriefingTime', e.target.value)}
                  className="px-2 py-1 rounded-lg bg-secondary/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <ToggleRow label="Evening Reflection" checked={prefs.eveningReflection} onChange={(v) => save('eveningReflection', v)} />
            {prefs.eveningReflection && (
              <div className="flex items-center gap-2 ml-1">
                <span className="text-xs text-muted-foreground">Time:</span>
                <input type="time" value={prefs.eveningReflectionTime} onChange={(e) => save('eveningReflectionTime', e.target.value)}
                  className="px-2 py-1 rounded-lg bg-secondary/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* In-App */}
      <div className="game-card p-4 space-y-3">
        <h3 className="font-display font-bold text-sm">In-App Notifications</h3>
        <p className="text-xs text-muted-foreground">Smart nudges and reminders within the app.</p>
        <div className="space-y-2">
          <ToggleRow label="Smart Nudges" checked={prefs.smartNudges} onChange={(v) => save('smartNudges', v)} />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm">{label}</span>
      <button onClick={() => onChange(!checked)} className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-secondary'}`}>
        <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}