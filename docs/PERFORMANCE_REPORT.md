# Performance Report

**Status: no load or performance testing has been performed yet.** There is no staging environment
and no production access in this session, so no measured numbers exist. This report records the
design decisions that affect performance and the tests still required.

## Design measures in place
* Background work fans out to one request per workspace (pg_net), so one slow business can't stall others.
* Work queues (automation events, social posts, WhatsApp inbox) are claimed atomically with partial
  indexes on the "pending/due" rows; batches are bounded (20 automations, 5 posts per run).
* RLS helper functions are `stable security definer` lookups on indexed membership rows.
* New indexes: due-event/post indexes, normalised-phone contact index, workspace/time indexes on
  shifts, attendance, events.
* Rate limits on every public endpoint protect the database from floods.
* Website chat polling is 5 s per open widget — the main load driver at scale (see below).

## Known scaling risks
| Risk | When it bites | Mitigation |
|---|---|---|
| Webchat polling | Hundreds of concurrent open widgets | Move to Supabase Realtime broadcast or SSE |
| Inbox list queries without pagination limits in some pages | Workspaces with >50k conversations | Keyset pagination |
| `workspace_usage` counts rows on each limited insert | Very high write rates | Switch to counters (usage_counters) |
| pg_net fan-out every 5 min | >1,000 active workspaces | Shard by minute or move to a queue service |

## Tests still required (Phase 9)
1. k6 load test of webhook ingestion (target: 50 msg/s sustained, p95 < 500 ms) on staging.
2. Inbox page load with 100k conversations (p95 < 1.5 s).
3. Background job duration per workspace (target < 30 s) with 200 test workspaces.
