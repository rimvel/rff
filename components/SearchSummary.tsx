'use client';

import { Ref, useId, useMemo } from 'react';
import { AirportIndex, buildAirportIndex, shortLabelFor } from '@/lib/airportGroups';
import { ANYWHERE, SearchRequest } from '@/lib/searchUrl';
import { localToUtcMs } from '@/lib/time';
import { DateDirection } from '@/lib/types';
import { useAirports } from '@/lib/useAirports';

/** "24 Dec", or with the weekday "Thu 24 Dec" */
function dayMonth(date: string, withWeekday = false): string {
    return new Date(localToUtcMs(date)).toLocaleDateString('en-GB', {
        weekday: withWeekday ? 'short' : undefined,
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    });
}

/** Shown one way, read out by screen readers another ("⇄" → "to"). */
function Said({ shown, said }: { shown: string; said: string }) {
    return (
        <>
            <span aria-hidden="true">{shown}</span>
            <span className="sr-only">{said}</span>
        </>
    );
}

function Flex({ range, direction }: { range?: number; direction?: DateDirection }) {
    if (!range) return null;
    const days = `${range} ${range === 1 ? 'day' : 'days'}`;
    if (direction === 'after') return <Said shown={` +${range}d`} said={`, up to ${days} later`} />;
    if (direction === 'before') return <Said shown={` -${range}d`} said={`, up to ${days} earlier`} />;
    return <Said shown={` ±${range}d`} said={`, give or take ${days}`} />;
}

function Route({ search, index }: { search: SearchRequest; index: AirportIndex }) {
    const from = shortLabelFor(search.origin, index);
    const to = search.dest === ANYWHERE ? 'Anywhere' : shortLabelFor(search.dest, index);
    return (
        <>
            {from} <Said shown={search.returnDate ? '⇄' : '→'} said="to" /> {to}
            {search.returnDate && <span className="sr-only"> and back</span>}
        </>
    );
}

function Dates({ search }: { search: SearchRequest }) {
    if (!search.returnDate) {
        return <>{dayMonth(search.date, true)}<Flex range={search.departureDateRange} direction={search.departureDateDirection} /></>;
    }
    return (
        <>
            {dayMonth(search.date)}
            <Flex range={search.departureDateRange} direction={search.departureDateDirection} />
            {' '}<Said shown="–" said="to" />{' '}
            {dayMonth(search.returnDate)}
            <Flex range={search.returnDateRange} direction={search.returnDateDirection} />
        </>
    );
}

interface SearchSummaryProps {
    search: SearchRequest;
    /** Whether the full form is open below */
    expanded: boolean;
    onToggle: () => void;
    /** id of the form the button opens */
    controls: string;
    ref?: Ref<HTMLButtonElement>;
}

/**
 * One-line summary of the search shown, e.g. "Vilnius → London · Fri 20 Nov", with a button to open the
 * full form. Only shown on phones (see .search-summary in globals.css); wider screens always show the form.
 */
export default function SearchSummary({ search, expanded, onToggle, controls, ref }: SearchSummaryProps) {
    const { airports } = useAirports();
    const index = useMemo(() => buildAirportIndex(airports), [airports]);
    const textId = useId();

    return (
        <div className={expanded ? 'search-summary expanded' : 'search-summary'}>
            <p className="search-summary-text" id={textId}>
                {/* The dates move to a second line when they don't fit */}
                <span className="search-summary-line">
                    <span className="search-summary-route"><Route search={search} index={index} /></span>
                    <span className="sr-only">, </span>
                    <span className="search-summary-dates"><Dates search={search} /></span>
                </span>
            </p>
            <button
                ref={ref}
                type="button"
                className="search-summary-edit"
                aria-expanded={expanded}
                aria-controls={controls}
                aria-describedby={textId}
                onClick={onToggle}
            >
                {expanded ? 'Close' : 'Edit'}
            </button>
        </div>
    );
}
