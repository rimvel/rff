'use client';

import { Fragment } from 'react';
import { formatDay, formatDuration, formatPrice, formatStay, formatTime } from '@/lib/format';
import { layoverBadges, layoverMinutes } from '@/lib/layoverRisk';
import { isAllDirect } from '@/lib/resultFilters';
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
    return leg.type === 'direct' ? 'Direct' : `1 stop · ${leg.via}`;
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

/** The legs of one direction, top to bottom: stops, flights and layovers. */
function Timeline({ leg, placeName }: { leg: RouteResult; placeName: (code: string) => string }) {
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
                            <a
                                className="tl-book"
                                href={bookingUrl(flight.origin, flight.destination, flight.departureDate)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Book ${flight.origin} → ${flight.destination} on ryanair.com`}
                            >
                                {formatPrice(flight.price.value)} <span aria-hidden="true">↗</span>
                            </a>
                        </li>
                        <Stop time={formatTime(flight.arrivalDate)} code={flight.destination} placeName={placeName} dayShift={shift(flight.arrivalDate)} />
                        {next && (
                            <li className="tl-layover">
                                <span className="tl-line dashed" aria-hidden="true" />
                                <span className="tl-layover-text">
                                    {formatDuration(layoverMinutes(flight, next))} layover in {placeName(flight.destination)}
                                </span>
                                <span className="tl-badges">
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

export default function ResultCard({ result, placeName }: { result: SearchResult; placeName: (code: string) => string }) {
    const ret = result.returnFlights?.[0];
    const legs = ret ? [result, ret] : [result];
    const tickets = legs.reduce((n, leg) => n + leg.flights.length, 0);

    // One booking covers the whole trip only when every flight is direct
    let mainBookingUrl = '';
    if (!ret && result.type === 'direct') {
        mainBookingUrl = bookingUrl(result.origin, result.destination, result.flights[0].departureDate);
    } else if (ret && isAllDirect(result)) {
        mainBookingUrl = roundTripBookingUrl(result.origin, result.destination, result.flights[0].departureDate, ret.flights[0].departureDate);
    }

    const price = (
        <>
            <span className="price-value">{result.totalPrice.toFixed(2)}</span>
            <span className="price-currency">EUR</span>
        </>
    );

    const stayMinutes = ret ? minutesAtSamePlace(result.flights[result.flights.length - 1].arrivalDate, ret.flights[0].departureDate) : 0;

    return (
        <article className={`result-card ${isAllDirect(result) ? '' : 'layover'}`}>
            <header className="rc-header">
                <h3 className="rc-route">
                    {placeName(result.origin)} {ret ? '⇄' : '→'} {placeName(result.destination)}
                </h3>
                <div className="rc-meta">
                    {legs.map((leg, i) => (
                        <span key={i} className="rc-meta-leg">
                            <span className={`badge ${leg.type === 'direct' ? 'direct' : 'layover'}`}>{stopsLabel(leg)}</span>
                            {ret && <span className="rc-meta-dir">{i === 0 ? 'Out' : 'Back'}</span>}
                            <span>{formatDay(leg.flights[0].departureDate)} · {formatDuration(leg.duration)}</span>
                        </span>
                    ))}
                </div>
                <div className="rc-price">
                    {mainBookingUrl ? (
                        <a href={mainBookingUrl} target="_blank" rel="noopener noreferrer" className="price-link" title="Book on ryanair.com">
                            {price}
                        </a>
                    ) : (
                        <span className="price-link static">{price}</span>
                    )}
                    <span className="rc-price-note">
                        {mainBookingUrl ? 'total · book as one trip ↗' : `total · ${tickets} separate tickets`}
                    </span>
                </div>
            </header>

            <div className={`rc-legs ${ret ? 'two' : ''}`}>
                <section className="rc-leg">
                    {ret && <h4 className="rc-leg-title">Outbound · {formatDay(result.flights[0].departureDate)}</h4>}
                    <Timeline leg={result} placeName={placeName} />
                </section>
                {ret && (
                    <section className="rc-leg">
                        <h4 className="rc-leg-title">
                            Return · {formatDay(ret.flights[0].departureDate)}
                            <span className={`rc-stay ${stayMinutes < 240 ? 'short' : ''}`}>
                                {formatStay(stayMinutes)} in {placeName(result.destination)}
                            </span>
                        </h4>
                        <Timeline leg={ret} placeName={placeName} />
                    </section>
                )}
            </div>
        </article>
    );
}
