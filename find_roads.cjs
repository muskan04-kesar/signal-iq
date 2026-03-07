const https = require('https');

const query = `
[out:json][timeout:25];
(
  way["name"~"Maharishi Dayanand Marg"](25.40,81.80,25.50,81.90);
  way["name"~"Thornhill Road"](25.40,81.80,25.50,81.90);
);
out geom;
`;

const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

https.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
        const data = JSON.parse(body);
        let mdm = [];
        let thr = [];
        data.elements.forEach(e => {
            if (e.tags && e.tags.name) {
                if (e.tags.name.includes("Maharishi Dayanand")) {
                    mdm.push(...e.geometry);
                }
                if (e.tags.name.includes("Thornhill")) {
                    thr.push(...e.geometry);
                }
            }
        });
        
        const getBounds = (pts) => {
            if (pts.length === 0) return null;
            let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
            pts.forEach(p => {
                if (p.lat < minLat) minLat = p.lat;
                if (p.lat > maxLat) maxLat = p.lat;
                if (p.lon < minLon) minLon = p.lon;
                if (p.lon > maxLon) maxLon = p.lon;
            });
            return { minLat, maxLat, minLon, maxLon };
        };
        
        console.log("Maharishi Dayanand Marg Bounds:", getBounds(mdm));
        console.log("Thornhill Road Bounds:", getBounds(thr));
        
    } catch (e) {
        console.error("Error:", e);
    }
  });
});
