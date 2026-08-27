export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// Tool definitions for image-based commands
const IMAGE_TOOLS = [
  { name: 'log_receipt', desc: 'Extract transaction from receipt image', params: '{amount, category, note, type, date}' },
  { name: 'identify_exercise', desc: 'Identify gym exercise from image and return info', params: '{exerciseName, muscleGroup, instructions}' },
  { name: 'analyze_trade', desc: 'Extract trade/investment data from screenshot', params: '{ticker, type, action, amount, price, notes}' },
  { name: 'read_document', desc: 'Extract and summarize text from any document/image', params: '{summary, keyPoints}' },
  { name: 'analyze_food', desc: 'Estimate nutritional info from food image', params: '{foodName, estimatedCalories, macros, notes}' },
  { name: 'general_vision', desc: 'General image analysis and question answering', params: '{answer}' },
];

async function executeImageTool(userId: string, tool: string, params: any): Promise<{ result: string; tool: string; data?: any }> {
  switch (tool) {
    case 'log_receipt': {
      const txn = await prisma.transaction.create({
        data: {
          userId,
          amount: Math.abs(params.amount || 0),
          type: params.type || 'expense',
          category: params.category || 'General',
          note: params.note || 'From receipt scan',
          date: params.date ? new Date(params.date) : new Date(),
        },
      });
      return { result: `💰 Receipt scanned! Logged ${params.type || 'expense'}: $${txn.amount} for ${txn.category}${txn.note ? ` (${txn.note})` : ''}`, tool: 'add_transaction', data: txn };
    }
    case 'identify_exercise': {
      // Look up exercise in database or return info
      const existing = await prisma.exercise.findFirst({
        where: {
          OR: [{ userId: null }, { userId }],
          name: { contains: params.exerciseName, mode: 'insensitive' },
        },
      });
      const result = existing
        ? `🏋️ **${existing.name}** (${existing.muscleGroup})\n${existing.guide || params.instructions || 'No instructions available.'}\n\nThis exercise is in your library!`
        : `🏋️ **${params.exerciseName}** (${params.muscleGroup})\n${params.instructions}\n\n_Not in your library yet — you can add it from the Gym tab._`;
      return { result, tool: 'identify_exercise', data: { ...params, existingId: existing?.id } };
    }
    case 'analyze_trade': {
      // Check if investment exists
      const inv = await prisma.investment.findFirst({
        where: { userId, ticker: { equals: params.ticker, mode: 'insensitive' } },
      });
      let result = `📈 **${params.ticker?.toUpperCase()}** — ${params.action || 'Trade'}`;
      if (params.price) result += `\nPrice: $${params.price}`;
      if (params.amount) result += `\nAmount: ${params.amount}`;
      if (params.notes) result += `\n${params.notes}`;
      if (inv) result += `\n\n_Found in your portfolio. Update manually in Finance tab._`;
      else result += `\n\n_Not tracked yet. Add it in the Finance > Investments section._`;
      return { result, tool: 'analyze_trade', data: params };
    }
    case 'analyze_food': {
      let result = `🍎 **${params.foodName}**`;
      if (params.estimatedCalories) result += `\nEstimated: ~${params.estimatedCalories} cal`;
      if (params.macros) result += `\n${params.macros}`;
      if (params.notes) result += `\n${params.notes}`;
      return { result, tool: 'analyze_food', data: params };
    }
    case 'read_document': {
      let result = `📄 **Document Summary**\n${params.summary}`;
      if (params.keyPoints) result += `\n\n**Key Points:**\n${Array.isArray(params.keyPoints) ? params.keyPoints.map((p: string) => `• ${p}`).join('\n') : params.keyPoints}`;
      return { result, tool: 'read_document', data: params };
    }
    default: {
      return { result: params.answer || 'I can see the image but couldn\'t determine a specific action.', tool: 'general_vision', data: params };
    }
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { image, text, activeTab } = await req.json();

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Build context hint based on active tab
    let contextHint = '';
    switch (activeTab) {
      case 'gym': contextHint = 'User is on the GYM tab. If image shows exercise equipment or exercise form, identify the exercise. If it shows a gym facility, describe available equipment.'; break;
      case 'finance': contextHint = 'User is on the FINANCE tab. Look for receipts, invoices, bank statements, trade screenshots, or financial documents.'; break;
      case 'home': contextHint = 'User is on the HOME dashboard. Analyze the image for anything that might be actionable — receipts, tasks, food, etc.'; break;
      case 'habits': contextHint = 'User is on the HABITS tab. If the image relates to a habit or routine, provide relevant insights.'; break;
      default: contextHint = `User is on the ${activeTab?.toUpperCase() || 'HOME'} tab.`;
    }

    const systemPrompt = `You are Jarvis, a smart AI butler for a personal Life OS app. The user has sent you an image${text ? ` with the message: "${text}"` : ''}.

${contextHint}

Analyze the image and determine the best action. Available tools:
${IMAGE_TOOLS.map(t => `- ${t.name}: ${t.desc} → ${t.params}`).join('\n')}

Today's date: ${new Date().toISOString().split('T')[0]}

Respond with JSON only: {"tool": "tool_name", "params": {...}}
Be smart about extracting data. For receipts, extract the total amount, vendor/category, and date. For exercises, identify the movement and target muscles. For trades, extract ticker, price, and action.
If nothing specific matches, use general_vision with an "answer" field containing your analysis.`;

    const messages: any[] = [{
      role: 'user',
      content: [
        { type: 'text', text: systemPrompt },
        { type: 'image_url', image_url: { url: image } },
      ],
    }];

    const llmRes = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages,
        max_tokens: 500,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!llmRes.ok) {
      return NextResponse.json({ result: 'Vision AI service unavailable. Try again in a moment.', tool: 'error' });
    }

    const llmData = await llmRes.json();
    const content = llmData?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { tool: 'general_vision', params: { answer: content } }; }

    const { tool, params } = parsed;
    const result = await executeImageTool(userId, tool, params || {});

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
