import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { PRODUCT, type ApplicationStage } from "../core/index";
import {
  isHttpUrl,
  normalizeBaseUrl,
} from "../core/model-connection";
import { LOCAL_ONBOARDING_ENDPOINTS } from "../core/model-onboarding";
import {
  parseExtractedResume,
  parseHistoryResumeId,
} from "../core/resume-extract";
import {
  LOCAL_MODEL_PROBE_MS,
  listOpenAiCompatModels,
  type CompleteFn,
} from "./openai-compat";
import { pingDatabase } from "./db";
import { loadCareerFile, saveExtractedResume } from "./history";
import { listOccupantNotices } from "./notices";
import {
  AgencyStoreError,
  runAgency,
} from "./agency";
import { ensureOccupant, readProfile } from "./occupant";
import {
  ModelConnectionError,
  listModelConnections,
  saveModelConnection,
} from "./models";
import {
  ProfileError,
  completeOnboarding,
  evidenceIdForResume,
  loadAvatar,
  saveProfile,
  storeAvatar,
  storeResume,
} from "./profile";
import {
  ResumeExtractError,
  extractResumeFromFile,
  type ResumeExtractDeps,
} from "./resume-extract";
import {
  CareerMemoryStoreError,
  approveCareerFactChange,
  backfillCareerMemory,
  proposeCareerFact,
  readCareerMemory,
  saveEvidence,
} from "./career-memory";
import {
  WorklogStoreError,
  approveWorklogChanges,
  captureWorklog,
  listProposedChangeSets,
  listWorklog,
  proposeWorklogChanges,
} from "./worklog";
import {
  ResumeStudioStoreError,
  createResumeRevision,
  createResumeVariant,
  listResumeVariants,
  readResumeRevision,
} from "./resume-studio";
import { renderResumeDocx, renderResumePdf } from "./resume-render";
import {
  ProjectionStoreError,
  captureAccessRequest,
  createProjection,
  createProjectionGrant,
  listProjections,
  publishProjection,
  recordProjectionEvent,
  resolveOpportunityAccess,
  resolvePublishedProjection,
  revokeProjection,
  type ProjectionRelay,
} from "./projections";
import {
  CareerManagementStoreError,
  approveExternalAction,
  createApplication,
  createContact,
  createInterview,
  createOffer,
  createOpportunity,
  createPlan,
  promoteOpportunityToNetwork,
  proposeExternalAction,
  readCareerManagement,
  transitionOwnedApplication,
  type ExternalActionAdapter,
} from "./career-management";
import {
  ConversationStoreError,
  commitSuggestedReply,
  listContactMessages,
  listProposedReplies,
  receiveInboundMessage,
  sendOccupantMessage,
} from "./conversation";
import {
  DocumentStoreError,
  listDocuments,
  loadDocument,
  storeDocument,
} from "./documents";
import {
  PortabilityError,
  createPortableArchive,
  restorePortableArchive,
} from "./portability";
import {
  IntegrationStoreError,
  listIntegrations,
  saveIntegration,
} from "./integrations";
import {
  WorkMapStoreError,
  addWorkMapLocation,
  addWorkMapMedia,
  createWorkMapRole,
  lookupNominatimPlace,
  readWorkMap,
  readWorkMapSettings,
  removeWorkMapLocation,
  saveWorkMapDetails,
  saveWorkMapSettings,
  updateWorkMapLocation,
  updateWorkMapRole,
} from "./work-map";

export type AppOptions = {
  uploadsDir?: string;
  extract?: ResumeExtractDeps;
  relay?: ProjectionRelay;
  externalActions?: ExternalActionAdapter;
  complete?: CompleteFn;
  places?: {
    lookup?: (query: string) => Promise<{
      label: string;
      address: string;
      latitude: number;
      longitude: number;
    } | null>;
  };
};

