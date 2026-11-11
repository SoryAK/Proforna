import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { ListItem } from "@astryxdesign/core/List";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  BriefcaseIcon,
  ChevronRightIcon,
  CpuChipIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  GlobeAltIcon,
  PuzzlePieceIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import type { ModelHosting } from "@core/model-connection";
import {
  IntegrationSettingsPanel,
  JobSettingsPanel,
  MapSettingsPanel,
  ModelSettingsPanel,
  ProfileSettingsPanel,
  PublicationSettingsPanel,
} from "./HomeSettingsPanels";
import type { OnboardingProfileValue } from "./OnboardingProfile";

type Section = "profile" | "models" | "maps" | "jobs" | "publication" | "integrations";
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type PanelConfig = {
  id: Section;
  label: string;
  description: string;
  icon: IconComponent;
};

type SearchableSetting = {
  panel: Section;
  title: string;
  description: string;
};

type PublicConnection = {
  hosting: ModelHosting;
  baseUrl: string;
  model: string;
};

const NARROW_VIEWPORT = "(max-width: 640px)";

/**
 * Shell layout from the settings dialog template. This app does not compile
 * stylex, so those rules are `style` instead of `xstyle`. They only hold the
 * frame, the rail, and the pinned close control.
 */
const shellStyle = { height: "min(640px, calc(100dvh - 2rem))" };
const sideNavStyle = { flexShrink: 0 };
const sideNavSectionStyle = { paddingBlock: "var(--spacing-2)" };
const closeAnchorStyle = {
  position: "sticky" as const,
  insetBlockStart: 0,
  zIndex: 1,
  height: 0,
};
const closeBackingStyle = {
  display: "flex",
  backgroundColor: "var(--color-background-surface)",
  borderRadius: "var(--radius-element)",
};
const panelStyle = {
  containerType: "inline-size" as const,
  containerName: "home-settings-panel",
};

const GROUPS: { label: string; panels: PanelConfig[] }[] = [
  {
    label: "Account",
    panels: [
      {
        id: "profile",
        label: "Profile",
        description: "Name, headline, address, photo, and bio.",
        icon: UserCircleIcon,
      },
      {
        id: "models",
        label: "Models",
        description: "Local or cloud. The connection used to extract a resume.",
        icon: CpuChipIcon,
      },
    ],
  },
  {
    label: "Career",
    panels: [
      {
        id: "maps",
        label: "Maps",
        description: "OpenStreetMap by default, or Google Maps with a key.",
        icon: MapPinIcon,
      },
      {
        id: "jobs",
        label: "Jobs",
        description: "Places listings are read from.",
        icon: BriefcaseIcon,
      },
      {
        id: "publication",
        label: "Publication",
        description: "Slug, visibility, and what the snapshot includes.",
        icon: GlobeAltIcon,
      },
      {
        id: "integrations",
        label: "Integrations",
        description: "Connections Proforna can use.",
        icon: PuzzlePieceIcon,
      },
    ],
  },
];

const PANELS = GROUPS.flatMap((group) => group.panels);

const SEARCHABLE_SETTINGS: SearchableSetting[] = [
  ...PANELS.map((panel) => ({
    panel: panel.id,
    title: panel.label,
    description: panel.description,
  })),
  {
    panel: "profile",
    title: "Name",
    description: "The name on the profile.",
  },
  {
    panel: "profile",
    title: "Headline",
    description: "The line under the name.",
  },
  {
    panel: "profile",
    title: "Address",
    description: "Street, city, and state.",
  },
  {
    panel: "profile",
    title: "Bio",
    description: "The profile bio.",
  },
  {
    panel: "profile",
    title: "LinkedIn",
    description: "The LinkedIn link on your bio.",
  },
  {
    panel: "profile",
    title: "GitHub",
    description: "The GitHub link on your bio.",
  },
  {
    panel: "profile",
    title: "Portfolio",
    description: "The site on your bio.",
  },
  {
    panel: "models",
    title: "Model connection",
    description: "Base URL, model, and key.",
  },
  {
    panel: "maps",
    title: "Map provider",
    description: "OpenStreetMap or Google Maps.",
  },
  {
    panel: "maps",
    title: "Pin marks",
    description: "Pin colors and marks stay with this map.",
  },
  {
    panel: "jobs",
    title: "Job sources",
    description: "Application id or API key for a listing place.",
  },
  {
    panel: "publication",
    title: "Public slug",
    description: "The address of the published career.",
  },
  {
    panel: "publication",
    title: "Visibility",
    description: "Public, unlisted, stealth, anonymous, or private.",
  },
  {
    panel: "publication",
    title: "Published sections",
    description: "What the snapshot includes.",
  },
  {
    panel: "publication",
    title: "Open preview",
    description: "Ask, this window, or a new window.",
  },
];

