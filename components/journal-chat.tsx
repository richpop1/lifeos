'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, Zap, Battery, BatteryLow, BatteryMedium, BatteryFull, BatteryCharging, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface MoodOption {
  key: string;
  emoji: string;
  label: string;
}

interface Props {
  sessionType: 'morning' | 'evening';
  moods: MoodOption[];
  onComplete: () => void;
  onCancel: () => void;
  goalId?: string | null;
  journalDate?: string | null; // ISO date string for backlog entries (e.g. '2026-06-15')
  // Continuation mode
  continueEntryId?: string | null;
  existingMessages?: ChatMessage[];
  existingMoodStart?: string | null;
}

type Phase = 'mood-start' | 'chat' | 'mood-end' | 'saving' | 'saved';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const ENERGY_LEVELS = [
  { value: 1, icon: BatteryLow, label: 'Depleted', color: 'text-red-500' },
  { value: 2, icon: BatteryLow, label: 'Low', color: 'text-orange-500' },
  { value: 3, icon: BatteryMedium, label: 'Steady', color: 'text-yellow-500' },
  { value: 4, icon: BatteryFull, label: 'Strong', color: 'text-green-500' },
  { value: 5, icon: BatteryCharging, label: 'Charged', color: 'text-emerald-500' },
];

export function JournalChat({ sessionType, moods, onComplete, onCancel, goalId, journalDate, continueEntryId, existingMessages, existingMoodStart }: Props) {
  const isContinuation = !!continueEntryId;
  const [phase, setPhase] = useState<Phase>(isContinuation ? 'chat' : 'mood-start');
  const [moodStart, setMoodStart] = useState<string | null>(isContinuation ? (existingMoodStart || null) : null);
  const [moodEnd, setMoodEnd] = useState<string | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(isContinuation && existingMessages ? existingMessages : []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [savedEntry, setSavedEntry] = useState<any>(null);
  const [mediaFiles, setMediaFiles] = useState<{ url: string; type: string; cloudPath: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const continuationStartedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Auto-kick-off continuation greeting
  useEffect(() => {
    if (!isContinuation || continuationStartedRef.current) return;
    continuationStartedRef.current = true;
    (async () => {
      setStreaming(true);
      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const response = await fetch('/api/journal/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionType,
            messages: [...(existingMessages || []), { role: 'user', content: '[CONTINUATION] I\'m back to add more to today\'s journal.' }],
            isContinuation: true,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed');
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantMsg = '';
        let partialRead = '';
        const baseMessages = [...(existingMessages || []), { role: 'user' as const, content: 'Continuing from earlier...' }];
        while (true) {
          const { done, value } = await reader!.read();
          if (done) break;
          partialRead += decoder.decode(value, { stream: true });
          const lines = partialRead.split('\n');
          partialRead = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                assistantMsg += delta;
                setMessages([...baseMessages, { role: 'assistant', content: assistantMsg }]);
              } catch {}
            }
          }
        }
        if (assistantMsg) {
          setMessages([...baseMessages, { role: 'assistant', content: assistantMsg }]);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') toast.error('Failed to continue session');
      }
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    })();
  }, [isContinuation, existingMessages, sessionType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the AI conversation after mood selection
  const startChat = useCallback(async (mood: string) => {
    setMoodStart(mood);
    setPhase('chat');
    setStreaming(true);

    // Send initial message to AI to kick off the session
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch('/api/journal/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionType,
          messages: [{ role: 'user', content: `Starting ${sessionType} session. My mood: ${mood}` }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('Failed to start session');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = '';
      let partialRead = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              assistantMsg += delta;
              setMessages([{ role: 'assistant', content: assistantMsg }]);
            } catch {}
          }
        }
      }

      if (assistantMsg) {
        setMessages([{ role: 'assistant', content: assistantMsg }]);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        toast.error('Failed to start session');
      }
    }
    setStreaming(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [sessionType]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    const updatedMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(updatedMessages);
    setStreaming(true);

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch('/api/journal/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionType,
          messages: updatedMessages,
          ...(isContinuation ? { isContinuation: true } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('Failed to send message');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = '';
      let partialRead = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              assistantMsg += delta;
              setMessages([...updatedMessages, { role: 'assistant', content: assistantMsg }]);
            } catch {}
          }
        }
      }

      if (assistantMsg) {
        setMessages([...updatedMessages, { role: 'assistant', content: assistantMsg }]);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        toast.error('Failed to get response');
      }
    }
    setStreaming(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [input, messages, streaming, sessionType]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) { toast.error(`${file.name} is too large (max 50MB)`); continue; }
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { toast.error(`${file.name} is not an image or video`); continue; }
      try {
        const presignRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, isPublic: true }),
        });
        if (!presignRes.ok) { toast.error(`Upload failed for ${file.name}`); continue; }
        const { uploadUrl, cloud_storage_path, publicUrl } = await presignRes.json();
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!uploadRes.ok) { toast.error(`Upload failed for ${file.name}`); continue; }
        setMediaFiles(prev => [...prev, { url: publicUrl, type: file.type, cloudPath: cloud_storage_path }]);
      } catch { toast.error(`Failed to upload ${file.name}`); }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMedia = (idx: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const finishSession = async (endMood: string) => {
    setMoodEnd(endMood);
    setPhase('saving');

    try {
      const res = await fetch('/api/journal/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionType,
          moodStart,
          moodEnd: endMood,
          energy,
          chatMessages: messages,
          goalId: goalId || null,
          journalDate: journalDate || null,
          ...(continueEntryId ? { entryId: continueEntryId } : {}),
          ...(mediaFiles.length > 0 ? { mediaUrls: mediaFiles } : {}),
        }),
      });

      if (res.ok) {
        const entry = await res.json();
        setSavedEntry(entry);
        setPhase('saved');
      } else {
        toast.error('Failed to save session');
        setPhase('mood-end');
      }
    } catch {
      toast.error('Error saving session');
      setPhase('mood-end');
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground capitalize">
            {journalDate ? `${new Date(journalDate + 'T12:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} · ` : ''}
            {isContinuation ? `${sessionType} · continuing` : `${sessionType} session`}
          </span>
          {moodStart && (
            <span className="text-sm">{moods.find(m => m.key === moodStart)?.emoji}</span>
          )}
        </div>
        {phase === 'chat' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPhase('mood-end')}
            className="text-xs h-7"
          >
            End Session
          </Button>
        )}
        {phase !== 'chat' && <div className="w-20" />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {/* Mood Start */}
          {phase === 'mood-start' && (
            <motion.div
              key="mood-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex items-center justify-center px-4"
            >
              <div className="w-full max-w-md text-center">
                <h2 className="font-display text-xl font-bold mb-2">How are you feeling?</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Select your mood to start your {sessionType} razor session.
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {moods.map((mood) => (
                    <button
                      key={mood.key}
                      onClick={() => startChat(mood.key)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card hover:bg-secondary transition-colors"
                      style={{ boxShadow: 'var(--shadow-sm)' }}
                    >
                      <span className="text-2xl">{mood.emoji}</span>
                      <span className="text-[10px] text-muted-foreground">{mood.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Chat Phase */}
          {phase === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
                      ${msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-card border border-border rounded-bl-md'
                      }`}
                      style={msg.role === 'assistant' ? { boxShadow: 'var(--shadow-sm)' } : {}}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border px-4 py-3 flex-shrink-0">
                {/* Media previews */}
                {mediaFiles.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-2 max-w-2xl mx-auto scrollbar-hide">
                    {mediaFiles.map((m, i) => (
                      <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-border">
                        {m.type.startsWith('image/') ? (
                          <img src={m.url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <video src={m.url} className="w-full h-full object-cover" />
                        )}
                        <button onClick={() => removeMedia(i)} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center">
                          <X className="w-2.5 h-2.5 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end max-w-2xl mx-auto">
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileSelect} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="rounded-xl h-[44px] w-[44px] flex-shrink-0 flex items-center justify-center border border-input bg-background hover:bg-secondary transition-colors"
                    title="Add photo or video"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <ImagePlus className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e: any) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm min-h-[44px] max-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Type your response..."
                    rows={1}
                    disabled={streaming}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!input.trim() || streaming}
                    size="icon"
                    className="rounded-xl h-[44px] w-[44px] flex-shrink-0"
                  >
                    {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Mood End */}
          {phase === 'mood-end' && (
            <motion.div
              key="mood-end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex items-center justify-center px-4"
            >
              <div className="w-full max-w-md text-center space-y-8">
                {/* Energy Level */}
                {!energy && (
                  <div>
                    <h2 className="font-display text-xl font-bold mb-2">Energy level?</h2>
                    <p className="text-sm text-muted-foreground mb-6">How's your battery right now?</p>
                    <div className="flex justify-center gap-3">
                      {ENERGY_LEVELS.map((level) => {
                        const Icon = level.icon;
                        return (
                          <button
                            key={level.value}
                            onClick={() => setEnergy(level.value)}
                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card hover:bg-secondary transition-colors min-w-[60px]"
                            style={{ boxShadow: 'var(--shadow-sm)' }}
                          >
                            <Icon className={`w-6 h-6 ${level.color}`} />
                            <span className="text-[10px] text-muted-foreground">{level.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mood selection after energy */}
                {energy && (
                  <div>
                    <h2 className="font-display text-xl font-bold mb-2">How are you feeling now?</h2>
                    <p className="text-sm text-muted-foreground mb-6">After reflecting, how has your mood shifted?</p>
                    <div className="grid grid-cols-4 gap-3">
                      {moods.map((mood) => (
                        <button
                          key={mood.key}
                          onClick={() => finishSession(mood.key)}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card hover:bg-secondary transition-colors"
                          style={{ boxShadow: 'var(--shadow-sm)' }}
                        >
                          <span className="text-2xl">{mood.emoji}</span>
                          <span className="text-[10px] text-muted-foreground">{mood.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Saving */}
          {phase === 'saving' && (
            <motion.div
              key="saving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{isContinuation ? 'Updating your razor summary...' : 'Generating your razor summary...'}</p>
              </div>
            </motion.div>
          )}

          {/* Saved — Show razor summary */}
          {phase === 'saved' && savedEntry && (
            <motion.div
              key="saved"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 overflow-y-auto px-4 py-6"
            >
              <div className="max-w-md mx-auto space-y-4">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                    <Zap className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h2 className="font-display text-xl font-bold">Session Complete</h2>
                  <p className="text-sm text-muted-foreground mt-1">Your razor summary</p>
                </div>

                {/* Razor Summary Card */}
                <div className="bg-card rounded-xl p-5 space-y-3" style={{ boxShadow: 'var(--shadow-md)' }}>
                  {savedEntry.dayTitle && (
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Day Title</span>
                      <p className="text-sm font-display font-semibold mt-0.5">"{savedEntry.dayTitle}"</p>
                    </div>
                  )}
                  {savedEntry.focusItem && (
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">🎯 Focus</span>
                      <p className="text-sm mt-0.5">{savedEntry.focusItem}</p>
                    </div>
                  )}
                  {savedEntry.cleanWin && (
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">✅ Clean Win</span>
                      <p className="text-sm mt-0.5">{savedEntry.cleanWin}</p>
                    </div>
                  )}
                  {savedEntry.focusRazor && (
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">🔪 Razor</span>
                      <p className="text-sm mt-0.5 text-amber-600 dark:text-amber-400">{savedEntry.focusRazor}</p>
                    </div>
                  )}
                  {savedEntry.signal && (
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">📡 Signal</span>
                      <p className="text-sm mt-0.5">{savedEntry.signal}</p>
                    </div>
                  )}
                  {savedEntry.personalMirror && (
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">🪞 Mirror</span>
                      <p className="text-sm mt-0.5 font-medium">{savedEntry.personalMirror}</p>
                    </div>
                  )}
                  {savedEntry.humanClose && (
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">❤️ Close</span>
                      <p className="text-sm mt-0.5">{savedEntry.humanClose}</p>
                    </div>
                  )}
                  {savedEntry.dailyLine && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-sm italic text-center text-muted-foreground">"{savedEntry.dailyLine}"</p>
                    </div>
                  )}
                </div>

                {/* Razor Summary */}
                {savedEntry.razorSummary && (
                  <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                    <span className="text-[10px] font-mono text-primary uppercase tracking-wider">Razor Summary</span>
                    <p className="text-sm mt-1 leading-relaxed">{savedEntry.razorSummary}</p>
                  </div>
                )}

                {/* Key Memories */}
                {savedEntry.keyMemories && Array.isArray(savedEntry.keyMemories) && savedEntry.keyMemories.length > 0 && (
                  <div className="bg-pink-50/50 dark:bg-pink-950/10 rounded-xl p-4 border border-pink-200/50 dark:border-pink-800/30">
                    <span className="text-[10px] font-mono text-pink-600 dark:text-pink-400 uppercase tracking-wider flex items-center gap-1">❤️ Key Memories</span>
                    <div className="space-y-2 mt-2">
                      {savedEntry.keyMemories.map((mem: any, i: number) => (
                        <div key={i} className="text-sm">
                          <p className="font-medium">{mem.moment}</p>
                          {mem.context && <p className="text-xs text-muted-foreground mt-0.5">{mem.context}</p>}
                          <div className="flex gap-1.5 mt-1">
                            {mem.emotion && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">{mem.emotion}</span>}
                            {mem.personName && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">@{mem.personName}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ideas */}
                {savedEntry.ideas && Array.isArray(savedEntry.ideas) && savedEntry.ideas.length > 0 && (
                  <div className="bg-amber-50/50 dark:bg-amber-950/10 rounded-xl p-4 border border-amber-200/50 dark:border-amber-800/30">
                    <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">💡 Ideas & Sparks</span>
                    <div className="space-y-2 mt-2">
                      {savedEntry.ideas.map((idea: any, i: number) => (
                        <div key={i} className="text-sm">
                          <p className="font-medium">{idea.idea}</p>
                          {idea.context && <p className="text-xs text-muted-foreground mt-0.5">{idea.context}</p>}
                          {idea.category && <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">{idea.category}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mentioned & New Contacts */}
                {savedEntry.newContacts && savedEntry.newContacts.length > 0 && (
                  <div className="bg-primary/5 rounded-xl p-3 border border-primary/10 space-y-1.5">
                    <p className="text-xs font-semibold text-primary flex items-center gap-1">👤 New people added to your circle</p>
                    <div className="flex flex-wrap gap-1.5">
                      {savedEntry.newContacts.map((c: any) => (
                        <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                          {c.name}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Auto-added as acquaintances · edit in People tab</p>
                  </div>
                )}
                {savedEntry.mentionedContactIds && Array.isArray(savedEntry.mentionedContactIds) && savedEntry.mentionedContactIds.length > 0 && (
                  <div className="text-center text-xs text-muted-foreground">
                    <span>🔗 Linked to {savedEntry.mentionedContactIds.length} contact{savedEntry.mentionedContactIds.length > 1 ? 's' : ''} in People</span>
                  </div>
                )}

                {/* Mood shift */}
                <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                  <span>{moods.find(m => m.key === savedEntry.moodStart)?.emoji} {moods.find(m => m.key === savedEntry.moodStart)?.label}</span>
                  <span>→</span>
                  <span>{moods.find(m => m.key === savedEntry.moodEnd)?.emoji} {moods.find(m => m.key === savedEntry.moodEnd)?.label}</span>
                  {savedEntry.energy && (
                    <span className="ml-2">⚡{savedEntry.energy}/5</span>
                  )}
                </div>

                <Button onClick={onComplete} className="w-full mt-4">
                  Done
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
