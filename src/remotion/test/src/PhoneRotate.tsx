import { ThreeCanvas } from "@remotion/three";
import { useThree, useLoader } from "@react-three/fiber";
import React, { useEffect, useMemo } from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TextureLoader } from "three";
import { RoundedBox } from "./RoundedBox";

// Real 3D volumetric phone (rounded body + depth), rotating back → front.
// Screen shows the mobile AI RA UI (image texture). Portrait phone, ~19.5:9.
const PHONE_W = 2.6;
const PHONE_H = 5.4;
const PHONE_THICK = 0.32;
const PHONE_RADIUS = 0.42;
const SCREEN_INSET = 0.14; // bezel

const PhoneModel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0, 0, 14);
    camera.near = 0.1;
    camera.far = 100;
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Screen texture (mobile AI RA UI rendered to PNG). Flip Y so it's upright
  // and use clean 0→1 UVs (via a plane), no repeat/offset hacks.
  const screenTex = useLoader(TextureLoader, staticFile("mobile-screen.png"));
  useMemo(() => {
    screenTex.flipY = true;
    screenTex.center.set(0.5, 0.5);
    screenTex.repeat.set(1, 1);
    screenTex.offset.set(0, 0);
    screenTex.needsUpdate = true;
  }, [screenTex]);

  // Rotation: start showing the BACK (rotateY = π so screen faces away),
  // rotate through to the FRONT (screen to camera at ~2π), continue a bit.
  // Back-facing at frame 0; front-facing around 60% through.
  const rotateY = interpolate(frame, [0, durationInFrames], [Math.PI, Math.PI * 2 + 0.5], {
    extrapolateRight: "clamp",
  });
  // gentle tilt for a 3D "product shot" feel
  const rotateX = interpolate(frame, [0, durationInFrames], [0.18, 0.05]);

  const SCREEN_W = PHONE_W - SCREEN_INSET * 2;
  const SCREEN_H = PHONE_H - SCREEN_INSET * 2;

  return (
    <group rotation={[rotateX, rotateY, 0]} scale={1}>
      {/* Phone body — real volume via RoundedBox depth. Centered by offsetting
          the RoundedBox (which is built from its corner) by half its size. */}
      <RoundedBox
        radius={PHONE_RADIUS}
        depth={PHONE_THICK}
        curveSegments={16}
        width={PHONE_W}
        height={PHONE_H}
        position={[-PHONE_W / 2, -PHONE_H / 2, -PHONE_THICK / 2]}
      >
        <meshStandardMaterial color={"#2a2e38"} metalness={0.6} roughness={0.4} />
      </RoundedBox>

      {/* Screen (front face, +Z) — plane with clean 0→1 UVs, centered. */}
      <mesh position={[0, 0, PHONE_THICK / 2 + 0.006]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={screenTex} toneMapped={false} />
      </mesh>

      {/* Back detail: camera bump (top-left of the back, −Z) */}
      <group position={[-PHONE_W / 2 + 0.6, PHONE_H / 2 - 0.75, -PHONE_THICK / 2 - 0.05]}>
        <mesh>
          <boxGeometry args={[0.95, 0.95, 0.1]} />
          <meshStandardMaterial color={"#15171d"} metalness={0.7} roughness={0.4} />
        </mesh>
        {[[-0.2, 0.2], [0.2, -0.2]].map(([x, y], i) => (
          <mesh key={i} position={[x, y, -0.06]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.08, 24]} />
            <meshStandardMaterial color={"#0a0b10"} metalness={0.9} roughness={0.2} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

export const PhoneRotate: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#0a1128" }}>
      <ThreeCanvas linear width={width} height={height}>
        <ambientLight intensity={1.8} color={0xffffff} />
        <pointLight position={[6, 8, 10]} intensity={2.2} />
        <pointLight position={[-8, -2, 8]} intensity={1.0} color={0x88aaff} />
        <directionalLight position={[0, 4, 10]} intensity={1.2} />
        <PhoneModel />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
