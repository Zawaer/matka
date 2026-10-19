import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ q: vi.fn() }));
const { pickPhotonName } = await import("./geocode");
type F = Parameters<typeof pickPhotonName>[0][number];

// 0.0001° lat ≈ 11 m; 0.0001° lon ≈ 5.5 m at 60°N.
/** A Photon reverse feature `north` m north and `east` m east of (lat, lon). */
function feat(lat: number, lon: number, north: number, east: number, props: NonNullable<F["properties"]>): F {
  return {
    geometry: { type: "Point", coordinates: [lon + east / 55_500, lat + north / 111_200] },
    properties: { country: "Suomi", city: "Helsinki", ...props },
  };
}

describe("pickPhotonName", () => {
  it("doesn't name a wait at Kamppi after the pub on the corner", () => {
    const [lat, lon] = [60.16875, 24.93174];
    const fs = [
      feat(lat, lon, 3, 2, { osm_key: "highway", osm_value: "footway", name: "Kampinkuja", type: "street", district: "Kamppi" }),
      feat(lat, lon, 20, 5, { osm_key: "highway", osm_value: "bus_stop", name: "Kamppi", type: "house", district: "Kamppi" }),
      feat(lat, lon, 12, -18, { osm_key: "amenity", osm_value: "pub", name: "Bierhuis Rotterdam", street: "Kampinkuja", housenumber: "2", type: "house", district: "Kamppi" }),
      feat(lat, lon, -40, 30, { osm_key: "public_transport", osm_value: "platform", name: "Kamppi", type: "house" }),
      feat(lat, lon, -70, -10, { osm_key: "shop", osm_value: "mall", name: "Kauppakeskus Kamppi", street: "Urho Kekkosen katu", housenumber: "1", type: "house", district: "Kamppi" }),
    ];
    const p = pickPhotonName(fs, lat, lon);
    expect(p.name).toBe("Kampinkuja 2");
    expect(p.category).toBeNull();
    expect(JSON.stringify(p.props)).not.toMatch(/pub|Bierhuis/);
    expect(p.city).toBe("Helsinki");
  });

  it("names a parking lot in Tapiola by its address, not the bridge or the road", () => {
    const [lat, lon] = [60.17474, 24.79984];
    const tapiola = { city: "Espoo", district: "Tapiola" };
    const fs = [
      feat(lat, lon, 4, 8, { osm_key: "man_made", osm_value: "bridge", name: "Länsituulensilta", type: "street", ...tapiola }),
      feat(lat, lon, -6, 2, { osm_key: "highway", osm_value: "cycleway", name: "Länsituulensilta", type: "street", ...tapiola }),
      feat(lat, lon, 10, -5, { osm_key: "amenity", osm_value: "parking", street: "Pohjantie", housenumber: "2 B", type: "house", ...tapiola }),
      feat(lat, lon, 35, -20, { osm_key: "building", osm_value: "apartments", street: "Pohjantie", housenumber: "4", type: "house", ...tapiola }),
    ];
    const p = pickPhotonName(fs, lat, lon);
    expect(p.name).toBe("Pohjantie 2 B");
    expect(p.city).toBe("Espoo");
  });

  it("prefers a house number in Töölö over the street", () => {
    const [lat, lon] = [60.17144, 24.92063];
    const fs = [
      feat(lat, lon, 2, 6, { osm_key: "highway", osm_value: "secondary", name: "Mechelininkatu", type: "street", district: "Etu-Töölö" }),
      feat(lat, lon, 18, -10, { osm_key: "place", osm_value: "house", street: "Mechelininkatu", housenumber: "12", type: "house", district: "Etu-Töölö" }),
      feat(lat, lon, 30, 25, { osm_key: "amenity", osm_value: "cafe", name: "Kahvila Tööli", street: "Runeberginkatu", housenumber: "3", type: "house" }),
    ];
    expect(pickPhotonName(fs, lat, lon).name).toBe("Mechelininkatu 12");
  });

  it("names a big venue when it is the building you are at", () => {
    const [lat, lon] = [60.1613, 24.7383];
    const fs = [
      feat(lat, lon, 30, 0, { osm_key: "place", osm_value: "house", street: "Piispansilta", housenumber: "11", type: "house", city: "Espoo" }),
      feat(lat, lon, -40, 20, { osm_key: "shop", osm_value: "mall", name: "Iso Omena", street: "Piispansilta", housenumber: "11", type: "house", city: "Espoo" }),
    ];
    const p = pickPhotonName(fs, lat, lon);
    expect(p.name).toBe("Iso Omena");
    expect(p.category).toBe("mall");
  });

  it("keeps a home above a supermarket as its address", () => {
    const [lat, lon] = [60.2298, 24.7741];
    const fs = [
      feat(lat, lon, 8, 5, { osm_key: "building", osm_value: "apartments", street: "Puistokuja", housenumber: "5", type: "house", city: "Espoo" }),
      feat(lat, lon, 35, 20, { osm_key: "shop", osm_value: "supermarket", name: "K-Market Puistokuja", street: "Puistokuja", housenumber: "7", type: "house", city: "Espoo" }),
    ];
    expect(pickPhotonName(fs, lat, lon).name).toBe("Puistokuja 5");
  });

  it("names a cafe the stay sits right on", () => {
    const [lat, lon] = [60.1765, 24.9119];
    const fs = [
      feat(lat, lon, 5, 4, { osm_key: "amenity", osm_value: "cafe", name: "Café Regatta", street: "Merikannontie", housenumber: "8", type: "house" }),
      feat(lat, lon, 25, 0, { osm_key: "place", osm_value: "house", street: "Merikannontie", housenumber: "6", type: "house" }),
    ];
    expect(pickPhotonName(fs, lat, lon)).toMatchObject({ name: "Café Regatta", category: "cafe" });
  });

  it("never asserts a nightclub or a clinic, however close", () => {
    const [lat, lon] = [60.165, 24.94];
    for (const [k, v] of [
      ["amenity", "nightclub"],
      ["amenity", "bar"],
      ["amenity", "clinic"],
      ["healthcare", "psychotherapist"],
      ["shop", "erotic"],
    ]) {
      const fs = [
        feat(lat, lon, 2, 1, { osm_key: k, osm_value: v, name: "Somewhere", street: "Yrjönkatu", housenumber: "1", type: "house" }),
      ];
      expect(pickPhotonName(fs, lat, lon).name).toBe("Yrjönkatu 1");
    }
  });

  it("falls back to the district when there is nothing but roads", () => {
    const [lat, lon] = [60.1849, 24.8276];
    const fs = [
      feat(lat, lon, 5, 5, { osm_key: "highway", osm_value: "path", name: "Rantaraitti", type: "street", district: "Otaniemi", city: "Espoo" }),
      feat(lat, lon, 400, 0, { osm_key: "place", osm_value: "house", street: "Otakaari", housenumber: "1", type: "house" }),
    ];
    const p = pickPhotonName(fs, lat, lon);
    expect(p.name).toBe("Otaniemi");
    expect(p.props?.osm_key).toBeUndefined(); // not a highway: the place stays in the list
  });

  it("copes with no results and features without geometry", () => {
    expect(pickPhotonName([], 60, 25).name).toBeNull();
    const p = pickPhotonName([{ properties: { osm_key: "amenity", osm_value: "cafe", name: "X", city: "Turku" } }], 60, 25);
    expect(p.name).toBe("Turku");
  });
});
