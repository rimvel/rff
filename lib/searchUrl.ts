// Converts searches and result-view settings to and from the page address,
// so a search can be shared, bookmarked and navigated with Back/Forward.

import { addDays } from './time';
import { DateDirection } from './types';

export interface SearchRequest {
    origin: string; // comma-separated airport codes
    dest: string;
    date: string;
    returnDate?: string;
    departureDateRange?: number;
    departureDateDirection?: DateDirection;
    returnDateRange?: number;
    returnDateDirection?: DateDirection;
}

export type SortOrder = 'cheapest' | 'fastest' | 'earliest';

export interface ResultView {
    sort: SortOrder;
    directOnly: boolean;
    maxLayoverHours?: number;
    maxPrice?: number;
}

export const DEFAULT_VIEW: ResultView = { sort: 'cheapest', directOnly: false };

/** Destination meaning "show the cheapest places to fly to" */
export const ANYWHERE = 'ANYWHERE';

const CODES = /^[A-Z]{3}(,[A-Z]{3})*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function direction(value: string | null): DateDirection | undefined {
    return value === 'both' || value === 'after' || value === 'before' ? value : undefined;
}

function positiveInt(value: string | null): number | undefined {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
}

function positiveNumber(value: string | null): number | undefined {
    const n = Number(value);
    return value && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Read a search from page parameters. Returns null unless from, to and date are all valid. */
export function readSearch(params: URLSearchParams): SearchRequest | null {
    const origin = (params.get('from') ?? '').toUpperCase();
    const dest = (params.get('to') ?? '').toUpperCase();
    const date = params.get('date') ?? '';
    if (!CODES.test(origin) || !(CODES.test(dest) || dest === ANYWHERE) || !DATE.test(date)) return null;

    const req: SearchRequest = { origin, dest, date };
    const returnDate = params.get('return');
    if (returnDate && DATE.test(returnDate)) req.returnDate = returnDate;

    const flex = positiveInt(params.get('flex'));
    if (flex) {
        req.departureDateRange = flex;
        req.departureDateDirection = direction(params.get('flexDir')) ?? 'both';
    }
    const returnFlex = positiveInt(params.get('returnFlex'));
    if (req.returnDate && returnFlex) {
        req.returnDateRange = returnFlex;
        req.returnDateDirection = direction(params.get('returnFlexDir')) ?? 'both';
    }
    return req;
}

export function readView(params: URLSearchParams): ResultView {
    const sort = params.get('sort');
    return {
        sort: sort === 'fastest' || sort === 'earliest' ? sort : 'cheapest',
        directOnly: params.get('direct') === '1',
        maxLayoverHours: positiveNumber(params.get('maxLayover')),
        maxPrice: positiveNumber(params.get('maxPrice')),
    };
}

/** Page parameters for a search and (optionally) how its results are shown. */
export function toPageParams(req: SearchRequest, view: ResultView = DEFAULT_VIEW): URLSearchParams {
    const p = new URLSearchParams({ from: req.origin, to: req.dest, date: req.date });
    if (req.returnDate) p.set('return', req.returnDate);
    if (req.departureDateRange) {
        p.set('flex', String(req.departureDateRange));
        if (req.departureDateDirection && req.departureDateDirection !== 'both') p.set('flexDir', req.departureDateDirection);
    }
    if (req.returnDate && req.returnDateRange) {
        p.set('returnFlex', String(req.returnDateRange));
        if (req.returnDateDirection && req.returnDateDirection !== 'both') p.set('returnFlexDir', req.returnDateDirection);
    }
    if (view.sort !== 'cheapest') p.set('sort', view.sort);
    if (view.directOnly) p.set('direct', '1');
    if (view.maxLayoverHours) p.set('maxLayover', String(view.maxLayoverHours));
    if (view.maxPrice) p.set('maxPrice', String(view.maxPrice));
    return p;
}

/** Address of the search API for a request. */
export function toApiUrl(req: SearchRequest): string {
    const p = new URLSearchParams({ origin: req.origin, dest: req.dest, date: req.date });
    if (req.returnDate) p.set('returnDate', req.returnDate);
    if (req.departureDateRange) {
        p.set('dateRangeDays', String(req.departureDateRange));
        p.set('dateDirection', req.departureDateDirection ?? 'both');
    }
    if (req.returnDate && req.returnDateRange) {
        p.set('returnDateRange', String(req.returnDateRange));
        p.set('returnDateDirection', req.returnDateDirection ?? 'both');
    }
    return `/api/search?${p}`;
}

/** Identifies a search, ignoring how its results are sorted or filtered. */
export function searchKey(req: SearchRequest | null): string {
    return req ? toPageParams(req).toString() : '';
}

/** The same search on another departure date; a round trip keeps its length. */
export function moveTrip(req: SearchRequest, date: string): SearchRequest {
    if (!req.returnDate) return { ...req, date };
    const tripDays = Math.round((Date.parse(req.returnDate) - Date.parse(req.date)) / 86_400_000);
    return { ...req, date, returnDate: addDays(date, tripDays) };
}
