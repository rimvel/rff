'use client';

import { forwardRef, useMemo, useState } from 'react';
import { AirportGroup, AirportIndex, searchAirports } from '@/lib/airportGroups';
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
    /** Called with comma-separated airport codes ('' when cleared) and the text to show */
    onSelect: (codes: string, text: string) => void;
}

const AirportInput = forwardRef<HTMLInputElement, AirportInputProps>(function AirportInput(
    { id, label, index, text, onTextChange, onSelect },
    ref,
) {
    const [open, setOpen] = useState(false);
    const matches = useMemo(() => searchAirports(index, text), [index, text]);
    const hasMatches = matches.regions.length + matches.cities.length + matches.countries.length + matches.airports.length > 0;

    const selectGroup = (group: AirportGroup) => {
        onSelect(group.airportCodes.join(','), `${group.name} - All (${group.airportCodes.length})`);
        setOpen(false);
    };

    const selectAirport = (airport: Airport) => {
        onSelect(airport.code, `${airport.code} - ${airport.name}`);
        setOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            setOpen(false);
            return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        // Prefer a city, then a region, then a country, then a single airport
        const group = matches.cities[0] ?? matches.regions[0] ?? matches.countries[0];
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
            <span className="flag-icon">{getFlagEmoji(group.countryCode)}</span>
            <div className="autocomplete-text">
                <strong>{group.name}</strong>
                <span className="autocomplete-sub">
                    {group.kind === 'region'
                        ? `Regional Group (${group.airportCodes.length} airports)`
                        : `All Airports (${group.airportCodes.length})`}
                </span>
            </div>
        </div>
    );

    return (
        <div className="form-group">
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
                    required
                />
                {text && (
                    <button
                        type="button"
                        className="clear-input-btn"
                        onClick={() => {
                            onSelect('', '');
                            if (ref && typeof ref !== 'function') ref.current?.focus();
                        }}
                        title={`Clear ${label}`}
                    >
                        ✕
                    </button>
                )}
                {open && hasMatches && (
                    <div className="autocomplete-dropdown">
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
        </div>
    );
});

export default AirportInput;
