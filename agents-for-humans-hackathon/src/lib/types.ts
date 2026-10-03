export interface AiContext {
  userId: string;
  inputs: {
    description: string;
    mediaType?: 'video' | 'article' | 'song';
    timeframe?: string;
    keywords?: string[];
  };
  timestamp: number;
}

export interface WorkItem {
  id: string;
  type: 'search' | 'refinement';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputSnapshot?: string | null;
  confidenceScore?: number;
  createdAt: number;
  updatedAt: number;
}

export interface UserPrefs {
  theme: 'light' | 'dark' | 'system';
  maxResults: number;
  safeSearch: boolean;
}

export interface ApiResponse<T> {
  data?: T;
  error?: {
    message: string;
    code: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  password?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}
