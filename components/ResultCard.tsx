'use client';

import { Fragment, ReactNode, useId, useState } from 'react';
import { daysLater, formatDay, formatDuration, formatPrice, formatStay, formatTime } from '@/lib/format';
import { layoverBadges, layoverMinutes } from '@/lib/layoverRisk';
import { formatDayList, schoolBreakOn, timeOff } from '@/lib/lithuania';
import { distanceKm, transferMinutes } from '@/lib/mixedAirports';
import { isAllDirect, otherAirportsBack } from '@/lib/resultFilters';
import { minutesAtSamePlace } from '@/lib/time';
import { Flight, RouteResult, SearchResult } from '@/lib/types';

const localDay = (local: string) => local.slice(0, 10);

function bookingUrl(origin: string, destination: string, departure: string): string {
    return `https://www.ryanair.com/en/en/trip/flights/select?adt=1&chd=0&inf=0&originIata=${origin}&destinationIata=${destination}&dateOut=${localDay(departure)}&roundtrip=false`;
}

function roundTripBookingUrl(origin: string, destination: string, departureOut: string, departureIn: string): string {
    return `https://www.ryanair.com/en/en/trip/flights/select?adt=1&chd=0&inf=0&originIata=${origin}&destinationIata=${destination}&dateOut=${localDay(departureOut)}&dateIn=${localDay(departureIn)}&roundtrip=true`;
}

function stopsLabel(leg: RouteResult): string {
    if (leg.type === 'direct') return 'Direct';
    const [first, second] = leg.flights;
    return first.destination === second.origin ? `1 stop · ${leg.via}` : `1 stop · ${first.destination}→${second.origin}`;
}

const SELF_TRANSFER_HELP =
    'Separate tickets: collect your bags, check in again and go through security. ' +
    'If the first flight is late and you miss the second, the airline will not rebook you.';

function Stop({ time, code, placeName, dayShift }: { time: string; code: string; placeName: (code: string) => string; dayShift?: string }) {
    return (
        <li className="tl-stop">
            <span className="tl-dot" aria-hidden="true" />
            <span className="tl-time">{time}</span>
            <span className="tl-place">
                {placeName(code)} <span className="tl-code">{code}</span>
                {dayShift && <span className="tl-dayshift">{dayShift}</span>}
            </span>
        </li>
    );
}

/**
 * The legs of one direction, top to bottom: stops, flights and layovers.
 * `firstLeg` numbers the booking links ("Book leg 1"); without it the flights have no booking link
 * (a direct one-way, where the Book button above already books that flight).
 */
