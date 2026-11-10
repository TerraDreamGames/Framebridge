// Figma's controller sandbox lacks browser text codecs. Keep this fallback local
// to the controller bundle; the UI and Node services retain their native codecs.
class SandboxTextEncoder {
  readonly encoding = "utf-8";
  encode(input = "") {
    const text = String(input);
    const output = new Uint8Array(text.length * 3);
    return output.slice(0, this.encodeInto(text, output).written);
  }
  encodeInto(input: string, output: Uint8Array) {
    const text = String(input);
    let read = 0,
      written = 0;
    while (read < text.length) {
      let point = text.codePointAt(read)!;
      const units = point > 0xffff ? 2 : 1;
      if (point >= 0xd800 && point <= 0xdfff) point = 0xfffd;
      const size =
        point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
      if (written + size > output.length) break;
      if (size === 1) output[written++] = point;
      else {
        output[written++] =
          (size === 2 ? 0xc0 : size === 3 ? 0xe0 : 0xf0) |
          (point >>> ((size - 1) * 6));
        for (let shift = (size - 2) * 6; shift >= 0; shift -= 6)
          output[written++] = 0x80 | ((point >>> shift) & 0x3f);
      }
      read += units;
    }
    return { read, written };
  }
}

const windows1252 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030,
  0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d,
  0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e,
  0x178,
];

class SandboxTextDecoder {
  readonly encoding: "utf-8" | "windows-1252";
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;
  private pending = new Uint8Array();
  private bomSeen = false;
  constructor(label = "utf-8", options: TextDecoderOptions = {}) {
    const name = String(label).trim().toLowerCase();
    if (["utf-8", "utf8", "unicode-1-1-utf-8"].includes(name))
      this.encoding = "utf-8";
    else if (
      [
        "latin1",
        "latin-1",
        "iso-8859-1",
        "windows-1252",
        "ascii",
        "us-ascii",
      ].includes(name)
    )
      this.encoding = "windows-1252";
    else throw new RangeError("Unsupported controller text encoding: " + label);
    this.fatal = options.fatal === true;
    this.ignoreBOM = options.ignoreBOM === true;
  }
  decode(input?: AllowSharedBufferSource, options: TextDecodeOptions = {}) {
    const next =
      input === undefined
        ? new Uint8Array()
        : ArrayBuffer.isView(input)
          ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
          : new Uint8Array(input);
    const bytes = new Uint8Array(this.pending.length + next.length);
    bytes.set(this.pending);
    bytes.set(next, this.pending.length);
    this.pending = new Uint8Array();
    const chunks: string[] = [],
      points: string[] = [];
    const append = (point: number) => {
      if (!this.bomSeen) {
        this.bomSeen = true;
        if (point === 0xfeff && !this.ignoreBOM) return;
      }
      points.push(String.fromCodePoint(point));
      if (points.length === 8192) {
        chunks.push(points.join(""));
        points.length = 0;
      }
    };
    const invalid = () => {
      if (this.fatal) throw new TypeError("Invalid UTF-8 text.");
      append(0xfffd);
    };
    try {
      scan: for (let i = 0; i < bytes.length;) {
        const first = bytes[i];
        if (this.encoding === "windows-1252") {
          append(
            first >= 0x80 && first <= 0x9f ? windows1252[first - 0x80] : first,
          );
          i++;
          continue;
        }
        if (first < 0x80) {
          append(first);
          i++;
          continue;
        }
        const size =
          first >= 0xc2 && first <= 0xdf
            ? 2
            : first >= 0xe0 && first <= 0xef
              ? 3
              : first >= 0xf0 && first <= 0xf4
                ? 4
                : 0;
        if (!size) {
          invalid();
          i++;
          continue;
        }
        let point = first & (size === 2 ? 0x1f : size === 3 ? 0xf : 7);
        for (let j = 1; j < size; j++) {
          if (i + j >= bytes.length) {
            if (options.stream) this.pending = bytes.slice(i);
            else invalid();
            break scan;
          }
          const byte = bytes[i + j];
          const lower =
            j === 1 && first === 0xe0
              ? 0xa0
              : j === 1 && first === 0xf0
                ? 0x90
                : 0x80;
          const upper =
            j === 1 && first === 0xed
              ? 0x9f
              : j === 1 && first === 0xf4
                ? 0x8f
                : 0xbf;
          if (byte < lower || byte > upper) {
            invalid();
            i += j;
            continue scan;
          }
          point = (point << 6) | (byte & 0x3f);
        }
        append(point);
        i += size;
      }
      return chunks.join("") + points.join("");
    } finally {
      if (!options.stream) {
        this.pending = new Uint8Array();
        this.bomSeen = false;
      }
    }
  }
}

const native = typeof globalThis === "undefined" ? undefined : globalThis;
export const TextEncoder = native?.TextEncoder ?? SandboxTextEncoder;
export const TextDecoder = native?.TextDecoder ?? SandboxTextDecoder;
