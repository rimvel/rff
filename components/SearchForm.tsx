'use client';

import { useState, useEffect } from 'react';

interface Airport {
    code: string;
    name: string;
    country: {
        name: string;
    };
}

interface SearchFormProps {
    onSearch: (origin: string, dest: string, date: string, returnDate?: string, departureDateRange?: number, returnDateRange?: number, departureDateDirection?: string, returnDateDirection?: string) => void;
    isLoading: boolean;
}

export default function SearchForm({ onSearch, isLoading }: SearchFormProps) {
    // Get tomorrow's date as default
    const getTomorrowDate = () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    };

    const [airports, setAirports] = useState<Airport[]>([]);
    const [origin, setOrigin] = useState('');
    const [dest, setDest] = useState('');
    const [date, setDate] = useState(getTomorrowDate());
    const [returnDate, setReturnDate] = useState('');
    const [originSearch, setOriginSearch] = useState('');
    const [destSearch, setDestSearch] = useState('');
    const [showOriginDropdown, setShowOriginDropdown] = useState(false);
    const [showDestDropdown, setShowDestDropdown] = useState(false);
    const [roundTrip, setRoundTrip] = useState(false);
    const [flexibleDeparture, setFlexibleDeparture] = useState(false);
    const [flexibleReturn, setFlexibleReturn] = useState(false);
    const [departureDateRange, setDepartureDateRange] = useState(3);
    const [returnDateRange, setReturnDateRange] = useState(3);
    const [departureDateDirection, setDepartureDateDirection] = useState('both'); // 'both' (±), 'after' (+), 'before' (-)
    const [returnDateDirection, setReturnDateDirection] = useState('both');

    useEffect(() => {
        fetch('/api/airports')
            .then(res => res.json())
            .then(data => setAirports(data))
            .catch(err => console.error('Failed to load airports', err));
    }, []);

    const filterAirports = (search: string) => {
        if (!search) return [];
        const s = search.toLowerCase();
        return airports.filter(a =>
            a.code.toLowerCase().includes(s) ||
            a.name.toLowerCase().includes(s) ||
            a.country.name.toLowerCase().includes(s)
        ).slice(0, 10);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (origin && dest && date) {
            if (roundTrip && !returnDate) {
                alert('Please select a return date');
                return;
            }
            onSearch(
                origin,
                dest,
                date,
                roundTrip ? returnDate : undefined,
                flexibleDeparture ? departureDateRange : undefined,
                flexibleReturn && roundTrip ? returnDateRange : undefined,
                flexibleDeparture ? departureDateDirection : undefined,
                flexibleReturn && roundTrip ? returnDateDirection : undefined
            );
        }
    };

    const selectOrigin = (airport: Airport) => {
        setOrigin(airport.code);
        setOriginSearch(`${airport.code} - ${airport.name}`);
        setShowOriginDropdown(false);
    };

    const selectDest = (airport: Airport) => {
        setDest(airport.code);
        setDestSearch(`${airport.code} - ${airport.name}`);
        setShowDestDropdown(false);
    };

    const originFiltered = filterAirports(originSearch);
    const destFiltered = filterAirports(destSearch);

    const handleSwap = () => {
        const tempOrigin = origin;
        const tempOriginSearch = originSearch;
        setOrigin(dest);
        setOriginSearch(destSearch);
        setDest(tempOrigin);
        setDestSearch(tempOriginSearch);
    };

    return (
        <form onSubmit={handleSubmit} className="search-form">
            <div className="location-group">
                <div className="form-group">
                    <label htmlFor="origin">From</label>
                    <div className="autocomplete-wrapper">
                        <input
                            id="origin"
                            type="text"
                            value={originSearch}
                            onChange={(e) => {
                                setOriginSearch(e.target.value);
                                setOrigin('');
                                setShowOriginDropdown(true);
                            }}
                            onFocus={() => setShowOriginDropdown(true)}
                            placeholder="Airport code or name"
                            autoComplete="off"
                            required
                        />
                        {showOriginDropdown && originFiltered.length > 0 && (
                            <div className="autocomplete-dropdown">
                                {originFiltered.map(a => (
                                    <div
                                        key={a.code}
                                        className="autocomplete-item"
                                        onClick={() => selectOrigin(a)}
                                    >
                                        <strong>{a.code}</strong> - {a.name}, {a.country.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <button
                    type="button"
                    className="swap-button"
                    onClick={handleSwap}
                    title="Swap Origin and Destination"
                >
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8v12M17 20l4-4M17 20l-4-4" style={{ display: 'none' }} />
                        <path d="M20 7H4" />
                        <path d="M20 7L16 3" />
                        <path d="M20 7L16 11" />
                        <path d="M4 17H20" />
                        <path d="M4 17L8 13" />
                        <path d="M4 17L8 21" />
                    </svg>
                </button>

                <div className="form-group">
                    <label htmlFor="dest">To</label>
                    <div className="autocomplete-wrapper">
                        <input
                            id="dest"
                            type="text"
                            value={destSearch}
                            onChange={(e) => {
                                setDestSearch(e.target.value);
                                setDest('');
                                setShowDestDropdown(true);
                            }}
                            onFocus={() => setShowDestDropdown(true)}
                            placeholder="Airport code or name"
                            autoComplete="off"
                            required
                        />
                        {showDestDropdown && destFiltered.length > 0 && (
                            <div className="autocomplete-dropdown">
                                {destFiltered.map(a => (
                                    <div
                                        key={a.code}
                                        className="autocomplete-item"
                                        onClick={() => selectDest(a)}
                                    >
                                        <strong>{a.code}</strong> - {a.name}, {a.country.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="date-group">
                <div className="form-group">
                    <div className="date-with-flex">
                        <label htmlFor="date">Departure</label>
                        {flexibleDeparture && (
                            <span className="flex-indicator">
                                {departureDateDirection === 'both' ? '±' : departureDateDirection === 'after' ? '+' : '-'}{departureDateRange}d
                            </span>
                        )}
                    </div>
                    <input
                        id="date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        required
                    />
                </div>

                {roundTrip && (
                    <div className="form-group">
                        <div className="date-with-flex">
                            <label htmlFor="returnDate">Return</label>
                            {flexibleReturn && (
                                <span className="flex-indicator">
                                    {returnDateDirection === 'both' ? '±' : returnDateDirection === 'after' ? '+' : '-'}{returnDateRange}d
                                </span>
                            )}
                        </div>
                        <input
                            id="returnDate"
                            type="date"
                            value={returnDate}
                            onChange={(e) => setReturnDate(e.target.value)}
                            min={date}
                            required={roundTrip}
                        />
                    </div>
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
                        onClick={() => setRoundTrip(true)}
                    >
                        Round Trip
                    </button>
                </div>

                <div className="flex-options">
                    <div className={`pill-selector ${flexibleDeparture ? 'active' : ''}`}>
                        <button
                            type="button"
                            className="pill-toggle"
                            onClick={() => setFlexibleDeparture(!flexibleDeparture)}
                        >
                            <span className="icon">📅</span>
                            Flex Departure
                        </button>
                        {flexibleDeparture && (
                            <>
                                <select
                                    className="pill-select"
                                    value={departureDateDirection}
                                    onChange={(e) => setDepartureDateDirection(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <option value="both">±</option>
                                    <option value="after">+</option>
                                    <option value="before">-</option>
                                </select>
                                <select
                                    className="pill-select"
                                    value={departureDateRange}
                                    onChange={(e) => setDepartureDateRange(Number(e.target.value))}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <option value={1}>1d</option>
                                    <option value={2}>2d</option>
                                    <option value={3}>3d</option>
                                    <option value={5}>5d</option>
                                    <option value={7}>7d</option>
                                </select>
                            </>
                        )}
                    </div>

                    {roundTrip && (
                        <div className={`pill-selector ${flexibleReturn ? 'active' : ''}`}>
                            <button
                                type="button"
                                className="pill-toggle"
                                onClick={() => setFlexibleReturn(!flexibleReturn)}
                            >
                                <span className="icon">📅</span>
                                Flex Return
                            </button>
                            {flexibleReturn && (
                                <>
                                    <select
                                        className="pill-select"
                                        value={returnDateDirection}
                                        onChange={(e) => setReturnDateDirection(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <option value="both">±</option>
                                        <option value="after">+</option>
                                        <option value="before">-</option>
                                    </select>
                                    <select
                                        className="pill-select"
                                        value={returnDateRange}
                                        onChange={(e) => setReturnDateRange(Number(e.target.value))}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <option value={1}>1d</option>
                                        <option value={2}>2d</option>
                                        <option value={3}>3d</option>
                                        <option value={5}>5d</option>
                                        <option value={7}>7d</option>
                                    </select>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <button type="submit" disabled={isLoading || !origin || !dest || !date} className="search-button-compact">
                {isLoading ? 'Searching...' : 'Search'}
            </button>
        </form>
    );
}
