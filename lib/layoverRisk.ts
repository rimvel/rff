// How risky or uncomfortable a self-transfer connection is.

import { formatDuration } from './format';
import { minutesAtSamePlace } from './time';
import { Flight } from './types';

export const TIGHT_LAYOVER_MINUTES = 150; // with separate tickets, less than 2.5 h leaves little room for delays
export const LONG_LAYOVER_MINUTES = 480;

export interface LayoverBadge {
    kind: 'tight' | 'long' | 'overnight';
    label: string;
    explanation: string;
}

export function layoverMinutes(arriving: Flight, departing: Flight): number {
    return minutesAtSamePlace(arriving.arrivalDate, departing.departureDate);
}

export function layoverBadges(arriving: Flight, departing: Flight): LayoverBadge[] {
    const wait = layoverMinutes(arriving, departing);
    const badges: LayoverBadge[] = [];
    if (wait < TIGHT_LAYOVER_MINUTES) {
        badges.push({
            kind: 'tight',
            label: `Tight: ${formatDuration(wait)}`,
            explanation: 'Little time to collect bags, check in again and pass security if the first flight is late.',
        });
    } else if (wait > LONG_LAYOVER_MINUTES) {
        badges.push({ kind: 'long', label: `Long: ${formatDuration(wait)}`, explanation: 'A long wait at the airport.' });
    }
    if (arriving.arrivalDate.slice(0, 10) !== departing.departureDate.slice(0, 10)) {
        badges.push({ kind: 'overnight', label: 'Overnight', explanation: 'The connection is the next day.' });
    }
    return badges;
}
