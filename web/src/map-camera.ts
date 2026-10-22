export type MapCamera = {
  latitude: number;
  longitude: number;
  zoom: number;
};

export type MapFitMode = "pin" | "hold" | "visible";

const cameras = new Map<string, MapCamera>();

export function readMapCamera(key: string): MapCamera | null {
  return cameras.get(key) ?? null;
}

export function writeMapCamera(key: string, camera: MapCamera) {
  cameras.set(key, camera);
}
