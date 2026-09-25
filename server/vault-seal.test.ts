import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { readJobSourceSettings, saveJobSourceSettings } from "./job-sources";
import { readMapSettings, saveMapSettings } from "./map-settings";
import { loadLatestModelConnection, saveModelConnection } from "./models";
import { ensureOccupant, LOCAL_OCCUPANT_ID } from "./occupant";
import { openSecret, sealSecret, VaultSealError } from "./vault-seal";
import {
  clearSystemVaultKey,
  systemVaultKeyStore,
  useVaultKeyStore,
  VaultKeyError,
} from "./vault-key";

describe("vault seal", () => {
  it("locks a secret so the stored text is not the secret", () => {
    const secret = "adzuna-secret";
    const locked = sealSecret(secret, randomBytes(32));
    expect(locked.startsWith("vault:1:")).toBe(true);
    expect(locked).not.toContain(secret);
  });

  it("opens a secret with the same key and leaves an older plaintext value alone", () => {
    const vault = randomBytes(32);
    expect(openSecret(sealSecret("maps-key", vault), vault)).toBe("maps-key");
    expect(openSecret("legacy-plain", vault)).toBe("legacy-plain");
    expect(openSecret("", vault)).toBe("");
  });

  it("refuses a changed ciphertext", () => {
    const vault = randomBytes(32);
    const locked = sealSecret("maps-key", vault);
    const flipped = `${locked.slice(0, -1)}${locked.endsWith("a") ? "b" : "a"}`;
    expect(() => openSecret(flipped, vault)).toThrow(VaultSealError);
  });
});

describe("secrets at rest", () => {
  it("stores job, map, and model secrets locked, and reads them back", () => {
    const db = openDatabase(":memory:");
    ensureOccupant(db);
    try {
      saveJobSourceSettings(db, LOCAL_OCCUPANT_ID, {
        sources: [
          {
            id: "source-1",
            name: "Adzuna",
            applicationId: "app-id",
            apiKey: "source-secret",
            enabled: true,
          },
        ],
      });
      saveMapSettings(db, LOCAL_OCCUPANT_ID, {
        provider: "google",
        googleMapsApiKey: "maps-secret",
      });
      saveModelConnection(db, LOCAL_OCCUPANT_ID, {
        hosting: "cloud",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt",
        apiKey: "model-secret",
      });

      const sources = db
        .prepare("SELECT settings_json FROM job_source_settings WHERE occupant_id = ?")
        .get(LOCAL_OCCUPANT_ID) as { settings_json: string };
      const maps = db
        .prepare(
          "SELECT google_maps_api_key AS key FROM map_settings WHERE occupant_id = ?",
        )
        .get(LOCAL_OCCUPANT_ID) as { key: string };
      const model = db
        .prepare("SELECT api_key AS key FROM model_connections WHERE occupant_id = ?")
        .get(LOCAL_OCCUPANT_ID) as { key: string };

      expect(sources.settings_json).toContain("app-id");
      expect(sources.settings_json).not.toContain("source-secret");
      expect(sources.settings_json).toContain("vault:1:");
      expect(maps.key).not.toContain("maps-secret");
      expect(maps.key.startsWith("vault:1:")).toBe(true);
      expect(model.key).not.toContain("model-secret");
      expect(model.key.startsWith("vault:1:")).toBe(true);

      expect(readJobSourceSettings(db, LOCAL_OCCUPANT_ID).sources[0]?.apiKey).toBe(
        "source-secret",
      );
      expect(readMapSettings(db, LOCAL_OCCUPANT_ID).googleMapsApiKey).toBe("maps-secret");
      expect(loadLatestModelConnection(db, LOCAL_OCCUPANT_ID)?.apiKey).toBe(
        "model-secret",
      );
    } finally {
      db.close();
    }
  });

  it("locks a secret that was saved before encryption", () => {
    const db = openDatabase(":memory:");
    ensureOccupant(db);
    try {
      db.prepare(
        `INSERT INTO job_source_settings (occupant_id, settings_json, updated_at)
         VALUES (?, ?, ?)`,
      ).run(
        LOCAL_OCCUPANT_ID,
        JSON.stringify({
          sources: [
            {
              id: "source-1",
              name: "Adzuna",
              applicationId: "app-id",
              apiKey: "old-source-secret",
              enabled: true,
            },
          ],
          sites: [],
          judgment: ["profile"],
        }),
        new Date().toISOString(),
      );
      db.prepare(
        `INSERT INTO map_settings (occupant_id, provider, google_maps_api_key, updated_at)
         VALUES (?, 'google', ?, ?)`,
      ).run(LOCAL_OCCUPANT_ID, "old-maps-secret", new Date().toISOString());

      expect(readJobSourceSettings(db, LOCAL_OCCUPANT_ID).sources[0]?.apiKey).toBe(
        "old-source-secret",
      );
      expect(readMapSettings(db, LOCAL_OCCUPANT_ID).googleMapsApiKey).toBe(
        "old-maps-secret",
      );

      const sources = db
        .prepare("SELECT settings_json FROM job_source_settings WHERE occupant_id = ?")
        .get(LOCAL_OCCUPANT_ID) as { settings_json: string };
      const maps = db
        .prepare(
          "SELECT google_maps_api_key AS key FROM map_settings WHERE occupant_id = ?",
        )
        .get(LOCAL_OCCUPANT_ID) as { key: string };
      expect(sources.settings_json).not.toContain("old-source-secret");
      expect(maps.key.startsWith("vault:1:")).toBe(true);
    } finally {
      db.close();
    }
  });

  it("does not save a secret when the keychain cannot hold the key", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    useVaultKeyStore({
      read: () => null,
      write: () => {
        throw new VaultKeyError();
      },
    });
    try {
      const saved = await app.request("/api/job-sources", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sources: [
            {
              id: "source-1",
              name: "Adzuna",
              applicationId: "app-id",
              apiKey: "source-secret",
              enabled: true,
            },
          ],
        }),
      });
      expect(saved.status).toBe(503);
      const row = db
        .prepare("SELECT settings_json FROM job_source_settings WHERE occupant_id = ?")
        .get(LOCAL_OCCUPANT_ID);
      expect(row).toBeUndefined();
    } finally {
      useVaultKeyStore(null);
      db.close();
    }
  });
});

describe("login keyring", () => {
  it.skipIf(!process.env.DBUS_SESSION_BUS_ADDRESS)(
    "keeps the vault key in the login keyring",
    () => {
      const account = "vault-key-self-test";
      const store = systemVaultKeyStore(account);
      try {
        store.write("probe-value");
        expect(store.read()).toBe("probe-value");
      } finally {
        clearSystemVaultKey(account);
      }
    },
  );
});
