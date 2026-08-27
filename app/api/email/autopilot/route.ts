export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { decrypt } from '@/lib/crypto';

function sanitizeForPostgres(str: string): string {
  // Remove null bytes that crash PostgreSQL
  return str.replace(/\x00/g, '').replace(/\0/g, '');
}

// Normalize subject to compute thread group
function normalizeSubject(subject: string): string {
  return (subject || '(no subject)')
    .replace(/^(re|fwd|fw|aw|sv|vs|ref):\s*/gi, '')
    .replace(/^(re|fwd|fw|aw|sv|vs|ref):\s*/gi, '') // double pass for "Re: Fwd:"
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
    .trim();
}

async function parseBodyFromSource(source: Buffer): Promise<{ text: string; html: string | null }> {
  try {
    const { simpleParser } = await import('mailparser');
    const parsed = await simpleParser(source);
    let text = parsed.text || '';
    const html = parsed.html || null;
    if (!text && html) {
      text = stripHtmlToText(html);
    }
    return { text: text.substring(0, 2000), html };
  } catch {
    const raw = source.toString('utf-8');
    const headerEnd = raw.indexOf('\n\n');
    if (headerEnd > 0) {
      return { text: stripHtmlToText(raw.substring(headerEnd + 2, headerEnd + 5000)).substring(0, 2000), html: null };
    }
    return { text: '', html: null };
  }
}

