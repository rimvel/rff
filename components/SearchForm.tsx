'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAirports } from '@/lib/useAirports';
import { buildAirportIndex, labelFor } from '@/lib/airportGroups';
import { ANYWHERE, SearchRequest, searchKey } from '@/lib/searchUrl';
import { formatDay } from '@/lib/format';
import { addDays } from '@/lib/time';
import { DateDirection } from '@/lib/types';
import AirportInput from './AirportInput';
import Icon from './Icon';
import SearchSummary from './SearchSummary';

interface SearchFormProps {
    onSearch: (request: SearchRequest) => void;
    isLoading: boolean;
    /** Values to start with, e.g. from a shared link */
    initial: SearchRequest | null;
    /** Today's date in the user's time zone ('' until known) */
    today: string;
    /** Told what search the form currently describes ('' if incomplete), so old results can be marked */
    onDraftChange?: (key: string) => void;
}

type Field = 'origin' | 'dest' | 'date' | 'returnDate';

const FORM_ID = 'search-form';

const DEFAULT_TRIP_DAYS = 7;
const RANGE_OPTIONS = [1, 2, 3, 5, 7];

const directionSymbol = (d: DateDirection) => (d === 'both' ? '±' : d === 'after' ? '+' : '-');

function FlexSelector({ label, active, onToggle, direction, onDirection, range, onRange }: {
    label: string;
    active: boolean;
    onToggle: () => void;
    direction: DateDirection;
    onDirection: (d: DateDirection) => void;
    range: number;
    onRange: (n: number) => void;
}) {
    return (
        <div className={`pill-selector ${active ? 'active' : ''}`}>
            <button type="button" className="pill-toggle" aria-pressed={active} onClick={onToggle}>
                <Icon name="calendar" />
                {label}
            </button>
            {active && (
                <>
                    <select
                        className="pill-select"
                        value={direction}
                        onChange={e => onDirection(e.target.value as DateDirection)}
                        onClick={e => e.stopPropagation()}
                    >
                        <option value="both">±</option>
                        <option value="after">+</option>
                        <option value="before">-</option>
                    </select>
                    <select
                        className="pill-select"
                        value={range}
                        onChange={e => onRange(Number(e.target.value))}
                        onClick={e => e.stopPropagation()}
                    >
                        {RANGE_OPTIONS.map(n => <option key={n} value={n}>{n}d</option>)}
                    </select>
                </>
            )}
        </div>
    );
}

interface FormValues {
    origin: string;
    dest: string;
    /** What's typed in the airport fields */
    originText: string;
    destText: string;
    date: string;
    returnDate: string;
    roundTrip: boolean;
    today: string;
}

/** What's wrong with the values entered, by field; empty when they can be searched. */
function findProblems({ origin, dest, originText, destText, date, returnDate, roundTrip, today }: FormValues) {
    const problems: Partial<Record<Field, string>> = {};
    if (!origin) problems.origin = originText.trim() ? 'Pick an airport from the list.' : 'Choose where you\'re flying from.';
    if (!dest) problems.dest = destText.trim() ? 'Pick an airport from the list.' : 'Choose where to, or pick Anywhere.';
    else if (dest === origin) problems.dest = 'Choose a different destination.';
    if (!date) problems.date = 'Choose a date.';
    else if (today && date < today) problems.date = 'Choose today or a later date.';
    if (roundTrip && !returnDate) problems.returnDate = 'Choose a return date.';
    else if (roundTrip && returnDate < date) problems.returnDate = 'The return can\'t be before the departure.';
    return problems;
}

/** Whether a search (e.g. from the page address) can be run as it is. */
function canSearch(req: SearchRequest | null, today: string): req is SearchRequest {
    if (!req) return false;
    const values = { ...req, originText: '', destText: '', returnDate: req.returnDate ?? '', roundTrip: !!req.returnDate, today };
    return Object.keys(findProblems(values)).length === 0;
}

