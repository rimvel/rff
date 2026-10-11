'use client';

import { useSyncExternalStore } from 'react';
import { todayLocal } from './time';

// The page's query string as React state. On the server (and during hydration) it is empty,
// so the pre-rendered page always matches; the real address is picked up right after.

const URL_CHANGE = 'rff:urlchange';

// Counts address changes that should reset the search form (shared link, Back/Forward, picking a
// recent search), but not the ones the form itself caused. Starts at 1 so the form is re-created
// with the real address right after the page loads.
let formVersion = 1;
let listening = false;

function subscribe(onChange: () => void) {
    if (!listening) {
        // Registered first, so the version is already updated when the listeners below run
        window.addEventListener('popstate', () => formVersion++);
        listening = true;
    }
    window.addEventListener('popstate', onChange);
    window.addEventListener(URL_CHANGE, onChange);
    return () => {
        window.removeEventListener('popstate', onChange);
        window.removeEventListener(URL_CHANGE, onChange);
    };
}

export function useQueryString(): string {
    return useSyncExternalStore(subscribe, () => window.location.search, () => '');
}

/** Changes whenever the search form should be re-created from the address. */
export function useFormVersion(): number {
    return useSyncExternalStore(subscribe, () => formVersion, () => 0);
}

/**
 * Change the query string. `replace` updates the current history entry instead of adding one;
 * `keepForm` leaves the search form as it is (because the change came from it).
 */
export function setQueryString(params: URLSearchParams, { replace = false, keepForm = false } = {}) {
    if (!keepForm) formVersion++;
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    if (replace) window.history.replaceState(window.history.state, '', url);
    else window.history.pushState(window.history.state, '', url);
    window.dispatchEvent(new Event(URL_CHANGE));
}

const noSubscription = () => () => {};

/** Today's date in the user's time zone; '' on the server, so pre-rendered HTML never has a stale date. */
export function useToday(): string {
    return useSyncExternalStore(noSubscription, todayLocal, () => '');
}
