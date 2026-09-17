import { useEffect, useRef, useState } from "react";
import type { ModelHosting } from "@core/model-connection";
import { HomeProfileEdit } from "./HomeProfileEdit";
import { OnboardingModelSetup } from "./OnboardingModels";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import "./onboarding.css";

type Section = "profile" | "models";

type PublicConnection = {
  hosting: ModelHosting;
  baseUrl: string;
  model: string;
};

export function HomeSettings({
  open,
  profile,
  onClose,
  onProfileSaved,
}: {
  open: boolean;
  profile: OnboardingProfileValue;
  onClose: () => void;
  onProfileSaved: (profile: OnboardingProfileValue) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState<Section>("profile");
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelNote, setModelNote] = useState<string | null>(null);
  const [connection, setConnection] = useState<PublicConnection | null>(null);
  const [session, setSession] = useState(0);
  const wasOpen = useRef(false);

  if (open && !wasOpen.current) {
    setSession((n) => n + 1);
    setSection("profile");
    setModelError(null);
    setModelNote(null);
  }
  wasOpen.current = open;

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open) {
      if (!node.open) node.showModal();
      return;
    }
    if (node.open) node.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/models")
      .then(async (res) => {
        const body = (await res.json()) as { connections?: PublicConnection[] };
        const rows = body.connections ?? [];
        setConnection(rows[rows.length - 1] ?? null);
      })
      .catch(() => setConnection(null));
  }, [open]);

  async function saveModel(input: {
    hosting: ModelHosting;
    baseUrl: string;
    model: string;
    apiKey: string;
  }) {
    setModelBusy(true);
    setModelError(null);
    setModelNote(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await res.json()) as {
        error?: string;
        connection?: PublicConnection;
      };
      if (!res.ok || !body.connection) {
        setModelError(body.error ?? "Could not save that connection.");
        return;
      }
      setConnection(body.connection);
      setModelNote("Saved. Extract will use this connection.");
    } finally {
      setModelBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="home-settings"
      inert={!open}
      onClose={onClose}
      aria-labelledby="home-settings-title"
    >
      <div className="home-settings-head">
        <h2 id="home-settings-title">Settings</h2>
        <button type="button" className="home-settings-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="home-settings-body">
        <nav className="home-settings-nav" aria-label="Settings">
          <button
            type="button"
            className="home-settings-nav-item"
            data-active={section === "profile"}
            onClick={() => setSection("profile")}
          >
            Profile
          </button>
          <button
            type="button"
            className="home-settings-nav-item"
            data-active={section === "models"}
            onClick={() => setSection("models")}
          >
            Models
          </button>
        </nav>
        <div className="home-settings-pane">
          {section === "profile" ? (
            <HomeProfileEdit
              key={session}
              initial={profile}
              onCancel={onClose}
              onSaved={(next) => {
                onProfileSaved(next);
              }}
            />
          ) : (
            <>
              <h1>Models</h1>
              <p className="onboarding-lead">
                Local or cloud. Same OpenAI-compatible URL used to extract a
                resume.
              </p>
              <OnboardingModelSetup
                key={`${session}:${connection?.baseUrl ?? "new"}:${connection?.model ?? ""}`}
                kicker=""
                hideIntro
                busy={modelBusy}
                error={modelError}
                submitLabel="Save"
                initial={connection ?? undefined}
                onSave={(input) => void saveModel(input)}
              />
              {modelNote ? (
                <p className="home-settings-note">{modelNote}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
