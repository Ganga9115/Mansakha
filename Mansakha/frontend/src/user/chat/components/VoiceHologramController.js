import * as THREE from 'three';
import { Renderer } from 'expo-three';

// Native counterpart to MansakhaCallModal.js's own web-only "3D Animated
// Hologram Particle Sphere & Audio Frequency Equalizer" effect (a raw
// HTML5 Canvas 2D animation, gated `Platform.OS === 'web'` since
// `canvas.getContext('2d')` doesn't exist on React Native at all). This
// reimplements the same three visual elements - the rotating particle
// sphere, the orbiting rings, and the equalizer bars - as real 3D objects
// rendered through expo-gl/three.js instead, the same rendering pipeline
// Avatar3DController already uses for the video-call avatar. The web
// version is untouched; this class is only ever instantiated on native.

const PARTICLE_COUNT = 160;
const BAR_COUNT = 28;
const RING_COUNT = 3;

// Same three-way palette and per-state motion speeds as the web canvas
// version (see MansakhaCallModal.js's own hologram effect for the source
// of truth these numbers were read from).
const STATE_STYLE = {
  speaking: { colors: [0x38bdf8, 0x818cf8, 0x38bdf8], bg: 0x0d1b2a, rotY: 0.024, rotX: 0.014, pulseFreq: 2.2, pulseAmp: 0.15, barFreq: 3, barAmp: 30, barBase: 8, glow: 12 },
  listening: { colors: [0x34d399, 0x10b981, 0x34d399], bg: 0x0a1f18, rotY: 0.012, rotX: 0.006, pulseFreq: 1.1, pulseAmp: 0.08, barFreq: 1.5, barAmp: 18, barBase: 6, glow: 8 },
  idle: { colors: [0xc084fc, 0x6366f1, 0xc084fc], bg: 0x140f24, rotY: 0.008, rotX: 0.006, pulseFreq: 0.5, pulseAmp: 0.03, barFreq: 0.8, barAmp: 7, barBase: 4, glow: 5 },
};

export class VoiceHologramController {
  constructor(gl) {
    this.gl = gl;
    this.isDisposed = false;
    this.pulse = 0;
    this.speechState = 'idle';
    this.clock = new THREE.Clock();

    this.initScene();
    this.buildParticleSphere();
    this.buildRings();
    this.buildEqualizerBars();
  }

  initScene() {
    const width = this.gl.drawingBufferWidth;
    const height = this.gl.drawingBufferHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b141a);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 4.2);

    this.renderer = new Renderer({ gl: this.gl, antialias: true, alpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height);

    this.sphereGroup = new THREE.Group();
    this.scene.add(this.sphereGroup);
  }

  buildParticleSphere() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 1.3 + Math.random() * 0.35;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      tmpColor.setHex(STATE_STYLE.idle.colors[i % 3]);
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;

      sizes[i] = 0.05 + Math.random() * 0.06;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.particleSizes = sizes;

    const material = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.sphereGroup.add(this.particles);
  }

  buildRings() {
    this.rings = [];
    for (let r = 0; r < RING_COUNT; r++) {
      const curve = new THREE.EllipseCurve(0, 0, 1.7, 0.65, 0, Math.PI * 2, false, 0);
      const points = curve.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: STATE_STYLE.idle.colors[0],
        transparent: true,
        opacity: 0.35 - r * 0.1,
      });
      const line = new THREE.LineLoop(geometry, material);
      line.rotation.z = (r * Math.PI) / 4;
      line.rotation.x = Math.PI / 2.4;
      this.sphereGroup.add(line);
      this.rings.push({ line, spin: r === 1 ? -0.4 : 0.55, baseZ: (r * Math.PI) / 3 });
    }
  }

  buildEqualizerBars() {
    this.bars = [];
    const barWidth = 0.06;
    const gap = 0.05;
    const totalWidth = BAR_COUNT * (barWidth + gap);
    const startX = -totalWidth / 2;

    const barGroup = new THREE.Group();
    barGroup.position.set(0, -1.55, 0);
    this.scene.add(barGroup);

    for (let b = 0; b < BAR_COUNT; b++) {
      const geometry = new THREE.BoxGeometry(barWidth, 0.15, barWidth * 0.6);
      const material = new THREE.MeshBasicMaterial({ color: STATE_STYLE.idle.colors[1] });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = startX + b * (barWidth + gap);
      barGroup.add(mesh);
      this.bars.push(mesh);
    }
    this.barGroup = barGroup;
  }

  setSpeechState(state) {
    this.speechState = STATE_STYLE[state] ? state : 'idle';
  }

  render() {
    if (this.isDisposed || !this.renderer || !this.scene || !this.camera) return;
    const delta = this.clock.getDelta();
    this.pulse += delta * 3;

    const style = STATE_STYLE[this.speechState] || STATE_STYLE.idle;

    // Background mood tint, matching the web glow's dominant hue per state.
    this.scene.background.setHex(style.bg);

    // Rotate + pulse-scale the particle sphere.
    this.sphereGroup.rotation.y += style.rotY;
    this.sphereGroup.rotation.x += style.rotX;
    const scale = 1 + Math.sin(this.pulse * style.pulseFreq) * style.pulseAmp;
    this.sphereGroup.scale.setScalar(scale);

    // Recolor particles for the current state (cheap: just the 3-cycle hue).
    const colorAttr = this.particles.geometry.getAttribute('color');
    const tmpColor = new THREE.Color();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      tmpColor.setHex(style.colors[i % 3]);
      colorAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
    }
    colorAttr.needsUpdate = true;

    // Spin the orbiting rings, recolor per state.
    this.rings.forEach(({ line, spin }) => {
      line.rotation.z += spin * delta;
      line.material.color.setHex(style.colors[0]);
    });

    // Animate the equalizer bars with the same per-bar sine phase offsets
    // the web canvas version uses, just applied to mesh scale instead of a
    // 2D rect height.
    this.bars.forEach((mesh, b) => {
      const wave = Math.sin(this.pulse * style.barFreq + b * 0.4);
      const height = style.barBase + Math.abs(wave) * style.barAmp;
      mesh.scale.y = Math.max(0.15, height / 15);
      mesh.material.color.setHex(b % 2 === 0 ? style.colors[0] : style.colors[1]);
    });

    this.renderer.render(this.scene, this.camera);
    if (this.gl) this.gl.endFrameEXP();
  }

  dispose() {
    this.isDisposed = true;
    if (this.particles) {
      this.particles.geometry.dispose();
      this.particles.material.dispose();
    }
    this.rings?.forEach(({ line }) => {
      line.geometry.dispose();
      line.material.dispose();
    });
    this.bars?.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.gl = null;
  }
}
