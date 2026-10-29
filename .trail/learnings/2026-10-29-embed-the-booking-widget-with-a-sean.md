---
title: Embed the booking widget with a script instead of a second app
author: Sean
date: 2026-10-29
branch: main
id: l-9436a2a9
scope: repo
status: active
src: agent
touches:
  - README.md
  - app/robots.txt/route.ts
  - components/admin-scheduling.tsx
  - components/schedule-widget.tsx
  - next.config.ts
---

## Decided
- Keep the full booking site at `/`. Also serve a script the host can drop into a page they already run. The script inserts a frame pointed at `/embed`, which renders the same booking widget.
- The frame stays on this scheduler's origin and books through the existing server action. Hours, bookings, and the calendar stay in the one JSON file on this host.

## Tried and ruled out
- A cross-origin script that calls `POST /api/v1/bookings`: that route requires an agent key, and a browser widget cannot hold one. A new anonymous booking route with CORS would duplicate the public booking action.
- Publishing the booking widget as an npm component for other apps to render inline: it depends on server actions, Next's link component, and this app's styles, so it only renders on this host.

## Watch out
- `/admin` sends `frame-ancestors 'none'`. `/embed` has to stay frameable or the widget will be blank on other sites.
- The widget books on this host. It does not give each outside app its own hours or calendar.

## In the code
- `public/embed.js` reads its own script URL and inserts the frame.
- `app/embed/page.tsx` renders the widget with `embedded`.
- `components/embed-resize.tsx` posts the height to the parent page.
- `next.config.ts` sets the frame headers.
