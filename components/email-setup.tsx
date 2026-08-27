'use client';
import { useState } from 'react';
import { Mail, Plus, Trash2, X, Loader2, ExternalLink, CheckCircle2, Shield, AlertCircle, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface EmailAccount {
  id: string;
  label: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  isActive: boolean;
  _count?: { emails: number };
}

interface Props {
  accounts: EmailAccount[];
  onRefresh: () => void;
  onClose: () => void;
}

type Provider = 'gmail' | 'outlook' | 'yahoo' | 'zoho' | 'other';

const PRESETS: Record<string, { smtpHost: string; smtpPort: number; imapHost: string; imapPort: number; label: string }> = {
  gmail: { smtpHost: 'smtp.gmail.com', smtpPort: 587, imapHost: 'imap.gmail.com', imapPort: 993, label: 'Gmail' },
  outlook: { smtpHost: 'smtp.office365.com', smtpPort: 587, imapHost: 'outlook.office365.com', imapPort: 993, label: 'Outlook' },
  yahoo: { smtpHost: 'smtp.mail.yahoo.com', smtpPort: 587, imapHost: 'imap.mail.yahoo.com', imapPort: 993, label: 'Yahoo' },
  zoho: { smtpHost: 'smtp.zoho.com', smtpPort: 587, imapHost: 'imap.zoho.com', imapPort: 993, label: 'Zoho Mail' },
};

const PROVIDER_META: Record<Provider, { icon: string; color: string; bg: string; name: string; passwordUrl: string; passwordLabel: string; helpSteps: string[] }> = {
  gmail: {
    icon: '📧', color: '#EA4335', bg: 'bg-red-50 dark:bg-red-900/10',
    name: 'Gmail', passwordUrl: 'https://myaccount.google.com/apppasswords',
    passwordLabel: 'Create Gmail App Password',
    helpSteps: [
      'Click the link below — it opens Google\'s App Password page',
      'Sign in if asked, then click "Select app" → choose "Mail"',
      'Click "Generate" — you\'ll see a 16-character password',
      'Copy that password and paste it here',
    ],
  },
  outlook: {
    icon: '📬', color: '#0078D4', bg: 'bg-blue-50 dark:bg-blue-900/10',
    name: 'Outlook', passwordUrl: 'https://account.microsoft.com/security',
    passwordLabel: 'Go to Microsoft Security',
    helpSteps: [
      'If you use 2-Step Verification, click the link below',
      'Go to "Security" → "Advanced security" → "App passwords"',
      'Create a new app password and copy it',
      'If you don\'t use 2FA, just use your regular Outlook password',
    ],
  },
  yahoo: {
    icon: '📪', color: '#6001D2', bg: 'bg-purple-50 dark:bg-purple-900/10',
    name: 'Yahoo', passwordUrl: 'https://login.yahoo.com/myaccount/security/app-password/',
    passwordLabel: 'Create Yahoo App Password',
    helpSteps: [
      'Click the link below to open Yahoo App Passwords',
      'Select "Other app" and type "Life OS"',
      'Click "Generate" and copy the password',
      'Paste it here',
    ],
  },
  zoho: {
    icon: '✉️', color: '#D14836', bg: 'bg-orange-50 dark:bg-orange-900/10',
    name: 'Zoho Mail', passwordUrl: 'https://accounts.zoho.com/home#security/security_pwd',
    passwordLabel: 'Zoho Security Settings',
    helpSteps: [
      'Click the link below to open Zoho Security settings',
      'Scroll to "Application-Specific Passwords"',
      'Click "Generate New Password" — name it "Life OS"',
      'Copy the generated password and paste it here',
      'Note: If using zoho.eu or zoho.in, the server might differ — adjust in Other if needed',
    ],
  },
  other: {
    icon: '⚙️', color: '#666', bg: 'bg-gray-50 dark:bg-gray-900/10',
    name: 'Other Email', passwordUrl: '',
    passwordLabel: '',
    helpSteps: ['Enter your email server details manually below.'],
  },
};

export function EmailSetup({ accounts, onRefresh, onClose }: Props) {
  const [screen, setScreen] = useState<'list' | 'pick' | 'connect'>('list');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', smtpHost: '', smtpPort: 587, imapHost: '', imapPort: 993 });

  const reset = () => {
    setScreen('list');
    setProvider(null);
    setError('');
    setShowHelp(false);
    setForm({ email: '', password: '', smtpHost: '', smtpPort: 587, imapHost: '', imapPort: 993 });
  };

  const pickProvider = (p: Provider) => {
    setProvider(p);
    setError('');
    setShowHelp(false);
    if (p !== 'other') {
      const preset = PRESETS[p];
      setForm(f => ({ ...f, ...preset }));
    } else {
      setForm({ email: '', password: '', smtpHost: '', smtpPort: 587, imapHost: '', imapPort: 993 });
    }
    setScreen('connect');
  };

  const handleConnect = async () => {
    if (!form.email || !form.password) {
      setError('Please enter your email and password.');
      return;
    }
    if (provider === 'other' && (!form.smtpHost || !form.imapHost)) {
      setError('Please enter your server details.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/email/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: provider !== 'other' ? PRESETS[provider!]?.label : 'Email',
          email: form.email,
          password: form.password,
          smtpHost: form.smtpHost,
          smtpPort: form.smtpPort,
          imapHost: form.imapHost,
          imapPort: form.imapPort,
        }),
      });
      if (res.ok) {
        toast.success('Email connected! 🎉');
        reset();
        onRefresh();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err?.error || 'Connection failed. Please check your credentials.');
      }
    } catch {
      setError('Something went wrong. Try again.');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this email account?')) return;
    try {
      await fetch(`/api/email/accounts?id=${id}`, { method: 'DELETE' });
      toast.success('Removed');
      onRefresh();
    } catch { toast.error('Failed'); }
  };

  const meta = provider ? PROVIDER_META[provider] : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" /> Email Accounts
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-4">
        {/* ═══ SCREEN: LIST ═══ */}
        {screen === 'list' && (
          <div className="space-y-3">
            {accounts.length === 0 && (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm font-medium">No email connected yet</p>
                <p className="text-[11px] text-muted-foreground mt-1">Connect your email to read and reply from Life OS.</p>
              </div>
            )}

            {accounts.map(acc => (
              <div key={acc.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{acc.label}</p>
                  <p className="text-[10px] text-muted-foreground">{acc.email}</p>
                </div>
                <button onClick={() => handleDelete(acc.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 text-muted-foreground hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <Button onClick={() => setScreen('pick')} className="w-full gap-2">
              <Plus className="w-4 h-4" /> Connect Email
            </Button>
          </div>
        )}

        {/* ═══ SCREEN: PICK PROVIDER ═══ */}
        {screen === 'pick' && (
          <div className="space-y-3">
            <div>
              <button onClick={() => setScreen('list')} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 mb-2">
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              <p className="text-sm font-semibold">Connect your email</p>
              <p className="text-[11px] text-muted-foreground">Choose your provider to get started.</p>
            </div>

            <div className="space-y-2">
              {/* Gmail */}
              <button onClick={() => pickProvider('gmail')}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50/50 dark:hover:bg-red-900/5 transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center text-lg">📧</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Connect Gmail</p>
                  <p className="text-[10px] text-muted-foreground">Google email accounts</p>
                </div>
                <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" />
              </button>

              {/* Outlook */}
              <button onClick={() => pickProvider('outlook')}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-900/5 transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-lg">📬</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Connect Outlook</p>
                  <p className="text-[10px] text-muted-foreground">Hotmail, Live, Office 365</p>
                </div>
                <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" />
              </button>

              {/* Yahoo */}
              <button onClick={() => pickProvider('yahoo')}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50/50 dark:hover:bg-purple-900/5 transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center text-lg">📪</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Connect Yahoo</p>
                  <p className="text-[10px] text-muted-foreground">Yahoo Mail</p>
                </div>
                <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" />
              </button>

              {/* Zoho */}
              <button onClick={() => pickProvider('zoho')}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50/50 dark:hover:bg-orange-900/5 transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center text-lg">✉️</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Connect Zoho Mail</p>
                  <p className="text-[10px] text-muted-foreground">Zoho Mail, Zoho Workplace</p>
                </div>
                <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" />
              </button>

              {/* Other */}
              <button onClick={() => pickProvider('other')}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary/50 transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg">⚙️</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Other email provider</p>
                  <p className="text-[10px] text-muted-foreground">Manual setup</p>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Shield className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <p className="text-[10px] text-muted-foreground">Your credentials are encrypted and stored securely. We never see your password.</p>
            </div>
          </div>
        )}

        {/* ═══ SCREEN: CONNECT (login-like) ═══ */}
        {screen === 'connect' && meta && (
          <div className="space-y-4">
            <div>
              <button onClick={() => { setScreen('pick'); setError(''); }} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 mb-3">
                <ChevronLeft className="w-3 h-3" /> Back
              </button>

              {/* Provider branding header */}
              <div className={`flex items-center gap-3 p-3.5 rounded-xl ${meta.bg}`}>
                <span className="text-2xl">{meta.icon}</span>
                <div>
                  <p className="text-sm font-semibold">Sign in to {meta.name}</p>
                  <p className="text-[10px] text-muted-foreground">Connect your {meta.name} account to Life OS</p>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/30">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Email field */}
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1.5">Email address</label>
              <Input
                placeholder={provider === 'gmail' ? 'you@gmail.com' : provider === 'outlook' ? 'you@outlook.com' : 'you@email.com'}
                type="email" value={form.email}
                onChange={(e: any) => setForm(f => ({ ...f, email: e.target.value }))}
                className="h-11"
                autoFocus
              />
            </div>

            {/* Password field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-medium text-foreground">
                  {provider === 'other' ? 'Password' : 'App Password'}
                </label>
                {provider !== 'other' && (
                  <button onClick={() => setShowHelp(!showHelp)} className="text-[10px] text-primary hover:underline">
                    {showHelp ? 'Hide help' : "What's this?"}
                  </button>
                )}
              </div>
              <Input
                placeholder={provider === 'gmail' ? 'Paste your 16-character app password' : provider === 'other' ? 'Your email password' : 'Paste your app password'}
                type="password" value={form.password}
                onChange={(e: any) => setForm(f => ({ ...f, password: e.target.value }))}
                className="h-11"
              />
            </div>

            {/* Expandable help section */}
            {showHelp && provider !== 'other' && (
              <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2.5">
                <p className="text-[11px] font-semibold">How to get your App Password:</p>
                <ol className="space-y-1.5">
                  {meta.helpSteps.map((s, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground flex gap-2">
                      <span className="font-mono font-bold text-primary flex-shrink-0">{i + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                {meta.passwordUrl && (
                  <a href={meta.passwordUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline p-2 rounded-lg bg-primary/5 w-fit">
                    <ExternalLink className="w-3 h-3" /> {meta.passwordLabel}
                  </a>
                )}
                <p className="text-[10px] text-muted-foreground italic">
                  ⏱️ Takes about 1 minute. You only need to do this once.
                </p>
                {provider === 'gmail' && (
                  <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">⚠️ Can't see App Passwords?</p>
                    <p className="text-[9px] text-amber-600 dark:text-amber-500 mt-0.5">You need 2-Step Verification turned ON first. Go to <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Google 2-Step Verification</a> → enable it → then the App Passwords link will work.</p>
                  </div>
                )}
              </div>
            )}

            {/* Manual server fields for 'other' */}
            {provider === 'other' && (
              <div className="space-y-2 p-3 rounded-lg bg-secondary/20">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Server Settings</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">SMTP Host</label>
                    <Input placeholder="smtp.example.com" value={form.smtpHost}
                      onChange={(e: any) => setForm(f => ({ ...f, smtpHost: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">SMTP Port</label>
                    <Input type="number" value={form.smtpPort}
                      onChange={(e: any) => setForm(f => ({ ...f, smtpPort: parseInt(e.target.value) || 587 }))} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">IMAP Host</label>
                    <Input placeholder="imap.example.com" value={form.imapHost}
                      onChange={(e: any) => setForm(f => ({ ...f, imapHost: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">IMAP Port</label>
                    <Input type="number" value={form.imapPort}
                      onChange={(e: any) => setForm(f => ({ ...f, imapPort: parseInt(e.target.value) || 993 }))} />
                  </div>
                </div>
              </div>
            )}

            {/* Connect button */}
            <Button onClick={handleConnect} disabled={loading} className="w-full h-11 text-sm gap-2" style={{ backgroundColor: meta.color }}>
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
              ) : (
                <>Connect {meta.name}</>  
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <p className="text-[9px] text-muted-foreground">Encrypted with AES-256. Your password is never stored in plain text.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
