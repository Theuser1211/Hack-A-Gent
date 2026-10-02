export interface WorkItem {
  id: string;
  title?: string;
  status: string;
  type?: string;
  outputSnapshot?: any;
  confidenceScore?: number | null;
  createdAt: number;
  updatedAt: number;
  userId?: string;
  aiContextId?: string;
  inputs?: any;
}

export interface ContextItem {
  id?: string;
  label?: string;
  userId?: string;
  inputs?: any;
}

export interface WorkHistoryItem {
  id: string;
  title: string;
  status: string;
  type?: string;
  outputSnapshot?: {
    title?: string;
    url?: string;
    confidence?: number;
    source?: string;
  };
  createdAt?: string;
}

export interface HistoryResponse {
  items: WorkHistoryItem[];
}

export interface AiRunRequest {
  description: string;
  mediaType: 'video' | 'article' | 'song';
  timeframe?: string;
  keywords?: string[];
  userId?: string;
  inputs?: {
    description: string;
    mediaType?: 'video' | 'article' | 'song';
    timeframe?: string;
    timePeriod?: string;
    keywords?: string[];
  };
}

/**
 * Generic over the payload a caller stages through it: a run's work item, or
 * whatever the UI keeps in flight. Both readings stay assignable.
 */
export interface AiRunResponse<T = WorkItem> {
  workItem?: WorkItem;
  status?: string;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}

export interface AiHistoryResponse {
  history: WorkItem[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  token: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface AuthResponse {
  sessionId?: unknown;
  session?: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    name: string;
    createdAt?: number | string;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  // A credential a consumer constructing a public user shape never has; only
  // the repository that stores it fills this in.
  password?: string;
  passwordHash: string;
  createdAt?: number | string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface FeedbackRequest {
  type: string;
  rating: number;
  comment?: string;
  workItemId?: string;
  adjustment?: {
    description?: string;
    mediaType?: 'video' | 'article' | 'song';
    timeframe?: string;
    timePeriod?: string;
    keywords?: string[];
  };
}

export interface FeedbackResponse {
  success: boolean;
  message?: string;
  workItem?: WorkItem;
}

export interface AiContext {
  id?: string;
  label?: string;
  type?: string;
  data?: any;
  userId?: string;
  inputs: {
    description: string;
    mediaType?: 'video' | 'article' | 'song';
    timeframe?: string;
    keywords?: string[];
  };
  timestamp?: number;
  timestamps?: {
    createdAt: string;
    updatedAt: string;
  };
}

export interface UserPrefs {
  theme: string;
  maxResults?: number;
  safeSearch?: boolean;
  notifications?: boolean;
  userId?: string;
  preferredMediaType?: 'video' | 'article' | 'song';
}

export interface ApiResponse<T> {
  data?: T;
  error?: {
    message: string;
    code: string;
  };
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}