function panelConfig(id: Section) {
  const panel = PANELS.find((item) => item.id === id);
  if (!panel) throw new Error(`Unknown settings section: ${id}`);
  return panel;
}

function settingMatchesSearch(setting: SearchableSetting, query: string) {
  const panel = panelConfig(setting.panel);
  return [setting.title, setting.description, panel.label].some((value) =>
    value.toLowerCase().includes(query),
  );
}

function useSettingsSearch(onSelectPanel: (panel: Section) => void) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const normalized = query.trim().toLowerCase();
  const isActive = normalized.length > 0;
  const results = useMemo(
    () =>
      isActive
        ? SEARCHABLE_SETTINGS.filter((setting) =>
            settingMatchesSearch(setting, normalized),
          )
        : [],
    [isActive, normalized],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [normalized]);

  const onKeyDown: ComponentProps<"input">["onKeyDown"] = (event) => {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
      return;
    }
    if (!isActive || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) onSelectPanel(result.panel);
    }
  };

  return {
    query,
    setQuery,
    isActive,
    results,
    activeIndex,
    setActiveIndex,
    onKeyDown,
    activeResultId:
      isActive && results.length > 0
        ? `settings-search-result-${activeIndex}`
        : undefined,
  };
}

type SettingsSearch = ReturnType<typeof useSettingsSearch>;

