import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export type MapPoint = { lat: number; lng: number; label?: string };

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    streets: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Tiles © Esri · data © OpenStreetMap',
    },
  },
  layers: [{ id: 'streets', type: 'raster', source: 'streets' }],
};

function pinElement(kind: 'you' | 'pickup' | 'drop' | 'driver', text: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = `ridex-pin ridex-pin-${kind}`;
  const dot = document.createElement('span');
  dot.className = 'ridex-pin-dot';
  const label = document.createElement('span');
  label.className = 'ridex-pin-label';
  label.textContent = text;
  wrap.append(dot, label);
  return wrap;
}

function lineFeature(coordinates: [number, number][]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  };
}

function upsertLine(
  map: maplibregl.Map,
  sourceId: string,
  haloId: string,
  lineId: string,
  coordinates: [number, number][],
  color: string,
  dashed: boolean,
) {
  const data = lineFeature(coordinates);
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  if (coordinates.length < 2) return;
  map.addSource(sourceId, { type: 'geojson', data });
  map.addLayer({
    id: haloId,
    type: 'line',
    source: sourceId,
    paint: { 'line-color': '#FFFFFF', 'line-width': dashed ? 8 : 10, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: lineId,
    type: 'line',
    source: sourceId,
    paint: {
      'line-color': color,
      'line-width': dashed ? 4 : 5,
      'line-opacity': 1,
      ...(dashed ? { 'line-dasharray': [1.4, 1.2] } : {}),
    },
  });
}

export function RideMap({
  pickup,
  drop,
  you,
  driver,
  path,
  trail,
  className = 'h-[56vh] w-full',
  followDriver = false,
}: {
  pickup?: MapPoint | null;
  drop?: MapPoint | null;
  you?: MapPoint | null;
  driver?: MapPoint | null;
  path?: [number, number][] | null;
  trail?: [number, number][] | null;
  className?: string;
  followDriver?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const stopMarkers = useRef<maplibregl.Marker[]>([]);
  const driverMarker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: MAP_STYLE,
      center: [77.209, 28.6139],
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;
    const onLoad = () => {
      map.resize();
      setReady(true);
    };
    map.on('load', onLoad);
    return () => {
      map.off('load', onLoad);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const marker of stopMarkers.current) marker.remove();
    stopMarkers.current = [];
    const points: Array<{ point: MapPoint; kind: 'you' | 'pickup' | 'drop' }> = [];
    if (you) points.push({ point: { ...you, label: you.label ?? 'You' }, kind: 'you' });
    if (pickup) points.push({ point: { ...pickup, label: pickup.label ?? 'Pickup' }, kind: 'pickup' });
    if (drop) points.push({ point: { ...drop, label: drop.label ?? 'Drop' }, kind: 'drop' });
    for (const item of points) {
      const marker = new maplibregl.Marker({
        element: pinElement(item.kind, item.point.label ?? item.kind),
        anchor: 'bottom',
      })
        .setLngLat([item.point.lng, item.point.lat])
        .addTo(map);
      stopMarkers.current.push(marker);
    }

    const line =
      path && path.length >= 2
        ? path
        : pickup && drop
          ? [
              [pickup.lng, pickup.lat] as [number, number],
              [drop.lng, drop.lat] as [number, number],
            ]
          : [];
    upsertLine(map, 'trip-line', 'trip-line-halo', 'trip-line', line, '#3D8BFF', false);

    if (line.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      for (const pair of line) {
        const lng = pair[0];
        const lat = pair[1];
        if (lng === undefined || lat === undefined) continue;
        bounds.extend([lng, lat]);
      }
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 700 });
      return;
    }
    if (points.length === 1) {
      const only = points[0];
      if (only) map.easeTo({ center: [only.point.lng, only.point.lat], zoom: 13, duration: 600 });
      return;
    }
    if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const item of points) bounds.extend([item.point.lng, item.point.lat]);
      map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 700 });
    }
  }, [ready, pickup, drop, you, path]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const line = trail && trail.length >= 2 ? trail : [];
    upsertLine(map, 'trip-trail', 'trip-trail-halo', 'trip-trail', line, '#E4572E', true);
  }, [ready, trail]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!driver) {
      driverMarker.current?.remove();
      driverMarker.current = null;
      return;
    }
    if (!driverMarker.current) {
      driverMarker.current = new maplibregl.Marker({
        element: pinElement('driver', driver.label ?? 'Driver'),
        anchor: 'bottom',
      })
        .setLngLat([driver.lng, driver.lat])
        .addTo(map);
    } else {
      driverMarker.current.setLngLat([driver.lng, driver.lat]);
    }
    if (followDriver) {
      map.easeTo({ center: [driver.lng, driver.lat], duration: 400, zoom: Math.max(map.getZoom(), 13) });
    }
  }, [ready, driver, followDriver]);

  return <div ref={ref} className={`${className} ridex-map`} />;
}
