'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Plus, Search, Star, StarOff, Heart, Briefcase, GraduationCap,
  UserCircle, Phone, Mail, Building2, MessageSquare,
  ChevronRight, X, Edit3, Trash2, Archive, ArchiveRestore, Filter,
  Clock, AlertCircle, StickyNote, Coffee, PhoneCall, MailOpen,
  Handshake, Cake, Users2, Loader2, BookOpen, Sparkles, Smile, GitMerge,
  Send, CalendarHeart, Plus as PlusIcon, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Contact = {
  id: string;
  name: string;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  role?: string | null;
  relationship: string;
  groupId?: string | null;
  avatar?: string | null;
  birthday?: string | null;
  howWeMet?: string | null;
  interests?: string[] | null;
  familyNotes?: string | null;
  socialLinks?: Record<string, string> | null;
  customDates?: { label: string; date: string }[] | null;
  catchUpFrequency?: number | null;
  lastContactedAt?: string | null;
  isFavorite: boolean;
  isArchived: boolean;
  aliases?: string[] | null;
  createdAt: string;
  group?: { id: string; name: string; color: string } | null;
  notes?: ContactNote[];
};

type ContactNote = {
  id: string;
  contactId: string;
  type: string;
  content: string;
  date: string;
  journalEntryId?: string | null;
};

type ContactGroup = {
  id: string;
  name: string;
  color: string;
  _count?: { contacts: number };
};

