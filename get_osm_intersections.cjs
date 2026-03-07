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
                nodes[e.id] = { lat: e.lat, lon: e.lon, count: 0 };
            }
        });
        
        data.elements.forEach(e => {
            if (e.type === 'way' && e.tags && e.tags.highway) {
                e.nodes.forEach(nId => {
                    if (nodes[nId]) nodes[nId].count++;
                });
            }
        });
        
        let intersections = Object.values(nodes).filter(n => n.count >= 3);
        
        let targetSignals = [];
        if (signals.length >= 15) {
            targetSignals = signals.slice(0, 15);
        } else {
            targetSignals = [...signals];
            for (let i = 0; i < intersections.length && targetSignals.length < 15; i++) {
                let inter = intersections[i];
                let exists = targetSignals.some(s => 
                    Math.abs(s.lat - inter.lat) < 0.0005 && Math.abs(s.lon - inter.lon) < 0.0005
                );
                if (!exists) {
                    targetSignals.push(inter);
                }
            }
        }
        
        let jsArray = targetSignals.map((s, idx) => {
            return ` { id: "S${idx + 1}", lat: ${s.lat}, lng: ${s.lon} }`;
        });
        
        console.log("const CIVIL_LINES_SIGNALS = [\n" + jsArray.join(",\n") + "\n];");
    } catch (e) {
        console.error("Error parsing", e);
    }
  });
});
