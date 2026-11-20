import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PORTABLE_FORMAT_VERSION } from "../core/portability";
import { openDatabase } from "./db";
import { ensureOccupant } from "./occupant";
import {
  PortabilityError,
  restorePortableArchive,
  type RestoreLimits,
} from "./portability";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Builds an archive. `listed` names the entries the manifest vouches for. */
function archive(
  files: Record<string, Uint8Array>,
  listed: string[] = Object.keys(files),
  tables: Record<string, unknown[]> = {},
): Uint8Array {
  const data = strToU8(JSON.stringify({ tables }));
  const all: Record<string, Uint8Array> = { "data.json": data, ...files };
  const checksums: Record<string, string> = { "data.json": sha(data) };
  for (const name of listed) checksums[name] = sha(all[name]);
  const manifest = {
    formatVersion: PORTABLE_FORMAT_VERSION,
    product: "Proforna",
    exportedAt: new Date().toISOString(),
    occupantId: "someone",
    dataFile: "data.json",
    fileCount: Object.keys(files).length,
    checksums,
  };
  return zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), ...all });
}

describe("restoring a portable archive", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>;
  let occupantId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "proforna-restore-"));
    db = openDatabase(":memory:");
    occupantId = ensureOccupant(db).id;
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const restore = (bytes: Uint8Array, limits?: RestoreLimits) =>
    restorePortableArchive(db, occupantId, dir, bytes, limits);
  const code = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      if (error instanceof PortabilityError) return error.code;
      throw error;
    }
    return "ok";
  };

  it("writes files the manifest vouches for", () => {
    const result = restore(archive({ "files/a.txt": strToU8("hello") }));
    expect(result.files).toBe(1);
    expect(existsSync(join(dir, "a.txt"))).toBe(true);
  });

  it("refuses a file the manifest does not list, and writes nothing", () => {
    const bytes = archive(
      { "files/a.txt": strToU8("listed"), "files/sneaky.txt": strToU8("not") },
      ["files/a.txt"],
    );
    expect(code(() => restore(bytes))).toBe("file-unlisted");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses entries outside data.json and files/", () => {
    expect(code(() => restore(archive({ "other.bin": strToU8("x") })))).toBe(
      "file-unlisted",
    );
  });

  it("refuses a file path that climbs out of the uploads folder", () => {
    expect(
      code(() => restore(archive({ "files/../escape.txt": strToU8("x") }))),
    ).toBe("path-invalid");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses rows that point a file name outside the uploads folder", () => {
    const bytes = archive({}, [], {
      profiles: [{ occupant_id: "x", avatar_stored_name: "../../.ssh/id_rsa" }],
    });
    expect(code(() => restore(bytes))).toBe("path-invalid");
    const row = db
      .prepare("SELECT avatar_stored_name FROM profiles WHERE occupant_id = ?")
      .get(occupantId) as { avatar_stored_name: string | null } | undefined;
    expect(row?.avatar_stored_name ?? null).toBeNull();
  });

  it("refuses an archive that unpacks past the size limit", () => {
    // A few kilobytes of zip that would unpack to 5 MB.
    const bytes = archive({ "files/big.bin": new Uint8Array(5_000_000) });
    expect(bytes.byteLength).toBeLessThan(50_000);
    expect(
      code(() =>
        restore(bytes, { maxUnpackedBytes: 1_000_000, maxEntries: 100 }),
      ),
    ).toBe("archive-too-large");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses an archive with too many entries", () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 20; i += 1) files[`files/${i}.txt`] = strToU8("x");
    expect(
      code(() =>
        restore(archive(files), { maxUnpackedBytes: 1_000_000, maxEntries: 10 }),
      ),
    ).toBe("archive-too-large");
  });

  it("refuses an entry whose declared size is a lie", () => {
    const bytes = Buffer.from(
      archive({ "files/big.bin": new Uint8Array(1_000_000) }),
    );
    // Claim the file is tiny in both the local and central headers.
    const local = bytes.indexOf(Buffer.from("files/big.bin")) - 30;
    bytes.writeUInt32LE(10, local + 22);
    const central = bytes.lastIndexOf(Buffer.from("files/big.bin")) - 46;
    bytes.writeUInt32LE(10, central + 24);
    expect(code(() => restore(new Uint8Array(bytes)))).toBe("checksum-mismatch");
    expect(readdirSync(dir)).toEqual([]);
  });
});
