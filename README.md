# Open Scheduler

A single-host meeting page. Visitors pick a time. The host signs in with Google, which also connects Google Calendar. Agents can read the same open times, hold a slot, and finish a booking only after a person confirms or a host-issued key allows it.

## What you need

- Node.js 22 or newer
- A Google Cloud OAuth client (Web application)
- A [Resend](https://resend.com) account and a verified sending domain, if the host should get an email when someone books

## Setup

1. Install dependencies.

   ```sh
   npm install
   ```

2. Copy the environment file and fill it in.

   ```sh
   cp .env.example .env.local
   ```

   | Variable | Purpose |
   | --- | --- |
   | `NEXT_PUBLIC_BASE_URL` | Public origin, with no trailing slash. Locally this is `http://localhost:3000`. |
   | `SCHEDULER_DATA_FILE` | Optional path to the JSON file that stores hours, bookings, agent keys, and the Google refresh token. Defaults to `data/scheduler.json`. |
   | `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client id |
   | `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret |
   | `SCHEDULER_ADMIN_EMAILS` | Comma-separated Google accounts allowed to administer the scheduler |
   | `SCHEDULER_SECRET` | Long random string. Signs the admin session, cancel links, and hold links. |
   | `SCHEDULER_FROM_EMAIL` | Resend from address, such as `Meetings <meetings@example.com>` |
   | `SCHEDULER_HOST_EMAIL` | Inbox that receives the booking notice |
   | `RESEND_API_KEY` | Resend API key. If this or either email address is missing, the booking still succeeds and the notice is skipped. |
   | `SCHEDULER_WEBHOOK_URL` | Optional URL that receives `booking.confirmed` and `booking.cancelled` |
   | `SCHEDULER_WEBHOOK_SECRET` | HMAC secret for the `X-Scheduler-Signature` header |

   There is no admin password.

3. In Google Cloud, add this authorized redirect URI:

   `{NEXT_PUBLIC_BASE_URL}/api/google/calendar/callback`

   Request the calendar scopes plus `openid`, `email`, and `profile`. Keep `access_type=offline`. The app already does that.

4. Start the app.

   ```sh
   npm run dev
   ```

5. Open `/admin` and sign in with a Google account listed in `SCHEDULER_ADMIN_EMAILS`. That sign-in is also the calendar connection. Set weekly hours and save them.

Hours, bookings, agent key hashes, and the Google refresh token are written to `data/scheduler.json` (or `SCHEDULER_DATA_FILE`). The file is created on the first save. It is gitignored. Run one Node process against that file. A second instance, or a serverless host with a temporary disk, will not share it.

Open times stay hidden until Calendar is connected. If the Google consent screen is left in Testing, the refresh token expires after 7 days and you need to sign in again. Publish the consent screen when the scheduler should keep working.

Signing out clears the session only. Disconnecting the calendar is a separate button and deletes the refresh token.

## On a page you already have

`/` is the full booking site. To put the same widget on a site you already run, add this where it should appear. Use the origin from `NEXT_PUBLIC_BASE_URL`. The signed-in admin page shows the snippet with that origin filled in.

```html
<div data-open-scheduler></div>
<script src="https://your-host.example/embed.js" async></script>
```

`embed.js` is served by this app. It inserts a frame pointed at `/embed` on this host, so the widget uses the hours and calendar already configured here. The element fires `open-scheduler:booked` when a meeting is booked. `data-height` sets the frame height, in pixels, before the first measurement.

A custom element works the same way:

```html
<script src="https://your-host.example/embed.js" async></script>
<open-scheduler></open-scheduler>
```

## For agents

Anonymous callers can read availability and place a five-minute hold. Creating the meeting takes the human confirm page, or an agent key with the `book` scope.

Mint a key on `/admin` after you are signed in. The secret is shown once. `book` can finish a meeting. `manage` can list and cancel bookings. The key is not the admin session and it cannot read the Google token.

Discovery:

- `/llms.txt`
- `/openapi.json`
- `/.well-known/api-catalog`
- `/mcp` (Streamable HTTP)
- `/.well-known/mcp/server-card.json`
- `/skills/booking`

A client config:

```json
{
  "mcpServers": {
    "open-scheduler": {
      "url": "https://your-host.example/mcp"
    }
  }
}
```

Send `Authorization: Bearer osk_...` when calling `book_meeting` or `list_bookings`.

The agent sequence is: read capabilities, show the human the open times, hold only the slot they pick, send them `confirmUrl`, and keep the cancel URL. Do not invent a time. `POST /api/v1/bookings` also requires `Idempotency-Key` and `"guestConfirmed": true`. A replay of that key returns the original booking.

`GET /` with `Accept: text/markdown` returns the current slots as markdown. An `Accept` value that allows neither HTML nor markdown receives `406`.

If `SCHEDULER_WEBHOOK_URL` and `SCHEDULER_WEBHOOK_SECRET` are both set, confirm and cancel POST a JSON event. The body is signed with hex HMAC-SHA256 in `X-Scheduler-Signature`. The event id stays the same if the sender retries.

## License

MIT. See [LICENSE](LICENSE).
