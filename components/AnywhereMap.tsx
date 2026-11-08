'use client';

import 'leaflet/dist/leaflet.css';
import L, { LatLngTuple } from 'leaflet';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { formatDay, formatDuration, formatPrice } from '@/lib/format';
import { isAllDirect } from '@/lib/resultFilters';
import { SearchResult } from '@/lib/types';
import type { Places } from './ResultCard';

// Map tiles from OpenStreetMap: no key needed; their usage policy allows light use like this with attribution
// (https://operations.osmfoundation.org/policies/tiles/). For heavy traffic, switch to a hosted tile service.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** How the map frames the pins: room around the edges for the labels, and never closer than a region */
const FIT_PADDING = 32;
const FIT_MAX_ZOOM = 6;
const FIT_OPTIONS: L.FitBoundsOptions = { padding: [FIT_PADDING, FIT_PADDING], maxZoom: FIT_MAX_ZOOM };

/** Price labels at the zoom that frames every pin. Zooming in allows more, so about this many stay on screen. */
const LABELS_AT_FIT = 20;

/** Size of a price label (.map-pin) in pixels, plus the gap kept between labels */
const LABEL_HEIGHT = 24;
const labelWidth = (text: string) => 18 + 8 * text.length;
const LABEL_GAP = 3;

/** Size of the "From …" circle, which labels keep clear of */
const HOME_SIZE = 22;

interface Pin {
    result: SearchResult;
    position: LatLngTuple;
    tier: 'cheap' | 'normal';
    label: string; // "€43"
}

interface Home {
    code: string;
    position: LatLngTuple;
}

