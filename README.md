# RFF — cheap flights, beyond direct

Finds the cheapest Ryanair connections between two places, including **self-transfer trips with one stop**
that Ryanair's own site won't offer. Search by airport, city, region (e.g. "Spain South") or whole country,
with optional flexible dates and round trips.

Live at Azure Web App `rffapp`.

> Unofficial: not affiliated with or endorsed by Ryanair DAC. Fares come from Ryanair's public website.

## How it works

Fares come from Ryanair's "cheapest per day" endpoint, which returns a whole month for a route in one
request, so flexible dates cost almost nothing extra. Results stream to the page as they're found: direct
flights first (about 0.2 s), then connections. Flight numbers are looked up afterwards for the cheapest results.

1. **Direct flight**: the cheapest fare on the chosen day.
2. **One stop**: every airport that both ends fly to is tried as a hub. A connection is kept if the wait
   at the hub is between 2 and 12 hours.
3. **Round trips**: each outbound option is paired with the 5 cheapest return options (across all flexible
   return dates) that leave after it lands.

**Anywhere**: choose "🌍 Anywhere" as the destination to list the cheapest places to fly to from the
chosen airport(s), direct or with one stop, one row per destination (the cheapest option, plus the cheapest
direct one when different). It asks Ryanair for every destination from the origin, then every destination
from each of those airports, on each day. For round trips, return flights are looked up for the 40 cheapest
destinations. Limits: up to 5 origin airports and 15 origin × day combinations.

**Changing airports during a connection**: one-stop trips can also land at one airport and fly on from another
in the same city (e.g. Vilnius → Luton, coach to Stansted, Stansted → Lisbon). The minimum time between flights
is then 2 h plus the transfer time. These are badged "Airport change" and hidden by "Same airport only". They
cost a few extra requests per search (about 5–20%). Not yet used for "Anywhere" or the price calendar.

**Different airports on the way back**: when you select several airports (e.g. all of London), a round trip
can fly back from another airport in the same city (out to Stansted, back from Luton), and land at another of
your home airports within 200 km (out of Vilnius, back to Kaunas). Same-city airport groups and transfer
times are in `lib/mixedAirports.ts`. These trips are badged, never "booked as one trip", and hidden by the
"Same airport only" filter. They need no extra requests to Ryanair.

Ryanair's public fare API returns only the **cheapest flight per route per day**, so a connection that would
need a more expensive flight on one leg can be missed.

Times are shown in local time at each airport. Durations account for time zones.

Each result shows the total price, then a timeline per direction (flights, layover length) with layover
badges: **Tight** (under 2 h 30 min, risky with separate tickets), **Long** (over 8 h), **Overnight**, and
**Self-transfer** (separate tickets: bags and check-in again). A summary line gives the cheapest price, the
fastest trip and the cheapest direct option. When nothing is found, the page suggests flexible dates, nearby
airports (within 250 km), a one-way search or "Anywhere".

Results can be sorted (cheapest, fastest, earliest) and filtered (direct only, maximum layover, maximum price)
in the browser. The search, sorting and filters are kept in the page address, so a link such as
`/?from=VNO&to=BCN,GRO,REU&date=2026-11-13&return=2026-11-20&returnFlex=2&sort=fastest` can be shared or
bookmarked, and Back/Forward work. The last 5 searches are remembered in the browser (localStorage).

## Project layout

| Path | What it does |
| --- | --- |
| `lib/ryanair.ts` | Calls to Ryanair's API, with caching and a cap of 8 simultaneous requests |
| `lib/finder.ts` | Finds direct and one-stop routes for one airport pair and date |
| `lib/search.ts` | Validates search input, expands flexible dates, builds round trips |
| `lib/time.ts` | Local time ↔ UTC conversion and date helpers |
| `lib/anywhere.ts` | "Anywhere" search: cheapest destinations from an airport |
| `lib/mixedAirports.ts` | Airports in the same city, transfer times, and which return airports are allowed |
| `lib/calendar.ts` | Cheapest price per day for a month (the price calendar) |
| `lib/events.ts` | Messages streamed from the search API to the page |
| `lib/airportGroups.ts` | City / region / country groupings for the airport picker |
| `lib/searchUrl.ts` | Search and result-view settings ↔ page address |
| `lib/resultFilters.ts` | Sorting, filtering and the summary line |
| `lib/layoverRisk.ts` | Layover badges (tight, long, overnight) |
| `lib/suggestions.ts` | Suggestions when a search finds nothing |
| `lib/format.ts` | Durations, times, days and prices for display |
| `lib/recentSearches.ts` | Recent searches stored in the browser |
| `app/api/search` | Streams results as newline-separated JSON (see `lib/events.ts`). `GET /api/search?origin=VNO&dest=BCN,GRO&date=2026-10-15[&returnDate=…&dateRangeDays=3&dateDirection=both|after|before&returnDateRange=…&returnDateDirection=…]` |
| `app/api/calendar` | `GET /api/calendar?origin=VNO&dest=BCN&month=2026-11` → cheapest price per day |
| `app/api/airports` | List of active Ryanair airports (cached 24h) |
| `components/` | Search form, airport picker, results |
| `tests/` | Unit tests (Vitest) |

### Limits

To keep one search from sending thousands of requests to Ryanair, a search is limited to ±7 flexible days,
40 airports per side, and 300 airport-pair × date combinations. Results are capped at the 200 cheapest; the page shows 50 at a time.

## Development

Requires Node.js 20.12 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests
npm run lint
npm run typecheck
```

### Link previews

Shared links show a title, description and image (Open Graph / Twitter cards). A shared search gets its own
title, e.g. "Vilnius → Barcelona · 20 Nov | RFF". Preview links use `https://rffapp.azurewebsites.net`;
set the `SITE_URL` environment variable if the site moves to another address.

## Deployment

Every push to `main` runs lint, type check, tests and a security audit. If they pass, the app is built and
deployed to Azure (`.github/workflows/main_rffapp.yml`). Pull requests run the same checks without deploying
(`.github/workflows/checks.yml`).

See `DEPLOY_TO_AZURE.md` and `AZURE_TROUBLESHOOTING.md` for Azure setup.

### Rolling back

To undo a merged pull request, open it on GitHub, click **Revert**, then merge the pull request GitHub creates.
Merging goes through `main`, so the previous version is redeployed automatically.

Tags such as `stable-2026-09-23` mark known-good versions. Deploys must run from `main`, because Azure's login
trusts only that branch. To restore a tag's code, bring it back onto `main` (for example
`git checkout stable-2026-09-23 -- .` then commit and push). Don't run the workflow on the tag directly.
