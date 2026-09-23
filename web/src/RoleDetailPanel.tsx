import { useState, type FormEvent } from "react";
import {
  formatHistoryPeriod,
  formatHistoryPlace,
  formatTenureMonths,
  tenureMonths,
  type CareerHistoryItem,
} from "@core/career-history";
import {
  roleCoverPhoto,
  type WorkMapLocation,
  type WorkMapMoment,
  type WorkMapRole,
} from "@core/work-map";

export type DetailTab = "story" | "conditions" | "media" | "places";

type SitePlacement = {
  latitude: number;
  longitude: number;
  locationId?: string;
};

export function RoleDetailPanel({
  role,
  tab,
  onTab,
  mapVisible,
  onToggleMap,
  onClose,
  onSaved,
  placement,
  onStartPlacement,
  onLocationSaved,
}: {
  role: WorkMapRole;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  mapVisible: boolean;
  onToggleMap: () => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
  placement: SitePlacement | null;
  onStartPlacement: (locationId?: string) => void;
  onLocationSaved: () => void;
}) {
  const [message, setMessage] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/work-map/roles/${role.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        organization: form.get("organization"),
        kind: form.get("kind"),
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
      share: {
        growth: form.get("shareGrowth") === "on",
        departure: form.get("shareDeparture") === "on",
      },
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
        visibility: form.get("shareCompensation") === "on" ? "public" : "private",
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
      share: {
        schedule: form.get("shareSchedule") === "on",
        benefits: form.get("shareBenefits") === "on",
        paidTimeOff: form.get("sharePaidTimeOff") === "on",
        environment: form.get("shareEnvironment") === "on",
        workplaceRating: form.get("shareWorkplaceRating") === "on",
        equipment: form.get("shareEquipment") === "on",
        uniform: form.get("shareUniform") === "on",
      },
    });
    await finish(response, "Work conditions saved.");
  }

  async function addLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const response = await fetch(`/api/work-map/roles/${role.id}/locations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sitePayload(form)),
    });
    if (response.ok) {
      form.reset();
      onLocationSaved();
    }
    await finish(response, "Work site added.");
  }

  async function saveLocation(
    event: FormEvent<HTMLFormElement>,
    locationId: string,
  ) {
    event.preventDefault();
    const response = await fetch(
      `/api/work-map/roles/${role.id}/locations/${locationId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sitePayload(event.currentTarget)),
      },
    );
    if (response.ok) onLocationSaved();
    await finish(response, "Work site updated.");
  }

  async function removeLocation(locationId: string) {
    const response = await fetch(
      `/api/work-map/roles/${role.id}/locations/${locationId}`,
      { method: "DELETE" },
    );
    if (response.ok) onLocationSaved();
    await finish(response, "Work site removed.");
  }

  async function lookupAddress(form: HTMLFormElement) {
    const address = inputValue(form, "address");
    const query = address || inputValue(form, "label");
    if (!query) {
      setMessage("Enter an address or place name to look up.");
      return;
    }
    setLookingUp(true);
    try {
      const response = await fetch(
        `/api/work-map/places?q=${encodeURIComponent(query)}`,
      );
      if (!response.ok) {
        setMessage(
          response.status === 404
            ? "No place matched that address. Try a fuller street or city."
            : "Address lookup failed. Try again or place the site on the map.",
        );
        return;
      }
      const body = (await response.json()) as {
        place: {
          label: string;
          address: string;
          latitude: number;
          longitude: number;
        };
      };
      setInputValue(form, "address", body.place.address);
      setInputValue(form, "latitude", String(body.place.latitude));
      setInputValue(form, "longitude", String(body.place.longitude));
      if (!inputValue(form, "label")) {
        setInputValue(form, "label", body.place.label);
      }
      setMessage("Address found. Save to keep this pin.");
    } catch {
      setMessage("Address lookup failed. Try again or place the site on the map.");
    } finally {
      setLookingUp(false);
    }
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
    <aside
      className="role-detail is-inline"
      aria-label={`${role.title || "Untitled"} details`}
    >
      <header>
        <button className="role-back" type="button" onClick={onClose}>
          Back to history
        </button>
        <div className="role-detail-actions">
          <button type="button" onClick={onToggleMap}>
            {mapVisible ? "Hide map" : "Show map"}
          </button>
          <button type="button" onClick={onClose} aria-label="Close role details">
            Close
          </button>
        </div>
      </header>

      <RoleFocus role={role} onChanged={onSaved} />

      <nav aria-label="Role detail sections">
        {(
          [
            ["story", "Story"],
            ["conditions", "Conditions"],
            ["media", "Media"],
            ["places", "Places"],
          ] as Array<[DetailTab, string]>
        ).map(([value, label]) => (
          <button
            className={tab === value ? "is-active" : ""}
            key={value}
            onClick={() => onTab(value)}
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
              <label>
                Kind
                <select name="kind" defaultValue={role.kind}>
                  <option value="job">Job</option>
                  <option value="internship">Internship</option>
                  <option value="school">Education</option>
                </select>
              </label>
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

            <section className="role-existing">
              <h3>Linked career facts</h3>
              {role.factId ? (
                <p>
                  <strong>
                    {role.kind === "school" ? "Education" : "Role"} fact
                  </strong>
                  <span>
                    v{role.factVersion}
                    {role.evidenceIds.length
                      ? ` · ${role.evidenceIds.length} evidence`
                      : ""}
                  </span>
                </p>
              ) : (
                <p className="role-form-note">
                  Saving this overview writes it into Career Memory so resumes
                  can use the same story.
                </p>
              )}
              {role.claims.map((claim) => (
                <p key={claim.factId}>
                  <strong>{claim.text}</strong>
                  <span>v{claim.factVersion}</span>
                </p>
              ))}
            </section>

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
              <ShareCheck
                name="shareGrowth"
                checked={role.details.share.growth}
              />
              <label>
                Departure and reflection
                <textarea
                  name="departure"
                  rows={3}
                  defaultValue={role.details.departure}
                />
              </label>
              <ShareCheck
                name="shareDeparture"
                checked={role.details.share.departure}
              />
              <button type="submit">Save career evidence</button>
            </form>
          </>
        ) : null}

        {tab === "conditions" ? (
          <form className="role-form" onSubmit={saveConditions}>
            <h3>Work conditions</h3>
            <p className="role-form-note">
              Each field stays in the vault until you approve it for
              publishing.
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
            <ShareCheck
              name="shareCompensation"
              checked={role.details.compensation.visibility === "public"}
            />
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
            <ShareCheck
              name="shareSchedule"
              checked={role.details.share.schedule}
            />
            <label>
              Benefits
              <input
                name="benefits"
                defaultValue={role.details.benefits.join(", ")}
              />
            </label>
            <ShareCheck
              name="shareBenefits"
              checked={role.details.share.benefits}
            />
            <label>
              Benefits and PTO notes
              <textarea
                name="paidTimeOff"
                rows={3}
                defaultValue={role.details.paidTimeOff}
              />
            </label>
            <ShareCheck
              name="sharePaidTimeOff"
              checked={role.details.share.paidTimeOff}
            />
            <label>
              Work environment
              <textarea
                name="environment"
                rows={3}
                defaultValue={role.details.environment}
              />
            </label>
            <ShareCheck
              name="shareEnvironment"
              checked={role.details.share.environment}
            />
            <label>
              Uniform / PPE
              <input name="uniform" defaultValue={role.details.uniform} />
            </label>
            <ShareCheck
              name="shareUniform"
              checked={role.details.share.uniform}
            />
            <label>
              Equipment
              <input
                name="equipment"
                defaultValue={role.details.equipment.join(", ")}
              />
            </label>
            <ShareCheck
              name="shareEquipment"
              checked={role.details.share.equipment}
            />
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
            <ShareCheck
              name="shareWorkplaceRating"
              checked={role.details.share.workplaceRating}
            />
            <button type="submit">Save conditions</button>
          </form>
        ) : null}

        {tab === "media" ? (
          <>
            <section className="role-existing">
              <h3>Gallery and attachments</h3>
              {role.media.length === 0 ? (
                <p className="role-form-note">No media on this role yet.</p>
              ) : (
                role.media.map((item) => (
                  <p key={item.id}>
                    {item.kind === "photo" ? (
                      <img src={item.url} alt="" />
                    ) : null}
                    <strong>{item.title}</strong>
                    <span>
                      {item.kind}
                      {item.isPublic ? " · public" : " · private"}
                    </span>
                  </p>
                ))
              )}
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

        {tab === "places" ? (
          <>
            <section className="role-existing">
              <h3>Mapped sites</h3>
              {role.locations.length === 0 ? (
                <p className="role-form-note">
                  No sites on this role yet. Look up an address or place a pin
                  on the map.
                </p>
              ) : (
                role.locations.map((location) => {
                  const placed =
                    placement?.locationId === location.id ? placement : location;
                  return (
                    <SiteForm
                      key={`${location.id}-${placed.latitude}-${placed.longitude}`}
                      location={location}
                      latitude={placed.latitude}
                      longitude={placed.longitude}
                      lookingUp={lookingUp}
                      submitLabel="Save site"
                      onSubmit={(event) => saveLocation(event, location.id)}
                      onLookup={lookupAddress}
                      onPlace={() => onStartPlacement(location.id)}
                      onRemove={() => removeLocation(location.id)}
                    />
                  );
                })
              )}
            </section>
            <SiteForm
              key={`new-${placement && !placement.locationId ? `${placement.latitude}-${placement.longitude}` : "blank"}`}
              latitude={
                placement && !placement.locationId
                  ? placement.latitude
                  : undefined
              }
              longitude={
                placement && !placement.locationId
                  ? placement.longitude
                  : undefined
              }
              lookingUp={lookingUp}
              submitLabel="Add site"
              onSubmit={addLocation}
              onLookup={lookupAddress}
              onPlace={() => onStartPlacement()}
            />
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

function ShareCheck({
  name,
  checked,
}: {
  name: string;
  checked: boolean;
}) {
  return (
    <label className="role-check">
      <input type="checkbox" name={name} defaultChecked={checked} />
      Approve for publishing
    </label>
  );
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

function SiteForm({
  location,
  latitude,
  longitude,
  lookingUp,
  submitLabel,
  onSubmit,
  onLookup,
  onPlace,
  onRemove,
}: {
  location?: WorkMapLocation;
  latitude?: number;
  longitude?: number;
  lookingUp: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onLookup: (form: HTMLFormElement) => void | Promise<void>;
  onPlace: () => void;
  onRemove?: () => void;
}) {
  return (
    <form className="role-form role-site-form" onSubmit={onSubmit}>
      <h3>{location ? location.label : "Add a work site"}</h3>
      <p className="role-form-note">
        {location
          ? location.isPublic
            ? "Approved for publishing until you change it."
            : "Private until you allow it in publications."
          : "Look up an address or pick a point on the map. Coordinates stay editable for precision."}
      </p>
      <div className="role-form-pair">
        <label>
          Label
          <input
            required
            name="label"
            placeholder="Main plant"
            defaultValue={location?.label ?? ""}
          />
        </label>
        <label>
          Kind
          <select name="kind" defaultValue={location?.kind ?? "primary"}>
            <option value="primary">Primary</option>
            <option value="site">Additional site</option>
            <option value="client">Client site</option>
            <option value="travel">Travel</option>
          </select>
        </label>
      </div>
      <label className="role-lookup">
        Address
        <span>
          <input
            name="address"
            placeholder="Street, city, or place name"
            defaultValue={location?.address ?? ""}
          />
          <button
            type="button"
            disabled={lookingUp}
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (form) void onLookup(form);
            }}
          >
            {lookingUp ? "Looking up…" : "Look up"}
          </button>
        </span>
      </label>
      <div className="role-form-pair">
        <label>
          Latitude
          <input
            required
            name="latitude"
            type="number"
            step="any"
            defaultValue={latitude ?? ""}
          />
        </label>
        <label>
          Longitude
          <input
            required
            name="longitude"
            type="number"
            step="any"
            defaultValue={longitude ?? ""}
          />
        </label>
      </div>
      <label className="role-check">
        <input
          name="isPublic"
          type="checkbox"
          defaultChecked={location?.isPublic === true}
        />
        Allow this location in publications
      </label>
      <div className="role-form-actions">
        <button type="submit">{submitLabel}</button>
        <button type="button" onClick={onPlace}>
          Place on map
        </button>
        {onRemove ? (
          <button className="is-danger" type="button" onClick={onRemove}>
            Remove site
          </button>
        ) : null}
      </div>
    </form>
  );
}

function RoleFocus({
  role,
  onChanged,
}: {
  role: WorkMapRole;
  onChanged: () => Promise<void>;
}) {
  const cover = roleCoverPhoto(role.media);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.set("photo", file);
    const response = await fetch(`/api/work-map/roles/${role.id}/photos`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setMessage(body.error ?? "Could not add that photo.");
      setBusy(false);
      return;
    }
    setBusy(false);
    await onChanged();
  }

  async function allowInPublication(isPublic: boolean) {
    if (!cover) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(
      `/api/work-map/roles/${role.id}/media/${cover.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPublic }),
      },
    );
    setBusy(false);
    if (!response.ok) {
      setMessage("Could not update that photo.");
      return;
    }
    await onChanged();
  }

  async function remove() {
    if (!cover) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(
      `/api/work-map/roles/${role.id}/media/${cover.id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setMessage("Could not remove that photo.");
      setBusy(false);
      return;
    }
    setBusy(false);
    await onChanged();
  }

  const identity = historyItem(role);
  const place = formatHistoryPlace(identity);
  const period = formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent);
  const tenure = formatTenureMonths(
    tenureMonths(role.startDate, role.endDate, role.isCurrent),
  );

  return (
    <section className="role-focus" aria-label="Role">
      <div className={cover ? "role-focus-photo" : "role-focus-photo is-empty"}>
        {cover ? <img src={cover.url} alt="" /> : null}
        <div className="role-cover-actions">
          <label>
            {busy ? "Saving…" : cover ? "Change photo" : "Add cover photo"}
            <input
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={busy}
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          {cover ? (
            <button disabled={busy} type="button" onClick={() => void remove()}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <div className="role-focus-body">
        <h2>{role.organization || "Untitled"}</h2>
        {role.title ? <p className="role-focus-title">{role.title}</p> : null}
        {place || period ? (
          <p className="role-focus-meta">
            {place ? <span>{place}</span> : null}
            {place && period ? <span aria-hidden="true">·</span> : null}
            {period ? <span>{period}</span> : null}
            {role.isCurrent ? <span className="role-focus-current">current</span> : null}
            {tenure ? <span className="role-focus-tenure">({tenure})</span> : null}
          </p>
        ) : null}
        {cover ? (
          <label className="role-check">
            <input
              checked={cover.isPublic}
              disabled={busy}
              type="checkbox"
              onChange={(event) => void allowInPublication(event.target.checked)}
            />
            Allow this photo in publications
          </label>
        ) : null}
        {message ? <p className="role-form-note">{message}</p> : null}
      </div>
    </section>
  );
}

function historyItem(role: WorkMapRole): CareerHistoryItem {
  return {
    id: role.id,
    kind: role.kind,
    title: role.title,
    organization: role.organization,
    locationLabel: role.locationLabel,
    startDate: role.startDate,
    endDate: role.endDate,
    isCurrent: role.isCurrent,
    locations: role.locations.map((location) => ({
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
    })),
  };
}

function sitePayload(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    label: data.get("label"),
    address: data.get("address"),
    latitude: Number(data.get("latitude")),
    longitude: Number(data.get("longitude")),
    kind: data.get("kind"),
    isPublic: data.get("isPublic") === "on",
  };
}

function inputValue(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
    ? field.value.trim()
    : "";
}

function setInputValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
  ) {
    field.value = value;
  }
}