// Lunatask-style relationship circles with descriptions
const RELATIONSHIP_CIRCLES = [
  { value: 'family', label: 'Family', description: 'Connected for life. Blood or bond.', icon: Heart, color: 'text-pink-500', bg: 'bg-pink-100 dark:bg-pink-900/30' },
  { value: 'extended_family', label: 'Extended Family', description: 'Family by blood or bond, just a little further out.', icon: Heart, color: 'text-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/20' },
  { value: 'intimate_friend', label: 'Intimate Friends', description: 'Someone you can share everything with without thinking twice.', icon: Users, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  { value: 'close_friend', label: 'Close Friends', description: 'Someone you make an effort to hang out with.', icon: Users, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  { value: 'friend', label: 'Casual Friends', description: 'You see from time to time. They might come and go.', icon: UserCircle, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-900/20' },
  { value: 'acquaintance', label: 'Acquaintances', description: 'You spend time together around shared events.', icon: Handshake, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-900/30' },
  { value: 'work', label: 'Business Contacts', description: 'Work contacts and colleagues.', icon: Briefcase, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  { value: 'mentor', label: 'Mentors', description: 'People who guide and inspire you.', icon: GraduationCap, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  { value: 'almost_stranger', label: 'Almost Strangers', description: 'A known face you talked to once or twice.', icon: UserCircle, color: 'text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800/30' },
];

const NOTE_TYPES = [
  { value: 'note', label: 'Person Note', icon: StickyNote, description: 'Capture insights, new info, or context about them.' },
  { value: 'happy_memory', label: 'Happy Memory', icon: Smile, description: 'A moment worth remembering together.' },
  { value: 'meeting', label: 'Meeting', icon: Coffee },
  { value: 'call', label: 'Call', icon: PhoneCall },
  { value: 'catch_up', label: 'Catch Up', icon: Handshake },
];

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getCircle(rel: string) {
  return RELATIONSHIP_CIRCLES.find(r => r.value === rel) || RELATIONSHIP_CIRCLES[5];
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PeopleView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterRel, setFilterRel] = useState('');
  const [showFavorites, setShowFavorites] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [emailActivity, setEmailActivity] = useState<Record<string, { lastEmailed: string | null; emailCount: number }>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'circles' | 'list'>('circles');

  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterGroup) params.set('group', filterGroup);
      if (filterRel) params.set('relationship', filterRel);
      if (showArchived) params.set('archived', 'true');
      if (showFavorites) params.set('favorites', 'true');
      const res = await fetch(`/api/contacts?${params}`);
      if (res.ok) setContacts(await res.json());
    } catch (e) {
      console.error('Failed to fetch contacts', e);
    } finally {
      setLoading(false);
    }
  }, [search, filterGroup, filterRel, showArchived, showFavorites]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts/groups');
      if (res.ok) setGroups(await res.json());
    } catch (e) { console.error('Failed to fetch groups', e); }
  }, []);

  const fetchEmailActivity = useCallback(async (contactIds: string[]) => {
    if (!contactIds.length) return;
    try {
      const res = await fetch('/api/contacts/email-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds }),
      });
      if (res.ok) { const data = await res.json(); setEmailActivity(prev => ({ ...prev, ...data })); }
    } catch (e) { console.error('Failed to fetch email activity', e); }
  }, []);

  useEffect(() => { fetchContacts(); fetchGroups(); }, [fetchContacts, fetchGroups]);

  useEffect(() => {
    if (contacts.length > 0) {
      const idsWithEmail = contacts.filter(c => c.email).map(c => c.id);
      if (idsWithEmail.length > 0) fetchEmailActivity(idsWithEmail);
    }
  }, [contacts, fetchEmailActivity]);

  const toggleFavorite = async (contact: Contact) => {
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !contact.isFavorite }),
      });
      if (res.ok) {
        fetchContacts();
        if (selectedContact?.id === contact.id)
          setSelectedContact({ ...selectedContact, isFavorite: !contact.isFavorite });
      }
    } catch { toast.error('Failed to update'); }
  };

  const archiveContact = async (contact: Contact) => {
    try {
      await fetch(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: !contact.isArchived }),
      });
      fetchContacts();
      if (selectedContact?.id === contact.id) setSelectedContact(null);
      toast.success(contact.isArchived ? 'Contact restored' : 'Contact archived');
    } catch { toast.error('Failed to archive'); }
  };

  const deleteContact = async (contact: Contact) => {
    if (!confirm(`Delete ${contact.name}? This cannot be undone.`)) return;
    try {
      await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
      fetchContacts();
      if (selectedContact?.id === contact.id) setSelectedContact(null);
      toast.success('Contact deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const selectContact = async (contact: Contact) => {
    try {
      const res = await fetch(`/api/contacts/${contact.id}`);
      if (res.ok) setSelectedContact(await res.json());
    } catch { setSelectedContact(contact); }
  };

  // Catch-up reminders
  const needsCatchUp = useMemo(() => {
    return contacts.filter(c => {
      if (!c.catchUpFrequency || c.isArchived) return false;
      const days = daysSince(c.lastContactedAt);
      if (days === null) return true;
      return days >= c.catchUpFrequency;
    });
  }, [contacts]);

  // Group contacts by relationship circle
  const circleGroups = useMemo(() => {
    const grouped: Record<string, Contact[]> = {};
    for (const c of contacts) {
      if (!grouped[c.relationship]) grouped[c.relationship] = [];
      grouped[c.relationship].push(c);
    }
    return RELATIONSHIP_CIRCLES.filter(circle => grouped[circle.value]?.length > 0)
      .map(circle => ({ ...circle, contacts: grouped[circle.value] || [] }));
  }, [contacts]);

  const isFiltering = search || filterGroup || filterRel || showFavorites || showArchived;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground mt-1">Your personal relationship tracker</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowGroupModal(true)}>
            <Users2 className="w-4 h-4 mr-1" /> Groups
          </Button>
          <Button size="sm" onClick={() => { setEditingContact(null); setShowAddModal(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Catch-up Reminders */}
      {needsCatchUp.length > 0 && (
        <div className="game-card p-4 border-l-4 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Time to Reconnect</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {needsCatchUp.slice(0, 5).map(c => {
              const days = daysSince(c.lastContactedAt);
              return (
                <button key={c.id} onClick={() => selectContact(c)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-card border border-amber-200 dark:border-amber-800 text-xs hover:shadow-sm transition-shadow">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold">
                    {getInitials(c.name)}
                  </div>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{days === null ? 'Never' : `${days}d ago`}</span>
                </button>
              );
            })}
            {needsCatchUp.length > 5 && (
              <span className="text-xs text-muted-foreground self-center">+{needsCatchUp.length - 5} more</span>
            )}
          </div>
        </div>
      )}

      {/* Search & View Toggle */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search people..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4" />
          </Button>
        </div>
        {showFilters && (
          <div className="game-card p-3 flex flex-wrap gap-2">
            <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
              className="text-xs border rounded-lg px-2 py-1.5 bg-background">
              <option value="">All Groups</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={filterRel} onChange={e => setFilterRel(e.target.value)}
              className="text-xs border rounded-lg px-2 py-1.5 bg-background">
              <option value="">All Circles</option>
              {RELATIONSHIP_CIRCLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button onClick={() => setShowFavorites(!showFavorites)}
              className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${showFavorites ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 text-amber-700' : 'bg-background'}`}>
              ⭐ Favorites
            </button>
            <button onClick={() => setShowArchived(!showArchived)}
              className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${showArchived ? 'bg-gray-200 dark:bg-gray-800 border-gray-400' : 'bg-background'}`}>
              📦 Archived
            </button>
          </div>
        )}
      </div>

      {/* Contact Display */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="game-card p-8 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {isFiltering ? 'No contacts match your filters' : 'No contacts yet. Add your first one!'}
          </p>
        </div>
      ) : (
        /* Circles View (Lunatask-style grouped by relationship) */
        <div className="space-y-8">
          {(isFiltering ? [{ value: 'filtered', label: 'Results', contacts, description: '', icon: Search, color: 'text-primary', bg: 'bg-primary/10' }] : circleGroups).map((circle) => (
            <div key={circle.value}>
              {/* Circle Header */}
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-display font-semibold text-base">{circle.label}</h2>
                <span className="text-xs text-muted-foreground">({circle.contacts.length})</span>
              </div>
              {circle.description && (
                <p className="text-xs text-muted-foreground mb-3 -mt-1">{circle.description}</p>
              )}

              {/* Avatar Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                {circle.contacts.map(contact => {
                  const days = daysSince(contact.lastContactedAt);
                  const isOverdue = contact.catchUpFrequency && days !== null && days >= contact.catchUpFrequency;
                  const circleInfo = getCircle(contact.relationship);
                  return (
                    <button key={contact.id} onClick={() => selectContact(contact)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all hover:shadow-md bg-card ${selectedContact?.id === contact.id ? 'ring-2 ring-primary' : ''} ${isOverdue ? 'ring-1 ring-amber-300' : ''}`}
                      style={{ boxShadow: 'var(--shadow-sm)' }}>
                      <div className="relative">
                        {contact.avatar ? (
                          <img src={contact.avatar} alt={contact.name} className="w-14 h-14 rounded-full object-cover" />
                        ) : (
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-base font-bold ${circleInfo.bg} ${circleInfo.color}`}>
                            {getInitials(contact.name)}
                          </div>
                        )}
                        {contact.isFavorite && (
                          <Star className="absolute -top-1 -right-1 w-4 h-4 text-amber-400 fill-amber-400" />
                        )}
                        {contact.group && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card"
                            style={{ backgroundColor: contact.group.color }} title={contact.group.name} />
                        )}
                      </div>
                      <span className="text-xs font-medium text-center truncate w-full">{contact.name}</span>
                      {days !== null && (
                        <span className={`text-[10px] ${isOverdue ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                          {days === 0 ? 'Today' : `${days}d ago`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact Detail Drawer */}
      {selectedContact && (
        <ContactDetail
          contact={selectedContact}
          emailActivity={emailActivity[selectedContact.id]}
          groups={groups}
          allContacts={contacts}
          onClose={() => setSelectedContact(null)}
          onEdit={() => { setEditingContact(selectedContact); setShowAddModal(true); }}
          onArchive={() => archiveContact(selectedContact)}
          onDelete={() => deleteContact(selectedContact)}
          onToggleFavorite={() => toggleFavorite(selectedContact)}
          onRefresh={async () => {
            fetchContacts();
            const res = await fetch(`/api/contacts/${selectedContact.id}`);
            if (res.ok) setSelectedContact(await res.json());
          }}
        />
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <ContactFormModal
          contact={editingContact}
          groups={groups}
          onClose={() => { setShowAddModal(false); setEditingContact(null); }}
          onSaved={() => { setShowAddModal(false); setEditingContact(null); fetchContacts(); }}
        />
      )}

      {/* Group Management Modal */}
      {showGroupModal && (
        <GroupModal groups={groups} onClose={() => setShowGroupModal(false)} onRefresh={fetchGroups} />
      )}
    </div>
  );
}

// ─── Contact Detail ───
function ContactDetail({ contact, emailActivity, groups, allContacts, onClose, onEdit, onArchive, onDelete, onToggleFavorite, onRefresh }: {
  contact: Contact;
  emailActivity?: { lastEmailed: string | null; emailCount: number };
  groups: ContactGroup[];
  allContacts: Contact[];
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onRefresh: () => void;
}) {
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('note');
  const [savingNote, setSavingNote] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [merging, setMerging] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);

  const aliases = Array.isArray((contact as any).aliases) ? (contact as any).aliases as string[] : [];

  const addAlias = async () => {
    if (!newAlias.trim()) return;
    setSavingAlias(true);
    const updated = [...aliases, newAlias.trim()];
    try {
      const r = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliases: updated }),
      });
      if (r.ok) { setNewAlias(''); toast.success('Alias added'); onRefresh(); }
    } catch { toast.error('Failed'); }
    setSavingAlias(false);
  };

  const removeAlias = async (alias: string) => {
    const updated = aliases.filter(a => a !== alias);
    try {
      await fetch(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliases: updated.length > 0 ? updated : null }),
      });
      toast.success('Alias removed');
      onRefresh();
    } catch { toast.error('Failed'); }
  };

  const mergeContact = async (mergeId: string) => {
    const mergeTarget = allContacts.find(c => c.id === mergeId);
    if (!mergeTarget) return;
    if (!confirm(`Merge "${mergeTarget.name}" into "${contact.name}"? All notes and data from ${mergeTarget.name} will be combined, and ${mergeTarget.name} will be deleted.`)) return;
    setMerging(true);
    try {
      const r = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: contact.id, mergeId }),
      });
      if (r.ok) {
        const d = await r.json();
        toast.success(`Merged ${d.mergedName} into ${contact.name}`);
        setShowMerge(false);
        onRefresh();
      } else toast.error('Merge failed');
    } catch { toast.error('Merge failed'); }
    setMerging(false);
  };

  const days = daysSince(contact.lastContactedAt);
  const isOverdue = contact.catchUpFrequency && days !== null && days >= contact.catchUpFrequency;
  const circle = getCircle(contact.relationship);

  const notes = contact.notes || [];
  const memories = notes.filter(n => n.type === 'happy_memory');
  const journalLinks = notes.filter(n => n.type === 'journal_link');
  const regularNotes = notes.filter(n => n.type !== 'happy_memory' && n.type !== 'journal_link');

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNote.trim(), type: noteType }),
      });
      if (res.ok) {
        setNewNote('');
        toast.success(noteType === 'happy_memory' ? 'Memory saved ✨' : 'Note added');
        onRefresh();
      }
    } catch { toast.error('Failed to add note'); }
    finally { setSavingNote(false); }
  };

  const deleteNote = async (noteId: string) => {
    try {
      await fetch(`/api/contacts/${contact.id}/notes?noteId=${noteId}`, { method: 'DELETE' });
      toast.success('Note deleted');
      onRefresh();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-md border-b border-border p-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {contact.avatar ? (
                <img src={contact.avatar} alt={contact.name} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-bold ${circle.bg} ${circle.color}`}>
                  {getInitials(contact.name)}
                </div>
              )}
              <div>
                <h2 className="font-display font-bold text-base">{contact.name}</h2>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-medium ${circle.color}`}>{circle.label}</span>
                  {contact.group && <span className="text-xs text-muted-foreground">· {contact.group.name}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
          </div>

          {/* Reconnect / Last Connected */}
          <div className="flex gap-3 mt-3 text-xs">
            <div className="flex-1 flex items-center justify-between p-2 rounded-lg bg-secondary/50">
              <span className="text-muted-foreground">Last connected</span>
              <span className={`font-medium ${isOverdue ? 'text-amber-600' : ''}`}>
                {days !== null ? (days === 0 ? 'Today' : `${days} days ago`) : 'Never'}
              </span>
            </div>
            {contact.catchUpFrequency && (
              <div className="flex-1 flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                <span className="text-muted-foreground">Catch-up every</span>
                <span className="font-medium">{contact.catchUpFrequency}d</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Overdue Alert */}
          {isOverdue && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-amber-700 dark:text-amber-400">
                Time to reconnect! It&apos;s been {days} days (target: every {contact.catchUpFrequency}d)
              </span>
            </div>
          )}

          {/* Quick Info */}
          <div className="space-y-2">
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <a href={`mailto:${contact.email}`} className="text-primary hover:underline">{contact.email}</a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span>{contact.company}{contact.role && ` · ${contact.role}`}</span>
              </div>
            )}
            {contact.birthday && (
              <div className="flex items-center gap-2 text-sm">
                <Cake className="w-4 h-4 text-muted-foreground" />
                <span>{contact.birthday}</span>
                <GreetingButton contactId={contact.id} occasion="birthday" phone={contact.phone} name={contact.name} />
              </div>
            )}
            {contact.customDates && Array.isArray(contact.customDates) && (contact.customDates as { label: string; date: string }[]).map((cd, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CalendarHeart className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{cd.label}:</span>
                <span>{cd.date}</span>
                <GreetingButton contactId={contact.id} occasion={cd.label} phone={contact.phone} name={contact.name} />
              </div>
            ))}
            {emailActivity && emailActivity.emailCount > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <MailOpen className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {emailActivity.emailCount} emails
                  {emailActivity.lastEmailed && <> · last {daysSince(emailActivity.lastEmailed) === 0 ? 'today' : `${daysSince(emailActivity.lastEmailed)}d ago`}</>}
                </span>
              </div>
            )}
          </div>

          {/* Personal Details */}
          {(contact.howWeMet || contact.familyNotes || (contact.interests && (contact.interests as string[]).length > 0)) && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal</h3>
              {contact.howWeMet && <div className="text-sm"><span className="text-muted-foreground">How we met: </span>{contact.howWeMet}</div>}
              {contact.familyNotes && <div className="text-sm"><span className="text-muted-foreground">Family: </span>{contact.familyNotes}</div>}
              {contact.interests && (contact.interests as string[]).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(contact.interests as string[]).map((interest, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{interest}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Aliases */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aliases</h3>
            <p className="text-[10px] text-muted-foreground">Names this person goes by — AI will match these in journal entries</p>
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {aliases.map((alias, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-secondary flex items-center gap-1">
                    {alias}
                    <button onClick={() => removeAlias(alias)} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newAlias}
                onChange={e => setNewAlias(e.target.value)}
                placeholder="Add alias (e.g. gf, bestie)"
                className="h-8 text-xs flex-1"
                onKeyDown={e => e.key === 'Enter' && addAlias()}
              />
              <Button size="sm" variant="outline" onClick={addAlias} disabled={savingAlias || !newAlias.trim()} className="h-8">
                {savingAlias ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          {/* Merge */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Merge Contacts</h3>
            {!showMerge ? (
              <Button variant="outline" size="sm" onClick={() => setShowMerge(true)} className="text-xs">
                <GitMerge className="w-3.5 h-3.5 mr-1" /> Merge another contact into this one
              </Button>
            ) : (
              <div className="space-y-2 p-3 rounded-xl border border-border bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Select a contact to merge into <strong>{contact.name}</strong>. Their notes and data will be combined, and the selected contact will be deleted.</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {allContacts.filter(c => c.id !== contact.id && !c.isArchived).map(c => (
                    <button
                      key={c.id}
                      onClick={() => mergeContact(c.id)}
                      disabled={merging}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-primary/10 transition-colors flex items-center justify-between"
                    >
                      <span>{c.name}</span>
                      <span className="text-[10px] text-muted-foreground">{c.relationship}</span>
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowMerge(false)} className="text-xs w-full">Cancel</Button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onEdit}><Edit3 className="w-3.5 h-3.5 mr-1" /> Edit</Button>
            <Button variant="outline" size="sm" onClick={onToggleFavorite}>
              {contact.isFavorite ? <><StarOff className="w-3.5 h-3.5 mr-1" /> Unfav</> : <><Star className="w-3.5 h-3.5 mr-1" /> Fav</>}
            </Button>
            <Button variant="outline" size="sm" onClick={onArchive}>
              {contact.isArchived ? <><ArchiveRestore className="w-3.5 h-3.5 mr-1" /> Restore</> : <><Archive className="w-3.5 h-3.5 mr-1" /> Archive</>}
            </Button>
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
          </div>

          {/* Add Note / Memory */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What should I add?</h3>
            <div className="grid grid-cols-2 gap-2">
              {NOTE_TYPES.slice(0, 2).map(t => (
                <button key={t.value} onClick={() => setNoteType(t.value)}
                  className={`text-left p-3 rounded-xl border transition-colors ${noteType === t.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <t.icon className={`w-3.5 h-3.5 ${noteType === t.value ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-semibold">{t.label}</span>
                    {t.value === 'happy_memory' && <span className="text-[9px] px-1 py-0.5 rounded bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 font-medium">✨</span>}
                  </div>
                  {t.description && <p className="text-[10px] text-muted-foreground leading-tight">{t.description}</p>}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {NOTE_TYPES.slice(2).map(t => (
                <button key={t.value} onClick={() => setNoteType(t.value)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${noteType === t.value ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder={noteType === 'happy_memory' ? 'A moment worth remembering...' : 'What happened?'}
                value={newNote} onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote()}
                className="flex-1 text-sm" />
              <Button size="sm" onClick={addNote} disabled={savingNote || !newNote.trim()}>
                {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Journal Links (auto-generated from @mentions) */}
          {journalLinks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">From Your Journal</h3>
              </div>
              <div className="space-y-2">
                {journalLinks.map(note => (
                  <div key={note.id} className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                    <p className="text-xs leading-relaxed">{note.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{formatDate(note.date)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Happy Memories */}
          {memories.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5 text-pink-500" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-pink-500">Happy Memories</h3>
              </div>
              <div className="space-y-2">
                {memories.map(note => (
                  <div key={note.id} className="bg-pink-50/50 dark:bg-pink-950/10 rounded-lg p-3 border border-pink-200/50 dark:border-pink-800/30 group">
                    <p className="text-xs leading-relaxed">{note.content}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-muted-foreground">{formatDate(note.date)}</p>
                      <button onClick={() => deleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/20 transition-opacity">
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regular Notes */}
          {regularNotes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Notes ({regularNotes.length})
              </h3>
              <div className="space-y-2">
                {regularNotes.map(note => {
                  const NoteIcon = NOTE_TYPES.find(t => t.value === note.type)?.icon || StickyNote;
                  return (
                    <div key={note.id} className="flex gap-2 group">
                      <div className="flex-shrink-0 mt-1"><NoteIcon className="w-3.5 h-3.5 text-muted-foreground" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{note.content}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDate(note.date)} · {NOTE_TYPES.find(t => t.value === note.type)?.label || 'Note'}
                        </p>
                      </div>
                      <button onClick={() => deleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 transition-opacity">
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {notes.length === 0 && (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground">No notes or memories yet. Start adding above, or mention them in your journal!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Greeting Button (AI + WhatsApp) ───
function GreetingButton({ contactId, occasion, phone, name }: { contactId: string; occasion: string; phone?: string | null; name: string }) {
  const [loading, setLoading] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [waLink, setWaLink] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/greeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occasion }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGreeting(data.greeting);
      setWaLink(data.waLink);
      setShowModal(true);
    } catch {
      toast.error('Failed to generate greeting');
    } finally {
      setLoading(false);
    }
  };

  const copyAndClose = () => {
    if (greeting) {
      navigator.clipboard.writeText(greeting);
      toast.success('Copied to clipboard');
    }
  };

  return (
    <>
      <button onClick={generate} disabled={loading}
        className="ml-auto p-1 rounded-md hover:bg-primary/10 text-primary transition-colors" title={`Generate ${occasion} greeting`}>
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
      </button>
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={() => setShowModal(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                {occasion.charAt(0).toUpperCase() + occasion.slice(1)} Greeting for {name.split(' ')[0]}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-secondary"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4 text-sm whitespace-pre-wrap">{greeting}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyAndClose} className="gap-1 flex-1">
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={generate} disabled={loading} className="gap-1">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Regenerate
              </Button>
              {waLink ? (
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button size="sm" className="gap-1 w-full bg-green-600 hover:bg-green-700 text-white">
                    <ExternalLink className="w-3.5 h-3.5" /> WhatsApp
                  </Button>
                </a>
              ) : (
                <Button size="sm" disabled className="flex-1 gap-1" title="Add phone number to enable">
                  <Send className="w-3.5 h-3.5" /> No phone
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Contact Form Modal ───
function ContactFormModal({ contact, groups, onClose, onSaved }: {
  contact: Contact | null;
  groups: ContactGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!contact;
  const [form, setForm] = useState({
    name: contact?.name || '',
    nickname: contact?.nickname || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    company: contact?.company || '',
    role: contact?.role || '',
    relationship: contact?.relationship || 'acquaintance',
    groupId: contact?.groupId || '',
    birthday: contact?.birthday || '',
    customDates: (contact?.customDates as { label: string; date: string }[] || []),
    howWeMet: contact?.howWeMet || '',
    interests: contact?.interests ? (contact.interests as string[]).join(', ') : '',
    familyNotes: contact?.familyNotes || '',
    catchUpFrequency: contact?.catchUpFrequency?.toString() || '',
    isFavorite: contact?.isFavorite || false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        interests: form.interests ? form.interests.split(',').map(s => s.trim()).filter(Boolean) : null,
        groupId: form.groupId || null,
        customDates: form.customDates.length > 0 ? form.customDates.filter(cd => cd.label && cd.date) : null,
        catchUpFrequency: form.catchUpFrequency || null,
      };
      const url = isEditing ? `/api/contacts/${contact!.id}` : '/api/contacts';
      const method = isEditing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        toast.success(isEditing ? 'Contact updated' : 'Contact added');
        onSaved();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save');
      }
    } catch { toast.error('Failed to save contact'); }
    finally { setSaving(false); }
  };

  const update = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-card/95 backdrop-blur-md border-b border-border p-4 flex items-center justify-between z-10">
          <h2 className="font-display font-bold">{isEditing ? 'Edit Contact' : 'Add Contact'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
              <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nickname</label>
              <Input value={form.nickname} onChange={e => update('nickname', e.target.value)} placeholder="Nickname" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="email@example.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
              <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+65 xxxx xxxx" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Company</label>
              <Input value={form.company} onChange={e => update('company', e.target.value)} placeholder="Company" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
              <Input value={form.role} onChange={e => update('role', e.target.value)} placeholder="Job title" />
            </div>
          </div>

          {/* How close are we? (Lunatask-style) */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">How close are we?</label>
            <div className="space-y-1">
              {RELATIONSHIP_CIRCLES.map(r => (
                <button key={r.value} onClick={() => update('relationship', r.value)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-colors ${form.relationship === r.value ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-secondary/50'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${form.relationship === r.value ? 'text-primary' : ''}`}>{r.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{r.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Group */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Group</label>
            <select value={form.groupId} onChange={e => update('groupId', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Birthday</label>
            <Input value={form.birthday} onChange={e => update('birthday', e.target.value)} placeholder="e.g. 15 Mar or 1995-03-15" />
          </div>

          {/* Custom Dates */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Important Dates</label>
            <p className="text-[10px] text-muted-foreground mb-2">Anniversary, graduation, or any date worth remembering</p>
            {form.customDates.map((cd, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input value={cd.label} placeholder="Label (e.g. Anniversary)" className="flex-1"
                  onChange={e => {
                    const next = [...form.customDates];
                    next[i] = { ...next[i], label: e.target.value };
                    update('customDates', next);
                  }} />
                <Input value={cd.date} placeholder="e.g. 2020-06-15" className="flex-1"
                  onChange={e => {
                    const next = [...form.customDates];
                    next[i] = { ...next[i], date: e.target.value };
                    update('customDates', next);
                  }} />
                <button onClick={() => update('customDates', form.customDates.filter((_, j) => j !== i))}
                  className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => update('customDates', [...form.customDates, { label: '', date: '' }])}>
              <PlusIcon className="w-3.5 h-3.5" /> Add date
            </Button>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">How did you meet?</label>
            <textarea value={form.howWeMet} onChange={e => update('howWeMet', e.target.value)}
              placeholder="Met at a hackathon in 2023..."
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background min-h-[60px] resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Shared Interests</label>
            <Input value={form.interests} onChange={e => update('interests', e.target.value)} placeholder="Comma separated: hiking, chess, crypto" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Family Notes</label>
            <Input value={form.familyNotes} onChange={e => update('familyNotes', e.target.value)} placeholder="Wife: Sarah, Kids: Liam (3)" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Catch-up Reminder (days)</label>
            <Input type="number" value={form.catchUpFrequency} onChange={e => update('catchUpFrequency', e.target.value)} placeholder="e.g. 30" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isFavorite} onChange={e => update('isFavorite', e.target.checked)} className="rounded" />
            <Star className="w-4 h-4 text-amber-400" />
            <span className="text-sm">Mark as favorite</span>
          </label>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {isEditing ? 'Save Changes' : 'Add Contact'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Group Management Modal ───
function GroupModal({ groups, onClose, onRefresh }: {
  groups: ContactGroup[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B8F71');
  const [saving, setSaving] = useState(false);

  const addGroup = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/contacts/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (res.ok) { setNewName(''); toast.success('Group created'); onRefresh(); }
      else { const data = await res.json(); toast.error(data.error || 'Failed'); }
    } catch { toast.error('Failed to create group'); }
    finally { setSaving(false); }
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this group? Contacts will be ungrouped.')) return;
    try { await fetch(`/api/contacts/groups/${id}`, { method: 'DELETE' }); toast.success('Deleted'); onRefresh(); }
    catch { toast.error('Failed'); }
  };

  const PRESET_COLORS = ['#6B8F71', '#E76F51', '#2A9D8F', '#E9C46A', '#264653', '#F4A261', '#8B5CF6', '#EC4899'];

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[70vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-card/95 backdrop-blur-md border-b border-border p-4 flex items-center justify-between z-10">
          <h2 className="font-display font-bold">Manage Groups</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="New group name..." value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addGroup()} className="flex-1" />
              <Button size="sm" onClick={addGroup} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex gap-1.5">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${newColor === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No groups yet.</p>
          ) : (
            <div className="space-y-2">
              {groups.map(g => (
                <div key={g.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: g.color }} />
                    <span className="text-sm font-medium">{g.name}</span>
                    <span className="text-xs text-muted-foreground">({g._count?.contacts || 0})</span>
                  </div>
                  <button onClick={() => deleteGroup(g.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}