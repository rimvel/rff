'use client';

import { useState, useEffect } from 'react';

interface Flight {
    departureDate: string;
    arrivalDate: string;
    price: {
        value: number;
        currencyCode: string;
    };
    flightNumber: string;
}

interface RouteResult {
    type: 'direct' | 'layover';
    origin: string;
    destination: string;
    via?: string;
    flights: Flight[];
    totalPrice: number;
    currency: string;
    duration: number;
    searchDate?: string;
    isRoundTrip?: boolean;
    returnFlights?: RouteResult[];
}

interface FlightResultsProps {
    results: RouteResult[];
}

interface Airport {
    code: string;
    name: string;
    country: {
        name: string;
        code: string;
    };
}

function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
}

function formatDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getBookingUrl(origin: string, destination: string, dateStr: string): string {
    const date = new Date(dateStr).toISOString().split('T')[0];
    return `https://www.ryanair.com/en/en/trip/flights/select?adt=1&chd=0&inf=0&originIata=${origin}&destinationIata=${destination}&dateOut=${date}&roundtrip=false`;
}

function getRoundTripBookingUrl(origin: string, destination: string, dateOutStr: string, dateInStr: string): string {
    const dateOut = new Date(dateOutStr).toISOString().split('T')[0];
    const dateIn = new Date(dateInStr).toISOString().split('T')[0];
    return `https://www.ryanair.com/en/en/trip/flights/select?adt=1&chd=0&inf=0&originIata=${origin}&destinationIata=${destination}&dateOut=${dateOut}&dateIn=${dateIn}&roundtrip=true`;
}

// Check if a flight time is in the Vilnius balloon risk window (19:00-03:00)
function isInVilniusBalloonRiskWindow(dateStr: string, airportCode: string): boolean {
    if (airportCode !== 'VNO') return false;

    const d = new Date(dateStr);
    const hour = d.getHours();

    // Risk window is 19:00 (7 PM) to 03:00 (3 AM)
    return hour >= 19 || hour < 3;
}

// Check if a route involves Vilnius and has flights in the risk window
function checkVilniusBalloonRisk(result: RouteResult): { hasRisk: boolean; riskType: 'departure' | 'arrival' | 'both' | null } {
    let hasDepartureRisk = false;
    let hasArrivalRisk = false;

    // Check outbound flights
    for (const flight of result.flights) {
        if (isInVilniusBalloonRiskWindow(flight.departureDate, result.origin)) {
            hasDepartureRisk = true;
        }
        if (isInVilniusBalloonRiskWindow(flight.arrivalDate, result.destination)) {
            hasArrivalRisk = true;
        }
    }

    // Check return flights if they exist
    if (result.returnFlights && result.returnFlights.length > 0) {
        for (const flight of result.returnFlights[0].flights) {
            if (isInVilniusBalloonRiskWindow(flight.departureDate, result.destination)) {
                hasDepartureRisk = true;
            }
            if (isInVilniusBalloonRiskWindow(flight.arrivalDate, result.origin)) {
                hasArrivalRisk = true;
            }
        }
    }

    const hasRisk = hasDepartureRisk || hasArrivalRisk;
    let riskType: 'departure' | 'arrival' | 'both' | null = null;

    if (hasDepartureRisk && hasArrivalRisk) {
        riskType = 'both';
    } else if (hasDepartureRisk) {
        riskType = 'departure';
    } else if (hasArrivalRisk) {
        riskType = 'arrival';
    }

    return { hasRisk, riskType };
}

