"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useRef, useMemo, Suspense, Component, ReactNode, useState, useCallback, useEffect } from "react";
import * as THREE from "three";
import { useLanguage } from "@/contexts/LanguageContext";

/* ═══════ TYPES ═══════ */

interface AgentState {
  id?: string;   // agentId from discovery (e.g. "main", "handan")
  name: string;
  status: "active" | "idle" | "standby" | "sleeping";
  color: string;
  position: [number, number, number];
}

interface SubAgentState {
  label: string;
  task: string;
  parentAgent: string;
  status: "running" | "done" | "error";
}

interface ToolCategory {
  count: number;
  lastTs: string;
  tools: string[];
}

interface AgentSessionData {
  toolCategories: Record<string, ToolCategory>;
  recentTools: { name: string; ts: string; ageMs: number; category: string }[];
  connections: { from: string; to: string; type: string; ts: string }[];
  totalToolCalls: number;
}

interface LiveData {
  toolCategories: Record<string, ToolCategory>;
  recentTools: { name: string; ts: string; ageMs: number; category: string }[];
  connections: { from: string; to: string; type: string; ts: string }[];
  subAgents: SubAgentState[];
  // Multi-agent tool usage: keyed by agentId ("main", "handan", ...)
  agentToolUsage?: Record<string, AgentSessionData | null>;
}

interface DivanSceneProps {
  agents: AgentState[];
  onFocusChange?: (name: string | null) => void;
  onDoubleClick?: (type: "agent" | "tool", name: string) => void;
}

/* ═══════ TOOL STATIONS (space-themed) ═══════ */

const TOOL_STATIONS = [
  { id: "terminal", label: "Terminal", icon: "⌨", color: "#22c55e", position: [-5.5, 0.5, -3] as [number, number, number], kind: "satellite" as const },
  { id: "files", label: "Dosyalar", icon: "📁", color: "#3b82f6", position: [-4, -1.5, -4] as [number, number, number], kind: "datacube" as const },
  { id: "internet", label: "İnternet", icon: "🌐", color: "#a855f7", position: [4.5, -0.5, -4] as [number, number, number], kind: "portal" as const },
  { id: "memory", label: "Hafıza", icon: "🧠", color: "#f59e0b", position: [5.5, 1, -3] as [number, number, number], kind: "constellation" as const },
  { id: "agents", label: "Ajanlar", icon: "🤝", color: "#ec4899", position: [0, -2, -4.5] as [number, number, number], kind: "spacestation" as const },
  { id: "comms", label: "İletişim", icon: "💬", color: "#06b6d4", position: [-2.5, 2, -3.5] as [number, number, number], kind: "beacon" as const },
];

/* ═══════ SHARED FOCUS STATE (via ref) ═══════ */

interface FocusTarget {
  position: THREE.Vector3;
  name: string;
}

const focusRef = { current: null as FocusTarget | null, resetFlag: false };

/* ═══════ ERROR BOUNDARY ═══════ */

class WebGLErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.warn("[Divan] WebGL error:", error.message); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

/* ═══════ STAR FIELD ═══════ */

