import { CIVIL_LINES_EDGES } from '../data/civilLinesEdges';
import { CIVIL_LINES_SIGNALS } from '../data/civilLinesSignals';

// Build Adjacency List
const graph: Record<string, { target: string, distance: number }[]> = {};

CIVIL_LINES_EDGES.forEach(edge => {
    if (!graph[edge.source]) graph[edge.source] = [];
    if (!graph[edge.target]) graph[edge.target] = [];

    // It's an undirected graph physically
    graph[edge.source].push({ target: edge.target, distance: edge.distance });
    graph[edge.target].push({ target: edge.source, distance: edge.distance });
});

export const computeShortestPath = (startId: string, endId: string): string[] => {
    if (startId === endId) return [startId];
    if (!graph[startId] || !graph[endId]) return [];

    const distances: Record<string, number> = {};
    const previous: Record<string, string | null> = {};
    const unvisited = new Set<string>();

    CIVIL_LINES_SIGNALS.forEach(s => {
        distances[s.id] = Infinity;
        previous[s.id] = null;
        unvisited.add(s.id);
    });

    distances[startId] = 0;

    while (unvisited.size > 0) {
        // Find min distance unvisited node
        let current: string | null = null;
        let minDistance = Infinity;
        for (const nodeId of unvisited) {
            if (distances[nodeId] < minDistance) {
                minDistance = distances[nodeId];
                current = nodeId;
            }
        }

        if (current === null || current === endId) {
            break; // Reached end or remaining nodes are unreachable
        }

        unvisited.delete(current);

        const neighbors = graph[current] || [];
        for (const neighbor of neighbors) {
            if (unvisited.has(neighbor.target)) {
                const alt = distances[current] + neighbor.distance;
                if (alt < distances[neighbor.target]) {
                    distances[neighbor.target] = alt;
                    previous[neighbor.target] = current;
                }
            }
        }
    }

    // Trace back
    const path: string[] = [];
    let curr: string | null = endId;
    if (previous[curr] !== undefined || curr === startId) {
        while (curr !== null) {
            path.unshift(curr);
            curr = previous[curr];
        }
    }

    return path.length > 1 ? path : []; // ensure valid path
};