export function createApp(db: DatabaseSync, options: AppOptions = {}): Hono {
  const uploadsDir = options.uploadsDir ?? "data/uploads";
  const extractDeps = options.extract ?? {};
  const relay = options.relay;
  const externalActions = options.externalActions;
  const complete = options.complete;
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({ ok: true, product: PRODUCT.name, db: pingDatabase(db) }),
  );

  app.get("/api/me", (c) => {
    const occupant = ensureOccupant(db);
    const profile = readProfile(db, occupant.id);
    return c.json({ occupant, profile });
  });

  app.get("/api/notices", (c) => {
    const occupant = ensureOccupant(db);
    return c.json({ notices: listOccupantNotices(db, occupant.id) });
  });

  app.post("/api/agency/runs", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const result = await runAgency(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
        complete,
        c.req.raw.signal,
      );
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof AgencyStoreError) {
        const status =
          error.code === "remote-model-grant-required" ||
          error.code === "grant-expired"
            ? 403
            : error.code === "entry-missing" ||
                error.code === "contact-missing"
              ? 404
              : error.code === "model-failed"
                ? 502
                : error.code === "model-busy"
                  ? 409
                  : 400;
        return c.json({ error: error.code }, status);
      }
      throw error;
    }
  });

  app.put("/api/profile", async (c) => {
    const occupant = ensureOccupant(db);
    const body = (await c.req.json()) as Record<string, unknown>;
    try {
      const profile = saveProfile(db, occupant.id, body);
      return c.json({ occupant, profile });
    } catch (err) {
      if (err instanceof ProfileError) {
        const messages: Record<string, string> = {
          "name-required": "A name is required.",
          "url-invalid": "Use an http(s) URL for LinkedIn, GitHub, or portfolio.",
        };
        return c.json({ error: messages[err.code] ?? "Could not save." }, 400);
      }
      throw err;
    }
  });

  app.post("/api/profile/avatar", async (c) => {
    const occupant = ensureOccupant(db);
    const form = await c.req.formData();
    const file = form.get("avatar");
    if (!(file instanceof File)) {
      return c.json({ error: "A photo file is required." }, 400);
    }
    try {
      const profile = storeAvatar(db, occupant.id, uploadsDir, {
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      return c.json({ occupant, profile }, 201);
    } catch (err) {
      if (err instanceof ProfileError) {
        const messages: Record<string, string> = {
          "avatar-type": "Use a jpeg, png, webp, or gif photo.",
          "avatar-too-large": "That photo is too large (5 MB max).",
        };
        return c.json({ error: messages[err.code] ?? "Could not save." }, 400);
      }
      throw err;
    }
  });

  app.get("/api/profile/avatar", (c) => {
    const occupant = ensureOccupant(db);
    const avatar = loadAvatar(db, occupant.id, uploadsDir);
    if (!avatar) return c.json({ error: "No photo yet." }, 404);
    return c.body(Buffer.from(avatar.bytes), 200, {
      "content-type": avatar.type,
    });
  });

  app.post("/api/onboarding/complete", (c) => {
    const occupant = ensureOccupant(db);
    try {
      const profile = completeOnboarding(db, occupant.id);
      return c.json({ occupant, profile });
    } catch (err) {
      if (err instanceof ProfileError && err.code === "name-required") {
        return c.json({ error: "A name is required." }, 400);
      }
      throw err;
    }
  });

  app.get("/api/models", (c) => {
    const occupant = ensureOccupant(db);
    return c.json({ connections: listModelConnections(db, occupant.id) });
  });

  app.get("/api/models/probe", async (c) => {
    const locals = await Promise.all(
      LOCAL_ONBOARDING_ENDPOINTS.map(async (endpoint) => {
        const result = await listOpenAiCompatModels({
          baseUrl: endpoint.baseUrl,
          timeoutMs: LOCAL_MODEL_PROBE_MS,
        });
        if (!result.ok) {
          return { id: endpoint.id, reachable: false, models: [] as string[] };
        }
        return { id: endpoint.id, reachable: true, models: result.models };
      }),
    );
    return c.json({ locals });
  });

  app.post("/api/models/discover", async (c) => {
    const body = (await c.req.json()) as { baseUrl?: unknown; apiKey?: unknown };
    const baseUrl = normalizeBaseUrl(body.baseUrl);
    if (!baseUrl || !isHttpUrl(baseUrl)) {
      return c.json({ error: "A valid http(s) URL is required." }, 400);
    }
    const apiKey =
      typeof body.apiKey === "string" && body.apiKey.trim()
        ? body.apiKey.trim()
        : null;
    const result = await listOpenAiCompatModels({ baseUrl, apiKey });
    if (!result.ok) {
      return c.json({ error: result.error }, 422);
    }
    return c.json({ models: result.models });
  });

  app.post("/api/models", async (c) => {
    const occupant = ensureOccupant(db);
    const body = (await c.req.json()) as Record<string, unknown>;
    try {
      const connection = saveModelConnection(db, occupant.id, body);
      return c.json({ connection }, 201);
    } catch (err) {
      if (err instanceof ModelConnectionError) {
        const messages: Record<string, string> = {
          "hosting-required": "Choose local or cloud.",
          "url-required": "A base URL is required.",
          "url-invalid": "That does not look like an http(s) URL.",
          "key-required": "A cloud connection needs an API key.",
        };
        return c.json({ error: messages[err.code] ?? "Could not save." }, 400);
      }
      throw err;
    }
  });

  app.post("/api/resumes", async (c) => {
    const occupant = ensureOccupant(db);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return c.json({ error: "A resume file is required." }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const resume = storeResume(db, occupant.id, uploadsDir, {
      name: file.name,
      bytes,
    });
    return c.json({ resume }, 201);
  });

  app.post("/api/resumes/extract", async (c) => {
    const occupant = ensureOccupant(db);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return c.json({ error: "A resume file is required." }, 400);
    }
    try {
      const result = await extractResumeFromFile(
        db,
        occupant.id,
        {
          name: file.name,
          type: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        },
        extractDeps,
        c.req.raw.signal,
      );
      return c.json(result);
    } catch (err) {
      if (err instanceof ResumeExtractError) {
        return c.json({ error: err.message }, err.status);
      }
      throw err;
    }
  });

  app.get("/api/history", (c) => {
    const occupant = ensureOccupant(db);
    return c.json(loadCareerFile(db, occupant.id));
  });

  app.post("/api/history", async (c) => {
    const occupant = ensureOccupant(db);
    const body: unknown = await c.req.json();
    const extracted = parseExtractedResume(body);
    const resumeLink = parseHistoryResumeId(body);
    if (!extracted || !resumeLink.ok) {
      return c.json({ error: "Could not read that extract." }, 400);
    }
    let evidenceId: string | null = null;
    if (resumeLink.resumeId) {
      evidenceId = evidenceIdForResume(db, occupant.id, resumeLink.resumeId);
      if (!evidenceId) {
        return c.json({ error: "Could not find that resume." }, 400);
      }
    }
    const saved = await saveExtractedResume(
      db,
      occupant.id,
      extracted,
      evidenceId,
    );
    return c.json({ ok: true, ...saved }, 201);
  });

  app.get("/api/memory", (c) => {
    const occupant = ensureOccupant(db);
    backfillCareerMemory(db, occupant.id);
    return c.json(readCareerMemory(db, occupant.id));
  });

  app.post("/api/memory/evidence", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const evidence = saveEvidence(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ evidence }, 201);
    } catch (error) {
      if (error instanceof CareerMemoryStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/memory/proposals", async (c) => {
    const occupant = ensureOccupant(db);
    const changeSet = await proposeCareerFact(
      db,
      occupant.id,
      (await c.req.json()) as Record<string, unknown>,
    );
    return c.json({ changeSet }, 201);
  });

  app.post("/api/memory/proposals/:id/approve", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const result = await approveCareerFactChange(
        db,
        occupant.id,
        c.req.param("id"),
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof CareerMemoryStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/worklog", (c) => {
    const occupant = ensureOccupant(db);
    return c.json({
      entries: listWorklog(db, occupant.id),
      proposals: listProposedChangeSets(db, occupant.id),
    });
  });

  app.post("/api/worklog", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const entry = captureWorklog(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ entry }, 201);
    } catch (error) {
      if (error instanceof WorklogStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/worklog/:id/proposals", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const changeSets = await proposeWorklogChanges(
        db,
        occupant.id,
        c.req.param("id"),
      );
      return c.json({ changeSets }, 201);
    } catch (error) {
      if (error instanceof WorklogStoreError) {
        return c.json({ error: error.code }, 404);
      }
      throw error;
    }
  });

  app.post("/api/worklog/proposals/approve", async (c) => {
    const occupant = ensureOccupant(db);
    const body = (await c.req.json()) as { changeSetIds?: unknown };
    const ids = Array.isArray(body.changeSetIds)
      ? body.changeSetIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    const results = await approveWorklogChanges(db, occupant.id, ids);
    return c.json({ results });
  });

  app.get("/api/resume-studio", (c) => {
    const occupant = ensureOccupant(db);
    return c.json({ variants: listResumeVariants(db, occupant.id) });
  });

  app.post("/api/resume-studio", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const variant = createResumeVariant(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ variant }, 201);
    } catch (error) {
      if (error instanceof ResumeStudioStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/resume-studio/:id/revisions", (c) => {
    const occupant = ensureOccupant(db);
    try {
      const revision = createResumeRevision(
        db,
        occupant.id,
        c.req.param("id"),
      );
      return c.json({ revision }, 201);
    } catch (error) {
      if (error instanceof ResumeStudioStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/resume-studio/revisions/:id/export/:format", async (c) => {
    const occupant = ensureOccupant(db);
    const revision = readResumeRevision(db, occupant.id, c.req.param("id"));
    if (!revision) return c.json({ error: "Revision not found." }, 404);
    const format = c.req.param("format");
    if (format !== "pdf" && format !== "docx") {
      return c.json({ error: "Choose pdf or docx." }, 400);
    }
    const bytes =
      format === "pdf"
        ? await renderResumePdf(revision)
        : await renderResumeDocx(revision);
    return c.body(Buffer.from(bytes), 200, {
      "content-type":
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="resume-${revision.revisionNumber}.${format}"`,
    });
  });

  app.get("/api/projections", (c) => {
    const occupant = ensureOccupant(db);
    return c.json({ projections: listProjections(db, occupant.id) });
  });

  app.get("/api/work-map", (c) => {
    const occupant = ensureOccupant(db);
    return c.json(readWorkMap(db, occupant.id));
  });

  app.get("/api/work-map/places", async (c) => {
    ensureOccupant(db);
    const query = c.req.query("q")?.trim() ?? "";
    if (!query) return c.json({ error: "query-required" }, 400);
    const lookup = options.places?.lookup ?? lookupNominatimPlace;
    const place = await lookup(query);
    if (!place) return c.json({ error: "place-missing" }, 404);
    return c.json({ place });
  });

  app.post("/api/work-map/roles", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const role = await createWorkMapRole(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ role }, 201);
    } catch (error) {
      if (error instanceof WorkMapStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.put("/api/work-map/roles/:id", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const role = await updateWorkMapRole(
        db,
        occupant.id,
        c.req.param("id"),
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ role });
    } catch (error) {
      if (error instanceof WorkMapStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.put("/api/work-map/roles/:id/details", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const details = saveWorkMapDetails(
        db,
        occupant.id,
        c.req.param("id"),
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ details });
    } catch (error) {
      if (error instanceof WorkMapStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/work-map/roles/:id/locations", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const location = addWorkMapLocation(
        db,
        occupant.id,
        c.req.param("id"),
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ location }, 201);
    } catch (error) {
      if (error instanceof WorkMapStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.put("/api/work-map/roles/:id/locations/:locationId", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const location = updateWorkMapLocation(
        db,
        occupant.id,
        c.req.param("id"),
        c.req.param("locationId"),
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ location });
    } catch (error) {
      if (error instanceof WorkMapStoreError) {
        return c.json(
          { error: error.code },
          error.code.endsWith("-missing") ? 404 : 400,
        );
      }
      throw error;
    }
  });

  app.delete("/api/work-map/roles/:id/locations/:locationId", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      removeWorkMapLocation(
        db,
        occupant.id,
        c.req.param("id"),
        c.req.param("locationId"),
      );
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof WorkMapStoreError) {
        return c.json(
          { error: error.code },
          error.code.endsWith("-missing") ? 404 : 400,
        );
      }
      throw error;
    }
  });

  app.post("/api/work-map/roles/:id/media", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const media = addWorkMapMedia(
        db,
        occupant.id,
        c.req.param("id"),
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ media }, 201);
    } catch (error) {
      if (error instanceof WorkMapStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/work-map/settings", (c) => {
    const occupant = ensureOccupant(db);
    return c.json({ settings: readWorkMapSettings(db, occupant.id) });
  });

  app.put("/api/work-map/settings", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const settings = await saveWorkMapSettings(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ settings });
    } catch (error) {
      if (error instanceof WorkMapStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/work-map/publish", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const projection = createProjection(db, occupant.id, {});
      const publication = await publishProjection(
        db,
        occupant.id,
        projection.id,
        relay,
      );
      return c.json({ projection, publication }, 201);
    } catch (error) {
      if (
        error instanceof WorkMapStoreError ||
        error instanceof ProjectionStoreError
      ) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/projections", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const projection = createProjection(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ projection }, 201);
    } catch (error) {
      if (error instanceof ProjectionStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/projections/:id/publish", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const publication = await publishProjection(
        db,
        occupant.id,
        c.req.param("id"),
        relay,
      );
      return c.json({ publication }, 201);
    } catch (error) {
      if (error instanceof ProjectionStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/projections/:id/revoke", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      await revokeProjection(db, occupant.id, c.req.param("id"), relay);
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof ProjectionStoreError) {
        return c.json({ error: error.code }, 404);
      }
      throw error;
    }
  });

  app.post("/api/projections/:id/grants", async (c) => {
    const occupant = ensureOccupant(db);
    const body = (await c.req.json()) as { expiresAt?: unknown };
    try {
      const grant = await createProjectionGrant(
        db,
        occupant.id,
        c.req.param("id"),
        typeof body.expiresAt === "string"
          ? body.expiresAt
          : new Date(Date.now() + 7 * 86_400_000).toISOString(),
        relay,
      );
      return c.json({ grant }, 201);
    } catch (error) {
      if (error instanceof ProjectionStoreError) {
        return c.json({ error: error.code }, 404);
      }
      throw error;
    }
  });

  app.get("/api/public/:slug", (c) => {
    const projection = resolvePublishedProjection(
      db,
      c.req.param("slug"),
      c.req.query("token") ?? null,
    );
    return projection
      ? c.json({ projection })
      : c.json({ error: "Publication not found or access denied." }, 404);
  });

  app.post("/api/public/:slug/requests", async (c) => {
    try {
      const request = captureAccessRequest(
        db,
        c.req.param("slug"),
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ request: { id: request.id } }, 201);
    } catch (error) {
      if (error instanceof ProjectionStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/public/:slug/events", async (c) => {
    const projection = resolvePublishedProjection(
      db,
      c.req.param("slug"),
      c.req.query("token") ?? null,
    );
    if (!projection) return c.json({ error: "Publication not found." }, 404);
    const body = (await c.req.json()) as {
      eventType?: unknown;
      section?: unknown;
    };
    try {
      recordProjectionEvent(
        db,
        projection.id,
        typeof body.eventType === "string" ? body.eventType : "",
        typeof body.section === "string" ? body.section : undefined,
      );
      return c.json({ ok: true }, 201);
    } catch (error) {
      if (error instanceof ProjectionStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/career-management", (c) => {
    const occupant = ensureOccupant(db);
    return c.json(readCareerManagement(db, occupant.id));
  });

  app.post("/api/opportunities", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const opportunity = createOpportunity(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ opportunity }, 201);
    } catch (error) {
      if (error instanceof CareerManagementStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/opportunities/:id/access", async (c) => {
    const occupant = ensureOccupant(db);
    const body = (await c.req.json()) as {
      decision?: unknown;
      expiresAt?: unknown;
    };
    try {
      const result = await resolveOpportunityAccess(
        db,
        occupant.id,
        c.req.param("id"),
        typeof body.decision === "string" ? body.decision : "",
        typeof body.expiresAt === "string"
          ? body.expiresAt
          : new Date(Date.now() + 7 * 86_400_000).toISOString(),
        relay,
      );
      return c.json(
        result,
        result.decision === "grant" ? 201 : 200,
      );
    } catch (error) {
      if (error instanceof ProjectionStoreError) {
        return c.json(
          { error: error.code },
          error.code === "decision-invalid" ? 400 : 404,
        );
      }
      throw error;
    }
  });

  app.post("/api/opportunities/:id/network", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      return c.json(
        promoteOpportunityToNetwork(db, occupant.id, c.req.param("id")),
      );
    } catch (error) {
      if (error instanceof CareerManagementStoreError) {
        const status =
          error.code === "opportunity-missing"
            ? 404
            : error.code === "kind-invalid"
              ? 400
              : 400;
        return c.json({ error: error.code }, status);
      }
      throw error;
    }
  });

  app.post("/api/opportunities/:id/applications", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const application = createApplication(
        db,
        occupant.id,
        c.req.param("id"),
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ application }, 201);
    } catch (error) {
      if (error instanceof CareerManagementStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/applications/:id/transition", async (c) => {
    const occupant = ensureOccupant(db);
    const body = (await c.req.json()) as { stage?: unknown };
    const stages: ApplicationStage[] = [
      "preparing",
      "submitted",
      "screen",
      "interview",
      "offer",
      "accepted",
      "declined",
      "withdrawn",
      "rejected",
    ];
    if (
      typeof body.stage !== "string" ||
      !stages.includes(body.stage as ApplicationStage)
    ) {
      return c.json({ error: "stage-invalid" }, 400);
    }
    try {
      const application = await transitionOwnedApplication(
        db,
        occupant.id,
        c.req.param("id"),
        body.stage as ApplicationStage,
      );
      return c.json({ application });
    } catch (error) {
      if (error instanceof CareerManagementStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/applications/:id/interviews", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const interview = createInterview(
        db,
        occupant.id,
        c.req.param("id"),
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ interview }, 201);
    } catch (error) {
      if (error instanceof CareerManagementStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/applications/:id/offers", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const offer = createOffer(
        db,
        occupant.id,
        c.req.param("id"),
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ offer }, 201);
    } catch (error) {
      if (error instanceof CareerManagementStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/contacts", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      return c.json(
        {
          contact: createContact(
            db,
            occupant.id,
            (await c.req.json()) as Record<string, unknown>,
          ),
        },
        201,
      );
    } catch (error) {
      if (error instanceof CareerManagementStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/contacts/inbound", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const received = receiveInboundMessage(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json(received, 201);
    } catch (error) {
      if (error instanceof ConversationStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/contacts/:id/messages", (c) => {
    const occupant = ensureOccupant(db);
    try {
      return c.json({
        messages: listContactMessages(db, occupant.id, c.req.param("id")),
        proposedReplies: listProposedReplies(
          db,
          occupant.id,
          c.req.param("id"),
        ),
      });
    } catch (error) {
      if (error instanceof ConversationStoreError) {
        return c.json({ error: error.code }, 404);
      }
      throw error;
    }
  });

  app.post("/api/contacts/:id/messages", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const sent = await sendOccupantMessage(
        db,
        occupant.id,
        c.req.param("id"),
        (await c.req.json()) as Record<string, unknown>,
        externalActions,
      );
      return c.json(sent, 201);
    } catch (error) {
      if (error instanceof ConversationStoreError) {
        const status = error.code === "contact-missing" ? 404 : 400;
        return c.json({ error: error.code }, status);
      }
      throw error;
    }
  });

  app.post("/api/contacts/:id/replies/:changeSetId/approve", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const result = await commitSuggestedReply(
        db,
        occupant.id,
        c.req.param("id"),
        c.req.param("changeSetId"),
        externalActions,
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof ConversationStoreError) {
        const status =
          error.code === "contact-missing" || error.code === "change-set-missing"
            ? 404
            : 400;
        return c.json({ error: error.code }, status);
      }
      throw error;
    }
  });

  app.post("/api/plans", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      return c.json(
        {
          plan: createPlan(
            db,
            occupant.id,
            (await c.req.json()) as Record<string, unknown>,
          ),
        },
        201,
      );
    } catch (error) {
      if (error instanceof CareerManagementStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/external-actions", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const action = await proposeExternalAction(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ action }, 201);
    } catch (error) {
      if (error instanceof CareerManagementStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.post("/api/external-actions/:id/approve", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const result = await approveExternalAction(
        db,
        occupant.id,
        c.req.param("id"),
        externalActions,
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof CareerManagementStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/documents", (c) => {
    const occupant = ensureOccupant(db);
    return c.json({ documents: listDocuments(db, occupant.id) });
  });

  app.post("/api/documents", async (c) => {
    const occupant = ensureOccupant(db);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "file-required" }, 400);
    }
    try {
      const document = storeDocument(
        db,
        occupant.id,
        uploadsDir,
        {
          name: file.name,
          type: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        },
        typeof form.get("category") === "string"
          ? String(form.get("category"))
          : "career",
      );
      return c.json({ document }, 201);
    } catch (error) {
      if (error instanceof DocumentStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/documents/:id", (c) => {
    const occupant = ensureOccupant(db);
    const document = loadDocument(
      db,
      occupant.id,
      uploadsDir,
      c.req.param("id"),
    );
    if (!document) return c.json({ error: "Document not found." }, 404);
    return c.body(Buffer.from(document.bytes), 200, {
      "content-type": document.row.mediaType,
      "content-disposition": `attachment; filename="${encodeURIComponent(document.row.originalName)}"`,
    });
  });

  app.get("/api/portability/export", (c) => {
    const occupant = ensureOccupant(db);
    const archive = createPortableArchive(db, occupant.id, uploadsDir);
    return c.body(Buffer.from(archive), 200, {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="proforna-export.zip"',
    });
  });

  app.post("/api/portability/restore", async (c) => {
    const occupant = ensureOccupant(db);
    const form = await c.req.formData();
    const file = form.get("archive");
    if (!(file instanceof File)) {
      return c.json({ error: "archive-required" }, 400);
    }
    try {
      const restored = restorePortableArchive(
        db,
        occupant.id,
        uploadsDir,
        new Uint8Array(await file.arrayBuffer()),
      );
      return c.json({ restored });
    } catch (error) {
      if (error instanceof PortabilityError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  app.get("/api/integrations", (c) => {
    const occupant = ensureOccupant(db);
    return c.json({ integrations: listIntegrations(db, occupant.id) });
  });

  app.post("/api/integrations", async (c) => {
    const occupant = ensureOccupant(db);
    try {
      const integration = saveIntegration(
        db,
        occupant.id,
        (await c.req.json()) as Record<string, unknown>,
      );
      return c.json({ integration }, 201);
    } catch (error) {
      if (error instanceof IntegrationStoreError) {
        return c.json({ error: error.code }, 400);
      }
      throw error;
    }
  });

  return app;
}