function StarField({ count = 1500 }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 20 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, [count]);

  useFrame((_s, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.002;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        {/* @ts-expect-error R3F typing */}
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.06} color="#ffffff" transparent opacity={0.6} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ═══════ GOLD DUST ═══════ */

function GoldDust({ count = 150 }) {
  const ref = useRef<THREE.Points>(null);
  const posRef = useRef(new Float32Array(count * 3));
  const velRef = useRef(new Float32Array(count * 3));

  useMemo(() => {
    for (let i = 0; i < count; i++) {
      posRef.current[i * 3] = (Math.random() - 0.5) * 24;
      posRef.current[i * 3 + 1] = (Math.random() - 0.5) * 10;
      posRef.current[i * 3 + 2] = (Math.random() - 0.5) * 14;
      velRef.current[i * 3] = (Math.random() - 0.5) * 0.003;
      velRef.current[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
      velRef.current[i * 3 + 2] = (Math.random() - 0.5) * 0.003;
    }
  }, [count]);

  useFrame(() => {
    if (!ref.current) return;
    const pos = posRef.current, vel = velRef.current;
    for (let i = 0; i < count; i++) {
      pos[i * 3] += vel[i * 3]; pos[i * 3 + 1] += vel[i * 3 + 1]; pos[i * 3 + 2] += vel[i * 3 + 2];
      if (Math.abs(pos[i * 3]) > 12) vel[i * 3] *= -1;
      if (Math.abs(pos[i * 3 + 1]) > 5) vel[i * 3 + 1] *= -1;
      if (Math.abs(pos[i * 3 + 2]) > 7) vel[i * 3 + 2] *= -1;
    }
    const attr = ref.current.geometry.getAttribute("position");
    if (attr) (attr as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        {/* @ts-expect-error R3F typing */}
        <bufferAttribute attach="attributes-position" count={count} array={posRef.current} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#d4a017" transparent opacity={0.35} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

/* ═══════ NEBULA ═══════ */

function Nebula() {
  const ref1 = useRef<THREE.Mesh>(null);
  const ref2 = useRef<THREE.Mesh>(null);
  useFrame((_s, delta) => {
    if (ref1.current) ref1.current.rotation.z += delta * 0.005;
    if (ref2.current) ref2.current.rotation.z -= delta * 0.004;
  });
  return (
    <group position={[0, 0, -8]}>
      <mesh ref={ref1}><planeGeometry args={[45, 25]} /><meshBasicMaterial color="#dc2626" transparent opacity={0.01} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} /></mesh>
      <mesh ref={ref2} position={[2, 0.5, -1]}><planeGeometry args={[38, 20]} /><meshBasicMaterial color="#7c3aed" transparent opacity={0.006} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

/* ═══════ CENTRAL HUB ═══════ */

function CentralHub() {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  useFrame((_s, delta) => {
    if (outerRef.current) { outerRef.current.rotation.y += delta * 0.1; outerRef.current.rotation.x = 0.3 + Math.sin(Date.now() * 0.00012) * 0.08; }
    if (innerRef.current) { innerRef.current.rotation.y -= delta * 0.07; innerRef.current.rotation.z += delta * 0.04; }
    if (coreRef.current) coreRef.current.scale.setScalar(1 + Math.sin(Date.now() * 0.0012) * 0.04);
  });
  return (
    <group position={[0, 0.2, -1.5]}>
      <mesh ref={coreRef}><sphereGeometry args={[0.06, 16, 16]} /><meshBasicMaterial color="#d4a017" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      <mesh ref={outerRef}><torusGeometry args={[1.8, 0.012, 16, 100]} /><meshBasicMaterial color="#d4a017" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      <mesh ref={innerRef}><torusGeometry args={[1.2, 0.008, 16, 80]} /><meshBasicMaterial color="#d4a017" transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
    </group>
  );
}

/* ═══════ TOOL STATION VARIANTS ═══════ */

/* Satellite: rotating dish + solar panels */
function SatelliteStation({ color, isActive, recentness }: { color: string; isActive: boolean; recentness: number }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_s, delta) => { if (groupRef.current) groupRef.current.rotation.y += delta * (isActive ? 1.2 : 0.3); });
  const emI = isActive ? 1.5 * recentness : 0.2;
  return (
    <group ref={groupRef}>
      {/* Dish */}
      <mesh rotation={[0.3, 0, 0]}>
        <coneGeometry args={[0.12, 0.06, 8, 1, true]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emI} roughness={0.3} metalness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* Body */}
      <mesh><cylinderGeometry args={[0.03, 0.03, 0.15, 6]} /><meshStandardMaterial color="#666" emissive={color} emissiveIntensity={emI * 0.3} roughness={0.4} metalness={0.8} /></mesh>
      {/* Solar panels */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.14, 0, 0]} rotation={[0, 0, side * 0.1]}>
          <boxGeometry args={[0.12, 0.005, 0.06]} />
          <meshStandardMaterial color="#1a3a5f" emissive={color} emissiveIntensity={emI * 0.5} roughness={0.2} metalness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* Data Cube: wireframe rotating cube with inner glow */
function DataCubeStation({ color, isActive, recentness }: { color: string; isActive: boolean; recentness: number }) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  useFrame((_s, delta) => {
    if (outerRef.current) { outerRef.current.rotation.x += delta * 0.4; outerRef.current.rotation.y += delta * 0.6; }
    if (innerRef.current) { innerRef.current.rotation.x -= delta * 0.8; innerRef.current.rotation.z += delta * 0.5; }
  });
  const emI = isActive ? 1.5 * recentness : 0.2;
  return (
    <group>
      <mesh ref={outerRef}>
        <boxGeometry args={[0.18, 0.18, 0.18]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emI} wireframe roughness={0.1} metalness={1} />
      </mesh>
      <mesh ref={innerRef}>
        <boxGeometry args={[0.09, 0.09, 0.09]} />
        <meshBasicMaterial color={color} transparent opacity={isActive ? 0.4 * recentness : 0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* Portal: torus ring with particles passing through */
function PortalStation({ color, isActive, recentness }: { color: string; isActive: boolean; recentness: number }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = 12;
  const posArray = useRef(new Float32Array(particleCount * 3));

  useFrame((_s, delta) => {
    if (ringRef.current) ringRef.current.rotation.z += delta * (isActive ? 2 : 0.5);
    if (ring2Ref.current) ring2Ref.current.rotation.z -= delta * 0.7;
    if (particlesRef.current && isActive) {
      const t = Date.now() * 0.003;
      for (let i = 0; i < particleCount; i++) {
        const p = ((t + i / particleCount) % 1);
        posArray.current[i * 3] = Math.cos(p * Math.PI * 2) * 0.1 * (1 - p);
        posArray.current[i * 3 + 1] = Math.sin(p * Math.PI * 2) * 0.1 * (1 - p);
        posArray.current[i * 3 + 2] = (p - 0.5) * 0.3;
      }
      const attr = particlesRef.current.geometry.getAttribute("position");
      if (attr) (attr as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  const emI = isActive ? 2 * recentness : 0.3;
  return (
    <group>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.13, 0.015, 8, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emI} roughness={0.1} metalness={0.95} />
      </mesh>
      <mesh ref={ring2Ref} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.1, 0.006, 8, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {isActive && (
        <points ref={particlesRef}>
          <bufferGeometry>{/* @ts-expect-error R3F typing */}
        <bufferAttribute attach="attributes-position" count={particleCount} array={posArray.current} itemSize={3} /></bufferGeometry>
          <pointsMaterial size={0.03} color={color} transparent opacity={0.6 * recentness} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
        </points>
      )}
      {/* Core glow */}
      <mesh>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={isActive ? 0.15 * recentness : 0.03} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* Constellation: cluster of small connected spheres (for Memory) */
function ConstellationStation({ color, isActive, recentness }: { color: string; isActive: boolean; recentness: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const nodes = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 7; i++) {
      pts.push([(Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.15]);
    }
    return pts;
  }, []);

  useFrame((_s, delta) => { if (groupRef.current) groupRef.current.rotation.y += delta * (isActive ? 0.8 : 0.2); });

  const emI = isActive ? 1.5 * recentness : 0.3;
  return (
    <group ref={groupRef}>
      {nodes.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emI} roughness={0.2} metalness={0.9} />
        </mesh>
      ))}
      {/* Connection lines between adjacent nodes */}
      {nodes.slice(0, -1).map((pos, i) => {
        const next = nodes[i + 1];
        const mid = new THREE.Vector3((pos[0] + next[0]) / 2, (pos[1] + next[1]) / 2, (pos[2] + next[2]) / 2);
        const dir = new THREE.Vector3(next[0] - pos[0], next[1] - pos[1], next[2] - pos[2]);
        const len = dir.length();
        dir.normalize();
        return (
          <mesh key={`l${i}`} position={mid} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)}>
            <cylinderGeometry args={[0.003, 0.003, len, 4]} />
            <meshBasicMaterial color={color} transparent opacity={isActive ? 0.5 * recentness : 0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

/* Space Station: connected modules (for Agents) */
function SpaceStationNode({ color, isActive, recentness }: { color: string; isActive: boolean; recentness: number }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_s, delta) => { if (groupRef.current) groupRef.current.rotation.y += delta * (isActive ? 0.6 : 0.15); });
  const emI = isActive ? 1.5 * recentness : 0.2;
  return (
    <group ref={groupRef}>
      {/* Central module */}
      <mesh><cylinderGeometry args={[0.05, 0.05, 0.12, 6]} /><meshStandardMaterial color="#555" emissive={color} emissiveIntensity={emI * 0.5} roughness={0.3} metalness={0.9} /></mesh>
      {/* Arms */}
      {[0, 1, 2, 3].map((i) => {
        const angle = (i / 4) * Math.PI * 2;
        return (
          <group key={i} rotation={[0, angle, 0]}>
            <mesh position={[0.1, 0, 0]}><boxGeometry args={[0.08, 0.015, 0.015]} /><meshStandardMaterial color="#444" emissive={color} emissiveIntensity={emI * 0.3} roughness={0.4} metalness={0.8} /></mesh>
            <mesh position={[0.15, 0, 0]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={emI} roughness={0.2} metalness={0.9} /></mesh>
          </group>
        );
      })}
    </group>
  );
}

/* Beacon: signal tower with expanding rings (for Comms) */
function BeaconStation({ color, isActive, recentness }: { color: string; isActive: boolean; recentness: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const t = Date.now() * 0.001;
    const rings = [ring1Ref, ring2Ref, ring3Ref];
    rings.forEach((r, i) => {
      if (!r.current) return;
      const phase = ((t * 0.5 + i * 0.33) % 1);
      const scale = 1 + phase * 2;
      r.current.scale.setScalar(scale);
      (r.current.material as THREE.MeshBasicMaterial).opacity = isActive ? (1 - phase) * 0.3 * recentness : (1 - phase) * 0.08;
    });
    if (groupRef.current) groupRef.current.rotation.y += 0.002;
  });

  const emI = isActive ? 2 * recentness : 0.3;
  return (
    <group ref={groupRef}>
      {/* Tower */}
      <mesh><coneGeometry args={[0.04, 0.2, 6]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={emI} roughness={0.2} metalness={0.9} /></mesh>
      {/* Tip light */}
      <mesh position={[0, 0.12, 0]}><sphereGeometry args={[0.02, 8, 8]} /><meshBasicMaterial color={color} transparent opacity={isActive ? 0.8 : 0.2} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      {/* Expanding signal rings */}
      {[ring1Ref, ring2Ref, ring3Ref].map((ref, i) => (
        <mesh key={i} ref={ref} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.08, 0.004, 4, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══════ TOOL STATION WRAPPER ═══════ */

function ToolStation({ station, activity, onClick, onDoubleClick }: { station: typeof TOOL_STATIONS[number]; activity: ToolCategory | null; onClick: () => void; onDoubleClick: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const isActive = activity && activity.count > 0;
  const recentness = activity ? Math.max(0, 1 - (Date.now() - new Date(activity.lastTs).getTime()) / (5 * 60 * 1000)) : 0;
  const [hovered, setHovered] = useState(false);
  const { t } = useLanguage();

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.y = station.position[1] + Math.sin(Date.now() * 0.0005 + station.position[0]) * 0.08;
    }
  });

  const StationComponent = {
    satellite: SatelliteStation,
    datacube: DataCubeStation,
    portal: PortalStation,
    constellation: ConstellationStation,
    spacestation: SpaceStationNode,
    beacon: BeaconStation,
  }[station.kind];

  return (
    <group ref={groupRef} position={station.position}>
      {/* Invisible click target */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "crosshair"; }}
        visible={false}
      >
        <sphereGeometry args={[0.35, 8, 8]} />
        <meshBasicMaterial />
      </mesh>

      {/* Glow sphere */}
      <mesh>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshBasicMaterial color={station.color} transparent opacity={hovered ? 0.1 : (isActive ? 0.04 * recentness : 0.015)} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      <StationComponent color={station.color} isActive={!!isActive} recentness={Math.max(recentness, 0.3)} />

      <Html position={[0, -0.3, 0]} center distanceFactor={5} style={{ pointerEvents: "none", userSelect: "none" }}>
        <div style={{ textAlign: "center", whiteSpace: "nowrap", transform: hovered ? "scale(1.2)" : "scale(1)", transition: "transform 0.2s" }}>
          <div style={{ fontSize: "11px", fontWeight: 500, color: hovered ? "#fff" : (isActive ? station.color : "#555"), textShadow: "0 0 6px rgba(0,0,0,0.95)", transition: "color 0.3s" }}>
            {station.icon} {t(`scene.tool.${station.id}`)}
            {isActive && <span style={{ fontSize: "9px", opacity: 0.7, marginLeft: "3px" }}>({activity!.count})</span>}
          </div>
        </div>
      </Html>
    </group>
  );
}

/* ═══════ ACTIVITY BEAM ═══════ */

function ActivityBeam({ from, to, color, intensity = 1 }: { from: [number, number, number]; to: [number, number, number]; color: string; intensity?: number }) {
  const particleCount = 14;
  const pRef = useRef<THREE.Points>(null);
  const posRef = useRef(new Float32Array(particleCount * 3));
  const lineRef = useRef<THREE.Line>(null);

  // Build a curved path (quadratic bezier arc)
  const curvePoints = useMemo(() => {
    const mid: [number, number, number] = [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2 + 0.5,
      (from[2] + to[2]) / 2,
    ];
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...from),
      new THREE.Vector3(...mid),
      new THREE.Vector3(...to),
    );
    return curve.getPoints(32);
  }, [from, to]);

  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    return geo;
  }, [curvePoints]);

  useFrame(() => {
    if (!pRef.current) return;
    const t = Date.now() * 0.0005;
    const pos = posRef.current;
    for (let i = 0; i < particleCount; i++) {
      const p = ((t + i / particleCount) % 1);
      const idx = Math.floor(p * (curvePoints.length - 1));
      const nextIdx = Math.min(idx + 1, curvePoints.length - 1);
      const frac = p * (curvePoints.length - 1) - idx;
      const pt = curvePoints[idx];
      const npt = curvePoints[nextIdx];
      pos[i * 3] = pt.x + (npt.x - pt.x) * frac;
      pos[i * 3 + 1] = pt.y + (npt.y - pt.y) * frac;
      pos[i * 3 + 2] = pt.z + (npt.z - pt.z) * frac;
    }
    const attr = pRef.current.geometry.getAttribute("position");
    if (attr) (attr as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <group>
      {/* Glowing line path */}
      {/* @ts-expect-error R3F line conflicts with SVG line */}
      <line ref={lineRef} geometry={lineGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.25 * intensity} blending={THREE.AdditiveBlending} depthWrite={false} />
      </line>
      {/* Traveling particles */}
      <points ref={pRef}>
        <bufferGeometry>
          {/* @ts-expect-error R3F typing */}
        <bufferAttribute attach="attributes-position" count={particleCount} array={posRef.current} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.08} color={color} transparent opacity={0.7 * intensity} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  );
}

/* ═══════ SUB-AGENT SATELLITE ═══════ */

function SubAgentSatellite({ sub, parentPos, index }: { sub: SubAgentState; parentPos: [number, number, number]; index: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const orbitRadius = 0.6;
  const orbitSpeed = 1.5 + index * 0.3;

  useFrame(() => {
    if (!meshRef.current) return;
    const t = Date.now() * 0.001 * orbitSpeed;
    const angle = t + (index * Math.PI * 2) / 3;
    meshRef.current.position.x = parentPos[0] + Math.cos(angle) * orbitRadius;
    meshRef.current.position.y = parentPos[1] + Math.sin(angle * 0.7) * 0.15;
    meshRef.current.position.z = parentPos[2] + Math.sin(angle) * orbitRadius * 0.5;
  });

  const color = sub.status === "running" ? "#22c55e" : sub.status === "done" ? "#3b82f6" : "#ef4444";
  return (
    <group>
      <mesh ref={meshRef} position={parentPos}>
        <sphereGeometry args={[0.06, 12, 12]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={sub.status === "running" ? 2 : 0.5} roughness={0.2} metalness={0.8} />
      </mesh>
      <mesh position={parentPos} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[orbitRadius, 0.003, 8, 48]} /><meshBasicMaterial color={color} transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
    </group>
  );
}

/* ═══════ AGENT ORB ═══════ */

function AgentOrb({ agent, subAgents, onHover, onClick, onDoubleClick }: { agent: AgentState; subAgents: SubAgentState[]; onHover: (name: string | null) => void; onClick: () => void; onDoubleClick: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { t } = useLanguage();

  const isActive = agent.status === "active";
  const isIdle = agent.status === "idle";
  const baseEmissive = isActive ? 1.5 : isIdle ? 0.8 : 0.3;

  const statusLabel = t(`scene.status.${agent.status}`);

  const handleOver = useCallback(() => { setHovered(true); onHover(agent.name); document.body.style.cursor = "pointer"; }, [agent.name, onHover]);
  const handleOut = useCallback(() => { setHovered(false); onHover(null); document.body.style.cursor = "crosshair"; }, [onHover]);

  useFrame((_s, delta) => {
    if (groupRef.current) groupRef.current.position.y = agent.position[1] + Math.sin(Date.now() * 0.0007 + agent.position[0] * 2) * 0.12;
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
      const s = hovered ? 1.3 : 1;
      meshRef.current.scale.lerp(new THREE.Vector3(s, s, s), 0.1);
    }
    if (glowRef.current) {
      const pulse = isActive ? (hovered ? 2 : 1.6) + Math.sin(Date.now() * 0.0025) * 0.2 : (hovered ? 1.4 : 1.2);
      glowRef.current.scale.setScalar(pulse);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = hovered ? 0.12 : (isActive ? 0.08 : 0.03);
    }
    if (ringRef.current) { ringRef.current.rotation.z += delta * (isActive ? 1.5 : 0.3); ringRef.current.rotation.x = Math.sin(Date.now() * 0.0005) * 0.2; }
  });

  return (
    <>
      <group ref={groupRef} position={agent.position}>
        <mesh
          onPointerOver={handleOver} onPointerOut={handleOut}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
          visible={false}
        >
          <sphereGeometry args={[0.5, 8, 8]} /><meshBasicMaterial />
        </mesh>
        <mesh ref={glowRef}><sphereGeometry args={[0.45, 16, 16]} /><meshBasicMaterial color={agent.color} transparent opacity={0.06} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.35, 0.007, 8, 48]} /><meshBasicMaterial color={agent.color} transparent opacity={isActive ? 0.5 : 0.2} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
        <mesh rotation={[0, 0, Math.PI / 3]}><torusGeometry args={[0.28, 0.004, 8, 48]} /><meshBasicMaterial color={agent.color} transparent opacity={isActive ? 0.25 : 0.08} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
        <mesh ref={meshRef}><sphereGeometry args={[0.2, 32, 32]} /><meshStandardMaterial color={agent.color} emissive={agent.color} emissiveIntensity={hovered ? baseEmissive * 1.5 : baseEmissive} roughness={0.12} metalness={0.92} /></mesh>
        <mesh><sphereGeometry args={[0.05, 16, 16]} /><meshBasicMaterial color="white" transparent opacity={isActive ? 0.9 : 0.3} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
        <Html position={[0, -0.55, 0]} center distanceFactor={4} style={{ pointerEvents: "none", userSelect: "none" }}>
          <div style={{ textAlign: "center", whiteSpace: "nowrap", transform: hovered ? "scale(1.12)" : "scale(1)", transition: "transform 0.2s" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: hovered ? "#fff" : "#e8e6e3", textShadow: "0 0 8px rgba(0,0,0,0.95)", letterSpacing: "0.5px" }}>{agent.name}</div>
            <div style={{ fontSize: "10px", fontWeight: 500, color: agent.color, textShadow: "0 0 6px rgba(0,0,0,0.95)", marginTop: "2px", opacity: hovered ? 1 : 0.8 }}>
              {statusLabel}
              {subAgents.length > 0 && <span style={{ color: "#22c55e", marginLeft: "4px" }}>+{subAgents.length} sub</span>}
            </div>
          </div>
        </Html>
      </group>
      {subAgents.map((sub, i) => (
        <SubAgentSatellite key={`${sub.label}-${i}`} sub={sub} parentPos={agent.position} index={i} />
      ))}
    </>
  );
}

/* ═══════ EDITOR CAMERA (Unity-style: WASD + RMB orbit + wheel zoom + focus + ESC) ═══════ */

function EditorCamera({ defaultTarget }: { defaultTarget: THREE.Vector3 }) {
  const { camera, gl } = useThree();

  const stateRef = useRef({
    yaw: 0,
    pitch: 0.25,
    distance: 7,
    targetDistance: 7,
    target: defaultTarget.clone(),
    targetTarget: defaultTarget.clone(),
    isRMB: false,
    isLMB: false,
    keys: new Set<string>(),
    focusing: false,
  });

  const MIN_DIST = 1.5;
  const MAX_DIST = 25;
  const DEFAULT_DIST = 7;
  const MOVE_SPEED = 3;
  const ROTATE_SPEED = 0.003;

  useEffect(() => {
    const el = gl.domElement;
    const s = stateRef.current;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      s.targetDistance = Math.max(MIN_DIST, Math.min(MAX_DIST, s.targetDistance + e.deltaY * 0.008));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2) { s.isRMB = true; el.setPointerCapture(e.pointerId); }
      if (e.button === 0) { s.isLMB = true; el.setPointerCapture(e.pointerId); }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 2) { s.isRMB = false; try { el.releasePointerCapture(e.pointerId); } catch {} }
      if (e.button === 0) { s.isLMB = false; try { el.releasePointerCapture(e.pointerId); } catch {} }
    };
    const onPointerMove = (e: PointerEvent) => {
      // RMB: free look (vertical INVERTED — drag up = look up)
      if (s.isRMB) {
        s.yaw -= e.movementX * ROTATE_SPEED;
        s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch + e.movementY * ROTATE_SPEED));
      }
      // LMB: orbit around current target (same inversion)
      if (s.isLMB && !s.isRMB) {
        s.yaw -= e.movementX * ROTATE_SPEED;
        s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch + e.movementY * ROTATE_SPEED));
      }
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      s.keys.add(e.key.toLowerCase());
      if (e.key === "Escape") {
        s.targetTarget.copy(defaultTarget);
        s.targetDistance = DEFAULT_DIST;
        s.yaw = 0;
        s.pitch = 0.25;
        s.focusing = false;
        focusRef.current = null;
        focusRef.resetFlag = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { s.keys.delete(e.key.toLowerCase()); };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [gl, defaultTarget]);

  useFrame((_state, delta) => {
    const s = stateRef.current;

    // Check focus target
    if (focusRef.current && !s.focusing) {
      s.targetTarget.copy(focusRef.current.position);
      s.targetDistance = 3;
      s.focusing = true;
    }
    if (focusRef.resetFlag) {
      focusRef.resetFlag = false;
    }

    // WASD movement (relative to camera direction)
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const speed = MOVE_SPEED * delta;
    if (s.keys.has("w")) s.targetTarget.add(forward.clone().multiplyScalar(speed));
    if (s.keys.has("s")) s.targetTarget.add(forward.clone().multiplyScalar(-speed));
    if (s.keys.has("a")) s.targetTarget.add(right.clone().multiplyScalar(-speed));
    if (s.keys.has("d")) s.targetTarget.add(right.clone().multiplyScalar(speed));
    if (s.keys.has("q") || s.keys.has(" ")) s.targetTarget.y += speed;
    // if (s.keys.has("e") || s.keys.has("shift")) s.targetTarget.y -= speed;

    // Smooth interpolation
    s.distance += (s.targetDistance - s.distance) * 0.08;
    s.target.lerp(s.targetTarget, 0.06);

    // Compute camera position from orbital params
    const phi = s.pitch;
    const theta = s.yaw;
    camera.position.x = s.target.x + Math.sin(theta) * Math.cos(phi) * s.distance;
    camera.position.y = s.target.y + Math.sin(phi) * s.distance;
    camera.position.z = s.target.z + Math.cos(theta) * Math.cos(phi) * s.distance;
    camera.lookAt(s.target);
  });

  return null;
}

/* ═══════ SCENE CONTENT ═══════ */

function SceneContent({ agents, liveData, onFocusChange, onDoubleClick }: { agents: AgentState[]; liveData: LiveData | null; onFocusChange?: (name: string | null) => void; onDoubleClick?: (type: "agent" | "tool", name: string) => void }) {
  const [, setHoveredAgent] = useState<string | null>(null);
  const handleHover = useCallback((name: string | null) => setHoveredAgent(name), []);

  // Default target = first agent or origin
  const defaultTarget = useMemo(() => {
    const a = agents[0];
    return a ? new THREE.Vector3(a.position[0], a.position[1], a.position[2] - 1) : new THREE.Vector3(0, 0, -1.5);
  }, [agents]);

  const handleFocus = useCallback((name: string, pos: [number, number, number]) => {
    focusRef.current = { position: new THREE.Vector3(pos[0], pos[1], pos[2]), name };
    onFocusChange?.(name);
  }, [onFocusChange]);

  // Activity beams — one per agent, each with their own color
  // Build a dynamic lookup: agentId → AgentState (match by id field or by name)
  const findAgentById = (agentId: string): AgentState | undefined => {
    return (
      agents.find((a) => a.id === agentId) ||
      agents.find((a) => a.name.toLowerCase() === agentId.toLowerCase()) ||
      agents.find((a) => a.id === "main" && agentId === "main")
    );
  };

  const beams: { from: [number, number, number]; to: [number, number, number]; color: string; intensity: number }[] = [];
  if (liveData?.agentToolUsage) {
    // Multi-agent mode: show beams for ALL agents with recent activity
    for (const [agentId, agentData] of Object.entries(liveData.agentToolUsage)) {
      if (!agentData?.toolCategories) continue;
      const agent = findAgentById(agentId);
      if (!agent) continue;

      for (const [catId, cat] of Object.entries(agentData.toolCategories)) {
        const station = TOOL_STATIONS.find((s) => s.id === catId);
        if (!station) continue;
        const freshness = Math.max(0, 1 - (Date.now() - new Date(cat.lastTs).getTime()) / (5 * 60 * 1000));
        if (freshness > 0.05) {
          // Use agent's color for their beams
          beams.push({ from: agent.position, to: station.position, color: agent.color, intensity: freshness * 0.85 });
        }
      }
    }
  } else if (liveData?.toolCategories) {
    // Fallback: single-agent mode (legacy)
    const activeAgent = agents.find((a) => a.status === "active") || agents.find((a) => a.status === "idle") || agents[0];
    for (const [catId, cat] of Object.entries(liveData.toolCategories)) {
      const station = TOOL_STATIONS.find((s) => s.id === catId);
      if (!station || !activeAgent) continue;
      const freshness = Math.max(0, 1 - (Date.now() - new Date(cat.lastTs).getTime()) / (5 * 60 * 1000));
      if (freshness > 0.05) beams.push({ from: activeAgent.position, to: station.position, color: station.color, intensity: freshness });
    }
  }

  // Inter-agent connections
  const agentConns: { from: [number, number, number]; to: [number, number, number]; color: string }[] = [];
  if (liveData?.connections) {
    for (const conn of liveData.connections) {
      const f = agents.find((a) => a.name === conn.from);
      const t = agents.find((a) => a.name.toLowerCase().includes(conn.to.toLowerCase()));
      if (f && t) agentConns.push({ from: f.position, to: t.position, color: f.color });
    }
  }

  // Sub-agents per parent (use first agent as default parent)
  const defaultParent = agents[0]?.name || agents[0]?.id || "main";
  const subsByParent: Record<string, SubAgentState[]> = {};
  if (liveData?.subAgents) {
    for (const sub of liveData.subAgents) {
      const key = sub.parentAgent || defaultParent;
      if (!subsByParent[key]) subsByParent[key] = [];
      subsByParent[key].push(sub);
    }
  }

  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[5, 5, 5]} intensity={0.5} color="#d4a017" distance={25} decay={2} />
      <pointLight position={[-5, 3, -5]} intensity={0.3} color="#7c3aed" distance={20} decay={2} />
      <pointLight position={[0, -2, 3]} intensity={0.15} color="#dc2626" distance={15} decay={2} />

      <StarField count={1500} />
      <GoldDust count={150} />
      <Nebula />
      <CentralHub />
      <EditorCamera defaultTarget={defaultTarget} />

      {TOOL_STATIONS.map((s) => (
        <ToolStation key={s.id} station={s} activity={liveData?.toolCategories?.[s.id] || null} onClick={() => handleFocus(s.label, s.position)} onDoubleClick={() => onDoubleClick?.("tool", s.id)} />
      ))}

      {beams.map((b, i) => <ActivityBeam key={`b${i}`} from={b.from} to={b.to} color={b.color} intensity={b.intensity} />)}
      {agentConns.map((c, i) => <ActivityBeam key={`c${i}`} from={c.from} to={c.to} color={c.color} intensity={0.8} />)}

      {agents.map((agent) => (
        <AgentOrb key={agent.name} agent={agent} subAgents={subsByParent[agent.name] || subsByParent[agent.id || ""] || []} onHover={handleHover} onClick={() => handleFocus(agent.name, agent.position)} onDoubleClick={() => onDoubleClick?.("agent", agent.name)} />
      ))}
    </>
  );
}

/* ═══════ CSS FALLBACK ═══════ */

function CSSFallback() {
  return (
    <div className="w-full h-full relative overflow-hidden bg-[#0a0a0f]">
      <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-red-600/15 blur-3xl animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-purple-600/10 blur-3xl animate-pulse" style={{ animationDelay: "0.5s" }} />
    </div>
  );
}

/* ═══════ HUD OVERLAY ═══════ */

function HUD({ focusedName }: { focusedName: string | null }) {
  const { t } = useLanguage();
  return (
    <div className="absolute bottom-4 left-0 right-0 z-20 pointer-events-none">
      <div className="mx-auto w-fit px-3 py-1.5 rounded-lg bg-[#0a0a0f]/80 backdrop-blur-sm border border-[#2a2a3e]/50 space-y-0.5">
        <div className="text-[9px] text-[#6b7280]/70 font-mono text-center">
          <span className="text-[#d4a017]/60">WASD</span> {t("hud.move")}
          <span className="mx-1.5 text-[#2a2a3e]">│</span>
          <span className="text-[#d4a017]/60">{t("hud.leftClick")}</span> {t("hud.orbit")}
          <span className="mx-1.5 text-[#2a2a3e]">│</span>
          <span className="text-[#d4a017]/60">{t("hud.rightClick")}</span> {t("hud.look")}
          <span className="mx-1.5 text-[#2a2a3e]">│</span>
          <span className="text-[#d4a017]/60">{t("hud.scroll")}</span> {t("hud.zoom")}
          <span className="mx-1.5 text-[#2a2a3e]">│</span>
          <span className="text-[#d4a017]/60">{t("hud.doubleClick")}</span> {t("hud.open")}
          <span className="mx-1.5 text-[#2a2a3e]">│</span>
          <span className="text-[#d4a017]/60">ESC</span> {t("hud.reset")}
        </div>
        {focusedName && (
          <div className="text-[10px] text-[#d4a017] font-medium text-center animate-pulse">
            ◉ {focusedName}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════ MAIN ═══════ */

export default function DivanScene({ agents, onFocusChange, onDoubleClick }: DivanSceneProps) {
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [focusedName, setFocusedName] = useState<string | null>(null);

  useEffect(() => {
    const fetchLive = () => {
      fetch("/api/live").then((r) => r.json()).then(setLiveData).catch(() => {});
    };
    fetchLive();
    const interval = setInterval(fetchLive, 5000);
    return () => clearInterval(interval);
  }, []);

  // Listen for ESC to clear focus name
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setFocusedName(null); onFocusChange?.(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onFocusChange]);

  const handleFocus = useCallback((name: string | null) => {
    setFocusedName(name);
    onFocusChange?.(name);
  }, [onFocusChange]);

  const agentStates: AgentState[] = agents.map((a, i) => {
    const angle = (i / Math.max(agents.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { ...a, position: [Math.cos(angle) * 3, 0, Math.sin(angle) * 1.8 - 1] as [number, number, number] };
  });

  return (
    <WebGLErrorBoundary fallback={<CSSFallback />}>
      <div className="w-full h-full relative" style={{ cursor: "crosshair" }}>
        <Canvas
          camera={{ position: [0, 1.5, 7], fov: 50 }}
          gl={{ antialias: true, alpha: true, powerPreference: "default", failIfMajorPerformanceCaveat: false }}
          style={{ background: "transparent" }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.2; }}
          raycaster={{ params: { Points: { threshold: 0.1 } } as any }}
        >
          <Suspense fallback={null}>
            <SceneContent agents={agentStates} liveData={liveData} onFocusChange={handleFocus} onDoubleClick={onDoubleClick} />
          </Suspense>
        </Canvas>
        <HUD focusedName={focusedName} />
      </div>
    </WebGLErrorBoundary>
  );
}
