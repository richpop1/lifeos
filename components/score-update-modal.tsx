'use client';
import { useState } from 'react';
import { X, DollarSign, Heart, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const metrics = [
  { section: 'Wealth', icon: DollarSign, color: '#5B9A8B', items: [
    { key: 'activeIncome', label: 'Active Income' },
    { key: 'passiveIncome', label: 'Passive Income' },
    { key: 'riskManagement', label: 'Risk Management' },
    { key: 'personalBudget', label: 'Personal Budget' },
  ]},
  { section: 'Health', icon: Heart, color: '#E8913A', items: [
    { key: 'physical', label: 'Physical' },
    { key: 'emotional', label: 'Emotional' },
    { key: 'mental', label: 'Mental (Focus)' },
    { key: 'spiritual', label: 'Spiritual' },
  ]},
  { section: 'Relationships', icon: Users, color: '#D94F7A', items: [
    { key: 'partner', label: 'Partner' },
    { key: 'family', label: 'Family' },
    { key: 'friends', label: 'Friends' },
    { key: 'community', label: 'Community' },
  ]},
];

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export function ScoreUpdateModal({ onClose, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, number>>({
    activeIncome: 5, passiveIncome: 5, riskManagement: 5, personalBudget: 5,
    physical: 5, emotional: 5, mental: 5, spiritual: 5,
    partner: 5, family: 5, friends: 5, community: 5,
  });
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, date, note }),
      });
      if (res.ok) {
        toast.success('Scores updated!');
        onSaved();
      } else {
        toast.error('Failed to save');
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Error saving scores');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={(e: any) => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg">Update Life Scores</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="mb-4">
          <label className="text-xs text-muted-foreground block mb-1">Date</label>
          <Input type="date" value={date} onChange={(e: any) => setDate(e.target.value)} />
        </div>

        {metrics.map((section: any) => {
          const Icon = section.icon;
          return (
            <div key={section.section} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" style={{ color: section.color }} />
                <span className="text-sm font-semibold">{section.section}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(section.items ?? []).map((item: any) => (
                  <div key={item.key}>
                    <label className="text-xs text-muted-foreground block mb-1">{item.label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="1" max="10"
                        value={values?.[item.key] ?? 5}
                        onChange={(e: any) => setValues({ ...(values ?? {}), [item.key]: parseInt(e.target.value) })}
                        className="flex-1 accent-primary"
                      />
                      <span className="font-mono text-sm font-bold w-5 text-center">{values?.[item.key] ?? 5}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="mb-4">
          <label className="text-xs text-muted-foreground block mb-1">Reflection Note</label>
          <textarea
            value={note}
            onChange={(e: any) => setNote(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="What's on your mind?"
          />
        </div>

        <Button onClick={handleSave} className="w-full" disabled={saving}>
          {saving ? 'Saving...' : 'Save Scores'}
        </Button>
      </div>
    </div>
  );
}
