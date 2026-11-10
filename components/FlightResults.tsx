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
import CheaperDates from './CheaperDates';
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
    /** The search has finished, so the cheapest price is final */
    complete?: boolean;
}

// The cheapest (or fastest...) 20 first; the rest are usually pricier or odd routes, a click away
const PAGE_SIZE = 20;

/** Identifies a trip by its flights, so an opened row stays with its trip when the list is re-sorted. */
function tripKey(result: SearchResult): string {
    const legs = [result, ...(result.returnFlights?.slice(0, 1) ?? [])];
    return legs.flatMap(leg => leg.flights.map(f => `${f.origin}${f.departureDate}${f.destination}`)).join('|');
}

// The map (and its library) is only loaded when someone opens the map view
const AnywhereMap = dynamic(() => import('./AnywhereMap'), {
    ssr: false,
    loading: () => <div className="anywhere-map map-loading">Loading map…</div>,
});

export default function FlightResults({ request, results, view, onViewChange, onSearch, titleAction, complete = false }: FlightResultsProps) {
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
    const keys = useMemo(() => {
        const seen = new Map<string, number>();
        return visible.map(r => {
            const key = tripKey(r);
            const n = seen.get(key) ?? 0;
            seen.set(key, n + 1);
            return n === 0 ? key : `${key}#${n}`;
        });
    }, [visible]);
    // Name the airports on each row only when they differ between results ("Anywhere", groups, several airports);
    // otherwise the search title already says where the flights go
    const showRoute = useMemo(() => anywhere || new Set(results.map(r => `${r.origin}-${r.destination}`)).size > 1, [anywhere, results]);
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

            {complete && summary && !anywhere && (
                <CheaperDates request={request} cheapest={summary.cheapest} onPick={onSearch} />
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
                    <ResultCard key={keys[i]} result={result} places={places} showRoute={showRoute} />
                ))}
            </div>

            {visible.length > shown && !(anywhere && view.showMap) && (
                <button type="button" className="show-more-btn" onClick={() => setShown(n => n + PAGE_SIZE)}>
                    Show {Math.min(PAGE_SIZE, visible.length - shown)} more ({visible.length - shown} left)
                </button>
            )}
        </div>
    );
}
