'use client';

import { Fragment, useMemo } from 'react';
import { AirportIndex } from '@/lib/airportGroups';
import { buildQuickStarts, pickOrigin } from '@/lib/quickStarts';
import { useRecentSearches } from '@/lib/recentSearches';
import { SearchRequest } from '@/lib/searchUrl';

interface HomeIntroProps {
    /** The visitor's local date; '' until it is known (server rendering) */
    today: string;
    index: AirportIndex;
    onPick: (request: SearchRequest) => void;
}

/** What the site does, and a few one-tap searches. Shown on the home page before anything is searched. */
export default function HomeIntro({ today, index, onPick }: HomeIntroProps) {
    const recent = useRecentSearches(); // the same list until it changes
    const origin = useMemo(() => pickOrigin(recent), [recent]);
    const starts = useMemo(() => buildQuickStarts(today, origin, index), [today, origin, index]);

    // Dates depend on the visitor's own "today", which isn't known while rendering on the server
    if (!today) return null;

    return (
        <section className="home-intro" aria-labelledby="home-intro-text">
            <p className="home-intro-text" id="home-intro-text">
                An unofficial fare finder for one-stop trips Ryanair won&apos;t sell you as one booking, plus price
                calendars and &ldquo;Anywhere&rdquo; search.
            </p>
            {starts.length > 0 && (
                <>
                    <span className="recent-title home-intro-label" id="quick-starts-label">Try one</span>
                    <ul className="quick-starts" aria-labelledby="quick-starts-label">
                        {starts.map(s => (
                            <li key={s.id}>
                                <button type="button" className="quick-start" onClick={() => onPick(s.request)}>
                                    <span className="qs-icon" aria-hidden="true">{s.icon}</span>
                                    <span className="qs-text">
                                        <span className="qs-title">{s.title}</span>
                                        <span className="qs-detail">
                                            {/* Lines break after a "·", not inside a part */}
                                            {s.details.map((part, i) => (
                                                <Fragment key={i}>
                                                    {i > 0 && '\u00a0· '}
                                                    <span className="qs-part">{part}</span>
                                                </Fragment>
                                            ))}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}
