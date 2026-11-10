'use client';

import { useEffect, useState } from 'react';
import type { DateGrid, PriceCalendar } from '@/lib/calendar';
import { cheaperOneWay, cheaperRoundTrip } from '@/lib/cheaperDates';
import { formatDay, formatPrice } from '@/lib/format';
import { SearchRequest } from '@/lib/searchUrl';
import { useToday } from '@/lib/useUrl';
import Icon from './Icon';

interface CheaperDatesProps {
    request: SearchRequest;
    /** The cheapest option shown for the search */
    cheapest: number;
    /** Search the cheaper dates */
    onPick: (request: SearchRequest) => void;
}

type Prices = { calendar: PriceCalendar } | { grid: DateGrid };

/**
 * One line under the results summary when moving the trip by a few days would be noticeably cheaper,
 * e.g. "Cheaper nearby: Sun 6 Dec – Sat 12 Dec from €139.76". Shown once the search has finished: the prices
 * come from the price calendar, which by then answers from fares the search has already loaded.
 */
export default function CheaperDates({ request, cheapest, onPick }: CheaperDatesProps) {
    const today = useToday();
    const { origin, dest, date, returnDate } = request;
    const key = `${origin}|${dest}|${date}|${returnDate ?? ''}`;
    const [loaded, setLoaded] = useState<{ key: string; prices: Prices } | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const url = returnDate
            ? `/api/calendar/grid?${new URLSearchParams({ origin, dest, date, returnDate, sameMonth: '1' })}`
            : `/api/calendar?${new URLSearchParams({ origin, dest, month: date.slice(0, 7) })}`;
        fetch(url, { signal: controller.signal })
            .then(async res => {
                // Too many airports for the calendar, or prices unavailable: simply no hint
                if (!res.ok) return;
                const data = await res.json();
                setLoaded({ key, prices: returnDate ? { grid: data as DateGrid } : { calendar: data as PriceCalendar } });
            })
            .catch(() => {});
        return () => controller.abort();
    }, [key, origin, dest, date, returnDate]);

    if (!today || loaded?.key !== key) return null;
    const found = 'grid' in loaded.prices
        ? cheaperRoundTrip(loaded.prices.grid, request, cheapest, today)
        : cheaperOneWay(loaded.prices.calendar.days, request, cheapest, today);
    if (!found) return null;

    const dates = found.returnDate ? `${formatDay(found.date)} – ${formatDay(found.returnDate)}` : formatDay(found.date);
    return (
        <button
            type="button"
            className="cheaper-dates"
            // The exact dates, without flexible days, so the search shows the price named here
            onClick={() => onPick({ origin, dest, date: found.date, returnDate: found.returnDate })}
        >
            <Icon name="calendar" />
            <span>
                Cheaper nearby: <strong>{dates}</strong> from <strong>{formatPrice(found.price)}</strong>
                <span className="cheaper-saving"> · {formatPrice(found.saving)} less</span>
            </span>
            <Icon name="chevron-right" className="cheaper-go" />
        </button>
    );
}
