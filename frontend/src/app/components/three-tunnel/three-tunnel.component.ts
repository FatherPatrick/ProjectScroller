import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
  inject
} from '@angular/core';
import * as THREE from 'three';

interface VisualBlobSeed {
  laneOffset: number;
  orbitRadius: number;
  orbitAspect: number;
  phaseA: number;
  phaseB: number;
  phaseC: number;
  speed: number;
  depth: number;
  chaos: number;
}

interface SparkSeed {
  laneOffset: number;
  radius: number;
  phase: number;
  speed: number;
  depth: number;
}

const FULLSCREEN_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Redraws the previous frame slightly zoomed, rotated, and dimmed — the
// Llamasoft "Neon" video-feedback technique that smears everything into
// radiating glow trails.
const FEEDBACK_FRAGMENT_SHADER = `
  uniform sampler2D uTexture;
  uniform float uZoom;
  uniform float uRotate;
  uniform float uDecay;
  uniform vec2 uAspect;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * uAspect;
    float c = cos(uRotate);
    float s = sin(uRotate);
    p = mat2(c, -s, s, c) * p;
    p /= uZoom;
    vec2 uv = p / uAspect + 0.5;
    vec3 prev = texture2D(uTexture, uv).rgb;
    // Trails die quickly near screen center so stationary glow can't
    // accumulate into a white-hot flashing core; outer trails linger.
    float centerFade = smoothstep(0.02, 0.4, length((vUv - 0.5) * uAspect));
    float decay = uDecay * mix(0.72, 1.0, centerFade);
    gl_FragColor = vec4(prev * decay, 1.0);
  }
`;

const PRESENT_FRAGMENT_SHADER = `
  uniform sampler2D uTexture;
  varying vec2 vUv;
  void main() {
    vec3 col = texture2D(uTexture, vUv).rgb;
    // Soft tonemap keeps additive stacks from blowing out to pure white.
    col = 1.0 - exp(-col * 1.15);
    gl_FragColor = vec4(col, 1.0);
  }
`;

@Component({
  selector: 'app-three-tunnel',
  standalone: true,
  template: '<canvas #canvas class="three-tunnel-canvas" aria-hidden="true"></canvas>',
  styles: [`
    :host {
      position: absolute;
      inset: 0;
      display: block;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }

    .three-tunnel-canvas {
      width: 100%;
      height: 100%;
      display: block;
      opacity: 0.9;
      filter: saturate(1.22) contrast(1.06) blur(0.35px);
      mix-blend-mode: screen;
    }
  `]
})
export class ThreeTunnelComponent implements AfterViewInit, OnDestroy {
  @Input() depth = 0;
  @Input() reducedMotion = false;

  @ViewChild('canvas', { static: true })
  private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private blobGroup?: THREE.Group;
  private sparkSystem?: THREE.Points;
  private blobTexture?: THREE.Texture;
  private blobMaterials: THREE.SpriteMaterial[] = [];
  private blobs: THREE.Sprite[] = [];
  private blobSeeds: VisualBlobSeed[] = [];
  private sparkSeeds: SparkSeed[] = [];
  private sparkMaterial?: THREE.PointsMaterial;
  private coreTexture?: THREE.Texture;
  private beamTexture?: THREE.Texture;
  private coreSprite?: THREE.Sprite;
  private coreMaterial?: THREE.SpriteMaterial;
  private beamSpriteA?: THREE.Sprite;
  private beamSpriteB?: THREE.Sprite;
  private beamMaterialA?: THREE.SpriteMaterial;
  private beamMaterialB?: THREE.SpriteMaterial;
  private rtRead?: THREE.WebGLRenderTarget;
  private rtWrite?: THREE.WebGLRenderTarget;
  private feedbackScene?: THREE.Scene;
  private presentScene?: THREE.Scene;
  private screenCamera?: THREE.OrthographicCamera;
  private feedbackMaterial?: THREE.ShaderMaterial;
  private presentMaterial?: THREE.ShaderMaterial;
  private quadGeometry?: THREE.PlaneGeometry;
  private animationFrameId: number | null = null;
  private isOnScreen = true;
  private visibilityObserver?: IntersectionObserver;
  // Neon "light synth" ramp: magenta -> violet -> cyan -> blue -> violet -> pink.
  private readonly xboxHueStops = [0.85, 0.75, 0.5, 0.62, 0.78, 0.92];

