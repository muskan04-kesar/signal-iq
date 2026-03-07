
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Stage, Layer, Rect, Circle, Line, Group, Text } from 'react-konva';
import { IntersectionStatus, Vehicle, VehicleType, EmergencyVehicle } from '../types';

interface TrafficMap2DProps {
  intersections: IntersectionStatus[];
  vehicles?: Vehicle[];
  emergencyActive: boolean;
  emergencyVehicle?: EmergencyVehicle | null;
  onIntersectionClick: (id: string) => void;
}

import { useVehicleAnimation } from '../hooks/useVehicleAnimation';

const TrafficMap2D: React.FC<TrafficMap2DProps> = ({ intersections, vehicles = [], emergencyActive, emergencyVehicle, onIntersectionClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Use interpolated vehicles for display
  const displayVehicles = useVehicleAnimation({
    serverVehicles: vehicles,
    intersections,
    pollInterval: 50
  });

  // Grid constants: 5 roads = 4 blocks = 25 intersections
  const roadWidth = 50;
  const lanePadding = 10;

  const grid = useMemo(() => {
    if (dimensions.width === 0) return { h: [], v: [] };
    // Evenly spaced 5 roads
    const h = [0.15, 0.32, 0.49, 0.66, 0.83].map(p => dimensions.height * p);
    const v = [0.15, 0.32, 0.49, 0.66, 0.83].map(p => dimensions.width * p);
    return { h, v };
  }, [dimensions]);

  const getVehicleLength = (type: VehicleType) => {
    switch (type) {
      case 'truck': return 32;
      case 'bus': return 38;
      case 'emergency': return 26;
      default: return 18;
    }
  };

  const getVehicleWidth = (type: VehicleType) => (type === 'truck' || type === 'bus' ? 12 : 9);


  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const flashRate = 1; // Static value to replace animation

  return (
    <div ref={containerRef} className="w-full h-full bg-transparent">
      {dimensions.width > 0 && (
        <Stage width={dimensions.width} height={dimensions.height}>
          <Layer>
            {/* 5x5 Grid Road Backgrounds */}
            {grid.h.map((y, idx) => (
              <Group key={`h-road-${idx}`}>
                {/* <Rect x={0} y={y - roadWidth / 2} width={dimensions.width} height={roadWidth} fill="#111827" /> */}
                <Line points={[0, y, dimensions.width, y]} stroke="#334155" strokeWidth={1} dash={[4, 4]} opacity={0.6} />
              </Group>
            ))}
            {grid.v.map((x, idx) => (
              <Group key={`v-road-${idx}`}>
                {/* <Rect x={x - roadWidth / 2} y={0} width={roadWidth} height={dimensions.height} fill="#111827" /> */}
                <Line points={[x, 0, x, dimensions.height]} stroke="#334155" strokeWidth={1} dash={[4, 4]} opacity={0.6} />
              </Group>
            ))}

            {/* Intersections and Signals */}
            {intersections.map((inter, i) => {
              const row = Math.floor(i / 5);
              const col = i % 5;
              const x = grid.v[col];
              const y = grid.h[row];

              return (
                <Group key={inter.id} onClick={() => onIntersectionClick(inter.id)} cursor="pointer">
                  {/* Visual intersection hub - Removed for transparency */}

                  {/* Dynamic Signal Bulbs */}
                  {/* Vertical Direction Signals */}
                  <Circle x={x} y={y - roadWidth / 2 - 5} radius={4.5} fill={inter.nsSignal === 'GREEN' ? '#10b981' : '#ef4444'} shadowBlur={inter.nsSignal === 'GREEN' ? 12 : 5} shadowColor={inter.nsSignal === 'GREEN' ? '#10b981' : '#ef4444'} />
                  <Circle x={x} y={y + roadWidth / 2 + 5} radius={4.5} fill={inter.nsSignal === 'GREEN' ? '#10b981' : '#ef4444'} shadowBlur={inter.nsSignal === 'GREEN' ? 12 : 5} shadowColor={inter.nsSignal === 'GREEN' ? '#10b981' : '#ef4444'} />

                  {/* Horizontal Direction Signals */}
                  <Circle x={x - roadWidth / 2 - 5} y={y} radius={4.5} fill={inter.ewSignal === 'GREEN' ? '#10b981' : '#ef4444'} shadowBlur={inter.ewSignal === 'GREEN' ? 12 : 5} shadowColor={inter.ewSignal === 'GREEN' ? '#10b981' : '#ef4444'} />
                  <Circle x={x + roadWidth / 2 + 5} y={y} radius={4.5} fill={inter.ewSignal === 'GREEN' ? '#10b981' : '#ef4444'} shadowBlur={inter.ewSignal === 'GREEN' ? 12 : 5} shadowColor={inter.ewSignal === 'GREEN' ? '#10b981' : '#ef4444'} />

                  <Text x={x - 12} y={y - 6} text={inter.id.split('-')[1]} fill="#cbd5e1" fontSize={12} opacity={0.8} fontStyle="bold" />
                </Group>
              );
            })}

            {/* Vehicle Layer */}
            {displayVehicles.map(v => {
              let vx = 0, vy = 0, rot = 0;
              const roadIdx = parseInt(v.laneId.match(/\d+/)?.[0] || '0');

              if (v.laneType === 'horizontal') {
                vx = v.position;
                const roadY = grid.h[roadIdx];
                vy = v.direction === 'east' ? roadY + lanePadding : roadY - lanePadding;
              } else {
                vy = v.position;
                const roadX = grid.v[roadIdx];
                vx = v.direction === 'south' ? roadX - lanePadding : roadX + lanePadding;
              }

              // Rotation: North 0, East 90, South 180, West 270
              switch (v.direction) {
                case 'north': rot = 0; break;
                case 'east': rot = 90; break;
                case 'south': rot = 180; break;
                case 'west': rot = 270; break;
              }

              const isEmergency = v.type === 'emergency';

              // Color logic
              const getVehicleColor = (vehicle: Vehicle) => {
                if (vehicle.type === 'emergency') return '#3B82F6';
                const colors = ['#FFFFFF', '#FACC15', '#3B82F6', '#EAB308']; // White, Yellow, Blue, Taxi yellow
                let hash = 0;
                for (let i = 0; i < vehicle.id.length; i++) {
                  hash = (hash << 5) - hash + vehicle.id.charCodeAt(i);
                  hash |= 0;
                }
                return colors[Math.abs(hash) % colors.length];
              };

              const vColor = getVehicleColor(v);
              const vLen = 12;
              const vWid = 6;

              return (
                <Group key={v.id} x={vx} y={vy} rotation={rot}>
                  {/* Emergency Aura */}
                  {isEmergency && (
                    <Rect
                      width={vWid + 16}
                      height={vLen + 16}
                      offsetX={(vWid + 16) / 2}
                      offsetY={(vLen + 16) / 2}
                      fill={flashRate > 0 ? '#ef4444' : '#3b82f6'}
                      opacity={0.15}
                      cornerRadius={4}
                      shadowBlur={20}
                      shadowColor={flashRate > 0 ? '#ef4444' : '#3b82f6'}
                    />
                  )}

                  {/* Body Shadow */}
                  <Rect
                    width={vWid}
                    height={vLen}
                    offsetX={vWid / 2}
                    offsetY={vLen / 2}
                    fill="#000"
                    opacity={0.2}
                    x={1}
                    y={1}
                    cornerRadius={2}
                  />

                  {/* Main Vehicle Body */}
                  <Rect
                    width={vWid}
                    height={vLen}
                    offsetX={vWid / 2}
                    offsetY={vLen / 2}
                    fill={vColor}
                    cornerRadius={2}
                    stroke={isEmergency ? (flashRate > 0 ? '#ef4444' : '#3b82f6') : 'rgba(255,255,255,0.1)'}
                    strokeWidth={isEmergency ? 1.5 : 0.5}
                  />

                  {/* Windshield */}
                  <Rect
                    width={vWid - 2}
                    height={vLen / 4}
                    offsetX={(vWid - 2) / 2}
                    offsetY={vLen / 2 - 2}
                    fill="#1e293b"
                    opacity={0.4}
                    cornerRadius={1}
                  />

                  {/* Headlights */}
                  <Circle x={-vWid / 4} y={-vLen / 2} radius={0.8} fill="#ffffff" />
                  <Circle x={vWid / 4} y={-vLen / 2} radius={0.8} fill="#ffffff" />

                  {/* Emergency Flashers */}
                  {isEmergency && (
                    <Rect
                      width={vWid}
                      height={2}
                      offsetX={vWid / 2}
                      offsetY={1}
                      y={-vLen / 4}
                      fill={flashRate > 0 ? '#ef4444' : '#3b82f6'}
                    />
                  )}
                </Group>
              );
            })}

            {/* Separate Emergency Vehicle Rendering */}
            {emergencyVehicle && emergencyVehicle.active && (() => {
              let vx = 0, vy = 0, rot = 0;
              const roadIdx = parseInt(emergencyVehicle.laneId.match(/\d+/)?.[0] || '0');

              if (emergencyVehicle.laneId.startsWith('H')) {
                vx = emergencyVehicle.position;
                const roadY = grid.h[roadIdx];
                vy = roadY + lanePadding;
              } else {
                vy = emergencyVehicle.position;
                const roadX = grid.v[roadIdx];
                vx = roadX - lanePadding;
              }

              // Match global rotation logic
              if (emergencyVehicle.laneId.startsWith('H')) {
                rot = vx > dimensions.width / 2 ? 270 : 90; // Approximation for H move
                // Better: use explicit direction if it existed, but here we guess.
                // Let's assume East for H increasing, South for V increasing.
                rot = 90; // East
              } else {
                rot = 180; // South
              }

              return (
                <Group x={vx} y={vy} rotation={rot}>
                  {/* Pulsing Aura */}
                  <Circle
                    radius={30}
                    fill={flashRate > 0 ? '#ef4444' : 'transparent'}
                    opacity={0.3}
                    shadowBlur={30}
                    shadowColor="#ef4444"
                  />
                  {/* Body (Using new vertical-base style) */}
                  <Rect
                    width={10}
                    height={20}
                    offsetX={5}
                    offsetY={10}
                    fill="#ef4444"
                    cornerRadius={3}
                  />
                  {/* Headlights */}
                  <Circle x={-2.5} y={-10} radius={1.5} fill="#ffffff" />
                  <Circle x={2.5} y={-10} radius={1.5} fill="#ffffff" />

                  {/* Light Bar */}
                  <Rect
                    width={10}
                    height={3}
                    offsetX={5}
                    offsetY={1.5}
                    y={-4}
                    fill={flashRate > 0 ? '#ffffff' : '#3b82f6'}
                  />
                  <Text
                    text="EMERGENCY"
                    fontSize={11}
                    fill="#ffffff"
                    fontStyle="bold"
                    y={-25}
                    offsetX={32}
                    rotation={-rot}
                  />
                </Group>
              );
            })()}

            {/* Separate Emergency Vehicle Rendering */}
          </Layer>
        </Stage>
      )}
    </div>
  );
};

export default React.memo(TrafficMap2D);
