declare module "three" {
  export class Vector3 {
    x: number;
    y: number;
    z: number;
  }
  export class Box3 {
    setFromObject(object: object): this;
    getSize(target: Vector3): Vector3;
    getCenter(target: Vector3): Vector3;
  }
  export class Scene {
    add(object: object): void;
    traverse(callback: (child: Mesh) => void): void;
  }
  export class PerspectiveCamera {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    near: number;
    far: number;
    position: { set(x: number, y: number, z: number): void };
    lookAt(x: number, y: number, z: number): void;
    updateProjectionMatrix(): void;
  }
  export class WebGLRenderer {
    constructor(parameters?: object);
    domElement: HTMLCanvasElement;
    setPixelRatio(value: number): void;
    setClearColor(color: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
  }
  export class HemisphereLight {
    constructor(sky: number, ground: number, intensity: number);
  }
  export class DirectionalLight {
    constructor(color: number, intensity: number);
    position: { set(x: number, y: number, z: number): void };
  }
  export class Mesh {
    isMesh: boolean;
    geometry?: { dispose(): void };
    material?: { dispose(): void } | Array<{ dispose(): void }>;
  }
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  export class OrbitControls {
    constructor(camera: object, element: HTMLElement);
    enableDamping: boolean;
    target: { set(x: number, y: number, z: number): void };
    update(): void;
    dispose(): void;
  }
}

declare module "three/examples/jsm/loaders/GLTFLoader.js" {
  export class GLTFLoader {
    load(
      url: string,
      onLoad: (gltf: { scene: { position: { sub(offset: object): void } } }) => void,
      onProgress?: unknown,
      onError?: () => void,
    ): void;
  }
}
