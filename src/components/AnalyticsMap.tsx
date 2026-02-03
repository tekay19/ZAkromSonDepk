"use client";

import { useEffect, useMemo, useState } from "react";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { PlaceResult } from "./ResultsTable";

interface AnalyticsMapProps {
    results: PlaceResult[];
}

export function AnalyticsMap({ results }: AnalyticsMapProps) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

    if (!apiKey) {
        return (
            <div className="w-full h-[300px] bg-white/5 rounded-2xl border border-white/5 flex items-center justify-center text-muted-foreground p-4 text-center">
                Harita görüntülemek için Google Maps API Anahtarı gerekli.
            </div>
        );
    }

    // Default center (London) if no results, otherwise calculated from results
    const defaultCenter = { lat: 51.5074, lng: -0.1278 };

    const center = useMemo(() => {
        if (results.length === 0) return defaultCenter;
        const validResults = results.filter(p => p.location);
        if (validResults.length === 0) return defaultCenter;

        const lat = validResults.reduce((acc, curr) => acc + (curr.location?.latitude || 0), 0) / validResults.length;
        const lng = validResults.reduce((acc, curr) => acc + (curr.location?.longitude || 0), 0) / validResults.length;

        return { lat, lng };
    }, [results]);

    return (
        <div className="w-full h-full min-h-[400px] rounded-2xl overflow-hidden border border-white/5 relative bg-[#1c1c1c]">
            <APIProvider apiKey={apiKey}>
                <Map
                    defaultCenter={center}
                    defaultZoom={12}
                    gestureHandling={'greedy'}
                    disableDefaultUI={false}
                    zoomControl={true}
                    streetViewControl={false}
                    mapTypeControl={true}
                    fullscreenControl={true}
                    mapId={'4504f8b37365c3d0'}
                    style={{ width: '100%', height: '100%' }}
                    colorScheme={'DARK'}
                >
                    <HeatmapLayer results={results} />
                    <FitBounds results={results} />
                </Map>
            </APIProvider>
        </div>
    );
}

function FitBounds({ results }: { results: PlaceResult[] }) {
    const map = useMap();

    useEffect(() => {
        if (!map || results.length === 0) return;

        const bounds = new google.maps.LatLngBounds();
        let hasValidLoc = false;

        results.forEach(p => {
            if (p.location) {
                bounds.extend({ lat: p.location.latitude, lng: p.location.longitude });
                hasValidLoc = true;
            }
        });

        if (hasValidLoc) {
            map.fitBounds(bounds);
            // Optional: Adjust zoom if too zoomed in
            /* 
            const listener = google.maps.event.addListenerOnce(map, "idle", () => { 
                if (map.getZoom()! > 16) map.setZoom(16); 
            }); 
            */
        }
    }, [map, results]);

    return null;
}

function HeatmapLayer({ results }: { results: PlaceResult[] }) {
    const map = useMap();
    const visualization = useMapsLibrary('visualization');
    const [heatmap, setHeatmap] = useState<google.maps.visualization.HeatmapLayer | null>(null);

    useEffect(() => {
        if (!map || !visualization) return;

        const data = results
            .filter(p => p.location)
            .map(p => new google.maps.LatLng(p.location!.latitude, p.location!.longitude));

        if (heatmap) {
            heatmap.setMap(null);
        }

        const newHeatmap = new visualization.HeatmapLayer({
            data: data,
            map: map,
            radius: 30,
            opacity: 0.8,
        });

        setHeatmap(newHeatmap);

        return () => {
            if (newHeatmap) {
                newHeatmap.setMap(null);
            }
        };
    }, [map, visualization, results]);

    return null;
}
