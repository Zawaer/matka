import { describe, expect, it } from "vitest";
import { JsonCollectionStream, type Element } from "./jsonStream";

function run(text: string, chunk: number, keys?: string[]): Element[] {
  const p = new JsonCollectionStream(keys ? new Set(keys) : null);
  const out: Element[] = [];
  for (let i = 0; i < text.length; i += chunk) out.push(...p.feed(text.slice(i, i + chunk)));
  return out;
}

const doc = JSON.stringify({
  version: 1,
  semanticSegments: [{ a: "x,]}\"{[", b: [1, { c: 2 }] }, { d: "48.1°, 11.5°" }, 7, "s"],
  "weird \"key\"": [{ no: 1 }],
  rawSignals: [],
  userLocationProfile: { frequentPlaces: [{ p: 1 }] },
  locations: [{ e: null }],
});

describe("JsonCollectionStream", () => {
  it("emits the objects of top-level arrays, for any chunking", () => {
    const want = [
      { key: "semanticSegments", value: { a: "x,]}\"{[", b: [1, { c: 2 }] } },
      { key: "semanticSegments", value: { d: "48.1°, 11.5°" } },
      { key: "locations", value: { e: null } },
    ];
    for (const chunk of [1, 2, 3, 7, 64, doc.length]) {
      expect(run(doc, chunk, ["semanticSegments", "rawSignals", "locations"])).toEqual(want);
    }
  });

  it("follows every top-level array without a key filter", () => {
    expect(run(doc, 5).map((e) => e.key)).toEqual(["semanticSegments", "semanticSegments", 'weird "key"', "locations"]);
  });

  it("reads a root array (iOS export)", () => {
    const ios = ' [ {"startTime":"t","visit":{"x":[1,2]}} ,\n{"timelinePath":[{"point":"geo:1,2"}]} ]\n';
    for (const chunk of [1, 4, 100]) {
      expect(run(ios, chunk)).toEqual([
        { key: "", value: { startTime: "t", visit: { x: [1, 2] } } },
        { key: "", value: { timelinePath: [{ point: "geo:1,2" }] } },
      ]);
    }
  });

  it("throws on a broken element", () => {
    expect(() => run('{"locations":[{"a":1,}]}', 100)).toThrow(SyntaxError);
  });
});
