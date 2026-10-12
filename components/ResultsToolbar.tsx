'use client';

import { DEFAULT_VIEW, ResultView, SortOrder } from '@/lib/searchUrl';

const SORTS: { value: SortOrder; label: string }[] = [
    { value: 'cheapest', label: 'Cheapest' },
    { value: 'fastest', label: 'Fastest' },
    { value: 'earliest', label: 'Earliest' },
];

const LAYOVER_LIMITS = [3, 5, 8];

interface ResultsToolbarProps {
    view: ResultView;
    onChange: (view: ResultView) => void;
}

export function hasFilters(view: ResultView): boolean {
    return view.directOnly || view.sameAirport || !!view.maxLayoverHours || !!view.maxPrice;
}

export default function ResultsToolbar({ view, onChange }: ResultsToolbarProps) {
    const set = (patch: Partial<ResultView>) => onChange({ ...view, ...patch });

    return (
        <div className="results-toolbar">
            <div className="toggle-group sort-group" role="group" aria-label="Sort results">
                {SORTS.map(s => (
                    <button
                        key={s.value}
                        type="button"
                        className={`toggle-btn ${view.sort === s.value ? 'active' : ''}`}
                        aria-pressed={view.sort === s.value}
                        onClick={() => set({ sort: s.value })}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            <div className="filter-group">
                <div className={`pill-selector ${view.directOnly ? 'active' : ''}`}>
                    <button
                        type="button"
                        className="pill-toggle"
                        aria-pressed={view.directOnly}
                        onClick={() => set({ directOnly: !view.directOnly, maxLayoverHours: undefined })}
                    >
                        Direct only
                    </button>
                </div>

                <div className={`pill-selector ${view.sameAirport ? 'active' : ''}`}>
                    <button
                        type="button"
                        className="pill-toggle"
                        aria-pressed={view.sameAirport}
                        title="Hide trips that fly back from, or to, a different airport"
                        onClick={() => set({ sameAirport: !view.sameAirport })}
                    >
                        Same airport only
                    </button>
                </div>

                {!view.directOnly && (
                    <label className={`filter-field ${view.maxLayoverHours ? 'active' : ''}`}>
                        <span>Layover</span>
                        <select
                            className="pill-select"
                            aria-label="Maximum layover"
                            value={view.maxLayoverHours ?? ''}
                            onChange={e => set({ maxLayoverHours: e.target.value ? Number(e.target.value) : undefined })}
                        >
                            <option value="">Any</option>
                            {LAYOVER_LIMITS.map(h => <option key={h} value={h}>≤ {h}h</option>)}
                        </select>
                    </label>
                )}

                <label className={`filter-field ${view.maxPrice ? 'active' : ''}`}>
                    <span>Max €</span>
                    <input
                        className="pill-select price-input"
                        aria-label="Maximum price in euros"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        placeholder="Any"
                        value={view.maxPrice ?? ''}
                        onChange={e => {
                            const n = Number(e.target.value);
                            set({ maxPrice: e.target.value && n > 0 ? n : undefined });
                        }}
                    />
                </label>

                {hasFilters(view) && (
                    <button type="button" className="filter-reset" onClick={() => onChange({ ...DEFAULT_VIEW, sort: view.sort })}>
                        Reset
                    </button>
                )}
            </div>
        </div>
    );
}
