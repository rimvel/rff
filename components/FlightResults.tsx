'use client';

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

export default function FlightResults({ results }: FlightResultsProps) {
    if (results.length === 0) {
        return (
            <div className="no-results">
                <p>No flights found. Try different dates or airports.</p>
            </div>
        );
    }

    return (
        <div className="results-container">
            <h2>Found {results.length} option{results.length !== 1 ? 's' : ''}</h2>

            <div className="results-list">
                {results.map((result, idx) => (
                    <div key={idx} className={`result-card ${result.type}`}>
                        <div className="result-header">
                            <div className="result-type">
                                <span className="badge direction-badge">Departure</span>
                                {result.type === 'direct' ? (
                                    <span className="badge direct">Direct</span>
                                ) : (
                                    <span className="badge layover">Via {result.via}</span>
                                )}
                                {result.searchDate && (
                                    <span className="badge date-badge">
                                        {new Date(result.searchDate).toLocaleDateString('en-GB', {
                                            day: 'numeric',
                                            month: 'short'
                                        })}
                                    </span>
                                )}
                                <span className="badge route-badge">
                                    {result.origin} → {result.destination}
                                </span>
                                <span className="badge duration-badge">
                                    {formatDuration(result.duration)}
                                </span>
                            </div>
                            <div className="result-price">
                                <span className="price-value">{result.totalPrice.toFixed(2)}</span>
                                <span className="price-currency">{result.currency}</span>
                            </div>
                        </div>

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
                                            {flight.price.value.toFixed(2)} {flight.price.currencyCode}
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
                                            warningMessage = '(⚠️ Long!)';
                                            warningClass = 'layover-warning-long';
                                        } else if (waitMinutes < 90) { // Under 1h 30min
                                            warningMessage = '(⚡ Short!)';
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
                                            <div className="result-type">
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
                                                <span className="badge route-badge">
                                                    {result.destination} → {result.origin}
                                                </span>
                                                <span className="badge duration-badge">
                                                    {formatDuration(result.returnFlights[0].duration)}
                                                </span>
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
                                                        {flight.price.value.toFixed(2)} {flight.price.currencyCode}
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
                                                        warningMessage = '(⚠️ Long!)';
                                                        warningClass = 'layover-warning-long';
                                                    } else if (waitMinutes < 90) { // Under 1h 30min
                                                        warningMessage = '(⚡ Short!)';
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
                ))}
            </div>
        </div>
    );
}
