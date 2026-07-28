/**
 * daynight.js — where the sun is right now, in the map's own coordinates.
 *
 * No network, no library: the sub-solar point is worked out from the clock and
 * the day of the year, which is far more accuracy than a background layer of a
 * data visualisation needs. Everything returned is already projected into the
 * equirectangular SVG user space described by data/world-vector.json.
 */

const RAD = Math.PI / 180;

/** Sub-solar point (the spot where the sun is straight overhead). */
export function subsolarPoint(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = (date.getTime() - start) / 86400000;      // 0-based day of year

  // Equation of time and declination — the usual short astronomical series.
  const g = (357.529 + 0.98560028 * day) * RAD;
  const gamma = (280.459 + 0.98564736 * day) * RAD;
  const lambda = gamma + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const epsilon = 23.439 * RAD;

  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda)) / RAD;
  const eqTime = 4 * ((gamma - lambda) / RAD)            // minutes
    + 4 * 2.466 * Math.sin(2 * lambda) - 4 * 0.053 * Math.sin(4 * lambda);

  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  let lon = -((utcMinutes + eqTime) / 4 - 180);
  lon = ((lon + 180) % 360 + 360) % 360 - 180;

  return { lon, lat: declination };
}

/**
 * Builds the geometry the map needs.
 *  - `night` : SVG path covering the unlit half of the world
 *  - `sun`   : projected position of the sub-solar point
 */
export function terminator(meta, date = new Date()) {
  const { lon: sunLon, lat: dec } = subsolarPoint(date);
  const x = (lon) => (lon - meta.lonMin) / meta.deg * meta.cell;
  const y = (lat) => (meta.latMax - lat) / meta.deg * meta.cell;

  // Latitude of the terminator for a given longitude.
  const tanDec = Math.tan(dec * RAD);
  const lat = (lon) => {
    if (Math.abs(tanDec) < 1e-6) return 0;              // equinox: a straight line
    const hour = (lon - sunLon) * RAD;
    return Math.atan(-Math.cos(hour) / tanDec) / RAD;
  };

  const pts = [];
  for (let lon = meta.lonMin; lon <= meta.lonMin + 360 + 0.001; lon += 3) {
    pts.push(`${x(lon).toFixed(1)} ${y(lat(lon)).toFixed(1)}`);
  }

  // Night always closes towards the pole that is tilted away from the sun.
  const edge = dec > 0 ? meta.height : 0;
  const right = x(meta.lonMin + 360).toFixed(1);
  const left = x(meta.lonMin).toFixed(1);
  const night = `M${pts.join('L')}L${right} ${edge}L${left} ${edge}Z`;

  return {
    night,
    sun: { x: x(sunLon), y: y(dec), lon: sunLon, lat: dec },
  };
}
