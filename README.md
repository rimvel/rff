# Ryanair Flight Finder — beyond direct flights

Finds the cheapest Ryanair connections between two places, including **self-transfer trips with one stop**
that Ryanair's own site won't offer. Search by airport, city, region (e.g. "Spain South") or whole country,
with optional flexible dates and round trips.

Live at Azure Web App `rffapp`.

## How it works

1. **Direct flight**: the cheapest fare on the chosen day.
2. **One stop**: every airport that both ends fly to is tried as a hub. A connection is kept if the wait
   at the hub is between 2 and 12 hours.
3. **Round trips**: each outbound option is paired with the 5 cheapest return options (across all flexible
   return dates) that leave after it lands.

Ryanair's public fare API returns only the **cheapest flight per route per day**, so a connection that would
need a more expensive flight on one leg can be missed.

Times are shown in local time at each airport. Durations account for time zones.

## Project layout

| Path | What it does |
| --- | --- |
| `lib/ryanair.ts` | Calls to Ryanair's API, with caching and a cap of 8 simultaneous requests |
| `lib/finder.ts` | Finds direct and one-stop routes for one airport pair and date |
| `lib/search.ts` | Validates search input, expands flexible dates, builds round trips |
| `lib/time.ts` | Local time ↔ UTC conversion and date helpers |
| `lib/airportGroups.ts` | City / region / country groupings for the airport picker |
| `app/api/search` | `GET /api/search?origin=VNO&dest=BCN,GRO&date=2026-10-15[&returnDate=…&dateRangeDays=3&dateDirection=both|after|before&returnDateRange=…&returnDateDirection=…]` |
| `app/api/airports` | List of active Ryanair airports (cached 24h) |
| `components/` | Search form, airport picker, results |
| `tests/` | Unit tests (Vitest) |

### Limits

To keep one search from sending thousands of requests to Ryanair, a search is limited to ±7 flexible days,
40 airports per side, and 300 airport-pair × date combinations. Results are capped at the 50 cheapest.

## Development

Requires Node.js 20.12 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests
npm run lint
npm run typecheck
```

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
