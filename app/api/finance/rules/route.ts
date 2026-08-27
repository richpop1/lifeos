export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const userId = await requireUserId();
    const rules = await prisma.transactionRule.findMany({
      where: { userId },
      orderBy: { priority: 'desc' },
    });
    return NextResponse.json(rules);
  } catch (e: any) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    // Bulk import mode
    if (body.bulkImport && typeof body.bulkText === 'string') {
      const rules = parseBuxferRules(body.bulkText);
      if (rules.length === 0) {
        return NextResponse.json({ error: 'No rules could be parsed from the input' }, { status: 400 });
      }
      let imported = 0;
      for (const rule of rules) {
        await prisma.transactionRule.create({
          data: { userId, name: rule.name, conditions: rule.conditions, actions: rule.actions, priority: 0 },
        });
        imported++;
      }
      return NextResponse.json({ success: true, imported }, { status: 201 });
    }

    // Single rule creation
    const { name, conditions, actions, priority } = body;
    if (!name || !conditions || !actions) {
      return NextResponse.json({ error: 'name, conditions, actions required' }, { status: 400 });
    }
    const rule = await prisma.transactionRule.create({
      data: { userId, name, conditions, actions, priority: priority || 0 },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (e: any) { return handleApiError(e); }
}

// PATCH update rule
export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { id, name, conditions, actions, priority, isActive } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (conditions !== undefined) data.conditions = conditions;
    if (actions !== undefined) data.actions = actions;
    if (priority !== undefined) data.priority = priority;
    if (isActive !== undefined) data.isActive = isActive;
    const rule = await prisma.transactionRule.updateMany({ where: { id, userId }, data });
    if (rule.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await prisma.transactionRule.delete({ where: { id, userId } });
    return NextResponse.json({ success: true });
  } catch (e: any) { return handleApiError(e); }
}

// Parse Buxfer-style rules text
// Format: each rule is on lines like:
// Description contains phrase<TAB>Mcdonalds
// Add tags<TAB>Food
// OR tab-separated table:
// Description contains phrase\tMcdonalds\tAdd tags\tFood
function parseBuxferRules(text: string): { name: string; conditions: any[]; actions: any[] }[] {
  const rules: { name: string; conditions: any[]; actions: any[] }[] = [];
  const lines = text.trim().split('\n').filter(l => l.trim());

  // Mapping from Buxfer field/operator labels to our internal format
  const FILTER_MAP: Record<string, { field: string; op: string }> = {
    'description contains phrase': { field: 'note', op: 'contains_phrase' },
    'description contains': { field: 'note', op: 'contains' },
    'description equals': { field: 'note', op: 'equals' },
    'description starts with': { field: 'note', op: 'starts_with' },
    'description matches wildcard': { field: 'note', op: 'wildcard' },
    'amount =': { field: 'amount', op: 'equals' },
    'amount >': { field: 'amount', op: 'gt' },
    'amount >=': { field: 'amount', op: 'gte' },
    'amount <': { field: 'amount', op: 'lt' },
    'amount <=': { field: 'amount', op: 'lte' },
    'amount !=': { field: 'amount', op: 'not_equals' },
    'account =': { field: 'account', op: 'equals' },
    'account !=': { field: 'account', op: 'not_equals' },
    'type =': { field: 'type', op: 'equals' },
    'type !=': { field: 'type', op: 'not_equals' },
    'date =': { field: 'date', op: 'equals' },
    'date >': { field: 'date', op: 'gt' },
    'date >=': { field: 'date', op: 'gte' },
    'date <': { field: 'date', op: 'lt' },
    'date <=': { field: 'date', op: 'lte' },
  };

  const ACTION_MAP: Record<string, string> = {
    'add tags': 'tag',
    'set category': 'category',
    'set description': 'set_description',
    'remove words from description': 'remove_words',
    'set type': 'set_type',
    'set status': 'set_status',
    'set transfer source account': 'set_transfer_source',
    'set transfer destination account': 'set_transfer_destination',
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    // Try to parse as a single-line tab-separated rule
    const parts = line.split('\t').map(s => s.trim()).filter(Boolean);
    
    if (parts.length >= 4) {
      // Tab-separated: filter+value pairs then action+value pairs
      const conditions: any[] = [];
      const actions: any[] = [];
      let j = 0;
      while (j < parts.length) {
        const lower = parts[j].toLowerCase();
        // Check if it's a filter
        let matched = false;
        for (const [key, mapping] of Object.entries(FILTER_MAP)) {
          if (lower === key || lower.replace(/\s+/g, ' ') === key) {
            if (j + 1 < parts.length) {
              conditions.push({ field: mapping.field, op: mapping.op, value: parts[j + 1] });
              j += 2;
              matched = true;
              break;
            }
          }
        }
        if (matched) continue;
        // Check if it's an action
        for (const [key, actionType] of Object.entries(ACTION_MAP)) {
          if (lower === key || lower.replace(/\s+/g, ' ') === key) {
            if (j + 1 < parts.length) {
              actions.push({ type: actionType, value: parts[j + 1] });
              j += 2;
              matched = true;
              break;
            }
          }
        }
        if (!matched) j++; // Skip unrecognized parts
      }
      if (conditions.length > 0 && actions.length > 0) {
        const nameVal = conditions[0]?.value || 'Rule';
        rules.push({ name: nameVal.substring(0, 50), conditions, actions });
      }
      i++;
    } else {
      // Multi-line: try to parse a group of filter lines + action lines
      const conditions: any[] = [];
      const actions: any[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (!l) { i++; break; }
        const lower = l.toLowerCase();
        let matched = false;
        // Try filters
        for (const [key, mapping] of Object.entries(FILTER_MAP)) {
          if (lower.startsWith(key)) {
            const val = l.substring(key.length).trim();
            if (val) {
              conditions.push({ field: mapping.field, op: mapping.op, value: val });
              matched = true;
              break;
            }
          }
        }
        if (!matched) {
          // Try actions
          for (const [key, actionType] of Object.entries(ACTION_MAP)) {
            if (lower.startsWith(key)) {
              const val = l.substring(key.length).trim();
              if (val) {
                actions.push({ type: actionType, value: val });
                matched = true;
                break;
              }
            }
          }
        }
        if (!matched && conditions.length > 0 && actions.length > 0) break;
        if (!matched && !conditions.length && !actions.length) { i++; continue; }
        i++;
      }
      if (conditions.length > 0 && actions.length > 0) {
        const nameVal = conditions[0]?.value || 'Rule';
        rules.push({ name: nameVal.substring(0, 50), conditions, actions });
      }
    }
  }
  return rules;
}