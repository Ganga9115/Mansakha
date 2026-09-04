import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { colors } from '../../shared/theme/colors';
import { radius } from '../../shared/theme/radius';

// Real, rigged, animated 3D human - "Cesium Man", a standard Khronos glTF
// sample asset (CC-BY 4.0, (c) 2017 Cesium), hosted in our own Supabase
// Storage bucket rather than bundled into the app. Its one baked animation
// is a walk cycle, which is why this is only wired to "5-Minute Walk in
// Place" - there is no equally legitimate free-licensed 3D animation for
// the app's other physical exercises (neck stretches, muscle tensing).
//
// Driven by plain, imperative three.js (Scene/Camera/Renderer/AnimationMixer
// managed by hand in useEffect) rather than @react-three/fiber. fiber's
// custom React renderer bundles react-reconciler@0.27, which is built
// against React 17/18-era internals and crashes ("Cannot read properties of
// undefined (reading 'ReactCurrentOwner')") under this app's React 19 - and
// @react-three/drei (an earlier attempt) separately crashed Metro's bundler
// with an unrelated loader's import.meta usage. Plain three.js has neither
// problem since nothing here asks React to manage the 3D scene graph.
const MODEL_URL = 'https://sceidfabzqwidecszrlq.supabase.co/storage/v1/object/public/wellness-models/cesium-man.glb';

// Cesium Man's baked texture is a blue/green astronaut-style suit with the
// Cesium logo on the chest - branding that has nothing to do with this app.
// Swapping every mesh's material for a plain skin-tone one strips that
// branding and reads as a plain human figure instead.
const SKIN_TONE = 0xc68863;

const VIEWPORT_W = 260;
const VIEWPORT_H = 300;

export default function Exercise3DViewer({ running }) {
  const containerRef = useRef(null);
  const runningRef = useRef(running);
  const actionRef = useRef(null);
  const modelRootRef = useRef(null);

  useEffect(() => {
    runningRef.current = running;
    const action = actionRef.current;
    if (!action) return;
    if (running) {
      action.reset().fadeIn(0.3).play();
    } else {
      action.paused = true;
    }
  }, [running]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let disposed = false;
    let frameId;
    const clock = new THREE.Clock();
    let mixer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, VIEWPORT_W / VIEWPORT_H, 0.1, 100);
    camera.position.set(0, 1, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(VIEWPORT_W, VIEWPORT_H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);

    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.scale.setScalar(1.15);
        model.position.set(0, -1, 0);
        const skinMaterial = new THREE.MeshStandardMaterial({ color: SKIN_TONE, roughness: 0.7 });
        model.traverse((node) => {
          if (node.isMesh) node.material = skinMaterial;
        });
        scene.add(model);
        modelRootRef.current = model;

        mixer = new THREE.AnimationMixer(model);
        const clip = gltf.animations[0];
        if (clip) {
          const action = mixer.clipAction(clip);
          actionRef.current = action;
          if (runningRef.current) action.play();
          else action.paused = true;
        }
      },
      undefined,
      (err) => console.warn('Exercise3DViewer: failed to load model', err)
    );

    const animate = () => {
      if (disposed) return;
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      mixer?.update(delta);
      // Gentle auto-rotate so the model reads as a real 3D object without
      // needing drag-to-orbit controls (a react-three/drei helper we dropped).
      if (modelRootRef.current && runningRef.current) {
        modelRootRef.current.rotation.y += delta * 0.4;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      mixer?.stopAllAction();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <View style={{ alignItems: 'center' }}>
      <View
        ref={containerRef}
        // @ts-ignore - react-native-web forwards this ref to the underlying DOM node
        style={{ width: VIEWPORT_W, height: VIEWPORT_H, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.primaryLight }}
      />
    </View>
  );
}
