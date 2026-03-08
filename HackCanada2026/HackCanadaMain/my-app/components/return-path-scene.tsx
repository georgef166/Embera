"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import type { ReturnArrow } from "@/lib/types";

interface ReturnPathSceneProps {
  arrows: ReturnArrow[];
}

export function ReturnPathScene({ arrows }: ReturnPathSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mountNode = mountRef.current;

    if (!mountNode) {
      return;
    }

    const width = mountNode.clientWidth || 480;
    const height = mountNode.clientHeight || 260;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#020617");

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 7, 13);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mountNode.innerHTML = "";
    mountNode.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight("#ffffff", 1.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight("#38bdf8", 1.8);
    directionalLight.position.set(5, 12, 7);
    scene.add(directionalLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 12, 12, 12),
      new THREE.MeshStandardMaterial({
        color: "#0f172a",
        metalness: 0.2,
        roughness: 0.95,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const pathMaterial = new THREE.LineBasicMaterial({ color: "#22d3ee" });
    const pathPoints = arrows.map(
      (arrow) => new THREE.Vector3(arrow.x, arrow.y + 0.01, arrow.z),
    );

    if (pathPoints.length > 1) {
      const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
      scene.add(new THREE.Line(pathGeometry, pathMaterial));
    }

    arrows.forEach((arrow) => {
      const origin = new THREE.Vector3(arrow.x, arrow.y, arrow.z);
      const direction = new THREE.Vector3(
        arrow.directionX,
        arrow.directionY,
        arrow.directionZ,
      ).normalize();
      const helper = new THREE.ArrowHelper(direction, origin, 1.8, 0xf97316, 0.6, 0.28);
      scene.add(helper);

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 16, 16),
        new THREE.MeshStandardMaterial({ color: "#38bdf8", emissive: "#0ea5e9" }),
      );
      marker.position.copy(origin);
      scene.add(marker);
    });

    let animationFrame = 0;
    let rotation = 0;

    const animate = () => {
      rotation += 0.0025;
      camera.position.x = Math.sin(rotation) * 1.8;
      camera.position.z = 13 - Math.cos(rotation) * 0.8;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      const newWidth = mountNode.clientWidth || width;
      const newHeight = mountNode.clientHeight || height;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(animationFrame);
      renderer.dispose();
      mountNode.innerHTML = "";
    };
  }, [arrows]);

  return <div ref={mountRef} className="h-[260px] w-full overflow-hidden rounded-[2rem]" />;
}
