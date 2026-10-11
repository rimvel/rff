'use client';

import { useSyncExternalStore } from 'react';
import { SearchRequest, searchKey } from './searchUrl';
import { todayLocal } from './time';

// Recent searches, kept only in this browser (localStorage).

export interface RecentSearch {
    request: SearchRequest;
    fromLabel: string;
    toLabel: string;
}

const STORAGE_KEY = 'recentSearches';
const MAX_RECENT = 5;
const CHANGE = 'rff:recentchange';

let cachedRaw: string | null = null;
let cachedList: RecentSearch[] = [];
const EMPTY: RecentSearch[] = [];

function readRaw(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function parse(raw: string | null): RecentSearch[] {
    if (!raw) return [];
    try {
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return [];
        // Searches for dates that have passed are no longer useful
        const today = todayLocal();
        return list.filter((r: RecentSearch) => r?.request?.origin && r.request.dest && r.request.date >= today);
    } catch {
        return [];
    }
}

function getSnapshot(): RecentSearch[] {
    const raw = readRaw();
    if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedList = parse(raw);
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

export function useRecentSearches(): RecentSearch[] {
    return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function saveRecentSearch(entry: RecentSearch) {
    const key = searchKey(entry.request);
    const list = [entry, ...getSnapshot().filter(r => searchKey(r.request) !== key)].slice(0, MAX_RECENT);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
        return; // storage unavailable (e.g. private mode)
    }
    window.dispatchEvent(new Event(CHANGE));
}

export function clearRecentSearches() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        return;
    }
    window.dispatchEvent(new Event(CHANGE));
}
