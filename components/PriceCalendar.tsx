'use client';

import { useEffect, useState } from 'react';
import type { PriceCalendar as Calendar } from '@/lib/calendar';
import { SearchRequest } from '@/lib/searchUrl';
import { expandDates, localToUtcMs } from '@/lib/time';
import { useToday } from '@/lib/useUrl';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function shiftMonth(month: string, by: number): string {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    return d.toISOString().slice(0, 7);
}

function monthName(month: string): string {
    return new Date(localToUtcMs(`${month}-01`)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Monday-first weekday of a date, 0-6. */
function weekday(date: string): number {
    return (new Date(localToUtcMs(date)).getUTCDay() + 6) % 7;
}

interface PriceCalendarProps {
    request: SearchRequest;
    onPickDate: (date: string) => void;
}

export default function PriceCalendar({ request, onPickDate }: PriceCalendarProps) {
    const today = useToday();
    // Starts collapsed so the results come first; prices are only fetched once it's opened
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(request.date.slice(0, 7));
    const [loaded, setLoaded] = useState<{ month: string; calendar: Calendar | null } | null>(null);
    const calendar = loaded?.month === month ? loaded.calendar : undefined; // undefined while loading

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const params = new URLSearchParams({ origin: request.origin, dest: request.dest, month });
        fetch(`/api/calendar?${params}`, { signal: controller.signal })
            .then(res => (res.ok ? res.json() : null))
            .then((data: Calendar | null) => setLoaded({ month, calendar: data }))
            .catch(() => {
                if (!controller.signal.aborted) setLoaded({ month, calendar: null });
            });
        return () => controller.abort();
    }, [request.origin, request.dest, month, open]);

    const searched = new Set(expandDates(request.date, request.departureDateRange ?? 0, request.departureDateDirection ?? 'both'));
    // Highlight roughly the cheapest quarter of days
    const prices = (calendar?.days ?? [])
        .filter(d => d.price !== null && (!today || d.date >= today))
        .map(d => d.price as number)
        .sort((a, b) => a - b);
    const cheapLimit = prices.length ? prices[Math.floor((prices.length - 1) / 4)] : 0;
    const isCheap = (price: number) => price <= cheapLimit;

    return (
        <section className="price-calendar" aria-label="Price calendar">
            <div className="cal-header">
                <button type="button" className="cal-title" aria-expanded={open} onClick={() => setOpen(!open)}>
                    📅 Price calendar <span className="cal-chevron">{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                    <div className="cal-nav">
                        <button
                            type="button"
                            aria-label="Previous month"
                            disabled={!!today && month <= today.slice(0, 7)}
                            onClick={() => setMonth(m => shiftMonth(m, -1))}
                        >
                            ‹
                        </button>
                        <span className="cal-month">{monthName(month)}</span>
                        <button type="button" aria-label="Next month" onClick={() => setMonth(m => shiftMonth(m, 1))}>
                            ›
                        </button>
                    </div>
                )}
            </div>

            {open && (
                <>
                    <div className="cal-grid">
                        {WEEKDAYS.map(d => <div key={d} className="cal-weekday">{d}</div>)}
                        {calendar && Array.from({ length: weekday(`${month}-01`) }, (_, i) => <div key={`pad-${i}`} />)}
                        {calendar?.days.map(day => {
                            const past = !!today && day.date < today;
                            const classes = [
                                'cal-day',
                                day.price === null || past ? 'cal-empty' : '',
                                day.price !== null && !past && isCheap(day.price) ? 'cal-cheap' : '',
                                searched.has(day.date) ? 'cal-selected' : '',
                            ].join(' ');
                            return (
                                <button
                                    key={day.date}
                                    type="button"
                                    className={classes}
                                    disabled={day.price === null || past}
                                    onClick={() => onPickDate(day.date)}
                                    title={day.price === null ? 'No flights' : `${day.direct ? 'Direct' : 'With one stop'} from €${day.price.toFixed(2)}`}
                                >
                                    <span className="cal-date">{Number(day.date.slice(8))}</span>
                                    <span className="cal-price">{day.price === null || past ? '–' : `€${Math.round(day.price)}`}</span>
                                </button>
                            );
                        })}
                    </div>
                    {calendar === undefined && <p className="cal-note">Loading prices…</p>}
                    {calendar === null && <p className="cal-note">Prices couldn&apos;t be loaded.</p>}
                    {calendar && (
                        <p className="cal-note">
                            Cheapest one-way price per day{calendar.includesConnections ? ', direct or with one stop' : ' (direct flights only)'}.
                            {request.returnDate && ' Picking a day moves the return date too, keeping the trip length.'}
                        </p>
                    )}
                </>
            )}
        </section>
    );
}
