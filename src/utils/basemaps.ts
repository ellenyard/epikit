/**
 * Base map tile sources shared by the spot map and the area map.
 *
 * Kept in one place because the two maps had drifted, and because each entry
 * is a small contract with whoever hosts the tiles: the attribution is what
 * the provider's terms require, and the zoom limits are what its servers hold.
 */

export type BasemapId = 'street' | 'quiet';

export interface Basemap {
  url: string;
  attribution: string;
  /** Deepest zoom the provider serves. Beyond it Leaflet enlarges these tiles. */
  maxNativeZoom: number;
  opacity: number;
}

/** Deepest zoom the map itself allows, with or without a base map. */
export const MAP_MAX_ZOOM = 19;

/**
 * Deepest zoom the map goes to on its own when fitting the data.
 *
 * Fitting to a single case zoomed to the street outside one house and
 * requested the tile for it, which tells the tile provider where that is far
 * more precisely than the jitter distance. The user can still zoom in by hand.
 */
export const FIT_MAX_ZOOM = 15;

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// tile.openstreetmap.org is the address the tile usage policy gives; the
// a/b/c subdomains are a leftover from before HTTP/2.
const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const basemaps: Record<BasemapId, Basemap> = {
  street: { url: OSM_URL, attribution: OSM_ATTRIBUTION, maxNativeZoom: 19, opacity: 1 },
  quiet: { url: OSM_URL, attribution: OSM_ATTRIBUTION, maxNativeZoom: 19, opacity: 0.35 },
};

// Two sources that used to be offered are deliberately absent.
//
// Satellite imagery came from Esri's World Imagery without an account, which
// Esri's terms do not allow. It is worth restoring for field work where street
// maps are sparse, but only with an ArcGIS Location Platform API key
// restricted to this site.
//
// The topographic layer came from OpenTopoMap, a volunteer-run server with no
// availability guarantee that asks not to be loaded heavily.
//
// A saved setting naming either one falls back to the default map.
