/**
 * A small streaming JSON splitter for location-history exports, which can be
 * hundreds of MB but are always "one big collection of small records":
 *
 * - a root array (iOS Timeline export: `[ {...}, {...} ]`), or
 * - a root object whose interesting keys hold arrays
 *   (`{"semanticSegments": [...], "rawSignals": [...]}`, `{"locations": [...]}`,
 *   `{"timelineObjects": [...]}`).
 *
 * feed() takes text chunks of any size (split anywhere, even inside a string)
 * and returns the complete elements of those arrays parsed so far, each with
 * the key of the array it came from ("" for a root array). Only the element
 * being read is buffered, so memory stays bounded by the largest single
 * record, not the file. Scalars in the collections and arrays under keys not
 * in `keys` are skipped without being parsed.
 */
export type Element = { key: string; value: unknown };

const QUOTE = 34;
const BACKSLASH = 92;

export class JsonCollectionStream {
  /** Container types, innermost last: true = object, false = array. */
  private stack: boolean[] = [];
  private inString = false;
  private escape = false;
  /** Root object: the next string at depth 1 is a key. */
  private keyNext = false;
  /** Text of the root-level key being read (only while reading one). */
  private keyBuf: string | null = null;
  private lastKey = "";
  /** Key of the collection array we're inside, or null. */
  private collection: string | null = null;
  /** Depth at which elements of the current collection start. */
  private elemDepth = -1;
  /** Text of the element being captured across chunks, or null. */
  private elemBuf: string | null = null;
  private done = false;

  constructor(private readonly keys: ReadonlySet<string> | null = null) {}

  feed(chunk: string): Element[] {
    const out: Element[] = [];
    const n = chunk.length;
    // Start of the capture inside this chunk (element or key), when one is open.
    let elemStart = this.elemBuf != null ? 0 : -1;
    let keyStart = this.keyBuf != null ? 0 : -1;

    for (let i = 0; i < n; i++) {
      const c = chunk.charCodeAt(i);
      if (this.inString) {
        if (this.escape) {
          this.escape = false;
          continue;
        }
        if (c === BACKSLASH) {
          this.escape = true;
          continue;
        }
        if (c !== QUOTE) continue;
        this.inString = false;
        if (keyStart >= 0) {
          this.lastKey = JSON.parse((this.keyBuf ?? "") + chunk.slice(keyStart, i + 1)) as string;
          this.keyBuf = null;
          keyStart = -1;
          this.keyNext = false;
        }
        continue;
      }
      const depth = this.stack.length;
      switch (c) {
        case QUOTE:
          this.inString = true;
          if (depth === 1 && this.stack[0] && this.keyNext) {
            this.keyBuf = "";
            keyStart = i;
          }
          break;
        case 123: // {
        case 91: {
          // [
          const isObj = c === 123;
          if (depth === 0) {
            if (this.done) break;
            if (!isObj) {
              this.collection = "";
              this.elemDepth = 1;
            }
            this.keyNext = isObj;
          } else if (this.collection != null && depth === this.elemDepth && elemStart < 0) {
            this.elemBuf = "";
            elemStart = i;
          } else if (depth === 1 && this.stack[0] && !isObj && (!this.keys || this.keys.has(this.lastKey))) {
            this.collection = this.lastKey;
            this.elemDepth = 2;
          }
          this.stack.push(isObj);
          break;
        }
        case 125: // }
        case 93: {
          // ]
          this.stack.pop();
          const d = this.stack.length;
          if (elemStart >= 0 && d === this.elemDepth) {
            const text = (this.elemBuf ?? "") + chunk.slice(elemStart, i + 1);
            this.elemBuf = null;
            elemStart = -1;
            out.push({ key: this.collection ?? "", value: JSON.parse(text) });
          } else if (this.collection != null && d === this.elemDepth - 1) {
            this.collection = null;
            this.elemDepth = -1;
          }
          if (d === 0) this.done = true;
          break;
        }
        case 44: // ,
          if (depth === 1 && this.stack[0]) this.keyNext = true;
          break;
      }
    }
    if (elemStart >= 0) this.elemBuf = (this.elemBuf ?? "") + chunk.slice(elemStart);
    if (keyStart >= 0) this.keyBuf = (this.keyBuf ?? "") + chunk.slice(keyStart);
    return out;
  }

  /** True once the root value has been closed. */
  get finished(): boolean {
    return this.done;
  }
}
