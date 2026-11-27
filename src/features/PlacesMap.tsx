import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { displayName } from '../model/people';
import type { PlaceInfo } from '../model/stats';
import type { TreeData } from '../model/types';

const COLORS: Record<string, string> = { birth: '#16a34a', death: '#64748b', marriage: '#db2777' };

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export default function PlacesMap({ places, tree, privacy }: { places: (PlaceInfo & { lat: number; lon: number })[]; tree: TreeData; privacy: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  useEffect(() => {
    if (!el.current) return;
    map.current = L.map(el.current, { worldCopyJump: true }).setView([30, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current);
    return () => {
      map.current?.remove();
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const layer = L.layerGroup().addTo(m);
    const bounds: L.LatLngExpression[] = [];
    for (const p of places) {
      const main = p.events.find((e) => COLORS[e.type])?.type ?? 'other';
      const color = COLORS[main] ?? '#4f46e5';
      const lines = p.events
        .slice(0, 12)
        .map((e) => `${escapeHtml(displayName(tree.people[e.personId], { privacy }))} <span style="color:#666">${escapeHtml(e.type)}${e.year ? ' ' + e.year : ''}</span>`)
        .join('<br>');
      L.circleMarker([p.lat, p.lon], { radius: 6 + Math.min(10, p.events.length), color, fillColor: color, fillOpacity: 0.55, weight: 2 })
        .bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${lines}${p.events.length > 12 ? '<br>…' : ''}`)
        .addTo(layer);
      bounds.push([p.lat, p.lon]);
    }
    if (bounds.length) m.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 8 });
    return () => {
      layer.remove();
    };
  }, [places, tree, privacy]);
  return (
    <div>
      <div ref={el} className="h-[420px] rounded-lg overflow-hidden border border-line" />
      <div className="flex gap-4 mt-2 text-xs text-muted">
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ background: COLORS.birth }} />
          Births
        </span>
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ background: COLORS.marriage }} />
          Marriages
        </span>
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ background: COLORS.death }} />
          Deaths
        </span>
      </div>
    </div>
  );
}
