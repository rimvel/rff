'use client';

import { useState, useEffect, useRef } from 'react';

interface Airport {
    code: string;
    name: string;
    country: {
        name: string;
        code: string;
    };
    city: {
        name: string;
        code: string;
    };
}

export interface SearchFormState {
    origin: string;
    dest: string;
    date: string;
    returnDate: string;
    roundTrip: boolean;
    flexibleDeparture: boolean;
    flexibleReturn: boolean;
    departureDateRange: number;
    returnDateRange: number;
    departureDateDirection: string;
    returnDateDirection: string;
}

interface SearchFormProps {
    onSearch: (origin: string, dest: string, date: string, returnDate?: string, departureDateRange?: number, returnDateRange?: number, departureDateDirection?: string, returnDateDirection?: string) => void;
    isLoading: boolean;
    initialValues?: Partial<SearchFormState>;
}

const getFlagEmoji = (countryCode: string) => {
    return countryCode
        .toUpperCase()
        .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
};

export default function SearchForm({ onSearch, isLoading, initialValues }: SearchFormProps) {
    // Get tomorrow's date as default
    const getTomorrowDate = () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    };

    const [airports, setAirports] = useState<Airport[]>([]);
    const [origin, setOrigin] = useState(initialValues?.origin || 'VNO');
    const [dest, setDest] = useState(initialValues?.dest || '');
    const [date, setDate] = useState(initialValues?.date || getTomorrowDate());
    const [returnDate, setReturnDate] = useState(initialValues?.returnDate || '');
    const [originSearch, setOriginSearch] = useState(initialValues?.origin || 'VNO - Vilnius');
    const [destSearch, setDestSearch] = useState(initialValues?.dest || '');
    const [showOriginDropdown, setShowOriginDropdown] = useState(false);
    const [showDestDropdown, setShowDestDropdown] = useState(false);

    // Determine initial roundTrip state: check initialValues first, otherwise default to false
    const [roundTrip, setRoundTrip] = useState(
        initialValues?.roundTrip !== undefined
            ? initialValues.roundTrip
            : !!initialValues?.returnDate // If return date is present, assume round trip
    );

    const [flexibleDeparture, setFlexibleDeparture] = useState(initialValues?.flexibleDeparture || false);
    const [flexibleReturn, setFlexibleReturn] = useState(initialValues?.flexibleReturn || false);
    const [departureDateRange, setDepartureDateRange] = useState(initialValues?.departureDateRange || 3);
    const [returnDateRange, setReturnDateRange] = useState(initialValues?.returnDateRange || 3);
    const [departureDateDirection, setDepartureDateDirection] = useState(initialValues?.departureDateDirection || 'both');
    const [returnDateDirection, setReturnDateDirection] = useState(initialValues?.returnDateDirection || 'both');

    // Refs for input fields
    const originInputRef = useRef<HTMLInputElement>(null);
    const destInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch('/api/airports')
            .then(res => res.json())
            .then(data => setAirports(data))
            .catch(err => console.error('Failed to load airports', err));
    }, []);

    // Get unique countries from airports
    const getCountriesWithAirports = () => {
        const countryMap = new Map<string, { name: string; code: string; airportCodes: string[] }>();

        airports.forEach(airport => {
            const countryName = airport.country.name;
            const countryCode = airport.country.code;

            if (!countryMap.has(countryName)) {
                countryMap.set(countryName, {
                    name: countryName,
                    code: countryCode,
                    airportCodes: []
                });
            }
            countryMap.get(countryName)!.airportCodes.push(airport.code);
        });

        return Array.from(countryMap.values());
    };

    // Get unique cities from airports
    const getCitiesWithAirports = () => {
        const cityMap = new Map<string, { name: string; countryCode: string; airportCodes: string[] }>();

        airports.forEach(airport => {
            const cityName = airport.city.name;
            const cityKey = `${cityName}-${airport.country.code}`; // Unique city per country

            if (!cityMap.has(cityKey)) {
                cityMap.set(cityKey, {
                    name: cityName,
                    countryCode: airport.country.code,
                    airportCodes: []
                });
            }
            cityMap.get(cityKey)!.airportCodes.push(airport.code);
        });

        return Array.from(cityMap.values());
    };

    const filterAirports = (search: string): {
        airports: Airport[];
        countries: { name: string; code: string; airportCodes: string[] }[];
        cities: { name: string; countryCode: string; airportCodes: string[] }[]
    } => {
        if (!search) return { airports: [], countries: [], cities: [] };
        const s = search.toLowerCase();

        // Filter individual airports
        const matchingAirports = airports.filter(a =>
            a.code.toLowerCase().includes(s) ||
            a.name.toLowerCase().includes(s) ||
            a.country.name.toLowerCase().includes(s) ||
            a.city.name.toLowerCase().includes(s)
        ).sort((a, b) => a.country.name.localeCompare(b.country.name));

        // Check if search matches a country name
        const countries = getCountriesWithAirports();
        const matchingCountries = countries.filter((c: { name: string; airportCodes: string[] }) =>
            c.name.toLowerCase().includes(s) && c.airportCodes.length > 1
        );

        // Check if search matches a city name
        const cities = getCitiesWithAirports();
        const matchingCities = cities.filter((c: { name: string; airportCodes: string[] }) =>
            c.name.toLowerCase().includes(s) && c.airportCodes.length > 1
        );

        return { airports: matchingAirports, countries: matchingCountries, cities: matchingCities };
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
        // Focus destination input after selection
        setTimeout(() => destInputRef.current?.focus(), 0);
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

    // Handle Enter key on origin input
    const handleOriginKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Prioritize city selection, then country selection
            if (originFiltered.cities.length > 0) {
                const city = originFiltered.cities[0];
                selectOriginCity(city);
            } else if (originFiltered.countries.length > 0) {
                const country = originFiltered.countries[0];
                selectOriginCountry(country);
            } else if (originFiltered.airports.length > 0) {
                selectOrigin(originFiltered.airports[0]);
            }
        }
    };

    // Handle Enter key on destination input
    const handleDestKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Prioritize city selection, then country selection
            if (destFiltered.cities.length > 0) {
                const city = destFiltered.cities[0];
                selectDestCity(city);
            } else if (destFiltered.countries.length > 0) {
                const country = destFiltered.countries[0];
                selectDestCountry(country);
            } else if (destFiltered.airports.length > 0) {
                selectDest(destFiltered.airports[0]);
            }
        }
    };

    // Select all airports in a country for origin
    const selectOriginCountry = (country: { name: string; code: string; airportCodes: string[] }) => {
        setOrigin(country.airportCodes.join(','));
        setOriginSearch(`${country.name} - All (${country.airportCodes.length})`);
        setShowOriginDropdown(false);
        setTimeout(() => destInputRef.current?.focus(), 0);
    };

    // Select all airports in a country for destination
    const selectDestCountry = (country: { name: string; code: string; airportCodes: string[] }) => {
        setDest(country.airportCodes.join(','));
        setDestSearch(`${country.name} - All (${country.airportCodes.length})`);
        setShowDestDropdown(false);
    };

    // Select all airports in a city for origin
    const selectOriginCity = (city: { name: string; countryCode: string; airportCodes: string[] }) => {
        setOrigin(city.airportCodes.join(','));
        setOriginSearch(`${city.name} - All (${city.airportCodes.length})`);
        setShowOriginDropdown(false);
        setTimeout(() => destInputRef.current?.focus(), 0);
    };

    // Select all airports in a city for destination
    const selectDestCity = (city: { name: string; countryCode: string; airportCodes: string[] }) => {
        setDest(city.airportCodes.join(','));
        setDestSearch(`${city.name} - All (${city.airportCodes.length})`);
        setShowDestDropdown(false);
    };

    return (
        <form onSubmit={handleSubmit} className="search-form">
            <div className="location-group">
                <div className="form-group">
                    <label htmlFor="origin">From</label>
                    <div className="autocomplete-wrapper">
                        <input
                            ref={originInputRef}
                            id="origin"
                            type="text"
                            value={originSearch}
                            onChange={(e) => {
                                setOriginSearch(e.target.value);
                                setOrigin('');
                                setShowOriginDropdown(true);
                            }}
                            onFocus={() => setShowOriginDropdown(true)}
                            onKeyDown={handleOriginKeyDown}
                            placeholder="Airport code or name"
                            autoComplete="off"
                            required
                        />
                        {showOriginDropdown && (originFiltered.countries.length > 0 || originFiltered.cities.length > 0 || originFiltered.airports.length > 0) && (
                            <div className="autocomplete-dropdown">
                                {/* Show city options first */}
                                {originFiltered.cities.map(city => (
                                    <div
                                        key={`city-${city.name}-${city.countryCode}`}
                                        className="autocomplete-item autocomplete-city"
                                        onClick={() => selectOriginCity(city)}
                                    >
                                        <span className="flag-icon">{getFlagEmoji(city.countryCode)}</span>
                                        <div className="autocomplete-text">
                                            <strong>{city.name}</strong>
                                            <span className="autocomplete-sub">All Airports ({city.airportCodes.length})</span>
                                        </div>
                                    </div>
                                ))}
                                {/* Show country options */}
                                {originFiltered.countries.map(country => (
                                    <div
                                        key={`country-${country.code}`}
                                        className="autocomplete-item autocomplete-country"
                                        onClick={() => selectOriginCountry(country)}
                                    >
                                        <span className="flag-icon">{getFlagEmoji(country.code)}</span>
                                        <div className="autocomplete-text">
                                            <strong>{country.name}</strong>
                                            <span className="autocomplete-sub">All Airports ({country.airportCodes.length})</span>
                                        </div>
                                    </div>
                                ))}
                                {/* Show individual airports */}
                                {originFiltered.airports.map((a: Airport) => (
                                    <div
                                        key={a.code}
                                        className="autocomplete-item"
                                        onClick={() => selectOrigin(a)}
                                    >
                                        <span className="flag-icon">{getFlagEmoji(a.country.code)}</span>
                                        <div className="autocomplete-text">
                                            <strong>{a.name} ({a.code})</strong>
                                            <span className="autocomplete-sub">{a.country.name}</span>
                                        </div>
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
                            ref={destInputRef}
                            id="dest"
                            type="text"
                            value={destSearch}
                            onChange={(e) => {
                                setDestSearch(e.target.value);
                                setDest('');
                                setShowDestDropdown(true);
                            }}
                            onFocus={() => setShowDestDropdown(true)}
                            onKeyDown={handleDestKeyDown}
                            placeholder="Airport code or name"
                            autoComplete="off"
                            required
                        />
                        {showDestDropdown && (destFiltered.countries.length > 0 || destFiltered.cities.length > 0 || destFiltered.airports.length > 0) && (
                            <div className="autocomplete-dropdown">
                                {/* Show city options first */}
                                {destFiltered.cities.map(city => (
                                    <div
                                        key={`city-${city.name}-${city.countryCode}`}
                                        className="autocomplete-item autocomplete-city"
                                        onClick={() => selectDestCity(city)}
                                    >
                                        <span className="flag-icon">{getFlagEmoji(city.countryCode)}</span>
                                        <div className="autocomplete-text">
                                            <strong>{city.name}</strong>
                                            <span className="autocomplete-sub">All Airports ({city.airportCodes.length})</span>
                                        </div>
                                    </div>
                                ))}
                                {/* Show country options */}
                                {destFiltered.countries.map(country => (
                                    <div
                                        key={`country-${country.code}`}
                                        className="autocomplete-item autocomplete-country"
                                        onClick={() => selectDestCountry(country)}
                                    >
                                        <span className="flag-icon">{getFlagEmoji(country.code)}</span>
                                        <div className="autocomplete-text">
                                            <strong>{country.name}</strong>
                                            <span className="autocomplete-sub">All Airports ({country.airportCodes.length})</span>
                                        </div>
                                    </div>
                                ))}
                                {/* Show individual airports */}
                                {destFiltered.airports.map((a: Airport) => (
                                    <div
                                        key={a.code}
                                        className="autocomplete-item"
                                        onClick={() => selectDest(a)}
                                    >
                                        <span className="flag-icon">{getFlagEmoji(a.country.code)}</span>
                                        <div className="autocomplete-text">
                                            <strong>{a.name} ({a.code})</strong>
                                            <span className="autocomplete-sub">{a.country.name}</span>
                                        </div>
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
                    <div className="date-input-wrapper">
                        <input
                            id="date"
                            type="date"
                            value={date}
                            onChange={(e) => {
                                const newDate = e.target.value;
                                setDate(newDate);
                                if (roundTrip && newDate && !returnDate) {
                                    const d = new Date(newDate);
                                    d.setDate(d.getDate() + 7);
                                    setReturnDate(d.toISOString().split('T')[0]);
                                } else if (roundTrip && newDate && returnDate && newDate > returnDate) {
                                    // Ensure return is not before departure
                                    setReturnDate(newDate);
                                }
                            }}
                            min={new Date().toISOString().split('T')[0]}
                            required
                        />
                        <div className="date-adjusters-overlay">
                            <button
                                type="button"
                                className="date-adjuster-mini"
                                onClick={() => {
                                    const currentDate = new Date(date);
                                    currentDate.setDate(currentDate.getDate() - 1);
                                    const minDate = new Date().toISOString().split('T')[0];
                                    const newDate = currentDate.toISOString().split('T')[0];
                                    if (newDate >= minDate) {
                                        setDate(newDate);
                                        if (roundTrip && !returnDate) {
                                            const d = new Date(newDate);
                                            d.setDate(d.getDate() + 7);
                                            setReturnDate(d.toISOString().split('T')[0]);
                                        }
                                    }
                                }}
                                title="Previous day"
                            >
                                -
                            </button>
                            <button
                                type="button"
                                className="date-adjuster-mini"
                                onClick={() => {
                                    const currentDate = new Date(date);
                                    currentDate.setDate(currentDate.getDate() + 1);
                                    const newDate = currentDate.toISOString().split('T')[0];
                                    setDate(newDate);
                                    if (roundTrip && !returnDate) {
                                        const d = new Date(newDate);
                                        d.setDate(d.getDate() + 7);
                                        setReturnDate(d.toISOString().split('T')[0]);
                                    } else if (roundTrip && returnDate && newDate > returnDate) {
                                        // Ensure return is not before departure
                                        setReturnDate(newDate);
                                    }
                                }}
                                title="Next day"
                            >
                                +
                            </button>
                        </div>
                    </div>
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
                        <div className="date-input-wrapper">
                            <input
                                id="returnDate"
                                type="date"
                                value={returnDate}
                                onChange={(e) => setReturnDate(e.target.value)}
                                min={date}
                                required={roundTrip}
                            />
                            <div className="date-adjusters-overlay">
                                <button
                                    type="button"
                                    className="date-adjuster-mini"
                                    onClick={() => {
                                        const currentDate = new Date(returnDate);
                                        currentDate.setDate(currentDate.getDate() - 1);
                                        const minDate = date;
                                        const newDate = currentDate.toISOString().split('T')[0];
                                        if (newDate >= minDate) {
                                            setReturnDate(newDate);
                                        }
                                    }}
                                    title="Previous day"
                                >
                                    -
                                </button>
                                <button
                                    type="button"
                                    className="date-adjuster-mini"
                                    onClick={() => {
                                        const currentDate = new Date(returnDate);
                                        currentDate.setDate(currentDate.getDate() + 1);
                                        setReturnDate(currentDate.toISOString().split('T')[0]);
                                    }}
                                    title="Next day"
                                >
                                    +
                                </button>
                            </div>
                        </div>
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
                        onClick={() => {
                            setRoundTrip(true);
                            if (date) {
                                const newReturn = new Date(date);
                                newReturn.setDate(newReturn.getDate() + 7);
                                setReturnDate(newReturn.toISOString().split('T')[0]);
                            }
                        }}
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
