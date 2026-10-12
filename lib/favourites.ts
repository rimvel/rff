'use client';

import { useSyncExternalStore } from 'react';
import { SearchRequest } from './searchUrl';
import { addDays } from './time';

// Saved routes ("favourites"), kept only in this browser (localStorage). A route has no dates:
// it's searched on whatever dates you're looking at.

export interface FavouriteRoute {
    origin: string; // comma-separated airport codes, or ANYWHERE as the destination
    dest: string;
    tripDays?: number; // round trips: length in days
    fromLabel: string;
    toLabel: string;
}

const STORAGE_KEY = 'favouriteRoutes';
const MAX_FAVOURITES = 10;
const CHANGE = 'rff:favouriteschange';

let cachedRaw: string | null = null;
let cachedList: FavouriteRoute[] = [];
const EMPTY: FavouriteRoute[] = [];

export function routeKey(r: { origin: string; dest: string; tripDays?: number }): string {
    return `${r.origin}|${r.dest}|${r.tripDays ? 'return' : 'oneway'}`;
}

/** The route of a search, as it would be saved. */
export function routeOf(req: SearchRequest, fromLabel: string, toLabel: string): FavouriteRoute {
    const tripDays = req.returnDate ? Math.round((Date.parse(req.returnDate) - Date.parse(req.date)) / 86_400_000) : undefined;
    return { origin: req.origin, dest: req.dest, tripDays, fromLabel, toLabel };
}

/** A search for a saved route starting on `date` (a round trip keeps its saved length). */
export function searchFor(route: FavouriteRoute, date: string): SearchRequest {
    return {
        origin: route.origin,
        dest: route.dest,
        date,
        returnDate: route.tripDays !== undefined ? addDays(date, route.tripDays) : undefined,
    };
}

function readRaw(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function getSnapshot(): FavouriteRoute[] {
    const raw = readRaw();
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        try {
            const list = raw ? JSON.parse(raw) : [];
            cachedList = Array.isArray(list) ? list.filter((r: FavouriteRoute) => r?.origin && r.dest) : [];
        } catch {
            cachedList = [];
        }
    }
    return cachedList;
}

function subscribe(onChange: () => void) {
    window.addEventListener('storage', onChange);
    window.addEventListener(CHANGE, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(CHANGE, onChange);
    };
}

export function useFavourites(): FavouriteRoute[] {
    return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

function write(list: FavouriteRoute[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
        return; // storage unavailable (e.g. private mode)
    }
    window.dispatchEvent(new Event(CHANGE));
}

export function isFavourite(route: FavouriteRoute, list: FavouriteRoute[] = getSnapshot()): boolean {
    return list.some(r => routeKey(r) === routeKey(route));
}

/** Save the route, or remove it if it's already saved. Newest first, at most 10. */
export function toggleFavourite(route: FavouriteRoute) {
    const list = getSnapshot();
    if (isFavourite(route, list)) {
        write(list.filter(r => routeKey(r) !== routeKey(route)));
    } else {
        write([route, ...list].slice(0, MAX_FAVOURITES));
    }
}

export function removeFavourite(route: FavouriteRoute) {
    write(getSnapshot().filter(r => routeKey(r) !== routeKey(route)));
}
