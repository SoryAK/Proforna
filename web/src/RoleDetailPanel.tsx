import { useState, type FormEvent } from "react";
import type { WorkMapMoment, WorkMapRole } from "@core/work-map";

type DetailTab = "story" | "conditions" | "map-media";

export function RoleDetailPanel({
  role,
  onClose,
  onSaved,
  placement,
  onStartPlacement,
  onLocationSaved,
}: {
  role: WorkMapRole;
  onClose: () => void;
  onSaved: () => Promise<void>;
  placement: { latitude: number; longitude: number } | null;
  onStartPlacement: () => void;
  onLocationSaved: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("story");
  const [message, setMessage] = useState("");

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/work-map/roles/${role.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        organization: form.get("organization"),
        locationLabel: form.get("locationLabel"),
        startDate: form.get("startDate"),
        endDate: form.get("endDate"),
        isCurrent: form.get("isCurrent") === "on",
        description: form.get("description"),
        achievements: lines(form.get("achievements")),
      }),
    });
    await finish(response, "Role story saved.");
  }

  async function saveStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await saveDetails({
      techStack: commas(form.get("techStack")),
      skills: commas(form.get("skills")),
      milestones: moments(form.get("milestones")),
      events: moments(form.get("events")),
      notes: moments(form.get("notes"), false),
      growth: form.get("growth"),
      departure: form.get("departure"),
    });
    await finish(response, "Career detail saved.");
  }

  async function saveConditions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("compensation"));
    const hours = Number(form.get("hoursPerWeek"));
    const rating = Number(form.get("workplaceRating"));
    const response = await saveDetails({
      compensation: {
        currency: form.get("currency"),
        period: form.get("period"),
        amount: Number.isFinite(amount) && amount > 0 ? amount : null,
        visibility: "private",
      },
      schedule: {
        shift: form.get("shift"),
        hoursPerWeek: Number.isFinite(hours) && hours > 0 ? hours : null,
        workMode: form.get("workMode"),
      },
      benefits: commas(form.get("benefits")),
      paidTimeOff: form.get("paidTimeOff"),
      environment: form.get("environment"),
      workplaceRating:
        Number.isFinite(rating) && rating > 0 ? rating : null,
      uniform: form.get("uniform"),
      equipment: commas(form.get("equipment")),
    });
    await finish(response, "Work conditions saved privately.");
  }

  async function addLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/work-map/roles/${role.id}/locations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: form.get("label"),
          address: form.get("address"),
          latitude: Number(form.get("latitude")),
          longitude: Number(form.get("longitude")),
          kind: form.get("kind"),
          isPublic: form.get("isPublic") === "on",
        }),
      },
    );
    if (response.ok) {
      event.currentTarget.reset();
      onLocationSaved();
    }
    await finish(response, "Work site added.");
  }

  async function addMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/work-map/roles/${role.id}/media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: form.get("kind"),
        title: form.get("title"),
        url: form.get("url"),
        caption: form.get("caption"),
        isPublic: form.get("isPublic") === "on",
      }),
    });
    if (response.ok) event.currentTarget.reset();
    await finish(response, "Media attached.");
  }

  function saveDetails(body: Record<string, unknown>) {
    return fetch(`/api/work-map/roles/${role.id}/details`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function finish(response: Response, success: string) {
    if (response.ok) {
      setMessage(success);
      await onSaved();
    } else {
      const body = (await response.json()) as { error?: string };
      setMessage(body.error ?? "Could not save this detail.");
    }
  }

  return (
    <aside className="role-detail" aria-label={`${role.title} details`}>
      <header>
        <div>
          <h2>{role.title}</h2>
          <p>{role.organization}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close role details">
          Close
        </button>
      </header>

      <nav aria-label="Role detail sections">
        {(
          [
            ["story", "Story"],
            ["conditions", "Conditions"],
            ["map-media", "Map & media"],
          ] as Array<[DetailTab, string]>
        ).map(([value, label]) => (
          <button
            className={tab === value ? "is-active" : ""}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="role-detail-scroll" key={`${role.id}-${tab}`}>
        {tab === "story" ? (
          <>
            <form className="role-form" onSubmit={saveRole}>
              <h3>Role overview</h3>
              <div className="role-form-pair">
                <label>
                  Title
                  <input name="title" defaultValue={role.title} />
                </label>
                <label>
                  Organization
                  <input name="organization" defaultValue={role.organization} />
                </label>
              </div>
              <label>
                Location label
                <input name="locationLabel" defaultValue={role.locationLabel} />
              </label>
              <div className="role-form-pair">
                <label>
                  Start
                  <input name="startDate" defaultValue={role.startDate} />
                </label>
                <label>
                  End
                  <input name="endDate" defaultValue={role.endDate} />
                </label>
              </div>
              <label className="role-check">
                <input
                  name="isCurrent"
                  type="checkbox"
                  defaultChecked={role.isCurrent}
                />
                Current role
              </label>
              <label>
                What the role involved
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={role.description}
                />
              </label>
              <label>
                Achievements, one per line
                <textarea
                  name="achievements"
                  rows={4}
                  defaultValue={role.achievements.join("\n")}
                />
              </label>
              <button type="submit">Save overview</button>
            </form>

            <form className="role-form" onSubmit={saveStory}>
              <h3>Career evidence</h3>
              <label>
                Role and tech stack
                <input
                  name="techStack"
                  defaultValue={role.details.techStack.join(", ")}
                  placeholder="PLC, robotics, vision systems"
                />
              </label>
              <label>
                Skills demonstrated
                <input
                  name="skills"
                  defaultValue={role.details.skills.join(", ")}
                />
              </label>
              <label>
                Milestones
                <textarea
                  name="milestones"
                  rows={4}
                  defaultValue={formatMoments(role.details.milestones)}
                  placeholder="2026-04 | Line launch | Delivered without downtime"
                />
              </label>
              <label>
                Events
                <textarea
                  name="events"
                  rows={3}
                  defaultValue={formatMoments(role.details.events)}
                />
              </label>
              <label>
                Private notes
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={formatMoments(role.details.notes)}
                />
              </label>
              <label>
                Skills and growth
                <textarea name="growth" rows={3} defaultValue={role.details.growth} />
              </label>
              <label>
                Departure and reflection
                <textarea
                  name="departure"
                  rows={3}
                  defaultValue={role.details.departure}
                />
              </label>
              <button type="submit">Save career evidence</button>
            </form>
          </>
        ) : null}

        {tab === "conditions" ? (
          <form className="role-form" onSubmit={saveConditions}>
            <h3>Private work conditions</h3>
            <p className="role-form-note">
              Compensation stays in the vault and is never included in the
              public Work Map snapshot.
            </p>
            <div className="role-form-pair">
              <label>
                Compensation
                <input
                  name="compensation"
                  type="number"
                  defaultValue={role.details.compensation.amount ?? ""}
                />
              </label>
              <label>
                Currency
                <input
                  name="currency"
                  defaultValue={role.details.compensation.currency}
                />
              </label>
            </div>
            <input
              name="period"
              type="hidden"
              value={role.details.compensation.period}
            />
            <div className="role-form-pair">
              <label>
                Shift
                <input name="shift" defaultValue={role.details.schedule.shift} />
              </label>
              <label>
                Hours per week
                <input
                  name="hoursPerWeek"
                  type="number"
                  defaultValue={role.details.schedule.hoursPerWeek ?? ""}
                />
              </label>
            </div>
            <label>
              Work mode
              <select name="workMode" defaultValue={role.details.schedule.workMode}>
                <option value="onsite">On site</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </select>
            </label>
            <label>
              Benefits
              <input
                name="benefits"
                defaultValue={role.details.benefits.join(", ")}
              />
            </label>
            <label>
              Benefits and PTO notes
              <textarea
                name="paidTimeOff"
                rows={3}
                defaultValue={role.details.paidTimeOff}
              />
            </label>
            <label>
              Work environment
              <textarea
                name="environment"
                rows={3}
                defaultValue={role.details.environment}
              />
            </label>
            <label>
              Uniform / PPE
              <input name="uniform" defaultValue={role.details.uniform} />
            </label>
            <label>
              Equipment
              <input
                name="equipment"
                defaultValue={role.details.equipment.join(", ")}
              />
            </label>
            <label>
              Workplace rating (1–5)
              <input
                name="workplaceRating"
                type="number"
                min="1"
                max="5"
                defaultValue={role.details.workplaceRating ?? ""}
              />
            </label>
            <button type="submit">Save conditions</button>
          </form>
        ) : null}

        {tab === "map-media" ? (
          <>
            <section className="role-existing">
              <h3>Mapped sites</h3>
              {role.locations.map((location) => (
                <p key={location.id}>
                  <strong>{location.label}</strong>
                  <span>
                    {location.latitude.toFixed(3)},{" "}
                    {location.longitude.toFixed(3)}
                    {location.isPublic ? " · approved for publishing" : " · private"}
                  </span>
                </p>
              ))}
            </section>
            <form className="role-form" onSubmit={addLocation}>
              <h3>Add a work site</h3>
              <button
                className="role-map-place"
                type="button"
                onClick={onStartPlacement}
              >
                Choose location on map
              </button>
              <p className="role-form-note">
                Pick a point visually, then label it below. Coordinates remain
                editable for precision.
              </p>
              <div className="role-form-pair">
                <label>
                  Label
                  <input required name="label" placeholder="Main plant" />
                </label>
                <label>
                  Kind
                  <select name="kind">
                    <option value="primary">Primary</option>
                    <option value="site">Additional site</option>
                    <option value="client">Client site</option>
                    <option value="travel">Travel</option>
                  </select>
                </label>
              </div>
              <label>
                Address
                <input name="address" placeholder="Kept private by default" />
              </label>
              <div className="role-form-pair">
                <label>
                  Latitude
                  <input
                    required
                    name="latitude"
                    type="number"
                    step="any"
                    defaultValue={placement?.latitude ?? ""}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    required
                    name="longitude"
                    type="number"
                    step="any"
                    defaultValue={placement?.longitude ?? ""}
                  />
                </label>
              </div>
              <label className="role-check">
                <input name="isPublic" type="checkbox" />
                Allow this location in publications
              </label>
              <button type="submit">Add site</button>
            </form>

            <section className="role-existing">
              <h3>Gallery and attachments</h3>
              {role.media.map((item) => (
                <p key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.kind}{item.isPublic ? " · public" : " · private"}</span>
                </p>
              ))}
            </section>
            <form className="role-form" onSubmit={addMedia}>
              <h3>Attach media</h3>
              <div className="role-form-pair">
                <label>
                  Type
                  <select name="kind">
                    <option value="photo">Photo</option>
                    <option value="video">Video</option>
                    <option value="attachment">Attachment</option>
                  </select>
                </label>
                <label>
                  Title
                  <input required name="title" />
                </label>
              </div>
              <label>
                URL
                <input required name="url" type="url" />
              </label>
              <label>
                Caption
                <textarea name="caption" rows={2} />
              </label>
              <label className="role-check">
                <input name="isPublic" type="checkbox" />
                Allow this item in publications
              </label>
              <button type="submit">Attach media</button>
            </form>
          </>
        ) : null}
      </div>
      {message ? <p className="role-save-message">{message}</p> : null}
    </aside>
  );
}

function lines(value: FormDataEntryValue | null): string[] {
  return typeof value === "string"
    ? value.split("\n").map((item) => item.trim()).filter(Boolean)
    : [];
}

function commas(value: FormDataEntryValue | null): string[] {
  return typeof value === "string"
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function moments(
  value: FormDataEntryValue | null,
  isPublic = true,
): Array<Omit<WorkMapMoment, "id">> {
  return lines(value).map((line) => {
    const [date = "", title = "", ...detail] = line.split("|");
    return {
      date: date.trim(),
      title: title.trim() || date.trim(),
      detail: detail.join("|").trim(),
      isPublic,
    };
  });
}

function formatMoments(items: WorkMapMoment[]): string {
  return items
    .map((item) => [item.date, item.title, item.detail].join(" | "))
    .join("\n");
}
