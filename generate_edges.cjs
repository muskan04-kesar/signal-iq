const fs = require('fs');

const dataRaw = fs.readFileSync('data/civilLinesSignals.ts', 'utf-8');
const lines = dataRaw.split('\n');

const signals = [];
for (let line of lines) {
    let latMatch = line.match(/lat:\s*([0-9.]+)/);
    let lngMatch = line.match(/lng:\s*([0-9.]+)/);
    let idMatch = line.match(/id:\s*'([A-Z0-9]+)'/);
    if(idMatch && latMatch && lngMatch) {
        signals.push({
            id: idMatch[1],
            lat: parseFloat(latMatch[1]),
            lng: parseFloat(lngMatch[1])
        });
    }
}

const dist = (p1, p2) => {
    const R = 6371e3;
    const lat1 = p1.lat * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    const dp = (p2.lat - p1.lat) * Math.PI / 180;
    const dl = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dp/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getQuad = (p1, p2) => {
    let dLat = p2.lat - p1.lat;
    let dLng = p2.lng - p1.lng;
    if (dLat >= 0 && dLng >= 0) return 0; // NE
    if (dLat >= 0 && dLng < 0) return 1;  // NW
    if (dLat < 0 && dLng < 0) return 2;   // SW
    return 3; // SE
};

const edges = [];
const added = new Set();
const maxDist = 800; // meters

signals.forEach(s1 => {
    let quads = [null, null, null, null];
    let qDists = [Infinity, Infinity, Infinity, Infinity];
    
    signals.forEach(s2 => {
        if(s1.id !== s2.id) {
            let d = dist(s1, s2);
            if (d < maxDist) {
                let q = getQuad(s1, s2);
                if (d < qDists[q]) {
                    qDists[q] = d;
                    quads[q] = s2;
                }
            }
        }
    });

    quads.forEach(s2 => {
        if(s2) {
            let key1 = `${s1.id}_${s2.id}`;
            let key2 = `${s2.id}_${s1.id}`;

            const EXCLUSIONS = new Set([
                'S46_S29', 'S29_S46',
                'S45_S46', 'S46_S45',
                'S25_S44', 'S44_S25',
                'S25_S28', 'S28_S25',
                'S22_S27', 'S27_S22',
                'S43_S22', 'S22_S43',
                'S18_S34', 'S34_S18',
                'S34_S22', 'S22_S34',
                'S7_S32', 'S32_S7',
                'S5_S16', 'S16_S5',
                'S5_S8', 'S8_S5',
                'S18_S21', 'S21_S18',
                'S21_S27', 'S27_S21',
                'S52_S22', 'S22_S52',
                'S9_S17', 'S17_S9'
            ]);

            if (!added.has(key1) && !added.has(key2) && !EXCLUSIONS.has(key1)) {
                added.add(key1);
                edges.push({ source: s1.id, target: s2.id, distance: Math.round(dist(s1, s2)) });
            }
        }
    });
});

// Explicit Inclusions
const explicitPairs = [['S1', 'S18']];
explicitPairs.forEach(pair => {
    let s1 = signals.find(s => s.id === pair[0]);
    let s2 = signals.find(s => s.id === pair[1]);
    if (s1 && s2) {
        let key1 = `${s1.id}_${s2.id}`;
        let key2 = `${s2.id}_${s1.id}`;
        if (!added.has(key1) && !added.has(key2)) {
            added.add(key1);
            edges.push({ source: s1.id, target: s2.id, distance: Math.round(dist(s1, s2)) });
        }
    }
});

let out = `export const CIVIL_LINES_EDGES = [\n`;
edges.forEach(e => {
    out += `  { source: '${e.source}', target: '${e.target}', distance: ${e.distance} },\n`;
});
out += `];\n`;

fs.writeFileSync('data/civilLinesEdges.ts', out);
console.log("Generated geometry edges!");
