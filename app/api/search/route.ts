import { NextRequest, NextResponse } from 'next/server';
import { findCheapestRoutes } from '@/lib/finder';

// Multi-airport search support
function addDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const originParam = searchParams.get('origin');
    const destParam = searchParams.get('dest');
    const date = searchParams.get('date');
    const returnDate = searchParams.get('returnDate');
    const dateRangeDays = searchParams.get('dateRangeDays');
    const dateDirection = searchParams.get('dateDirection') || 'both'; // 'both', 'after', 'before'
    const returnDateRange = searchParams.get('returnDateRange');
    const returnDateDirection = searchParams.get('returnDateDirection') || 'both';

    if (!originParam || !destParam || !date) {
        return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Split comma-separated airport codes for multi-airport search
    const origins = originParam.split(',').map(s => s.trim());
    const dests = destParam.split(',').map(s => s.trim());

    try {
        if (dateRangeDays) {
            // Search multiple dates
            const days = parseInt(dateRangeDays);
            const datesToSearch: string[] = [];

            // Generate date range based on direction
            if (dateDirection === 'both') {
                // ± days (both before and after)
                for (let i = -days; i <= days; i++) {
                    datesToSearch.push(addDays(date, i));
                }
            } else if (dateDirection === 'after') {
                // + days (only after)
                for (let i = 0; i <= days; i++) {
                    datesToSearch.push(addDays(date, i));
                }
            } else if (dateDirection === 'before') {
                // - days (only before)
                for (let i = -days; i <= 0; i++) {
                    datesToSearch.push(addDays(date, i));
                }
            }

            // Search all dates in parallel
            const allResults = await Promise.all(
                datesToSearch.flatMap(searchDate =>
                    origins.flatMap(origin =>
                        dests.map(async (dest) => {
                            const outboundResults = await findCheapestRoutes(origin, dest, searchDate);

                            // If round trip, also search return flights
                            if (returnDate && returnDateRange) {
                                const returnDays = parseInt(returnDateRange);
                                const returnDatesToSearch: string[] = [];

                                // Generate return date range based on direction
                                if (returnDateDirection === 'both') {
                                    for (let i = -returnDays; i <= returnDays; i++) {
                                        returnDatesToSearch.push(addDays(returnDate, i));
                                    }
                                } else if (returnDateDirection === 'after') {
                                    for (let i = 0; i <= returnDays; i++) {
                                        returnDatesToSearch.push(addDays(returnDate, i));
                                    }
                                } else if (returnDateDirection === 'before') {
                                    for (let i = -returnDays; i <= 0; i++) {
                                        returnDatesToSearch.push(addDays(returnDate, i));
                                    }
                                }

                                // Search all return dates and combine
                                const allReturnResults = await Promise.all(
                                    returnDatesToSearch.map(returnSearchDate =>
                                        findCheapestRoutes(dest, origin, returnSearchDate)
                                    )
                                );

                                // Flatten return results
                                const flatReturnResults = allReturnResults.flat();
                                console.log(`Return flights found for ${dest} -> ${origin}:`, flatReturnResults.length);

                                // Filter return flights to only include those that depart after the outbound arrives
                                const validReturnFlights = flatReturnResults.filter(returnFlight => {
                                    // Get the arrival time of the last outbound flight segment
                                    const outboundArrivalTime = new Date(outboundResults[0]?.flights[outboundResults[0].flights.length - 1]?.arrivalDate).getTime();
                                    // Get the departure time of the first return flight segment
                                    const returnDepartureTime = new Date(returnFlight.flights[0]?.departureDate).getTime();
                                    // Return flight must depart after outbound arrives
                                    return returnDepartureTime > outboundArrivalTime;
                                });

                                console.log(`Valid return flights (after filtering):`, validReturnFlights.length);

                                // Combine outbound and return flights
                                return outboundResults.map(outbound => ({
                                    ...outbound,
                                    searchDate,
                                    returnFlights: validReturnFlights,
                                    isRoundTrip: true,
                                    totalPrice: outbound.totalPrice + (validReturnFlights[0]?.totalPrice || 0)
                                }));
                            } else if (returnDate) {
                                const returnResults = await findCheapestRoutes(dest, origin, returnDate);
                                console.log(`Return flights found for ${dest} -> ${origin}:`, returnResults.length);

                                // Combine outbound and return flights
                                return outboundResults.map(outbound => ({
                                    ...outbound,
                                    searchDate,
                                    returnFlights: returnResults,
                                    isRoundTrip: true,
                                    totalPrice: outbound.totalPrice + (returnResults[0]?.totalPrice || 0)
                                }));
                            }

                            return outboundResults.map(r => ({ ...r, searchDate }));
                        })
                    )
                )
            );

            // Flatten and sort by price
            const flatResults = allResults.flat().flat().sort((a, b) => a.totalPrice - b.totalPrice);
            return NextResponse.json(flatResults);
        } else {
            // Single date search - search all origin-destination combinations
            const allCombinations = await Promise.all(
                origins.flatMap(origin =>
                    dests.map(async (dest) => {
                        const outboundResults = await findCheapestRoutes(origin, dest, date);
                        console.log(`Outbound flights found for ${origin} -> ${dest}:`, outboundResults.length);

                        // If round trip, also search return flights
                        if (returnDate) {
                            const returnResults = await findCheapestRoutes(dest, origin, returnDate);
                            console.log(`Return flights found for ${dest} -> ${origin}:`, returnResults.length);

                            if (returnResults.length === 0) {
                                console.warn('No return flights found!');
                            }

                            // Filter return flights to only include those that depart after the outbound arrives
                            const validReturnFlights = returnResults.filter(returnFlight => {
                                // Get the arrival time of the last outbound flight segment
                                const outboundArrivalTime = new Date(outboundResults[0]?.flights[outboundResults[0].flights.length - 1]?.arrivalDate).getTime();
                                // Get the departure time of the first return flight segment
                                const returnDepartureTime = new Date(returnFlight.flights[0]?.departureDate).getTime();
                                // Return flight must depart after outbound arrives
                                return returnDepartureTime > outboundArrivalTime;
                            });

                            console.log(`Valid return flights (after filtering):`, validReturnFlights.length);

                            // Combine outbound with return flights
                            return outboundResults.map(outbound => ({
                                ...outbound,
                                returnFlights: validReturnFlights,
                                isRoundTrip: true,
                                totalPrice: outbound.totalPrice + (validReturnFlights[0]?.totalPrice || 0)
                            }));
                        }

                        return outboundResults;
                    })
                )
            );

            // Flatten and sort by price
            const flatResults = allCombinations.flat().flat().sort((a, b) => a.totalPrice - b.totalPrice);
            return NextResponse.json(flatResults);
        }
    } catch (e) {
        console.error('Search error:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
