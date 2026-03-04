
export type SignalState = 'RED' | 'YELLOW' | 'GREEN';

export type VehicleType = 'car' | 'emergency' | 'truck' | 'bus';

export interface Vehicle {
  id: string;
  laneId: string; // Identifies which road/lane the vehicle is on
  laneType: 'horizontal' | 'vertical';
  direction: 'north' | 'south' | 'east' | 'west';
  position: number;
  speed: number;
  type: VehicleType;
}

export interface SignalStatus {
  id: string;
  state: SignalState;
  timer: number;
}

export interface IntersectionStatus {
  id: string;
  lat: number;
  lng: number;
  nsSignal: SignalState;
  ewSignal: SignalState;
  timer: number;
  density: number; // 0.0 - 1.0 based on vehicle count
  aiPrediction: {
    congestionLevel: string;
    flowImprovement: string;
  };
}

export interface EmergencyVehicle {
  id: string; // We might need to generate this if not provided
  laneId: string;
  position: number;
  speed: number;
  type: 'emergency';
  active: boolean;
}

export interface AIStatus {
  congestionLevel: string;
  prediction: {
    location: string;
    time: number; // minutes
  };
  recommendation: {
    action: string;
    value: string;
  };
  efficiency: number; // percentage
  aiActive: boolean;
}

export interface RoadOverview {
  laneId: string;
  congestion: number; // 0.0 - 1.0
  flow: string; // "optimal", "moderate", "congested"
}

export interface ZoneOverview {
  name: string;
  load: number;
  status: string;
}

export interface GridOverview {
  roads: RoadOverview[];
  zones: ZoneOverview[];
}

export interface IntersectionSummary {
  id: string;
  name: string;
  status: string;
}

export interface SignalDetails {
  intersectionId: string;
  nsGreenTime: number;
  ewGreenTime: number;
  currentPhase: string;
  timerRemaining: number;
  flowRate: number;
  pedestrianDemand: string;
  aiEnabled: boolean;
}