function SettingsSearchResults({
  results,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: {
  results: SearchableSetting[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (setting: SearchableSetting) => void;
}) {
  if (results.length === 0) {
    return (
      <VStack id="settings-search-results" gap={0.5} padding={2}>
        <Text type="label">No settings found</Text>
        <Text type="supporting" color="secondary">
          Try profile, models, maps, jobs, publication, or integrations.
        </Text>
      </VStack>
    );
  }

  return (
    <VStack
      as="ul"
      gap={0}
      id="settings-search-results"
      role="listbox"
      aria-label="Search results"
      isScrollable
    >
      {results.map((setting, index) => (
        <ListItem
          key={`${setting.panel}-${setting.title}`}
          id={`settings-search-result-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          label={setting.title}
          description={`${panelConfig(setting.panel).label} · ${setting.description}`}
          startContent={
            <Icon
              icon={panelConfig(setting.panel).icon}
              size="sm"
              color="secondary"
            />
          }
          endContent={<Icon icon={ChevronRightIcon} size="sm" color="secondary" />}
          isSelected={index === activeIndex}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(setting)}
        />
      ))}
    </VStack>
  );
}

function SettingsSearchInput({ search }: { search: SettingsSearch }) {
  return (
    <TextInput
      label="Search settings"
      isLabelHidden
      placeholder="Search settings"
      size="sm"
      width="100%"
      hasClear
      startIcon={MagnifyingGlassIcon}
      role="combobox"
      aria-autocomplete="list"
      aria-controls="settings-search-results"
      aria-expanded={search.isActive ? search.results.length > 0 : false}
      aria-activedescendant={search.activeResultId}
      value={search.query}
      onChange={search.setQuery}
      onKeyDown={search.onKeyDown}
    />
  );
}

function SettingsSideNav({
  titleId,
  search,
  activePanel,
  onSelectPanel,
}: {
  titleId: string;
  search: SettingsSearch;
  activePanel: Section;
  onSelectPanel: (panel: Section) => void;
}) {
  return (
    <SideNav
      aria-label="Settings sections"
      style={sideNavStyle}
      header={
        <HStack gap={2} align="center" paddingInline={2} minHeight={32}>
          <Heading level={4} id={titleId}>
            Settings
          </Heading>
        </HStack>
      }
      topContent={<SettingsSearchInput search={search} />}
    >
      {search.isActive ? (
        <SettingsSearchResults
          results={search.results}
          activeIndex={search.activeIndex}
          onActiveIndexChange={search.setActiveIndex}
          onSelect={(setting) => onSelectPanel(setting.panel)}
        />
      ) : (
        GROUPS.map((group) => (
          <SideNavSection
            key={group.label}
            title={group.label}
            style={sideNavSectionStyle}
          >
            {group.panels.map((panel) => (
              <SideNavItem
                key={panel.id}
                label={panel.label}
                icon={<Icon icon={panel.icon} size="sm" color="primary" />}
                isSelected={panel.id === activePanel}
                onClick={() => onSelectPanel(panel.id)}
              />
            ))}
          </SideNavSection>
        ))
      )}
    </SideNav>
  );
}

function SettingsPanelHeading({ panel }: { panel: Section }) {
  const config = panelConfig(panel);
  return (
    <VStack gap={0.5}>
      <Heading level={2}>{config.label}</Heading>
      <Text type="supporting" color="secondary">
        {config.description}
      </Text>
    </VStack>
  );
}

function SettingsFields({
  section,
  session,
  profile,
  connection,
  modelBusy,
  modelError,
  modelNote,
  onClose,
  onProfileSaved,
  onMapsSaved,
  onSaveModel,
}: {
  section: Section;
  session: number;
  profile: OnboardingProfileValue;
  connection: PublicConnection | null;
  modelBusy: boolean;
  modelError: string | null;
  modelNote: string | null;
  onClose: () => void;
  onProfileSaved: (profile: OnboardingProfileValue) => void;
  onMapsSaved?: () => void;
  onSaveModel: (input: {
    hosting: ModelHosting;
    baseUrl: string;
    model: string;
    apiKey: string;
  }) => void;
}) {
  if (section === "profile") {
    return (
      <ProfileSettingsPanel
        key={session}
        profile={profile}
        onCancel={onClose}
        onSaved={onProfileSaved}
      />
    );
  }
  if (section === "models") {
    return (
      <ModelSettingsPanel
        key={`${session}:${connection?.baseUrl ?? "new"}:${connection?.model ?? ""}`}
        connection={connection}
        busy={modelBusy}
        error={modelError}
        note={modelNote}
        onSave={onSaveModel}
      />
    );
  }
  if (section === "maps") return <MapSettingsPanel key={session} onSaved={onMapsSaved} />;
  if (section === "jobs") return <JobSettingsPanel key={session} />;
  if (section === "publication") return <PublicationSettingsPanel key={session} />;
  return <IntegrationSettingsPanel key={session} />;
}

function SettingsContentPane({
  panel,
  onClose,
  fields,
}: {
  panel: Section;
  onClose: () => void;
  fields: ReactNode;
}) {
  return (
    <LayoutContent isScrollable padding={4}>
      <HStack width="100%" justify="end" style={closeAnchorStyle}>
        <HStack style={closeBackingStyle}>
          <IconButton
            label="Close"
            variant="ghost"
            size="sm"
            icon={<Icon icon="close" size="sm" />}
            onClick={onClose}
          />
        </HStack>
      </HStack>
      <VStack gap={4} style={panelStyle}>
        <HStack gap={2} align="start">
          <StackItem size="fill">
            <SettingsPanelHeading panel={panel} />
          </StackItem>
          <VStack aria-hidden="true" width={32} />
        </HStack>
        {fields}
      </VStack>
    </LayoutContent>
  );
}

function SettingsPanelTabs({
  activePanel,
  onSelectPanel,
}: {
  activePanel: Section;
  onSelectPanel: (panel: Section) => void;
}) {
  return (
    <HStack
      as="nav"
      aria-label="Settings sections"
      gap={1}
      wrap="nowrap"
      isScrollable
      paddingInline={3}
      paddingBlock={2}
    >
      {PANELS.map((panel) => (
        <Button
          key={panel.id}
          label={panel.label}
          icon={<Icon icon={panel.icon} size="sm" />}
          variant={panel.id === activePanel ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onSelectPanel(panel.id)}
        />
      ))}
    </HStack>
  );
}

function SettingsNarrowShell({
  titleId,
  search,
  activePanel,
  onSelectPanel,
  onClose,
  fields,
}: {
  titleId: string;
  search: SettingsSearch;
  activePanel: Section;
  onSelectPanel: (panel: Section) => void;
  onClose: () => void;
  fields: ReactNode;
}) {
  return (
    <VStack gap={0} height="100%">
      <HStack gap={2} align="center" paddingInline={3} paddingBlock={3}>
        <StackItem size="fill">
          <Text type="label" id={titleId}>
            Settings
          </Text>
        </StackItem>
        <IconButton
          label="Close"
          variant="ghost"
          size="sm"
          icon={<Icon icon="close" size="sm" />}
          onClick={onClose}
        />
      </HStack>
      <Divider />
      <VStack paddingInline={3} paddingBlock={2}>
        <SettingsSearchInput search={search} />
      </VStack>
      {search.isActive ? (
        <VStack paddingInline={3} isScrollable>
          <SettingsSearchResults
            results={search.results}
            activeIndex={search.activeIndex}
            onActiveIndexChange={search.setActiveIndex}
            onSelect={(setting) => onSelectPanel(setting.panel)}
          />
        </VStack>
      ) : (
        <>
          <SettingsPanelTabs
            activePanel={activePanel}
            onSelectPanel={onSelectPanel}
          />
          <Divider />
          <StackItem size="fill">
            <VStack gap={4} padding={4} isScrollable height="100%" style={panelStyle}>
              <SettingsPanelHeading panel={activePanel} />
              {fields}
            </VStack>
          </StackItem>
        </>
      )}
    </VStack>
  );
}

export function HomeSettings({
  open,
  profile,
  onClose,
  onProfileSaved,
  onMapsSaved,
}: {
  open: boolean;
  profile: OnboardingProfileValue;
  onClose: () => void;
  onProfileSaved: (profile: OnboardingProfileValue) => void;
  onMapsSaved?: () => void;
}) {
  const titleId = useId();
  const isNarrow = useMediaQuery(NARROW_VIEWPORT);
  const [section, setSection] = useState<Section>("profile");
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelNote, setModelNote] = useState<string | null>(null);
  const [connection, setConnection] = useState<PublicConnection | null>(null);
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  const selectPanelRef = useRef<(panel: Section) => void>(() => {});
  const search = useSettingsSearch((panel) => selectPanelRef.current(panel));

  if (open && !wasOpen) {
    setWasOpen(true);
    setSession((n) => n + 1);
    setSection("profile");
    setModelError(null);
    setModelNote(null);
    if (search.query) search.setQuery("");
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

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

  function selectPanel(panel: Section) {
    setSection(panel);
    search.setQuery("");
  }
  selectPanelRef.current = selectPanel;

  const fields = (
    <SettingsFields
      section={section}
      session={session}
      profile={profile}
      connection={connection}
      modelBusy={modelBusy}
      modelError={modelError}
      modelNote={modelNote}
      onClose={onClose}
      onProfileSaved={onProfileSaved}
      onMapsSaved={onMapsSaved}
      onSaveModel={(input) => void saveModel(input)}
    />
  );

  return (
    <Dialog
      className="home-settings-dialog"
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      purpose="form"
      width={880}
      maxHeight="min(640px, calc(100dvh - 2rem))"
      padding={0}
      aria-labelledby={titleId}
    >
      <VStack style={shellStyle}>
        {isNarrow ? (
          <SettingsNarrowShell
            titleId={titleId}
            search={search}
            activePanel={section}
            onSelectPanel={selectPanel}
            onClose={onClose}
            fields={fields}
          />
        ) : (
          <Layout
            start={
              <SettingsSideNav
                titleId={titleId}
                search={search}
                activePanel={section}
                onSelectPanel={selectPanel}
              />
            }
            content={
              <SettingsContentPane panel={section} onClose={onClose} fields={fields} />
            }
          />
        )}
      </VStack>
    </Dialog>
  );
}
