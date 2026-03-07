import { IntersectionStatus } from '../types';

export async function fetchIntersections(): Promise<Partial<IntersectionStatus>[]> {
  const query = `
  [out:json][timeout:25];
  node["highway"="traffic_signals"]
  (25.448,81.831,25.454,81.839);
  out;
  `;

  const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
  const res = await fetch(url);
  const data = await res.json();

  return data.elements.map((node: any) => ({
    id: `osm-${node.id}`,
    lat: node.lat,
    lng: node.lon,
    type: "TRAFFIC_SIGNAL",
    connections: 4,
    congestionScore: Math.random()
  })).slice(0, 20);
}
