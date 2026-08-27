// ══════════════════════════════════════════════════════
// TOOL REGISTRY — Definitions + Autonomy Policy
// Sprint 1 scope: tasks, email, journal, goals, finance, calendar, contacts
// Quarantined: gym, habits (except log_habit), insights, AiBatch, ActivityFeed
// ══════════════════════════════════════════════════════

export type AutonomyTier = 'auto' | 'suggest' | 'confirm' | 'block';

export interface ToolParam {
  type: string;
  required: boolean;
  description: string;
  enum?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  params: Record<string, ToolParam>;
  autonomy: AutonomyTier;
  domain: string;
  sideEffects: boolean;
  reversible: boolean;
}

// ═══ EXISTING COMMAND TOOLS (wrapped from command/route.ts) ═══

const TASK_TOOLS: ToolDef[] = [
  { name: 'add_task', description: 'Create a task or reminder', domain: 'tasks', autonomy: 'suggest', sideEffects: true, reversible: true, params: { title: { type: 'string', required: true, description: 'Task title' }, description: { type: 'string', required: false, description: 'Task description' }, dueDate: { type: 'string', required: false, description: 'ISO due date' }, priority: { type: 'string', required: false, description: 'low|medium|high', enum: ['low', 'medium', 'high'] }, isNeedleMover: { type: 'boolean', required: false, description: 'High-impact task' }, pillar: { type: 'string', required: false, description: 'wealth|health|relationship' } } },
  { name: 'edit_task', description: 'Update an existing task', domain: 'tasks', autonomy: 'suggest', sideEffects: true, reversible: true, params: { taskTitle: { type: 'string', required: true, description: 'Task to find (fuzzy match)' }, updates: { type: 'object', required: true, description: 'Fields to update' } } },
  { name: 'resolve_task', description: 'Mark a task as resolved', domain: 'tasks', autonomy: 'confirm', sideEffects: true, reversible: true, params: { taskTitle: { type: 'string', required: true, description: 'Task to resolve' }, resolution: { type: 'string', required: true, description: 'completed|wont_do|delegated|deferred|irrelevant' }, reason: { type: 'string', required: false, description: 'Why' } } },
  { name: 'delete_task', description: 'Permanently delete a task', domain: 'tasks', autonomy: 'confirm', sideEffects: true, reversible: false, params: { taskTitle: { type: 'string', required: true, description: 'Task to delete' } } },
  { name: 'list_tasks', description: 'List tasks with filters', domain: 'tasks', autonomy: 'auto', sideEffects: false, reversible: true, params: { status: { type: 'string', required: false, description: 'todo|in-progress|done' }, limit: { type: 'number', required: false, description: 'Max results' } } },
];

const GOAL_TOOLS: ToolDef[] = [
  { name: 'add_goal', description: 'Create a goal', domain: 'goals', autonomy: 'suggest', sideEffects: true, reversible: true, params: { title: { type: 'string', required: true, description: 'Goal title' }, type: { type: 'string', required: true, description: 'long-term|mid-term|short-term' }, pillar: { type: 'string', required: false, description: 'wealth|health|relationship' } } },
  { name: 'edit_goal', description: 'Update a goal', domain: 'goals', autonomy: 'confirm', sideEffects: true, reversible: true, params: { goalTitle: { type: 'string', required: true, description: 'Goal to update' }, updates: { type: 'object', required: true, description: 'Fields to update' } } },
  { name: 'delete_goal', description: 'Delete a goal', domain: 'goals', autonomy: 'block', sideEffects: true, reversible: false, params: { goalTitle: { type: 'string', required: true, description: 'Goal to delete' } } },
  { name: 'list_goals', description: 'List active goals', domain: 'goals', autonomy: 'auto', sideEffects: false, reversible: true, params: { status: { type: 'string', required: false, description: 'active|completed|archived' } } },
];

const FINANCE_TOOLS: ToolDef[] = [
  { name: 'add_transaction', description: 'Log a financial transaction', domain: 'finance', autonomy: 'confirm', sideEffects: true, reversible: true, params: { amount: { type: 'number', required: true, description: 'Amount' }, category: { type: 'string', required: true, description: 'Category' }, type: { type: 'string', required: true, description: 'expense|income|transfer|refund|investment|iou' }, note: { type: 'string', required: false, description: 'Note' } } },
  { name: 'query_spending', description: 'Query spending', domain: 'finance', autonomy: 'auto', sideEffects: false, reversible: true, params: { question: { type: 'string', required: true, description: 'Spending question' }, period: { type: 'string', required: false, description: 'today|week|month|year' } } },
];

