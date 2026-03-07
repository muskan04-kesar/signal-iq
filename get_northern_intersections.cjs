const https = require('https');
const fs = require('fs');

const bbox = "25.456,81.815,25.465,81.850"; // Bbox covering Maharishi Dayanand Marg and Thornhill Road
const query = `
[out:json][timeout:25];
(
  way["highway"~"primary|secondary|tertiary|trunk|unclassified"](${bbox});
);
(._;>;);
out qt;
`;

const url = "https://lz4.overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

const distHaversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const getBearing = (lat1, lon1, lat2, lon2) => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    let brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
};

// Filter to keep only things near MDM and Thornhill bounds
const polygon = [
  [81.815, 25.456], // SW
  [81.815, 25.465], // NW
  [81.850, 25.465], // NE
  [81.850, 25.456], // SE
];

const pointInPolygon = (lon, lat, vs) => {
    let x = lon, y = lat;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

https.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
        const data = JSON.parse(body);
        let nodes = {};
        
        data.elements.forEach(e => {
            if (e.type === 'node') {
                nodes[e.id] = { lat: e.lat, lon: e.lon, ways: [], adj: new Set() };
            }
        });
        
        let ways = data.elements.filter(e => e.type === 'way');
        
        ways.forEach(w => {
            w.nodes.forEach((nId, idx) => {
                if(nodes[nId]) {
                    nodes[nId].ways.push(w.id);
                    if(idx > 0) nodes[nId].adj.add(w.nodes[idx-1]);
                    if(idx < w.nodes.length - 1) nodes[nId].adj.add(w.nodes[idx+1]);
                }
            });
        });
        
        let intersections = Object.entries(nodes)
            .filter(([id, n]) => {
                const uniqueWays = new Set(n.ways).size;
                return uniqueWays >= 2 && n.adj.size >= 3;
            })
            .map(([id, n]) => ({ id, ...n }))
            .filter(n => pointInPolygon(n.lon, n.lat, polygon)); 
            
        let clusters = [];
        const CLUSTER_DIST = 45; 
        
        intersections.forEach(inter => {
            let added = false;
            for(let c of clusters) {
                if(distHaversine(c.lat, c.lon, inter.lat, inter.lon) < CLUSTER_DIST) {
                    c.nodes.push(inter);
                    c.lat = c.nodes.reduce((sum, n) => sum + n.lat, 0) / c.nodes.length;
                    c.lon = c.nodes.reduce((sum, n) => sum + n.lon, 0) / c.nodes.length;
                    added = true;
                    break;
                }
            }
            if(!added) {
                clusters.push({ lat: inter.lat, lon: inter.lon, nodes: [inter] });
            }
        });
        
        let finalSet = [];
        for (let c of clusters) {
            let tooClose = finalSet.some(f => distHaversine(f.lat, f.lon, c.lat, c.lon) < 85);
            if (!tooClose) finalSet.push(c);
        }
        
        console.log("Found " + finalSet.length + " northern intersections.");

        // We load the existing CIVIL_LINES_SIGNALS from the file and append these if they aren't too close
        const existingDataFile = fs.readFileSync('data/civilLinesSignals.ts', 'utf-8');
        let existingExtract = existingDataFile.match(/\{.*?\}/g) || [];
        
        let parsedExisting = existingExtract.map(line => {
            let latMatch = line.match(/lat:\s*([0-9.]+)/);
            let lngMatch = line.match(/lng:\s*([0-9.]+)/);
            let idMatch = line.match(/id:\s*'([A-Z0-9]+)'/);
            return {
                id: idMatch ? idMatch[1] : '',
                lat: latMatch ? parseFloat(latMatch[1]) : 0,
                lon: lngMatch ? parseFloat(lngMatch[1]) : 0,
                origLine: line
            };
        });

        // Get max ID counter
        let maxS = 0;
        parsedExisting.forEach(e => {
            if(e.id.startsWith('S')) {
                let n = parseInt(e.id.replace('S', ''));
                if(n > maxS) maxS = n;
            }
        });
        
        let appendCount = 0;

        finalSet.forEach((c) => {
            // Check if it's already in the existing dataset
            let duplicate = parsedExisting.some(e => distHaversine(e.lat, e.lon, c.lat, c.lon) < 45);
            if(!duplicate) {
                let primaryNode = c.nodes.sort((a,b) => b.adj.size - a.adj.size)[0];
                let angles = [];
                primaryNode.adj.forEach(adjId => {
                    let aNode = nodes[adjId];
                    if(aNode) angles.push(Math.round(getBearing(primaryNode.lat, primaryNode.lon, aNode.lat, aNode.lon)));
                });
                angles.sort((a,b)=>a-b);
                let merged = [];
                angles.forEach(ang => {
                    if(merged.length === 0) merged.push(ang);
                    else {
                        let diff = Math.min(Math.abs(ang - merged[merged.length-1]), 360 - Math.abs(ang - merged[merged.length-1]));
                        if(diff > 20) merged.push(ang);
                    }
                });
                if(merged.length === 0) merged = [0, 90, 180, 270];
                
                maxS++;
                let newId = 'S' + maxS;
                parsedExisting.push({
                    id: newId,
                    lat: c.lat,
                    lon: c.lon,
                    origLine: "{ id: '" + newId + "', lat: " + c.lat + ", lng: " + c.lon + ", armAngles: [" + merged.join(", ") + "] }"
                });
                appendCount++;
            }
        });
        
        console.log("Appended " + appendCount + " new distinct intersections.");
        
        let jsOutput = "export const CIVIL_LINES_SIGNALS = [\n";
        parsedExisting.forEach(e => {
            jsOutput += "  " + e.origLine + ",\n";
        });
        jsOutput += "];\n";
        
        fs.writeFileSync('data/civilLinesSignals.ts', jsOutput);
        console.log("Written updated final array to civilLinesSignals.ts");
        
    } catch (e) {
        console.error("Error:", e);
    }
  });
});
