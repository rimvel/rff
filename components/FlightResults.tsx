'use client';

import { useMemo } from 'react';
import { useAirports } from '@/lib/useAirports';
import { localToUtcMs } from '@/lib/time';
import { Flight, RouteResult, SearchResult } from '@/lib/types';

interface FlightResultsProps {
    results: SearchResult[];
    isRoundTrip?: boolean;
}

function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
}

// Flight times are local to their airport, so show them exactly as given (no time zone conversion)
function formatDateTime(local: string): string {
    return new Date(localToUtcMs(local)).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
    });
}

function formatDay(date: string): string {
    return new Date(localToUtcMs(date)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Minutes between two local times at the same airport. */
function minutesAtAirport(from: string, to: string): number {
    return (localToUtcMs(to) - localToUtcMs(from)) / 60000;
}

const localDay = (local: string) => local.slice(0, 10);

function getBookingUrl(origin: string, destination: string, departure: string): string {
    return `https://www.ryanair.com/en/en/trip/flights/select?adt=1&chd=0&inf=0&originIata=${origin}&destinationIata=${destination}&dateOut=${localDay(departure)}&roundtrip=false`;
}

function getRoundTripBookingUrl(origin: string, destination: string, departureOut: string, departureIn: string): string {
    return `https://www.ryanair.com/en/en/trip/flights/select?adt=1&chd=0&inf=0&originIata=${origin}&destinationIata=${destination}&dateOut=${localDay(departureOut)}&dateIn=${localDay(departureIn)}&roundtrip=true`;
}

// Flights at Vilnius between 19:00 and 03:00 risk cancellation due to meteorological balloons
function isVilniusBalloonRisk(local: string, airport: string): boolean {
    if (airport !== 'VNO') return false;
    const hour = Number(local.slice(11, 13));
    return hour >= 19 || hour < 3;
}

function hasVilniusBalloonRisk(result: SearchResult): boolean {
    const flights = [...result.flights, ...(result.returnFlights?.[0]?.flights ?? [])];
    return flights.some(f => isVilniusBalloonRisk(f.departureDate, f.origin) || isVilniusBalloonRisk(f.arrivalDate, f.destination));
}

function Price({ result, bookingUrl }: { result: SearchResult; bookingUrl: string }) {
    const content = (
        <>
            <span className="price-value">{result.totalPrice.toFixed(2)}</span>
            <span className="price-currency">{result.currency}</span>
        </>
    );
    if (!bookingUrl) return content;
    return (
        <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="price-link" title="Book official flights">
            {content}
        </a>
    );
}

function Layover({ arriving, departing }: { arriving: Flight; departing: Flight }) {
    const waitMinutes = minutesAtAirport(arriving.arrivalDate, departing.departureDate);
    let warning: { text: string; className: string } | null = null;
    if (waitMinutes > 480) warning = { text: '⚠️ Long!', className: 'layover-warning-long' };
    else if (waitMinutes < 90) warning = { text: '⚡ Short!', className: 'layover-warning-short' };

    return (
        <div className="connection-info">
            Layover at {arriving.destination} • {formatDuration(waitMinutes)} wait
            {warning && <> <span className={`layover-warning ${warning.className}`}>{warning.text}</span></>}
        </div>
    );
}

function FlightSegments({ flights }: { flights: Flight[] }) {
    return (
        <>
            {flights.map((flight, i) => (
                <div key={`${flight.flightNumber}-${flight.departureDate}`} className="flight-segment">
                    <div className="flight-info">
                        <div className="flight-time">
                            <div className="time-point">
                                <span className="time">{formatDateTime(flight.departureDate)}</span>
                                <span className="airport">{flight.origin}</span>
                            </div>
                            <div className="flight-line">
                                <div className="line"></div>
                                <span className="flight-number">{flight.flightNumber}</span>
                            </div>
                            <div className="time-point">
                                <span className="time">{formatDateTime(flight.arrivalDate)}</span>
                                <span className="airport">{flight.destination}</span>
                            </div>
                        </div>
                        <div className="flight-price">
                            <a
                                href={getBookingUrl(flight.origin, flight.destination, flight.departureDate)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="segment-price-link"
                                title={`Book ${flight.origin} → ${flight.destination}`}
                            >
                                {flight.price.value.toFixed(2)} {flight.price.currencyCode}
                                <span className="book-icon">↗</span>
                            </a>
                        </div>
                    </div>
                    {i < flights.length - 1 && <Layover arriving={flight} departing={flights[i + 1]} />}
                </div>
            ))}
        </>
    );
}

function ReturnLeg({ result, ret, cityName }: { result: SearchResult; ret: RouteResult; cityName: (code: string) => string }) {
    const outboundArrival = result.flights[result.flights.length - 1].arrivalDate;
    const stayHours = Math.floor(minutesAtAirport(outboundArrival, ret.flights[0].departureDate) / 60);
    const stayDays = Math.floor(stayHours / 24);
    const stayText = stayDays > 0 ? `${stayDays}d ${stayHours % 24}h` : `${stayHours}h`;

    return (
        <>
            <div className="flight-separator">
                <div className="separator-line"></div>
                <div className="separator-content">
                    <div className="arrow-down">↓</div>
                    <span className="stay-duration">
                        {stayText} at {result.destination}
                        {stayHours < 4 && (
                            <> <span className="layover-warning layover-warning-short" style={{ marginLeft: '0.5rem' }}>(⚡ Short stay!)</span></>
                        )}
                    </span>
                </div>
                <div className="separator-line"></div>
            </div>

            <div className="result-header return-header">
                <div className="result-header-content">
                    <div className="header-top-row">
                        <div className="badge-group">
                            <span className="badge direction-badge">Return</span>
                            {ret.type === 'direct' ? (
                                <span className="badge direct">Direct</span>
                            ) : (
                                <span className="badge layover">Via {ret.via}</span>
                            )}
                            {ret.searchDate && <span className="badge date-badge">{formatDay(ret.searchDate)}</span>}
                            <span className="badge duration-badge">{formatDuration(ret.duration)}</span>
                        </div>
                    </div>

                    <div className="route-info-container">
                        <div className="route-cities">
                            {cityName(result.destination)} → {cityName(result.origin)}
                        </div>
                    </div>
                </div>
            </div>
            <FlightSegments flights={ret.flights} />
        </>
    );
}

function ResultCard({ result, cityName }: { result: SearchResult; cityName: (code: string) => string }) {
    const ret = result.returnFlights?.[0];

    let bookingUrl = '';
    if (result.type === 'direct' && !result.isRoundTrip) {
        bookingUrl = getBookingUrl(result.origin, result.destination, result.flights[0].departureDate);
    } else if (result.type === 'direct' && ret?.type === 'direct') {
        bookingUrl = getRoundTripBookingUrl(result.origin, result.destination, result.flights[0].departureDate, ret.flights[0].departureDate);
    }

    return (
        <div className="result-card">
            <div className="result-header">
                <div className="result-header-content">
                    <div className="header-top-row">
                        <div className="badge-group">
                            <span className="badge direction-badge">DEPARTURE</span>
                            <span className={`badge ${result.type === 'direct' ? 'direct' : 'layover'}`}>
                                {result.type === 'direct' ? 'DIRECT' : `LAYOVER (${result.via})`}
                            </span>
                            {result.searchDate && <span className="badge date-badge">{formatDay(result.searchDate)}</span>}
                            <span className="badge duration-badge">{formatDuration(result.duration)}</span>
                        </div>

                        {/* Mobile: price in the top row */}
                        <div className="result-price mobile-price">
                            <Price result={result} bookingUrl={bookingUrl} />
                        </div>
                    </div>

                    <div className="route-info-container">
                        <div className="route-cities">
                            {cityName(result.origin)} → {cityName(result.destination)}
                        </div>
                    </div>
                </div>

                {/* Desktop: price on the right */}
                <div className="result-price desktop-price">
                    <Price result={result} bookingUrl={bookingUrl} />
                </div>
            </div>

            {hasVilniusBalloonRisk(result) && (
                <div className="vilnius-balloon-warning">
                    Cancellation risk (19:00-03:00) due to meteorological balloons at VNO 🎈
                </div>
            )}

            <div className="result-body">
                <FlightSegments flights={result.flights} />
                {ret && <ReturnLeg result={result} ret={ret} cityName={cityName} />}
            </div>
        </div>
    );
}

export default function FlightResults({ results, isRoundTrip }: FlightResultsProps) {
    const { airports } = useAirports();

    const airportNames = useMemo(() => new Map(airports.map(a => [a.code, a.name])), [airports]);
    const cityName = (code: string) => airportNames.get(code) || code;

    if (results.length === 0) {
        return (
            <div className="no-results">
                <p>No flights found for your search criteria.</p>
                {isRoundTrip && <p>💡 No outbound and return flights fit together. Try a different return date or enable flexible dates.</p>}
            </div>
        );
    }

    return (
        <div className="results-container">
            <h2 className="results-title">Found {results.length} {results.length === 1 ? 'option' : 'options'}</h2>

            <div className="results-list">
                {results.map((result, index) => (
                    <ResultCard key={index} result={result} cityName={cityName} />
                ))}
            </div>
        </div>
    );
}
