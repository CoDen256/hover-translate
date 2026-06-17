// ── Protobuf codec ────────────────────────────────────────────────────────────

function encodeVarint(n: number): Uint8Array {
  const buf: number[] = [];
  let bn = BigInt(Math.trunc(n));
  while (bn > 0x7fn) {
    buf.push(Number(bn & 0x7fn) | 0x80);
    bn >>= 7n;
  }
  buf.push(Number(bn));
  return new Uint8Array(buf);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function pbString(field: number, s: string): Uint8Array {
  const encoded = new TextEncoder().encode(s);
  const tag = encodeVarint((field << 3) | 2);
  const len = encodeVarint(encoded.length);
  return concat(tag, len, encoded);
}

function pbInt(field: number, n: number): Uint8Array {
  const tag = encodeVarint((field << 3) | 0);
  return concat(tag, encodeVarint(n));
}

function pbEmbed(field: number, payload: Uint8Array): Uint8Array {
  const tag = encodeVarint((field << 3) | 2);
  const len = encodeVarint(payload.length);
  return concat(tag, len, payload);
}

function pbDecode(data: Uint8Array): Map<number, Array<number | Uint8Array>> {
  const result = new Map<number, Array<number | Uint8Array>>();
  let pos = 0;

  const readVarint = (): number => {
    let value = 0n;
    let shift = 0n;
    while (pos < data.length) {
      const byte = data[pos++];
      value |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
      if (!(byte & 0x80)) break;
    }
    return Number(value);
  };

  while (pos < data.length) {
    const tag = readVarint();
    const field = tag >>> 3;
    const wireType = tag & 0x07;

    let value: number | Uint8Array;
    if (wireType === 0) {
      value = readVarint();
    } else if (wireType === 2) {
      const len = readVarint();
      value = data.slice(pos, pos + len);
      pos += len;
    } else {
      break;
    }

    if (!result.has(field)) result.set(field, []);
    result.get(field)!.push(value);
  }

  return result;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export class AnkiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnkiAuthError";
  }
}

export interface AnkiDeck {
  id: number;
  name: string;
}

export interface AnkiNotetype {
  id: number;
  name: string;
}

export interface AnkiInfo {
  decks: AnkiDeck[];
  notetypes: AnkiNotetype[];
  currentDeckId: number | null;
  currentNotetypeId: number | null;
}

export interface AnkiHistoryEntry {
  front: string;
  back: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

const ANKIWEB = "https://ankiweb.net";
const ANKIUSER = "https://ankiuser.net";

export class AnkiService {
  async login(email: string, password: string): Promise<void> {
    const body = concat(pbString(1, email), pbString(2, password));
    const response = await fetch(`${ANKIWEB}/svc/account/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Origin": ANKIWEB,
        "Referer": `${ANKIWEB}/`,
      },
      body,
    });

    const bytes = new Uint8Array(await response.arrayBuffer());
    const decoded = pbDecode(bytes);

    const statusValues = decoded.get(1);
    const status = statusValues ? (statusValues[0] as number) : 0;

    if (status === 2) throw new AnkiAuthError("Invalid email");
    if (status === 3) throw new AnkiAuthError("Invalid password");
    if (status !== 1) throw new AnkiAuthError("Login failed");

    const tokenValues = decoded.get(2);
    const tokenBytes = tokenValues ? (tokenValues[0] as Uint8Array) : null;
    if (!tokenBytes) throw new AnkiAuthError("No token in response");

    const token = new TextDecoder().decode(tokenBytes);
    await fetch(`${ANKIUSER}/account/ankiuser-login?t=${encodeURIComponent(token)}`, {
      credentials: "include",
    });
  }

  async getInfo(): Promise<AnkiInfo> {
    const bytes = await this.svc(ANKIUSER, "/svc/editor/get-info-for-adding");
    const decoded = pbDecode(bytes);

    const dec = new TextDecoder();

    const notetypes: AnkiNotetype[] = (decoded.get(1) ?? []).map((raw) => {
      const d = pbDecode(raw as Uint8Array);
      const idVals = d.get(1);
      const nameVals = d.get(2);
      return {
        id: idVals ? (idVals[0] as number) : 0,
        name: nameVals ? dec.decode(nameVals[0] as Uint8Array) : "",
      };
    });

    const decks: AnkiDeck[] = (decoded.get(2) ?? []).map((raw) => {
      const d = pbDecode(raw as Uint8Array);
      const idVals = d.get(1);
      const nameVals = d.get(2);
      return {
        id: idVals ? (idVals[0] as number) : 0,
        name: nameVals ? dec.decode(nameVals[0] as Uint8Array) : "",
      };
    });

    const currentDeckIdVals = decoded.get(3);
    const currentNotetypeIdVals = decoded.get(4);

    return {
      notetypes,
      decks,
      currentDeckId: currentDeckIdVals ? (currentDeckIdVals[0] as number) : null,
      currentNotetypeId: currentNotetypeIdVals ? (currentNotetypeIdVals[0] as number) : null,
    };
  }

  async getNotetypeFields(notetypeId: number): Promise<string[]> {
    const body = pbInt(1, notetypeId);
    const bytes = await this.svc(ANKIUSER, "/svc/editor/get-notetype-fields", body);
    const decoded = pbDecode(bytes);
    const dec = new TextDecoder();

    return (decoded.get(1) ?? []).map((raw) => {
      const d = pbDecode(raw as Uint8Array);
      const nameVals = d.get(2);
      return nameVals ? dec.decode(nameVals[0] as Uint8Array) : "";
    });
  }

  async addCard(deckId: number, notetypeId: number, fields: string[], tags?: string): Promise<void> {
    let body = new Uint8Array(0);
    for (const field of fields) {
      body = concat(body, pbString(1, field));
    }
    if (tags) body = concat(body, pbString(2, tags));
    body = concat(body, pbEmbed(3, concat(pbInt(1, notetypeId), pbInt(2, deckId))));

    await this.svc(ANKIUSER, "/svc/editor/add-or-update", body);
  }

  private async svc(base: string, path: string, body?: Uint8Array): Promise<Uint8Array> {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Origin": base,
        "Referer": `${base}/`,
      },
      credentials: "include",
      body: body ?? new Uint8Array(0),
    });

    if (response.status === 403) throw new AnkiAuthError("Session expired");
    if (!response.ok) {
      const errBody = new Uint8Array(await response.arrayBuffer());
      const hex = errBody.length > 0
        ? Array.from(errBody).map(b => b.toString(16).padStart(2, "0")).join(" ")
        : "(empty body)";
      throw new Error(`AnkiWeb error ${response.status}: ${hex}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}