/** "Sat" */
function weekday(date: string): string {
    return formatDay(date).split(' ')[0];
}

function DateField({ id, label, value, min, onChange, flexLabel, error }: {
    id: string;
    label: string;
    value: string;
    min: string;
    onChange: (date: string) => void;
    flexLabel?: string;
    error?: string;
}) {
    return (
        <div className={`form-group ${error ? 'has-error' : ''}`}>
            <div className="date-with-flex">
                <span className="date-label">
                    <label htmlFor={id}>{label}</label>
                    {/* The date field itself shows no weekday, and it matters for picking flights */}
                    {value && <span className="date-weekday" id={`${id}-weekday`}>{weekday(value)}</span>}
                </span>
                {flexLabel && <span className="flex-indicator">{flexLabel}</span>}
            </div>
            <div className="date-input-wrapper">
                <input
                    id={id}
                    type="date"
                    value={value}
                    onChange={e => e.target.value && onChange(e.target.value)}
                    min={min}
                    aria-invalid={!!error}
                    aria-describedby={[value && `${id}-weekday`, error && `${id}-error`].filter(Boolean).join(' ') || undefined}
                />
                <div className="date-adjusters-overlay">
                    <button
                        type="button"
                        className="date-adjuster-mini"
                        onClick={() => {
                            const prev = addDays(value, -1);
                            if (prev >= min) onChange(prev);
                        }}
                        title="Previous day"
                        aria-label="Previous day"
                    >
                        <Icon name="minus" />
                    </button>
                    <button
                        type="button"
                        className="date-adjuster-mini"
                        onClick={() => onChange(addDays(value, 1))}
                        title="Next day"
                        aria-label="Next day"
                    >
                        <Icon name="plus" />
                    </button>
                </div>
            </div>
            {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
        </div>
    );
}

/**
 * The search form. On phones, once there is a search to show (from the address or just submitted), it is
 * folded into a one-line summary with an Edit button, so the results come first. Wider screens always show the form.
 */
export default function SearchForm({ onSearch, isLoading, initial, today, onDraftChange }: SearchFormProps) {
    // The search the results are for; null until there is a complete one
    const [shown, setShown] = useState<SearchRequest | null>(() => (canSearch(initial, today) ? initial : null));
    const [expanded, setExpanded] = useState(false);
    // Bumped to re-create the fields, throwing away changes that weren't searched
    const [resets, setResets] = useState(0);
    const [draftKey, setDraftKey] = useState('');
    const editButton = useRef<HTMLButtonElement>(null);
    const focusEdit = useRef(false);

    const reportDraft = useCallback((key: string) => {
        setDraftKey(key);
        onDraftChange?.(key);
    }, [onDraftChange]);

    // After searching on a phone the Search button (which had focus) is folded away: continue from Edit instead
    useEffect(() => {
        if (!focusEdit.current) return;
        focusEdit.current = false;
        const button = editButton.current;
        if (button && button.getClientRects().length > 0) button.focus();
    });

    const search = (req: SearchRequest) => {
        setShown(req);
        setExpanded(false);
        focusEdit.current = true;
        onSearch(req);
    };

    const toggle = () => {
        if (!expanded) {
            setExpanded(true);
            return;
        }
        setExpanded(false);
        // Closing without searching undoes the changes, so the summary, form and results agree
        if (draftKey !== searchKey(shown)) setResets(n => n + 1);
    };

    return (
        <>
            {shown && (
                <SearchSummary ref={editButton} search={shown} expanded={expanded} onToggle={toggle} controls={FORM_ID} />
            )}
            <SearchFields
                key={resets}
                collapsed={!!shown && !expanded}
                initial={shown ?? initial}
                today={today}
                isLoading={isLoading}
                onSearch={search}
                onDraftChange={reportDraft}
            />
        </>
    );
}

interface SearchFieldsProps extends SearchFormProps {
    /** Folded into the summary (phones only; see .search-form.is-collapsed) */
    collapsed: boolean;
}

function SearchFields({ onSearch, isLoading, initial, today, onDraftChange, collapsed }: SearchFieldsProps) {
    const { airports, error: airportsError } = useAirports();
    const index = useMemo(() => buildAirportIndex(airports), [airports]);

    const [origin, setOrigin] = useState(initial?.origin ?? '');
    const [dest, setDest] = useState(initial?.dest ?? '');
    // What the user is typing; null shows the name of the selected airports instead
    const [originTyped, setOriginTyped] = useState<string | null>(null);
    const [destTyped, setDestTyped] = useState<string | null>(null);
    const [date, setDate] = useState(initial?.date ?? (today ? addDays(today, 1) : ''));
    const [returnDate, setReturnDate] = useState(initial?.returnDate ?? '');
    const [roundTrip, setRoundTrip] = useState(!!initial?.returnDate);

    const [flexibleDeparture, setFlexibleDeparture] = useState(!!initial?.departureDateRange);
    const [flexibleReturn, setFlexibleReturn] = useState(!!initial?.returnDateRange);
    const [departureDateRange, setDepartureDateRange] = useState(initial?.departureDateRange ?? 3);
    const [returnDateRange, setReturnDateRange] = useState(initial?.returnDateRange ?? 3);
    const [departureDateDirection, setDepartureDateDirection] = useState<DateDirection>(initial?.departureDateDirection ?? 'both');
    const [returnDateDirection, setReturnDateDirection] = useState<DateDirection>(initial?.returnDateDirection ?? 'both');

    const originText = originTyped ?? labelFor(origin, index);
    const destText = destTyped ?? labelFor(dest, index);

    const destInputRef = useRef<HTMLInputElement>(null);

    const changeDepartureDate = (newDate: string) => {
        setDate(newDate);
        if (roundTrip && !returnDate) {
            setReturnDate(addDays(newDate, DEFAULT_TRIP_DAYS));
        } else if (roundTrip && returnDate && newDate > returnDate) {
            // Return can't be before departure
            setReturnDate(newDate);
        }
    };

    // Problems with what's entered; shown only after the first attempt to search, and updated as they're fixed
    const [attempted, setAttempted] = useState(false);
    const problems = findProblems({ origin, dest, originText, destText, date, returnDate, roundTrip, today });
    const errors = attempted ? problems : {};
    const isValid = Object.keys(problems).length === 0;

    const useFlexReturn = roundTrip && flexibleReturn;
    const request: SearchRequest | null = isValid
        ? {
            origin,
            dest,
            date,
            returnDate: roundTrip ? returnDate : undefined,
            departureDateRange: flexibleDeparture ? departureDateRange : undefined,
            departureDateDirection: flexibleDeparture ? departureDateDirection : undefined,
            returnDateRange: useFlexReturn ? returnDateRange : undefined,
            returnDateDirection: useFlexReturn ? returnDateDirection : undefined,
        }
        : null;

    const draftKey = searchKey(request);
    useEffect(() => {
        onDraftChange?.(draftKey);
    }, [draftKey, onDraftChange]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!request) {
            setAttempted(true);
            const firstInvalid = (['origin', 'dest', 'date', 'returnDate'] as Field[]).find(f => problems[f]);
            if (firstInvalid) document.getElementById(firstInvalid)?.focus();
            return;
        }
        onSearch(request);
    };

    const handleSwap = () => {
        setOrigin(dest);
        setOriginTyped(destTyped);
        setDest(origin);
        setDestTyped(originTyped);
    };

    return (
        <form
            id={FORM_ID}
            onSubmit={handleSubmit}
            className={`search-form${roundTrip ? ' is-round-trip' : ''}${collapsed ? ' is-collapsed' : ''}`}
            noValidate
        >
            {airportsError && (
                <p className="form-error airports-error" role="alert">
                    The list of airports couldn&apos;t be loaded, so airports can&apos;t be picked right now. Trying again…
                </p>
            )}
            <div className="location-group">
                <AirportInput
                    id="origin"
                    label="From"
                    error={errors.origin}
                    index={index}
                    text={originText}
                    onTextChange={text => {
                        setOriginTyped(text);
                        setOrigin('');
                    }}
                    onSelect={codes => {
                        setOrigin(codes);
                        setOriginTyped(null);
                        // Move on to the destination after picking an origin
                        if (codes) setTimeout(() => destInputRef.current?.focus(), 0);
                    }}
                />

                <button
                    type="button"
                    className="swap-button"
                    onClick={handleSwap}
                    disabled={dest === ANYWHERE}
                    title="Swap origin and destination"
                >
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 7H4" />
                        <path d="M20 7L16 3" />
                        <path d="M20 7L16 11" />
                        <path d="M4 17H20" />
                        <path d="M4 17L8 13" />
                        <path d="M4 17L8 21" />
                    </svg>
                </button>

                <AirportInput
                    ref={destInputRef}
                    id="dest"
                    label="To"
                    allowAnywhere
                    error={errors.dest}
                    index={index}
                    text={destText}
                    onTextChange={text => {
                        setDestTyped(text);
                        setDest('');
                    }}
                    onSelect={codes => {
                        setDest(codes);
                        setDestTyped(null);
                    }}
                />
            </div>

            <div className="date-group">
                <DateField
                    id="date"
                    label="Departure"
                    value={date}
                    min={today}
                    onChange={changeDepartureDate}
                    error={errors.date}
                    flexLabel={flexibleDeparture ? `${directionSymbol(departureDateDirection)}${departureDateRange}d` : undefined}
                />

                {roundTrip && (
                    <DateField
                        id="returnDate"
                        label="Return"
                        value={returnDate}
                        min={date}
                        onChange={setReturnDate}
                        error={errors.returnDate}
                        flexLabel={flexibleReturn ? `${directionSymbol(returnDateDirection)}${returnDateRange}d` : undefined}
                    />
                )}
            </div>

            <div className="form-options-modern">
                <div className="toggle-group">
                    <button
                        type="button"
                        className={`toggle-btn ${!roundTrip ? 'active' : ''}`}
                        onClick={() => setRoundTrip(false)}
                    >
                        One way
                    </button>
                    <button
                        type="button"
                        className={`toggle-btn ${roundTrip ? 'active' : ''}`}
                        onClick={() => {
                            setRoundTrip(true);
                            // Keep a return date that was already chosen (e.g. after a look at one-way prices)
                            if (date && (!returnDate || returnDate < date)) setReturnDate(addDays(date, DEFAULT_TRIP_DAYS));
                        }}
                    >
                        Round trip
                    </button>
                </div>

                <div className="flex-options">
                    <FlexSelector
                        label="Flex departure"
                        active={flexibleDeparture}
                        onToggle={() => setFlexibleDeparture(!flexibleDeparture)}
                        direction={departureDateDirection}
                        onDirection={setDepartureDateDirection}
                        range={departureDateRange}
                        onRange={setDepartureDateRange}
                    />
                    {roundTrip && (
                        <FlexSelector
                            label="Flex return"
                            active={flexibleReturn}
                            onToggle={() => setFlexibleReturn(!flexibleReturn)}
                            direction={returnDateDirection}
                            onDirection={setReturnDateDirection}
                            range={returnDateRange}
                            onRange={setReturnDateRange}
                        />
                    )}
                </div>
            </div>

            {attempted && !isValid && (
                <p className="form-error" role="alert">Please fix the highlighted fields.</p>
            )}

            <button type="submit" disabled={isLoading} className="search-button-compact">
                {isLoading ? 'Searching...' : 'Search'}
            </button>
        </form>
    );
}
