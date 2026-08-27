export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const SGT_OFFSET = 8; // UTC+8

function getSGTDate() {
  const now = new Date();
  const sgt = new Date(now.getTime() + SGT_OFFSET * 60 * 60 * 1000);
  return sgt;
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' });
}

export async function POST(req: Request) {
  try {
    const { type, apiKey } = await req.json();
    
    // Simple auth check - must match our API key
    if (apiKey !== process.env.ABACUSAI_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get the first user (single-user app)
    const user = await prisma.user.findFirst({
      select: { id: true, email: true, name: true }
    });
    if (!user) return NextResponse.json({ error: 'No user found' }, { status: 404 });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (type === 'morning') {
      return await sendMorningBriefing(user, today, tomorrow);
    } else if (type === 'evening') {
      return await sendEveningReflection(user, today, tomorrow);
    }
    
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    console.error('Briefing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function sendMorningBriefing(user: any, today: Date, tomorrow: Date) {
  // Gather data
  const [tasks, habits, goals, transactions, profile, scores] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id, status: { not: 'done' } },
      orderBy: [{ isNeedleMover: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 10,
    }),
    prisma.habit.findMany({
      where: { userId: user.id, isActive: true },
      include: { logs: { where: { date: { gte: today, lt: tomorrow } }, take: 1 } },
    }),
    prisma.goal.findMany({
      where: { userId: user.id, status: 'active' },
      take: 5,
    }),
    prisma.transaction.findMany({
      where: { userId: user.id, date: { gte: new Date(today.getTime() - 7 * 86400000) } },
    }),
    prisma.userProfile.findFirst({ where: { userId: user.id } }),
    prisma.lifeScore.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: 1,
    }),
  ]);

  const needleMovers = tasks.filter(t => t.isNeedleMover);
  const dueSoon = tasks.filter(t => t.dueDate && new Date(t.dueDate) <= tomorrow);
  const pendingHabits = habits.filter(h => h.logs.length === 0);
  const weekSpend = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const latestScore = scores[0];

  const html = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #FAFAF8; padding: 0;">
      <div style="background: #6B8F71; padding: 24px 28px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; font-size: 22px; margin: 0 0 4px;">☀️ Good Morning${user.name ? ', ' + user.name.split(' ')[0] : ''}</h1>
        <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0;">${formatDate(new Date())}</p>
      </div>
      
      <div style="padding: 24px 28px;">
        ${profile?.identity ? `<div style="background: #f0f7f1; padding: 12px 16px; border-radius: 8px; border-left: 3px solid #6B8F71; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 11px; color: #6B8F71; text-transform: uppercase; letter-spacing: 1px;">NORTH STAR</p>
          <p style="margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #1a1a1a;">${profile.identity}</p>
        </div>` : ''}

        ${latestScore ? (() => {
          const wealthAvg = Math.round((latestScore.activeIncome + latestScore.passiveIncome + latestScore.riskManagement + latestScore.personalBudget) / 4);
          const healthAvg = Math.round((latestScore.physical + latestScore.emotional + latestScore.mental + latestScore.spiritual) / 4);
          const relAvg = Math.round((latestScore.partner + latestScore.family + latestScore.friends + latestScore.community) / 4);
          return `<div style="display: flex; gap: 8px; margin-bottom: 20px;">
          <div style="flex: 1; text-align: center; background: white; padding: 12px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: #4ADE80;">💰 ${wealthAvg}/10</p>
            <p style="margin: 2px 0 0; font-size: 10px; color: #888;">Wealth</p>
          </div>
          <div style="flex: 1; text-align: center; background: white; padding: 12px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: #FB923C;">💪 ${healthAvg}/10</p>
            <p style="margin: 2px 0 0; font-size: 10px; color: #888;">Health</p>
          </div>
          <div style="flex: 1; text-align: center; background: white; padding: 12px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: #F472B6;">❤️ ${relAvg}/10</p>
            <p style="margin: 2px 0 0; font-size: 10px; color: #888;">Bonds</p>
          </div>
        </div>`;
        })() : ''}

        ${needleMovers.length > 0 ? `<div style="margin-bottom: 20px;">
          <h3 style="font-size: 13px; color: #6B8F71; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">🎯 Needle Movers</h3>
          ${needleMovers.map(t => `<div style="background: white; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border-left: 3px solid #6B8F71;">
            <span style="font-size: 13px; color: #1a1a1a;">${t.title}</span>
            ${t.dueDate ? `<span style="font-size: 10px; color: #888; margin-left: 8px;">Due ${new Date(t.dueDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })}</span>` : ''}
          </div>`).join('')}
        </div>` : ''}

        ${dueSoon.length > 0 ? `<div style="margin-bottom: 20px;">
          <h3 style="font-size: 13px; color: #dc2626; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">⚡ Due Today</h3>
          ${dueSoon.map(t => `<div style="background: #fef2f2; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px;">
            <span style="font-size: 13px; color: #1a1a1a;">${t.title}</span>
          </div>`).join('')}
        </div>` : ''}

        ${pendingHabits.length > 0 ? `<div style="margin-bottom: 20px;">
          <h3 style="font-size: 13px; color: #6B8F71; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">🔄 Today's Habits (${habits.length - pendingHabits.length}/${habits.length} done)</h3>
          ${pendingHabits.slice(0, 6).map(h => `<span style="display: inline-block; background: white; padding: 6px 12px; border-radius: 16px; font-size: 12px; margin: 0 4px 4px 0; border: 1px solid #e5e5e5;">○ ${h.title}</span>`).join('')}
        </div>` : ''}

        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 13px; color: #6B8F71; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">💰 7-Day Spending</h3>
          <p style="font-size: 20px; font-weight: 700; color: #1a1a1a; margin: 0;">$${weekSpend.toFixed(2)}</p>
        </div>

        ${goals.length > 0 ? `<div style="margin-bottom: 20px;">
          <h3 style="font-size: 13px; color: #6B8F71; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">🏆 Active Goals</h3>
          ${goals.map(g => {
            const pct = Math.min(100, g.progress ?? 0);
            return `<div style="background: white; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; color: #1a1a1a;">${g.title}</span>
                <span style="font-size: 11px; color: #6B8F71; font-weight: 600;">${pct}%</span>
              </div>
              <div style="background: #e5e5e5; height: 4px; border-radius: 2px; margin-top: 6px;">
                <div style="background: #6B8F71; height: 100%; border-radius: 2px; width: ${pct}%;"></div>
              </div>
            </div>`;
          }).join('')}
        </div>` : ''}

        <div style="text-align: center; margin-top: 24px;">
          <a href="${process.env.NEXTAUTH_URL || 'https://life-os.abacusai.app'}" style="display: inline-block; background: #6B8F71; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600;">Open Life OS →</a>
        </div>
      </div>
      
      <div style="padding: 16px 28px; text-align: center; border-top: 1px solid #e5e5e5;">
        <p style="margin: 0; font-size: 11px; color: #aaa;">Your daily briefing from Life OS</p>
      </div>
    </div>
  `;

  // Send email
  const appUrl = process.env.NEXTAUTH_URL || '';
  const appName = 'Life OS';
  
  const response = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deployment_token: process.env.ABACUSAI_API_KEY,
      app_id: process.env.WEB_APP_ID,
      notification_id: process.env.NOTIF_ID_MORNING_BRIEFING,
      subject: `☀️ Morning Briefing — ${formatDate(new Date())}`,
      body: html,
      is_html: true,
      recipient_email: user.email,
      sender_email: appUrl ? `noreply@${new URL(appUrl).hostname}` : undefined,
      sender_alias: appName,
    }),
  });

  const result = await response.json();
  return NextResponse.json({ success: true, type: 'morning', result });
}

async function sendEveningReflection(user: any, today: Date, tomorrow: Date) {
  const [tasks, habits, journal, transactions] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.habit.findMany({
      where: { userId: user.id, isActive: true },
      include: { logs: { where: { date: { gte: today, lt: tomorrow } }, take: 1 } },
    }),
    prisma.journalEntry.findMany({
      where: { userId: user.id, createdAt: { gte: today, lt: tomorrow } },
      take: 1,
    }),
    prisma.transaction.findMany({
      where: { userId: user.id, date: { gte: today, lt: tomorrow } },
    }),
  ]);

  const completedToday = tasks.filter(t => t.status === 'done' && t.updatedAt >= today && t.updatedAt < tomorrow);
  const habitsCompleted = habits.filter(h => h.logs.length > 0);
  const habisPending = habits.filter(h => h.logs.length === 0);
  const hasJournal = journal.length > 0;
  const todaySpend = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const html = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #FAFAF8; padding: 0;">
      <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 24px 28px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; font-size: 22px; margin: 0 0 4px;">🌙 Evening Reflection</h1>
        <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin: 0;">${formatDate(new Date())}</p>
      </div>
      
      <div style="padding: 24px 28px;">
        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
          <div style="flex: 1; text-align: center; background: white; padding: 14px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
            <p style="margin: 0; font-size: 24px; font-weight: 700; color: #6B8F71;">✅ ${completedToday.length}</p>
            <p style="margin: 2px 0 0; font-size: 10px; color: #888;">Tasks Done</p>
          </div>
          <div style="flex: 1; text-align: center; background: white; padding: 14px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
            <p style="margin: 0; font-size: 24px; font-weight: 700; color: ${habitsCompleted.length === habits.length ? '#6B8F71' : '#FB923C'};">${habitsCompleted.length}/${habits.length}</p>
            <p style="margin: 2px 0 0; font-size: 10px; color: #888;">Habits</p>
          </div>
          <div style="flex: 1; text-align: center; background: white; padding: 14px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
            <p style="margin: 0; font-size: 24px; font-weight: 700; color: #1a1a1a;">$${todaySpend.toFixed(0)}</p>
            <p style="margin: 2px 0 0; font-size: 10px; color: #888;">Spent Today</p>
          </div>
        </div>

        ${completedToday.length > 0 ? `<div style="margin-bottom: 20px;">
          <h3 style="font-size: 13px; color: #6B8F71; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">✅ Completed Today</h3>
          ${completedToday.slice(0, 5).map(t => `<div style="padding: 6px 0; font-size: 13px; color: #555; text-decoration: line-through;">${t.title}</div>`).join('')}
          ${completedToday.length > 5 ? `<p style="font-size: 11px; color: #888;">+${completedToday.length - 5} more</p>` : ''}
        </div>` : ''}

        ${habisPending.length > 0 ? `<div style="margin-bottom: 20px; background: #fef3c7; padding: 14px 16px; border-radius: 8px;">
          <h3 style="font-size: 13px; color: #92400e; margin: 0 0 6px;">⚠️ Habits Still Pending</h3>
          ${habisPending.map(h => `<span style="display: inline-block; background: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; margin: 2px 3px; border: 1px solid #fcd34d;">○ ${h.title}</span>`).join('')}
        </div>` : `<div style="margin-bottom: 20px; background: #f0f7f1; padding: 14px 16px; border-radius: 8px;">
          <p style="margin: 0; font-size: 14px; color: #6B8F71; font-weight: 600;">🎉 All habits completed! Perfect day.</p>
        </div>`}

        ${!hasJournal ? `<div style="margin-bottom: 20px; background: #eff6ff; padding: 14px 16px; border-radius: 8px; border-left: 3px solid #3b82f6;">
          <h3 style="font-size: 13px; color: #1e40af; margin: 0 0 4px;">📝 Journal Reminder</h3>
          <p style="font-size: 12px; color: #555; margin: 0;">You haven't journaled today. Even a quick note about your day helps track patterns.</p>
          <a href="${process.env.NEXTAUTH_URL || 'https://life-os.abacusai.app'}" style="display: inline-block; margin-top: 8px; font-size: 12px; color: #3b82f6; text-decoration: none;">Write now →</a>
        </div>` : `<div style="margin-bottom: 20px; background: #f0f7f1; padding: 14px 16px; border-radius: 8px;">
          <p style="margin: 0; font-size: 13px; color: #6B8F71;">📝 Journal entry recorded today ✓</p>
        </div>`}

        <div style="text-align: center; margin-top: 24px;">
          <a href="${process.env.NEXTAUTH_URL || 'https://life-os.abacusai.app'}" style="display: inline-block; background: #1a1a2e; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600;">Review in Life OS →</a>
        </div>
      </div>
      
      <div style="padding: 16px 28px; text-align: center; border-top: 1px solid #e5e5e5;">
        <p style="margin: 0; font-size: 11px; color: #aaa;">Your evening reflection from Life OS</p>
      </div>
    </div>
  `;

  const appUrl = process.env.NEXTAUTH_URL || '';
  
  const response = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deployment_token: process.env.ABACUSAI_API_KEY,
      app_id: process.env.WEB_APP_ID,
      notification_id: process.env.NOTIF_ID_EVENING_REFLECTION,
      subject: `🌙 Evening Reflection — ${formatDate(new Date())}`,
      body: html,
      is_html: true,
      recipient_email: user.email,
      sender_email: appUrl ? `noreply@${new URL(appUrl).hostname}` : undefined,
      sender_alias: 'Life OS',
    }),
  });

  const result = await response.json();
  return NextResponse.json({ success: true, type: 'evening', result });
}
