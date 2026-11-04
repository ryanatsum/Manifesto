# EOS Hub: Plan

Working name: **EOS Hub**. One place for the leadership team's Rocks, Scorecard, Headlines, Core Values (and the rest of the V/TO), Issues and To-Dos. Every capability is available both in the web app and to AI agents (Claude, etc.) through an MCP server.

Status: planning. A front-end-only prototype lives in `eos-app/prototype/index.html`. Use it to react to screens and to the draft data model before we build the backend.

---

## 1. Goals

1. **Single source of truth** for EOS data. No more spreading things across ClickUp lists, spreadsheets and slides.
2. **Runs the weekly L10.** The app should hold the agenda and pull in the Scorecard, Rocks, Headlines, To-Dos and Issues as the meeting goes.
3. **MCP-native.** Anything a person can do in the UI, an agent can do through MCP, for example: "log this as an issue", "what's off track?", "prep my L10", "record this week's numbers".
4. **Small and fast.** One leadership team to start, more teams later.

### Not in v1
- Accountability Chart editing (we store people and seats; no org-chart UI yet)
- People Analyzer, quarterly conversations, process documentation
- Native mobile apps (the web app must still work on a phone)
- Billing or multi-company SaaS

---

## 2. Core concepts and data model (draft)

These are the entities the prototype puts on screen. Field lists are a starting point for review. Every table also has `id`, `org_id`, `created_at`, `updated_at`, `created_by` and `source` (`web` | `mcp` | `import`), so we always know whether a person or an agent made a change.

| Entity | Key fields | Notes |
|---|---|---|
| **Organization** | name, timezone, week_starts_on, l10_day_time | One for now. |
| **Team** | name, kind (`leadership` \| `departmental`) | Rocks, issues and to-dos all belong to a team. |
| **Person** | name, email, avatar, role/seat, team_ids | Owns rocks, measurables, to-dos and issues. |
| **Quarter** | year, q (1–4), starts_on, ends_on | Rocks belong to a quarter. Week numbers derive from it. |
| **Rock** | title, description, owner_id, team_id, quarter_id, type (`company` \| `individual`), status (`on_track` \| `off_track` \| `done` \| `not_done`), due_on, parent_rock_id? | 3–7 per person per quarter. |
| **Milestone** | rock_id, title, due_on, done_at | Optional checklist under a rock. |
| **Measurable** | name, owner_id, team_id, unit (`count` \| `currency` \| `percent` \| `number`), goal_value, goal_op (`>=` \| `<=` \| `=` \| `between`), goal_max?, cadence (`weekly` \| `monthly`), sort_order, archived | One row on the Scorecard. |
| **MeasurableEntry** | measurable_id, period_start (week), value, note | A cell on the Scorecard. Green or red is computed from the goal, not stored. |
| **Headline** | team_id, author_id, kind (`customer` \| `employee` \| `general`), sentiment (`good` \| `bad` \| `neutral`), text, meeting_id? | Shared in the L10; can be dropped into Issues. |
| **CoreValue** | name, description, examples[], sort_order | Part of the V/TO. |
| **VTO** | core_focus {purpose, niche}, ten_year_target, marketing_strategy {target_market, uniques[], proven_process, guarantee}, three_year_picture, one_year_plan | One document per org. Stored as structured JSON with version history. |
| **Issue** | title, description, team_id, owner_id, list (`short_term` \| `long_term`), priority (1–3 or null), status (`open` \| `solved` \| `dropped`), resolution, solved_at, solved_in_meeting_id?, linked (rock/measurable/headline/todo ids) | Ranked within a team. "Top 3" is the priority field. |
| **Todo** | title, owner_id, team_id, due_on (default +7 days), done_at, issue_id?, meeting_id? | Seven-day commitments. Completion rate is computed. |
| **Meeting (L10)** | team_id, scheduled_at, started_at, ended_at, segment_times {}, attendees[], ratings {person_id: 1–10}, cascading_messages[] | Holds a record of each meeting. |
| **ActivityLog** | entity_type, entity_id, action, diff, actor_id, source | Audit trail. Also feeds "what changed since last L10?" |

Relationships that matter:
- Issue → creates Todo(s) when solved (IDS).
- Rock or Measurable off track → "Drop to Issues" creates a linked Issue.
- Headline → can become an Issue.
- Meeting → records which issues were solved and which to-dos were created in it.

### Data questions to settle using the prototype
1. Do individual rocks roll up to company rocks (`parent_rock_id`), or are they flat?
2. Do we need departmental teams in v1, or only the leadership team?
3. Is the Scorecard weekly only, or do we also need monthly/quarterly measurables?
4. Do Issues need a separate owner from the person who raised them?
5. How much of the V/TO do we want structured versus free text?
6. Do we keep to-dos in ClickUp and sync them, or move them over fully? (The current `eos-issue-action-capture` skill writes Issues and To-Dos to ClickUp.)