export default function FlightResults({ results }: FlightResultsProps) {
    const [airportNames, setAirportNames] = useState<Record<string, string>>({});

    useEffect(() => {
        fetch('/api/airports')
            .then(res => res.json())
            .then((data: Airport[]) => {
                const map: Record<string, string> = {};
                data.forEach(a => {
                    map[a.code] = a.name;
                });
                setAirportNames(map);
            })
            .catch(err => console.error('Failed to fetch airports:', err));
    }, []);

    const getCityName = (code: string) => {
        return airportNames[code] || code;
    };

    if (results.length === 0) {
        return (
            <div className="no-results">
                <p>No flights found for your search criteria.</p>
            </div>
        );
    }

    return (
        <div className="results-container">
            <h2 className="results-title">Found {results.length} {results.length === 1 ? 'option' : 'options'}</h2>

            <div className="results-list">
                {results.map((result, index) => {
                    const { hasRisk, riskType } = checkVilniusBalloonRisk(result);

                    const isSimpleDirect = result.type === 'direct' && !result.isRoundTrip;
                    const isSimpleRoundTripDirect = result.type === 'direct' && result.isRoundTrip && result.returnFlights?.[0]?.type === 'direct';

                    let mainBookingUrl = '';
                    if (isSimpleDirect) {
                        mainBookingUrl = getBookingUrl(result.origin, result.destination, result.flights[0].departureDate);
                    } else if (isSimpleRoundTripDirect) {
                        mainBookingUrl = getRoundTripBookingUrl(
                            result.origin,
                            result.destination,
                            result.flights[0].departureDate,
                            result.returnFlights![0].flights[0].departureDate
                        );
                    }

                    return (
                        <div key={index} className="result-card">
                            <div className="result-header">
                                <div className="result-header-content">
                                    {/* Top Row: Badges, Codes, Price(Mobile) */}
                                    <div className="header-top-row">
                                        <div className="badge-group">
                                            <span className="badge direction-badge">DEPARTURE</span>
                                            <span className={`badge ${result.type === 'direct' ? 'direct' : 'layover'}`}>
                                                {result.type === 'direct' ? 'DIRECT' : `LAYOVER (${result.via})`}
                                            </span>
                                            {result.searchDate && (
                                                <span className="badge date-badge">
                                                    {new Date(result.searchDate).toLocaleDateString('en-GB', {
                                                        day: 'numeric',
                                                        month: 'short'
                                                    })}
                                                </span>
                                            )}
                                            <span className="badge duration-badge">
                                                {formatDuration(result.duration)}
                                            </span>
                                        </div>

                                        {/* Mobile: Price is here in top row */}
                                        <div className="result-price mobile-price">
                                            {mainBookingUrl ? (
                                                <a
                                                    href={mainBookingUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="price-link"
                                                    title="Book on Ryanair"
                                                >
                                                    <span className="price-value">{result.totalPrice.toFixed(2)}</span>
                                                    <span className="price-currency">{result.currency}</span>
                                                </a>
                                            ) : (
                                                <>
                                                    <span className="price-value">{result.totalPrice.toFixed(2)}</span>
                                                    <span className="price-currency">{result.currency}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Route Info: Cities only */}
                                    <div className="route-info-container">
                                        <div className="route-cities">
                                            {getCityName(result.origin)} → {getCityName(result.destination)}
                                        </div>
                                    </div>
                                </div>

                                {/* Desktop: Price is on the right side */}
                                <div className="result-price desktop-price">
                                    {mainBookingUrl ? (
                                        <a
                                            href={mainBookingUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="price-link"
                                            title="Book on Ryanair"
                                        >
                                            <span className="price-value">{result.totalPrice.toFixed(2)}</span>
                                            <span className="price-currency">{result.currency}</span>
                                        </a>
                                    ) : (
                                        <>
                                            <span className="price-value">{result.totalPrice.toFixed(2)}</span>
                                            <span className="price-currency">{result.currency}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Vilnius Balloon Risk Warning */}
                            {hasRisk && (
                                <div className="vilnius-balloon-warning">
                                    <span className="warning-label">💡 Notice</span>
                                    <p className="warning-text">
                                        🎈 Cancellation risk (19:00-03:00) due to meteorological balloons
                                    </p>
                                </div>
                            )}

                            <div className="result-body">
                                {/* Outbound Flight */}
                                {result.flights.map((flight, fIdx) => (
                                    <div key={fIdx} className="flight-segment">
                                        <div className="flight-info">
                                            <div className="flight-time">
                                                <div className="time-point">
                                                    <span className="time">{formatDateTime(flight.departureDate)}</span>
                                                    <span className="airport">{fIdx === 0 ? result.origin : result.via}</span>
                                                </div>
                                                <div className="flight-line">
                                                    <div className="line"></div>
                                                    <span className="flight-number">{flight.flightNumber}</span>
                                                </div>
                                                <div className="time-point">
                                                    <span className="time">{formatDateTime(flight.arrivalDate)}</span>
                                                    <span className="airport">{fIdx === result.flights.length - 1 ? result.destination : result.via}</span>
                                                </div>
                                            </div>
                                            <div className="flight-price">
                                                <a
                                                    href={getBookingUrl(
                                                        fIdx === 0 ? result.origin : result.via!,
                                                        fIdx === result.flights.length - 1 ? result.destination : result.via!,
                                                        flight.departureDate
                                                    )}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="segment-price-link"
                                                    title={`Book ${fIdx === 0 ? result.origin : result.via} → ${fIdx === result.flights.length - 1 ? result.destination : result.via} on Ryanair`}
                                                >
                                                    {flight.price?.value?.toFixed(2) ?? '0.00'} {flight.price?.currencyCode ?? 'EUR'}
                                                    <span className="book-icon">↗</span>
                                                </a>
                                            </div>
                                        </div>
                                        {fIdx < result.flights.length - 1 && (() => {
                                            const currentFlight = result.flights[fIdx];
                                            const nextFlight = result.flights[fIdx + 1];
                                            const arrivalTime = new Date(currentFlight.arrivalDate).getTime();
                                            const departureTime = new Date(nextFlight.departureDate).getTime();
                                            const waitMinutes = (departureTime - arrivalTime) / 60000;

                                            // Determine warning message
                                            let warningMessage = '';
                                            let warningClass = '';
                                            if (waitMinutes > 480) { // Over 8 hours
                                                warningMessage = '⚠️ Long!';
                                                warningClass = 'layover-warning-long';
                                            } else if (waitMinutes < 90) { // Under 1h 30min
                                                warningMessage = '⚡ Short!';
                                                warningClass = 'layover-warning-short';
                                            }

                                            return (
                                                <div className="connection-info">
                                                    Layover at {result.via} • {formatDuration(waitMinutes)} wait
                                                    {warningMessage && <> <span className={`layover-warning ${warningClass}`}>{warningMessage}</span></>}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ))}

                                {/* Return Flight */}
                                {result.isRoundTrip && (() => {
                                    // Check if return flights are available
                                    if (!result.returnFlights || result.returnFlights.length === 0) {
                                        return (
                                            <>
                                                <div className="flight-separator">
                                                    <div className="separator-line"></div>
                                                    <div className="separator-content">
                                                        <div className="arrow-down">↓</div>
                                                    </div>
                                                    <div className="separator-line"></div>
                                                </div>
                                                <div className="no-return-flights">
                                                    <div className="no-return-icon">✈️</div>
                                                    <h3>No Return Flights Available</h3>
                                                    <p>Unfortunately, no return flights were found for the selected date.</p>
                                                    <p className="suggestion">💡 Try selecting a different return date or enable flexible dates to see more options.</p>
                                                </div>
                                            </>
                                        );
                                    }

                                    // Calculate time at destination
                                    const outboundArrival = new Date(result.flights[result.flights.length - 1].arrivalDate);
                                    const returnDeparture = new Date(result.returnFlights[0].flights[0].departureDate);
                                    const stayMilliseconds = returnDeparture.getTime() - outboundArrival.getTime();
                                    const stayHours = Math.floor(stayMilliseconds / (1000 * 60 * 60));
                                    const stayDays = Math.floor(stayHours / 24);
                                    const remainingHours = stayHours % 24;

                                    let stayText = '';
                                    if (stayDays > 0) {
                                        stayText = `${stayDays}d ${remainingHours}h`;
                                    } else {
                                        stayText = `${remainingHours}h`;
                                    }

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
                                                            {result.returnFlights[0].type === 'direct' ? (
                                                                <span className="badge direct">Direct</span>
                                                            ) : (
                                                                <span className="badge layover">Via {result.returnFlights[0].via}</span>
                                                            )}
                                                            {result.returnFlights[0].searchDate && (
                                                                <span className="badge date-badge">
                                                                    {new Date(result.returnFlights[0].searchDate).toLocaleDateString('en-GB', {
                                                                        day: 'numeric',
                                                                        month: 'short'
                                                                    })}
                                                                </span>
                                                            )}
                                                            <span className="badge duration-badge">
                                                                {formatDuration(result.returnFlights[0].duration)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="route-info-container">
                                                        <div className="route-cities">
                                                            {getCityName(result.destination)} → {getCityName(result.origin)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            {result.returnFlights[0].flights.map((flight, fIdx) => (
                                                <div key={`return-${fIdx}`} className="flight-segment">
                                                    <div className="flight-info">
                                                        <div className="flight-time">
                                                            <div className="time-point">
                                                                <span className="time">{formatDateTime(flight.departureDate)}</span>
                                                                <span className="airport">{fIdx === 0 ? result.destination : result.returnFlights![0].via}</span>
                                                            </div>
                                                            <div className="flight-line">
                                                                <div className="line"></div>
                                                                <span className="flight-number">{flight.flightNumber}</span>
                                                            </div>
                                                            <div className="time-point">
                                                                <span className="time">{formatDateTime(flight.arrivalDate)}</span>
                                                                <span className="airport">{fIdx === result.returnFlights![0].flights.length - 1 ? result.origin : result.returnFlights![0].via}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flight-price">
                                                            <a
                                                                href={getBookingUrl(
                                                                    fIdx === 0 ? result.destination : result.returnFlights![0].via!,
                                                                    fIdx === result.returnFlights![0].flights.length - 1 ? result.origin : result.returnFlights![0].via!,
                                                                    flight.departureDate
                                                                )}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="segment-price-link"
                                                                title={`Book ${fIdx === 0 ? result.destination : result.returnFlights![0].via} → ${fIdx === result.returnFlights![0].flights.length - 1 ? result.origin : result.returnFlights![0].via} on Ryanair`}
                                                            >
                                                                {flight.price.value.toFixed(2)} {flight.price.currencyCode}
                                                                <span className="book-icon">↗</span>
                                                            </a>
                                                        </div>
                                                    </div>
                                                    {fIdx < result.returnFlights![0].flights.length - 1 && (() => {
                                                        const currentFlight = result.returnFlights![0].flights[fIdx];
                                                        const nextFlight = result.returnFlights![0].flights[fIdx + 1];
                                                        const arrivalTime = new Date(currentFlight.arrivalDate).getTime();
                                                        const departureTime = new Date(nextFlight.departureDate).getTime();
                                                        const waitMinutes = (departureTime - arrivalTime) / 60000;

                                                        // Determine warning message
                                                        let warningMessage = '';
                                                        let warningClass = '';
                                                        if (waitMinutes > 480) { // Over 8 hours
                                                            warningMessage = '⚠️ Long!';
                                                            warningClass = 'layover-warning-long';
                                                        } else if (waitMinutes < 90) { // Under 1h 30min
                                                            warningMessage = '⚡ Short!';
                                                            warningClass = 'layover-warning-short';
                                                        }

                                                        return (
                                                            <div className="connection-info">
                                                                Layover at {result.returnFlights![0].via} • {formatDuration(waitMinutes)} wait
                                                                {warningMessage && <> <span className={`layover-warning ${warningClass}`}>{warningMessage}</span></>}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            ))}
                                        </>
                                    );
                                })()}
                            </div>


                        </div>
                    );
                })}
            </div>
        </div>
    );
}