function Timeline({ leg, placeName, firstLeg }: { leg: RouteResult; placeName: (code: string) => string; firstLeg?: number }) {
    const startDay = localDay(leg.flights[0].departureDate);
    const shift = (local: string) => (localDay(local) !== startDay ? formatDay(local) : undefined);

    return (
        <ol className="timeline">
            {leg.flights.map((flight: Flight, i) => {
                const next = leg.flights[i + 1];
                return (
                    <Fragment key={`${flight.origin}-${flight.departureDate}`}>
                        <Stop time={formatTime(flight.departureDate)} code={flight.origin} placeName={placeName} dayShift={i > 0 ? shift(flight.departureDate) : undefined} />
                        <li className="tl-flight">
                            <span className="tl-line" aria-hidden="true" />
                            <span className="tl-flight-info">
                                ✈ {flight.flightNumber ?? 'Flight'}
                                {flight.minutes !== undefined && <> · {formatDuration(flight.minutes)}</>}
                            </span>
                            {firstLeg !== undefined && (
                                <a
                                    className="tl-book"
                                    href={bookingUrl(flight.origin, flight.destination, flight.departureDate)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`Book ${flight.origin} → ${flight.destination} on ryanair.com`}
                                >
                                    Book leg {firstLeg + i} <span aria-hidden="true">↗</span> {formatPrice(flight.price.value)}
                                </a>
                            )}
                        </li>
                        <Stop time={formatTime(flight.arrivalDate)} code={flight.destination} placeName={placeName} dayShift={shift(flight.arrivalDate)} />
                        {next && (
                            <li className="tl-layover">
                                <span className="tl-line dashed" aria-hidden="true" />
                                <span className="tl-layover-text">
                                    {flight.destination === next.origin
                                        ? `${formatDuration(layoverMinutes(flight, next))} layover in ${placeName(flight.destination)}`
                                        : `${formatDuration(layoverMinutes(flight, next))} to change from ${placeName(flight.destination)} to ${placeName(next.origin)}`}
                                </span>
                                <span className="tl-badges">
                                    {flight.destination !== next.origin && (
                                        <span
                                            className="risk-badge other-airport"
                                            title={`Collect your bags at ${placeName(flight.destination)} and travel to ${placeName(next.origin)}: about ${formatDuration(transferMinutes(flight.destination, next.origin) ?? 0)} by coach or public transport. Then check in again.`}
                                        >
                                            Airport change · ~{formatDuration(transferMinutes(flight.destination, next.origin) ?? 0)} transfer
                                        </span>
                                    )}
                                    {layoverBadges(flight, next).map(b => (
                                        <span key={b.kind} className={`risk-badge ${b.kind}`} title={b.explanation}>{b.label}</span>
                                    ))}
                                    <span className="risk-badge self-transfer" title={SELF_TRANSFER_HELP}>Self-transfer</span>
                                </span>
                            </li>
                        )}
                    </Fragment>
                );
            })}
        </ol>
    );
}

/** The return leaves from another airport in the same city. */
function OtherAirportBadge({ from, to, places }: { from: string; to: string; places: Places }) {
    const minutes = transferMinutes(from, to) ?? 0;
    return (
        <span
            className="risk-badge other-airport"
            title={`You arrive at ${places.name(from)} and fly back from ${places.name(to)}: about ${formatDuration(minutes)} between them by coach or public transport.`}
        >
            Other airport · ~{formatDuration(minutes)} away
        </span>
    );
}

/** The return lands at another of the home airports you selected. */
function OtherHomeBadge({ outFrom, backTo, places }: { outFrom: string; backTo: string; places: Places }) {
    const a = places.coordinates(outFrom);
    const b = places.coordinates(backTo);
    const km = a && b ? Math.round(distanceKm(a, b) / 5) * 5 : undefined;
    return (
        <span className="risk-badge other-airport" title={`You leave from ${places.name(outFrom)} but come back to ${places.name(backTo)}.`}>
            Lands in {places.city(backTo)}{km !== undefined && ` · ~${km} km from ${places.city(outFrom)}`}
        </span>
    );
}

/** Leave days, school break and missed school for a round trip (Lithuanian calendar). */
function TimeOffChips({ from, to }: { from: string; to: string }) {
    const off = timeOff(from, to);
    const leave = off.leaveDays.length;
    const schoolBreak = schoolBreakOn(from) ?? schoolBreakOn(to);
    return (
        <span className="rc-timeoff">
            <span className="time-chip" title={leave ? `Take ${formatDayList(off.leaveDays)}` : 'Only weekends and public holidays'}>
                🗓 {off.days} days · {leave === 0 ? 'no leave needed' : `${leave} leave day${leave === 1 ? '' : 's'}`}
            </span>
            {schoolBreak && <span className="time-chip">{schoolBreak.name}</span>}
            {off.schoolDays.length > 0 && (
                <span className="time-chip school" title={`School days missed: ${formatDayList(off.schoolDays)}`}>
                    Misses {off.schoolDays.length} school day{off.schoolDays.length === 1 ? '' : 's'}
                </span>
            )}
        </span>
    );
}

