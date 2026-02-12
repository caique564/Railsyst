
export enum VehicleState {
  NONE = 'NONE',
  APPROACHING = 'APPROACHING',
  STOPPED = 'STOPPED',
  CROSSING = 'CROSSING',
  VIOLATION = 'VIOLATION'
}

export interface AIAnalysis {
  vehiclePresent: boolean;
  status: 'approaching' | 'at_stop_line' | 'crossing' | 'gone';
  isMoving: boolean;
  vehicleType?: string;
}

export interface ViolationRecord {
  id: string;
  timestamp: number;
  photoUrl: string;
  videoUrl?: string;
  vehicleType: string;
  durationStopped: number;
}
