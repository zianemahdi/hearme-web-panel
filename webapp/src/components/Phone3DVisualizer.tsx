import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Device } from '../types';
import { 
  RotateCw, 
  Smartphone, 
  Zap, 
  Volume2, 
  ShieldAlert, 
  Lock, 
  Camera, 
  Eye, 
  Sparkles,
  Compass,
  Layers,
  Radio,
  Sliders,
  Maximize2
} from 'lucide-react';

interface Phone3DVisualizerProps {
  device: Device;
  theme?: 'dark' | 'light';
  onToggleAlarm?: () => void;
  onToggleLock?: () => void;
  onTriggerPhoto?: () => void;
}

type ViewPreset = 'front' | 'back' | 'side' | 'isometric' | 'top';

export const Phone3DVisualizer: React.FC<Phone3DVisualizerProps> = ({
  device,
  theme = 'dark',
  onToggleAlarm,
  onToggleLock,
  onTriggerPhoto
}) => {
  const isDark = theme === 'dark';
  const mountRef = useRef<HTMLDivElement>(null);
  
  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const phoneGroupRef = useRef<THREE.Group | null>(null);
  const screenMeshRef = useRef<THREE.Mesh | null>(null);
  const flashLightRef = useRef<THREE.PointLight | null>(null);
  const flashMeshRef = useRef<THREE.Mesh | null>(null);
  const shockwaveGroupRef = useRef<THREE.Group | null>(null);

  // States
  const [autoRotate, setAutoRotate] = useState(true);
  const [activePreset, setActivePreset] = useState<ViewPreset>('isometric');
  const [isFlashStrobe, setIsFlashStrobe] = useState(false);
  const [xrayMode, setXrayMode] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [rotationEuler, setRotationEuler] = useState({ x: 0.2, y: -0.4, z: 0 });

  const isAlarmActive = device.is_alarm_active;
  const isLocked = device.is_locked;

  // Render 2D Canvas onto Dynamic Screen Texture
  const updateScreenTexture = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background gradient
    if (isAlarmActive) {
      const grad = ctx.createLinearGradient(0, 0, 0, 1024);
      grad.addColorStop(0, '#881337');
      grad.addColorStop(0.5, '#4c0519');
      grad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 1024);

      // Warning Strobe Lines
      ctx.fillStyle = 'rgba(244, 63, 94, 0.25)';
      for (let y = 0; y < 1024; y += 40) {
        ctx.fillRect(0, y, 512, 15);
      }

      // Strobe Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚨 ALERTE ANTIVOL', 256, 220);

      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('SIRÈNE 105 dB ACTIVE', 256, 270);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '18px monospace';
      ctx.fillText('LOCALISATION GPS ÉMISE', 256, 320);

      // Lock Icon placeholder
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(256, 440, 50, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('🔒 VÉROUILLÉ', 256, 540);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '16px sans-serif';
      ctx.fillText('HearMe Security System v2.5', 256, 880);
      ctx.fillText('Propriétaire prévenu en direct', 256, 915);
    } else if (isLocked) {
      // Locked state
      const grad = ctx.createLinearGradient(0, 0, 0, 1024);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.6, '#1e1b4b');
      grad.addColorStop(1, '#09090b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 1024);

      // Lock Header
      ctx.fillStyle = '#a855f7';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔒', 256, 200);

      // Time
      const now = new Date();
      const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px sans-serif';
      ctx.fillText(timeStr, 256, 300);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px sans-serif';
      ctx.fillText(now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), 256, 345);

      // Message
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('Appareil Protégé par HearMe', 256, 460);

      // Keypad Dots
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(166 + i * 60, 540, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#a855f7';
      ctx.font = '16px monospace';
      ctx.fillText('Code PIN requis pour déverrouiller', 256, 610);

      // Emergency Contact Note
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('Appel d\'urgence disponible', 256, 880);
    } else {
      // Normal Protected Home Screen
      const grad = ctx.createLinearGradient(0, 0, 512, 1024);
      grad.addColorStop(0, '#180e29');
      grad.addColorStop(0.4, '#2e1065');
      grad.addColorStop(0.8, '#4c1d95');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 1024);

      // Cyber glow orb
      const orbGrad = ctx.createRadialGradient(256, 380, 10, 256, 380, 200);
      orbGrad.addColorStop(0, 'rgba(192, 132, 252, 0.4)');
      orbGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = orbGrad;
      ctx.fillRect(0, 0, 512, 800);

      // HearMe Shield Emblem
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 54px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️', 256, 260);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('HearMe Shield', 256, 330);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('● PROTECTION ACTIVE', 256, 375);

      // Status Widgets on Screen
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.roundRect(56, 440, 400, 100, 16);
      ctx.fill();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Batterie : ' + device.battery_level + '%', 80, 480);
      ctx.fillText('Réseau : ' + device.network_type.toUpperCase(), 80, 515);

      ctx.textAlign = 'right';
      ctx.fillText('Radar GPS : ACTIF', 432, 480);
      ctx.fillText('Mot-clé : EN VEILLE', 432, 515);

      // Sound Wave bars
      ctx.fillStyle = '#c084fc';
      for (let i = 0; i < 18; i++) {
        const height = 15 + Math.sin(i * 0.8) * 12;
        ctx.fillRect(110 + i * 16, 620 - height / 2, 8, height);
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Écoute acoustique de secours prête', 256, 670);

      // Bottom Bar
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(196, 980, 120, 6);
    }

    // Top Notch / Dynamic Island Bar
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(176, 24, 160, 30, 15);
    ctx.fill();

    // Camera Lens & Sensor in notch
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.arc(230, 39, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(280, 39, 4, 0, Math.PI * 2); // Privacy Green indicator
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, [device.battery_level, device.network_type, isAlarmActive, isLocked]);

  // Update screen material whenever state changes
  useEffect(() => {
    if (!screenMeshRef.current) return;
    const newTexture = updateScreenTexture();
    if (newTexture) {
      if (Array.isArray(screenMeshRef.current.material)) {
        screenMeshRef.current.material[4] = new THREE.MeshStandardMaterial({
          map: newTexture,
          roughness: 0.1,
          metalness: 0.1,
          emissive: isAlarmActive ? new THREE.Color(0x330005) : new THREE.Color(0x050510),
          emissiveIntensity: 0.5
        });
      } else {
        (screenMeshRef.current.material as THREE.MeshStandardMaterial).map = newTexture;
        (screenMeshRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
      }
    }
  }, [updateScreenTexture, isAlarmActive, isLocked]);

  // Main Three.js Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 6.2);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xa855f7, 2.5);
    dirLight1.position.set(5, 8, 6);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x06b6d4, 1.8);
    dirLight2.position.set(-5, -4, 4);
    scene.add(dirLight2);

    const rimLight = new THREE.DirectionalLight(0xffffff, 1.5);
    rimLight.position.set(0, 5, -8);
    scene.add(rimLight);

    // Strobe Flash Light for Alarm
    const flashLight = new THREE.PointLight(0xffffff, 0, 10);
    flashLight.position.set(0.65, 1.3, -0.2);
    scene.add(flashLight);
    flashLightRef.current = flashLight;

    // --- Build 3D Smartphone Geometry ---
    const phoneGroup = new THREE.Group();
    phoneGroupRef.current = phoneGroup;
    scene.add(phoneGroup);

    // Dimensions
    const phoneW = 2.1;
    const phoneH = 4.2;
    const phoneD = 0.22;
    const cornerRadius = 0.28;

    // Chassis (Unibody Titanium/Aluminum frame)
    const shape = new THREE.Shape();
    const x = -phoneW / 2;
    const y = -phoneH / 2;
    const w = phoneW;
    const h = phoneH;
    const r = cornerRadius;

    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);

    const extrudeSettings = {
      depth: phoneD,
      bevelEnabled: true,
      bevelSegments: 6,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04
    };

    const chassisGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    chassisGeometry.center();

    // Chassis Materials
    const chassisMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x1f1f2e : 0x475569,
      metalness: 0.9,
      roughness: 0.25,
      wireframe: xrayMode
    });

    const chassisMesh = new THREE.Mesh(chassisGeometry, chassisMat);
    phoneGroup.add(chassisMesh);

    // Screen Plane (Front)
    const screenGeo = new THREE.PlaneGeometry(phoneW - 0.12, phoneH - 0.14);
    const screenTexture = updateScreenTexture();
    const screenMat = new THREE.MeshStandardMaterial({
      map: screenTexture,
      roughness: 0.15,
      metalness: 0.1,
      wireframe: xrayMode
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0, (phoneD / 2) + 0.042);
    phoneGroup.add(screenMesh);
    screenMeshRef.current = screenMesh;

    // Glass Screen Protector Bezel
    const screenBezelGeo = new THREE.PlaneGeometry(phoneW - 0.08, phoneH - 0.1);
    const screenGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      roughness: 0.05,
      transmission: 0.9,
      thickness: 0.1
    });
    const screenGlass = new THREE.Mesh(screenBezelGeo, screenGlassMat);
    screenGlass.position.set(0, 0, (phoneD / 2) + 0.046);
    phoneGroup.add(screenGlass);

    // Rear Camera Island (Back)
    const cameraIslandShape = new THREE.Shape();
    const ciW = 0.9;
    const ciH = 0.9;
    const ciR = 0.2;
    const ciX = -ciW / 2;
    const ciY = -ciH / 2;

    cameraIslandShape.moveTo(ciX + ciR, ciY);
    cameraIslandShape.lineTo(ciX + ciW - ciR, ciY);
    cameraIslandShape.quadraticCurveTo(ciX + ciW, ciY, ciX + ciW, ciY + ciR);
    cameraIslandShape.lineTo(ciX + ciW, ciY + ciH - ciR);
    cameraIslandShape.quadraticCurveTo(ciX + ciW, ciY + ciH, ciX + ciW - ciR, ciY + ciH);
    cameraIslandShape.lineTo(ciX + ciR, ciY + ciH);
    cameraIslandShape.quadraticCurveTo(ciX, ciY + ciH, ciX, ciY + ciH - ciR);
    cameraIslandShape.lineTo(ciX, ciY + ciR);
    cameraIslandShape.quadraticCurveTo(ciX, ciY, ciX + ciR, ciY);

    const islandExtrude = {
      depth: 0.08,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 0.02,
      bevelThickness: 0.02
    };

    const islandGeo = new THREE.ExtrudeGeometry(cameraIslandShape, islandExtrude);
    islandGeo.center();
    const islandMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x12121f : 0x334155,
      metalness: 0.95,
      roughness: 0.2
    });
    const islandMesh = new THREE.Mesh(islandGeo, islandMat);
    islandMesh.position.set(0.48, 1.45, -(phoneD / 2) - 0.08);
    phoneGroup.add(islandMesh);

    // 3 Camera Lenses on Island
    const lensPositions = [
      { x: 0.32, y: 1.62 },
      { x: 0.32, y: 1.28 },
      { x: 0.65, y: 1.45 }
    ];

    lensPositions.forEach((pos) => {
      // Outer ring
      const ringGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 24);
      ringGeo.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.1 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(pos.x, pos.y, -(phoneD / 2) - 0.14);
      phoneGroup.add(ringMesh);

      // Inner Lens Glass
      const lensGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.065, 24);
      lensGeo.rotateX(Math.PI / 2);
      const lensMat = new THREE.MeshPhysicalMaterial({
        color: 0x0f172a,
        emissive: 0x1e1b4b,
        emissiveIntensity: 0.4,
        roughness: 0.05,
        metalness: 0.95,
        clearcoat: 1
      });
      const lensMesh = new THREE.Mesh(lensGeo, lensMat);
      lensMesh.position.set(pos.x, pos.y, -(phoneD / 2) - 0.145);
      phoneGroup.add(lensMesh);
    });

    // Flash LED on Island
    const flashGeo = new THREE.CircleGeometry(0.06, 16);
    const flashMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xffffff,
      emissiveIntensity: isAlarmActive || isFlashStrobe ? 2.5 : 0.2
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.rotation.y = Math.PI;
    flashMesh.position.set(0.65, 1.72, -(phoneD / 2) - 0.13);
    phoneGroup.add(flashMesh);
    flashMeshRef.current = flashMesh;

    // Physical buttons on the sides
    // Power Button (Right)
    const pwrBtnGeo = new THREE.BoxGeometry(0.04, 0.5, 0.08);
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });
    const pwrBtn = new THREE.Mesh(pwrBtnGeo, btnMat);
    pwrBtn.position.set((phoneW / 2) + 0.04, 0.5, 0);
    phoneGroup.add(pwrBtn);

    // Volume Up / Down (Left)
    const volUp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.08), btnMat);
    volUp.position.set(-(phoneW / 2) - 0.04, 0.8, 0);
    phoneGroup.add(volUp);

    const volDown = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.08), btnMat);
    volDown.position.set(-(phoneW / 2) - 0.04, 0.35, 0);
    phoneGroup.add(volDown);

    // Speaker Holes (Bottom)
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const spkGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8);
      const spkMesh = new THREE.Mesh(spkGeo, new THREE.MeshBasicMaterial({ color: 0x09090b }));
      spkMesh.position.set(i * 0.12, -(phoneH / 2) - 0.03, 0);
      phoneGroup.add(spkMesh);
    }

    // USB-C Port (Bottom center)
    const usbGeo = new THREE.BoxGeometry(0.24, 0.04, 0.08);
    const usbMesh = new THREE.Mesh(usbGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    usbMesh.position.set(0, -(phoneH / 2) - 0.03, 0);
    phoneGroup.add(usbMesh);

    // Holographic Sound Shockwave Rings for Alarm
    const shockwaveGroup = new THREE.Group();
    shockwaveGroupRef.current = shockwaveGroup;
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.RingGeometry(2.4 + i * 0.6, 2.48 + i * 0.6, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      shockwaveGroup.add(ring);
    }
    phoneGroup.add(shockwaveGroup);

    // Initial positioning
    phoneGroup.rotation.x = rotationEuler.x;
    phoneGroup.rotation.y = rotationEuler.y;

    // --- Animation Loop ---
    let frameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Auto rotation orbit if enabled
      if (autoRotate && !isDragging) {
        phoneGroup.rotation.y += 0.008;
      }

      // Alarm Strobe Flash & Shockwave Pulses
      if (isAlarmActive || isFlashStrobe) {
        const strobe = Math.sin(elapsedTime * 20) > 0 ? 1 : 0;
        if (flashLightRef.current) flashLightRef.current.intensity = strobe * 4;
        if (flashMeshRef.current) {
          (flashMeshRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = strobe * 5;
        }

        // Pulse shockwave rings
        if (shockwaveGroupRef.current) {
          shockwaveGroupRef.current.children.forEach((child, index) => {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshBasicMaterial;
            const waveScale = 1 + ((elapsedTime * 2 + index * 0.5) % 2) * 0.6;
            mesh.scale.set(waveScale, waveScale, waveScale);
            mat.opacity = Math.max(0, 0.7 - ((waveScale - 1) / 1.2));
          });
        }
      } else {
        if (flashLightRef.current) flashLightRef.current.intensity = 0;
        if (flashMeshRef.current) {
          (flashMeshRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
        }
        if (shockwaveGroupRef.current) {
          shockwaveGroupRef.current.children.forEach((child) => {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshBasicMaterial;
            mat.opacity = 0;
          });
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Handle Resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [isDark, xrayMode]);

  // Pointer Interaction Handling (360 Rotation on Drag)
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setAutoRotate(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !phoneGroupRef.current) return;
    const deltaX = e.movementX || 0;
    const deltaY = e.movementY || 0;

    phoneGroupRef.current.rotation.y += deltaX * 0.01;
    phoneGroupRef.current.rotation.x += deltaY * 0.01;
    setRotationEuler({
      x: phoneGroupRef.current.rotation.x,
      y: phoneGroupRef.current.rotation.y,
      z: phoneGroupRef.current.rotation.z
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // View Presets
  const applyPreset = (preset: ViewPreset) => {
    setActivePreset(preset);
    setAutoRotate(false);
    if (!phoneGroupRef.current) return;

    const rotMap: Record<ViewPreset, { x: number; y: number; z: number }> = {
      front: { x: 0, y: 0, z: 0 },
      back: { x: 0, y: Math.PI, z: 0 },
      side: { x: 0, y: Math.PI / 2, z: 0 },
      isometric: { x: 0.25, y: -0.45, z: 0 },
      top: { x: Math.PI / 2.5, y: 0, z: 0 }
    };

    const target = rotMap[preset];
    phoneGroupRef.current.rotation.x = target.x;
    phoneGroupRef.current.rotation.y = target.y;
    phoneGroupRef.current.rotation.z = target.z;
    setRotationEuler(target);
  };

  return (
    <div
      id="bento-phone-3d-visualizer"
      className={`hm-card-interactive rounded-2xl p-4 sm:p-5 relative flex flex-col justify-between overflow-hidden transition-all duration-300 ${
        isAlarmActive ? 'hm-phone-3d-glow-alarm border-rose-500/80' : 'hm-phone-3d-glow'
      }`}
    >
      {/* Background Ambience */}
      <div className={`hm-bento-glow w-64 h-64 ${isAlarmActive ? 'bg-rose-600' : 'bg-purple-600'} -top-20 -right-20`} />

      {/* Top Header & Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-400">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              Jumeau Numérique 3D
            </h3>
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Rendu interactif en temps réel de l'état physique
            </span>
          </div>
        </div>

        {/* View Angle Presets */}
        <div className={`flex items-center gap-1 p-1 rounded-xl border text-[11px] shadow-inner ${
          isDark ? 'bg-black/50 border-white/[0.08]' : 'bg-slate-100 border-slate-200'
        }`}>
          <button
            onClick={() => applyPreset('front')}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              activePreset === 'front' ? 'bg-purple-600/30 text-purple-200 font-bold border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
            title="Vue Écran"
          >
            Écran
          </button>
          <button
            onClick={() => applyPreset('back')}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              activePreset === 'back' ? 'bg-purple-600/30 text-purple-200 font-bold border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
            title="Vue Caméras Arrière"
          >
            Caméras
          </button>
          <button
            onClick={() => applyPreset('isometric')}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              activePreset === 'isometric' ? 'bg-purple-600/30 text-purple-200 font-bold border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
            title="Vue Isométrique 3D"
          >
            3D
          </button>
          <button
            onClick={() => applyPreset('side')}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              activePreset === 'side' ? 'bg-purple-600/30 text-purple-200 font-bold border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }`}
            title="Vue Tranche Profil"
          >
            Tranche
          </button>
        </div>
      </div>

      {/* 3D Canvas Stage */}
      <div
        className="relative w-full h-[280px] sm:h-[320px] my-2 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing select-none flex items-center justify-center"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div ref={mountRef} className="w-full h-full" />

        {/* Live Status Pill Overlay */}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none">
          {isAlarmActive ? (
            <div className="px-2.5 py-1 rounded-xl bg-rose-500/30 backdrop-blur-md border border-rose-500/50 text-rose-200 text-[10px] font-bold flex items-center gap-1.5 animate-pulse shadow-lg">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>FLASH & SIRÈNE ACTIFS</span>
            </div>
          ) : isLocked ? (
            <div className="px-2.5 py-1 rounded-xl bg-amber-500/30 backdrop-blur-md border border-amber-500/50 text-amber-200 text-[10px] font-bold flex items-center gap-1.5 shadow-lg">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>ÉCRAN VERROUILLÉ</span>
            </div>
          ) : (
            <div className="px-2.5 py-1 rounded-xl bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1.5 shadow-lg">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>HEARME VIGILANT</span>
            </div>
          )}

          <div className="px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-slate-300 font-mono text-[9px]">
            Modèle : {device.name}
          </div>
        </div>

        {/* Rotate Indicator Prompt */}
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-slate-300 text-[10px]">
          <RotateCw className={`w-3 h-3 text-purple-400 ${autoRotate ? 'animate-spin' : ''}`} />
          <span>Glisser pour pivoter à 360°</span>
        </div>
      </div>

      {/* Interactive Quick-Test Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.08] z-10">
        <div className="flex items-center gap-1.5">
          {/* Toggle Auto Rotation */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition active:scale-95 ${
              autoRotate
                ? 'bg-purple-600/30 border-purple-500/40 text-purple-200 font-bold'
                : isDark ? 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}
            title="Activer/Désactiver la rotation 360 continue"
          >
            <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'text-purple-400' : ''}`} />
            <span>{autoRotate ? 'Orbite ON' : 'Orbite OFF'}</span>
          </button>

          {/* Flash Strobe Test */}
          <button
            onClick={() => setIsFlashStrobe(!isFlashStrobe)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition active:scale-95 ${
              isFlashStrobe
                ? 'bg-amber-500/30 border-amber-500/50 text-amber-200 font-bold animate-pulse'
                : isDark ? 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}
            title="Tester le flash stroboscopique arrière"
          >
            <Zap className={`w-3.5 h-3.5 ${isFlashStrobe ? 'text-amber-400' : ''}`} />
            <span>Flash LED</span>
          </button>

          {/* X-Ray Mode */}
          <button
            onClick={() => setXrayMode(!xrayMode)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition active:scale-95 ${
              xrayMode
                ? 'bg-cyan-500/30 border-cyan-500/50 text-cyan-200 font-bold'
                : isDark ? 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}
            title="Vue filaire / X-Ray des composants"
          >
            <Layers className={`w-3.5 h-3.5 ${xrayMode ? 'text-cyan-400' : ''}`} />
            <span>Rayon X</span>
          </button>
        </div>

        {/* Action Triggers */}
        <div className="flex items-center gap-1.5">
          {onToggleAlarm && (
            <button
              onClick={onToggleAlarm}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md ${
                isAlarmActive
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{isAlarmActive ? 'Stopper' : 'Sirène'}</span>
            </button>
          )}

          {onToggleLock && (
            <button
              onClick={onToggleLock}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isLocked ? 'Déverrouiller' : 'Verrouiller'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
