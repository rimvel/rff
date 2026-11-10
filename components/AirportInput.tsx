'use client';

import { forwardRef, ReactNode, useEffect, useMemo, useState } from 'react';
import { AirportGroup, AirportIndex, searchAirports } from '@/lib/airportGroups';
import { ANYWHERE } from '@/lib/searchUrl';
import Icon from './Icon';

const getFlagEmoji = (countryCode: string) =>
    countryCode
        .toUpperCase()
        .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));

/** One row of the list: what it shows and the airport codes it stands for */
interface Option {
    key: string;
    codes: string;
    className: string;
    content: ReactNode;
}

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
    // Position in the list of the option highlighted with the arrow keys or the mouse; -1 for none
    const [active, setActive] = useState(-1);
    const matches = useMemo(() => searchAirports(index, text), [index, text]);
    const typed = text.trim().toLowerCase();
    const showAnywhere = allowAnywhere && (typed === '' || 'anywhere'.startsWith(typed));

    const close = () => {
        setOpen(false);
        setActive(-1);
    };

    const select = (codes: string) => {
        onSelect(codes);
        close();
    };

    const flag = (icon: string) => <span className="flag-icon" aria-hidden="true">{icon}</span>;

    const groupOption = (group: AirportGroup): Option => ({
        key: `${group.kind}-${group.name}-${group.countryCode}`,
        codes: group.airportCodes.join(','),
        className: group.kind === 'country' ? 'autocomplete-country' : 'autocomplete-city',
        content: (
            <>
                {flag(group.icon ?? getFlagEmoji(group.countryCode))}
                <div className="autocomplete-text">
                    <strong>{group.name}</strong>
                    <span className="autocomplete-sub">
                        {group.kind !== 'region'
                            ? `All airports (${group.airportCodes.length})`
                            : group.description
                              ? `${group.description} · ${group.airportCodes.length} airports`
                              : `Regional group (${group.airportCodes.length} airports)`}
                    </span>
                </div>
            </>
        ),
    });

    // Everything in the list, in the order shown, so the arrow keys can walk through it
    const options: Option[] = [
        ...(showAnywhere
            ? [{
                key: 'anywhere',
                codes: ANYWHERE,
                className: 'autocomplete-city',
                content: (
                    <>
                        {flag('🌍')}
                        <div className="autocomplete-text">
                            <strong>Anywhere</strong>
                            <span className="autocomplete-sub">Cheapest places to fly to</span>
                        </div>
                    </>
                ),
            }]
            : []),
        ...matches.regions.map(groupOption),
        ...matches.cities.map(groupOption),
        ...matches.countries.map(groupOption),
        ...matches.airports.map(a => ({
            key: a.code,
            codes: a.code,
            className: '',
            content: (
                <>
                    {flag(getFlagEmoji(a.country.code))}
                    <div className="autocomplete-text">
                        <strong>{a.name} ({a.code})</strong>
                        <span className="autocomplete-sub">{a.country.name}</span>
                    </div>
                </>
            ),
        })),
    ];
    const listOpen = open && options.length > 0;
    const listId = `${id}-list`;
    const optionId = (i: number) => `${id}-option-${i}`;
    // The highlighted option, if the list still has it
    const activeOption = listOpen && active >= 0 && active < options.length ? active : -1;

    // Keep the highlighted option in view while moving through a long list
    useEffect(() => {
        if (activeOption >= 0) document.getElementById(`${id}-option-${activeOption}`)?.scrollIntoView({ block: 'nearest' });
    }, [activeOption, id]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            close();
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (options.length === 0) return;
            e.preventDefault(); // keep the text cursor where it is
            setOpen(true);
            const step = e.key === 'ArrowDown' ? 1 : -1;
            // From the text field, Down goes to the first option and Up to the last; then round and round
            setActive(activeOption < 0 ? (step === 1 ? 0 : options.length - 1) : (activeOption + step + options.length) % options.length);
            return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (activeOption >= 0) {
            select(options[activeOption].codes);
            return;
        }
        // Nothing highlighted: take the best match for what was typed
        if (showAnywhere && typed.length >= 3) {
            select(ANYWHERE);
            return;
        }
        // Prefer a city, then a country typed in full ("France", not "South of France"), then a region,
        // then a country, then a single airport
        const country = matches.countries.find(c => c.name.toLowerCase() === typed);
        const group = matches.cities[0] ?? country ?? matches.regions[0] ?? matches.countries[0];
        if (group) select(group.airportCodes.join(','));
        else if (matches.airports[0]) select(matches.airports[0].code);
    };

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
                        setActive(-1);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={close}
                    onKeyDown={handleKeyDown}
                    placeholder="Airport code or name"
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={listOpen}
                    aria-controls={listId}
                    aria-activedescendant={activeOption >= 0 ? optionId(activeOption) : undefined}
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
                        aria-label={`Clear ${label}`}
                    >
                        <Icon name="close" />
                    </button>
                )}
                {listOpen && (
                    <div className="autocomplete-dropdown" id={listId} role="listbox" aria-label={`${label}: suggestions`}>
                        {options.map((option, i) => (
                            <div
                                key={option.key}
                                id={optionId(i)}
                                role="option"
                                aria-selected={i === activeOption}
                                className={`autocomplete-item ${option.className} ${i === activeOption ? 'is-active' : ''}`}
                                onMouseDown={e => e.preventDefault()}
                                onMouseMove={() => setActive(i)}
                                onClick={() => select(option.codes)}
                            >
                                {option.content}
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
