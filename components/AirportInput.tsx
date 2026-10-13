'use client';

import { forwardRef, useMemo, useState } from 'react';
import { AirportGroup, AirportIndex, searchAirports } from '@/lib/airportGroups';
import { ANYWHERE } from '@/lib/searchUrl';
import { Airport } from '@/lib/types';

const getFlagEmoji = (countryCode: string) =>
    countryCode
        .toUpperCase()
        .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));

interface AirportInputProps {
    id: string;
    label: string;
    index: AirportIndex;
    text: string;
    onTextChange: (text: string) => void;
    /** Called with comma-separated airport codes ('' when cleared) */
    onSelect: (codes: string) => void;
    /** Offer "Anywhere" (cheapest destinations) as a choice */
    allowAnywhere?: boolean;
    /** Validation message to show under the field */
    error?: string;
}

const AirportInput = forwardRef<HTMLInputElement, AirportInputProps>(function AirportInput(
    { id, label, index, text, onTextChange, onSelect, allowAnywhere = false, error },
    ref,
) {
    const [open, setOpen] = useState(false);
    const matches = useMemo(() => searchAirports(index, text), [index, text]);
    const typed = text.trim().toLowerCase();
    const showAnywhere = allowAnywhere && (typed === '' || 'anywhere'.startsWith(typed));
    const hasMatches = showAnywhere || matches.regions.length + matches.cities.length + matches.countries.length + matches.airports.length > 0;

    const selectAnywhere = () => {
        onSelect(ANYWHERE);
        setOpen(false);
    };

    const selectGroup = (group: AirportGroup) => {
        onSelect(group.airportCodes.join(','));
        setOpen(false);
    };

    const selectAirport = (airport: Airport) => {
        onSelect(airport.code);
        setOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            setOpen(false);
            return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (showAnywhere && typed.length >= 3) {
            selectAnywhere();
            return;
        }
        // Prefer a city, then a country typed in full ("France", not "South of France"), then a region,
        // then a country, then a single airport
        const country = matches.countries.find(c => c.name.toLowerCase() === typed);
        const group = matches.cities[0] ?? country ?? matches.regions[0] ?? matches.countries[0];
        if (group) selectGroup(group);
        else if (matches.airports[0]) selectAirport(matches.airports[0]);
    };

    const groupItem = (group: AirportGroup) => (
        <div
            key={`${group.kind}-${group.name}-${group.countryCode}`}
            className={`autocomplete-item ${group.kind === 'country' ? 'autocomplete-country' : 'autocomplete-city'}`}
            onMouseDown={e => e.preventDefault()}
            onClick={() => selectGroup(group)}
        >
            <span className="flag-icon">{group.icon ?? getFlagEmoji(group.countryCode)}</span>
            <div className="autocomplete-text">
                <strong>{group.name}</strong>
                <span className="autocomplete-sub">
                    {group.kind !== 'region'
                        ? `All Airports (${group.airportCodes.length})`
                        : group.description
                          ? `${group.description} · ${group.airportCodes.length} airports`
                          : `Regional Group (${group.airportCodes.length} airports)`}
                </span>
            </div>
        </div>
    );

    return (
        <div className={`form-group ${error ? 'has-error' : ''}`}>
            <label htmlFor={id}>{label}</label>
            <div className="autocomplete-wrapper">
                <input
                    ref={ref}
                    id={id}
                    type="text"
                    value={text}
                    onChange={e => {
                        onTextChange(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                    onKeyDown={handleKeyDown}
                    placeholder="Airport code or name"
                    autoComplete="off"
                    aria-invalid={!!error}
                    aria-describedby={error ? `${id}-error` : undefined}
                />
                {text && (
                    <button
                        type="button"
                        className="clear-input-btn"
                        onClick={() => {
                            onSelect('');
                            if (ref && typeof ref !== 'function') ref.current?.focus();
                        }}
                        title={`Clear ${label}`}
                    >
                        ✕
                    </button>
                )}
                {open && hasMatches && (
                    <div className="autocomplete-dropdown">
                        {showAnywhere && (
                            <div
                                className="autocomplete-item autocomplete-city"
                                onMouseDown={e => e.preventDefault()}
                                onClick={selectAnywhere}
                            >
                                <span className="flag-icon">🌍</span>
                                <div className="autocomplete-text">
                                    <strong>Anywhere</strong>
                                    <span className="autocomplete-sub">Cheapest places to fly to</span>
                                </div>
                            </div>
                        )}
                        {matches.regions.map(groupItem)}
                        {matches.cities.map(groupItem)}
                        {matches.countries.map(groupItem)}
                        {matches.airports.map(a => (
                            <div
                                key={a.code}
                                className="autocomplete-item"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => selectAirport(a)}
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
            {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
        </div>
    );
});

export default AirportInput;
