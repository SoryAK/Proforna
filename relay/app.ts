import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import type { WorkMapSnapshot } from "../core/index";

type RelayProjection = Omit<WorkMapSnapshot, "occupantId">;

type JsonObject = Record<string, unknown>;

export function createRelayApp(db: DatabaseSync, ownerToken: string): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, service: "proforna-relay" }));

  app.put("/relay/publications/:slug", async (c) => {
    if (!isOwner(c.req.header("authorization"), ownerToken)) {
      return c.json({ error: "Unauthorized." }, 401);
    }
    const body = (await c.req.json()) as { projection?: unknown };
    const projection = parseProjection(body.projection);
    if (!projection || projection.slug !== c.req.param("slug")) {
      return c.json({ error: "Invalid projection bundle." }, 400);
    }
    if (projection.visibility === "private") {
      return c.json({ error: "Private projections cannot be relayed." }, 400);
    }
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO relay_publications
        (slug, projection_json, visibility, expires_at, published_at,
         revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(slug) DO UPDATE SET
         projection_json = excluded.projection_json,
         visibility = excluded.visibility,
         expires_at = excluded.expires_at,
         published_at = excluded.published_at,
         revoked_at = NULL`,
    ).run(
      projection.slug,
      JSON.stringify(projection),
      projection.visibility,
      projection.expiresAt,
      now,
    );
    return c.json({ slug: projection.slug, publishedAt: now }, 201);
  });

  app.delete("/relay/publications/:slug", (c) => {
    if (!isOwner(c.req.header("authorization"), ownerToken)) {
      return c.json({ error: "Unauthorized." }, 401);
    }
    const result = db
      .prepare(
        "UPDATE relay_publications SET revoked_at = ? WHERE slug = ? AND revoked_at IS NULL",
      )
      .run(new Date().toISOString(), c.req.param("slug"));
    return result.changes
      ? c.json({ ok: true })
      : c.json({ error: "Publication not found." }, 404);
  });

  app.post("/relay/publications/:slug/grants", async (c) => {
    if (!isOwner(c.req.header("authorization"), ownerToken)) {
      return c.json({ error: "Unauthorized." }, 401);
    }
    const body = (await c.req.json()) as {
      token?: unknown;
      expiresAt?: unknown;
    };
    if (typeof body.token !== "string" || typeof body.expiresAt !== "string") {
      return c.json({ error: "Token and expiry are required." }, 400);
    }
    db.prepare(
      `INSERT INTO relay_grants
        (id, slug, token_hash, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, NULL)`,
    ).run(
      randomUUID(),
      c.req.param("slug"),
      hashToken(body.token),
      body.expiresAt,
    );
    return c.json({ ok: true }, 201);
  });

  app.get("/r/:slug", (c) => {
    const projection = resolveProjection(
      db,
      c.req.param("slug"),
      c.req.query("token") ?? null,
    );
    if (!projection) {
      if (requiresAccess(db, c.req.param("slug"))) {
        return c.html(renderAccessRequestHtml(c.req.param("slug")), 403);
      }
      return c.html(
        "<!doctype html><title>Not available</title><h1>This publication is not available.</h1>",
        404,
      );
    }
    db.prepare(
      `INSERT INTO relay_events
        (id, slug, event_type, section, occurred_at)
       VALUES (?, ?, 'view', NULL, ?)`,
    ).run(randomUUID(), projection.slug, new Date().toISOString());
    return c.html(
      renderProjectionHtml(
        projection,
        c.req.query("view") === "journey" ? "journey" : "list",
      ),
    );
  });

  app.post("/r/:slug/requests", async (c) => {
    if (!requiresAccess(db, c.req.param("slug"))) {
      return c.json({ error: "Publication not found." }, 404);
    }
    const body = (await c.req.json()) as JsonObject;
    const name = text(body.name);
    const email = text(body.email);
    if (!name || !email.includes("@")) {
      return c.json({ error: "A name and valid email are required." }, 400);
    }
    db.prepare(
      `INSERT INTO relay_requests
        (id, slug, requester_name, requester_email, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      c.req.param("slug"),
      name,
      email,
      text(body.message),
      new Date().toISOString(),
    );
    return c.json({ ok: true }, 201);
  });

  app.post("/r/:slug/events", async (c) => {
    const body = (await c.req.json()) as JsonObject;
    const eventType = text(body.eventType);
    if (!["section", "contact"].includes(eventType)) {
      return c.json({ error: "Unsupported event." }, 400);
    }
    db.prepare(
      `INSERT INTO relay_events
        (id, slug, event_type, section, occurred_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      c.req.param("slug"),
      eventType,
      text(body.section) || null,
      new Date().toISOString(),
    );
    return c.json({ ok: true }, 201);
  });

  app.get("/relay/publications/:slug/analytics", (c) => {
    if (!isOwner(c.req.header("authorization"), ownerToken)) {
      return c.json({ error: "Unauthorized." }, 401);
    }
    const events = db
      .prepare(
        `SELECT event_type, section, COUNT(*) AS total
         FROM relay_events WHERE slug = ?
         GROUP BY event_type, section ORDER BY total DESC`,
      )
      .all(c.req.param("slug"));
    const requests = db
      .prepare("SELECT COUNT(*) AS total FROM relay_requests WHERE slug = ?")
      .get(c.req.param("slug")) as { total: number };
    return c.json({ events, inboundRequests: Number(requests.total) });
  });

  return app;
}

function resolveProjection(
  db: DatabaseSync,
  slug: string,
  token: string | null,
): RelayProjection | null {
  const row = db
    .prepare(
      `SELECT projection_json, visibility, expires_at
       FROM relay_publications
       WHERE slug = ? AND revoked_at IS NULL`,
    )
    .get(slug) as JsonObject | undefined;
  if (!row) return null;
  if (row.expires_at && String(row.expires_at) <= new Date().toISOString()) {
    return null;
  }
  if (row.visibility === "access-controlled") {
    if (!token) return null;
    const grant = db
      .prepare(
        `SELECT id FROM relay_grants
         WHERE slug = ? AND token_hash = ? AND revoked_at IS NULL
           AND expires_at > ?`,
      )
      .get(slug, hashToken(token), new Date().toISOString());
    if (!grant) return null;
  }
  return JSON.parse(String(row.projection_json)) as RelayProjection;
}

function requiresAccess(db: DatabaseSync, slug: string): boolean {
  const row = db
    .prepare(
      `SELECT visibility, expires_at FROM relay_publications
       WHERE slug = ? AND revoked_at IS NULL`,
    )
    .get(slug) as
    | { visibility: string; expires_at: string | null }
    | undefined;
  return Boolean(
    row &&
      row.visibility === "access-controlled" &&
      (!row.expires_at || row.expires_at > new Date().toISOString()),
  );
}

function parseProjection(value: unknown): RelayProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const projection = value as JsonObject;
  if (
    typeof projection.id !== "string" ||
    typeof projection.slug !== "string" ||
    typeof projection.visibility !== "string" ||
    !projection.profile ||
    !Array.isArray(projection.roles) ||
    "occupantId" in projection
  ) {
    return null;
  }
  return projection as RelayProjection;
}

function renderProjectionHtml(
  projection: RelayProjection,
  view: "list" | "journey",
): string {
  const experience = projection.roles
    .map(
      (role) => `<article class="role" data-role="${escapeHtml(role.id)}">
        <p class="span">${escapeHtml(role.span)}</p>
        <h2>${escapeHtml(role.title)}</h2>
        <p>${escapeHtml(role.organization)}</p>
        ${role.description ? `<p>${escapeHtml(role.description)}</p>` : ""}
        <ul>${role.achievements.map((claim) => `<li>${escapeHtml(claim)}</li>`).join("")}</ul>
        ${role.techStack.length ? `<p class="skills">${role.techStack.map(escapeHtml).join(" · ")}</p>` : ""}
        ${role.growth ? `<p>${escapeHtml(role.growth)}</p>` : ""}
        ${role.departure ? `<p>${escapeHtml(role.departure)}</p>` : ""}
        ${role.schedule ? `<p class="skills">${escapeHtml([role.schedule.shift, role.schedule.hoursPerWeek ? `${role.schedule.hoursPerWeek} hrs/week` : "", role.schedule.workMode].filter(Boolean).join(" · "))}</p>` : ""}
        ${role.benefits?.length ? `<p class="skills">${role.benefits.map(escapeHtml).join(" · ")}</p>` : ""}
        ${role.paidTimeOff ? `<p>${escapeHtml(role.paidTimeOff)}</p>` : ""}
        ${role.environment ? `<p>${escapeHtml(role.environment)}</p>` : ""}
        ${role.uniform ? `<p>${escapeHtml(role.uniform)}</p>` : ""}
        ${role.equipment?.length ? `<p class="skills">${role.equipment.map(escapeHtml).join(" · ")}</p>` : ""}
        ${role.workplaceRating != null ? `<p class="skills">Workplace ${role.workplaceRating}/5</p>` : ""}
        ${role.compensation?.amount != null ? `<p class="skills">${escapeHtml(String(role.compensation.amount))} ${escapeHtml(role.compensation.currency)} / ${escapeHtml(role.compensation.period)}</p>` : ""}
        ${role.milestones.map((moment) => `<div class="moment"><b>${escapeHtml(moment.title)}</b><span>${escapeHtml(moment.date)}</span><p>${escapeHtml(moment.detail)}</p></div>`).join("")}
        ${role.media.map((item) => item.kind === "photo" ? `<figure><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.title)}"><figcaption>${escapeHtml(item.caption || item.title)}</figcaption></figure>` : "").join("")}
      </article>`,
    )
    .join("");
  const mapPoints = projection.roles.flatMap((role) =>
    role.locations.map((location) => ({
      roleId: role.id,
      title: role.title,
      organization: role.organization,
      ...location,
    })),
  );
  const mapData = JSON.stringify(mapPoints).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(projection.profile.displayName)} — ${escapeHtml(projection.targetRole)}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#090807;color:#e8e0d1}
*{box-sizing:border-box}body{margin:0;background:#090807}main{min-height:100vh}
header{display:flex;justify-content:space-between;gap:2rem;padding:1.5rem 2rem;border-bottom:1px solid #493b2d}
h1{font:italic clamp(2rem,5vw,4rem) Georgia,serif;margin:0}header p,.span,nav a{color:#b89772}
nav{display:flex;gap:1rem;align-items:end}a{color:#d8b68c}.shell{display:grid;grid-template-columns:minmax(20rem,38rem) 1fr;height:calc(100vh - 7rem)}
.history{overflow:auto;padding:1rem 2rem 4rem}.map{min-height:30rem}.role{padding:1.5rem 0;border-top:1px solid #302820}
.journey .role{border-left:1px solid #b89772;border-top:0;padding:0 0 2.5rem 1.5rem}
h2{font:italic 1.6rem Georgia,serif;margin:.3rem 0}p,li{line-height:1.65;color:#c9bdad}.skills{color:#d8b68c}
.moment{border-left:2px solid #6f563c;padding-left:.8rem;margin:.8rem 0}.moment span{margin-left:.6rem;color:#87735f;font-size:.75rem}
figure{margin:1rem 0}figure img{width:100%;max-height:18rem;object-fit:cover}figcaption{color:#87735f;font-size:.75rem}
@media(max-width:800px){header{display:block}.shell{display:flex;flex-direction:column;height:auto}.map{order:-1;height:48vh}.history{overflow:visible}}
</style></head><body><main class="${view}">
<header><div><h1>${escapeHtml(projection.profile.displayName)}</h1><p>${escapeHtml(projection.targetRole || projection.profile.headline)}</p></div>
<nav><a href="?view=list">List</a><a href="?view=journey">Journey</a></nav></header>
<div class="shell"><section class="history">${projection.profile.bio ? `<p>${escapeHtml(projection.profile.bio)}</p>` : ""}
${experience}
${projection.skills.length ? `<section><h2>Skills</h2><p class="skills">${projection.skills.map(escapeHtml).join(" · ")}</p></section>` : ""}
</section><div id="map" class="map" aria-label="Interactive career map"></div></div>
</main><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const points=${mapData};const map=L.map('map',{zoomControl:true}).setView(points.length?[points[0].latitude,points[0].longitude]:[39.95,-75.16],7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap'}).addTo(map);
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const bounds=[];for(const point of points){const marker=L.marker([point.latitude,point.longitude]).addTo(map).bindPopup('<b>'+esc(point.title)+'</b><br>'+esc(point.organization)+'<br>'+esc(point.label));bounds.push([point.latitude,point.longitude]);marker.on('click',()=>{document.querySelector('[data-role="'+CSS.escape(point.roleId)+'"]')?.scrollIntoView({behavior:'smooth'});fetch('/r/${encodeURIComponent(projection.slug)}/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventType:'section',section:'role:'+point.roleId})});});}if(bounds.length>1)map.fitBounds(bounds,{padding:[40,40]});
</script></body></html>`;
}

function renderAccessRequestHtml(slug: string): string {
  const safeSlug = escapeHtml(slug);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Request access</title><style>:root{color-scheme:dark;font-family:Inter,system-ui;background:#090807;color:#e8e0d1}body{margin:0;display:grid;min-height:100vh;place-items:center}main{width:min(32rem,calc(100% - 2rem))}h1{font:italic 3rem Georgia,serif;margin:0 0 1rem}p{color:#c9bdad;line-height:1.6}form{display:grid;gap:1rem;margin-top:2rem}input,textarea{padding:.8rem;border:1px solid #493b2d;background:#0f0c09;color:#e8e0d1;font:inherit}button{justify-self:start;padding:.8rem 1.1rem;border:0;background:#b89772;color:#090807;font-weight:700}#status{color:#d8b68c}</style></head>
<body><main><h1>Request access</h1><p>This career map is shared with approved viewers. Introduce yourself and the owner can issue a time-limited link.</p>
<form id="request"><input name="name" required placeholder="Your name"><input name="email" type="email" required placeholder="Work email"><textarea name="message" rows="4" placeholder="Why you would like access"></textarea><button>Send request</button></form><p id="status" role="status"></p></main>
<script>document.querySelector('#request').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.target);const response=await fetch('/r/${safeSlug}/requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(form))});document.querySelector('#status').textContent=response.ok?'Request sent.':'Could not send this request.';if(response.ok)event.target.reset();});</script></body></html>`;
}

function isOwner(header: string | undefined, token: string): boolean {
  if (!header?.startsWith("Bearer ") || !token) return false;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
