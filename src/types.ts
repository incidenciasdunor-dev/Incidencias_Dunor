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
  password?: string;
}

export interface SystemSettings {
  emailNotificationsEnabled: boolean;
  forwardingEnabled: boolean;
  coordinatorAdminMapping: Record<string, string[]>; // coordinatorId -> adminIds[]
  categories?: string[];
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
  categories?: string[];
  deletedByCoordinators?: string[];
  forwardedTo?: string[];
  createdAt: number;
}

export interface Log {
  id?: string;
  action: string;
  userEmail: string;
  userName: string;
  timestamp: number;
  details?: string;
}
