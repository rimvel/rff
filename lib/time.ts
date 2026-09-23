// Ryanair returns times as local wall-clock time without an offset
// (e.g. "2026-10-15T12:25:00"). These helpers turn them into real instants
// so durations across time zones are correct.

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
    let f = formatters.get(timeZone);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        formatters.set(timeZone, f);
    }
    return f;
}

/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
    const parts: Record<string, number> = {};
    for (const p of getFormatter(timeZone).formatToParts(new Date(utcMs))) {
        if (p.type !== 'literal') parts[p.type] = Number(p.value);
    }
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUtc - utcMs;
}

/** Parse a local "YYYY-MM-DDTHH:mm:ss" string as if it were UTC (no time zone applied). */
function parseWallClock(local: string): number {
    const [date, time = '00:00:00'] = local.split('T');
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi, s = 0] = time.split(':').map(Number);
    return Date.UTC(y, mo - 1, d, h, mi, s);
}

/**
 * Convert a local wall-clock time at `timeZone` into a UTC timestamp (ms).
 * Without a time zone, the wall-clock time is treated as UTC.
 */
export function localToUtcMs(local: string, timeZone?: string): number {
    const wall = parseWallClock(local);
    if (!timeZone) return wall;
    try {
        // Two passes handle instants near DST changes.
        let utc = wall - zoneOffsetMs(wall, timeZone);
        utc = wall - zoneOffsetMs(utc, timeZone);
        return utc;
    } catch {
        return wall; // unknown time zone
    }
}

/** Minutes between two local times, each in its own time zone. */
export function minutesBetween(start: string, startZone: string | undefined, end: string, endZone: string | undefined): number {
    return (localToUtcMs(end, endZone) - localToUtcMs(start, startZone)) / 60000;
}

/** Add days to a "YYYY-MM-DD" date. Pure calendar arithmetic, independent of the server's time zone. */
export function addDays(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Today's date as "YYYY-MM-DD" in the user's own time zone (not UTC). */
export function todayLocal(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
