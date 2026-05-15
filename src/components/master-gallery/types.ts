// Shared types used across master-gallery components.
// Mirrors the JSON shape returned by /api/master-gallery + /api/master-gallery/photos.

export interface MasterGalleryAlbum {
  id: string;
  name: string;
  photoCount: number;
  coverPhoto: string | null;
}

export interface MasterGalleryPosition {
  id: string;
  company: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  coverImage: string | null;
  photoCount: number;
  bannerCount: number;
  albums: MasterGalleryAlbum[];
}

export interface MasterGalleryTree {
  positions: MasterGalleryPosition[];
  totalPhotos: number;
  bannerCount: number;
}

export interface MasterGalleryPhoto {
  id: string;
  workHistoryId: string;
  albumId: string | null;
  filePath: string;
  fileName: string;
  fileMime: string;
  caption: string | null;
  isCover: boolean;
  isBanner: boolean;
  isFavorite: boolean;
  isPrivate: boolean;
  tags: string | null;
  rotation: number;
  createdAt: string;
  album: { id: string; name: string } | null;
  workHistory: { id: string; company: string; role: string };
}

// Sentinel albumId used in URL params + API to mean "photos with no album"
// (i.e. photos directly under the job folder, not in any sub-album).
export const UNFILED_ALBUM_ID = "__unfiled__";

// Sentinel "view" used by the virtual top-level "Banner Photos" folder.
export const BANNERS_VIEW = "banners";
