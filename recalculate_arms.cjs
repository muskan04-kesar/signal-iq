const fs = require('fs');

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

// Calculate exact bearing from Centroid to the external node
const getBearing = (lat1, lon1, lat2, lon2) => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    let brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
};

// We will fetch new geometry using overpass with our merged list of IDs,
// But wait, we can just grab local OSM data or use overpass.
// It's easier to just fetch overpass for the entire bbox, and reconstruct the clusters dynamically.
// Or we can rebuild the angles given the bounding box, but match against our specific requested `CIVIL_LINES_SIGNALS` so we don't lose the exact signals the user wants!

const https = require('https');

const query = `
[out:json][timeout:25];
(
  way["highway"~"primary|secondary|tertiary|trunk|unclassified"](25.43,81.80,25.48,81.86);
);
(._;>;);
out qt;
`;

const url = "https://lz4.overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

https.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
        const data = JSON.parse(body);
        let nodes = {};
        
        data.elements.forEach(e => {
            if (e.type === 'node') {
                nodes[e.id] = { id: e.id, lat: e.lat, lon: e.lon, ways: [], adj: new Set() };
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

        // Load targeted specific user signals
        const existingDataFile = fs.readFileSync('data/civilLinesSignals.ts', 'utf-8');
        let existingExtract = existingDataFile.match(/\{.*?\}/g) || [];
        
        let targetSignals = existingExtract.map(line => {
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

        let updatedSignals = targetSignals.map(signal => {
            // Find all OSM nodes within ~45 meters of this signal's configured coordinate 
            // This captures the entire "Cluster" (including large roundabouts).
            let clusterNodes = [];
            for (let id in nodes) {
                let n = nodes[id];
                if (distHaversine(signal.lat, signal.lon, n.lat, n.lon) < 45) {
                    if (new Set(n.ways).size > 0 || n.adj.size > 0) {
                        clusterNodes.push(n);
                    }
                }
            }
            
            let clusterNodeIds = new Set(clusterNodes.map(n => n.id));
            
            // Re-calculate center based purely on intersections inside this cluster
            let activeClusterNodes = clusterNodes.filter(n => new Set(n.ways).size > 1 || n.adj.size >= 3);
            if (activeClusterNodes.length === 0) activeClusterNodes = clusterNodes; // fallback
            
            let cLat = activeClusterNodes.reduce((sum, n) => sum + n.lat, 0) / activeClusterNodes.length;
            let cLon = activeClusterNodes.reduce((sum, n) => sum + n.lon, 0) / activeClusterNodes.length;
            
            // To get true external arms:
            // Find all adjacencies of clusterNodes that are NOT in clusterNodes
            let externalNodes = [];
            clusterNodes.forEach(cn => {
                cn.adj.forEach(adjId => {
                    if (!clusterNodeIds.has(adjId)) {
                        let aNode = nodes[adjId];
                        if (aNode) {
                            externalNodes.push(aNode);
                        }
                    }
                });
            });
            
            let angles = [];
            externalNodes.forEach(ext => {
                angles.push(Math.round(getBearing(cLat, cLon, ext.lat, ext.lon)));
            });
            
            angles.sort((a,b)=>a-b);
            let merged = [];
            angles.forEach(ang => {
                if(merged.length === 0) merged.push(ang);
                else {
                    let diff = Math.min(Math.abs(ang - merged[merged.length-1]), 360 - Math.abs(ang - merged[merged.length-1]));
                    if(diff > 18) {
                        merged.push(ang);
                    } else {
                        // Blend the angle for precision alignment!
                        merged[merged.length-1] = Math.round((merged[merged.length-1] + ang) / 2);
                    }
                }
            });
            
            // Check wrap-around blend if first and last are essentially same arm
            if (merged.length > 1) {
                let diff = 360 - merged[merged.length-1] + merged[0];
                if (diff <= 18) {
                    let avg = Math.round((merged[merged.length-1] + merged[0] + 360) / 2) % 360;
                    merged[0] = avg;
                    merged.pop();
                }
            }
            
            if(merged.length === 0) merged = [0, 90, 180, 270];

            return {
                id: signal.id,
                lat: cLat,
                lng: cLon,
                armAngles: merged
            };
        });

        let jsOutput = "export const CIVIL_LINES_SIGNALS = [\n";
        updatedSignals.forEach(e => {
            jsOutput += "  { id: '" + e.id + "', lat: " + e.lat + ", lng: " + e.lng + ", armAngles: [" + e.armAngles.join(", ") + "] },\n";
        });
        jsOutput += "];\n";

        fs.writeFileSync('data/civilLinesSignals.ts', jsOutput);
        console.log("Successfully aligned simulation arms to perfect geographical center points!");

    } catch (e) {
        console.error("Error:", e);
    }
  });
}).on('error', (e) => {
  console.error(e);
});