---

## 3. Architecture

```
               ┌──────────────┐        ┌─────────────────────┐
  Browser ───▶ │  Web app     │        │  MCP server         │ ◀── Claude / agents
               │  (Next.js)   │        │  (Streamable HTTP,  │
               └──────┬───────┘        │   OAuth 2.1)        │
                      │                └─────────┬───────────┘
                      ▼                          ▼
               ┌──────────────────────────────────────────┐
               │  Domain service layer (TypeScript)       │
               │  rocks · scorecard · issues · todos ·    │
               │  headlines · vto · meetings · activity   │
               └──────────────────┬───────────────────────┘
                                  ▼
                           Postgres (+ Drizzle)
```

- **One service layer, two front doors.** The web app's API routes and the MCP tools call the same functions, so validation and permissions are identical and nothing drifts.
- **Stack (proposed):** TypeScript; Next.js for UI and API; Postgres (Supabase or Neon); Drizzle ORM; Zod schemas shared by the API and the MCP tool input schemas; `@modelcontextprotocol/sdk` for the MCP server.
- **Auth:** Google Workspace sign-in for people. The MCP server uses OAuth 2.1 so a Claude connector can sign in as the person, and every agent action is attributed to that person with `source = mcp`.
- **Hosting:** Vercel (web) plus the same deployment exposing `/mcp`, or a small separate Node service if we want the MCP server to scale on its own.
- **Real-time:** Optional for v1. Polling is fine at first; later, Postgres listen/notify or Supabase Realtime so the L10 screen updates live when someone adds an issue from Claude.

---

## 4. MCP surface (draft)

Names follow `verb_noun`. All list tools accept `team`, `owner` and `quarter` filters and return compact JSON.

**Read**
- `get_l10_snapshot(team)`: everything for this week's meeting in one call (scorecard with red/green, rock statuses, open to-dos, headlines, ranked issues)
- `list_rocks(quarter?, owner?, status?)`
- `get_scorecard(weeks=13, owner?)`
- `list_issues(list=short_term, status=open)`
- `list_todos(owner?, include_done=false)`
- `list_headlines(since?)`
- `get_vto()` / `get_core_values()`
- `search(query)`: across all entities

**Write**
- `create_rock`, `update_rock` (status, title, due), `add_milestone`, `complete_milestone`
- `record_measurable(measurable, week, value, note?)` and `record_measurables_bulk`
- `create_issue(title, description?, owner?, list?, links?)`, `prioritize_issues(ordered_ids)`, `solve_issue(id, resolution, todos?[])`, `move_issue(id, list)`
- `create_todo(title, owner, due_on?, issue_id?)`, `complete_todo(id)`
- `add_headline(text, kind, sentiment)`, `headline_to_issue(id)`
- `start_meeting`, `rate_meeting`, `end_meeting(cascading_messages?)`

**Resources** (read-only context an agent can attach)
- `eos://vto`, `eos://core-values`, `eos://scorecard/current`, `eos://rocks/current-quarter`

**Prompts** (reusable workflows)
- `prep_l10`: summarize what's red, what's off track, overdue to-dos and suggested top 3 issues
- `capture_from_transcript`: pull issues, to-dos and headlines out of meeting notes (Granola, Fireflies) and confirm before writing
- `quarterly_rock_review`: grade rocks done/not done and draft next quarter's

Rules for agent writes:
- Writes that change many records at once (bulk scorecard entries, solving issues) return a preview first. The agent confirms with the person before committing.
- Deletes are soft deletes only through MCP.

---

## 5. Build phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Prototype** (now) | Clickable front end with example data | Team agrees on screens and data model; open questions in §2 answered |
| **1. Foundation** | Schema, migrations, service layer, auth, seed data | CRUD for all entities through the API, with tests |
| **2. Web app** | Rocks, Scorecard, Issues, To-Dos, Headlines, Core Values/V/TO screens | Leadership team uses it for one real L10 |
| **3. MCP server** | Read tools, then write tools, then resources and prompts; OAuth | Claude can prep an L10 and log issues/to-dos end to end |
| **4. L10 mode** | Meeting runner with timers, ratings, cascading messages, meeting history | Two consecutive L10s run fully in the app |
| **5. Import and polish** | ClickUp import, CSV import for scorecard history, activity feed, notifications | ClickUp lists retired (or synced) |

---

## 6. Risks and decisions

- **Scope creep into a full EOS suite.** Keep v1 to the six areas in the brief plus the L10 runner.
- **Agent write safety.** Confirmation previews and attribution are part of every write tool from day one.
- **Duplicate systems during the move from ClickUp.** Pick a cut-over date and do a one-time import instead of a long two-way sync if possible.
- **Trademark.** "EOS" and "Level 10 Meeting" are EOS Worldwide trademarks. Fine for an internal tool; choose a different name if we ever sell it.
