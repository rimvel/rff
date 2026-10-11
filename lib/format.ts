// Display formatting shared by the results.

import { localToUtcMs } from './time';

/** "50 min", "3 h", "8 h 10 min" */
export function formatDuration(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (h === 0) return `${rest} min`;
    return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** Long stays: "13 h", "7 d 13 h" */
export function formatStay(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    return days > 0 ? `${days} d ${hours % 24} h` : `${hours} h`;
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
