import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export function ModelStage({
  src,
  interactive,
  label,
}: {
  src: string;
  interactive: boolean;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setFailed("");
    let stopped = false;
    let frame = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x1c1814);
    renderer.domElement.setAttribute("aria-hidden", "true");
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    scene.add(new THREE.HemisphereLight(0xf5f2ee, 0x3a342c, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 5, 4);
    scene.add(key);
    const controls = interactive ? new OrbitControls(camera, renderer.domElement) : null;
    if (controls) controls.enableDamping = true;
    const resize = () => {
      const width = el.clientWidth || 1;
      const height = el.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const loader = new GLTFLoader();
    loader.load(
      src,
      (gltf) => {
        if (stopped) return;
        const root = gltf.scene;
        scene.add(root);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        root.position.sub(center);
        const radius = Math.max(size.x, size.y, size.z, 0.001) * 0.5;
        camera.position.set(radius * 1.6, radius * 0.85, radius * 2.1);
        camera.near = Math.max(radius / 100, 0.001);
        camera.far = radius * 80;
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        controls?.target.set(0, 0, 0);
        controls?.update();
        resize();
        renderer.render(scene, camera);
      },
      undefined,
      (error) => {
        if (stopped) return;
        const message = error instanceof Error ? error.message : "This model could not be opened.";
        setFailed(message || "This model could not be opened.");
      },
    );
    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (!interactive) renderer.render(scene, camera);
    });
    observer.observe(el);
    const tick = () => {
      if (stopped || !interactive) return;
      controls?.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    if (interactive) tick();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls?.dispose();
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [src, interactive]);

  return (
    <div
      ref={host}
      className={interactive ? "role-canvas-model-stage" : "role-canvas-model-preview"}
      role="img"
      aria-label={label}
    >
      {failed ? <p>{failed}</p> : null}
    </div>
  );
}
