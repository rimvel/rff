'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDayList, upcomingWindows, WindowInfo } from '@/lib/lithuania';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "24–27 Dec", "31 Oct – 8 Nov" */
function formatRange(start: string, end: string): string {
    const day = (d: string) => Number(d.slice(8));
    const month = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1];
    return month(start) === month(end) ? `${day(start)}–${day(end)} ${month(end)}` : `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface HolidayWindowsProps {
    today: string;
    /** Dates of the round trip being shown, to highlight its window */
    active?: { date: string; returnDate?: string };
    onPick: (window: WindowInfo) => void;
}

/** Upcoming long weekends and school breaks (Lithuania), as one-click searches. */
export default function HolidayWindows({ today, active, onPick }: HolidayWindowsProps) {
    const windows = useMemo(() => (today ? upcomingWindows(today) : []), [today]);
    // Starts collapsed so the search form and results come first
    const [open, setOpen] = useState(false);
    const strip = useRef<HTMLDivElement>(null);
    const activeKey = active?.returnDate ? `${active.date}|${active.returnDate}` : '';

    // Scroll the strip (not the page) so the window being shown is in view
    useEffect(() => {
        const card = strip.current?.querySelector<HTMLElement>('.hw-card.active');
        if (card && strip.current) strip.current.scrollLeft = card.offsetLeft - 8; // the strip is the card's offset parent
    }, [activeKey, windows, open]);

    if (windows.length === 0) return null;

    return (
        <section className="holiday-windows" aria-label="Holiday windows">
            <div className="hw-header">
                <button type="button" className="recent-title hw-toggle" aria-expanded={open} aria-controls="hw-strip" onClick={() => setOpen(!open)}>
                    Holiday windows <span className="hw-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
                </button>
                <span className="hw-sub">
                    {open
                        ? 'Lithuanian public holidays and school breaks · pick one to search those dates'
                        : `Lithuanian long weekends and school breaks · ${windows.length} coming up`}
                </span>
            </div>
            <div className="hw-strip" id="hw-strip" ref={strip} hidden={!open}>
                {windows.map(w => {
                    const isActive = active?.date === w.start && active?.returnDate === w.end;
                    return (
                        <button
                            key={`${w.start}|${w.end}`}
                            type="button"
                            className={`hw-card ${w.free ? 'free' : ''} ${w.bestValue ? 'best' : ''} ${isActive ? 'active' : ''}`}
                            aria-pressed={isActive}
                            onClick={() => onPick(w)}
                        >
                            <span className="hw-name">{w.name}</span>
                            <span className="hw-dates">{formatRange(w.start, w.end)}</span>
                            <span className="hw-cost">
                                {plural(w.days, 'day')} off · {w.free ? 'no leave needed' : `${plural(w.leaveDays.length, 'leave day')}`}
                            </span>
                            {!w.free && <span className="hw-take">Take {formatDayList(w.leaveDays)}</span>}
                            <span className="hw-tags">
                                {w.free && <span className="hw-tag free">Free</span>}
                                {w.bestValue && <span className="hw-tag best">Best value</span>}
                                {w.schoolDays.length > 0 && (
                                    <span className="hw-tag school" title={`School days missed: ${formatDayList(w.schoolDays)}`}>
                                        Misses {plural(w.schoolDays.length, 'school day')}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
