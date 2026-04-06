import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  ViewChild
} from '@angular/core';
import * as THREE from 'three';

type VisualBlobSeed = {
  laneOffset: number;
  orbitRadius: number;
  orbitAspect: number;
  phaseA: number;
  phaseB: number;
  phaseC: number;
  speed: number;
  depth: number;
  chaos: number;
};

type SparkSeed = {
  laneOffset: number;
  radius: number;
  phase: number;
  speed: number;
  depth: number;
};

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
  private animationFrameId: number | null = null;
  private readonly xboxHueStops = [0.58, 0.52, 0.45, 0.31, 0.14, 0.02];

  constructor(private readonly ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.initializeScene();
    this.handleResize();

    window.addEventListener('resize', this.handleResize, { passive: true });

    this.ngZone.runOutsideAngular(() => {
      this.animationFrameId = requestAnimationFrame(this.renderFrame);
    });
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    window.removeEventListener('resize', this.handleResize);

    this.blobMaterials.forEach(material => material.dispose());
    this.blobTexture?.dispose();
    this.sparkSystem?.geometry.dispose();
    this.sparkMaterial?.dispose();
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
        color: new THREE.Color('#7fd8ff'),
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
      color: new THREE.Color('#8cf8ff'),
      size: 2.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const sparkSystem = new THREE.Points(sparkGeometry, sparkMaterial);
    scene.add(sparkSystem);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.blobGroup = blobGroup;
    this.sparkSystem = sparkSystem;
    this.sparkMaterial = sparkMaterial;
  }

  private readonly renderFrame = (timestamp: number): void => {
    if (!this.renderer || !this.scene || !this.camera || !this.sparkSystem) {
      return;
    }

    const time = timestamp * 0.001;
    const motionFactor = this.reducedMotion ? 0.26 : 1;
    const depthProgress = THREE.MathUtils.clamp(this.depth / 1000, 0, 1);
    const energy = this.getEnergy(time) * (this.reducedMotion ? 0.58 : 1);

    this.updateBlobs(time, energy, motionFactor * 1.5, depthProgress);
    this.updateSparks(time, energy, motionFactor * 1.35, depthProgress);

    this.camera.position.x = Math.sin(time * 0.055 * motionFactor) * 11;
    this.camera.position.y = Math.cos(time * 0.05 * motionFactor) * 8;
    this.camera.position.z = 280;
    this.camera.rotation.z = Math.sin(time * 0.04 * motionFactor) * 0.012;
    this.camera.lookAt(0, 0, -1020);

    this.renderer.render(this.scene, this.camera);
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
      const seed = this.blobSeeds[index];
      const flow = time * seed.speed * motionFactor;
      const chaosTime = time * (0.74 + seed.chaos * 1.45) * motionFactor;
      const chaosX = Math.sin(chaosTime + seed.phaseC) * (18 + energy * 18) + Math.cos(chaosTime * 1.32 + seed.phaseA) * 12;
      const chaosY = Math.cos(chaosTime * 0.54 + seed.phaseA) * (14 + energy * 14) + Math.sin(chaosTime * 1.15 + seed.phaseB) * 10;
      const tunnelLength = 2600;
      const lane = (time * (132 + seed.speed * 58) * motionFactor + seed.laneOffset * tunnelLength) % tunnelLength;

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

      blob.position.set(x, y, z);

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
        (0.065 +
        breathe * 0.04 +
        erratic * 0.03 +
        energy * 0.06) * nearFactor;
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
      const lane = (time * (92 + seed.speed * 28) * motionFactor + seed.laneOffset * 1900) % 1900;

      const x = Math.cos(flow) * orbit + Math.sin(flow * 0.68) * 24;
      const y = Math.sin(flow * 0.94) * orbit * 0.56 + Math.cos(flow * 0.42) * 16;
      const z = 220 - lane - seed.depth * 1260 + depthProgress * 120;

      positions.setXYZ(index, x, y, z);
    }

    positions.needsUpdate = true;

    if (this.sparkMaterial) {
      const hue = this.sampleXboxHue(0.22 + time * 0.17);
      this.sparkMaterial.color.setHSL(hue, 0.92, 0.58);
      this.sparkMaterial.opacity = 0.18 + energy * 0.16;
      this.sparkMaterial.size = 1.8 + energy * 1.9;
    }
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
    bg.addColorStop(0, 'rgba(120, 206, 255, 0.12)');
    bg.addColorStop(0.3, 'rgba(104, 148, 255, 0.18)');
    bg.addColorStop(1, 'rgba(24, 72, 162, 0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const tintPalette = [
      'rgba(84, 226, 255, 0.22)',
      'rgba(112, 255, 184, 0.2)',
      'rgba(110, 138, 255, 0.2)',
      'rgba(255, 178, 86, 0.16)',
      'rgba(255, 96, 180, 0.14)'
    ];

    for (let i = 0; i < 8; i += 1) {
      const ox = size * (0.24 + Math.random() * 0.52);
      const oy = size * (0.24 + Math.random() * 0.52);
      const r0 = size * (0.04 + Math.random() * 0.08);
      const r1 = size * (0.2 + Math.random() * 0.3);
      const puff = ctx.createRadialGradient(ox, oy, r0, ox, oy, r1);
      puff.addColorStop(0, tintPalette[i % tintPalette.length]);
      puff.addColorStop(0.45, 'rgba(116, 186, 255, 0.12)');
      puff.addColorStop(1, 'rgba(68, 122, 216, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = puff;
      ctx.fillRect(0, 0, size, size);
    }

    const coreBreakup = ctx.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size * 0.22);
    coreBreakup.addColorStop(0, 'rgba(0, 0, 0, 0)');
    coreBreakup.addColorStop(0.55, 'rgba(18, 42, 96, 0.12)');
    coreBreakup.addColorStop(1, 'rgba(18, 42, 96, 0)');
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
  };
}