import {
  CAREER_HISTORY_SECTIONS,
  type CareerHistorySectionKey,
} from "@core/career-history";
import "./work-map.css";

export function addKindLabel(key: CareerHistorySectionKey): string {
  if (key === "school") return "Education";
  if (key === "internship") return "Internship";
  return "Job";
}

export function CareerHistoryAddMenu({
  onChoose,
}: {
  onChoose: (kind: CareerHistorySectionKey) => void;
}) {
  return (
    <div className="history-menu-panel" role="menu" aria-label="Add">
      {CAREER_HISTORY_SECTIONS.map((section) => (
        <button
          key={section.key}
          type="button"
          role="menuitem"
          onClick={() => onChoose(section.key)}
        >
          {addKindLabel(section.key)}
        </button>
      ))}
    </div>
  );
}

export async function createCareerHistoryRole(
  kind: CareerHistorySectionKey,
): Promise<string | null> {
  const response = await fetch("/api/work-map/roles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { role?: { id?: string } };
  return body.role?.id ?? null;
}