interface Box {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

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

/** The same points in any order give the same key, so re-sorting the results doesn't move the map. */
function pointsKey(points: LatLngTuple[]): string {
    return points.map(p => p.join(',')).sort().join(';');
}

/** A width × height box centred on `position`, in pixels at `zoom`. */
function boxAt(position: LatLngTuple, width: number, height: number, zoom: number): Box {
    const p = L.CRS.EPSG3857.latLngToPoint(L.latLng(position), zoom);
    return { left: p.x - width / 2, top: p.y - height / 2, right: p.x + width / 2, bottom: p.y + height / 2 };
}

function overlaps(a: Box, b: Box): boolean {
    return a.left < b.right + LABEL_GAP && b.left < a.right + LABEL_GAP && a.top < b.bottom + LABEL_GAP && b.top < a.bottom + LABEL_GAP;
}

/**
 * Which destinations get a price label at this zoom. The cheapest go first, and a label that would overlap one already
 * placed (or the "From" circle) is left out; those destinations show as dots. At the zoom that frames everything only
 * the LABELS_AT_FIT cheapest are candidates; each zoom level in quadruples that, as the view covers a quarter of the area.
 */
function pickLabels(pins: Pin[], homes: Home[], zoom: number, fitZoom: number): Set<string> {
    const limit = Math.round(LABELS_AT_FIT * 4 ** Math.max(0, zoom - fitZoom));
    const placed = homes.map(h => boxAt(h.position, HOME_SIZE, HOME_SIZE, zoom));
    const labelled = new Set<string>();
    const cheapestFirst = [...pins].sort((a, b) => a.result.totalPrice - b.result.totalPrice).slice(0, limit);
    for (const pin of cheapestFirst) {
        const box = boxAt(pin.position, labelWidth(pin.label), LABEL_HEIGHT, zoom);
        if (placed.some(other => overlaps(box, other))) continue;
        placed.push(box);
        labelled.add(pin.result.destination);
    }
    return labelled;
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

/** The two looks of a destination: a price label, or a small dot (name and price on hover, details on click). */
function pinIcons(pin: Pin, name: string) {
    // Screen readers get the name and price; the marker itself is a focusable button (Leaflet's keyboard option)
    const spoken = `<span class="map-sr">${escapeHtml(`${name}, ${formatPrice(pin.result.totalPrice)}`)}</span>`;
    return {
        label: L.divIcon({
            className: 'map-pin-wrapper',
            html: `<div class="map-pin ${pin.tier}" aria-hidden="true">${pin.label}</div>${spoken}`,
            iconSize: [0, 0], // the label centres itself on the point (see .map-pin)
            popupAnchor: [0, -LABEL_HEIGHT / 2],
            tooltipAnchor: [0, -LABEL_HEIGHT / 2],
        }),
        dot: L.divIcon({
            className: 'map-pin-wrapper',
            html: `<div class="map-dot ${pin.tier}" aria-hidden="true"></div>${spoken}`,
            iconSize: [0, 0],
            popupAnchor: [0, -6],
            tooltipAnchor: [0, -6],
        }),
    };
}

interface DestinationPinsProps {
    pins: Pin[];
    homes: Home[];
    places: Places;
    onSearchDestination: (code: string) => void;
    dark: boolean;
}

/** The pins, labelled for the current zoom; also re-frames the map when the pins change (e.g. after a filter). */
function DestinationPins({ pins, homes, places, onSearchDestination, dark }: DestinationPinsProps) {
    const map = useMap();
    const [zoom, setZoom] = useState(() => map.getZoom());
    useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

    const points = useMemo(() => [...homes.map(h => h.position), ...pins.map(p => p.position)], [homes, pins]);
    const key = pointsKey(points);

    // The map opens already framed on the pins (MapContainer's bounds); frame them again whenever they change
    const framed = useRef(key);
    useEffect(() => {
        if (key === framed.current || points.length === 0) return;
        framed.current = key;
        map.fitBounds(L.latLngBounds(points), FIT_OPTIONS);
        // `key` stands for `points`, which can be a new array with the same pins
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, key]);

    // The zoom that frames every pin: the baseline for how many labels to show
    const fitZoom = useMemo(
        () => (points.length > 0
            ? Math.min(map.getBoundsZoom(L.latLngBounds(points), false, L.point(2 * FIT_PADDING, 2 * FIT_PADDING)), FIT_MAX_ZOOM)
            : map.getZoom()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [map, key],
    );

    const labelled = useMemo(() => pickLabels(pins, homes, zoom, fitZoom), [pins, homes, zoom, fitZoom]);
    const icons = useMemo(() => new Map(pins.map(p => [p.result.destination, pinIcons(p, places.name(p.result.destination))])), [pins, places]);

    return (
        <>
            {homes.map(h => (
                // A light ring in dark mode, where the dark one disappears into the map
                <CircleMarker key={h.code} center={h.position} radius={8} pathOptions={{ color: dark ? '#ede9fe' : '#5b3687', fillColor: '#8b5cf6', fillOpacity: 1, weight: 3 }}>
                    <Tooltip direction="top" offset={[0, -8]}>From {places.name(h.code)}</Tooltip>
                </CircleMarker>
            ))}

            {pins.map(({ result: r, position }) => {
                const ret = r.returnFlights?.[0];
                const isLabel = labelled.has(r.destination);
                const icon = icons.get(r.destination)!;
                return (
                    <Marker key={r.destination} position={position} icon={isLabel ? icon.label : icon.dot} zIndexOffset={isLabel ? 1000 : 0}>
                        <Tooltip direction="top" offset={[0, -4]}>
                            {places.name(r.destination)} · <strong>{formatPrice(r.totalPrice)}</strong>
                        </Tooltip>
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
        </>
    );
}

interface AnywhereMapProps {
    results: SearchResult[]; // one per destination, already sorted and filtered
    origins: string[];
    places: Places;
    /** "See flights": search this destination on the same dates */
    onSearchDestination: (code: string) => void;
}

/** "Anywhere" destinations on a map: price labels for the cheapest, dots for the rest. */
export default function AnywhereMap({ results, origins, places, onSearchDestination }: AnywhereMapProps) {
    const dark = useDarkTheme();

    const pins = useMemo<Pin[]>(() => {
        const prices = results.map(r => r.totalPrice).sort((a, b) => a - b);
        const cheapLimit = prices.length ? prices[Math.floor((prices.length - 1) / 4)] : 0;
        return results.flatMap(r => {
            const c = places.coordinates(r.destination);
            return c
                ? [{
                    result: r,
                    position: [c.latitude, c.longitude] as LatLngTuple,
                    tier: r.totalPrice <= cheapLimit ? 'cheap' as const : 'normal' as const,
                    label: `€${Math.round(r.totalPrice)}`,
                }]
                : [];
        });
    }, [results, places]);

    const originsKey = origins.join(',');
    const homes = useMemo<Home[]>(() => originsKey.split(',').flatMap(code => {
        const c = places.coordinates(code);
        return c ? [{ code, position: [c.latitude, c.longitude] as LatLngTuple }] : [];
    }), [originsKey, places]);

    // Open framed on the pins (only read when the map is created; DestinationPins re-frames after that)
    const points = [...homes.map(h => h.position), ...pins.map(p => p.position)];
    const view = points.length > 0
        ? { bounds: L.latLngBounds(points), boundsOptions: FIT_OPTIONS }
        : { center: [50, 15] as LatLngTuple, zoom: 4 };

    return (
        <div className="anywhere-map">
            {/* zoomSnap: fractional zoom frames the pins more tightly than whole steps */}
            <MapContainer {...view} zoomSnap={0.25} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                {/* Faded so the pins stand out; dark mode inverts the same tiles (see .map-tiles, .map-tiles-dark) */}
                <TileLayer key={dark ? 'dark' : 'light'} url={TILES} attribution={ATTRIBUTION} maxZoom={19} className={dark ? 'map-tiles map-tiles-dark' : 'map-tiles'} />
                <DestinationPins pins={pins} homes={homes} places={places} onSearchDestination={onSearchDestination} dark={dark} />
            </MapContainer>
        </div>
    );
}
