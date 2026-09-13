import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

export class Avatar3DController {
  constructor(containerElement) {
    this.container = containerElement;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.loader = null;
    this.dracoLoader = null;
    this.currentModel = null;
    this.currentModelUrl = '';
    this.morphMeshes = [];
    this.isDisposed = false;

    // Idle motion & blinks
    this.lastBlinkTime = performance.now();
    this.blinkInterval = 3200;
    this.isBlinking = false;
    this.blinkProgress = 0;
    this.clock = new THREE.Clock();

    // Human Expression & Emotion Engine
    this.currentEmotion = 'listening'; // 'listening' | 'empathy' | 'reassuring' | 'thinking'
    this.headBone = null;
    this.neckBone = null;
    this.leftEye = null;
    this.rightEye = null;
    this.baseHeadRotation = new THREE.Euler(0, 0, 0);

    // Dynamic Emotion Targets
    this.targetHeadRot = { x: 0, y: 0, z: 0 };
    this.currentHeadRot = { x: 0, y: 0, z: 0 };
    this.targetEmotionMorphs = {
      smile: 0,
      browInnerUp: 0,
      browDown: 0,
      eyeSquint: 0,
    };
    this.currentEmotionMorphs = {
      smile: 0,
      browInnerUp: 0,
      browDown: 0,
      eyeSquint: 0,
    };

    // Active lip sync parameters
    this.currentParams = {
      jawOpen: 0,
      mouthFunnel: 0,
      mouthPucker: 0,
      mouthSmile: 0,
    };

    this.onLoaded = null;
    this.initScene();
  }

  initScene() {
    if (!this.container) return;
    const width = this.container.clientWidth || 360;
    const height = this.container.clientHeight || 450;

    // Scene with dark WhatsApp call atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0B141A);

    // Camera (Portrait lens ~50mm FOV 35deg for natural facial proportions)
    this.camera = new THREE.PerspectiveCamera(34, width / height, 0.05, 50);
    this.camera.position.set(0, 0, 0.88);

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls for natural viewing
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 2.5;
    this.controls.maxPolarAngle = Math.PI / 1.7;
    this.controls.target.set(0, 0, 0);

    // DRACOLoader configuration (using Google CDN with local fallback)
    this.dracoLoader = new DRACOLoader();
    try {
      this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    } catch (_) {
      this.dracoLoader.setDecoderPath('/draco/gltf/');
    }

    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(this.dracoLoader);

    // Studio Lighting
    this.setupLighting();

    this.resizeHandler = () => this.onWindowResize();
    window.addEventListener('resize', this.resizeHandler);

    if (typeof ResizeObserver !== 'undefined' && this.container) {
      this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
      this.resizeObserver.observe(this.container);
    }
  }

  setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    // Key Light (Warm golden portrait light)
    const keyLight = new THREE.DirectionalLight(0xfff3e0, 1.8);
    keyLight.position.set(1.2, 1.8, 2.0);
    this.scene.add(keyLight);

    // Fill Light (Cool sky blue)
    const fillLight = new THREE.DirectionalLight(0xbfdbfe, 1.1);
    fillLight.position.set(-1.8, 0.8, 1.2);
    this.scene.add(fillLight);

