---
title: Scheduler state lives in a JSON file on the app server
author: Sean
date: 2026-10-29
branch: main
id: l-15749173
scope: repo
status: active
src: agent
touches:
  - ".env.example"
  - README.md
  - app/.well-known/agent-skills/index.json/route.ts
  - app/.well-known/ai-catalog.json/route.ts
  - app/.well-known/api-catalog/route.ts
  - app/actions/scheduling-actions.ts
  - app/openapi.json/route.ts
  - app/sitemap.xml/route.ts
  - lib/agent-keys.ts
  - lib/google-calendar.ts
---

## Decided
- Keep hours, bookings, agent key hashes, and the Google refresh token in one JSON file the Next.js server reads and writes. The default path is `data/scheduler.json`. `SCHEDULER_DATA_FILE` overrides it.
- Keep rate limits in process memory. Each limit covers about a minute, so it does not need to survive a restart.
- Serialize writes inside the one Node process, and write the file with mode 600 because it holds the refresh token.

## Tried and ruled out
- Supabase: a single host does not need a hosted database, and provisioning one was the setup step people had to get right.
- SQLite: still a database engine for a file that is one host's settings and bookings.
- Memory only: bookings and the refresh token would disappear every time the process restarted.

## Watch out
- Run one Node process against that file. A second instance, or a host whose disk is wiped between requests, will not share the bookings or the refresh token.
- Rows that already lived in Supabase are not copied. Sign in again and save hours.

## In the code
- `lib/local-store.ts` owns the file and the in-process lock.
- `lib/scheduling-store.ts`, `lib/agent-keys.ts`, and `lib/rate-limit.ts` are the callers.
