// Display formatting shared by the results.

import { localToUtcMs, minutesAtSamePlace } from './time';

/** "50 min", "3 h", "8 h 10 min" */
export function formatDuration(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (h === 0) return `${rest} min`;
    return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** Calendar days from one local date or time to another: 1 for "the next day" ("+1" on an arrival). */
export function daysLater(fromLocal: string, toLocal: string): number {
    return Math.round((localToUtcMs(toLocal.slice(0, 10)) - localToUtcMs(fromLocal.slice(0, 10))) / 86_400_000);
}

/**
 * Time at the destination between landing and flying back (local times at one place).
 * Under a day: hours ("13 h"). A day or more: nights, counted like hotel nights
 * ("10 nights" from 24 Dec 14:00 to 3 Jan 11:00).
 */
export function formatStay(arrival: string, departure: string): string {
    const minutes = minutesAtSamePlace(arrival, departure);
    if (minutes < 24 * 60) return minutes < 60 ? formatDuration(minutes) : `${Math.floor(minutes / 60)} h`;
    const nights = daysLater(arrival, departure);
    return `${nights} night${nights === 1 ? '' : 's'}`;
}

/** Local time of day from "YYYY-MM-DDTHH:mm:ss": "06:45" */
export function formatTime(local: string): string {
    return local.slice(11, 16);
}

/** "Fri 13 Nov" */
export function formatDay(dateOrLocal: string): string {
    return new Date(localToUtcMs(dateOrLocal.slice(0, 10))).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    });
}

export function formatPrice(value: number): string {
    return `€${value.toFixed(2)}`;
}