  private readonly ngZone = inject(NgZone);

  ngAfterViewInit(): void {
    this.initializeScene();
    this.handleResize();

    window.addEventListener('resize', this.handleResize, { passive: true });

    // Skip rendering while the stage is scrolled out of view (e.g. reading
    // the projects panel) — saves GPU/battery without tearing down the scene.
    this.visibilityObserver = new IntersectionObserver(entries => {
      this.isOnScreen = entries.some(entry => entry.isIntersecting);
    });
    this.visibilityObserver.observe(this.canvasRef.nativeElement);

    this.ngZone.runOutsideAngular(() => {
      this.animationFrameId = requestAnimationFrame(this.renderFrame);
    });
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    window.removeEventListener('resize', this.handleResize);
    this.visibilityObserver?.disconnect();

    this.blobMaterials.forEach(material => material.dispose());
    this.blobTexture?.dispose();
    this.coreTexture?.dispose();
    this.beamTexture?.dispose();
    this.coreMaterial?.dispose();
    this.beamMaterialA?.dispose();
    this.beamMaterialB?.dispose();
    this.sparkSystem?.geometry.dispose();
    this.sparkMaterial?.dispose();
    this.rtRead?.dispose();
    this.rtWrite?.dispose();
    this.feedbackMaterial?.dispose();
    this.presentMaterial?.dispose();
    this.quadGeometry?.dispose();
    this.renderer?.dispose();
  }

