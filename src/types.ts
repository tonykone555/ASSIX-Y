export interface Task {
  taskId: string;
  taskType: string;
  label?: string;
  config: any;
  status: 'running' | 'paused_captcha' | 'paused_input' | 'complete' | 'stopped' | 'error' | 'queued';
  progress: number;
  total: number;
  progressPct?: number;
  report?: string;
  results?: any[];
  createdAt?: string;
  completedAt?: string;
  liveViewUrl?: string;
  inputPrompt?: string | null;
  inputValue?: string | null;
  currentUrl?: string;
}

export interface Lead {
  leadId: string;
  taskId?: string;
  businessName: string;
  phone: string;
  website: string;
  rating?: string;
  address?: string;
  city?: string;
  sector?: string;
  market?: string;
  leadType: 'no_website' | 'has_website';
  sentToClose?: boolean;
  status?: string;
  createdAt?: string;
}

export interface LogEntry {
  time: string;
  msg: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

export interface ChatMessage {
  role: 'user' | 'agent';
  msg: string;
  files?: string[];
}

export interface Session {
  platform: string;
  savedAt: string;
}
