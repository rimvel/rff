'use client';

import { useMemo, useRef, useState } from 'react';
import { useAirports } from '@/lib/useAirports';
import { buildAirportIndex, labelFor } from '@/lib/airportGroups';
import { SearchRequest } from '@/lib/searchUrl';
import { addDays } from '@/lib/time';
import { DateDirection } from '@/lib/types';
import AirportInput from './AirportInput';

interface SearchFormProps {
    onSearch: (request: SearchRequest) => void;
    isLoading: boolean;
    /** Values to start with, e.g. from a shared link */
    initial: SearchRequest | null;
    /** Today's date in the user's time zone ('' until known) */
    today: string;
}

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
            <button type="button" className="pill-toggle" onClick={onToggle}>
                <span className="icon">📅</span>
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

function DateField({ id, label, value, min, onChange, flexLabel }: {
    id: string;
    label: string;
    value: string;
    min: string;
    onChange: (date: string) => void;
    flexLabel?: string;
}) {
    return (
        <div className="form-group">
            <div className="date-with-flex">
                <label htmlFor={id}>{label}</label>
                {flexLabel && <span className="flex-indicator">{flexLabel}</span>}
            </div>
            <div className="date-input-wrapper">
                <input
                    id={id}
                    type="date"
                    value={value}
                    onChange={e => e.target.value && onChange(e.target.value)}
                    min={min}
                    required
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
                    >
                        -
                    </button>
                    <button
                        type="button"
                        className="date-adjuster-mini"
                        onClick={() => onChange(addDays(value, 1))}
                        title="Next day"
                    >
                        +
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SearchForm({ onSearch, isLoading, initial, today }: SearchFormProps) {
    const { airports } = useAirports();
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!origin || !dest || !date) return;
        if (roundTrip && !returnDate) {
            alert('Please select a return date');
            return;
        }
        const useFlexReturn = roundTrip && flexibleReturn;
        onSearch({
            origin,
            dest,
            date,
            returnDate: roundTrip ? returnDate : undefined,
            departureDateRange: flexibleDeparture ? departureDateRange : undefined,
            departureDateDirection: flexibleDeparture ? departureDateDirection : undefined,
            returnDateRange: useFlexReturn ? returnDateRange : undefined,
            returnDateDirection: useFlexReturn ? returnDateDirection : undefined,
        });
    };

    const handleSwap = () => {
        setOrigin(dest);
        setOriginTyped(destTyped);
        setDest(origin);
        setDestTyped(originTyped);
    };

    return (
        <form onSubmit={handleSubmit} className="search-form">
            <div className="location-group">
                <AirportInput
                    id="origin"
                    label="From"
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
                    title="Swap Origin and Destination"
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
                    flexLabel={flexibleDeparture ? `${directionSymbol(departureDateDirection)}${departureDateRange}d` : undefined}
                />

                {roundTrip && (
                    <DateField
                        id="returnDate"
                        label="Return"
                        value={returnDate}
                        min={date}
                        onChange={setReturnDate}
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
                        One Way
                    </button>
                    <button
                        type="button"
                        className={`toggle-btn ${roundTrip ? 'active' : ''}`}
                        onClick={() => {
                            setRoundTrip(true);
                            if (date) setReturnDate(addDays(date, DEFAULT_TRIP_DAYS));
                        }}
                    >
                        Round Trip
                    </button>
                </div>

                <div className="flex-options">
                    <FlexSelector
                        label="Flex Departure"
                        active={flexibleDeparture}
                        onToggle={() => setFlexibleDeparture(!flexibleDeparture)}
                        direction={departureDateDirection}
                        onDirection={setDepartureDateDirection}
                        range={departureDateRange}
                        onRange={setDepartureDateRange}
                    />
                    {roundTrip && (
                        <FlexSelector
                            label="Flex Return"
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

            <button type="submit" disabled={isLoading || !origin || !dest || !date} className="search-button-compact">
                {isLoading ? 'Searching...' : 'Search'}
            </button>
        </form>
    );
}