  private initializeScene(): void {
    const canvas = this.canvasRef.nativeElement;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });

    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 5000);
    camera.position.set(0, 0, 280);

    const blobGroup = new THREE.Group();
    blobGroup.position.z = -220;
    scene.add(blobGroup);

    this.blobTexture = this.createBlobTexture();

    const blobCount = 78;
    this.blobSeeds = Array.from({ length: blobCount }, (_, index) => ({
      laneOffset: index / blobCount,
      orbitRadius: 70 + Math.random() * 320,
      orbitAspect: 0.56 + Math.random() * 0.86,
      phaseA: Math.random() * Math.PI * 2,
      phaseB: Math.random() * Math.PI * 2,
      phaseC: Math.random() * Math.PI * 2,
      speed: 0.2 + Math.random() * 0.66,
      depth: Math.random(),
      chaos: Math.random()
    }));

    for (let index = 0; index < blobCount; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.blobTexture,
        color: new THREE.Color('#ff7fd8'),
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const blob = new THREE.Sprite(material);
      blob.scale.set(160, 160, 1);
      blobGroup.add(blob);
      this.blobs.push(blob);
      this.blobMaterials.push(material);
    }

    const sparkCount = 380;
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));

    this.sparkSeeds = Array.from({ length: sparkCount }, (_, index) => ({
      laneOffset: index / sparkCount,
      radius: 16 + Math.random() * 230,
      phase: Math.random() * Math.PI * 2,
      speed: 0.45 + Math.random() * 1.25,
      depth: Math.random()
    }));

    const sparkMaterial = new THREE.PointsMaterial({
      color: new THREE.Color('#f88cff'),
      size: 2.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const sparkSystem = new THREE.Points(sparkGeometry, sparkMaterial);
    scene.add(sparkSystem);

    this.coreTexture = this.createCoreTexture();
    this.beamTexture = this.createBeamTexture();

    const coreMaterial = new THREE.SpriteMaterial({
      map: this.coreTexture,
      color: new THREE.Color('#fff0fa'),
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const coreSprite = new THREE.Sprite(coreMaterial);
    coreSprite.position.set(0, 0, -260);
    coreSprite.scale.set(340, 340, 1);
    scene.add(coreSprite);

    const beamMaterialA = new THREE.SpriteMaterial({
      map: this.beamTexture,
      color: new THREE.Color('#ffb0e8'),
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const beamSpriteA = new THREE.Sprite(beamMaterialA);
    beamSpriteA.position.set(0, 0, -262);
    beamSpriteA.scale.set(560, 560, 1);
    scene.add(beamSpriteA);

    const beamMaterialB = new THREE.SpriteMaterial({
      map: this.beamTexture,
      color: new THREE.Color('#b090ff'),
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const beamSpriteB = new THREE.Sprite(beamMaterialB);
    beamSpriteB.position.set(0, 0, -258);
    beamSpriteB.scale.set(440, 440, 1);
    scene.add(beamSpriteB);

    const quadGeometry = new THREE.PlaneGeometry(2, 2);
    const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const feedbackMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: FEEDBACK_FRAGMENT_SHADER,
      uniforms: {
        uTexture: { value: null },
        uZoom: { value: 1.014 },
        uRotate: { value: 0.0025 },
        uDecay: { value: 0.93 },
        uAspect: { value: new THREE.Vector2(1, 1) }
      },
      depthTest: false,
      depthWrite: false
    });
    const feedbackScene = new THREE.Scene();
    feedbackScene.add(new THREE.Mesh(quadGeometry, feedbackMaterial));

    const presentMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: PRESENT_FRAGMENT_SHADER,
      uniforms: {
        uTexture: { value: null }
      },
      depthTest: false,
      depthWrite: false
    });
    const presentScene = new THREE.Scene();
    presentScene.add(new THREE.Mesh(quadGeometry, presentMaterial));

    const rtOptions: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false
    };

    this.rtRead = new THREE.WebGLRenderTarget(2, 2, rtOptions);
    this.rtWrite = new THREE.WebGLRenderTarget(2, 2, rtOptions);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.blobGroup = blobGroup;
    this.sparkSystem = sparkSystem;
    this.sparkMaterial = sparkMaterial;
    this.coreSprite = coreSprite;
    this.coreMaterial = coreMaterial;
    this.beamSpriteA = beamSpriteA;
    this.beamSpriteB = beamSpriteB;
    this.beamMaterialA = beamMaterialA;
    this.beamMaterialB = beamMaterialB;
    this.feedbackScene = feedbackScene;
    this.presentScene = presentScene;
    this.screenCamera = screenCamera;
    this.feedbackMaterial = feedbackMaterial;
    this.presentMaterial = presentMaterial;
    this.quadGeometry = quadGeometry;
  }

  private readonly renderFrame = (timestamp: number): void => {
    if (
      !this.renderer || !this.scene || !this.camera || !this.sparkSystem ||
      !this.rtRead || !this.rtWrite || !this.feedbackScene || !this.presentScene ||
      !this.screenCamera || !this.feedbackMaterial || !this.presentMaterial
    ) {
      return;
    }

    if (!this.isOnScreen) {
      this.animationFrameId = requestAnimationFrame(this.renderFrame);
      return;
    }

    const time = timestamp * 0.001;
    const motionFactor = this.reducedMotion ? 0.26 : 1;
    const depthProgress = THREE.MathUtils.clamp(this.depth / 1000, 0, 1);
    const energy = this.getEnergy(time) * (this.reducedMotion ? 0.58 : 1);

    this.updateBlobs(time, energy, motionFactor * 1.5, depthProgress);
    this.updateSparks(time, energy, motionFactor * 1.35, depthProgress);
    this.updateCore(time, energy);

    this.camera.position.x = Math.sin(time * 0.055 * motionFactor) * 11;
    this.camera.position.y = Math.cos(time * 0.05 * motionFactor) * 8;
    this.camera.position.z = 280;
    this.camera.rotation.z = Math.sin(time * 0.04 * motionFactor) * 0.012;
    this.camera.fov = 54 + Math.sin(time * 0.11 * motionFactor) * 1.2 + energy * 0.7;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, -1020);

    this.feedbackMaterial.uniforms['uTexture'].value = this.rtRead.texture;
    this.feedbackMaterial.uniforms['uZoom'].value = this.reducedMotion
      ? 1.004
      : 1.012 + energy * 0.006;
    this.feedbackMaterial.uniforms['uRotate'].value = this.reducedMotion
      ? 0
      : (0.002 + energy * 0.0014) * Math.sin(time * 0.05);
    this.feedbackMaterial.uniforms['uDecay'].value = this.reducedMotion ? 0.82 : 0.89;

    this.renderer.setRenderTarget(this.rtWrite);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.render(this.feedbackScene, this.screenCamera);
    this.renderer.render(this.scene, this.camera);

    this.presentMaterial.uniforms['uTexture'].value = this.rtWrite.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.presentScene, this.screenCamera);

    const swap = this.rtRead;
    this.rtRead = this.rtWrite;
    this.rtWrite = swap;

    this.animationFrameId = requestAnimationFrame(this.renderFrame);
  };

  private updateBlobs(time: number, energy: number, motionFactor: number, depthProgress: number): void {
    if (!this.blobGroup || this.blobs.length === 0) {
      return;
    }

    const chaosBoost = 1.45;

    this.blobGroup.rotation.z = Math.sin(time * 0.062 * motionFactor) * 0.15;
    this.blobGroup.rotation.x = Math.sin(time * 0.055 * motionFactor) * 0.1;
    this.blobGroup.rotation.y = Math.cos(time * 0.05 * motionFactor) * 0.1;
    this.blobGroup.scale.setScalar(1 + depthProgress * 0.13 + energy * 0.12);

    for (let index = 0; index < this.blobs.length; index += 1) {
      const blob = this.blobs[index];
      const material = this.blobMaterials[index];
      // Blobs pair up into 2-fold rotational symmetry around the view axis —
      // odd indices mirror their even partner's orbit through screen center.
      const mirror = index % 2 === 1 ? -1 : 1;
      const seed = this.blobSeeds[index - (index % 2)];
      const flow = time * seed.speed * motionFactor;
      const chaosTime = time * (0.74 + seed.chaos * 1.45) * motionFactor;
      const chaosX = Math.sin(chaosTime + seed.phaseC) * (18 + energy * 18) + Math.cos(chaosTime * 1.32 + seed.phaseA) * 12;
      const chaosY = Math.cos(chaosTime * 0.54 + seed.phaseA) * (14 + energy * 14) + Math.sin(chaosTime * 1.15 + seed.phaseB) * 10;
      const tunnelLength = 2600;
      const lane = (
        time * (132 + seed.speed * 58) * motionFactor +
        depthProgress * 1600 +
        seed.laneOffset * tunnelLength
      ) % tunnelLength;

      const x =
        Math.sin(flow + seed.phaseA) * seed.orbitRadius * (0.34 + depthProgress * 0.12) +
        Math.cos(flow * 0.31 + seed.phaseB) * 46 + chaosX * chaosBoost;
      const y =
        Math.cos(flow * 0.72 + seed.phaseB) * seed.orbitRadius * seed.orbitAspect * 0.28 +
        Math.sin(flow * 0.28 + seed.phaseA) * 30 + chaosY * chaosBoost;
      const z =
        320 - lane +
        Math.sin(flow * 0.26 + seed.phaseB) * (70 + energy * 90) +
        Math.cos(chaosTime * 0.9 + seed.phaseC) * 120;

      blob.position.set(x * mirror, y * mirror, z);

      const breathe = 0.5 + Math.sin(time * 0.31 + seed.phaseB) * 0.5;
      const erratic = 0.5 + Math.sin(time * (0.42 + seed.chaos * 0.78) + seed.phaseC) * 0.5;
      const scale =
        (106 + seed.orbitRadius * 0.88) *
        (0.8 + breathe * 0.16 + erratic * 0.1 * chaosBoost + energy * 0.12 + depthProgress * 0.08);
      const skew = 0.82 + erratic * 0.16;
      blob.scale.set(scale * skew, scale * (1.42 - skew * 0.58), 1);
      blob.material.rotation = Math.sin(flow * 0.5 + seed.phaseC) * 0.38 + Math.cos(chaosTime * 0.36) * 0.14;

      const hueBase = this.sampleXboxHue(seed.laneOffset + time * 0.12);
      const hue = hueBase + Math.sin(time * 0.28 + seed.phaseA) * 0.06;
      const sat = 0.9 + breathe * 0.1;
      const light = 0.29 + breathe * 0.1 + energy * 0.08;
      const nearFactor = THREE.MathUtils.clamp(1 - lane / tunnelLength, 0.35, 1);
      material.color.setHSL((hue + 1) % 1, sat, light);
      material.opacity =
        (0.05 +
        breathe * 0.03 +
        erratic * 0.024 +
        energy * 0.05) * nearFactor;
    }
  }

  private updateSparks(time: number, energy: number, motionFactor: number, depthProgress: number): void {
    const geometry = this.sparkSystem?.geometry;
    const positions = geometry?.getAttribute('position');

    if (!(positions instanceof THREE.BufferAttribute)) {
      return;
    }

    for (let index = 0; index < this.sparkSeeds.length; index += 1) {
      const seed = this.sparkSeeds[index];
      const flow = time * seed.speed * motionFactor + seed.phase;
      const orbit = seed.radius + Math.sin(flow * 0.52) * (10 + energy * 24);
      const lane = (
        time * (92 + seed.speed * 28) * motionFactor +
        depthProgress * 1300 +
        seed.laneOffset * 1900
      ) % 1900;

      const x = Math.cos(flow) * orbit + Math.sin(flow * 0.68) * 24;
      const y = Math.sin(flow * 0.94) * orbit * 0.56 + Math.cos(flow * 0.42) * 16;
      const z = 220 - lane - seed.depth * 1260;

      positions.setXYZ(index, x, y, z);
    }

    positions.needsUpdate = true;

    if (this.sparkMaterial) {
      const hue = this.sampleXboxHue(0.22 + time * 0.17);
      this.sparkMaterial.color.setHSL(hue, 0.92, 0.58);
      this.sparkMaterial.opacity = 0.14 + energy * 0.13;
      this.sparkMaterial.size = 1.8 + energy * 1.9;
    }
  }

  private updateCore(time: number, energy: number): void {
    if (!this.coreSprite || !this.coreMaterial || !this.beamSpriteA || !this.beamSpriteB ||
        !this.beamMaterialA || !this.beamMaterialB) {
      return;
    }

    const motionFactor = this.reducedMotion ? 0.26 : 1;
    const pulse = 1 + energy * 0.1 + Math.sin(time * 0.47) * 0.04;

    this.coreSprite.scale.set(280 * pulse, 280 * pulse, 1);
    this.coreMaterial.opacity = 0.1 + energy * 0.07;

    this.beamMaterialA.rotation = time * 0.05 * motionFactor;
    this.beamMaterialB.rotation = -time * 0.034 * motionFactor;

    const beamPulse = 1 + energy * 0.1;
    this.beamSpriteA.scale.set(560 * beamPulse, 560 * beamPulse, 1);
    this.beamSpriteB.scale.set(440 * beamPulse, 440 * beamPulse, 1);
    this.beamMaterialA.opacity = 0.05 + energy * 0.05;
    this.beamMaterialB.opacity = 0.04 + energy * 0.04;

    const hueA = this.sampleXboxHue(0.05 + time * 0.06);
    const hueB = this.sampleXboxHue(0.55 + time * 0.06);
    this.beamMaterialA.color.setHSL(hueA, 0.85, 0.72);
    this.beamMaterialB.color.setHSL(hueB, 0.85, 0.68);
  }

  private getEnergy(time: number): number {
    const slowBed = 0.5 + Math.sin(time * 0.34 + 0.9) * 0.5;
    const midBed = 0.5 + Math.sin(time * 0.57 + 2.1) * 0.5;
    const shimmer = 0.5 + Math.sin(time * 1.18 + 4.2) * 0.5;
    const bed = slowBed * 0.36 + midBed * 0.28 + shimmer * 0.16;

    // Keep a stable floor so motion never idles out, but avoid any rhythmic beat transients.
    return THREE.MathUtils.clamp(0.54 + bed, 0, 1);
  }

  private sampleXboxHue(progress: number): number {
    const size = this.xboxHueStops.length;
    const wrapped = ((progress % 1) + 1) % 1;
    const scaled = wrapped * size;
    const startIndex = Math.floor(scaled) % size;
    const endIndex = (startIndex + 1) % size;
    const blend = scaled - Math.floor(scaled);
    return THREE.MathUtils.lerp(this.xboxHueStops[startIndex], this.xboxHueStops[endIndex], blend);
  }

  private createBlobTexture(): THREE.Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return new THREE.Texture();
    }

    const bg = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
    bg.addColorStop(0, 'rgba(255, 170, 235, 0.12)');
    bg.addColorStop(0.3, 'rgba(170, 120, 255, 0.16)');
    bg.addColorStop(1, 'rgba(90, 40, 160, 0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const tintPalette = [
      'rgba(255, 96, 200, 0.22)',
      'rgba(168, 112, 255, 0.2)',
      'rgba(84, 216, 232, 0.2)',
      'rgba(255, 160, 220, 0.16)',
      'rgba(110, 138, 255, 0.16)'
    ];

    for (let i = 0; i < 8; i += 1) {
      const ox = size * (0.24 + Math.random() * 0.52);
      const oy = size * (0.24 + Math.random() * 0.52);
      const r0 = size * (0.04 + Math.random() * 0.08);
      const r1 = size * (0.2 + Math.random() * 0.3);
      const puff = ctx.createRadialGradient(ox, oy, r0, ox, oy, r1);
      puff.addColorStop(0, tintPalette[i % tintPalette.length]);
      puff.addColorStop(0.45, 'rgba(196, 126, 255, 0.12)');
      puff.addColorStop(1, 'rgba(120, 60, 200, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = puff;
      ctx.fillRect(0, 0, size, size);
    }

    const coreBreakup = ctx.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size * 0.22);
    coreBreakup.addColorStop(0, 'rgba(0, 0, 0, 0)');
    coreBreakup.addColorStop(0.55, 'rgba(60, 18, 96, 0.12)');
    coreBreakup.addColorStop(1, 'rgba(60, 18, 96, 0)');
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = coreBreakup;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  private createCoreTexture(): THREE.Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return new THREE.Texture();
    }

    const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    glow.addColorStop(0.22, 'rgba(255, 222, 248, 0.42)');
    glow.addColorStop(0.55, 'rgba(198, 122, 255, 0.14)');
    glow.addColorStop(1, 'rgba(120, 50, 200, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  private createBeamTexture(): THREE.Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return new THREE.Texture();
    }

    const center = size / 2;
    const beamCount = 14;
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < beamCount; i += 1) {
      const angle = (i / beamCount) * Math.PI * 2 + Math.random() * 0.14;
      const length = center * (0.55 + Math.random() * 0.42);
      const tipX = center + Math.cos(angle) * length;
      const tipY = center + Math.sin(angle) * length;
      const beam = ctx.createLinearGradient(center, center, tipX, tipY);
      beam.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
      beam.addColorStop(0.35, 'rgba(255, 220, 250, 0.2)');
      beam.addColorStop(1, 'rgba(255, 220, 250, 0)');
      ctx.strokeStyle = beam;
      ctx.lineWidth = 1.5 + Math.random() * 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  private readonly handleResize = (): void => {
    if (!this.renderer || !this.camera) {
      return;
    }

    const canvas = this.canvasRef.nativeElement;
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 1;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.setSize(width, height, false);

    // Feedback buffers run at reduced resolution — the softness reads as glow.
    const bufferSize = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(bufferSize);
    const rtWidth = Math.max(2, Math.floor(bufferSize.x * 0.7));
    const rtHeight = Math.max(2, Math.floor(bufferSize.y * 0.7));
    this.rtRead?.setSize(rtWidth, rtHeight);
    this.rtWrite?.setSize(rtWidth, rtHeight);
    this.feedbackMaterial?.uniforms['uAspect'].value.set(width / height, 1);
  };
}
