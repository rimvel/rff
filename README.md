# RFF — cheap flights, beyond direct

RFF finds the cheapest Ryanair flights, including **one-stop trips on separate tickets that Ryanair's own site
won't offer**. Search by airport, city, country or a group such as "Canary Islands", "South of Europe" or
"Ski & Alps", with flexible dates, round trips, price calendars and an "Anywhere" search.

**Live at https://rff.fvcloud.eu** (Azure Web App `rffapp`, also at https://rffapp.azurewebsites.net).

> Unofficial: not affiliated with or endorsed by Ryanair DAC. Fares come from Ryanair's public website.

## Documentation

| Guide | For | What's in it |
|---|---|---|
| [User guide](docs/USER_GUIDE.md) | Anyone using the site | Searching, destination groups, dates, reading results and labels, booking, filters, Anywhere and the map, calendars, holiday windows, saved routes, phone tips, limits, problems |
| [How it works](docs/HOW_IT_WORKS.md) | Developers | Architecture, Ryanair data, the search algorithm, streaming, caches and limits, API reference, page address and storage, project layout, tests |
| [Maintenance](docs/MAINTENANCE.md) | The site owner | Releasing, checking and rolling back, recurring jobs (school holidays data, security updates, Node.js), common changes, when Ryanair changes something |
| [Azure](AZURE.md) | The site owner | How the app runs on Azure, deploys, logs and troubleshooting |

## Features

- **Direct and one-stop trips**, including changing airports within a city (e.g. land at Luton, fly on from
  Stansted), with warnings for tight, long and overnight connections.
- **Round trips** that can come back via another airport in the same city or to another home airport nearby.
- **Many airports at once**: cities, countries and ready-made groups.
- **Flexible dates** up to ±7 days, a **price calendar** and a round-trip **date grid**.
- **Anywhere**: the cheapest places to fly to, as a list or on a map.
- **Compact results** with Book buttons that open the trip on ryanair.com; 20 at a time with "Show more".
- **Sort and filter** in the browser; the whole search lives in the page address, so links can be shared.
- **Lithuanian holiday windows**: long weekends and school breaks with the leave days needed.
- **Saved routes**, recent searches, quick-start buttons, dark mode that follows the device, and an installable app.

## Development

Requires Node.js 24.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests
npm run lint
npm run typecheck
npm run build
```

Every pull request runs lint, type check, tests, a security audit and a build. Merging to `main` deploys to
Azure automatically and waits until `/api/health` shows the new version. See [Maintenance](docs/MAINTENANCE.md)
for releasing and rolling back.
