/**
 * Command executor — extracted from app/api/command/route.ts.
 * Pure function: no HTTP req/res, no auth. Takes userId + tool + params, returns result.
 * Both /api/command (legacy) and the butler agent call this.
 */
import { prisma } from '@/lib/prisma';

export interface CommandResult {
  result: string;
  data?: any;
  action?: string;
}

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

export function fmtTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' });
}

export async function findTask(userId: string, title: string) {
  return prisma.task.findFirst({
    where: { userId, status: { not: 'done' }, title: { contains: title, mode: 'insensitive' } },
  });
}

export async function findGoal(userId: string, title: string) {
  return prisma.goal.findFirst({
    where: { userId, status: 'active', title: { contains: title, mode: 'insensitive' } },
  });
}

export async function findHabit(userId: string, title: string) {
  return prisma.habit.findFirst({
    where: { userId, isActive: true, title: { contains: title, mode: 'insensitive' } },
  });
}

export async function findContact(userId: string, name: string) {
  return prisma.contact.findFirst({
    where: { userId, isArchived: false, OR: [{ name: { contains: name, mode: 'insensitive' } }, { nickname: { contains: name, mode: 'insensitive' } }] },
  });
}

export async function findEvent(userId: string, title: string) {
  return prisma.calendarEvent.findFirst({
    where: { userId, source: 'manual', title: { contains: title, mode: 'insensitive' } },
    orderBy: { startTime: 'desc' },
  });
}

export async function askLLM(prompt: string): Promise<string> {
  try {
    const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-5.4-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 300, temperature: 0.3 }),
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || 'Could not generate answer.';
  } catch {
    return 'AI service unavailable.';
  }
}

