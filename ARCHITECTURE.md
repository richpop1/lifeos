# Life OS — Architecture & Agent Integration Guide

> **Purpose**: This document describes the complete capability surface of Life OS so that an orchestrator agent (Hermes) can discover, call, and integrate with every feature. It covers the data model, every API route, auth patterns, and the recommended agent integration topology.

## Table of Contents
1. [System Overview](#system-overview)
2. [Tech Stack](#tech-stack)
3. [Data Model](#data-model)
4. [API Surface](#api-surface)
5. [Authentication & Authorization](#authentication--authorization)
6. [Agent Runtime (Butler)](#agent-runtime-butler)
7. [Domain Modules](#domain-modules)
8. [Agent Integration Points](#agent-integration-points)
9. [Environment Variables](#environment-variables)
10. [File Structure](#file-structure)

---

## System Overview

Life OS is an ADHD-optimized personal operating system — a single-page dashboard that manages:
- **Life Scores** (8 pillars: Health, Wealth, Relationships, Career, Growth, Fun, Environment, Mindset)
- **Tasks** (prioritized by urgency/pillar, AI triage)
- **Journal** (conversational AI journaling with flashcard review)
- **Finance** (transactions, budgets, investments, bank statement parsing, email auto-ingest)
- **Habits** (daily tracking with streaks)
- **Goals** (quarterly goals with progress milestones)
- **Calendar** (events, iCal subscriptions, Google Calendar sync)
- **People/CRM** (contacts, groups, interaction tracking, AI greetings)
- **Email/Inbox** (IMAP sync, AI triage, autopilot actions, compose)
- **Gym** (exercises, workout templates, active sessions, personal records, rest timers)
- **Butler** (autonomous agent runtime: memories, open loops, decisions, reflections, daily briefings)
- **Insights** (AI-generated cross-domain observations)

All features are multi-tenant (user_id scoped). The app is mobile-first (max-w-480px centered column).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth.js (credentials + Google SSO) |
| UI | Tailwind CSS + shadcn/ui + Radix primitives + Framer Motion |
| State | React hooks + SWR + Zustand (minimal) |
| LLM | Abacus.AI RouteLLM API (OpenAI-compatible) |
| Storage | AWS S3 (file uploads, profile images) |
| Email | IMAP (read), Abacus notification API (send) |

---

## Data Model

41 Prisma models. Key entity groups:

### Core / Auth
- `User` — id, name, email, hashedPassword, image, role (USER/ADMIN)
- `Account` — OAuth provider links
- `Session` — active sessions
- `VerificationToken` — email verification
- `UserProfile` — extended profile (timezone, preferences JSON, alter ego config)

### Life Scores
- `LifeScore` — userId, pillar (enum: HEALTH/WEALTH/RELATIONSHIPS/CAREER/GROWTH/FUN/ENVIRONMENT/MINDSET), score (Int), note, date

### Tasks
- `Task` — userId, title, description, status (TODO/IN_PROGRESS/DONE/BLOCKED), priority, pillar, urgency, dueDate, energyLevel, estimatedMinutes, completedAt, config (JSON)

### Journal
- `JournalEntry` — userId, title, content, mood, tags[], summary, themes[], date

### Goals
- `Goal` — userId, title, description, pillar, status, targetDate, milestones (JSON), progress (Int 0-100)

### Finance
- `FinanceAccount` — userId, name, type (CASH/BANK/CREDIT_CARD/EWALLET/INVESTMENT/OTHER), currency, balance, institution, lastSynced
- `Transaction` — userId, accountId?, amount, currency, type (INCOME/EXPENSE/TRANSFER), category, description, date, isRecurring, tags[], merchant, source, sourceRef
- `Investment` — userId, accountId?, name, type, currentValue, costBasis, currency, units, pricePerUnit
- `Budget` — userId, category, amount, period, currency
- `TransactionTag` — userId, name, color
- `TransactionRule` — userId, pattern, category, tag, description (auto-categorization rules)

### Habits
- `Habit` — userId, name, description, frequency (DAILY/WEEKLY/MONTHLY), target, unit, color, icon, pillar, streak, bestStreak
- `HabitLog` — habitId, date, value, note

### Calendar
- `CalendarEvent` — userId, title, description, startTime, endTime, location, allDay, recurrence, source, externalId, calendarId, color
- `CalendarSubscription` — userId, name, url, color, enabled, lastSynced

### People/CRM
- `Contact` — userId, name, email, phone, company, role, relationship (FAMILY/CLOSE_FRIEND/FRIEND/ACQUAINTANCE/PROFESSIONAL/OTHER), birthday, notes, lastContacted, contactFrequency, image, tags[], socialLinks (JSON)
- `ContactGroup` — userId, name, color, description
- `ContactNote` — contactId, userId, content, date, type (NOTE/INTERACTION/GIFT_IDEA/MEMORY)

### Email
- `EmailAccount` — userId, email, provider, imapHost/Port, smtpHost/Port, encrypted credentials, lastSynced, syncEnabled, autopilotEnabled
- `Email` — accountId, messageId, threadId, from, to[], cc[], subject, body, snippet, date, isRead, isStarred, labels[], aiCategory, aiSummary, aiPriority

### Gym / Fitness
- `Exercise` — id, name, muscle, equipment, type, userId (null = system-wide), thumbnailUrl
- `ExerciseNote` — exerciseId, userId, content
- `WorkoutTemplate` — userId, name, exercises (JSON: [{exerciseId, exerciseName, sets, reps, weight, duration}])
- `WorkoutSession` — userId, templateId?, name, startedAt, completedAt, duration, volume, notes
- `WorkoutSet` — sessionId, exerciseId, exerciseName, setNumber, weight, reps, duration, completed, isWarmup, supersetGroup
- `PersonalRecord` — userId, exerciseId, exerciseName, type (WEIGHT/REPS/VOLUME/DURATION), value, date

### Butler / Agent Runtime
- `Memory` — userId, content, type (FACT/PREFERENCE/PATTERN/INSIGHT/GOAL/RELATIONSHIP/CONTEXT), source, confidence (Float), tags[], lastAccessed, accessCount, expiresAt, config (JSON)
- `OpenLoop` — userId, title, description, source, status (OPEN/IN_PROGRESS/RESOLVED/DISMISSED), priority, category, resolvedAt, resolution, dueDate, context (JSON)
- `ReflectionSession` — userId, type (DAILY/WEEKLY/MONTHLY/QUARTERLY), summary, insights[], patterns[], suggestions[], scores (JSON), period
- `Decision` — userId, title, description, status (PENDING/APPROVED/REJECTED/EXPIRED), category, options (JSON), recommendation, reasoning, outcome, decidedAt, deadline, impact
- `AgentRun` — userId, trigger, status (RUNNING/COMPLETED/FAILED/CANCELLED), summary, toolsUsed[], tokensUsed, startedAt, completedAt, error, config (JSON)
- `ToolCall` — runId, tool, input (JSON), output (JSON), status, duration, error

### Misc
- `DailyFocus` — userId, date (unique per user+date), top3 (JSON), intention, reflection, score
- `Insight` — userId, content, type, source, tags[], priority, actionable, relatedEntities (JSON), config (JSON)
- `AiBatchAction` — userId, type, status, input/output (JSON)
- `ActivityFeed` — userId, type, title, description, entityType, entityId, metadata (JSON)
- `Event` — userId, type, data (JSON), processedAt

---

## API Surface

All routes are under `/api/`. Auth: NextAuth session (cookie-based). Every route calls `getServerSession(authOptions)` and returns 401 if unauthenticated. User scoping is derived from session, never from request body.

### Auth
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handlers (login, session, providers) |
| `/api/signup` | POST | Register new user (name, email, password) |
| `/api/profile` | GET, PATCH | Read/update user profile |
| `/api/session/heartbeat` | POST | Keep session alive |

### Life Scores
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/scores` | GET, POST | List scores (filterable by pillar/date range) / Create score entry |

### Tasks
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/tasks` | GET, POST | List tasks (with filters) / Create task |
| `/api/tasks/[id]` | GET, PATCH, DELETE | Read/update/delete single task |
| `/api/tasks/ai-prioritize` | POST | AI re-prioritize all open tasks |
| `/api/tasks/triage` | GET, POST | Get/run AI triage on inbox tasks |

### Journal
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/journal` | GET, POST | List entries / Create entry |
| `/api/journal/[id]` | GET, PATCH, DELETE | Read/update/delete entry |
| `/api/journal/[id]/resummarize` | POST | Re-generate AI summary for entry |
| `/api/journal/chat` | POST | Conversational AI journaling (streaming) |
| `/api/journal/summary` | POST | Generate period summary across entries |

### Finance
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/transactions` | GET, POST | List/create transactions |
| `/api/transactions/[id]` | PATCH, DELETE | Update/delete transaction |
| `/api/finance-summary` | GET | Aggregated financial summary (income/expense/net by period) |
| `/api/finance/accounts` | GET, POST | List/create finance accounts |
| `/api/finance/accounts/[id]` | PATCH, DELETE | Update/delete account |
| `/api/finance/accounts/[id]/sync` | POST | Sync account transactions |
| `/api/finance/budgets` | GET, POST, DELETE | CRUD budgets |
| `/api/finance/tags` | GET, POST, DELETE | CRUD transaction tags |
| `/api/finance/rules` | GET, POST, PATCH, DELETE | CRUD auto-categorization rules |
| `/api/finance/import` | POST | Import transactions from CSV/statement |
| `/api/finance/parse-statement` | POST | AI parse bank statement (image/PDF) |
| `/api/finance/auto-ingest` | POST | Auto-ingest transactions from email |
| `/api/finance/auto-link-investments` | POST | AI link transactions to investment accounts |
| `/api/investments` | GET, POST | List/create investments |
| `/api/investments/[id]` | PATCH, DELETE | Update/delete investment |
| `/api/market` | POST | Fetch market data for investments |

### Habits
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/habits` | GET, POST | List/create habits |
| `/api/habits/[id]` | PATCH, DELETE | Update/delete habit |
| `/api/habits/log` | POST | Log habit completion |

### Goals
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/goals` | GET, POST | List/create goals |
| `/api/goals/[id]` | GET, PATCH, DELETE | Read/update/delete goal |
| `/api/goals/progress` | POST | Record progress update |

### Calendar
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/calendar/events` | GET, POST, PATCH, DELETE | Full CRUD on calendar events |
| `/api/calendar/subscriptions` | GET, POST, DELETE | Manage iCal subscriptions |
| `/api/calendar/sync` | POST | Sync all subscriptions now |
| `/api/calendar/feed` | GET | iCal feed export (token-authenticated) |
| `/api/calendar/feed/token` | GET, POST, DELETE | Manage feed access tokens |

### People / CRM
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/contacts` | GET, POST | List/create contacts |
| `/api/contacts/[id]` | GET, PATCH, DELETE | Read/update/delete contact |
| `/api/contacts/[id]/notes` | POST, DELETE | Add/delete contact notes |
| `/api/contacts/[id]/greeting` | POST | AI generate greeting/message for contact |
| `/api/contacts/groups` | GET, POST | List/create contact groups |
| `/api/contacts/groups/[id]` | PATCH, DELETE | Update/delete group |
| `/api/contacts/merge` | POST | Merge duplicate contacts |
| `/api/contacts/email-activity` | POST | Log email interaction with contact |

### Email / Inbox
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/email/accounts` | GET, POST, DELETE | Manage IMAP email accounts |
| `/api/email/list` | GET | List emails (paginated, filterable) |
| `/api/email/[id]` | GET, PATCH, DELETE | Read/update/delete email |
| `/api/email/fetch` | POST | Trigger IMAP sync |
| `/api/email/send` | POST | Send email via SMTP |
| `/api/email/summarize` | POST | AI summarize email thread |
| `/api/email/ai-triage` | POST, DELETE | Run/clear AI triage on inbox |
| `/api/email/autopilot` | POST, DELETE | Run/disable email autopilot |
| `/api/email/bulk` | POST | Bulk email operations (archive, delete, mark read) |
| `/api/email/learned-filters` | GET | List AI-learned email filter rules |

### Gym / Fitness
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/gym/exercises` | GET, POST | List/create exercises |
| `/api/gym/exercises/[id]` | GET, PATCH, DELETE | Read/update/delete exercise |
| `/api/gym/exercises/[id]/notes` | GET, PUT | Read/upsert exercise notes |
| `/api/gym/exercises/[id]/guide` | POST | AI generate exercise form guide |
| `/api/gym/templates` | GET, POST | List/create workout templates |
| `/api/gym/templates/[id]` | PATCH, DELETE | Update/delete template |
| `/api/gym/workouts` | GET, POST | List/create workout sessions |
| `/api/gym/workouts/[id]` | GET, PATCH, DELETE | Read/update/delete session (includes sets) |
| `/api/gym/records` | GET | List personal records |
| `/api/gym/suggest` | POST | AI suggest exercises for a muscle group |
| `/api/gym/suggest-alternative` | POST | AI suggest alternative exercise |

### Butler / Agent
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/butler` | GET | Butler status/config |
| `/api/butler/chat` | POST | Chat with butler (streaming, tool-calling agent) |
| `/api/butler/capture` | POST | Quick capture (butler ingests a thought/note/task) |
| `/api/butler/approve` | POST | Approve/reject a pending decision |
| `/api/butler/memories` | GET, POST | List/create memories |
| `/api/butler/memories/[id]` | GET, PATCH, DELETE | Read/update/delete memory |
| `/api/butler/loops` | GET | List open loops |
| `/api/butler/loops/[id]` | GET, PATCH | Read/update open loop |
| `/api/butler/decisions` | GET | List decisions |
| `/api/butler/decisions/[id]` | GET, PATCH | Read/update decision |
| `/api/butler/runs` | GET | List agent runs |

### Cross-Domain
| Route | Methods | Purpose |
|-------|---------|--------|
| `/api/daily-briefing` | GET, POST | Get/generate daily briefing |
| `/api/briefing` | POST | Generate briefing (daemon/cron endpoint) |
| `/api/daily-focus` | GET, PATCH, POST | Daily focus (top 3 priorities, intention, reflection) |
| `/api/today` | GET | Aggregated "today" view data |
| `/api/insights` | GET, POST | List/create insights |
| `/api/insights/[id]` | PATCH, DELETE | Update/delete insight |
| `/api/ai/learn` | GET, POST, PATCH | AI learning preferences (what to learn, progress) |
| `/api/command` | POST | Natural language command execution |
| `/api/command/image` | POST | AI image generation |
| `/api/upload` | POST | File upload (S3 presigned URL) |

---

## Authentication & Authorization

- **NextAuth.js** with credentials provider (email/password + bcrypt) and Google OAuth.
- Session strategy: JWT.
- All API routes: `getServerSession(authOptions)` → extract `session.user.id` → scope all DB queries by `userId`.
- Middleware (`middleware.ts`): protects all routes except `/login`, `/api/auth/*`, `/api/signup`, `/api/calendar/feed`, public assets.
- Role field exists (`User.role: USER | ADMIN`) but RBAC is minimal — primarily single-user.

### For Agent Integration (Hermes)
The current auth is cookie/session-based (browser). For service-to-service calls, you'll need to add:
1. A `ServiceCredential` model (API key, scoped to a user_id)
2. Bearer token middleware that resolves the key → user_id
3. Scope enforcement per tool/route

See [Agent Integration Points](#agent-integration-points) below.

---

## Agent Runtime (Butler)

The butler is already a tool-calling agent. Key files:

| File | Purpose |
|------|--------|
| `lib/butler/agent.ts` | Core agent loop: receives user message, selects tools, executes, returns |
| `lib/butler/tools.ts` | Tool definitions (name, description, parameters, execute function) |
| `lib/butler/tool-executor.ts` | Executes individual tool calls, logs to ToolCall table |
| `lib/butler/command-executor.ts` | Natural language → structured command resolution |
| `lib/butler/memory.ts` | Memory CRUD + relevance retrieval |
| `lib/butler/events.ts` | Domain event emission |
| `lib/butler/auto-detect.ts` | Auto-detect actionable items from text |
| `lib/butler/dedup.ts` | Deduplication for memories and loops |

### Available Butler Tools
The butler can already: create/update tasks, log habits, add transactions, create calendar events, manage contacts, search memories, create open loops, generate insights, and more — all defined in `lib/butler/tools.ts`.

---

## Domain Modules

### Finance Ingestion Pipeline
- `lib/finance-ingest.ts` — Connects to IMAP, fetches financial emails, uses LLM to extract transactions, deduplicates, writes to DB.
- `lib/transaction-dedup.ts` — Fuzzy matching to prevent duplicate transactions.
- `app/api/email/autopilot/route.ts` — Full email autopilot: triage, auto-respond, auto-file, auto-extract finance.

### Email System
- `lib/imap-helpers.ts` — IMAP connection, fetch, search helpers.
- Email accounts store encrypted IMAP/SMTP credentials.
- AI triage categorizes emails (URGENT/ACTION_REQUIRED/FYI/NEWSLETTER/SPAM/etc).

### LLM Integration
- All LLM calls go through Abacus.AI RouteLLM API (OpenAI-compatible).
- Base URL: `https://apps.abacus.ai/api/v0/chat/completions`
- Model: `claude-sonnet-4-20250514` (or as configured)
- Image generation: same endpoint with `modalities: ["image"]`
- API key: `ABACUSAI_API_KEY` env var

---

## Agent Integration Points

To make Life OS callable by Hermes:

### Topology A: Tool Server (Granular)
Expose each domain operation as a discrete tool:

```
create_task(title, pillar?, priority?, dueDate?) → Task
log_habit(habitId, value, note?) → HabitLog  
add_transaction(amount, type, category, description, date?) → Transaction
create_event(title, startTime, endTime, description?) → CalendarEvent
add_contact(name, email?, relationship?) → Contact
capture_thought(text) → OpenLoop | Task | Memory (auto-detected)
get_daily_briefing() → BriefingSummary
get_finance_summary(period?) → FinanceSummary
search_memories(query, type?) → Memory[]
list_open_loops(status?) → OpenLoop[]
```

Implementation: wrap existing route handlers as typed functions, add Zod schemas, serve via `/api/agent/invoke`.

### Topology B: Sub-Agent (Delegated)
Send a goal, let butler reason:

```
delegate(goal: "Plan my week based on open loops and calendar") → AgentRun
```

This invokes the existing butler agent loop (`lib/butler/agent.ts`), which already has tool-calling capability.

### Recommended New Routes

```
GET  /api/agent/manifest     → Tool catalog with JSON schemas
POST /api/agent/invoke        → {tool, args, idempotency_key} → result
GET  /api/agent/runs/:id      → Async run status/result  
POST /api/agent/delegate      → {goal, context} → run_id
POST /api/agent/events        → Hermes pushes typed events (webhook receiver)
```

### Auth for Agent Calls
Add bearer token auth (new `ServiceCredential` model) alongside existing session auth. Each token scoped to one user_id with explicit tool permissions.

---

## Environment Variables

See `.env.example` for all required variables.

| Variable | Purpose |
|----------|--------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | NextAuth JWT signing secret |
| `NEXTAUTH_URL` | App base URL |
| `ABACUSAI_API_KEY` | LLM API key (RouteLLM) |
| `AWS_BUCKET_NAME` | S3 bucket for file uploads |
| `AWS_REGION` | S3 region |
| `AWS_FOLDER_PREFIX` | S3 key prefix |
| `AWS_PROFILE` | AWS credentials profile |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NOTIF_ID_MORNING_BRIEFING` | Notification type ID for morning briefing |
| `NOTIF_ID_EVENING_REFLECTION` | Notification type ID for evening reflection |
| `WEB_APP_ID` | Abacus app identifier |

---

## File Structure

```
├── app/
│   ├── api/                    # All API routes (see API Surface above)
│   ├── globals.css             # Tailwind + custom styles
│   ├── layout.tsx              # Root layout (providers, fonts, metadata)
│   ├── login/page.tsx          # Login page
│   └── page.tsx                # Main SPA entry (auth-gated dashboard)
├── components/
│   ├── ui/                     # shadcn/ui primitives (40+ components)
│   ├── butler/                 # Butler UI (chat, briefing, open loops, quick capture)
│   ├── gym/                    # Gym sub-components (rest timer, muscle diagram, template editor)
│   ├── layouts/                # Layout primitives (app-shell, page-header, container)
│   ├── dashboard.tsx           # Main dashboard shell (bottom nav, view routing)
│   ├── home-view.tsx           # Home/today dashboard
│   ├── finance-view.tsx        # Finance module UI
│   ├── calendar-view.tsx       # Calendar module UI
│   ├── people-view.tsx         # People/CRM module UI
│   ├── gym-view.tsx            # Gym module UI
│   ├── habits-view.tsx         # Habits module UI
│   ├── goals-view.tsx          # Goals module UI
│   ├── journal-view.tsx        # Journal module UI
│   ├── inbox-view.tsx          # Email inbox UI
│   ├── task-components.tsx     # Task cards and forms
│   ├── settings-view.tsx       # Settings UI
│   └── ...                     # 30+ more component files
├── lib/
│   ├── butler/                 # Agent runtime (tools, memory, events, executor)
│   ├── auth.ts                 # NextAuth config (authOptions)
│   ├── db.ts                   # Prisma client singleton
│   ├── prisma.ts               # Prisma client (alternative export)
│   ├── finance-ingest.ts       # Email → transaction pipeline
│   ├── imap-helpers.ts         # IMAP connection helpers
│   ├── s3.ts                   # S3 upload/presigned URL helpers
│   ├── types.ts                # Shared TypeScript types
│   └── utils.ts                # Utility functions (cn, formatters)
├── prisma/
│   └── schema.prisma           # Complete data model (41 models, 912 lines)
├── types/
│   └── next-auth.d.ts          # NextAuth type extensions
├── middleware.ts                # Auth middleware (route protection)
├── tailwind.config.ts          # Tailwind config (sage green theme)
├── tsconfig.json               # TypeScript config
└── postcss.config.js           # PostCSS config
```

---

## Design Language

- **Theme**: Sage green (#6B8F71) primary, warm off-white (#FAFAF8) background
- **Layout**: Mobile-first, max-w-480px centered column, persistent bottom nav
- **Typography**: `font-display` for headings, system sans-serif for body
- **Cards**: `.game-card` class (rounded-xl, shadow, hover effects)
- **ADHD-friendly**: Generous whitespace, clear visual hierarchy, dopamine-driven gamification elements
