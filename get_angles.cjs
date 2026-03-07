const https = require('https');

const query = `
[out:json][timeout:25];
(
  node["highway"="traffic_signals"](25.440,81.820,25.460,81.850);
  way["highway"](25.440,81.820,25.460,81.850);
  node(w)(25.440,81.820,25.460,81.850);
);
out qt;
`;

const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

function getBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    let brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
}

https.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
        const data = JSON.parse(body);
        let signals = data.elements.filter(e => e.tags && e.tags.highway === 'traffic_signals');
        
        let nodes = {};
        data.elements.forEach(e => {
            if (e.type === 'node') {
                nodes[e.id] = { lat: e.lat, lon: e.lon, ways: [] };
            }
        });
        
        data.elements.forEach(e => {
            if (e.type === 'way' && e.tags && e.tags.highway) {
                e.nodes.forEach((nId, i) => {
                    if (nodes[nId]) {
                        // Store adjacent nodes to compute angle
                        let adj = [];
                        if (i > 0) adj.push(e.nodes[i-1]);
                        if (i < e.nodes.length - 1) adj.push(e.nodes[i+1]);
                        nodes[nId].ways.push(...adj);
                    }
                });
            }
        });
        
        let targetSignals = [];
        let intersections = Object.entries(nodes).filter(([id, n]) => n.ways.length >= 3).map(([id, n]) => ({id, ...n}));
        
        if (signals.length >= 15) {
            targetSignals = signals.slice(0, 15);
        } else {
            targetSignals = [...signals];
            for (let i = 0; i < intersections.length && targetSignals.length < 15; i++) {
                let inter = intersections[i];
                let exists = targetSignals.some(s => 
                    Math.abs(s.lat - inter.lat) < 0.0005 && Math.abs(s.lon - inter.lon) < 0.0005
                );
                if (!exists) targetSignals.push(inter);
            }
        }
        
        let jsArray = targetSignals.map((s, idx) => {
            let nInfo = nodes[s.id];
            let angles = [];
            if (nInfo && nInfo.ways) {
                nInfo.ways.forEach(adjId => {
                    let adjNode = nodes[adjId];
                    if (adjNode) {
                        angles.push(Math.round(getBearing(s.lat, s.lon, adjNode.lat, adjNode.lon)));
                    }
                });
            }
            // Ensure unique angles and sorted
            angles = [...new Set(angles)].sort((a,b)=>a-b);
            if(angles.length === 0) angles = [0, 90, 180, 270];
            return \` { id: "S\${idx + 1}", lat: \${s.lat}, lng: \${s.lon}, armAngles: [\${angles.join(', ')}] }\`;
        });
        
        console.log("const CIVIL_LINES_SIGNALS = [\n" + jsArray.join(",\n") + "\n];");
    } catch (e) {
        console.error("Error parsing", e);
    }
  });
});
