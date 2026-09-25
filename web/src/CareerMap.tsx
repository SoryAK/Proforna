import type { SearchRadius } from "@core/job-search";
import { DEFAULT_MAP_ICONS, MAP_THEMES, type MapSettings } from "@core/map-settings";
import type { WorkMapRole } from "@core/work-map";
import { GoogleWorkMap } from "./GoogleWorkMap";
import {
  WorkMapCanvas,
  type MapAnchorPin,
  type MapSearchPin,
  type WorkMapHome,
} from "./WorkMapCanvas";
import "./work-map.css";

export function CareerMap({
  settings,
  roles,
  home,
  selectedId,
  onSelect,
  onMapClick,
  holdView = false,
  suppressEmpty = false,
  overlays = [],
  selectedOverlayId = null,
  onSelectOverlay,
  anchors = [],
  searchRadius = null,
  viewKey,
  fitKey = "",
  zoomCorner = "start",
}: {
  settings: MapSettings | null;
  roles: WorkMapRole[];
  home?: WorkMapHome | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMapClick?: (latitude: number, longitude: number) => void;
  holdView?: boolean;
  suppressEmpty?: boolean;
  overlays?: MapSearchPin[];
  selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string) => void;
  anchors?: MapAnchorPin[];
  searchRadius?: SearchRadius | null;
  viewKey?: string;
  fitKey?: string;
  zoomCorner?: "start" | "end";
}) {
  const pinIcons = settings?.icons ?? DEFAULT_MAP_ICONS;
  const pinTheme = MAP_THEMES[settings?.theme ?? "kind"];
  if (settings?.provider === "google" && settings.googleMapsApiKey) {
    return (
      <GoogleWorkMap
        apiKey={settings.googleMapsApiKey}
        holdView={holdView}
        home={home}
        onMapClick={onMapClick}
        onSelect={onSelect}
        onSelectOverlay={onSelectOverlay}
        anchors={anchors}
        overlays={overlays}
        pinIcons={pinIcons}
        searchRadius={searchRadius}
        pinTheme={pinTheme}
        roles={roles}
        selectedId={selectedId}
        selectedOverlayId={selectedOverlayId}
        suppressEmpty={suppressEmpty}
        fitKey={fitKey}
        viewKey={viewKey}
        zoomCorner={zoomCorner}
      />
    );
  }
  return (
    <WorkMapCanvas
      anchors={anchors}
      holdView={holdView}
      home={home}
      onMapClick={onMapClick}
      onSelect={onSelect}
      onSelectOverlay={onSelectOverlay}
      overlays={overlays}
      pinIcons={pinIcons}
      searchRadius={searchRadius}
      pinTheme={pinTheme}
      roles={roles}
      selectedId={selectedId}
      selectedOverlayId={selectedOverlayId}
      suppressEmpty={suppressEmpty}
      fitKey={fitKey}
      viewKey={viewKey}
    />
  );
}
