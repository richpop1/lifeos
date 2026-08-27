'use client';
import { useState } from 'react';
import { Send, X, Loader2, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Props {
  accountId: string;
  accountEmail: string;
  replyTo?: { to: string; subject: string; messageId?: string; fromName?: string; draftBody?: string };
  onClose: () => void;
  onSent: () => void;
}

export function EmailCompose({ accountId, accountEmail, replyTo, onClose, onSent }: Props) {
  const [to, setTo] = useState(replyTo?.to || '');
  const [subject, setSubject] = useState(
    replyTo?.subject ? (replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`) : ''
  );
  const [body, setBody] = useState(
    replyTo?.draftBody
      ? `${replyTo.draftBody}\n\n--- Original message from ${replyTo?.fromName || 'sender'} ---`
      : replyTo?.fromName ? `\n\n--- Original message from ${replyTo.fromName} ---` : ''
  );
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim()) {
      toast.error('To and Subject are required');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId, to: to.trim(), subject: subject.trim(),
          body: body.trim(), inReplyTo: replyTo?.messageId,
        }),
      });
      if (res.ok) {
        toast.success('Email sent!');
        onSent();
        onClose();
      } else {
        const err = await res.json();
        toast.error(err?.error || 'Failed to send');
      }
    } catch { toast.error('Send failed'); }
    setSending(false);
  };

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden" style={{ boxShadow: 'var(--shadow-lg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{replyTo ? 'Reply' : 'New Email'}</span>
        </div>
        <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-10">From:</span>
          <span className="text-xs text-foreground">{accountEmail}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-10">To:</span>
          <Input value={to} onChange={(e: any) => setTo(e.target.value)} placeholder="recipient@email.com"
            className="h-8 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-10">Subj:</span>
          <Input value={subject} onChange={(e: any) => setSubject(e.target.value)} placeholder="Subject"
            className="h-8 text-xs" />
        </div>

        <textarea value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message..."
          className="w-full min-h-[160px] p-3 text-sm bg-background border border-input rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <div className="flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground">
            Sending from {accountEmail}
          </div>
          <Button onClick={handleSend} disabled={sending} size="sm">
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
