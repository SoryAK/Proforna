import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Context, Hono } from "hono";
import {
  REQUEST_KIND_ASK,
  REQUEST_KIND_LABEL,
  isRequestKind,
  prepareJoin,
  prepareRequestAnswer,
  type JoinDetails,
  type RelayRequestState,
} from "../core/index";

/**
 * Requests ("asks") the owner sends to anyone. The owner stores each one under
 * the hash of its link token; the recipient opens /q/<token>, which only they
 * hold, and answers there. The owner reads the answers back.
 */

type AskRow = {
  token_hash: string;
  kind: string;
  body: string;
  from_name: string;
  from_headline: string;
  recipient_name: string;
  expires_at: string;
  status: RelayRequestState["status"];
  note: string;
  opened_at: string | null;
  answered_at: string | null;
  join_choice: "joined" | "declined" | null;
  join_json: string | null;
};

const HASH = /^[0-9a-f]{64}$/;

export function registerAsks(app: Hono, db: DatabaseSync, isOwner: (c: Context) => boolean) {
  const read = (hash: string) =>
    db.prepare("SELECT * FROM relay_asks WHERE token_hash = ?").get(hash) as AskRow | undefined;

  // Owner: create a request, or change one nobody has answered yet.
  app.put("/relay/asks/:hash", async (c) => {
    if (!isOwner(c)) return c.json({ error: "Unauthorized." }, 401);
    const hash = c.req.param("hash");
    if (!HASH.test(hash)) return c.json({ error: "hash-invalid" }, 400);
    const body = (await c.req.json()) as Record<string, unknown>;
    const kind = body.kind;
    const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");
    const expiresAt = text("expiresAt");
    if (!isRequestKind(kind) || !text("body") || !text("fromName") || !text("recipientName") || !expiresAt) {
      return c.json({ error: "request-invalid" }, 400);
    }
    const now = new Date().toISOString();
    const current = read(hash);
    if (current && current.status !== "sent" && current.status !== "opened") {
      return c.json({ error: "request-closed" }, 409);
    }
    db.prepare(
      `INSERT INTO relay_asks
        (token_hash, kind, body, from_name, from_headline, recipient_name, expires_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
       ON CONFLICT(token_hash) DO UPDATE SET
         kind = excluded.kind, body = excluded.body, from_name = excluded.from_name,
         from_headline = excluded.from_headline, recipient_name = excluded.recipient_name,
         expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
    ).run(hash, kind, text("body"), text("fromName"), text("fromHeadline"), text("recipientName"), expiresAt, now, now);
    return c.json({ ok: true }, current ? 200 : 201);
  });

  // Owner: withdraw a request. Its link then says it was withdrawn.
  app.delete("/relay/asks/:hash", (c) => {
    if (!isOwner(c)) return c.json({ error: "Unauthorized." }, 401);
    db.prepare(
      `UPDATE relay_asks SET status = 'withdrawn', updated_at = ?
        WHERE token_hash = ? AND status IN ('sent', 'opened')`,
    ).run(new Date().toISOString(), c.req.param("hash"));
    return c.json({ ok: true });
  });

  // Owner: read back where requests stand.
  app.post("/relay/asks/states", async (c) => {
    if (!isOwner(c)) return c.json({ error: "Unauthorized." }, 401);
    const body = (await c.req.json()) as { hashes?: unknown };
    const hashes = Array.isArray(body.hashes)
      ? body.hashes.filter((h): h is string => typeof h === "string" && HASH.test(h)).slice(0, 500)
      : [];
    const states: Record<string, RelayRequestState> = {};
    for (const hash of hashes) {
      const row = read(hash);
      if (row) {
        states[hash] = {
          status: row.status,
          note: row.note,
          openedAt: row.opened_at,
          answeredAt: row.answered_at,
          join: row.join_choice
            ? { choice: row.join_choice, details: row.join_json ? (JSON.parse(row.join_json) as JoinDetails) : null }
            : null,
        };
      }
    }
    return c.json({ states });
  });

  // Owner: Docier has the joiner's details, so the Relay stops holding them.
  app.delete("/relay/asks/:hash/join", (c) => {
    if (!isOwner(c)) return c.json({ error: "Unauthorized." }, 401);
    db.prepare("UPDATE relay_asks SET join_json = NULL WHERE token_hash = ?").run(c.req.param("hash"));
    return c.json({ ok: true });
  });

  // Owner: access requests visitors left on public pages, newest last.
  app.get("/relay/inbound", (c) => {
    if (!isOwner(c)) return c.json({ error: "Unauthorized." }, 401);
    const after = c.req.query("after") ?? "";
    const rows = db
      .prepare(
        `SELECT id, slug, requester_name AS name, requester_email AS email, message, created_at AS createdAt
           FROM relay_requests WHERE created_at > ? ORDER BY created_at ASC LIMIT 500`,
      )
      .all(after);
    return c.json({ requests: rows });
  });

  // Recipient: the page their link opens.
  app.get("/q/:token", (c) => {
    privatePage(c);
    const token = c.req.param("token");
    const row = read(hashToken(token));
    if (!row) return c.html(page("Not available", `<h1>This link isn't available.</h1><p>It may be mistyped, or the request was removed.</p>`), 404);
    if (row.status === "withdrawn") {
      return c.html(page("Withdrawn", `<h1>This request was withdrawn.</h1><p>${escapeHtml(row.from_name)} no longer needs an answer. Thank you for looking.</p>`));
    }
    if (row.status === "approved" || row.status === "declined") {
      return c.html(page("Answered", answeredCard(row)));
    }
    if (row.expires_at <= new Date().toISOString()) {
      return c.html(page("Expired", `<h1>This request has expired.</h1><p>Ask ${escapeHtml(row.from_name)} to send a new one if you'd still like to answer.</p>`));
    }
    if (row.status === "sent") {
      db.prepare("UPDATE relay_asks SET status = 'opened', opened_at = ? WHERE token_hash = ? AND status = 'sent'").run(
        new Date().toISOString(),
        row.token_hash,
      );
    }
    return c.html(page(`${REQUEST_KIND_LABEL[row.kind as keyof typeof REQUEST_KIND_LABEL]} request`, answerForm(row, token)));
  });

  // Recipient: approve or decline, with a note.
  app.post("/q/:token/answer", async (c) => {
    privatePage(c);
    const row = read(hashToken(c.req.param("token")));
    if (!row) return c.json({ error: "not-found" }, 404);
    if (row.status !== "sent" && row.status !== "opened") return c.json({ error: "request-closed" }, 409);
    if (row.expires_at <= new Date().toISOString()) return c.json({ error: "request-expired" }, 409);
    const body = (await c.req.json()) as Record<string, unknown>;
    const prepared = prepareRequestAnswer(body);
    if (!prepared.ok) return c.json({ error: prepared.error }, 400);
    const join = prepareJoin(body.join);
    if (!join.ok) return c.json({ error: join.error }, 400);
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE relay_asks SET status = ?, note = ?, answered_at = ?, opened_at = COALESCE(opened_at, ?), updated_at = ?,
              join_choice = ?, join_json = ?
        WHERE token_hash = ? AND status IN ('sent', 'opened')`,
    ).run(
      prepared.value.decision,
      prepared.value.note,
      now,
      now,
      now,
      join.value?.choice ?? null,
      join.value?.details ? JSON.stringify(join.value.details) : null,
      row.token_hash,
    );
    return c.json({ ok: true, status: prepared.value.decision });
  });
}

/** The link's token is its only key, so keep the page out of caches and referrers. */
function privatePage(c: Context) {
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function answerForm(row: AskRow, token: string): string {
  const kind = row.kind as keyof typeof REQUEST_KIND_ASK;
  const from = escapeHtml(row.from_name);
  const first = escapeHtml(row.from_name.split(/\s+/)[0] || row.from_name);
  return `
  <p class="kicker">${escapeHtml(REQUEST_KIND_LABEL[kind])} request</p>
  <h1>${from} asks you to ${escapeHtml(REQUEST_KIND_ASK[kind])}</h1>
  ${row.from_headline ? `<p class="sub">${escapeHtml(row.from_headline)}</p>` : ""}
  <div class="msg">${escapeHtml(row.body).replaceAll("\n", "<br>")}</div>
  <form id="answer">
    <label>A note back to ${first} (optional)<textarea name="note" rows="4" maxlength="2000"></textarea></label>
    <div class="join" id="join">
      <label class="check"><input type="checkbox" id="join-on"> Also join ${first}'s network and share my contact details</label>
      <div class="fields" id="join-fields" hidden>
        <label>Name<input name="join-name" value="${escapeHtml(row.recipient_name)}" maxlength="200" autocomplete="name"></label>
        <label>Email<input name="join-email" type="email" maxlength="320" autocomplete="email"></label>
        <label>Organization<input name="join-organization" maxlength="200" autocomplete="organization"></label>
        <label>Role<input name="join-role" maxlength="200" autocomplete="organization-title"></label>
        <label>Phone (optional)<input name="join-phone" maxlength="60" autocomplete="tel"></label>
      </div>
      <p class="small" id="join-hint">Leave it unticked to answer without joining. ${first} only sees your answer and note.</p>
      <button type="button" class="linkish" id="join-no">No thanks, don't add me</button>
    </div>
    <div class="acts"><button type="submit" name="decision" value="declined" class="no">Decline</button><button type="submit" name="decision" value="approved" class="yes">Approve</button></div>
    <p id="status" role="status"></p>
  </form>
  <script>
    const form = document.querySelector("#answer");
    const joinOn = document.querySelector("#join-on");
    let declinedJoin = false;
    joinOn.addEventListener("change", () => {
      document.querySelector("#join-fields").hidden = !joinOn.checked;
      document.querySelector("#join-no").hidden = joinOn.checked;
      declinedJoin = false;
    });
    document.querySelector("#join-no").addEventListener("click", () => {
      declinedJoin = true;
      joinOn.checked = false;
      document.querySelector("#join-fields").hidden = true;
      const box = document.querySelector("#join"); box.replaceChildren(Object.assign(document.createElement("p"), { className: "small", textContent: "You won\u2019t be added to the network." }));
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const decision = event.submitter?.value;
      const data = new FormData(form);
      const note = data.get("note") || "";
      let join;
      if (joinOn.checked) {
        join = { choice: "joined", details: Object.fromEntries(["name", "email", "organization", "role", "phone"].map((k) => [k, data.get("join-" + k) || ""])) };
        if (!join.details.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(join.details.email)) {
          document.querySelector("#status").textContent = "Add your name and a valid email to join, or untick the box.";
          return;
        }
      } else if (declinedJoin) {
        join = { choice: "declined" };
      }
      for (const b of form.querySelectorAll("button")) b.disabled = true;
      const response = await fetch(${JSON.stringify(`/q/${encodeURIComponent(token)}/answer`)}, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note, join }),
      }).catch(() => null);
      if (response && response.ok) {
        form.outerHTML = '<div class="done">Thank you. ' + (decision === "approved" ? "You approved" : "You declined") + ' the request, and ${first} will see your answer.</div>';
        return;
      }
      for (const b of form.querySelectorAll("button")) b.disabled = false;
      document.querySelector("#status").textContent = "Your answer could not be sent. Try again.";
    });
  </script>`;
}

function answeredCard(row: AskRow): string {
  const first = escapeHtml(row.from_name.split(/\s+/)[0] || row.from_name);
  return `<h1>You ${row.status === "approved" ? "approved" : "declined"} this request.</h1><p>${first} has your answer. Thank you.</p>${
    row.note ? `<div class="msg">${escapeHtml(row.note).replaceAll("\n", "<br>")}</div>` : ""
  }`;
}

function page(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title><style>
:root{color-scheme:dark;font-family:"Geist Variable",system-ui,sans-serif;background:#0d0b09;color:#f3efe6}
body{margin:0;min-height:100vh;display:grid;place-items:start center;padding:56px 16px 48px;box-sizing:border-box}
main{width:min(520px,100%);padding:26px;border-radius:18px;background:#16130f;border:1px solid #2a241c;display:grid;gap:14px;box-sizing:border-box}
h1{margin:0;font-size:24px;letter-spacing:-.02em;line-height:1.25}p{margin:0;color:#c9bdad;line-height:1.55}
.kicker{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#c99b56}.sub{font-size:14px}
.msg{padding:14px;border-radius:12px;background:#1d1913;color:#e8e1d3;line-height:1.55}
form{display:grid;gap:12px}label{display:grid;gap:6px;font-size:13px;color:#e8e1d3}
textarea{padding:10px;border-radius:10px;border:1px solid #3a3128;background:#1d1913;color:#f3efe6;font:inherit;resize:vertical}
.acts{display:flex;gap:8px;justify-content:flex-end}button{height:40px;padding:0 16px;border-radius:10px;font:inherit;font-weight:600;cursor:pointer}
.no{border:1px solid #3a3128;background:transparent;color:#f3efe6}.yes{border:1px solid #f3efe6;background:#f3efe6;color:#16130f}
button:disabled{opacity:.5;cursor:default}.done{padding:14px;border-radius:12px;background:#13251b;color:#b8e6c9}
#status{color:#f0b4a8;min-height:1em}
.join{display:grid;gap:10px;padding:14px;border:1px solid #3a3128;border-radius:12px}
.check{display:flex;align-items:center;gap:10px;font-size:14px}.check input{width:18px;height:18px;accent-color:#f3efe6}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fields[hidden]{display:none}
.fields input{height:36px;padding:0 10px;border-radius:9px;border:1px solid #3a3128;background:#1d1913;color:#f3efe6;font:inherit}
.small{font-size:12px;color:#a49b8c}.linkish{justify-self:start;height:auto;padding:0;border:0;background:none;color:#c9bdad;font-weight:400;text-decoration:underline}
@media (max-width:520px){.fields{grid-template-columns:1fr}}footer{margin-top:14px;text-align:center;font-size:12px;color:#8f877a}
</style></head><body><div><main>${content}</main><footer>Sent with Docier · This link is only for you</footer></div></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
