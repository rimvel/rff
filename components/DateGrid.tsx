'use client';

import { useEffect, useState } from 'react';
import type { DateGrid as Grid } from '@/lib/calendar';
import { holidayOn, schoolBreakOn, timeOff } from '@/lib/lithuania';
import { SearchRequest } from '@/lib/searchUrl';
import { localToUtcMs } from '@/lib/time';
import { useToday } from '@/lib/useUrl';

function weekdayOf(date: string): string {
    return new Date(localToUtcMs(date)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

function dayMonth(date: string): string {
    return new Date(localToUtcMs(date)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

interface DateGridProps {
    request: SearchRequest & { returnDate: string };
    onPick: (date: string, returnDate: string) => void;
}

/** Cheapest round trip for departure days (rows) x return days (columns) around the chosen dates. */
export default function DateGrid({ request, onPick }: DateGridProps) {
    const today = useToday();
    const key = `${request.origin}|${request.dest}|${request.date}|${request.returnDate}`;
    const [loaded, setLoaded] = useState<{ key: string; grid: Grid | null } | null>(null);
    const grid = loaded?.key === key ? loaded.grid : undefined; // undefined while loading

    useEffect(() => {
        const controller = new AbortController();
        // Give up after 30 s; a cancel because the grid changed or closed is not a failure
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, 30_000);
        const params = new URLSearchParams({ origin: request.origin, dest: request.dest, date: request.date, returnDate: request.returnDate });
        fetch(`/api/calendar/grid?${params}`, { signal: controller.signal })
            .then(res => (res.ok ? res.json() : null))
            .then((data: Grid | null) => setLoaded({ key, grid: data }))
            .catch(() => {
                if (timedOut || !controller.signal.aborted) setLoaded({ key, grid: null });
            })
            .finally(() => clearTimeout(timeout));
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [key, request.origin, request.dest, request.date, request.returnDate]);

    if (grid === undefined) return <p className="cal-note">Loading prices…</p>;
    if (grid === null) return <p className="cal-note">Prices couldn&apos;t be loaded.</p>;

    // Highlight roughly the cheapest quarter of the trips
    const all = grid.prices.flat().filter((p): p is number => p !== null).sort((a, b) => a - b);
    const cheapLimit = all.length ? all[Math.floor((all.length - 1) / 4)] : 0;

    return (
        <>
            <div className="date-grid-scroll">
                <table className="date-grid">
                    <thead>
                        <tr>
                            <th className="dg-corner" scope="col">
                                <span>Back →</span>
                                <span>Out ↓</span>
                            </th>
                            {grid.returns.map(ret => (
                                <th
                                    key={ret}
                                    scope="col"
                                    className={`${ret === request.returnDate ? 'dg-current' : ''} ${holidayOn(ret) ? 'dg-holiday' : ''} ${schoolBreakOn(ret) ? 'dg-school' : ''}`}
                                    title={[holidayOn(ret), schoolBreakOn(ret)?.name].filter(Boolean).join(' · ') || undefined}
                                >
                                    <span className="dg-weekday">{weekdayOf(ret)}</span>
                                    {dayMonth(ret)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {grid.departures.map((dep, i) => (
                            <tr key={dep}>
                                <th
                                    scope="row"
                                    className={`${dep === request.date ? 'dg-current' : ''} ${holidayOn(dep) ? 'dg-holiday' : ''} ${schoolBreakOn(dep) ? 'dg-school' : ''}`}
                                    title={[holidayOn(dep), schoolBreakOn(dep)?.name].filter(Boolean).join(' · ') || undefined}
                                >
                                    <span className="dg-weekday">{weekdayOf(dep)}</span>
                                    {dayMonth(dep)}
                                </th>
                                {grid.returns.map((ret, j) => {
                                    const price = grid.prices[i][j];
                                    const past = !!today && dep < today;
                                    const usable = price !== null && !past;
                                    // Time off for the trip (Lithuania): leave days, and school a pupil would miss
                                    const off = timeOff(dep, ret);
                                    const leave = off.leaveDays.length;
                                    const school = off.schoolDays.length;
                                    const classes = [
                                        'dg-cell',
                                        usable ? '' : 'dg-empty',
                                        usable && price <= cheapLimit ? 'dg-cheap' : '',
                                        dep === request.date && ret === request.returnDate ? 'dg-selected' : '',
                                    ].join(' ');
                                    return (
                                        <td key={ret}>
                                            <button
                                                type="button"
                                                className={classes}
                                                disabled={!usable}
                                                onClick={() => onPick(dep, ret)}
                                                title={usable
                                                    ? `${dayMonth(dep)} – ${dayMonth(ret)}: from €${price.toFixed(2)} · ${leave === 0 ? 'no leave days' : `${leave} leave day${leave === 1 ? '' : 's'}`}${school ? ` · misses ${school} school day${school === 1 ? '' : 's'}` : ''}`
                                                    : 'No round trip'}
                                            >
                                                {usable ? `€${Math.round(price)}` : '–'}
                                                {usable && (
                                                    <span className={`dg-leave ${school ? 'school' : ''}`}>{leave === 0 ? 'free' : `${leave}d`}</span>
                                                )}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="cal-note">
                Cheapest round trip for each pair of dates{grid.includesConnections ? ', direct or with one stop' : ' (direct flights only)'}.
                Under each price: leave days needed (Mon–Fri, not Lithuanian public holidays); orange means a pupil would miss
                school. Pick a cell to search those dates.
            </p>
        </>
    );
}
