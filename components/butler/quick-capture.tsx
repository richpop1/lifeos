'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, Loader2, Check, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Quick Capture Bar — always-visible, tap-to-focus, <3s dump-and-go.
 * Text primary. Voice icon with graceful-degrade: feature-detect
 * SpeechRecognition, toast + text focus if absent.
 * Voice lands transcript in field for review — user presses Enter to send.
 * Wires to POST /api/butler/capture.
 */

interface CaptureResult {
  action: 'created' | 'bumped';
  loop: { id: string; content: string };
}

export function QuickCapture() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);

  // Feature-detect SpeechRecognition on mount (client-only)
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  const capture = useCallback(async (content: string) => {
    if (!content.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/butler/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (!res.ok) throw new Error('Capture failed');
      const data: CaptureResult = await res.json();
      setText('');
      setJustSent(true);
      setTimeout(() => setJustSent(false), 1500);

      if (data.action === 'bumped') {
        toast.info('Merged with existing loop', { duration: 2000 });
      }
      // Dispatch refresh for Today view
      window.dispatchEvent(new CustomEvent('ai:action', { detail: { tool: 'capture', action: data.action } }));
    } catch (err) {
      toast.error('Capture failed — try again');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [sending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    capture(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      capture(text);
    }
  };

  const startVoice = useCallback(() => {
    if (!voiceSupported) {
      toast('Voice not available on this device', {
        description: 'Type your thought instead — just as fast.',
        duration: 3000,
      });
      inputRef.current?.focus();
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-SG';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (e: any) => {
      if (e.error !== 'aborted') {
        toast.error('Voice recognition error');
      }
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onresult = (e: any) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setText(transcript);
      // On final result: land in field, let user review + Enter to send
      if (e.results[e.results.length - 1].isFinal) {
        setText(transcript);
        // Don't auto-submit — user reviews and presses Enter
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [voiceSupported, capture]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className={`flex items-center gap-2 rounded-2xl border bg-card px-3 py-2 transition-all
        ${listening ? 'border-red-400 shadow-[0_0_0_2px_rgba(248,113,113,0.15)]' : 'border-border hover:border-primary/30 focus-within:border-primary/50 focus-within:shadow-[0_0_0_2px_rgba(107,143,113,0.1)]'}
      `}>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? 'Listening…' : 'Capture a thought, task, or loop…'}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 min-w-0"
          disabled={sending}
          autoComplete="off"
        />

        {/* Voice button */}
        <button
          type="button"
          onClick={listening ? stopVoice : startVoice}
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors
            ${listening
              ? 'bg-red-100 text-red-600 animate-pulse'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          aria-label={listening ? 'Stop voice' : 'Voice input'}
        >
          {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        {/* Submit button */}
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all
            ${justSent
              ? 'bg-green-100 text-green-600'
              : text.trim()
                ? 'bg-primary text-primary-foreground shadow-sm hover:shadow'
                : 'text-muted-foreground/40'
            }`}
          aria-label="Capture"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : justSent ? (
            <Check className="w-4 h-4" />
          ) : (
            <ArrowDown className="w-4 h-4 rotate-[-90deg]" />
          )}
        </button>
      </div>
    </form>
  );
}