/** Small warnings for the collapsed row: a tight connection or a change of airports on the way. */
function connectionFlags(leg: RouteResult, placeName: (code: string) => string): ReactNode[] {
    const flags: ReactNode[] = [];
    leg.flights.forEach((flight, i) => {
        const next = leg.flights[i + 1];
        if (!next) return;
        if (flight.destination !== next.origin) {
            const transfer = formatDuration(transferMinutes(flight.destination, next.origin) ?? 0);
            flags.push(
                <span key={`change-${i}`} className="risk-badge other-airport" title={`Land at ${placeName(flight.destination)} and fly on from ${placeName(next.origin)}: about ${transfer} by coach or public transport.`}>
                    Airport change
                </span>
            );
        }
        const tight = layoverBadges(flight, next).find(b => b.kind === 'tight');
        if (tight) {
            flags.push(
                <span key={`tight-${i}`} className="risk-badge tight" title={`${formatDuration(layoverMinutes(flight, next))} to connect in ${placeName(flight.destination)}. ${tight.explanation}`}>
                    Tight layover
                </span>
            );
        }
    });
    return flags;
}

/** One direction in the collapsed row: times, day, duration, stops and warnings. */
function LegLine({ leg, label, flags }: { leg: RouteResult; label?: string; flags: ReactNode[] }) {
    const first = leg.flights[0];
    const last = leg.flights[leg.flights.length - 1];
    const later = daysLater(first.departureDate, last.arrivalDate);
    return (
        <span className={`rr-leg ${label ? 'with-label' : ''}`}>
            {label && <span className="rr-dir">{label}</span>}
            <span className="rr-times">
                {formatTime(first.departureDate)} → {formatTime(last.arrivalDate)}
                {later > 0 && (
                    <span className="rr-later" title={`Arrives ${formatDay(last.arrivalDate)}`}>
                        +{later}
                    </span>
                )}
            </span>
            <span className="rr-sub">
                <span className="rr-day">{formatDay(first.departureDate)}</span>
                <span className="rr-dur">{formatDuration(leg.duration)}</span>
                <span className={`rr-stops ${leg.type}`}>{stopsLabel(leg)}</span>
                {flags.length > 0 && <span className="rr-flags">{flags}</span>}
            </span>
        </span>
    );
}

/** How the result card names and locates airports. */
export interface Places {
    name: (code: string) => string; // "London Stansted"
    city: (code: string) => string; // "London"
    coordinates: (code: string) => { latitude: number; longitude: number } | undefined;
}

interface ResultCardProps {
    result: SearchResult;
    places: Places;
    /** Name the airports on top, e.g. when results go to different places. Trips that come back via another airport always show them. */
    showRoute: boolean;
}

