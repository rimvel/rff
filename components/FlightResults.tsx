'use client';

import { ReactNode, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { buildAirportIndex } from '@/lib/airportGroups';
import { formatDuration, formatPrice } from '@/lib/format';
import { applyView, onePerDestination, summarize } from '@/lib/resultFilters';
import { ANYWHERE, DEFAULT_VIEW, ResultView, SearchRequest } from '@/lib/searchUrl';
import { suggestAlternatives } from '@/lib/suggestions';
import { SearchResult } from '@/lib/types';
import { useAirports } from '@/lib/useAirports';
import ResultCard, { Places } from './ResultCard';
import ResultsToolbar, { hasFilters } from './ResultsToolbar';

interface FlightResultsProps {
    request: SearchRequest;
    results: SearchResult[];
    view: ResultView;
    onViewChange: (view: ResultView) => void;
    /** Run another search, e.g. one of the suggestions when nothing was found */
    onSearch: (request: SearchRequest) => void;
    /** Shown next to the results title (e.g. "Save route") */
    titleAction?: ReactNode;
}

const PAGE_SIZE = 50;

// The map (and its library) is only loaded when someone opens the map view
const AnywhereMap = dynamic(() => import('./AnywhereMap'), {
    ssr: false,
    loading: () => <div className="anywhere-map map-loading">Loading map…</div>,
});

export default function FlightResults({ request, results, view, onViewChange, onSearch, titleAction }: FlightResultsProps) {
    const { airports } = useAirports();
    const index = useMemo(() => buildAirportIndex(airports), [airports]);
    const [shown, setShown] = useState(PAGE_SIZE);

    const anywhere = request.dest === ANYWHERE;
    const places = useMemo<Places>(() => {
        const byCode = new Map(airports.map(a => [a.code, a]));
        return {
            name: code => byCode.get(code)?.name ?? code,
            city: code => {
                const a = byCode.get(code);
                return a ? (a.macCity ?? a.city).name : code;
            },
            coordinates: code => byCode.get(code)?.coordinates,
        };
    }, [airports]);

    const visible = useMemo(() => {
        const sorted = applyView(results, view);
        return anywhere ? onePerDestination(sorted) : sorted;
    }, [results, view, anywhere]);
    const summary = useMemo(() => summarize(visible), [visible]);
    const total = anywhere ? new Set(results.map(r => r.destination)).size : results.length;
    const noun = (n: number) => (anywhere ? (n === 1 ? 'destination' : 'destinations') : n === 1 ? 'option' : 'options');

    if (results.length === 0) {
        const suggestions = suggestAlternatives(request, index);
        return (
            <div className="no-results">
                <p className="no-results-title">No flights found for these dates.</p>
                {request.returnDate && !anywhere && (
                    <p>No outbound and return flights fit together.</p>
                )}
                {suggestions.length > 0 && (
                    <>
                        <p>Try one of these:</p>
                        <div className="suggestions">
                            {suggestions.map(s => (
                                <button key={s.label} type="button" className="suggestion-btn" onClick={() => onSearch(s.request)}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="results-container">
            <div className="results-heading">
                <h2 className="results-title">
                    {visible.length === total
                        ? `Found ${total} ${noun(total)}`
                        : `Showing ${visible.length} of ${total} ${noun(total)}`}
                </h2>
                {titleAction}
            </div>
            {summary && (
                <p className="results-summary">
                    Cheapest <strong>{formatPrice(summary.cheapest)}</strong>
                    {' · '}Fastest <strong>{formatDuration(summary.fastestMinutes)}</strong>
                    {summary.cheapestDirect !== undefined && (
                        <>{' · '}Direct from <strong>{formatPrice(summary.cheapestDirect)}</strong></>
                    )}
                </p>
            )}

            <ResultsToolbar view={view} onChange={onViewChange} />

            {anywhere && (
                <div className="toggle-group results-layout" role="tablist" aria-label="Show results as">
                    <button type="button" role="tab" aria-selected={!view.showMap} className={`toggle-btn ${!view.showMap ? 'active' : ''}`} onClick={() => onViewChange({ ...view, showMap: false })}>
                        List
                    </button>
                    <button type="button" role="tab" aria-selected={view.showMap} className={`toggle-btn ${view.showMap ? 'active' : ''}`} onClick={() => onViewChange({ ...view, showMap: true })}>
                        Map
                    </button>
                </div>
            )}

            {anywhere && view.showMap && visible.length > 0 && (
                <AnywhereMap
                    results={visible}
                    origins={request.origin.split(',')}
                    places={places}
                    onSearchDestination={code => onSearch({ ...request, dest: code })}
                />
            )}

            {visible.length === 0 && hasFilters(view) && (
                <div className="no-results">
                    <p className="no-results-title">No options match your filters.</p>
                    <div className="suggestions">
                        <button type="button" className="suggestion-btn" onClick={() => onViewChange({ ...DEFAULT_VIEW, sort: view.sort })}>
                            Clear filters
                        </button>
                    </div>
                </div>
            )}

            <div className="results-list" hidden={anywhere && view.showMap}>
                {visible.slice(0, shown).map((result, i) => (
                    <ResultCard key={i} result={result} places={places} />
                ))}
            </div>

            {visible.length > shown && !(anywhere && view.showMap) && (
                <button type="button" className="show-more-btn" onClick={() => setShown(n => n + PAGE_SIZE)}>
                    Show more ({visible.length - shown} left)
                </button>
            )}
        </div>
    );
}