const JOURNAL_TOOLS: ToolDef[] = [
  { name: 'quick_journal', description: 'Save a quick thought/note', domain: 'journal', autonomy: 'suggest', sideEffects: true, reversible: true, params: { note: { type: 'string', required: true, description: 'Journal note' } } },
  { name: 'query_journal', description: 'Search journal entries', domain: 'journal', autonomy: 'auto', sideEffects: false, reversible: true, params: { question: { type: 'string', required: true, description: 'Journal question' } } },
];

const CONTACT_TOOLS: ToolDef[] = [
  { name: 'add_contact', description: 'Add a person to contacts', domain: 'contacts', autonomy: 'suggest', sideEffects: true, reversible: true, params: { name: { type: 'string', required: true, description: 'Contact name' }, relationship: { type: 'string', required: false, description: 'family|close_friend|friend|work|mentor|acquaintance' } } },
  { name: 'edit_contact', description: 'Update a contact', domain: 'contacts', autonomy: 'suggest', sideEffects: true, reversible: true, params: { contactName: { type: 'string', required: true, description: 'Contact to update' }, updates: { type: 'object', required: true, description: 'Fields to update' } } },
  { name: 'add_contact_note', description: 'Add a note to a contact', domain: 'contacts', autonomy: 'suggest', sideEffects: true, reversible: true, params: { contactName: { type: 'string', required: true, description: 'Contact name' }, content: { type: 'string', required: true, description: 'Note content' } } },
  { name: 'query_contacts', description: 'Look up contact info', domain: 'contacts', autonomy: 'auto', sideEffects: false, reversible: true, params: { name: { type: 'string', required: true, description: 'Contact name' } } },
];

const CALENDAR_TOOLS: ToolDef[] = [
  { name: 'add_event', description: 'Create a calendar event', domain: 'calendar', autonomy: 'suggest', sideEffects: true, reversible: true, params: { title: { type: 'string', required: true, description: 'Event title' }, startTime: { type: 'string', required: true, description: 'ISO start time' }, endTime: { type: 'string', required: false, description: 'ISO end time' }, location: { type: 'string', required: false, description: 'Location' } } },
  { name: 'edit_event', description: 'Edit a calendar event', domain: 'calendar', autonomy: 'suggest', sideEffects: true, reversible: true, params: { eventTitle: { type: 'string', required: true, description: 'Event to update' }, updates: { type: 'object', required: true, description: 'Fields to update' } } },
  { name: 'delete_event', description: 'Delete a calendar event', domain: 'calendar', autonomy: 'block', sideEffects: true, reversible: false, params: { eventTitle: { type: 'string', required: true, description: 'Event to delete' } } },
];

const EMAIL_TOOLS: ToolDef[] = [
  { name: 'email_action', description: 'Take action on emails (archive/delete/star/mark_read)', domain: 'email', autonomy: 'suggest', sideEffects: true, reversible: true, params: { action: { type: 'string', required: true, description: 'archive|delete|star|unstar|mark_read', enum: ['archive', 'delete', 'star', 'unstar', 'mark_read'] }, emailSubject: { type: 'string', required: false, description: 'Subject filter' }, emailFrom: { type: 'string', required: false, description: 'From filter' } } },
];

const SETTINGS_TOOLS: ToolDef[] = [
  { name: 'update_scores', description: 'Update life scores (each 1-10)', domain: 'system', autonomy: 'block', sideEffects: true, reversible: true, params: { physical: { type: 'number', required: false, description: '1-10' }, emotional: { type: 'number', required: false, description: '1-10' }, mental: { type: 'number', required: false, description: '1-10' } } },
  { name: 'update_profile', description: 'Update user profile fields', domain: 'system', autonomy: 'block', sideEffects: true, reversible: true, params: { mission: { type: 'string', required: false, description: 'Mission' }, identity: { type: 'string', required: false, description: 'Identity' }, northStar: { type: 'string', required: false, description: 'North star' } } },
  { name: 'update_preference', description: 'Update an AI preference', domain: 'system', autonomy: 'suggest', sideEffects: true, reversible: true, params: { key: { type: 'string', required: true, description: 'Preference key' }, value: { type: 'string', required: true, description: 'Value' } } },
];

const GENERAL_TOOLS: ToolDef[] = [
  { name: 'query_general', description: 'Answer general questions using all data', domain: 'system', autonomy: 'auto', sideEffects: false, reversible: true, params: { question: { type: 'string', required: true, description: 'Question' } } },
];

// ═══ NEW BUTLER-ONLY TOOLS ═══

