/**
 * Location obfuscation for maps.
 *
 * Case coordinates are household-level data. The spot map displaces each point
 * before drawing it, and the exports carry the displaced position rather than
 * the real one. This lives outside the component so the guarantee can be
 * tested: it regressed once already, silently, with the exports shipping exact
 * coordinates in a file labelled as jittered.
 */

/**
 * Displace a coordinate by a deterministic offset within `distanceMeters`.
 *
 * Deterministic on purpose. Re-randomising per render or per export would let
 * someone average repeated outputs to recover the true position, which is
 * exactly the attack the jitter exists to prevent. The same record always
 * lands in the same place.
 *
 * @param seed stable per record, so the offset is reproducible
 */
export function jitterCoordinates(
  lat: number,
  lng: number,
  distanceMeters: number,
  seed: string
): { lat: number; lng: number } {
  if (distanceMeters === 0) return { lat, lng };

  const hashString = (value: string): number => {
    let h = 0;
    for (let i = 0; i < value.length; i++) {
      h = ((h << 5) - h) + value.charCodeAt(i);
      h = h & h; // Convert to 32-bit integer
    }
    return h;
  };

  // Angle and radius come from separate streams. Deriving both from one hash
  // tied them together, so offsets were drawn from a one-dimensional family
  // rather than spread over the disc.
  const angle = ((Math.abs(hashString(seed)) % 3600) / 3600) * 2 * Math.PI;

  // sqrt gives a uniform distribution over the disc. A uniform radius packs
  // points toward the centre, leaving the true location closer to the
  // published one than the stated distance implies: a median offset of R/2
  // rather than R/sqrt(2).
  //
  // Shifted into (0, 1] rather than [0, 1). A draw of exactly zero gave a
  // radius of zero, publishing that record at its true coordinate inside a
  // map labelled as jittered. It was rare, about one record in twenty
  // thousand, which for a large surveillance extract means a real chance of
  // at least one household being exposed.
  const u = ((Math.abs(hashString(`${seed}#radius`)) % 10000) + 1) / 10000;
  const radius = distanceMeters * Math.sqrt(u);

  // Metres to degrees. Longitude degrees shorten with latitude, so the
  // east-west component is scaled by cos(lat) to keep the displacement
  // isotropic on the ground rather than in degree space.
  const dLat = (radius * Math.cos(angle)) / 111320;
  const dLng = (radius * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));

  return { lat: lat + dLat, lng: lng + dLng };
}

/** Metres between two coordinates, for verifying displacement. */
export function metresBetween(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = (lat2 - lat1) * 111320;
  const dLng = (lng2 - lng1) * 111320 * Math.cos(toRad((lat1 + lat2) / 2));
  return Math.hypot(dLat, dLng);
}
