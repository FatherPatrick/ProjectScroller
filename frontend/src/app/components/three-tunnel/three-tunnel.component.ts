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

type ParticleSeed = {
  laneOffset: number;
  radius: number;
  angle: number;
  phase: number;
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
      opacity: 0.92;
      filter: saturate(1.16) contrast(1.08);
      mix-blend-mode: screen;
    }
  `]
})
export class ThreeTunnelComponent implements AfterViewInit, OnDestroy {
  @Input() depth = 0;
  @Input() reducedMotion = false;

  @ViewChild('canvas', { static: true })
  private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly tempPoint = new THREE.Vector3();
  private readonly tempNextPoint = new THREE.Vector3();
  private readonly tempTangent = new THREE.Vector3();
  private readonly tempNormal = new THREE.Vector3();
  private readonly tempBinormal = new THREE.Vector3();

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private ringGroup?: THREE.Group;
  private prismGroup?: THREE.Group;
  private overlayGroup?: THREE.Group;
  private particleSystem?: THREE.Points;
  private particleSeeds: ParticleSeed[] = [];
  private ringMeshes: THREE.Mesh[] = [];
  private ringMaterials: THREE.MeshBasicMaterial[] = [];
  private prismMeshes: THREE.Mesh[] = [];
  private prismMaterials: THREE.MeshBasicMaterial[] = [];
  private overlayMeshes: THREE.Mesh[] = [];
  private overlayMaterials: THREE.MeshBasicMaterial[] = [];
  private particleMaterial?: THREE.PointsMaterial;
  private animationFrameId: number | null = null;
  private ringAlignX = 0;
  private ringAlignY = 0;
  private ringAlignVx = 0;
  private ringAlignVy = 0;

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

    this.ringMaterials.forEach(material => material.dispose());
    this.ringMeshes.forEach(mesh => mesh.geometry.dispose());
    this.prismMaterials.forEach(material => material.dispose());
    this.prismMeshes.forEach(mesh => mesh.geometry.dispose());
    this.overlayMaterials.forEach(material => material.dispose());
    this.overlayMeshes.forEach(mesh => mesh.geometry.dispose());
    this.particleSystem?.geometry.dispose();
    this.particleMaterial?.dispose();
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
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 6000);
    camera.position.set(0, 0, 220);

    const ringGroup = new THREE.Group();
    scene.add(ringGroup);

    const prismGroup = new THREE.Group();
    prismGroup.position.z = -460;
    scene.add(prismGroup);

    const overlayGroup = new THREE.Group();
    overlayGroup.position.z = -380;
    scene.add(overlayGroup);

    for (let index = 0; index < 36; index += 1) {
      const geometry = new THREE.TorusGeometry(42 + (index % 4) * 8, 2.6 + (index % 3) * 0.9, 20, 96);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(index / 36, 0.88, 0.62),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        wireframe: index % 4 === 0
      });
      const mesh = new THREE.Mesh(geometry, material);
      ringGroup.add(mesh);
      this.ringMeshes.push(mesh);
      this.ringMaterials.push(material);
    }

    for (let layer = 0; layer < 5; layer += 1) {
      const baseRadius = 86 + layer * 42;
      const depthOffset = -180 - layer * 320;
      const shardCount = 24 + layer * 10;

      for (let index = 0; index < shardCount; index += 1) {
        const geometry = new THREE.PlaneGeometry(32 + layer * 10, 180 + layer * 42);
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL((index / shardCount + layer * 0.16) % 1, 0.92, 0.64),
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(geometry, material);
        const angle = (index / shardCount) * Math.PI * 2;
        mesh.position.set(Math.cos(angle) * baseRadius, Math.sin(angle) * baseRadius, depthOffset);
        mesh.rotation.z = angle;
        mesh.rotation.y = Math.PI / 2;
        mesh.userData = {
          baseX: mesh.position.x,
          baseY: mesh.position.y,
          baseZ: depthOffset,
          baseAngle: angle
        };
        prismGroup.add(mesh);
        this.prismMeshes.push(mesh);
        this.prismMaterials.push(material);
      }
    }

    for (let layer = 0; layer < 7; layer += 1) {
      const geometry = new THREE.RingGeometry(34 + layer * 26, 92 + layer * 42, 8 + layer * 3, 1, 0, Math.PI * 2);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL((0.48 + layer * 0.09) % 1, 0.9, 0.68),
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        wireframe: layer % 3 === 0
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, 0, -80 - layer * 120);
      overlayGroup.add(mesh);
      this.overlayMeshes.push(mesh);
      this.overlayMaterials.push(material);
    }

    const particleCount = 280;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    this.particleSeeds = Array.from({ length: particleCount }, (_, index) => ({
      laneOffset: index / particleCount,
      radius: 16 + Math.random() * 42,
      angle: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2
    }));

    const particleMaterial = new THREE.PointsMaterial({
      color: new THREE.Color('#8cf8ff'),
      size: 3.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.ringGroup = ringGroup;
    this.prismGroup = prismGroup;
    this.overlayGroup = overlayGroup;
    this.particleSystem = particleSystem;
    this.particleMaterial = particleMaterial;
  }

  private readonly renderFrame = (timestamp: number): void => {
    if (!this.renderer || !this.scene || !this.camera || !this.particleSystem) {
      return;
    }

    const time = timestamp * 0.001;
    const motionFactor = this.reducedMotion ? 0.18 : 1;
    const zoomProgress = this.depth / 1000;
    const burst = this.reducedMotion ? 0.06 : this.getBurstValue(time);
    const ringTravel = time * 0.02 * motionFactor - zoomProgress * 1.65;
    const backgroundDrift = time * 0.006 * motionFactor;

    this.updateRings(time, ringTravel, burst, motionFactor);
    this.updatePrisms(time, burst, motionFactor, zoomProgress);
    this.updateOverlays(time, burst, motionFactor, zoomProgress);
    this.updateParticles(time, backgroundDrift, burst, motionFactor);

    this.camera.position.set(0, 0, 220);
    this.camera.rotation.z = Math.sin(time * 0.06 * motionFactor) * 0.01;
    this.camera.lookAt(0, 0, -900);

    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.renderFrame);
  };

  private updateRings(time: number, travel: number, burst: number, motionFactor: number): void {
    if (!this.ringGroup) {
      return;
    }

    const upVector = new THREE.Vector3(0, 1, 0);
    let closestRingX = 0;
    let closestRingY = 0;
    let closestRingZ = -Infinity;

    this.ringMeshes.forEach((mesh, index) => {
      const t = this.wrapUnit(travel + index / this.ringMeshes.length);
      this.getCurvePoint(t, time, burst, this.tempPoint);
      this.getCurvePoint(this.wrapUnit(t + 0.01), time, burst, this.tempNextPoint);

      this.tempTangent.copy(this.tempNextPoint).sub(this.tempPoint).normalize();
      this.tempNormal.crossVectors(this.tempTangent, upVector);

      if (this.tempNormal.lengthSq() < 0.0001) {
        this.tempNormal.set(1, 0, 0);
      } else {
        this.tempNormal.normalize();
      }

      this.tempBinormal.crossVectors(this.tempNormal, this.tempTangent).normalize();

      mesh.position.copy(this.tempPoint);

      if (this.tempPoint.z > closestRingZ) {
        closestRingZ = this.tempPoint.z;
        closestRingX = this.tempPoint.x;
        closestRingY = this.tempPoint.y;
      }

      mesh.quaternion.setFromUnitVectors(this.zAxis, this.tempTangent);
      mesh.rotateZ(time * (0.18 + index * 0.005) * motionFactor + index * 0.32);

      const scalePulse = 0.96 + Math.sin(time * 0.9 * motionFactor + index * 0.45) * 0.12 + burst * 0.36;
      mesh.scale.setScalar(scalePulse);

      const material = this.ringMaterials[index];
      material.color.setHSL((time * 0.04 + index * 0.052 + burst * 0.12) % 1, 0.92, 0.66);
      material.opacity = 0.18 + (1 - t) * 0.24 + burst * 0.18;
    });

    const desiredX = THREE.MathUtils.clamp(-closestRingX, -220, 220);
    const desiredY = THREE.MathUtils.clamp(-closestRingY, -180, 180);
    const stiffness = this.reducedMotion ? 0.016 : 0.028;
    const damping = this.reducedMotion ? 0.82 : 0.78;

    const accelX = (desiredX - this.ringAlignX) * stiffness;
    const accelY = (desiredY - this.ringAlignY) * stiffness;

    this.ringAlignVx = (this.ringAlignVx + accelX) * damping;
    this.ringAlignVy = (this.ringAlignVy + accelY) * damping;

    this.ringAlignX += this.ringAlignVx;
    this.ringAlignY += this.ringAlignVy;

    this.ringGroup.position.x = this.ringAlignX;
    this.ringGroup.position.y = this.ringAlignY;
  }

  private updateParticles(time: number, travel: number, burst: number, motionFactor: number): void {
    const geometry = this.particleSystem?.geometry;
    const positions = geometry?.getAttribute('position');

    if (!(positions instanceof THREE.BufferAttribute)) {
      return;
    }

    for (let index = 0; index < this.particleSeeds.length; index += 1) {
      const seed = this.particleSeeds[index];
      const t = this.wrapUnit(travel + seed.laneOffset);
      this.getCurvePoint(t, time, burst, this.tempPoint);
      this.getCurvePoint(this.wrapUnit(t + 0.008), time, burst, this.tempNextPoint);

      this.tempTangent.copy(this.tempNextPoint).sub(this.tempPoint).normalize();
      this.tempNormal.crossVectors(this.tempTangent, new THREE.Vector3(0, 1, 0));

      if (this.tempNormal.lengthSq() < 0.0001) {
        this.tempNormal.set(1, 0, 0);
      } else {
        this.tempNormal.normalize();
      }

      this.tempBinormal.crossVectors(this.tempNormal, this.tempTangent).normalize();

      const swirlAngle = seed.angle + time * (0.22 + (index % 9) * 0.015) * motionFactor + seed.phase;
      const orbitRadius = seed.radius + Math.sin(time * 1.6 * motionFactor + seed.phase) * (8 + burst * 26);
      const orbitX = Math.cos(swirlAngle) * orbitRadius;
      const orbitY = Math.sin(swirlAngle) * orbitRadius;

      this.tempPoint
        .addScaledVector(this.tempNormal, orbitX)
        .addScaledVector(this.tempBinormal, orbitY);

      positions.setXYZ(index, this.tempPoint.x, this.tempPoint.y, this.tempPoint.z);
    }

    positions.needsUpdate = true;

    if (this.particleMaterial) {
      this.particleMaterial.color.setHSL((time * 0.05 + burst * 0.12) % 1, 0.9, 0.72);
      this.particleMaterial.opacity = 0.42 + burst * 0.28;
      this.particleMaterial.size = 3.4 + burst * 3;
    }
  }

  private updatePrisms(time: number, burst: number, motionFactor: number, zoomProgress: number): void {
    if (!this.prismGroup) {
      return;
    }

    const zoomScale = 1 + zoomProgress * (this.reducedMotion ? 0.08 : 0.16);
    this.prismGroup.scale.setScalar(zoomScale);

    this.prismGroup.rotation.z = time * 0.14 * motionFactor + zoomProgress * 1.8;
    this.prismGroup.rotation.x = Math.sin(time * 0.21 * motionFactor) * 0.18 + burst * 0.22;
    this.prismGroup.rotation.y = Math.cos(time * 0.17 * motionFactor) * 0.16 - burst * 0.18;

    this.prismMeshes.forEach((mesh, index) => {
      const material = this.prismMaterials[index];
      const layerIndex = Math.floor(index / 34);
      const wave = Math.sin(time * (0.8 + layerIndex * 0.14) + index * 0.31);
      const flutter = Math.cos(time * 1.2 * motionFactor + index * 0.23);
      const radial = 1.15 + wave * 0.24 + burst * 0.55;
      const { baseX, baseY, baseZ, baseAngle } = mesh.userData as {
        baseX: number;
        baseY: number;
        baseZ: number;
        baseAngle: number;
      };

      mesh.position.x = baseX + Math.cos(time * 0.42 + index * 0.18) * (12 + burst * 28);
      mesh.position.y = baseY + Math.sin(time * 0.38 + index * 0.22) * (12 + burst * 28);
      mesh.position.z = baseZ + Math.sin(time * 0.6 + index * 0.12) * (24 + burst * 42);
      mesh.rotation.z = baseAngle + wave * 0.32;
      mesh.rotation.x = wave * 0.46 + burst * 0.58;
      mesh.rotation.y = Math.PI / 2 + flutter * 0.3;
      mesh.scale.set(1.35 + burst * 0.95, radial, 1);

      material.color.setHSL((time * 0.05 + index * 0.02 + burst * 0.11) % 1, 0.96, 0.68);
      material.opacity = 0.1 + Math.max(0, wave) * 0.14 + burst * 0.22;
    });
  }

  private updateOverlays(time: number, burst: number, motionFactor: number, zoomProgress: number): void {
    if (!this.overlayGroup) {
      return;
    }

    const zoomScale = 1 + zoomProgress * (this.reducedMotion ? 0.06 : 0.12);
    this.overlayGroup.scale.setScalar(zoomScale);

    this.overlayGroup.rotation.z = -time * 0.24 * motionFactor - zoomProgress * 2.8;
    this.overlayGroup.rotation.x = Math.sin(time * 0.18 * motionFactor) * 0.16;
    this.overlayGroup.rotation.y = Math.cos(time * 0.16 * motionFactor) * 0.16;

    this.overlayMeshes.forEach((mesh, index) => {
      const material = this.overlayMaterials[index];
      const pulse = Math.sin(time * (0.9 + index * 0.12) + index * 1.4);
      const spin = time * (0.24 + index * 0.05) * motionFactor;

      mesh.rotation.z = spin;
      mesh.position.z = -80 - index * 120 + Math.sin(time * 0.75 + index) * 34;
      mesh.scale.setScalar(1.2 + Math.max(0, pulse) * 0.28 + burst * 0.46);

      material.color.setHSL((0.56 + time * 0.04 + index * 0.12 + burst * 0.12) % 1, 0.96, 0.72);
      material.opacity = 0.12 + Math.max(0, pulse) * 0.12 + burst * 0.24;
    });
  }

  private getCurvePoint(t: number, time: number, burst: number, target: THREE.Vector3): THREE.Vector3 {
    const wrapped = (t + 1) % 1;
    const curveTime = this.reducedMotion ? time * 0.12 : time;
    const amplitude = 34 + burst * 58;
    const secondary = 12 + burst * 18;
    const x =
      Math.sin(wrapped * 9.5 + curveTime * 0.52) * amplitude +
      Math.sin(wrapped * 24 - curveTime * 0.26) * secondary;
    const y =
      Math.cos(wrapped * 8.2 - curveTime * 0.46) * (amplitude * 0.78) +
      Math.sin(wrapped * 18.4 + curveTime * 0.31) * (secondary * 0.9);
    const z = 180 - wrapped * 3200;

    return target.set(x, y, z);
  }

  private getBurstValue(time: number): number {
    const burstA = Math.max(0, Math.sin(time * 0.43 + 0.6));
    const burstB = Math.max(0, Math.sin(time * 0.27 + 2.1));
    const burstC = Math.max(0, Math.sin(time * 0.81 + 4.3));

    return Math.min(1, Math.pow(burstA, 9) * 1.1 + Math.pow(burstB, 7) * 0.8 + Math.pow(burstC, 11) * 0.65);
  }

  private wrapUnit(value: number): number {
    return ((value % 1) + 1) % 1;
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