const BUTLER_TOOLS: ToolDef[] = [
  { name: 'create_loop', description: 'Create an open loop (with dedup check)', domain: 'loops', autonomy: 'auto', sideEffects: true, reversible: true, params: { content: { type: 'string', required: true, description: 'What is unresolved' }, source: { type: 'string', required: true, description: 'capture|email|task|contact|calendar|pattern_engine' }, type: { type: 'string', required: false, description: 'task|thought|decision|followup|raw' }, emotion: { type: 'string', required: false, description: 'anxious|guilty|excited|neutral' }, pillar: { type: 'string', required: false, description: 'wealth|health|relationship' }, urgency: { type: 'string', required: false, description: 'critical|high|medium|low' } } },
  { name: 'update_loop', description: 'Change loop status (pursue/cut/defer/resolve/merge)', domain: 'loops', autonomy: 'auto', sideEffects: true, reversible: true, params: { loopId: { type: 'string', required: true, description: 'Loop ID' }, status: { type: 'string', required: true, description: 'pursued|cut|deferred|resolved|merged', enum: ['pursued', 'cut', 'deferred', 'resolved', 'merged'] }, resolution: { type: 'string', required: false, description: 'How resolved' }, nextStep: { type: 'string', required: false, description: 'Next action' }, wakeDate: { type: 'string', required: false, description: 'ISO date for deferred wake' } } },
  { name: 'list_loops', description: 'Query open loops with filters', domain: 'loops', autonomy: 'auto', sideEffects: false, reversible: true, params: { status: { type: 'string', required: false, description: 'open|pursued|cut|deferred|resolved' }, limit: { type: 'number', required: false, description: 'Max results' } } },
  { name: 'store_memory', description: 'Store a memory about the user', domain: 'memory', autonomy: 'suggest', sideEffects: true, reversible: true, params: { type: { type: 'string', required: true, description: 'profile|episodic|semantic|working' }, key: { type: 'string', required: true, description: 'Namespaced key' }, content: { type: 'string', required: true, description: 'Memory content' }, provenance: { type: 'string', required: false, description: 'Source' } } },
  { name: 'recall_memory', description: 'Retrieve relevant memories', domain: 'memory', autonomy: 'auto', sideEffects: false, reversible: true, params: { type: { type: 'string', required: false, description: 'profile|episodic|semantic|working' }, keyPrefix: { type: 'string', required: false, description: 'Key prefix filter' } } },
  { name: 'create_decision', description: 'Create a 1-3-1 decision (1 problem, 3 options, 1 recommendation)', domain: 'loops', autonomy: 'confirm', sideEffects: true, reversible: true, params: { problem: { type: 'string', required: true, description: 'Decision to make' }, options: { type: 'array', required: true, description: '[{label, pros, cons, effort, risk}] exactly 3' }, recommended: { type: 'number', required: false, description: '0-based index' }, rationale: { type: 'string', required: false, description: 'Why recommended' }, sourceLoopId: { type: 'string', required: false, description: 'Spawning loop ID' } } },
  { name: 'log_event', description: 'Log an audit event', domain: 'system', autonomy: 'auto', sideEffects: true, reversible: true, params: { type: { type: 'string', required: true, description: 'Event type' }, entityType: { type: 'string', required: false, description: 'Entity type' }, entityId: { type: 'string', required: false, description: 'Entity ID' } } },
];

// ═══ REGISTRY ═══

export const TOOL_REGISTRY: Record<string, ToolDef> = {};

for (const tools of [TASK_TOOLS, GOAL_TOOLS, FINANCE_TOOLS, JOURNAL_TOOLS, CONTACT_TOOLS, CALENDAR_TOOLS, EMAIL_TOOLS, SETTINGS_TOOLS, GENERAL_TOOLS, BUTLER_TOOLS]) {
  for (const t of tools) {
    TOOL_REGISTRY[t.name] = t;
  }
}

/** Tool names that are butler-native (not from legacy command executor). */
export const BUTLER_TOOL_NAMES = new Set(BUTLER_TOOLS.map((t) => t.name));

/** Get OpenAI function-calling schemas for LLM. */
export function getToolSchemas(): any[] {
  return Object.values(TOOL_REGISTRY).map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(t.params).map(([k, v]) => [
            k,
            {
              type: v.type === 'array' ? 'array' : v.type === 'object' ? 'object' : v.type === 'number' ? 'number' : v.type === 'boolean' ? 'boolean' : 'string',
              description: v.description,
              ...(v.enum ? { enum: v.enum } : {}),
            },
          ]),
        ),
        required: Object.entries(t.params)
          .filter(([, v]) => v.required)
          .map(([k]) => k),
      },
    },
  }));
}

/** Get autonomy tier for a tool. */
export function getAutonomy(toolName: string): AutonomyTier {
  return TOOL_REGISTRY[toolName]?.autonomy ?? 'block';
}

/** Override email_action autonomy: delete is confirm-tier, others stay suggest. */
export function getEffectiveAutonomy(toolName: string, args: Record<string, any>): AutonomyTier {
  if (toolName === 'email_action' && args?.action === 'delete') return 'confirm';
  return getAutonomy(toolName);
}
