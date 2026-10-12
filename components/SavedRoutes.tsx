'use client';

import { FavouriteRoute, isFavourite, removeFavourite, routeKey, toggleFavourite, useFavourites } from '@/lib/favourites';

interface SavedRoutesProps {
    onPick: (route: FavouriteRoute) => void;
}

/** Saved routes as one-click searches, above the recent searches. */
export default function SavedRoutes({ onPick }: SavedRoutesProps) {
    const saved = useFavourites();
    if (saved.length === 0) return null;

    return (
        <div className="recent-searches saved-routes">
            <span className="recent-title">Saved</span>
            {saved.map(r => (
                <span key={routeKey(r)} className="recent-chip saved-chip">
                    <button type="button" className="saved-chip-main" onClick={() => onPick(r)} title="Search this route on the dates you're looking at">
                        ★ {r.fromLabel} {r.tripDays !== undefined ? '⇄' : '→'} {r.toLabel}
                        {r.tripDays !== undefined && <span className="recent-dates">{r.tripDays} {r.tripDays === 1 ? 'day' : 'days'}</span>}
                    </button>
                    <button type="button" className="saved-chip-remove" onClick={() => removeFavourite(r)} aria-label={`Remove ${r.fromLabel} to ${r.toLabel} from saved routes`}>
                        ✕
                    </button>
                </span>
            ))}
        </div>
    );
}

/** "☆ Save route" / "★ Saved" toggle for the route being shown. */
export function SaveRouteButton({ route }: { route: FavouriteRoute }) {
    const saved = isFavourite(route, useFavourites());
    return (
        <button
            type="button"
            className={`save-route-btn ${saved ? 'saved' : ''}`}
            aria-pressed={saved}
            onClick={() => toggleFavourite(route)}
            title={saved ? 'Remove from saved routes' : 'Save this route to search it again with one click'}
        >
            {saved ? '★ Saved' : '☆ Save route'}
        </button>
    );
}
