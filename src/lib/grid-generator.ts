
export interface Viewport {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
}

export interface GridPoint {
    lat: number;
    lng: number;
    radius: number; // approximate radius in meters to cover the sub-grid
}

export class GridGenerator {
    /**
     * Divides a viewport into a 3x3 grid (9 sectors) and returns the center point of each sector.
     * @param viewport The bounding box of the city
     * @returns Array of 9 Lat/Lng points representing the center of each grid cell.
     */
    static generate3x3Grid(viewport: Viewport): GridPoint[] {
        const latSpan = viewport.northeast.lat - viewport.southwest.lat;
        const lngSpan = viewport.northeast.lng - viewport.southwest.lng;

        const cellLatSize = latSpan / 3;
        const cellLngSize = lngSpan / 3;

        const points: GridPoint[] = [];

        // Approximate radius for "Location Bias" (circle) to cover the rectangular cell
        // A diagonal of the cell / 2 is a safe radius.
        // 1 degree lat ~= 111km. 1 degree lng varies, but let's approximate for safety.
        // We'll calculate a simple metric radius.
        const radiusMeters = this.calculateRadius(cellLatSize, cellLngSize, viewport.southwest.lat);

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                // Calculate center of this cell
                // Row 0 is bottom (south), Row 2 is top (north)
                // Col 0 is left (west), Col 2 is right (east)
                const centerLat = viewport.southwest.lat + (row * cellLatSize) + (cellLatSize / 2);
                const centerLng = viewport.southwest.lng + (col * cellLngSize) + (cellLngSize / 2);

                points.push({
                    lat: centerLat,
                    lng: centerLng,
                    radius: radiusMeters
                });
            }
        }

        return points;
    }

    private static calculateRadius(latSize: number, lngSize: number, baseLat: number): number {
        // Haversine-ish approximation or simple conversion
        // 1 deg lat = 111,000 meters
        const heightMeters = latSize * 111000;

        // 1 deg lng = 111,000 * cos(lat) meters
        const widthMeters = lngSize * 111000 * Math.cos(baseLat * (Math.PI / 180));

        // Diagonal
        const diagonal = Math.sqrt((heightMeters * heightMeters) + (widthMeters * widthMeters));

        // Radius is half diagonal, plus a bit of overlap (10%)
        return Math.ceil((diagonal / 2) * 1.1);
    }
}