    // Rim/Back Light (Silhouette depth separation)
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 2.2);
    rimLight.position.set(0, 2.0, -2.0);
    this.scene.add(rimLight);

    // Subtle upward chin bounce
    const bounceLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    bounceLight.position.set(0, -1.5, 0.8);
    this.scene.add(bounceLight);
  }

  async loadModel(url) {
    if (this.isDisposed) return;
    this.currentModelUrl = url || '';

    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.currentModel = null;
      this.morphMeshes = [];
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          if (this.isDisposed) return;
          this.currentModel = gltf.scene;
          this.morphMeshes = [];

          // Collect all meshes with ARKit morph targets
          this.currentModel.traverse((node) => {
            if (node.isMesh) {
              if (node.morphTargetDictionary && node.morphTargetInfluences) {
                this.morphMeshes.push(node);
              }
            }
          });

          this.scene.add(this.currentModel);

          // Locate head/face to frame camera accurately
          const headMesh =
            this.currentModel.getObjectByName('Wolf3D_Head') ||
            this.currentModel.getObjectByName('Head') ||
            this.currentModel.getObjectByName('head') ||
            this.currentModel;

          // Extract skeleton bones for lifelike head tilts, nods, and gaze
          this.headBone = this.currentModel.getObjectByName('Head') || this.currentModel.getObjectByName('mixamorigHead');
          this.neckBone = this.currentModel.getObjectByName('Neck') || this.currentModel.getObjectByName('mixamorigNeck');
          this.leftEye = this.currentModel.getObjectByName('LeftEye') || this.currentModel.getObjectByName('EyeLeft');
          this.rightEye = this.currentModel.getObjectByName('RightEye') || this.currentModel.getObjectByName('EyeRight');
          if (this.headBone) {
            this.baseHeadRotation.copy(this.headBone.rotation);
          }

          const headBox = new THREE.Box3().setFromObject(headMesh);
          const headCenter = headBox.getCenter(new THREE.Vector3());

          // Balanced portrait framing with breathing room: head, neck, shoulders & chest
          const targetY = (headCenter.y > 1.2 && headCenter.y < 2.1) ? headCenter.y - 0.05 : 1.62;
          const targetZ = headCenter.z || 0;
          const distance = 0.78; // Pull camera back so avatar is smaller, nicely framed with shoulders

          this.camera.position.set(0, targetY, targetZ + distance);
          this.controls.target.set(0, targetY, targetZ);
          this.controls.update();

          if (this.onLoaded) this.onLoaded({ meshCount: this.morphMeshes.length, headCenter });
          resolve(this.currentModel);
        },
        undefined,
        (err) => {
          console.warn('Could not load 3D GLB model directly, falling back:', err);
          reject(err);
        }
      );
    });
  }

  setEmotion(emotion) {
    this.currentEmotion = emotion || 'listening';

    switch (this.currentEmotion) {
      case 'empathy':
      case 'concerned':
        // Compassionate counselor posture: head tilted slightly, compassionate brow
        this.targetHeadRot.z = 0.055; // empathic side tilt
        this.targetHeadRot.y = 0.02;
        this.targetHeadRot.x = 0.035; // gentle forward attentive inclination
        this.targetEmotionMorphs.smile = 0.05;
        this.targetEmotionMorphs.browInnerUp = 0.45;
        this.targetEmotionMorphs.browDown = 0.20;
        this.targetEmotionMorphs.eyeSquint = 0.15;
        break;

      case 'reassuring':
      case 'warm':
        // Warm comforting smile, slight head nod and calm presence
        this.targetHeadRot.z = 0.015;
        this.targetHeadRot.y = 0.0;
        this.targetHeadRot.x = 0.02;
        this.targetEmotionMorphs.smile = 0.38;
        this.targetEmotionMorphs.browInnerUp = 0.15;
        this.targetEmotionMorphs.browDown = 0.0;
        this.targetEmotionMorphs.eyeSquint = 0.25;
        break;

      case 'thinking':
      case 'reflecting':
        // Human cognitive glance: slight tilt up/side
        this.targetHeadRot.z = -0.035;
        this.targetHeadRot.y = 0.065;
        this.targetHeadRot.x = -0.025;
        this.targetEmotionMorphs.smile = 0.0;
        this.targetEmotionMorphs.browInnerUp = 0.25;
        this.targetEmotionMorphs.browDown = 0.10;
        this.targetEmotionMorphs.eyeSquint = 0.05;
        break;

      case 'listening':
      default:
        // Attentive listening posture: focused forward, ready to respond
        this.targetHeadRot.z = 0.02;
        this.targetHeadRot.y = 0.0;
        this.targetHeadRot.x = 0.015;
        this.targetEmotionMorphs.smile = 0.12;
        this.targetEmotionMorphs.browInnerUp = 0.05;
        this.targetEmotionMorphs.browDown = 0.0;
        this.targetEmotionMorphs.eyeSquint = 0.05;
        break;
    }
  }

  setMorphTarget(possibleNames, value) {
    const clamped = Math.max(0, Math.min(1, value));

    for (const mesh of this.morphMeshes) {
      const dict = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      if (!dict || !influences) continue;

      for (const name of possibleNames) {
        let index = dict[name];
        if (index === undefined) {
          for (const key of Object.keys(dict)) {
            if (key.endsWith('.' + name) || key.toLowerCase() === name.toLowerCase()) {
              index = dict[key];
              break;
            }
          }
        }

        if (index !== undefined) {
          influences[index] = clamped;
          break;
        }
      }
    }
  }

  updateLipSync(audioFeatures) {
    if (!audioFeatures) return;

    const rawJaw = audioFeatures.jawOpen || 0;
    // Deliver authentic, visible mouth opening (up to 0.88)
    const effectiveJaw = Math.min(0.92, Math.max(0, rawJaw));

    this.currentParams.jawOpen = effectiveJaw;
    this.currentParams.mouthFunnel = Math.min(0.8, (audioFeatures.mouthFunnel || 0) * 0.90);
    this.currentParams.mouthPucker = Math.min(0.6, (audioFeatures.mouthPucker || 0) * 0.85);
    this.currentParams.mouthSmile = Math.min(0.7, (audioFeatures.mouthSmile || 0) * 0.90);

    // 1. Jaw Open / Mouth Open (Supports ReadyPlayerMe readyplayer.glb & ARKit visemes)
    this.setMorphTarget(
      ['mouthOpen', 'jawOpen', 'viseme_aa', 'jaw_open', 'v_aa'],
      this.currentParams.jawOpen
    );

    // 2. Mouth Funnel (O / U rounded vowels)
    this.setMorphTarget(
      ['mouthFunnel', 'viseme_O', 'mouth_funnel', 'v_oh'],
      this.currentParams.mouthFunnel
    );

    // 3. Mouth Pucker (W / OO rounded lips)
    this.setMorphTarget(
      ['mouthPucker', 'viseme_U', 'mouth_pucker', 'v_oo'],
      this.currentParams.mouthPucker
    );

    // 4. Mouth Smile & Consonant Stretch
    this.setMorphTarget(
      ['mouthSmile', 'mouthSmile_L', 'mouthSmile_R', 'viseme_I', 'mouthStretch_L', 'mouthStretch_R'],
      Math.max(this.currentEmotionMorphs.smile, this.currentParams.mouthSmile)
    );

    // Lower teeth depression during loud/open syllables
    if (this.currentParams.jawOpen > 0.3) {
      this.setMorphTarget(['mouthLowerDown_L', 'mouthLowerDown_R'], this.currentParams.jawOpen * 0.25);
    } else {
      this.setMorphTarget(['mouthLowerDown_L', 'mouthLowerDown_R'], 0);
    }
  }

  updateIdleMotion(now, delta) {
    // 1. Natural eye blink calculation
    if (!this.isBlinking && now - this.lastBlinkTime > this.blinkInterval) {
      this.isBlinking = true;
      this.blinkProgress = 0;
      this.blinkInterval = 2600 + Math.random() * 2400;
    }

    if (this.isBlinking) {
      this.blinkProgress += delta * 13; // completes in ~130ms
      let blinkVal = 0;
      if (this.blinkProgress <= 1.0) {
        blinkVal = Math.sin(this.blinkProgress * Math.PI);
      } else {
        this.isBlinking = false;
        this.lastBlinkTime = now;
      }
      this.setMorphTarget(['eyeBlinkLeft', 'eyeBlinkRight', 'eyeBlink_L', 'eyeBlink_R', 'eyesClosed', 'blink'], blinkVal);
    }

    // 2. Smoothly interpolate facial emotion morph targets
    const lerpFactor = Math.min(1.0, delta * 4.0);
    for (const key of Object.keys(this.currentEmotionMorphs)) {
      this.currentEmotionMorphs[key] += (this.targetEmotionMorphs[key] - this.currentEmotionMorphs[key]) * lerpFactor;
    }

    // Apply smile (both readyplayer.glb and female model)
    const activeSmile = Math.max(this.currentEmotionMorphs.smile, this.currentParams.mouthSmile);
    this.setMorphTarget(['mouthSmile', 'mouthSmile_L', 'mouthSmile_R'], activeSmile);

    // Apply brows & squint (if supported by model)
    this.setMorphTarget(['browInnerUp'], this.currentEmotionMorphs.browInnerUp);
    this.setMorphTarget(['browDownLeft', 'browDownRight', 'browDown_L', 'browDown_R'], this.currentEmotionMorphs.browDown);
    this.setMorphTarget(['eyeSquintLeft', 'eyeSquintRight', 'eyeSquint_L', 'eyeSquint_R'], this.currentEmotionMorphs.eyeSquint);

    // 3. Human Head Movement: Affirmative nodding + emotion posture + breathing sway
    const t = now * 0.001;
    // Breathing sway
    const breathingPitch = Math.sin(t * 1.1) * 0.008;
    const breathingYaw = Math.cos(t * 0.7) * 0.012;

    // Empathic affirmative nodding (especially active when listening or empathy)
    let nodding = 0;
    if (this.currentEmotion === 'empathy' || this.currentEmotion === 'listening') {
      const nodCycle = (t % 2.8) / 2.8;
      if (nodCycle < 0.25) {
        nodding = Math.sin(nodCycle * 4 * Math.PI) * (this.currentEmotion === 'empathy' ? 0.045 : 0.030);
      }
    } else if (this.currentEmotion === 'reassuring' && this.currentParams.jawOpen > 0.2) {
      nodding = Math.sin(t * 3.5) * 0.025;
    }

    // Interpolate current head rotation
    this.currentHeadRot.x += (this.targetHeadRot.x + breathingPitch + nodding - this.currentHeadRot.x) * (delta * 4.5);
    this.currentHeadRot.y += (this.targetHeadRot.y + breathingYaw - this.currentHeadRot.y) * (delta * 3.5);
    this.currentHeadRot.z += (this.targetHeadRot.z - this.currentHeadRot.z) * (delta * 3.5);

    if (this.headBone) {
      this.headBone.rotation.x = this.baseHeadRotation.x + this.currentHeadRot.x;
      this.headBone.rotation.y = this.baseHeadRotation.y + this.currentHeadRot.y;
      this.headBone.rotation.z = this.baseHeadRotation.z + this.currentHeadRot.z;
    } else if (this.currentModel) {
      this.currentModel.rotation.x = this.currentHeadRot.x;
      this.currentModel.rotation.y = this.currentHeadRot.y;
      this.currentModel.rotation.z = this.currentHeadRot.z;
    }
  }

  render() {
    if (this.isDisposed || !this.renderer || !this.scene || !this.camera) return;
    const delta = this.clock.getDelta();
    const now = performance.now();

    this.updateIdleMotion(now, delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.isDisposed = true;
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.dracoLoader) {
      this.dracoLoader.dispose();
    }
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