/** One result: a compact row (times, duration, stops, price, Book) that opens to the full timeline. */
export default function ResultCard({ result, places, showRoute }: ResultCardProps) {
    const [open, setOpen] = useState(false);
    const toggle = () => setOpen(o => !o);
    const detailsId = useId();
    const placeName = places.name;
    const ret = result.returnFlights?.[0];
    const legs = ret ? [result, ret] : [result];
    const tickets = legs.reduce((n, leg) => n + leg.flights.length, 0);
    const back = otherAirportsBack(result);
    const backElsewhere = !!ret && (back.from || back.to);

    // One booking covers the whole trip only when every flight is direct (and, for a round trip,
    // it comes back between the same two airports)
    let mainBookingUrl = '';
    if (!ret && result.type === 'direct') {
        mainBookingUrl = bookingUrl(result.origin, result.destination, result.flights[0].departureDate);
    } else if (ret && isAllDirect(result) && !back.from && !back.to) {
        mainBookingUrl = roundTripBookingUrl(result.origin, result.destination, result.flights[0].departureDate, ret.flights[0].departureDate);
    }

    const stayMinutes = ret ? minutesAtSamePlace(result.flights[result.flights.length - 1].arrivalDate, ret.flights[0].departureDate) : 0;
    const price = formatPrice(result.totalPrice);

    const outFlags = connectionFlags(result, placeName);
    const backFlags = ret ? connectionFlags(ret, placeName) : [];
    if (ret && back.from) {
        backFlags.unshift(
            <span
                key="back-from"
                className="risk-badge other-airport"
                title={`You land at ${placeName(result.destination)} but fly back from ${placeName(ret.origin)}: about ${formatDuration(transferMinutes(result.destination, ret.origin) ?? 0)} between them.`}
            >
                Other airport
            </span>
        );
    }
    if (ret && back.to) {
        backFlags.push(
            <span key="back-to" className="risk-badge other-airport" title={`You leave from ${placeName(result.origin)} but come back to ${placeName(ret.destination)}.`}>
                Lands in {places.city(ret.destination)}
            </span>
        );
    }

    return (
        <article className={`result-card ${isAllDirect(result) ? '' : 'layover'} ${open ? 'open' : ''}`}>
            <div className="rr-head">
                <button type="button" className="rr-toggle" aria-expanded={open} aria-controls={detailsId} onClick={toggle}>
                    {(showRoute || backElsewhere) && (
                        <span className="rr-route">
                            {backElsewhere ? (
                                <>
                                    {placeName(result.origin)} → {placeName(result.destination)}
                                    <span className="rr-route-back">
                                        {' · back'}
                                        {back.from && ` from ${placeName(ret.origin)}`}
                                        {back.to && ` to ${placeName(ret.destination)}`}
                                    </span>
                                </>
                            ) : (
                                <>{placeName(result.origin)} {ret ? '⇄' : '→'} {placeName(result.destination)}</>
                            )}
                        </span>
                    )}
                    <LegLine leg={result} label={ret ? 'Out' : undefined} flags={outFlags} />
                    {ret && <LegLine leg={ret} label="Back" flags={backFlags} />}
                    <svg className="rr-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <div className="rr-buy">
                    <span className="rr-price">{price}</span>
                    {mainBookingUrl ? (
                        <a
                            className="rr-book"
                            href={mainBookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Book on ryanair.com, ${price} (opens in a new tab)`}
                        >
                            Book <span aria-hidden="true">↗</span>
                        </a>
                    ) : (
                        <span className="rr-tickets" title="Separate tickets: book each flight on its own (open the row for the links)">
                            {tickets} tickets
                        </span>
                    )}
                </div>
                {ret && (
                    // Full width under the row; the chips sit above the row's click layer (for their hover
                    // explanations), so clicking them opens the row too
                    <div className="rr-extra" onClick={toggle}>
                        <TimeOffChips
                            from={result.flights[0].departureDate.slice(0, 10)}
                            to={ret.flights[ret.flights.length - 1].arrivalDate.slice(0, 10)}
                        />
                    </div>
                )}
            </div>

            <div id={detailsId} className="rr-details" hidden={!open}>
                <div className={`rc-legs ${ret ? 'two' : ''}`}>
                    <section className="rc-leg">
                        {ret && <h4 className="rc-leg-title">Outbound · {formatDay(result.flights[0].departureDate)}</h4>}
                        <Timeline leg={result} placeName={placeName} firstLeg={mainBookingUrl && !ret ? undefined : 1} />
                    </section>
                    {ret && (
                        <section className="rc-leg">
                            <h4 className="rc-leg-title">
                                Return · {formatDay(ret.flights[0].departureDate)}
                                <span className={`rc-stay ${stayMinutes < 240 ? 'short' : ''}`}>
                                    {formatStay(result.flights[result.flights.length - 1].arrivalDate, ret.flights[0].departureDate)} in{' '}
                                    {back.from ? places.city(result.destination) : placeName(result.destination)}
                                </span>
                                {back.from && <OtherAirportBadge from={result.destination} to={ret.origin} places={places} />}
                                {back.to && <OtherHomeBadge outFrom={result.origin} backTo={ret.destination} places={places} />}
                            </h4>
                            <Timeline leg={ret} placeName={placeName} firstLeg={result.flights.length + 1} />
                        </section>
                    )}
                </div>
            </div>
        </article>
    );
}
