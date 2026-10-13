'use client';

import { clearRecentSearches, useRecentSearches } from '@/lib/recentSearches';
import { SearchRequest, searchKey } from '@/lib/searchUrl';
import { localToUtcMs } from '@/lib/time';

function formatDay(date: string): string {
    return new Date(localToUtcMs(date)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function describeDates(req: SearchRequest): string {
    let text = formatDay(req.date);
    if (req.departureDateRange) text += ` ±${req.departureDateRange}d`;
    if (req.returnDate) text += ` – ${formatDay(req.returnDate)}`;
    if (req.returnDate && req.returnDateRange) text += ` ±${req.returnDateRange}d`;
    return text;
}

// More are kept, so one whose dates have passed is replaced by an older one
const SHOWN = 3;

interface RecentSearchesProps {
    currentKey: string;
    onPick: (request: SearchRequest) => void;
}

export default function RecentSearches({ currentKey, onPick }: RecentSearchesProps) {
    const recent = useRecentSearches().filter(r => searchKey(r.request) !== currentKey).slice(0, SHOWN);
    if (recent.length === 0) return null;

    return (
        <div className="recent-searches">
            <span className="recent-title">Recent</span>
            {recent.map(r => (
                <button key={searchKey(r.request)} type="button" className="recent-chip" onClick={() => onPick(r.request)}>
                    {r.fromLabel} {r.request.returnDate ? '⇄' : '→'} {r.toLabel}
                    <span className="recent-dates">{describeDates(r.request)}</span>
                </button>
            ))}
            <button type="button" className="recent-clear" onClick={clearRecentSearches} title="Forget recent searches">
                Clear
            </button>
        </div>
    );
}
