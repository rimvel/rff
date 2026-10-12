'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { formatDay, formatDuration, formatPrice } from '@/lib/format';
import { isAllDirect } from '@/lib/resultFilters';
import { SearchResult } from '@/lib/types';
import type { Places } from './ResultCard';

// Map tiles from OpenStreetMap: no key needed; their usage policy allows light use like this with attribution
// (https://operations.osmfoundation.org/policies/tiles/). For heavy traffic, switch to a hosted tile service.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Follows the site's light/dark theme (the toggle sets data-theme; otherwise the system setting). */
function useDarkTheme(): boolean {
    return useSyncExternalStore(
        onChange => {
            const observer = new MutationObserver(onChange);
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
            const media = window.matchMedia('(prefers-color-scheme: dark)');
            media.addEventListener('change', onChange);
            return () => {
                observer.disconnect();
                media.removeEventListener('change', onChange);
            };
        },
        () => {
            const theme = document.documentElement.getAttribute('data-theme');
            return theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
        },
        () => false,
    );
}

/** Zooms the map to show every pin. */
function FitBounds({ points }: { points: [number, number][] }) {
    const map = useMap();
    const key = points.map(p => p.join(',')).join(';');
    useEffect(() => {
        if (points.length > 0) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 7 });
        // `key` stands for `points`, which is a new array on every render
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, key]);
    return null;
}

function pinIcon(price: number, tier: 'cheap' | 'normal') {
    return L.divIcon({
        className: 'map-pin-wrapper',
        html: `<div class="map-pin ${tier}">€${Math.round(price)}</div>`,
        iconSize: undefined,
        iconAnchor: [24, 14],
    });
}

interface AnywhereMapProps {
    results: SearchResult[]; // one per destination, already sorted and filtered
    origins: string[];
    places: Places;
    /** "See flights": search this destination on the same dates */
    onSearchDestination: (code: string) => void;
}

/** "Anywhere" destinations as price pins on a map. */
export default function AnywhereMap({ results, origins, places, onSearchDestination }: AnywhereMapProps) {
    const dark = useDarkTheme();

    const pins = useMemo(() => {
        const prices = results.map(r => r.totalPrice).sort((a, b) => a - b);
        const cheapLimit = prices.length ? prices[Math.floor((prices.length - 1) / 4)] : 0;
        return results.flatMap(r => {
            const c = places.coordinates(r.destination);
            return c ? [{ result: r, position: [c.latitude, c.longitude] as [number, number], tier: r.totalPrice <= cheapLimit ? 'cheap' as const : 'normal' as const }] : [];
        });
    }, [results, places]);

    const homes = origins.flatMap(code => {
        const c = places.coordinates(code);
        return c ? [{ code, position: [c.latitude, c.longitude] as [number, number] }] : [];
    });

    return (
        <div className="anywhere-map">
            <MapContainer center={[50, 15]} zoom={4} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                {/* Dark mode: the same tiles, darkened with a colour filter (see .map-tiles-dark) */}
                <TileLayer key={dark ? 'dark' : 'light'} url={TILES} attribution={ATTRIBUTION} maxZoom={19} className={dark ? 'map-tiles-dark' : ''} />
                <FitBounds points={[...homes.map(h => h.position), ...pins.map(p => p.position)]} />

                {homes.map(h => (
                    <CircleMarker key={h.code} center={h.position} radius={8} pathOptions={{ color: '#5b3687', fillColor: '#8b5cf6', fillOpacity: 1, weight: 3 }}>
                        <Tooltip direction="top" offset={[0, -8]}>From {places.name(h.code)}</Tooltip>
                    </CircleMarker>
                ))}

                {pins.map(({ result: r, position, tier }) => {
                    const ret = r.returnFlights?.[0];
                    return (
                        <Marker key={r.destination} position={position} icon={pinIcon(r.totalPrice, tier)}>
                            <Popup>
                                <div className="map-popup">
                                    <strong>{places.name(r.destination)}</strong>
                                    <div className="map-popup-price">{formatPrice(r.totalPrice)}{ret ? ' return' : ''}</div>
                                    <div>
                                        {isAllDirect(r) ? 'Direct' : r.type === 'direct' ? 'Direct out, 1 stop back' : `1 stop via ${r.via}`}
                                        {' · '}from {places.city(r.origin)}
                                    </div>
                                    <div>
                                        {formatDay(r.flights[0].departureDate)} · {formatDuration(r.duration)}
                                        {ret && <> · back {formatDay(ret.flights[0].departureDate)}</>}
                                    </div>
                                    <button type="button" className="suggestion-btn map-popup-btn" onClick={() => onSearchDestination(r.destination)}>
                                        See flights
                                    </button>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
}
