'use client';
import { useState } from 'react';
import { Sparkles, Pencil, Check, X, Crown, Flame, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const DISCOVERY_PROMPTS = [
  { q: 'If you had zero fear, what name would you go by?', field: 'name', placeholder: 'A powerful name that embodies your future self' },
  { q: 'Who is this person? Describe them in one paragraph.', field: 'description', placeholder: 'They wake up at 5am, run a portfolio of businesses, train daily, and radiate calm confidence...' },
  { q: 'What\'s their daily mantra — the sentence they repeat to themselves?', field: 'mantra', placeholder: 'e.g. I build wealth that works while I sleep.' },
];

const TRAIT_SUGGESTIONS = [
  'Disciplined', 'Fearless', 'Generous', 'Focused', 'Calm under pressure',
  'Financially free', 'Physically strong', 'Emotionally intelligent',
  'Magnetic presence', 'Strategic thinker', 'Deep connector', 'Visionary',
];

interface Props {
  profile: any;
  onUpdate: () => void;
}

export function AlterEgoCard({ profile, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.alterEgoName ?? '');
  const [description, setDescription] = useState(profile?.alterEgoDescription ?? '');
  const [mantra, setMantra] = useState(profile?.alterEgoMantra ?? '');
  const [traits, setTraits] = useState<string[]>((profile?.alterEgoTraits as string[]) ?? []);
  const [newTrait, setNewTrait] = useState('');

  const hasAlterEgo = !!profile?.alterEgoName;

  const startDiscovery = () => {
    setName(profile?.alterEgoName ?? '');
    setDescription(profile?.alterEgoDescription ?? '');
    setMantra(profile?.alterEgoMantra ?? '');
    setTraits((profile?.alterEgoTraits as string[]) ?? []);
    setStep(0);
    setDiscovering(true);
    setEditing(false);
  };

  const startEdit = () => {
    setName(profile?.alterEgoName ?? '');
    setDescription(profile?.alterEgoDescription ?? '');
    setMantra(profile?.alterEgoMantra ?? '');
    setTraits((profile?.alterEgoTraits as string[]) ?? []);
    setEditing(true);
    setDiscovering(false);
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Give your alter ego a name'); return; }
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alterEgoName: name.trim(),
          alterEgoDescription: description.trim(),
          alterEgoMantra: mantra.trim(),
          alterEgoTraits: traits,
        }),
      });
      if (res.ok) {
        toast.success(`${name.trim()} is alive.`);
        setEditing(false);
        setDiscovering(false);
        onUpdate();
      }
    } catch { toast.error('Failed to save'); }
  };

  const addTrait = (trait: string) => {
    if (traits.length >= 8) return;
    if (!traits.includes(trait)) setTraits([...traits, trait]);
  };

  const removeTrait = (trait: string) => {
    setTraits(traits.filter(t => t !== trait));
  };

  const addCustomTrait = () => {
    if (!newTrait.trim() || traits.length >= 8) return;
    addTrait(newTrait.trim());
    setNewTrait('');
  };

  // Discovery mode — step by step
  if (discovering) {
    const prompt = DISCOVERY_PROMPTS[step];

    if (step < DISCOVERY_PROMPTS.length) {
      const currentValue = step === 0 ? name : step === 1 ? description : mantra;
      const setValue = step === 0 ? setName : step === 1 ? setDescription : setMantra;

      return (
        <section className="game-card p-6 border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" style={{ width: `${((step + 1) / (DISCOVERY_PROMPTS.length + 1)) * 100}%` }} />
          <div className="flex items-center gap-2 mb-4">
            <Crown className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] font-mono text-amber-400 tracking-widest uppercase">ALTER EGO DISCOVERY</span>
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">{step + 1}/{DISCOVERY_PROMPTS.length + 1}</span>
          </div>
          <p className="text-base font-display font-semibold mb-4">{prompt?.q}</p>
          {step === 1 ? (
            <textarea
              value={currentValue}
              onChange={(e) => setValue(e.target.value)}
              placeholder={prompt?.placeholder}
              className="w-full rounded-lg border border-input bg-background/50 px-3 py-2.5 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              autoFocus
            />
          ) : (
            <Input
              value={currentValue}
              onChange={(e: any) => setValue(e.target.value)}
              placeholder={prompt?.placeholder}
              autoFocus
            />
          )}
          <div className="flex justify-between mt-4">
            <Button variant="ghost" size="sm" onClick={() => step > 0 ? setStep(step - 1) : setDiscovering(false)}>
              {step > 0 ? 'Back' : 'Cancel'}
            </Button>
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={!currentValue.trim()}>
              Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </section>
      );
    }

    // Step 4: Traits selection
    return (
      <section className="game-card p-6 border-primary/20 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" style={{ width: '100%' }} />
        <div className="flex items-center gap-2 mb-4">
          <Crown className="w-5 h-5 text-amber-400" />
          <span className="text-[10px] font-mono text-amber-400 tracking-widest uppercase">ALTER EGO DISCOVERY</span>
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">{DISCOVERY_PROMPTS.length + 1}/{DISCOVERY_PROMPTS.length + 1}</span>
        </div>
        <p className="text-base font-display font-semibold mb-2">What traits define {name || 'your alter ego'}?</p>
        <p className="text-xs text-muted-foreground mb-4">Pick up to 8 traits that embody who {name || 'they'} is. Or add your own.</p>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {TRAIT_SUGGESTIONS.map((t) => {
            const selected = traits.includes(t);
            return (
              <button key={t} onClick={() => selected ? removeTrait(t) : addTrait(t)}
                className={`text-xs px-2.5 py-1.5 rounded-full transition-all border
                  ${selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/50 text-muted-foreground border-transparent hover:border-primary/30'}`}>
                {t}
              </button>
            );
          })}
        </div>

        {/* Custom trait input */}
        <div className="flex gap-2 mb-4">
          <Input value={newTrait} onChange={(e: any) => setNewTrait(e.target.value)}
            placeholder="Add custom trait" className="flex-1"
            onKeyDown={(e: any) => e.key === 'Enter' && addCustomTrait()} />
          <Button variant="outline" size="sm" onClick={addCustomTrait} disabled={!newTrait.trim() || traits.length >= 8}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>

        {traits.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {traits.filter(t => !TRAIT_SUGGESTIONS.includes(t)).map((t) => (
              <span key={t} className="text-xs px-2.5 py-1.5 rounded-full bg-primary text-primary-foreground flex items-center gap-1">
                {t}
                <button onClick={() => removeTrait(t)}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>Back</Button>
          <Button size="sm" onClick={save} disabled={traits.length === 0}>
            <Sparkles className="w-3.5 h-3.5 mr-1" /> Bring {name || 'them'} to life
          </Button>
        </div>
      </section>
    );
  }

  // Edit mode — full form
  if (editing) {
    return (
      <section className="game-card p-6 border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-display font-semibold">Edit {name || 'Alter Ego'}</span>
          </div>
          <button onClick={() => setEditing(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase block mb-1">Name</label>
            <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Their name" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase block mb-1">Who are they?</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder="Describe this person..." />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase block mb-1">Daily Mantra</label>
            <Input value={mantra} onChange={(e: any) => setMantra(e.target.value)} placeholder="Their power phrase" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground uppercase block mb-1">Traits ({traits.length}/8)</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {traits.map((t) => (
                <span key={t} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                  {t} <button onClick={() => removeTrait(t)}><X className="w-2.5 h-2.5" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newTrait} onChange={(e: any) => setNewTrait(e.target.value)} placeholder="Add trait" className="flex-1"
                onKeyDown={(e: any) => e.key === 'Enter' && addCustomTrait()} />
              <Button variant="outline" size="sm" onClick={addCustomTrait} disabled={!newTrait.trim() || traits.length >= 8}><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={save}><Check className="w-3.5 h-3.5 mr-1" /> Save</Button>
          </div>
        </div>
      </section>
    );
  }

  // Display mode — the alter ego card
  if (!hasAlterEgo) {
    return (
      <section className="game-card p-5 border-dashed border-2 border-primary/20 text-center">
        <Crown className="w-8 h-8 text-amber-400/50 mx-auto mb-2" />
        <p className="font-display font-semibold text-sm mb-1">Discover Your Alter Ego</p>
        <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
          Create the dream version of yourself — a persona that embodies who you\'re becoming. Your journal and inbox will reference them.
        </p>
        <Button variant="outline" size="sm" onClick={startDiscovery}>
          <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Begin Discovery
        </Button>
      </section>
    );
  }

  return (
    <section className="game-card p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-amber-400/5 rounded-full -translate-y-1/3 translate-x-1/3" />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 flex items-center justify-center border border-amber-400/20">
              <Crown className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-amber-400 tracking-widest uppercase">ALTER EGO</p>
              <p className="font-display font-bold text-lg leading-tight">{profile.alterEgoName}</p>
            </div>
          </div>
          <button onClick={startEdit} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        {profile.alterEgoDescription && (
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{profile.alterEgoDescription}</p>
        )}

        {profile.alterEgoMantra && (
          <div className="bg-primary/5 rounded-lg px-3 py-2 mb-3 border-l-2 border-primary/30">
            <p className="text-xs font-mono text-primary italic">"{profile.alterEgoMantra}"</p>
          </div>
        )}

        {(profile.alterEgoTraits as string[])?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {((profile.alterEgoTraits as string[]) ?? []).map((t: string) => (
              <span key={t} className="text-[10px] px-2 py-1 rounded-full bg-amber-400/10 text-amber-600 dark:text-amber-400 font-medium">{t}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