export async function executeCommand(userId: string, tool: string, params: any): Promise<CommandResult> {
  switch (tool) {
    // ── Tasks ──
    case 'add_task': {
      const task = await prisma.task.create({
        data: {
          userId, title: params.title, description: params.description || null,
          priority: params.priority || 'medium', dueDate: params.dueDate ? new Date(params.dueDate) : null,
          isNeedleMover: params.isNeedleMover || false, goalId: params.goalId || null,
          pillar: params.pillar || null, status: 'todo',
        },
      });
      return { result: `Task created: "${task.title}"${task.dueDate ? ` (due ${fmtDate(task.dueDate)})` : ''}${task.isNeedleMover ? ' \u2B50 Needle mover' : ''}`, data: task, action: 'created' };
    }
    case 'edit_task': {
      const task = await findTask(userId, params.taskTitle);
      if (!task) return { result: `Couldn't find task "${params.taskTitle}".` };
      const u = params.updates || {};
      const data: any = {};
      if (u.title !== undefined) data.title = u.title;
      if (u.priority !== undefined) data.priority = u.priority;
      if (u.dueDate !== undefined) data.dueDate = u.dueDate ? new Date(u.dueDate) : null;
      if (u.status !== undefined) {
        data.status = u.status;
        if (u.status === 'done') { data.scheduledStartTime = null; data.scheduledEndTime = null; data.resolution = 'completed'; data.resolvedAt = new Date(); }
      }
      if (u.description !== undefined) data.description = u.description;
      if (u.goalId !== undefined) data.goalId = u.goalId || null;
      if (u.pillar !== undefined) data.pillar = u.pillar;
      if (u.isNeedleMover !== undefined) data.isNeedleMover = u.isNeedleMover;
      if (u.scheduledStartTime !== undefined) data.scheduledStartTime = u.scheduledStartTime ? new Date(u.scheduledStartTime) : null;
      if (u.scheduledEndTime !== undefined) data.scheduledEndTime = u.scheduledEndTime ? new Date(u.scheduledEndTime) : null;
      if (u.estimatedMins !== undefined) data.estimatedMins = parseInt(u.estimatedMins);
      if (u.notes !== undefined) data.notes = u.notes;
      const updated = await prisma.task.update({ where: { id: task.id }, data });
      const changes = Object.keys(data).filter(k => !['scheduledStartTime', 'scheduledEndTime', 'resolution', 'resolvedAt'].includes(k)).join(', ');
      return { result: `Updated "${updated.title}": ${changes}`, data: updated, action: 'updated' };
    }
    case 'resolve_task': {
      const task = await findTask(userId, params.taskTitle);
      if (!task) return { result: `Couldn't find task "${params.taskTitle}".` };
      const updateData: any = { resolution: params.resolution, resolvedAt: new Date() };
      if (params.reason) updateData.resolvedReason = params.reason;
      if (params.delegatedTo) updateData.delegatedTo = params.delegatedTo;
      if (['completed', 'wont_do', 'irrelevant'].includes(params.resolution)) { updateData.status = 'done'; updateData.scheduledStartTime = null; updateData.scheduledEndTime = null; }
      if (params.resolution === 'deferred') updateData.status = 'todo';
      await prisma.task.update({ where: { id: task.id }, data: updateData });
      const labels: Record<string, string> = { completed: '\u2705 Completed', wont_do: '\u23ED\uFE0F Won\'t do', delegated: '\uD83E\uDD1D Delegated', deferred: '\u23F8\uFE0F Deferred', irrelevant: '\uD83D\uDDD1\uFE0F Irrelevant' };
      return { result: `${labels[params.resolution] || params.resolution}: "${task.title}"${params.reason ? ` \u2014 ${params.reason}` : ''}`, action: 'resolved' };
    }
    case 'delete_task': {
      const task = await findTask(userId, params.taskTitle);
      if (!task) return { result: `Couldn't find task "${params.taskTitle}".` };
      await prisma.task.delete({ where: { id: task.id } });
      return { result: `Deleted task: "${task.title}"`, action: 'deleted' };
    }
    case 'list_tasks': {
      const where: any = { userId };
      if (params.status) where.status = params.status;
      if (params.priority) where.priority = params.priority;
      if (params.goalId) where.goalId = params.goalId;
      const tasks = await prisma.task.findMany({
        where, orderBy: [{ isNeedleMover: 'desc' }, { priority: 'asc' }],
        take: params.limit || 10, include: { goal: { select: { title: true } } },
      });
      if (tasks.length === 0) return { result: 'No tasks found.' };
      const list = tasks.map((t: any) => `${t.isNeedleMover ? '\u2B50 ' : ''}${t.title} [${t.priority}]${t.goal ? ` \u2192 ${t.goal.title}` : ''}${t.dueDate ? ` (due ${fmtDate(t.dueDate)})` : ''}`).join('\n');
      return { result: `**${tasks.length} tasks:**\n${list}`, data: tasks };
    }

    // ── Goals ──
    case 'add_goal': {
      const goal = await prisma.goal.create({
        data: { userId, title: params.title, description: params.description || null, type: params.type || 'short-term', pillar: params.pillar || null, targetDate: params.targetDate ? new Date(params.targetDate) : null, weight: params.weight || 5, target: params.target ? parseFloat(params.target) : null, unit: params.unit || null },
      });
      return { result: `Goal created: "${goal.title}" (${goal.type})${goal.pillar ? ` [${goal.pillar}]` : ''}`, data: goal, action: 'created' };
    }
    case 'edit_goal': {
      const goal = await findGoal(userId, params.goalTitle);
      if (!goal) return { result: `Couldn't find goal "${params.goalTitle}".` };
      const u = params.updates || {};
      const data: any = {};
      for (const key of ['title', 'description', 'type', 'pillar', 'status', 'weight', 'unit']) { if (u[key] !== undefined) data[key] = u[key]; }
      if (u.progress !== undefined) data.progress = parseInt(u.progress);
      if (u.targetDate !== undefined) data.targetDate = u.targetDate ? new Date(u.targetDate) : null;
      if (u.target !== undefined) data.target = parseFloat(u.target);
      if (u.current !== undefined) data.current = parseFloat(u.current);
      const updated = await prisma.goal.update({ where: { id: goal.id }, data });
      return { result: `Updated goal: "${updated.title}"`, data: updated, action: 'updated' };
    }
    case 'delete_goal': {
      const goal = await findGoal(userId, params.goalTitle);
      if (!goal) return { result: `Couldn't find goal "${params.goalTitle}".` };
      await prisma.goal.delete({ where: { id: goal.id } });
      return { result: `Deleted goal: "${goal.title}"`, action: 'deleted' };
    }
    case 'list_goals': {
      const goals = await prisma.goal.findMany({
        where: { userId, status: params.status || 'active' }, orderBy: { weight: 'desc' },
        include: { _count: { select: { tasks: { where: { status: { not: 'done' } } } } } },
      });
      if (goals.length === 0) return { result: 'No active goals.' };
      const list = goals.map((g: any) => `• ${g.title} (${g.progress}%) [${g.pillar || 'general'}] — ${g._count.tasks} open tasks`).join('\n');
      return { result: `**${goals.length} goals:**\n${list}`, data: goals };
    }

    // ── Habits ──
    case 'add_habit': {
      const habit = await prisma.habit.create({
        data: { userId, title: params.title, description: params.description || null, pillar: params.pillar || null, frequency: params.frequency || 'daily', customDays: params.customDays || null, targetTime: params.targetTime || null, icon: params.icon || null, color: params.color || null, goalId: params.goalId || null },
      });
      return { result: `Habit created: "${habit.title}" (${habit.frequency})`, data: habit, action: 'created' };
    }
    case 'edit_habit': {
      const habit = await findHabit(userId, params.habitTitle);
      if (!habit) return { result: `Couldn't find habit "${params.habitTitle}".` };
      const u = params.updates || {};
      const data: any = {};
      for (const key of ['title', 'description', 'pillar', 'frequency', 'customDays', 'targetTime', 'icon', 'color', 'isActive', 'goalId']) { if (u[key] !== undefined) data[key] = u[key]; }
      const updated = await prisma.habit.update({ where: { id: habit.id }, data });
      return { result: `Updated habit: "${updated.title}"`, data: updated, action: 'updated' };
    }
    case 'log_habit': {
      const habit = await findHabit(userId, params.habitTitle);
      if (!habit) {
        const all = await prisma.habit.findMany({ where: { userId, isActive: true }, select: { title: true } });
        return { result: `Couldn't find "${params.habitTitle}". Active habits: ${all.map(h => h.title).join(', ')}` };
      }
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const existing = await prisma.habitLog.findFirst({ where: { habitId: habit.id, date: { gte: today } } });
      if (existing) return { result: `"${habit.title}" already logged today \u2705` };
      await prisma.habitLog.create({ data: { habitId: habit.id, date: new Date() } });
      return { result: `Logged "${habit.title}" \u2705`, action: 'logged' };
    }
    case 'delete_habit': {
      const habit = await findHabit(userId, params.habitTitle);
      if (!habit) return { result: `Couldn't find habit "${params.habitTitle}".` };
      await prisma.habit.delete({ where: { id: habit.id } });
      return { result: `Deleted habit: "${habit.title}"`, action: 'deleted' };
    }

    // ── Finance ──
    case 'add_transaction': {
      const txn = await prisma.transaction.create({
        data: { userId, amount: Math.abs(params.amount || 0), type: params.type || 'expense', investmentType: params.type === 'investment' ? params.investmentType : null, category: params.category || 'General', note: params.note || '', tags: params.tags || null, date: params.date ? new Date(params.date) : new Date(), accountId: params.accountId || null },
      });
      return { result: `Logged ${params.type || 'expense'}: $${txn.amount} for ${txn.category}${txn.note ? ` (${txn.note})` : ''}`, data: txn, action: 'created' };
    }
    case 'query_spending': {
      const now = new Date();
      let start: Date;
      switch (params.period) {
        case 'today': start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
        case 'week': start = new Date(now.getTime() - 7 * 86400000); break;
        case 'year': start = new Date(now.getFullYear(), 0, 1); break;
        default: start = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      const where: any = { userId, date: { gte: start }, type: 'expense' };
      if (params.category) where.category = { contains: params.category, mode: 'insensitive' };
      const txns = await prisma.transaction.findMany({ where, orderBy: { date: 'desc' }, take: 50 });
      const total = txns.reduce((s: number, t: any) => s + t.amount, 0);
      const byCategory = txns.reduce((acc: Record<string, number>, t: any) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc; }, {});
      const breakdown = Object.entries(byCategory).sort(([, a], [, b]) => (b as number) - (a as number)).map(([c, v]) => `${c}: $${(v as number).toFixed(0)}`).join(', ');
      return { result: `Total spent (${params.period || 'this month'}): $${total.toFixed(2)}${breakdown ? `\nBreakdown: ${breakdown}` : ''}`, data: { total, byCategory } };
    }

    // ── Journal ──
    case 'quick_journal': {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      let entry = await prisma.journalEntry.findFirst({ where: { userId, date: { gte: todayStart } }, orderBy: { date: 'desc' } });
      if (entry) {
        const msgs = Array.isArray(entry.chatMessages) ? entry.chatMessages as any[] : [];
        msgs.push({ role: 'user', content: params.note }, { role: 'assistant', content: 'Noted.' });
        await prisma.journalEntry.update({ where: { id: entry.id }, data: { chatMessages: msgs as any } });
        return { result: `Added to today's journal: "${params.note}"`, action: 'updated' };
      }
      entry = await prisma.journalEntry.create({
        data: { userId, sessionType: 'evening', moodStart: 'neutral', responses: [], chatMessages: [{ role: 'user', content: params.note }, { role: 'assistant', content: 'Noted.' }] as any, date: new Date() },
      });
      return { result: `Journal note saved: "${params.note}"`, action: 'created' };
    }
    case 'query_journal': {
      const entries = await prisma.journalEntry.findMany({
        where: { userId }, orderBy: { date: 'desc' }, take: 10,
        select: { date: true, dayTitle: true, razorSummary: true, focusItem: true, signal: true, moodStart: true, moodEnd: true, energy: true },
      });
      const ctx = entries.map((e: any) => `${fmtDate(e.date)}: ${e.dayTitle || '-'} | ${e.razorSummary || '-'} | Focus: ${e.focusItem || '-'} | Signal: ${e.signal || '-'} | Mood: ${e.moodStart}\u2192${e.moodEnd}`).join('\n');
      const answer = await askLLM(`Based on these journal entries, answer: "${params.question}"\n\nEntries:\n${ctx}\n\nDirect, concise answer.`);
      return { result: answer };
    }

    // ── Contacts ──
    case 'add_contact': {
      const contact = await prisma.contact.create({
        data: { userId, name: params.name, email: params.email || null, phone: params.phone || null, company: params.company || null, role: params.role || null, relationship: params.relationship || 'acquaintance', birthday: params.birthday || null, howWeMet: params.howWeMet || null, interests: params.interests || null, catchUpFrequency: params.catchUpFrequency || null },
      });
      return { result: `Contact added: ${contact.name} (${contact.relationship})`, data: contact, action: 'created' };
    }
    case 'edit_contact': {
      const contact = await findContact(userId, params.contactName);
      if (!contact) return { result: `Couldn't find "${params.contactName}" in contacts.` };
      const u = params.updates || {};
      const data: any = {};
      for (const key of ['name', 'email', 'phone', 'company', 'role', 'relationship', 'birthday', 'howWeMet', 'interests', 'catchUpFrequency', 'isFavorite']) { if (u[key] !== undefined) data[key] = u[key]; }
      const updated = await prisma.contact.update({ where: { id: contact.id }, data });
      return { result: `Updated ${updated.name}`, data: updated, action: 'updated' };
    }
    case 'add_contact_note': {
      const contact = await findContact(userId, params.contactName);
      if (!contact) return { result: `Couldn't find "${params.contactName}" in contacts.` };
      await prisma.contactNote.create({ data: { contactId: contact.id, content: params.content, type: params.type || 'note' } });
      await prisma.contact.update({ where: { id: contact.id }, data: { lastContactedAt: new Date() } });
      return { result: `Note added to ${contact.name}: "${params.content.slice(0, 80)}"`, action: 'created' };
    }
    case 'query_contacts': {
      const contact = await findContact(userId, params.name);
      if (!contact) return { result: `No contact found for "${params.name}".` };
      const notes = await prisma.contactNote.findMany({ where: { contactId: contact.id }, orderBy: { date: 'desc' }, take: 5 });
      const lastContact = contact.lastContactedAt ? `Last: ${fmtDate(contact.lastContactedAt)}` : 'Never contacted';
      const noteList = notes.map((n: any) => `- ${n.content}`).join('\n') || 'No notes';
      return { result: `**${contact.name}** (${contact.relationship})\n${contact.email || ''}${contact.phone ? ` | ${contact.phone}` : ''}\n${lastContact}\n\nRecent notes:\n${noteList}` };
    }

    // ── Calendar ──
    case 'add_event': {
      const event = await prisma.calendarEvent.create({
        data: { userId, title: params.title, startTime: new Date(params.startTime), endTime: params.endTime ? new Date(params.endTime) : null, location: params.location || null, allDay: params.allDay || false, color: params.color || null, source: 'manual' },
      });
      const timeStr = params.allDay ? 'all day' : fmtTime(event.startTime);
      return { result: `Event: "${event.title}" on ${fmtDate(event.startTime)} at ${timeStr}${params.location ? ` @ ${params.location}` : ''}`, data: event, action: 'created' };
    }
    case 'edit_event': {
      const event = await findEvent(userId, params.eventTitle);
      if (!event) return { result: `Couldn't find event "${params.eventTitle}".` };
      const u = params.updates || {};
      const data: any = {};
      if (u.title !== undefined) data.title = u.title;
      if (u.startTime !== undefined) data.startTime = new Date(u.startTime);
      if (u.endTime !== undefined) data.endTime = u.endTime ? new Date(u.endTime) : null;
      if (u.location !== undefined) data.location = u.location;
      if (u.allDay !== undefined) data.allDay = u.allDay;
      if (u.color !== undefined) data.color = u.color;
      const updated = await prisma.calendarEvent.update({ where: { id: event.id }, data });
      return { result: `Updated event: "${updated.title}"`, data: updated, action: 'updated' };
    }
    case 'delete_event': {
      const event = await findEvent(userId, params.eventTitle);
      if (!event) return { result: `Couldn't find event "${params.eventTitle}".` };
      await prisma.calendarEvent.delete({ where: { id: event.id } });
      return { result: `Deleted event: "${event.title}"`, action: 'deleted' };
    }

    // ── Life Scores ──
    case 'update_scores': {
      const scoreData: any = { userId, date: new Date() };
      const fields = ['activeIncome', 'passiveIncome', 'riskManagement', 'personalBudget', 'physical', 'emotional', 'mental', 'spiritual', 'partner', 'family', 'friends', 'community'];
      for (const f of fields) { if (params[f] !== undefined) scoreData[f] = Math.min(10, Math.max(1, parseInt(params[f]))); }
      if (params.note) scoreData.note = params.note;
      const score = await prisma.lifeScore.create({ data: scoreData });
      return { result: `Life scores updated${params.note ? `: "${params.note}"` : ''}`, data: score, action: 'created' };
    }

    // ── Settings ──
    case 'update_preference': {
      const profile = await prisma.userProfile.findUnique({ where: { userId } });
      const prefs = (profile?.aiPreferences || {}) as Record<string, any>;
      prefs[params.key] = params.value;
      await prisma.userProfile.upsert({ where: { userId }, update: { aiPreferences: prefs }, create: { userId, aiPreferences: prefs } });
      return { result: `Preference: ${params.key} \u2192 ${JSON.stringify(params.value)}`, action: 'updated' };
    }
    case 'update_profile': {
      const data: any = {};
      for (const key of ['mission', 'identity', 'alterEgoName', 'alterEgoDescription', 'alterEgoMantra', 'northStar']) { if (params[key] !== undefined) data[key] = params[key]; }
      await prisma.userProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
      const changed = Object.keys(data).join(', ');
      return { result: `Profile updated: ${changed}`, action: 'updated' };
    }

    // ── Email ──
    case 'email_action': {
      const where: any = { userId, userAction: null };
      if (params.emailSubject) where.subject = { contains: params.emailSubject, mode: 'insensitive' };
      if (params.emailFrom) where.fromAddress = { contains: params.emailFrom, mode: 'insensitive' };
      const emails = await prisma.email.findMany({ where, take: params.count || 10, orderBy: { date: 'desc' } });
      if (emails.length === 0) return { result: 'No matching emails found.' };
      const actionMap: Record<string, any> = {
        archive: { userAction: 'archive', userActionAt: new Date(), isRead: true },
        delete: { userAction: 'delete', userActionAt: new Date() },
        star: { isStarred: true }, unstar: { isStarred: false }, mark_read: { isRead: true },
      };
      const update = actionMap[params.action];
      if (!update) return { result: `Unknown action: ${params.action}` };
      await prisma.email.updateMany({ where: { id: { in: emails.map((e: any) => e.id) } }, data: update });
      return { result: `${params.action} applied to ${emails.length} email(s)`, action: params.action };
    }

    // ── General ──
    case 'query_general': {
      const [profile, score, goals, tasks, habits] = await Promise.all([
        prisma.userProfile.findUnique({ where: { userId } }),
        prisma.lifeScore.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
        prisma.goal.findMany({ where: { userId, status: 'active' }, take: 10 }),
        prisma.task.findMany({ where: { userId, status: { not: 'done' } }, take: 15, orderBy: { dueDate: 'asc' } }),
        prisma.habit.findMany({ where: { userId, isActive: true }, include: { logs: { where: { date: { gte: new Date(Date.now() - 7 * 86400000) } } } } }),
      ]);
      const ctx = `Goals: ${goals.map((g: any) => `${g.title} (${g.progress}%)`).join(', ') || 'None'}
Tasks: ${tasks.filter((t: any) => t.dueDate).map((t: any) => `${t.title} (${fmtDate(t.dueDate!)})`).join(', ') || 'None'}
Habits (7d): ${habits.map((h: any) => `${h.title}: ${(h as any).logs?.length || 0}/7`).join(', ') || 'None'}
North Star: ${(profile as any)?.northStar || 'Not set'}`;
      const answer = await askLLM(`${ctx}\n\nAnswer: "${params.question}"\nBe direct and actionable. 2-3 sentences.`);
      return { result: answer };
    }

    default:
      return { result: 'Unknown command: ' + tool };
  }
}
