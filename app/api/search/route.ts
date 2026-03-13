import { NextRequest, NextResponse } from 'next/server';
import { findCheapestRoutes } from '@/lib/finder';

// Multi-airport search support
function addDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

async function processInChunks<T, R>(items: T[], chunkSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(chunk.map(fn));
        results.push(...chunkResults);
    }
    return results;
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
        const datesToSearch: string[] = [];

        if (dateRangeDays) {
            const days = parseInt(dateRangeDays);
            if (dateDirection === 'both') {
                for (let i = -days; i <= days; i++) {
                    datesToSearch.push(addDays(date, i));
                }
            } else if (dateDirection === 'after') {
                for (let i = 0; i <= days; i++) {
                    datesToSearch.push(addDays(date, i));
                }
            } else if (dateDirection === 'before') {
                for (let i = -days; i <= 0; i++) {
                    datesToSearch.push(addDays(date, i));
                }
            }
        } else {
            datesToSearch.push(date);
        }

        const combinations: { searchDate: string, origin: string, dest: string }[] = [];
        for (const searchDate of datesToSearch) {
            for (const origin of origins) {
                for (const dest of dests) {
                    combinations.push({ searchDate, origin, dest });
                }
            }
        }

        const allResults = await processInChunks(combinations, 3, async ({ searchDate, origin, dest }) => {
            const outboundResults = await findCheapestRoutes(origin, dest, searchDate);

            // If round trip, also search return flights
            if (returnDate) {
                let flatReturnResults: any[] = [];
                
                if (returnDateRange) {
                    const returnDays = parseInt(returnDateRange);
                    const returnDatesToSearch: string[] = [];
                    
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

                    const allReturnResults = await processInChunks(returnDatesToSearch, 3, async (returnSearchDate) => {
                        return findCheapestRoutes(dest, origin, returnSearchDate);
                    });
                    flatReturnResults = allReturnResults.flat();
                } else {
                    flatReturnResults = await findCheapestRoutes(dest, origin, returnDate);
                }

                console.log(`Return flights found for ${dest} -> ${origin}:`, flatReturnResults.length);

                return outboundResults.flatMap(outbound => {
                    const outboundArrivalTime = new Date(outbound.flights[outbound.flights.length - 1]?.arrivalDate).getTime();
                    
                    const validReturnFlights = flatReturnResults.filter(returnFlight => {
                        const returnDepartureTime = new Date(returnFlight.flights[0]?.departureDate).getTime();
                        return returnDepartureTime > outboundArrivalTime;
                    });
                    
                    if (validReturnFlights.length === 0) {
                        return [{
                            ...outbound,
                            searchDate,
                            returnFlights: [],
                            isRoundTrip: true,
                            totalPrice: outbound.totalPrice
                        }];
                    }

                    // Take top 5 valid return flights to avoid combinatorial explosion and present alternatives
                    return validReturnFlights.slice(0, 5).map(validReturn => ({
                        ...outbound,
                        searchDate,
                        returnFlights: [validReturn],
                        isRoundTrip: true,
                        totalPrice: outbound.totalPrice + validReturn.totalPrice
                    }));
                });
            }

            return outboundResults.map(r => ({ ...r, searchDate }));
        });

        // Flatten all chunks together and sort by price
        const flatResults = allResults.flat().sort((a, b) => a.totalPrice - b.totalPrice);
        
        // Take only top 50 overall results to avoid sending massive payloads to the client
        return NextResponse.json(flatResults.slice(0, 50));
    } catch (e) {
        console.error('Search error:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