// POST — One-click AI Autopilot: sync → triage → organize → act
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();

    const accounts = await prisma.emailAccount.findMany({ where: { userId, isActive: true } });
    if (!accounts.length) {
      return NextResponse.json({ error: 'No email accounts connected' }, { status: 400 });
    }

    const steps: string[] = [];
    let totalNewEmails = 0;

    // Step 1: Sync all accounts
    for (const account of accounts) {
      try {
        const password = decrypt(account.encryptedPassword);
        const { ImapFlow } = await import('imapflow');
        const client = new ImapFlow({
          host: account.imapHost, port: account.imapPort, secure: true,
          auth: { user: account.email, pass: password }, logger: false,
        });

        await client.connect();

        // List all available mailboxes to sync from multiple folders
        const foldersToSync: string[] = ['INBOX'];
        try {
          const mailboxes = await client.list();
          for (const mb of mailboxes) {
            const path = mb.path;
            // Skip trash, spam, drafts, sent
            const skipPatterns = /trash|spam|junk|drafts?|sent|\[gmail\]\/(spam|trash|drafts|sent|starred|important|all mail)/i;
            if (skipPatterns.test(path)) continue;
            if (path === 'INBOX') continue; // already added
            // Include all other folders (sub-folders, custom folders, etc.)
            foldersToSync.push(path);
          }
        } catch (listErr: any) {
          console.log('[AUTOPILOT] Could not list folders, using INBOX only:', listErr?.message);
        }

        for (const folder of foldersToSync) {
          let lock: any;
          try {
            lock = await client.getMailboxLock(folder);
            const mb = client.mailbox as any;
            const totalMessages = mb?.exists || 0;

            if (totalMessages > 0) {
              const fetchLimit = Math.min(50, totalMessages);
              const startSeq = Math.max(1, totalMessages - fetchLimit + 1);

              for await (const message of client.fetch(`${startSeq}:*`, {
                envelope: true, source: true, bodyStructure: true,
              })) {
                const env = message.envelope;
                if (!env) continue;

                let bodyText = '';
                let bodyHtml: string | null = null;
                if (message.source) {
                  const parsed = await parseBodyFromSource(message.source);
                  bodyText = parsed.text;
                  bodyHtml = parsed.html;
                }

                const msgId = env.messageId || `seq-${message.seq}-${account.id}`;
                const existing = await prisma.email.findFirst({
                  where: { accountId: account.id, messageId: msgId },
                });

                const threadId = normalizeSubject(env.subject || '');

                if (!existing) {
                  await prisma.email.create({
                    data: {
                      userId, accountId: account.id,
                      messageId: msgId,
                      threadId,
                      folder,
                      fromAddress: env.from?.[0]?.address || 'unknown',
                      fromName: sanitizeForPostgres(env.from?.[0]?.name || ''),
                      toAddress: env.to?.[0]?.address || account.email,
                      subject: sanitizeForPostgres(env.subject || '(no subject)'),
                      bodyText: bodyText ? sanitizeForPostgres(bodyText) : null,
                      bodyHtml: bodyHtml ? sanitizeForPostgres(bodyHtml) : null,
                      date: env.date ? new Date(env.date) : new Date(),
                    },
                  });
                  totalNewEmails++;
                } else {
                  // If user already actioned this email, never overwrite
                  if (existing.userAction) continue;

                  const updates: any = {};
                  if (!existing.bodyText && bodyText) updates.bodyText = sanitizeForPostgres(bodyText);
                  if (!existing.bodyHtml && bodyHtml) updates.bodyHtml = sanitizeForPostgres(bodyHtml);
                  if (!existing.threadId && threadId) updates.threadId = threadId;
                  if (existing.folder === 'INBOX' && folder !== 'INBOX') updates.folder = folder;
                  if (Object.keys(updates).length > 0) {
                    await prisma.email.update({ where: { id: existing.id }, data: updates });
                  }
                }
              }
            }

            lock.release();
          } catch (folderErr: any) {
            console.log(`[AUTOPILOT] Skipping folder ${folder}:`, folderErr?.message);
            if (lock) try { lock.release(); } catch {}
          }
        }

        await client.logout();
        steps.push(`Synced ${account.label} (${foldersToSync.length} folders)`);
      } catch (err: any) {
        console.error('[AUTOPILOT SYNC]', err?.message);
        steps.push(`${account.label}: sync issue`);
      }
    }

    // Step 1b: Backfill threadId for emails that don't have one
    const noThread = await prisma.email.findMany({ where: { userId, threadId: null }, select: { id: true, subject: true } });
    if (noThread.length > 0) {
      for (const e of noThread) {
        await prisma.email.update({ where: { id: e.id }, data: { threadId: normalizeSubject(e.subject) } });
      }
      steps.push(`Threaded ${noThread.length} emails`);
    }

    // Step 2: AI Triage by THREAD (not individual emails)
    // Skip emails where user already acted — user decisions are final
    const untriaged = await prisma.email.findMany({
      where: { userId, aiAction: null, userAction: null },
      orderBy: { date: 'desc' },
      take: 50,
    });

    let triageStats = { reply_needed: 0, add_task: 0, read_later: 0, archive: 0, delete: 0, auto_reply: 0 };
    let triageCount = 0;

    if (untriaged.length > 0) {
      const apiKey = process.env.ABACUSAI_API_KEY;
      if (apiKey) {
        // Group untriaged emails by thread
        const threadMap = new Map<string, typeof untriaged>();
        for (const e of untriaged) {
          const tid = e.threadId || normalizeSubject(e.subject);
          if (!threadMap.has(tid)) threadMap.set(tid, []);
          threadMap.get(tid)!.push(e);
        }

        // Also fetch already-triaged emails in same threads for context
        const threadIds = Array.from(threadMap.keys());
        const contextEmails = await prisma.email.findMany({
          where: { userId, threadId: { in: threadIds }, aiAction: { not: null } },
          orderBy: { date: 'asc' },
          select: { threadId: true, fromName: true, fromAddress: true, subject: true, aiSummary: true, aiAction: true, date: true },
        });
        const contextByThread = new Map<string, typeof contextEmails>();
        for (const e of contextEmails) {
          const tid = e.threadId || '';
          if (!contextByThread.has(tid)) contextByThread.set(tid, []);
          contextByThread.get(tid)!.push(e);
        }

        const [profile, goals, tasks] = await Promise.all([
          prisma.userProfile.findUnique({ where: { userId } }),
          prisma.goal.findMany({ where: { userId, status: 'active' }, orderBy: { weight: 'desc' } }),
          prisma.task.findMany({ where: { userId, status: { not: 'done' } }, take: 10 }),
        ]);

        const northStar = profile?.northStar || 'Personal freedom and growth';
        const aiPrefs = (profile?.aiPreferences as any) || {};
        const goalsList = goals.map((g: any) => `${g.title} (${g.pillar || 'general'}, weight: ${g.weight}/10)`).join(', ');
        const tasksList = tasks.map((t: any) => t.title).join(', ');

        // Fetch recent user action history for learning
        const recentActions = await prisma.email.findMany({
          where: { userId, userAction: { not: null } },
          orderBy: { userActionAt: 'desc' },
          take: 40,
          select: { fromAddress: true, fromName: true, subject: true, aiAction: true, userAction: true, aiCategory: true, aiUrgency: true },
        });

        // Build learning patterns: cases where user overrode AI
        const overrides = recentActions.filter(a => a.aiAction && a.userAction && a.aiAction !== a.userAction && !(a.aiAction === 'reply_needed' && a.userAction === 'reply') && !(a.aiAction === 'add_task' && a.userAction === 'task'));
        const agreements = recentActions.filter(a => a.aiAction && a.userAction && (a.aiAction === a.userAction || (a.aiAction === 'reply_needed' && a.userAction === 'reply') || (a.aiAction === 'add_task' && a.userAction === 'task')));

        // Summarize sender patterns (what user usually does with emails from specific senders)
        const senderPatterns = new Map<string, { actions: string[], count: number }>();
        for (const a of recentActions) {
          const sender = a.fromName || a.fromAddress;
          if (!senderPatterns.has(sender)) senderPatterns.set(sender, { actions: [], count: 0 });
          const sp = senderPatterns.get(sender)!;
          sp.actions.push(a.userAction!);
          sp.count++;
        }

        let learningContext = '';
        if (overrides.length > 0) {
          learningContext += `\n## LEARNING FROM USER BEHAVIOR (${recentActions.length} recent actions, ${overrides.length} overrides):\n`;
          learningContext += `The user corrected these AI decisions — LEARN from these patterns:\n`;
          for (const o of overrides.slice(0, 15)) {
            learningContext += `- "${o.subject?.substring(0, 50)}" from ${o.fromName || o.fromAddress}: AI said "${o.aiAction}" → User did "${o.userAction}"\n`;
          }
        }
        if (senderPatterns.size > 0) {
          learningContext += `\n## SENDER PATTERNS (what user typically does):\n`;
          for (const [sender, data] of Array.from(senderPatterns.entries()).slice(0, 15)) {
            const mostCommon = data.actions.sort((a, b) => data.actions.filter(x => x === b).length - data.actions.filter(x => x === a).length)[0];
            learningContext += `- ${sender} (${data.count}x): usually → "${mostCommon}"\n`;
          }
        }
        if (agreements.length > 0) {
          const accuracy = Math.round((agreements.length / recentActions.length) * 100);
          learningContext += `\nAI accuracy so far: ${accuracy}% (${agreements.length}/${recentActions.length} correct). Adapt based on overrides above.\n`;
        }

        // Build thread descriptions
        const threads = Array.from(threadMap.entries()).slice(0, 20);
        const threadDescriptions = threads.map(([tid, emails]) => {
          const sorted = [...emails].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          const latest = sorted[sorted.length - 1];
          const ctx = contextByThread.get(tid) || [];
          const allInThread = [...ctx, ...sorted];
          const participants = [...new Set(allInThread.map(e => e.fromName || e.fromAddress))];
          const emailIds = sorted.map(e => e.id);

          let desc = `Thread [IDs: ${emailIds.join(',')}] (${allInThread.length} messages):\n`;
          desc += `  Subject: ${latest.subject}\n`;
          desc += `  Participants: ${participants.join(', ')}\n`;
          desc += `  Latest from: ${latest.fromName || latest.fromAddress} (${latest.date})\n`;
          if (latest.bodyText) desc += `  Latest preview: ${latest.bodyText.substring(0, 400)}\n`;
          if (ctx.length > 0) desc += `  Prior context: ${ctx.map(c => `${c.fromName || c.fromAddress}: ${c.aiSummary || c.subject}`).join(' → ')}\n`;
          return desc;
        }).join('\n---\n');

        const prompt = `You are a RUTHLESS AI executive assistant managing email threads for **Teo Xuan Hao** (also goes by "Xuan Hao" or "XH"). He has ADHD and needs inbox zero.

IMPORTANT CONTEXT ABOUT THE USER:
- Email accounts: teoxuanhao1@gmail.com, virallycoliving@gmail.com, and Zoho mail
- Emails TO or ABOUT Teo Xuan Hao are personal/relevant
- Work colleague: Joel Fu (frequent work threads)
- North Star: "${northStar}"
- Goals: ${goalsList || 'None'}
- Active Tasks: ${tasksList || 'None'}

You analyze EMAIL THREADS (conversations), not individual emails. Your decision applies to the ENTIRE thread.

## EMAIL ZEROING RULES (FOLLOW EXACTLY):

1. **Spam / Promotional / Marketing / Newsletters / Mass notifications** → "delete"
2. **Actionable emails (easy to handle)** → "add_task" — Clear easiest first
3. **Actionable but only AFTER a future date** → "archive" — Note the future date in actionDetail
4. **CC'd / No action required from Xuan Hao** → "archive" — He might need to reference later, don't delete
5. **No action, but information may be needed within 6 months** → "archive" — Keep for search
6. **No action, information may be needed >6 months** → "add_task" with taskTitle like "Save notes from: [topic]" then "delete"
7. **Travel details / Events / Meetings** → "add_task" with taskTitle like "Add to calendar: [event]" then "archive"
8. **Security alerts, account notifications, verification emails** → "archive" — Important to keep but no action needed. Urgency "medium".
9. **Needs Xuan Hao's unique human judgment AND aligns with goals** → "reply_needed" with a draft reply
10. **Simple/formulaic reply needed** → "auto_reply" with draft
11. **Transactional receipts / payment confirmations / refund notices** → "archive" — Financial records, keep but no action

CRITICAL: Only DELETE genuine spam/marketing. For informational emails (security alerts, payment notifications, service updates), use ARCHIVE not delete.
URGENCY: Only "critical" or "high" for truly urgent + north-star-aligned items. Security alerts = "medium", not "urgent".
${aiPrefs.emailRules?.length ? `\n## USER'S PERSONAL EMAIL RULES (MUST FOLLOW):\n${aiPrefs.emailRules.map((r: string) => `- ${r}`).join('\n')}\n` : ''}
${aiPrefs.replyTone ? `## REPLY TONE: ${aiPrefs.replyTone}\n` : ''}
${(() => { const lp = (aiPrefs.learnedPatterns || []).filter((p: any) => p.status === 'active' && (p.category === 'email_preference' || p.category === 'triage_preference')); return lp.length > 0 ? `\n## AI-LEARNED PATTERNS (from behavior analysis):\n${lp.map((p: any) => `- [${p.confidence}] ${p.pattern}`).join('\n')}\n` : ''; })()}
${learningContext}
For EACH THREAD provide (return ONLY valid JSON array):
[{
  "ids": ["email_id1", "email_id2"],
  "summary": "2-3 sentence summary: what is this about, current status, key context",
  "pendingDecisions": "What decisions/actions are pending and by whom (names). null if none.",
  "urgency": "critical|high|medium|low",
  "category": "action-required|fyi|newsletter|personal|finance|promotional|travel",
  "action": "reply_needed|add_task|read_later|archive|delete|auto_reply",
  "actionDetail": "why this action + any notes, max 120 chars",
  "draftReply": "reply text or null",
  "taskTitle": "task title or null",
  "goalId": "matching goal ID if task relates to a goal, else null",
  "northStarAlign": 1-10
}]

AVAILABLE GOALS (link tasks to relevant goals using goalId):
${goals.map((g: any) => `- ID: ${g.id} | ${g.title} (${g.pillar || 'general'}, weight: ${g.weight})`).join('\n')}

${threadDescriptions}`;

        try {
          const aiRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 4000,
              temperature: 0.2,
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const content = aiData?.choices?.[0]?.message?.content || '';
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const results = JSON.parse(jsonMatch[0]);
              for (const r of results) {
                // r.ids is an array of email IDs in this thread
                const emailIds = r.ids || (r.id ? [r.id] : []);
                const action = r.action || 'archive';
                if (action in triageStats) triageStats[action as keyof typeof triageStats] += emailIds.length;
                triageCount += emailIds.length;
                // Apply to ALL emails in the thread
                for (const eid of emailIds) {
                  const email = untriaged.find((e: any) => e.id === eid);
                  if (!email) continue;
                  // Build rich summary with pending decisions and recommendation
                  const richSummary = [
                    r.summary || '',
                    r.pendingDecisions ? `⏳ Pending: ${r.pendingDecisions}` : '',
                    r.actionDetail ? `💡 Recommendation: ${r.actionDetail}` : '',
                  ].filter(Boolean).join('\n');

                  await prisma.email.update({
                    where: { id: email.id },
                    data: {
                      aiSummary: richSummary, aiUrgency: r.urgency, aiCategory: r.category,
                      aiAction: action, aiActionDetail: r.actionDetail,
                      aiDraftReply: r.draftReply || null, northStarAlign: r.northStarAlign,
                    },
                  });
                }
              }
              steps.push(`AI organized ${results.length} threads (${triageCount} emails)`);
            } else {
              console.error('[AUTOPILOT] No JSON in AI response:', content.substring(0, 300));
              steps.push('AI analysis returned no results');
            }
          } else {
            const errText = await aiRes.text();
            console.error('[AUTOPILOT AI ERROR]', aiRes.status, errText.substring(0, 200));
            steps.push('AI analysis failed');
          }
        } catch (aiErr: any) {
          console.error('[AUTOPILOT AI]', aiErr?.message);
          steps.push('AI triage error');
        }
      } else {
        steps.push('AI not configured');
      }
    } else {
      steps.push('All emails already organized');
    }

    // ===== Step 3: EXECUTE actions on IMAP (not just classify) =====
    // This is the key difference: the AI copilot ACTS, not just labels.
    // After this step, spam is in trash, low-priority is archived, only actionable items remain.
    const { imapBatchOperation } = await import('@/lib/imap-helpers');

    // 3a: Mark spam/promotional as read (user reviews in Trash tab, bulk-deletes when ready)
    const toDelete = await prisma.email.updateMany({
      where: { userId, aiAction: 'delete', userAction: null, isRead: false },
      data: { isRead: true },
    });
    const deletedCount = toDelete.count;
    if (deletedCount > 0) {
      steps.push(`🗑️ ${deletedCount} spam/promo → Trash tab (review & bulk delete)`);
    }

    // 3b: ARCHIVE low-priority on IMAP + mark in DB
    const toArchive = await prisma.email.findMany({
      where: { userId, aiAction: 'archive', userAction: null },
      include: { account: true },
    });
    let archivedCount = 0;
    if (toArchive.length > 0) {
      const forImap = toArchive
        .filter((e: any) => e.messageId && e.account)
        .map((e: any) => ({ messageId: e.messageId, folder: e.folder || 'INBOX', account: e.account }));
      if (forImap.length > 0) {
        try {
          const result = await imapBatchOperation(forImap, 'archive');
          console.log(`[AUTOPILOT] IMAP archive: ${result.success} ok, ${result.failed} failed`);
        } catch (err: any) {
          console.error('[AUTOPILOT] IMAP batch archive failed:', err?.message);
        }
      }
      await prisma.email.updateMany({
        where: { id: { in: toArchive.map(e => e.id) }, userId },
        data: { userAction: 'archive', userActionAt: new Date(), isRead: true },
      });
      archivedCount = toArchive.length;
      steps.push(`📦 Archived ${archivedCount} low-priority emails`);
    }

    // 3c: Auto-send replies for auto_reply emails
    // (just mark as handled for now — user reviews drafts before sending)
    const autoReplyEmails = await prisma.email.findMany({
      where: { userId, aiAction: 'auto_reply', userAction: null, isRead: false },
    });
    if (autoReplyEmails.length > 0) {
      await prisma.email.updateMany({
        where: { id: { in: autoReplyEmails.map(e => e.id) }, userId },
        data: { isRead: true },
      });
      steps.push(`✉️ ${autoReplyEmails.length} emails have draft replies ready`);
    }

    // 3d: Auto-create tasks from add_task emails
    const taskEmails = await prisma.email.findMany({
      where: { userId, aiAction: 'add_task', aiActionDetail: { not: null } },
    });
    let tasksCreated = 0;
    for (const te of taskEmails) {
      const taskTitle = te.aiActionDetail || `Follow up: ${te.subject}`;
      const existingTask = await prisma.task.findFirst({ where: { userId, title: taskTitle } });
      if (!existingTask) {
        // Use taskTitle from AI, which may contain a goalId reference
        await prisma.task.create({
          data: {
            userId,
            title: taskTitle,
            pillar: te.aiCategory === 'finance' ? 'wealth' : undefined,
            isNeedleMover: te.aiUrgency === 'critical' || te.aiUrgency === 'high',
            aiUrgency: te.aiUrgency || 'low',
            northStarAlign: te.northStarAlign,
            triageStatus: 'pending',
            sourceEmailId: te.id,
          },
        });
        tasksCreated++;
        await prisma.email.updateMany({ where: { id: te.id, userId }, data: { isRead: true } });
      }
    }
    if (tasksCreated > 0) steps.push(`✅ Created ${tasksCreated} tasks from emails`);

    // 3e: Mark read_later as read
    const readLaterHandled = await prisma.email.updateMany({
      where: { userId, aiAction: 'read_later', isRead: false, userAction: null },
      data: { isRead: true },
    });

    // Step 4: Auto-ingest finance transactions from finance-tagged emails
    try {
      const { ingestFinanceEmails } = await import('@/lib/finance-ingest');
      const ingestResult = await ingestFinanceEmails(userId);
      if (ingestResult.created > 0) {
        steps.push(`💰 Auto-ingested ${ingestResult.created} transactions from emails (${ingestResult.confirmed} confirmed, ${ingestResult.pending} pending review, ${ingestResult.skippedDupes} dupes skipped)`);
      }
    } catch (ingestErr: any) {
      console.error('[AUTOPILOT] Finance ingest error:', ingestErr?.message);
      steps.push('Finance auto-ingest skipped');
    }

    // Get final counts (exclude soft-deleted)
    const [totalEmails, unreadCount, actionNeeded] = await Promise.all([
      prisma.email.count({ where: { userId, OR: [{ userAction: null }, { userAction: { notIn: ['delete', 'spam'] } }] } }),
      prisma.email.count({ where: { userId, isRead: false, OR: [{ userAction: null }, { userAction: { notIn: ['delete', 'spam'] } }] } }),
      prisma.email.count({ where: { userId, aiAction: { in: ['reply_needed', 'add_task'] }, userAction: null } }),
    ]);

    return NextResponse.json({
      success: true,
      newEmails: totalNewEmails,
      triaged: triageCount,
      triageStats,
      markedTrash: deletedCount,
      autoArchived: archivedCount,
      autoHandled: archivedCount,
      tasksCreated,
      steps,
      summary: {
        total: totalEmails,
        unread: unreadCount,
        actionNeeded,
      },
    });
  } catch (e: any) {
    console.error('[AUTOPILOT ERROR]', e);
    if (e?.message === 'UNAUTHORIZED') return handleApiError(e);
    return NextResponse.json({ error: e?.message || 'Autopilot failed' }, { status: 500 });
  }
}