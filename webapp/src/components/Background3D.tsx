import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Background3DProps {
  theme: 'dark' | 'light';
  intensity?: number;
}

export const Background3D: React.FC<Background3DProps> = ({ theme, intensity = 1 }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 24;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Color definitions based on theme
    const isDark = theme === 'dark';
    const primaryColor = isDark ? 0xa855f7 : 0x7c3aed; // Purple / Violet
    const secondaryColor = isDark ? 0xec4899 : 0xdb2777; // Pink / Magenta
    const accentColor = isDark ? 0x38bdf8 : 0x0284c7; // Cyan / Blue (telemetry)
    const gridColor = isDark ? 0x312e81 : 0xc7d2fe; // Indigo grid

    // 1. Central Geolocation / Shield Holographic Globe
    const globeRadius = 7.5;
    const globeGeo = new THREE.IcosahedronGeometry(globeRadius, 2);
    const globeMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      wireframe: true,
      transparent: true,
      opacity: isDark ? 0.18 : 0.12,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    // Inner glowing core
    const innerGeo = new THREE.SphereGeometry(globeRadius * 0.85, 24, 24);
    const innerMat = new THREE.MeshBasicMaterial({
      color: secondaryColor,
      wireframe: true,
      transparent: true,
      opacity: isDark ? 0.08 : 0.05,
    });
    const innerGlobe = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerGlobe);

    // 2. Orbital Radar / Geolocation Scanning Rings
    const ringsGroup = new THREE.Group();
    const ringCount = 3;
    const rings: THREE.Line[] = [];

    for (let i = 0; i < ringCount; i++) {
      const ringRadius = globeRadius + 1.2 + i * 2.2;
      const ringGeo = new THREE.BufferGeometry();
      const points: THREE.Vector3[] = [];
      const segments = 64;

      for (let j = 0; j <= segments; j++) {
        const theta = (j / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * ringRadius, Math.sin(theta) * ringRadius, 0));
      }
      ringGeo.setFromPoints(points);

      const ringMat = new THREE.LineBasicMaterial({
        color: i === 1 ? secondaryColor : accentColor,
        transparent: true,
        opacity: isDark ? 0.25 - i * 0.05 : 0.2 - i * 0.04,
      });

      const ring = new THREE.Line(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 3 + (i * Math.PI) / 6;
      ring.rotation.y = (i * Math.PI) / 4;
      ringsGroup.add(ring);
      rings.push(ring);
    }
    scene.add(ringsGroup);

    // 3. Audio Sound Wave & GPS Constellation Particles ("HearMe" Concept)
    const particleCount = 180;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const scales = new Float32Array(particleCount);
    const colors = new Float32Array(particleCount * 3);

    const c1 = new THREE.Color(primaryColor);
    const c2 = new THREE.Color(secondaryColor);
    const c3 = new THREE.Color(accentColor);

    for (let i = 0; i < particleCount; i++) {
      // Create a floating cloud around the globe with audio-wave frequencies
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const dist = globeRadius + 1 + Math.random() * 12;

      positions[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = dist * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = dist * Math.cos(phi);

      scales[i] = Math.random() * 2 + 1;

      // Color variation
      const mixC = Math.random() > 0.6 ? c3 : Math.random() > 0.3 ? c1 : c2;
      colors[i * 3] = mixC.r;
      colors[i * 3 + 1] = mixC.g;
      colors[i * 3 + 2] = mixC.b;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle texture
    const particleMat = new THREE.PointsMaterial({
      size: isDark ? 0.35 : 0.28,
      vertexColors: true,
      transparent: true,
      opacity: isDark ? 0.75 : 0.55,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 4. Acoustic Audio Waveforms (Horizontal rings pulsing)
    const waveCount = 5;
    const waveRings: THREE.Mesh[] = [];
    const waveGeo = new THREE.RingGeometry(2, 2.1, 48);

    for (let i = 0; i < waveCount; i++) {
      const waveMat = new THREE.MeshBasicMaterial({
        color: primaryColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isDark ? 0.2 : 0.12,
      });
      const waveMesh = new THREE.Mesh(waveGeo, waveMat);
      waveMesh.rotation.x = Math.PI / 2;
      waveMesh.position.y = -6;
      waveMesh.scale.set(1 + i * 1.5, 1 + i * 1.5, 1);
      scene.add(waveMesh);
      waveRings.push(waveMesh);
    }

    // 5. Mouse Parallax Target
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX - window.innerWidth / 2) * 0.001;
      mouseY = (e.clientY - window.innerHeight / 2) * 0.001;
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });

    // Handle Resize
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth mouse follow
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;

      camera.position.x = targetX * 12;
      camera.position.y = -targetY * 12;
      camera.lookAt(scene.position);

      // Rotate Globe & Rings
      globe.rotation.y = elapsedTime * 0.12;
      globe.rotation.x = elapsedTime * 0.06;

      innerGlobe.rotation.y = -elapsedTime * 0.18;
      innerGlobe.rotation.z = elapsedTime * 0.09;

      // Animate rings
      rings.forEach((ring, idx) => {
        ring.rotation.z = elapsedTime * (0.15 + idx * 0.08);
      });

      // Animate audio wave expansion
      waveRings.forEach((wave, idx) => {
        const waveScale = ((elapsedTime * 0.8 + idx * 0.7) % 3.5) * 2.2 + 1;
        wave.scale.set(waveScale, waveScale, 1);
        const mat = wave.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, (isDark ? 0.25 : 0.15) * (1 - waveScale / 8));
      });

      // Subtle particle float
      particles.rotation.y = elapsedTime * 0.04;
      particles.rotation.x = Math.sin(elapsedTime * 0.05) * 0.1;

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      globeGeo.dispose();
      globeMat.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      waveGeo.dispose();
    };
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden transition-opacity duration-1000"
      style={{ opacity: intensity }}
      aria-hidden="true"
    />
  );
};
