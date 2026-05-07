"use client";

import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";

type DottedSurfaceProps = Omit<React.ComponentProps<"div">, "ref">;

export function DottedSurface({ className, ...props }: DottedSurfaceProps) {
  const { theme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    points: THREE.Points;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const separation = 150;
    const amountX = 40;
    const amountY = 60;
    const isDark = theme !== "light";
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffffff, 2000, 10000);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      10000,
    );
    camera.position.set(0, 355, 1220);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(scene.fog.color, 0);

    container.appendChild(renderer.domElement);

    const positions: number[] = [];
    const colors: number[] = [];
    const geometry = new THREE.BufferGeometry();

    for (let ix = 0; ix < amountX; ix++) {
      for (let iy = 0; iy < amountY; iy++) {
        const x = ix * separation - (amountX * separation) / 2;
        const y = 0;
        const z = iy * separation - (amountY * separation) / 2;

        positions.push(x, y, z);

        if (isDark) {
          colors.push(0.78, 0.86, 1);
        } else {
          colors.push(0.02, 0.04, 0.08);
        }
      }
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 8,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let count = 0;
    let animationId = 0;

    const renderFrame = () => {
      const positionAttribute = geometry.attributes.position;
      const particlePositions = positionAttribute.array as Float32Array;

      let i = 0;
      for (let ix = 0; ix < amountX; ix++) {
        for (let iy = 0; iy < amountY; iy++) {
          const index = i * 3;

          particlePositions[index + 1] =
            Math.sin((ix + count) * 0.3) * 50 +
            Math.sin((iy + count) * 0.5) * 50;

          i++;
        }
      }

      positionAttribute.needsUpdate = true;
      renderer.render(scene, camera);
      count += 0.1;
    };

    const animate = () => {
      renderFrame();
      animationId = window.requestAnimationFrame(animate);
    };

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    if (prefersReducedMotion) {
      renderFrame();
    } else {
      animate();
    }

    sceneRef.current = {
      scene,
      camera,
      renderer,
      points,
    };

    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(animationId);

      scene.traverse((object) => {
        if (object instanceof THREE.Points) {
          object.geometry.dispose();

          if (Array.isArray(object.material)) {
            object.material.forEach((item) => item.dispose());
          } else {
            object.material.dispose();
          }
        }
      });

      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      sceneRef.current = null;
    };
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className={cn("pointer-events-none fixed inset-0 -z-1", className)}
      {...props}
    />
  );
}
