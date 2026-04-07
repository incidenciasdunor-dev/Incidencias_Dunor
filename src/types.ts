export type UserRole = 'ADMIN' | 'COORDINATOR' | 'TEACHER';
export type IncidentStatus = 'PENDIENTE' | 'RECIBIDO' | 'EN_SEGUIMIENTO' | 'CERRADO';

export interface FollowUpComment {
  comment: string;
  timestamp: number;
  authorName: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  assignedCoordinatorId?: string;
  isRegistered?: boolean;
}

export interface SystemSettings {
  emailNotificationsEnabled: boolean;
  forwardingEnabled: boolean;
  coordinatorAdminMapping: Record<string, string[]>; // coordinatorId -> adminIds[]
}

export interface Incident {
  id: string;
  date: string;
  place: string;
  students: string;
  description: string;
  disciplinaryMeasures: string;
  followUp: string;
  followUpHistory?: FollowUpComment[];
  reporterName: string;
  reporterId: string;
  reporterEmail?: string;
  coordinatorId: string;
  school: string;
  isReceived: boolean;
  status?: IncidentStatus;
  readAt?: number;
  receivedByName?: string;
  images?: string[];
  deletedByCoordinators?: string[];
  forwardedTo?: string[];
  createdAt: number;
}
