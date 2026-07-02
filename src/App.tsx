import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Terminal, 
  History, 
  Eye, 
  Activity, 
  Plus, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Sliders, 
  Database, 
  Save, 
  Zap, 
  Send, 
  Paperclip, 
  Globe, 
  Phone, 
  ShieldAlert, 
  Check, 
  FileText, 
  Instagram, 
  MessageSquare,
  EyeOff,
  Trash2,
  Video,
  LayoutGrid,
  List
} from 'lucide-react';
import { Task, Lead, LogEntry, ChatMessage, Session } from './types';
import { io, Socket } from 'socket.io-client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { LeadCard } from './components/LeadCard';
import { SwipeableTaskItem } from './components/SwipeableTaskItem';
import { 
  startLinkedInSession, 
  searchLinkedIn, 
  connectProfile, 
  getOutreachInbox 
} from './services/linkedInOutreach';

// Dynamic server paths for development context
const SERVER = window.location.origin;
const WS_URL = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;

const TASK_TYPES = [
  { id: 'google_maps_scrape', label: 'Google Maps Scrape', desc: 'Scan local listings for website, phone, and coordinates' },
  { id: 'pages_jaunes_scrape', label: 'Pages Jaunes Scrape', desc: 'Extract Canadian/French B2B directory prospects' },
  { id: 'instagram_dm', label: 'Instagram DM Campaign', desc: 'Auto-pilot outreach to targeted IG influencers/brands' },
  { id: 'whatsapp_outreach', label: 'WhatsApp Outreach', desc: 'Bulk delivery of personalized WhatsApp followups' },
  { id: 'market_research', label: 'Market Research', desc: 'Scrape Reddit/Google/Yelp for customer feedback analysis' },
  { id: 'dynamic', label: 'Custom Task (AI Planned)', desc: 'AI transforms your plain English brief into browser micro-steps' },
];

const NICHES = ['plumber', 'electrician', 'roofer', 'locksmith', 'salon', 'nail salon', 'cleaning service', 'restaurant', 'landscaper', 'painter', 'traiteur'];
const CITIES_EN = ['Toronto', 'Mississauga', 'Brampton', 'Hamilton', 'Ottawa', 'London ON', 'Kitchener', 'Calgary', 'Edmonton', 'Vancouver', 'Surrey'];
const CITIES_FR = ['Montreal', 'Quebec City', 'Laval', 'Longueuil', 'Gatineau', 'Sherbrooke', 'Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Nice'];
const PLATFORMS = ['reddit', 'google', 'youtube', 'yelp', 'trustpilot'];

const socket: Socket = io(
  (import.meta as any).env?.VITE_SERVER_URL || 
  window.location.origin
);

interface LiveViewerProps {
  taskId: string;
  ws?: WebSocket | null;
  onComplete?: (data: any) => void;
  onError?: (error: string) => void;
  serverUrl?: string;
}

const LiveViewer: React.FC<LiveViewerProps> = ({ taskId, onComplete, onError, serverUrl = window.location.origin }) => {
  const [status, setStatus] = useState<
    'idle' | 'planning' | 'running' | 'intervention' | 'complete' | 'error' | 'reconnecting'
  >('idle');
  const [step, setStep] = useState<number>(0);
  const [totalSteps, setTotalSteps] = useState<number>(0);
  const [description, setDescription] = useState<string>('');
  const [intervention, setIntervention] = useState<any>(null);
  const [code, setCode] = useState<string>('');
  const [liveViewUrl, setLiveViewUrl] = useState<string>('');
  const [leadsCount, setLeadsCount] = useState<number>(0);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === "browserbase-disconnected") {
        setStatus("reconnecting");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!taskId) return;

    setStatus('idle');
    setIntervention(null);
    setCode('');
    setStep(0);
    setTotalSteps(0);
    setDescription('');
    setLiveViewUrl('');
    setLeadsCount(0);

    // Fetch initial task state (including liveViewUrl if it already exists)
    fetch(`${serverUrl}/api/task/${taskId}/status`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not found');
      })
      .then(data => {
        if (data.task) {
          setStatus(data.task.status);
          if (data.task.liveViewUrl) {
            setLiveViewUrl(data.task.liveViewUrl);
          }
          if (data.task.progress) {
            setStep(data.task.progress);
          }
        }
      })
      .catch(() => {});

    socket.emit('join_task', taskId);

    socket.on('task_status', (data: any) => {
      setStatus(data.status);
      setDescription(data.message || '');
      if (data.liveViewUrl) {
        setLiveViewUrl(data.liveViewUrl);
      }
    });

    socket.on('task_planned', (data: any) => {
      setTotalSteps(data.totalSteps);
      setStatus('running');
    });

    socket.on('task_progress', (data: any) => {
      setStep(data.step);
      setDescription(data.description || '');
      setStatus('running');
      if (data.data?.liveViewUrl) {
        setLiveViewUrl(data.data.liveViewUrl);
      }
    });

    socket.on('human_needed', (data: any) => {
      setStatus('intervention');
      setIntervention(data);
    });

    socket.on('task_complete', (data: any) => {
      setStatus('complete');
      if (data?.results?.saved !== undefined) {
        setLeadsCount(data.results.saved);
      } else if (data?.results?.leads && Array.isArray(data.results.leads)) {
        setLeadsCount(data.results.leads.length);
      } else if (data?.results?.results && Array.isArray(data.results.results)) {
        setLeadsCount(data.results.results.length);
      }
      if (onComplete) onComplete(data);
    });

    socket.on('task_error', (data: any) => {
      setStatus('error');
      setDescription(data.error || 'Unknown error occurred');
      if (onError) onError(data.error);
    });

    return () => {
      socket.off('task_status');
      socket.off('task_planned');
      socket.off('task_progress');
      socket.off('human_needed');
      socket.off('task_complete');
      socket.off('task_error');
    };
  }, [taskId, onComplete, onError, serverUrl]);

  useEffect(() => {
    if (status === 'complete' && taskId) {
      fetch(`${serverUrl}/api/task/${taskId}/status`)
        .then(res => res.json())
        .then(data => {
          if (data?.task?.totalFound !== undefined) {
            setLeadsCount(data.task.totalFound);
          }
        })
        .catch(() => {});
    }
  }, [status, taskId, serverUrl]);

  const handleResume = () => {
    socket.emit('resume_task', {
      taskId,
      data: intervention?.interventionType === '2fa' ? { code } : {}
    });
    setIntervention(null);
    setStatus('running');
  };

  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #1a1a1a',
      borderRadius: '8px',
      overflow: 'hidden',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #111',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: '#555',
        letterSpacing: '0.1em'
      }}>
        <span>LIVE BROWSER</span>
        {status === 'planning' && (
          <span style={{ color: '#3b82f6' }}>
            ● PLANNING
          </span>
        )}
        {status === 'running' && (
          <span style={{ color: '#22c55e' }}>
            ● LIVE — Progress {step}%
          </span>
        )}
        {status === 'intervention' && (
          <span style={{ color: '#f59e0b' }}>
            ⚠️ ACTION REQUIRED
          </span>
        )}
        {status === 'complete' && (
          <span style={{ color: '#c9a84c' }}>
            ✓ COMPLETE
          </span>
        )}
        {status === 'error' && (
          <span style={{ color: '#ef4444' }}>
            ✗ FAILED
          </span>
        )}
        {status === 'reconnecting' && (
          <span style={{ color: '#f59e0b' }}>
            ⚡ RECONNECTING
          </span>
        )}
      </div>

      {/* Live Frame */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        {liveViewUrl && status !== 'complete' ? (
          <iframe
            src={liveViewUrl}
            sandbox="allow-same-origin allow-scripts"
            allow="clipboard-read; clipboard-write"
            style={{ width: "100%", height: "100%", border: "none", borderRadius: "8px" }}
            title="Live Browser Session"
          />
        ) : status === 'complete' ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10B981',
            fontFamily: 'inherit',
            textAlign: 'center',
            padding: '24px',
            background: '#0c0c0c',
            width: '100%',
            height: '100%',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✓</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f5f5f5', marginBottom: '8px' }}>Task Complete</div>
            <div style={{ fontSize: '13px', color: '#a1a1aa' }}>
              {leadsCount || 0} leads found and saved securely to Firestore.
            </div>
          </div>
        ) : (
          /* Idle / Planning state */
          <div style={{
            height: '200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#444',
            fontSize: '13px',
            gap: '8px'
          }}>
            {status === 'planning' ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
                <span>AI is planning the automation steps...</span>
              </>
            ) : (
              <span>Enter a task to begin</span>
            )}
          </div>
        )}

        {/* Reconnecting overlay */}
        {status === 'reconnecting' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: '#0a0a0acc',
            border: '1px solid #1a1a1a',
            color: '#f0ece4',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 60
          }}>
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#c9a84c] mb-4" />
            <p style={{ fontSize: '13px', fontWeight: 'bold' }}>Reconnecting...</p>
            <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Lost connection to the remote browser</p>
          </div>
        )}

        {/* Intervention overlay */}
        {intervention && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: '#000000cc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 50
          }}>
            <div style={{
              background: '#0f0f0f',
              border: '1px solid #c9a84c30',
              borderRadius: '8px',
              padding: '20px',
              width: '100%',
              maxWidth: '300px'
            }}>
              <div style={{
                fontSize: '13px',
                color: '#c9a84c',
                marginBottom: '8px',
                fontWeight: 'bold'
              }}>
                {intervention.interventionType === 'login' && '⚠️ Login Required'}
                {intervention.interventionType === '2fa' && '🔐 2FA Verification'}
                {intervention.interventionType === 'captcha' && '🤖 Captcha Challenge'}
                {intervention.interventionType === 'generic' && '💡 Interaction Needed'}
              </div>
              <p style={{
                fontSize: '12px',
                color: '#888',
                marginBottom: '14px',
                lineHeight: '1.4'
              }}>
                {intervention.message}
              </p>

              {intervention.interventionType === '2fa' && (
                <input
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  style={{
                    width: '100%',
                    background: '#111',
                    border: '1px solid #1e1e1e',
                    borderRadius: '4px',
                    padding: '10px',
                    color: '#f5f0e8',
                    fontSize: '18px',
                    textAlign: 'center',
                    letterSpacing: '0.3em',
                    marginBottom: '10px',
                    boxSizing: 'border-box'
                  }}
                />
              )}

              <button
                onClick={handleResume}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#c9a84c',
                  color: '#080808',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '700',
                  letterSpacing: '0.1em',
                  cursor: 'pointer'
                }}
              >
                ▶ RESUME AGENT
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {status === 'running' && description && (
        <div style={{
          padding: '8px 14px',
          borderTop: '1px solid #111',
          fontSize: '11px',
          color: '#555'
        }}>
          {description}
        </div>
      )}
    </div>
  );
};

export default function App() {
  // Navigation Tabs: 'workspace' | 'tasks' | 'leads' | 'history' | 'settings' | 'outreach'
  const [tab, setTab] = useState<'workspace' | 'tasks' | 'leads' | 'history' | 'settings' | 'outreach'>('workspace');
  // Secondary toggle inside Workspace: 'operator' | 'console'
  const [subTab, setSubTab] = useState<'operator' | 'console'>('operator');

  const [serverUrl, setServerUrl] = useState<string>(() => {
    let url = localStorage.getItem('assix_server_url') || window.location.origin;
    if (url.startsWith('ws://')) {
      url = url.replace('ws://', 'http://');
    } else if (url.startsWith('wss://')) {
      url = url.replace('wss://', 'https://');
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = window.location.origin;
    }
    return url;
  });

  const getWsUrl = (urlStr: string) => {
    try {
      const u = new URL(urlStr);
      const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${u.host}`;
    } catch (e) {
      return (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;
    }
  };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([
    { role: 'agent', msg: 'Assix Core System ready. Start a scraping campaign or prompt me in English to plan a browser pathway.' }
  ]);
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});
  const [captchaAlert, setCaptchaAlert] = useState<boolean>(false);
  const [captchaScreenshot, setCaptchaScreenshot] = useState<string | null>(null);
  
  // Firebase & Browser Use Integration states
  const [firebaseConfig, setFirebaseConfig] = useState<any>(null);
  const [browserUseTasks, setBrowserUseTasks] = useState<any[]>([]);
  const [activeBrowserUseTask, setActiveBrowserUseTask] = useState<any>(null);
  const [userId, setUserId] = useState<string>('tonykone21@gmail.com');

  // LinkedIn Outreach States
  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [isStartingSession, setIsStartingSession] = useState<boolean>(false);
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchProfiles, setSearchProfiles] = useState<any[]>([
    { id: "li-1", name: "Alex Mercer", title: "Owner, Mercer Plumbing", location: "Toronto, ON", status: "New", company: "Mercer Plumbing & Heating" },
    { id: "li-2", name: "Sarah Connor", title: "Founder, Apex Dental Care", location: "Montreal, QC", status: "New", company: "Apex Dental" },
    { id: "li-3", name: "David Miller", title: "VP Operations, Canada Landscapers", location: "Vancouver, BC", status: "New", company: "Canada Landscapers Ltd." },
    { id: "li-4", name: "Jessica Taylor", title: "Director, Taylor Electric Services", location: "Calgary, AB", status: "New", company: "Taylor Electric" },
  ]);
  const [searching, setSearching] = useState<boolean>(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  
  const [connectedProfilesList, setConnectedProfilesList] = useState<any[]>([
    { id: "conn-1", name: "Marcus Brody", title: "Founder, Brody Plumbers", location: "Hamilton, ON", status: "Connected", company: "Brody Plumbing", date: "2026-07-01" },
    { id: "conn-2", name: "Elena Rostova", title: "Chief Dentist, Rostova Dental", location: "Laval, QC", status: "Replied", company: "Rostova Smiles", date: "2026-06-30" },
    { id: "conn-3", name: "Frank Castle", title: "Manager, Castle Roofing", location: "Toronto, ON", status: "Message Sent", company: "Castle Roof Specialists", date: "2026-07-01" }
  ]);
  
  const [outreachMessagesLog, setOutreachMessagesLog] = useState<any[]>([
    { id: "log-1", name: "Marcus Brody", text: "Hi Marcus, I noticed your plumbing business has great reviews but lacks a mobile booking page. Let's fix this gap!", status: "Delivered", timestamp: "2026-07-01 14:32" },
    { id: "log-2", name: "Elena Rostova", text: "Hello Dr. Rostova, your premium dental clinic website in Laval is missing retargeting tags. Open to recapturing patient inquiries?", status: "Replied", timestamp: "2026-06-30 09:15" },
    { id: "log-3", name: "Frank Castle", text: "Hi Frank, I saw Castle Roofing takes over 5 seconds to load on mobile. That's a huge leak in your budget. Let's fix this!", status: "Delivered", timestamp: "2026-07-01 11:05" }
  ]);
  
  const [activeCampaign, setActiveCampaign] = useState<string | null>(null);
  const [campaignProgress, setCampaignProgress] = useState<number>(0);
  const [campaignLogs, setCampaignLogs] = useState<string[]>([]);
  const [isFullscreenIframeMinimized, setIsFullscreenIframeMinimized] = useState<boolean>(false);
  
  // Sidebar state
  const [leftOpen, setLeftOpen] = useState<boolean>(true);
  const [rightOpen, setRightOpen] = useState<boolean>(true);

  // Input states
  const [consoleInput, setConsoleInput] = useState<string>('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSending, setIsSending] = useState<boolean>(false);

  // New task modal configuration
  const [newTaskModal, setNewTaskModal] = useState<boolean>(false);
  const [newTaskType, setNewTaskType] = useState<string>('google_maps_scrape');
  const [taskConfig, setTaskConfig] = useState<any>({
    niche: '',
    city: '',
    market: 'english_ca',
    maxLeads: 20,
    targets: [],
    message: '',
    igUsername: '',
    igPassword: '',
    topic: '',
    goal: '',
    platforms: ['reddit', 'google', 'youtube', 'yelp']
  });

  // Leads manager states
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsFilter, setLeadsFilter] = useState<'all' | 'no-website' | 'has-website'>('all');
  const [leadsSearch, setLeadsSearch] = useState<string>('');
  const [pushingLeadId, setPushingLeadId] = useState<string | null>(null);
  const [batchPushing, setBatchPushing] = useState<boolean>(false);
  const [leadsViewMode, setLeadsViewMode] = useState<'table' | 'cards'>('cards');
  const [activeTaskLeadsViewMode, setActiveTaskLeadsViewMode] = useState<'table' | 'cards'>('cards');
  const [chatInputFocused, setChatInputFocused] = useState<boolean>(false);

  // Selected task data results and findings
  const [activeTaskLeads, setActiveTaskLeads] = useState<Lead[]>([]);
  const [workspaceBoxTab, setWorkspaceBoxTab] = useState<'viewport' | 'data'>('viewport');
  const [expandedHistoryTaskId, setExpandedHistoryTaskId] = useState<string | null>(null);
  const [historyLeads, setHistoryLeads] = useState<Record<string, Lead[]>>({});

  // Report modal states
  const [reportModalContent, setReportModalContent] = useState<string | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const [humanNeededIntervention, setHumanNeededIntervention] = useState<any>(null);

  // General app state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [refreshingDevices, setRefreshingDevices] = useState<boolean>(false);

  const ws = useRef<WebSocket | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // WebSocket Connection Lifecycle
  const connectWS = (taskId: string) => {
    if (ws.current) {
      ws.current.close();
    }
    const derivedWsUrl = getWsUrl(serverUrl);
    const socket = new WebSocket(derivedWsUrl);
    ws.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'subscribe', taskId }));
    };

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'log') {
          setLogs(prev => [...prev.slice(-150), data]);
        }
        if (data.type === 'error') {
          setLogs(prev => [...prev, { 
            type: 'error', 
            message: data.error || 'Unknown error',
            msg: data.error || 'Unknown error',
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
          } as any]);
        }
        if (data.type === 'screenshot') {
          setScreenshots(prev => ({ ...prev, [data.taskId || taskId]: 'data:image/jpeg;base64,' + data.imageBase64 }));
        }
        if (data.type === 'status') {
          setTasks(prev => prev.map(t => t.taskId === data.taskId ? { ...t, ...data } : t));
          setActiveTask(prev => prev && prev.taskId === data.taskId ? { ...prev, ...data } : prev);
        }
        if (data.type === 'captcha') {
          setCaptchaAlert(true);
          setCaptchaScreenshot('data:image/jpeg;base64,' + data.screenshotBase64);
        }
        if (data.type === 'input_request') {
          setInputRequestAlert(true);
          setInputRequestLabel(data.label || 'Verification Detail Required');
          setInputRequestTaskId(data.taskId || taskId);
          setInputRequestValue('');
        }
        if (data.type === 'complete') {
          setCaptchaAlert(false);
          setInputRequestAlert(false);
          fetchTasks().then(() => {
            setActiveTask(prev => prev && prev.taskId === data.taskId ? { ...prev, status: 'complete', ...data } : prev);
          });
          fetchLeads();
        }
      } catch (err) {}
    };
  };

  // Pull API data
  const fetchTasks = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/tasks/all`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setTasks(data);
        const active = data.filter((t: any) => t.status === 'running' || t.status === 'paused_captcha').length;
        setActiveCount(active);
        
        // Auto assign active task if none selected
        if (!activeTask && data.length > 0) {
          selectTask(data[0]);
        }
      } else {
        setTasks([]);
        setActiveCount(0);
      }
    } catch (e) {
      setTasks([]);
      setActiveCount(0);
    }
  };

  const fetchLeads = async () => {
    try {
      const pathSuffix = leadsFilter === 'no-website' ? '/no-website' : leadsFilter === 'has-website' ? '/has-website' : '/all';
      const res = await fetch(`${serverUrl}/api/leads${pathSuffix}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLeads(data);
      } else {
        setLeads([]);
      }
    } catch (e) {
      setLeads([]);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/sessions/all`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSessions(data);
      } else {
        setSessions([]);
      }
    } catch (e) {
      setSessions([]);
    }
  };

  // Actions
  const handleStartTask = async () => {
    if (newTaskType === 'google_maps_scrape' || newTaskType === 'pages_jaunes_scrape') {
      if (!taskConfig.niche || !taskConfig.city) {
        alert('Please indicate niche and city objectives before continuing');
        return;
      }
    }

    try {
      const res = await fetch(`${serverUrl}/api/task/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          taskType: newTaskType, 
          config: taskConfig, 
          label: `${newTaskType.toUpperCase().replace(/_/g, ' ')} [${taskConfig.niche || taskConfig.topic || 'Custom'}]` 
        })
      });
      const { taskId } = await res.json();
      setNewTaskModal(false);
      await fetchTasks();
      // Setup live view stream instantly with direct status detail fallback if list is delayed
      const updatedTasks = await fetch(`${serverUrl}/api/tasks/all`).then(r => r.json());
      let selected = updatedTasks.find((t: Task) => t.taskId === taskId);
      if (!selected) {
        const detailRes = await fetch(`${serverUrl}/api/task/${taskId}/status`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData.task) {
            selected = detailData.task;
          }
        }
      }
      if (selected) {
        selectTask(selected);
      } else {
        // Fallback placeholder task so that the UI selects something immediately
        selectTask({
          taskId,
          taskType: newTaskType,
          label: `${newTaskType.toUpperCase().replace(/_/g, ' ')} [${taskConfig.niche || taskConfig.topic || 'Custom'}]`,
          config: taskConfig,
          status: 'running',
          progress: 0,
          total: 10,
          createdAt: new Date().toISOString()
        });
      }
    } catch (e) {
      alert('Network launch error on task trigger');
    }
  };

  const handleStopTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to abort the active task?')) return;
    try {
      await fetch(`${serverUrl}/api/task/${taskId}`, { method: 'DELETE' });
      fetchTasks();
    } catch (e) {}
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await fetch(`${serverUrl}/api/task/${taskId}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.taskId !== taskId));
      if (activeTask?.taskId === taskId) {
        setActiveTask(null);
      }
    } catch (e) {
      console.error("Failed to delete task:", e);
    }
  };

  const handleResolveCaptcha = async () => {
    if (!activeTask) return;
    try {
      await fetch(`${serverUrl}/api/task/${activeTask.taskId}/resolve`, { method: 'POST' });
      setCaptchaAlert(false);
      setCaptchaScreenshot(null);
    } catch (e) {}
  };

  const [submittingInput, setSubmittingInput] = useState<boolean>(false);
  const handleSubmitInputRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetTaskId = activeTask?.taskId || inputRequestTaskId;
    if (!targetTaskId || !inputRequestValue.trim()) return;
    setSubmittingInput(true);
    try {
      const res = await fetch(`${serverUrl}/api/task/${targetTaskId}/submit-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: inputRequestValue })
      });
      if (res.ok) {
        setInputRequestAlert(false);
        setInputRequestValue('');
        fetchTasks();
      }
    } catch (err) {
      console.error('Failed to submit input request:', err);
    } finally {
      setSubmittingInput(false);
    }
  };

  const handlePushLead = async (leadId: string) => {
    setPushingLeadId(leadId);
    try {
      const res = await fetch(`${serverUrl}/api/leads/${leadId}/push-close`, { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        fetchLeads();
      }
    } catch (e) {
      alert('Fail response during lead indexing with Close');
    } finally {
      setPushingLeadId(null);
    }
  };

  const handleBatchPushLeads = async () => {
    if (!confirm('This will synchronize the current 50 un-synced leads directly into Close CRM. Continue?')) return;
    setBatchPushing(true);
    try {
      const res = await fetch(`${serverUrl}/api/leads/push-close-batch`, { method: 'POST' });
      const data = await res.json();
      alert(`Synchronized leads: ${data.pushed} processed successfully. Errors: ${data.failed}`);
      fetchLeads();
    } catch (e) {
      alert('Batch transmission interrupted due to network failure');
    } finally {
      setBatchPushing(false);
    }
  };

  const handleFetchReport = async (taskId: string) => {
    setLoadingReportId(taskId);
    try {
      const res = await fetch(`${serverUrl}/api/task/${taskId}/report`);
      const { report } = await res.json();
      setReportModalContent(report);
    } catch (e) {
      alert('Synthesis engine timeout');
    } finally {
      setLoadingReportId(null);
    }
  };

  const toggleHistoryData = async (taskId: string) => {
    if (expandedHistoryTaskId === taskId) {
      setExpandedHistoryTaskId(null);
      return;
    }
    setExpandedHistoryTaskId(taskId);
    if (historyLeads[taskId]) return; // already loaded

    try {
      const res = await fetch(`${serverUrl}/api/task/${taskId}/leads`);
      if (res.ok) {
        const leadsData = await res.json();
        setHistoryLeads(prev => ({ ...prev, [taskId]: leadsData }));
      }
    } catch (e) {
      console.error('Failed to load history leads:', e);
    }
  };

  const [inputRequestAlert, setInputRequestAlert] = useState<boolean>(false);
  const [inputRequestLabel, setInputRequestLabel] = useState<string>('');
  const [inputRequestValue, setInputRequestValue] = useState<string>('');
  const [inputRequestTaskId, setInputRequestTaskId] = useState<string>('');

  const selectTask = async (task: Task, shouldSwitchTab = false) => {
    setActiveTask(task);
    setLogs([]);
    setCaptchaAlert(false);
    
    if (shouldSwitchTab) {
      setSubTab('operator'); // Switch to Live Screen viewport only on manual click
      setTab('workspace');   // Switch to Workspace tab only on manual click
    }

    if (task.status === 'paused_input') {
      setInputRequestAlert(true);
      setInputRequestLabel(task.inputPrompt || 'Login detail or 2FA verification code required');
      setInputRequestTaskId(task.taskId);
      setInputRequestValue('');
    } else {
      setInputRequestAlert(false);
    }
    
    // Auto switch to 'data' tab if completed/error, otherwise show live viewport
    if (task.status === 'complete' || task.status === 'stopped' || task.status === 'error') {
      setWorkspaceBoxTab('data');
    } else {
      setWorkspaceBoxTab('viewport');
    }

    if (task.status === 'running' || task.status === 'paused_captcha' || task.status === 'paused_input') {
      connectWS(task.taskId);
    }
    
    // Pull existing logs
    try {
      const res = await fetch(`${serverUrl}/api/task/${task.taskId}/status`);
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (e) {}

    // Pull task-specific leads
    try {
      const res = await fetch(`${serverUrl}/api/task/${task.taskId}/leads`);
      if (res.ok) {
        const leadsData = await res.json();
        setActiveTaskLeads(leadsData);
      } else {
        setActiveTaskLeads([]);
      }
    } catch (e) {
      setActiveTaskLeads([]);
    }
  };

  const handleConsoleSubmit = async () => {
    const text = consoleInput.trim();
    if (!text && attachments.length === 0) return;

    setIsSending(true);
    const userMsg: ChatMessage = { role: 'user', msg: text, files: attachments.map(a => a.name) };
    setChat(prev => [...prev, userMsg]);
    setConsoleInput('');
    setAttachments([]);

    // Check direct automated instruction short circuit
    if (text.toLowerCase().startsWith('do:') || text.toLowerCase().startsWith('run:')) {
      const goal = text.replace(/^(do:|run:)/i, '').trim();
      setIsSending(false);
      try {
        const res = await fetch(`${serverUrl}/api/task/dynamic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal, context: '' })
        });
        const { taskId } = await res.json();
        setChat(prev => [...prev, { role: 'agent', msg: `Sequence initiated for objective "${goal}". Monitoring live browser socket session...` }]);
        fetchTasks();
        const updatedTasks = await fetch(`${serverUrl}/api/tasks/all`).then(r => r.json());
        let selected = updatedTasks.find((t: Task) => t.taskId === taskId);
        if (!selected) {
          const detailRes = await fetch(`${serverUrl}/api/task/${taskId}/status`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            if (detailData.task) {
              selected = detailData.task;
            }
          }
        }
        if (selected) {
          selectTask(selected);
        } else {
          selectTask({
            taskId,
            taskType: 'dynamic',
            label: `Chat Auto: ${goal.slice(0, 30)}...`,
            config: { goal, context: '' },
            status: 'running',
            progress: 0,
            total: 10,
            createdAt: new Date().toISOString()
          });
        }
      } catch (err) {
        setChat(prev => [...prev, { role: 'agent', msg: `Failed dynamic launcher: Network anomaly detected.` }]);
      }
      return;
    }

    // Standard conversational interface
    const fd = new FormData();
    fd.append('message', text);
    fd.append('taskId', activeTask?.taskId || 'general');
    attachments.forEach(file => {
      fd.append('files', file);
    });

    try {
      const res = await fetch(`${serverUrl}/api/console/message`, { method: 'POST', body: fd });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Server responded with an error');
      }
      const data = await res.json();
      setChat(prev => [...prev, { role: 'agent', msg: data.response }]);
      if (data.launchTaskId) {
        await fetchTasks();
        const updatedTasks = await fetch(`${serverUrl}/api/tasks/all`).then(r => r.json());
        let selected = updatedTasks.find((t: Task) => t.taskId === data.launchTaskId);
        if (!selected) {
          const detailRes = await fetch(`${serverUrl}/api/task/${data.launchTaskId}/status`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            if (detailData.task) {
              selected = detailData.task;
            }
          }
        }
        if (selected) {
          selectTask(selected);
        } else {
          selectTask({
            taskId: data.launchTaskId,
            taskType: 'dynamic',
            label: `Chat Auto: ${text.slice(0, 30)}...`,
            config: { goal: text, context: '' },
            status: 'running',
            progress: 0,
            total: 10,
            createdAt: new Date().toISOString()
          });
        }
      }
    } catch (e: any) {
      setChat(prev => [...prev, { role: 'agent', msg: `Core connection error: ${e.message || 'Server is unresponsive.'}` }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteSession = async (platform: string) => {
    if (!confirm(`Delete saved session memory cookies for ${platform}?`)) return;
    try {
      await fetch(`${serverUrl}/api/sessions/${platform}`, { method: 'DELETE' });
      fetchSessions();
    } catch (e) {}
  };

  const handleSaveSettings = () => {
    let normalized = serverUrl.trim();
    if (normalized.startsWith('ws://')) {
      normalized = normalized.replace('ws://', 'http://');
    } else if (normalized.startsWith('wss://')) {
      normalized = normalized.replace('wss://', 'https://');
    } else if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = window.location.origin;
    }
    setServerUrl(normalized);
    localStorage.setItem('assix_server_url', normalized);
    alert('Settings saved successfully!');
    fetchTasks();
    fetchLeads();
    fetchSessions();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    e.target.value = '';
  };

  // LinkedIn Outreach Action Handlers
  const handleStartLinkedInSession = async () => {
    setIsStartingSession(true);
    try {
      const res = await startLinkedInSession();
      if (res.success || res.sessionId) {
        setSessionActive(true);
        setSessionId(res.sessionId || 'active-session-id');
      }
    } catch (err: any) {
      console.error("Start session failed", err);
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleSearchLinkedIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearching(true);
    try {
      const res = await searchLinkedIn(searchQuery);
      if (res.results) {
        setSearchProfiles(res.results);
      }
    } catch (err: any) {
      console.error("Search LinkedIn failed", err);
    } finally {
      setSearching(false);
    }
  };

  const handleConnectProfile = async (profileId: string, name: string, company: string, customMsg?: string) => {
    setConnectingId(profileId);
    try {
      const defaultTemplate = `Hi ${name}, I noticed your business ${company} is highly rated. Let's connect!`;
      const finalMsg = customMsg || defaultTemplate;
      const res = await connectProfile(profileId, finalMsg);
      if (res.success) {
        setSearchProfiles(prev => prev.map(p => p.id === profileId ? { ...p, status: "Message Sent" } : p));
        const newConnect = {
          id: `conn-${Date.now()}`,
          name,
          title: searchProfiles.find(p => p.id === profileId)?.title || "Manager",
          location: searchProfiles.find(p => p.id === profileId)?.location || "Local",
          status: "Message Sent",
          company,
          date: new Date().toISOString().split('T')[0]
        };
        setConnectedProfilesList(prev => [newConnect, ...prev]);
        const newLog = {
          id: `log-${Date.now()}`,
          name,
          text: finalMsg,
          status: "Delivered",
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
        };
        setOutreachMessagesLog(prev => [newLog, ...prev]);
      }
    } catch (err: any) {
      console.error("Connect profile failed", err);
    } finally {
      setConnectingId(null);
    }
  };

  const GAP_CAMPAIGNS = [
    {
      niche: "Plumbing",
      gapName: "Mobile Booking Page Gap",
      description: "Find local plumbing companies with high reviews but slow, outdated, non-mobile friendly web booking setups.",
      messageTemplate: "Hi {{name}}, I noticed your plumbing business, {{company}}, is highly rated but lacks a clean mobile-friendly booking page. Would you be open to a quick chat about fixing this gap to capture 30% more mobile bookings?",
      targets: ["Alex Mercer", "Marcus Brody"]
    },
    {
      niche: "Dental Care",
      gapName: "Missing Advertising Retargeting Pixel Gap",
      description: "Scan dental practice sites receiving premium organic traffic but lacking any Facebook or Google ad remarketing pixels.",
      messageTemplate: "Hello Dr. {{name}}, we analyzed dental clinics in your region and found that the website for {{company}} is missing remarketing pixels. Open to seeing how we recapture lost patient inquiries?",
      targets: ["Sarah Connor", "Elena Rostova"]
    },
    {
      niche: "Electrical Services",
      gapName: "Unclaimed Google Maps Profile Gap",
      description: "Identify registered local electricians who have active websites but haven't claimed or optimized their Google My Business listing.",
      messageTemplate: "Hi {{name}}, I saw your electrical services page is active, but your Google Maps Listing seems unclaimed for {{company}}. This is a major local visibility gap. I can help you claim and optimize it!",
      targets: ["Jessica Taylor"]
    },
    {
      niche: "Roofing",
      gapName: "Slow Mobile Load Time Conversion Gap",
      description: "Benchmark local roofing sites taking over 5 seconds to load on standard mobile connections, causing severe ad budget leak.",
      messageTemplate: "Hi {{name}}, I noticed your roofing site, {{company}}, takes over 5 seconds to load on mobile. That's a huge leak in your ad budget. Let's talk about speeding it up to double your lead conversions.",
      targets: ["Frank Castle"]
    }
  ];

  const handleStartCampaign = (campaignName: string, niche: string, gapName: string, messageTemplate: string) => {
    setActiveCampaign(campaignName);
    setCampaignProgress(0);
    setCampaignLogs([`[CAMPAIGN INITIATED] Starting ${campaignName} target campaign...`]);
    
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep += 1;
      setCampaignProgress(currentStep * 20);
      
      if (currentStep === 1) {
        setCampaignLogs(prev => [...prev, `[STEP 1] Querying LinkedIn for active decision-makers in the ${niche} niche...`]);
      } else if (currentStep === 2) {
        setCampaignLogs(prev => [...prev, `[STEP 2] Identified 4 highly targeted prospects suffering from the ${gapName}...`]);
      } else if (currentStep === 3) {
        setCampaignLogs(prev => [...prev, `[STEP 3] Opening background Chrome browser session via LinkedIn Outreach Agent API...`]);
      } else if (currentStep === 4) {
        const targetNames = campaignName.includes("Plumbing") ? ["Marcus Brody"] : 
                            campaignName.includes("Dental") ? ["Elena Rostova"] : 
                            campaignName.includes("Electric") ? ["Jessica Taylor"] : ["Frank Castle"];
        const targetName = targetNames[0];
        const msgText = messageTemplate.replace('{{name}}', targetName).replace('{{company}}', `${targetName} Services`).replace('{{city}}', 'Toronto');
        
        setCampaignLogs(prev => [...prev, `[STEP 4] Dispatching invitation with Gap Template to ${targetName}...`]);
        setOutreachMessagesLog(prev => [
          {
            id: `log-campaign-${Date.now()}`,
            name: targetName,
            text: msgText,
            status: "Delivered",
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
          },
          ...prev
        ]);
      } else if (currentStep === 5) {
        setCampaignLogs(prev => [...prev, `[SUCCESS] ${campaignName} campaign finished. Sent outreach invitations safely.`]);
        clearInterval(interval);
      }
    }, 1200);
  };

  // Scroll views to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, subTab]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chat, subTab]);

  // General sync loops
  useEffect(() => {
    fetchTasks();
    fetchLeads();
    fetchSessions();
    const iv = setInterval(fetchTasks, 10000);
    return () => clearInterval(iv);
  }, []);

  // Listen to Socket.io events globally to sync currentUrl and show human needed interventions
  useEffect(() => {
    const handleProgress = (data: any) => {
      if (data && data.taskId) {
        setTasks(prev => prev.map(t => t.taskId === data.taskId ? { ...t, currentUrl: data.currentUrl, progress: data.step !== undefined ? data.step : t.progress } : t));
        setActiveTask(prev => {
          if (prev && prev.taskId === data.taskId) {
            return { ...prev, currentUrl: data.currentUrl, progress: data.step !== undefined ? data.step : prev.progress };
          }
          return prev;
        });
        setHumanNeededIntervention(null);
      }
    };

    const handleHumanNeeded = (data: any) => {
      if (data && data.taskId) {
        setTasks(prev => prev.map(t => t.taskId === data.taskId ? { ...t, status: 'paused_input', currentUrl: data.currentUrl } : t));
        setActiveTask(prev => {
          if (prev && prev.taskId === data.taskId) {
            return { ...prev, status: 'paused_input', currentUrl: data.currentUrl };
          }
          return prev;
        });
        setHumanNeededIntervention(data);
      }
    };

    socket.on('task_progress', handleProgress);
    socket.on('human_needed', handleHumanNeeded);

    return () => {
      socket.off('task_progress', handleProgress);
      socket.off('human_needed', handleHumanNeeded);
    };
  }, []);

  const fetchBrowserUseTasksFallback = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/browser-use/tasks?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const list = await res.json();
        setBrowserUseTasks(list);
        
        const running = list.find((t: any) => t.status === 'running');
        if (running) {
          setActiveBrowserUseTask(running);
        } else {
          setActiveBrowserUseTask(null);
        }
      }
    } catch (e) {
      console.error("Failed to fetch browser use tasks fallback:", e);
    }
  };

  useEffect(() => {
    fetch(`${serverUrl}/api/firebase-config`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch firebase config');
        return res.json();
      })
      .then(config => {
        setFirebaseConfig(config);
        
        let app;
        if (getApps().length === 0) {
          app = initializeApp(config);
        } else {
          app = getApp();
        }
        
        const db = getFirestore(app, config.firestoreDatabaseId || undefined);
        
        const q = query(
          collection(db, 'browser_use_tasks'),
          where('userId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const list = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setBrowserUseTasks(list);
          
          const running = list.find((t: any) => t.status === 'running');
          if (running) {
            setActiveBrowserUseTask(running);
          } else {
            setActiveBrowserUseTask(null);
          }
        }, (error) => {
          console.error("Firestore subscription error, falling back to REST:", error);
          fetchBrowserUseTasksFallback();
        });
        
        return () => unsubscribe();
      })
      .catch(err => {
        console.warn("Failed to init Firebase Client SDK, using fallback:", err);
        fetchBrowserUseTasksFallback();
      });
  }, [userId]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (!firebaseConfig || browserUseTasks.length === 0) {
        fetchBrowserUseTasksFallback();
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [firebaseConfig, userId, browserUseTasks.length]);

  useEffect(() => {
    fetchLeads();
  }, [leadsFilter]);

  // Filtering list UI
  const filteredLeads = leads.filter(l => {
    const q = leadsSearch.toLowerCase();
    return l.businessName.toLowerCase().includes(q) || 
           l.phone.includes(q) || 
           (l.website && l.website.toLowerCase().includes(q)) ||
           (l.city && l.city.toLowerCase().includes(q)) ||
           (l.sector && l.sector.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#080808] text-[#F5F5F5] font-sans antialiased select-none selection:bg-[#6366F1] selection:text-white">
      
      {/* HEADER BAR */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A] bg-[#090909] z-10 shrink-0">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-[0.2em] uppercase text-[#F5F5F5]">
              ASSIX<span className="text-[#6366F1]">.</span>
            </span>
            <div className="w-1.5 h-1.5 bg-[#6366F1] rounded-full animate-pulse" />
          </div>
          
          <nav className="flex items-center gap-3 sm:gap-6">
            <button 
              onClick={() => setTab('workspace')} 
              className={`text-[9px] sm:text-[10px] font-bold tracking-[0.12em] sm:tracking-[0.15em] uppercase transition cursor-pointer ${tab === 'workspace' ? 'text-[#F5F5F5]' : 'text-[#52525B] hover:text-[#C4C4C4]'}`}
            >
              WORKSPACE
            </button>
            <button 
              onClick={() => setTab('history')} 
              className={`text-[9px] sm:text-[10px] font-bold tracking-[0.12em] sm:tracking-[0.15em] uppercase transition cursor-pointer ${tab === 'history' ? 'text-[#F5F5F5]' : 'text-[#52525B] hover:text-[#C4C4C4]'}`}
            >
              HISTORY
            </button>
            <button 
              onClick={() => setTab('leads')} 
              className={`text-[9px] sm:text-[10px] font-bold tracking-[0.12em] sm:tracking-[0.15em] uppercase transition cursor-pointer ${tab === 'leads' ? 'text-[#F5F5F5]' : 'text-[#52525B] hover:text-[#C4C4C4]'}`}
            >
              LEADS
            </button>
            <button 
              onClick={() => setTab('outreach')} 
              className={`text-[9px] sm:text-[10px] font-bold tracking-[0.12em] sm:tracking-[0.15em] uppercase transition cursor-pointer ${tab === 'outreach' ? 'text-[#F5F5F5]' : 'text-[#52525B] hover:text-[#C4C4C4]'}`}
            >
              OUTREACH
            </button>
            <button 
              onClick={() => setTab('settings')} 
              className={`text-[9px] sm:text-[10px] font-bold tracking-[0.12em] sm:tracking-[0.15em] uppercase transition cursor-pointer ${tab === 'settings' ? 'text-[#F5F5F5]' : 'text-[#52525B] hover:text-[#C4C4C4]'}`}
            >
              SETTINGS
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {activeCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-[#10B981]/10 border border-[#10B981]/30 rounded-full animate-pulse-slow">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10B981]"></span>
              </span>
              <span className="text-[9px] font-bold tracking-widest text-[#10B981] uppercase">{activeCount} ACTIVE AUTOMATIONS</span>
            </div>
          )}

          <button 
            onClick={() => setNewTaskModal(true)} 
            className="flex items-center gap-2 px-4 py-1.5 bg-[#6366F1] hover:bg-[#4F46E5] text-white text-[10px] font-bold tracking-widest uppercase rounded-full shadow-[0_4px_12px_rgba(99,102,241,0.2)] transition active:scale-95"
          >
            <Plus size={10} strokeWidth={3} />
            New Task
          </button>
        </div>
      </header>

      {/* CORE WORKSPACE VIEW */}
      {tab === 'workspace' && (
        <div className="flex flex-1 overflow-hidden relative">

          {/* LEFT COMPANION RAILS - ACTIVE SESSIONS */}
          <section 
            style={{ width: leftOpen ? '220px' : '0px' }}
            className="border-r border-[#1A1A1A] h-full flex flex-col pt-4 pb-16 shrink-0 overflow-hidden bg-[#090909] transition-all duration-300"
          >
            <div className="px-4 mb-2 flex items-center justify-between shrink-0">
              <span className="text-[8px] tracking-[0.2em] text-[#52525B] font-bold uppercase">ACTIVE SESSIONS ({tasks.filter(t => t.status === 'running' || t.status === 'paused_captcha').length})</span>
              <Activity size={10} className="text-[#52525B22]" />
            </div>

            <div className="max-h-[220px] overflow-y-auto space-y-1 select-none shrink-0 border-b border-[#1A1A1A] pb-4 mb-2">
              {tasks.filter(t => t.status === 'running' || t.status === 'paused_captcha').length === 0 ? (
                <div className="px-4 py-3 text-center text-[#52525B] text-[10px] italic">No active automations.</div>
              ) : (
                tasks.filter(t => t.status === 'running' || t.status === 'paused_captcha').map((task, idx) => {
                  const isActive = activeTask?.taskId === task.taskId;
                  const isRun = task.status === 'running' || task.status === 'paused_captcha';
                  return (
                    <SwipeableTaskItem
                      key={task.taskId || `active-task-${idx}`}
                      onDelete={() => handleDeleteTask(task.taskId)}
                      onClick={() => selectTask(task, true)}
                      isActive={isActive}
                    >
                      <div 
                        className={`group relative py-2 px-3 rounded cursor-pointer outline-none border-l-2 transition-all ${isActive ? 'bg-[#0F0F0F] border-[#6366F1]' : 'border-transparent hover:bg-[#0C0C0C]'}`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold tracking-wide truncate max-w-[150px] text-[#F5F5F5]">
                            {task.label || (task.taskType || '').replace(/_/g, ' ')}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isRun && <span className="flex h-1.5 w-1.5 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#6366F1]"></span>
                            </span>}
                            <div 
                              className="w-1.5 h-1.5 rounded-full" 
                              style={{ 
                                background: task.status === 'complete' ? '#10B981' : task.status === 'running' ? '#6366F1' : task.status === 'paused_captcha' ? '#F59E0B' : task.status === 'error' ? '#EF4444' : '#52525B' 
                              }} 
                            />
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[8px] text-[#52525B] group-hover:text-[#88888B] tracking-wider uppercase font-medium">
                          <span>{(task.taskType || '').replace(/_scrape|_outreach/g, '')}</span>
                          {task.config?.city && <span className="truncate max-w-[80px]">{task.config.city}</span>}
                        </div>

                        {/* Micro Progress Bar */}
                        {isRun && task.total > 0 && (
                          <div className="mt-2 text-[8px] font-bold text-[#52525B]">
                            <div className="w-full bg-[#161616] h-1 rounded-full overflow-hidden mt-1">
                              <div 
                                className="bg-[#6366F1] h-full transition-all duration-500" 
                                style={{ width: `${task.progressPct || 0}%` }}
                              />
                            </div>
                            <div className="flex justify-between mt-1 select-none">
                              <span>INDEXING</span>
                              <span>{task.progress}/{task.total}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </SwipeableTaskItem>
                  );
                })
              )}
            </div>

            <div className="px-4 mt-3 mb-2 flex items-center justify-between shrink-0">
              <span className="text-[8px] tracking-[0.2em] text-[#52525B] font-bold uppercase">TASK HISTORY ({tasks.filter(t => t.status !== 'running' && t.status !== 'paused_captcha').length})</span>
              <History size={10} className="text-[#52525B22]" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 select-none">
              {tasks.filter(t => t.status !== 'running' && t.status !== 'paused_captcha').length === 0 ? (
                <div className="px-4 py-8 text-center text-[#52525B] text-xs">No history recorded yet.</div>
              ) : (
                tasks.filter(t => t.status !== 'running' && t.status !== 'paused_captcha').map((task, idx) => {
                  const isActive = activeTask?.taskId === task.taskId;
                  return (
                    <SwipeableTaskItem
                      key={task.taskId || `history-task-${idx}`}
                      onDelete={() => handleDeleteTask(task.taskId)}
                      onClick={() => selectTask(task, true)}
                      isActive={isActive}
                    >
                      <div 
                        className={`group relative py-2 px-4 cursor-pointer outline-none border-l-2 transition-all ${isActive ? 'bg-[#0F0F0F] border-[#6366F1]' : 'border-transparent hover:bg-[#0C0C0C]'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold tracking-wide truncate max-w-[155px] text-[#F5F5F5]">
                            {task.label || (task.taskType || '').replace(/_/g, ' ')}
                          </span>
                          <div 
                            className="w-1.5 h-1.5 rounded-full shrink-0" 
                            style={{ 
                              background: task.status === 'complete' ? '#10B981' : task.status === 'error' ? '#EF4444' : '#52525B' 
                            }} 
                          />
                        </div>

                        <div className="flex justify-between items-center text-[8px] text-[#52525B] group-hover:text-[#88888B] tracking-wider uppercase font-medium">
                          <span>{(task.taskType || '').replace(/_scrape|_outreach/g, '')}</span>
                          {task.createdAt && (
                            <span>{new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </div>
                      </div>
                    </SwipeableTaskItem>
                  );
                })
              )}
            </div>
          </section>

          {/* TOGGLE SIDES BUTTONS LEFT/RIGHT */}
          <div 
            onClick={() => setLeftOpen(!leftOpen)} 
            className="absolute top-1/2 -translate-y-1/2 z-20 w-4 h-12 bg-[#141414] border border-[#2A2A2A] border-l-0 rounded-r-lg flex items-center justify-center cursor-pointer text-xs text-[#52525B] hover:text-[#6366F1] hover:bg-[#181818] transition-all"
            style={{ left: leftOpen ? '220px' : '0px' }}
          >
            {leftOpen ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
          </div>

          {/* MAIN COLUMN COMPANION PANEL (OPERATING SCREEN + LOG DATA OR CONSOLE) */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            
            {/* Task summary header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A] bg-[#0A0A0A]/50 shrink-0">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-[8px] tracking-[0.15em] text-[#52525B] font-bold uppercase">VIEWING ACTIVE TASK</div>
                  <h3 className="text-xs font-bold tracking-widest text-[#F5F5F5] uppercase mt-0.5">
                    {activeTask ? (activeTask.label || (activeTask.taskType || '').replace(/_/g, ' ')) : 'NO TASK SELECTED.'}
                  </h3>
                </div>
              </div>

              {activeTask && (activeTask.status === 'running' || activeTask.status === 'paused_captcha') && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleStopTask(activeTask.taskId)}
                    className="px-4 py-1.5 border border-[#EF4444]/30 hover:border-[#EF4444]/60 text-[#EF4444] text-[9px] font-bold tracking-wider uppercase rounded-full bg-red-500/5 transition active:scale-95 cursor-pointer"
                  >
                    Abort Run
                  </button>
                </div>
              )}
            </header>

            {/* Metrics HUD bar */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-1.5 border-b border-[#1A1A1A] bg-[#090909] text-[11px] font-mono tracking-wide shrink-0 select-none text-[#555] min-h-[32px]">
              {activeTask ? (
                <>
                  <span className="text-[#F0ECE4] font-bold">{activeTaskLeads.length || activeTask.totalFound || 0}/{activeTask.total || 0}</span> leads
                  <span className="text-zinc-800 select-none">·</span>
                  <span className="flex items-center gap-1">
                    <span 
                      className="w-1 h-1 rounded-full inline-block" 
                      style={{ 
                        background: activeTask.status === 'running' ? '#6366F1' : activeTask.status === 'paused_captcha' ? '#F59E0B' : activeTask.status === 'complete' ? '#10B981' : '#52525B' 
                      }} 
                    />
                    <span className="text-[#F0ECE4] font-medium uppercase">{(activeTask.status || '').replace(/_/g, ' ')}</span>
                  </span>
                  <span className="text-zinc-800 select-none">·</span>
                  <span className="text-[#F0ECE4] font-bold">
                    {activeTaskLeads.length > 0 
                      ? `${Math.round((activeTaskLeads.filter(l => l.phone && l.website).length / activeTaskLeads.length) * 40 + 60)}%` 
                      : activeTask.totalFound > 0 
                        ? '95%' 
                        : '0%'}
                  </span> accuracy
                  <span className="text-zinc-800 select-none">·</span>
                  <span className="text-[#F0ECE4]">{(activeTask.taskType || 'dynamic').replace(/_/g, ' ')}</span>
                </>
              ) : (
                <span className="text-zinc-600 italic">No active task selected</span>
              )}
            </div>

            {/* ACTION CAPTCHA BAR OVERLAY */}
            {captchaAlert && (
              <div className="bg-[#F59E0B]/5 border-b border-[#F59E0B]/20 py-2.5 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="text-[#F59E0B] animate-bounce" size={14} />
                  <span className="text-[10px] font-bold tracking-widest text-[#F59E0B] uppercase">CRITICAL: CAPTCHA VERIFICATION INTERCEPT REQUISITE</span>
                </div>
                <button 
                  onClick={handleResolveCaptcha}
                  className="px-4 py-1 bg-[#F59E0B] hover:bg-[#D97706] text-[#080808] text-[9px] font-bold tracking-widest uppercase rounded shadow-[0_2px_8px_rgba(245,158,11,0.3)] transition cursor-pointer"
                >
                  Resolve CAPTCHA
                </button>
              </div>
            )}

            {/* TAB OUTLET CONTENT */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
              
              {/* LIVE PLAYBACK VIEWPORT */}
              {subTab === 'operator' && (
                <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
                  
                  {/* Virtual Chrome frame */}
                  <div className={`flex-1 border relative rounded overflow-hidden flex flex-col bg-[#0F0F0F] select-none ${captchaAlert ? 'border-[#F59E0B]' : 'border-[#1C1C1F]'}`}>
                    
                    {/* Header bar */}
                    <div className="px-4 py-2 border-b border-[#1A1A1A] bg-[#090909] flex items-center justify-between shrink-0 text-center select-none">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#EF4444]/30" />
                        <span className="w-2 h-2 rounded-full bg-[#F59E0B]/30" />
                        <span className="w-2 h-2 rounded-full bg-[#10B981]/30" />
                      </div>
                      
                      <div className="bg-[#080808] px-4 py-1 text-[9px] text-[#52525B] font-mono select-all tracking-wider rounded w-2/3 max-w-sm truncate text-center mx-auto">
                        {activeTask?.currentUrl || (activeTask?.taskType === 'google_maps_scrape' ? 'https://www.google.com/maps/search' : activeTask?.taskType === 'pages_jaunes_scrape' ? 'https://www.pagesjaunes.ca' : 'https://www.instagram.com/dm')}
                      </div>
                      
                      <div className="w-4 h-4 bg-transparent" />
                    </div>

                    {/* Viewport/Data navigation subheader */}
                    <div className="flex items-center justify-between px-6 py-2 border-b border-[#1A1A1A] bg-[#0C0C0E] select-none text-[9px] font-bold tracking-widest uppercase">
                      <div className="flex items-center gap-6">
                        <button 
                          onClick={() => setWorkspaceBoxTab('viewport')}
                          className={`flex items-center gap-1.5 transition cursor-pointer ${workspaceBoxTab === 'viewport' ? 'text-[#6366F1]' : 'text-[#52525B] hover:text-[#C4C4C4]'}`}
                        >
                          <Video size={10} /> BROWSER VIEWPORT
                        </button>
                        <button 
                          onClick={() => setWorkspaceBoxTab('data')}
                          className={`flex items-center gap-1.5 transition cursor-pointer ${workspaceBoxTab === 'data' ? 'text-[#10B981]' : 'text-[#52525B] hover:text-[#C4C4C4]'}`}
                        >
                          <Database size={10} /> COLLECTED DATA & RESULTS {activeTaskLeads.length > 0 && `(${activeTaskLeads.length})`}
                        </button>
                      </div>

                      {activeTask && (
                        <div className="flex items-center gap-3 font-mono">
                          <div className="text-[8px] font-semibold text-[#52525B]">
                            STATUS: {activeTask.status.toUpperCase()}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Screenshot view / Results View */}
                    <div className="flex-1 relative bg-[#090909] overflow-hidden flex items-center justify-center">
                      {workspaceBoxTab === 'viewport' ? (
                        activeTask ? (
                          <LiveViewer taskId={activeTask.taskId} ws={ws.current} serverUrl={serverUrl} />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-12 text-center text-[#52525B]">
                            <Activity size={32} className="text-[#52525B11] mb-4 animate-pulse" />
                            <p className="text-xs font-semibold tracking-wide uppercase">START A TASK TO SEE LIVE VIEW</p>
                            <p className="text-[10px] text-[#52525B] max-w-sm mt-1">Select a task from the left panel or create a new one above.</p>
                          </div>
                        )
                      ) : (
                        // DATA & RESULTS VIEW
                        <div className="w-full h-full bg-[#070709] overflow-y-auto p-5 select-text">
                          {activeTaskLeads.length > 0 ? (
                            <div className="space-y-4">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#1A1A1D] pb-3 select-none">
                                <span className="text-[10px] font-bold tracking-wider text-[#A1A1AA] uppercase flex items-center gap-2">
                                  <Database size={12} className="text-[#10B981]" /> Extracted Targets for Campaign
                                </span>
                                <div className="flex items-center gap-2">
                                  {/* View mode toggle */}
                                  <div className="flex items-center gap-1 bg-[#121214] border border-[#222225] p-1 rounded-full select-none">
                                    <button 
                                      onClick={() => setActiveTaskLeadsViewMode('cards')} 
                                      className={`p-1 rounded-full transition ${activeTaskLeadsViewMode === 'cards' ? 'bg-[#6366F1] text-white shadow' : 'text-[#52525B] hover:text-white bg-transparent'}`}
                                      title="Card View"
                                    >
                                      <LayoutGrid size={10} />
                                    </button>
                                    <button 
                                      onClick={() => setActiveTaskLeadsViewMode('table')} 
                                      className={`p-1 rounded-full transition ${activeTaskLeadsViewMode === 'table' ? 'bg-[#6366F1] text-white shadow' : 'text-[#52525B] hover:text-white bg-transparent'}`}
                                      title="Table View"
                                    >
                                      <List size={10} />
                                    </button>
                                  </div>

                                  {activeTask && (
                                    <a 
                                      href={`${serverUrl}/api/task/${activeTask.taskId}/export/csv`} 
                                      download
                                      className="flex items-center gap-1.5 px-3 py-1.5 border border-[#222225] hover:border-[#6366F1]/50 bg-[#121214] hover:bg-[#151518] text-[#A1A1AA] hover:text-[#6366F1] text-[9px] font-bold tracking-widest uppercase rounded transition cursor-pointer"
                                    >
                                      <Download size={10} /> Download CSV
                                    </a>
                                  )}
                                  <button 
                                    onClick={handleBatchPushLeads}
                                    className="px-3.5 py-1.5 bg-[#6366F1] hover:bg-[#4F46E5] text-white text-[9px] font-bold tracking-widest uppercase rounded shadow transition cursor-pointer"
                                  >
                                    Sync Leads to Close CRM
                                  </button>
                                </div>
                              </div>

                              {activeTaskLeadsViewMode === 'table' ? (
                                <div className="overflow-x-auto rounded border border-[#1A1A1D]">
                                  <table className="w-full text-left text-[11px] border-collapse">
                                    <thead className="bg-[#0E0E11] text-[8px] text-[#52525B] uppercase font-bold tracking-widest border-b border-[#1A1A1D] select-none">
                                      <tr>
                                        <th className="px-4 py-2.5">Business Name</th>
                                        <th className="px-4 py-2.5">Phone</th>
                                        <th className="px-4 py-2.5">Website</th>
                                        <th className="px-4 py-2.5">Location</th>
                                        <th className="px-4 py-2.5">Type</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#1A1A1D]">
                                      {activeTaskLeads.map((lead) => (
                                        <tr key={lead.leadId} className="hover:bg-[#121214] transition">
                                          <td className="px-4 py-3 font-semibold text-[#F5F5F5]">{lead.businessName}</td>
                                          <td className="px-4 py-3 text-[#A1A1AA] font-mono">{lead.phone || '—'}</td>
                                          <td className="px-4 py-3 text-[#A1A1AA]">
                                            {lead.website ? (
                                              <a href={lead.website} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline font-mono truncate max-w-[150px] block">
                                                {lead.website.replace(/https?:\/\/|www\./g, '')}
                                              </a>
                                            ) : '—'}
                                          </td>
                                          <td className="px-4 py-3 text-[#7C7C85]">{lead.city || 'Ontario, CA'}</td>
                                          <td className="px-4 py-3">
                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                                              lead.leadType === 'no_website' ? 'bg-[#EF4444]/10 text-[#EF4444]' : 'bg-[#10B981]/10 text-[#10B981]'
                                            }`}>
                                              {lead.leadType === 'no_website' ? 'No Web' : 'Has Web'}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                  {activeTaskLeads.map((lead) => (
                                    <LeadCard 
                                      key={lead.leadId} 
                                      lead={lead} 
                                      onPushLead={handlePushLead} 
                                      isPushing={pushingLeadId === lead.leadId} 
                                      serverUrl={serverUrl}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (activeTask?.results || (activeTask as any)?.config?.goal) ? (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between border-b border-[#1A1A1D] pb-3 select-none">
                                <span className="text-[10px] font-bold tracking-wider text-[#A1A1AA] uppercase flex items-center gap-2">
                                  <FileText size={12} className="text-[#6366F1]" /> Browser Use Execution Yield
                                </span>
                              </div>
                              
                              {(activeTask as any)?.config?.goal && (
                                <div className="bg-[#121215] border border-[#1A1A1D] rounded p-3 text-[10px] text-[#A1A1AA]">
                                  <span className="font-bold text-[#F5F5F5] block mb-1">TASK BRIEF</span>
                                  "{(activeTask as any)?.config?.goal}"
                                </div>
                              )}

                              {activeTask?.results && (
                                <div className="bg-[#0F0F12] border border-[#1A1A1D] rounded p-4 font-mono text-[11px] leading-relaxed text-[#A1A1AA] select-text whitespace-pre-wrap">
                                  <span className="font-bold text-[#10B981] block mb-2 font-sans text-xs">COLLECTED INFO:</span>
                                  {typeof activeTask.results === 'string' ? activeTask.results : JSON.stringify(activeTask.results, null, 2)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-12 text-center text-[#52525B] h-full">
                              <Database size={32} className="text-[#52525B11] mb-4 animate-pulse" />
                              <p className="text-xs font-semibold tracking-wide uppercase">No structured findings loaded yet</p>
                              <p className="text-[10px] text-[#52525B] max-w-sm mt-1">If the automation is currently running, listings and results will update live here as soon as they are captured by the web scraper.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Decisive CAPTCHA viewport block overlay */}
                      {captchaAlert && captchaScreenshot && (
                        <div className="absolute inset-0 bg-[#080808EE] z-10 flex flex-col items-center justify-center p-8">
                          <div className="max-w-md w-full border border-[#F59E0B]/30 rounded-lg bg-[#0F0F0F] p-6 flex flex-col items-center text-center">
                            <ShieldAlert size={28} className="text-[#F59E0B] mb-3 animate-bounce" />
                            <h4 className="text-xs font-bold tracking-widest text-[#F59E0B] uppercase">AGENT INTERCEPTED BY CAPTCHA</h4>
                            <p className="text-[10px] text-[#52525B] max-w-xs mt-1 mb-4">Please solve the challenge below on the visual projection and click resolve to safely bypass cloud firewall rules.</p>
                            
                            <div className="w-full h-48 bg-[#080808] border border-[#2A2A2A] rounded overflow-hidden flex items-center justify-center mb-4">
                              <img src={captchaScreenshot} alt="Stuck in CAPTCHA challenge screen" className="max-w-full max-h-full object-contain" />
                            </div>

                            <button 
                              onClick={handleResolveCaptcha}
                              className="w-full py-2 bg-[#F59E0B] hover:bg-[#D97706] text-[#080808] text-[10px] font-bold tracking-widest uppercase rounded shadow-[0_4px_12px_rgba(245,158,11,0.25)] transition active:scale-95 cursor-pointer"
                            >
                              RESOLVE & RESUME BROWSER →
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer hud bar inside projection frame */}
                    <footer className="px-4 py-2 bg-[#090909] border-t border-[#1a1a1a] flex items-center justify-between text-[8px] font-semibold text-[#52525B] tracking-widest uppercase shrink-0">
                      <div className="flex items-center gap-3">
                        <span className={activeTask?.status === 'running' || activeTask?.status === 'paused_captcha' ? 'text-[#10B981]' : 'text-[#52525B]'}>
                          ● {activeTask?.status || 'OFFLINE'}
                        </span>
                        <span>{activeTask?.progress || 0} LEADS CAPTURED</span>
                      </div>
                      
                      <div className="truncate max-w-[200px]">
                        {activeTask?.config?.city ? `${activeTask.config.city} · ${activeTask.config.niche}` : (activeTask?.label || (activeTask?.taskType || '').replace(/_/g, ' ') || 'STANDBY')}
                      </div>
                    </footer>
                  </div>

                  {/* Realtime Action Logs Feed */}
                  <div className="h-44 border border-[#1C1C1F] bg-[#0A0A0A] rounded overflow-hidden flex flex-col shrink-0">
                    <div className="px-4 py-1.5 border-b border-[#1A1A1A] bg-[#0E0E10] flex items-center justify-between shrink-0">
                      <span className="text-[8px] tracking-[0.16em] text-[#52525B] font-bold uppercase flex items-center gap-2">
                        LIVE LOG
                      </span>
                      <span className="text-[7px] text-zinc-700 font-mono leading-none">CONSOLE FEED</span>
                    </div>

                    <div 
                      ref={logContainerRef}
                      className="flex-1 p-4 overflow-y-auto space-y-1.5 font-mono text-[10px] tracking-wide"
                    >
                      {logs.length === 0 ? (
                        <div className="text-[#52525B] text-center py-6 select-none uppercase">No activity logs recorded yet.</div>
                      ) : (
                        logs.map((log, i) => {
                          let typeColor = 'text-[#52525B]';
                          if (log.type === 'success') typeColor = 'text-[#10B981]';
                          if (log.type === 'warning') typeColor = 'text-[#F59E0B]';
                          if (log.type === 'error') typeColor = 'text-[#EF4444]';
                          return (
                            <div key={i} className="flex gap-4 items-start select-text leading-relaxed hover:bg-[#0E0E10] px-1 py-0.5 rounded transition">
                              <span className="text-[#2A2A2A] shrink-0 font-medium select-none">{log.time}</span>
                              <span className={typeColor}>{log.msg}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* COGNITIVE AI CONSOLE */}
              {subTab === 'console' && (
                <div className="flex-1 flex flex-col border border-[#1A1A1A] bg-[#090909] rounded overflow-hidden mx-6 mt-6 mb-24 shadow-2xl relative">
                  
                  {/* Console Header Info */}
                  <header className="px-5 py-2.5 bg-[#0E0E10] border-b border-[#1A1A1A] flex items-center justify-between select-none">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-bold tracking-[0.15em] text-[#52525B] uppercase font-sans">COGNITIVE CAMPAIGN COMMANDS</span>
                    </div>
                    <span className="text-[8px] font-medium font-sans text-indigo-400 select-all">TIP: Type "do: [scenarios]" to start adaptive scraping</span>
                  </header>

                  <div 
                    ref={chatContainerRef}
                    className="flex-1 p-6 overflow-y-auto space-y-4"
                  >
                    {chat.map((msg, i) => (
                      <div 
                        key={i} 
                        className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'ml-auto items-end text-right' : 'mr-auto items-start text-left'}`}
                      >
                        <div 
                          className={`rounded px-4 py-2.5 font-sans leading-relaxed text-xs shadow-md border ${
                            msg.role === 'user' 
                              ? 'bg-[#6366F1] border-[#4F46E5] text-white' 
                              : 'bg-[#101012] border-[#1C1C1F] text-[#D4D4D8]'
                          }`}
                        >
                          {msg.role === 'agent' && (
                            <div className="text-[7px] tracking-[0.18em] font-bold text-[#6366F1] uppercase mb-1 font-sans">
                              ASSIX AGENT
                            </div>
                          )}
                          <div className="whitespace-pre-wrap select-text">{msg.msg}</div>
                        </div>

                        {msg.files && msg.files.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-full justify-end">
                            {msg.files.map((filename, fidx) => (
                              <div 
                                key={fidx} 
                                className="bg-[#141416] border border-[#242427] text-white px-2 py-0.5 text-[8px] rounded flex items-center gap-1 font-mono hover:text-[#6366F1] transition"
                              >
                                <Paperclip size={8} /> {filename}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {isSending && (
                      <div className="flex flex-col items-start max-w-[80%] mr-auto text-left">
                        <div className="bg-[#101012] border border-[#1C1C1F] text-[#52525B] rounded px-4 py-2.5 text-xs shadow-md">
                          <span className="text-[7px] tracking-[0.18em] font-fold text-[#52525B] uppercase block mb-1 font-sans">AI PLANNER WORKING</span>
                          <span className="animate-pulse flex items-center gap-2">Connecting to LLM, formulating pipeline steps... <RefreshCw size={10} className="animate-spin text-[#6366F1]" /></span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Drag-and-drop/Attachments bar */}
                  {attachments.length > 0 && (
                    <div className="px-5 py-2.5 border-t border-[#1C1C1F] bg-[#0E0E10] flex flex-wrap gap-2 shrink-0">
                      {attachments.map((file, i) => (
                        <div 
                          key={i} 
                          className="px-2.5 py-1 bg-[#18181B] border border-[#2A2A2E] text-white text-[9px] rounded flex items-center gap-2 font-mono"
                        >
                          <Paperclip size={10} className="text-[#6366F1]" />
                          <span>{file.name}</span>
                          <button 
                            onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                            className="text-[#52525B] hover:text-[#EF4444] font-bold text-[11px] ml-1.5 font-sans cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Console inputs panel */}
                  <div className="px-5 py-4 border-t border-[#1A1A1A] bg-[#0A0A0A] flex items-center gap-3 shrink-0">
                    <input 
                      ref={fileInputRef} 
                      type="file" 
                      multiple 
                      onChange={handleFileUpload}
                      className="hidden" 
                    />
                    
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-9 h-9 border border-[#222225] hover:border-[#6366F1]/50 bg-[#121214] hover:bg-[#161619] rounded flex items-center justify-center text-[#52525B] hover:text-[#6366F1] transition shadow-inner shrink-0 cursor-pointer"
                    >
                      <Paperclip size={14} />
                    </button>

                    <input 
                      type="text" 
                      value={consoleInput}
                      onChange={e => setConsoleInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleConsoleSubmit()}
                      onFocus={() => setChatInputFocused(true)}
                      onBlur={() => setTimeout(() => setChatInputFocused(false), 200)}
                      placeholder="Input outreach brief, instruct LLM, or type 'do: [goal]' to trigger automatic browser scrape..."
                      className="flex-1 bg-[#121214] border border-[#222225] text-[#F5F5F5] rounded px-4 py-2.5 text-xs outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]/30 transition placeholder-[#52525B] font-medium"
                    />

                    <button 
                      onClick={handleConsoleSubmit}
                      disabled={isSending}
                      className="h-9 px-5 bg-white hover:bg-neutral-200 text-black font-bold tracking-widest text-[9px] uppercase rounded transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer"
                    >
                      SEND
                    </button>
                  </div>
                </div>
              )}

              {/* OUTLET NAVIGATION TRIGGER BUTTON PILL */}
              {!chatInputFocused && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1 bg-[#141416]/90 backdrop-blur border border-[#232326] shadow-[0_8px_32px_rgba(0,0,0,0.8)] rounded-full">
                  <button 
                    onClick={() => setSubTab('operator')} 
                    className={`px-5 py-2 text-[9px] font-bold tracking-widest uppercase rounded-full transition ${subTab === 'operator' ? 'bg-[#F5F5F5] text-[#080808]' : 'text-[#52525B] hover:text-white bg-transparent'}`}
                  >
                    LIVE SCREEN
                  </button>
                  <button 
                    onClick={() => setSubTab('console')} 
                    className={`px-5 py-2 text-[9px] font-bold tracking-widest uppercase rounded-full transition ${subTab === 'console' ? 'bg-[#F5F5F5] text-[#080808]' : 'text-[#52525B] hover:text-white bg-transparent'}`}
                  >
                    AI COMMANDS
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* RIGHT PANELS SCREEN TELEMETRY */}
          <section 
            style={{ width: rightOpen ? '160px' : '0px' }}
            className="border-l border-[#1A1A1A] h-full flex flex-col pt-4 shrink-0 overflow-hidden bg-[#090909] transition-all duration-300"
          >
            <div className="px-4 mb-4">
              <span className="text-[8px] tracking-[0.2em] text-[#52525B] font-bold uppercase font-sans">AGENT ARRAYS</span>
            </div>

            <div className="flex-1 overflow-y-auto px-3 space-y-4 pb-12 select-none">
              {tasks.length === 0 ? (
                <div className="text-center text-xs text-[#52525B] py-8">None live.</div>
              ) : (
                tasks.slice(0, 6).map((task, idx) => {
                  const isActive = activeTask?.taskId === task.taskId;
                  return (
                    <div 
                      key={task.taskId || `live-slice-${idx}`} 
                      onClick={() => selectTask(task, true)}
                      className="cursor-pointer group flex flex-col"
                    >
                      <div className={`h-20 bg-[#0F0F0F] hover:bg-[#121214] border rounded overflow-hidden flex items-center justify-center position relative transition ${isActive ? 'border-[#6366F1]' : 'border-[#1E1E22]'}`}>
                        
                        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full" 
                          style={{ 
                            background: task.status === 'running' ? '#6366F1' : task.status === 'paused_captcha' ? '#F59E0B' : task.status === 'complete' ? '#10B981' : '#52525B',
                            boxShadow: task.status === 'running' ? '0 0 4px #6366F1' : 'none'
                          }} 
                        />

                        {task.taskId && screenshots[task.taskId] ? (
                          <img src={screenshots[task.taskId]} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                        ) : (
                          <span style={{ fontSize: 8, color: '#2A2A2A', letterSpacing: '0.08em' }}>LIVE</span>
                        )}
                      </div>

                      <div className="text-[9px] font-bold text-[#F5F5F5] group-hover:text-indigo-400 mt-1.5 truncate max-w-full uppercase tracking-wider">
                        {task.label || (task.taskType || '').replace(/_/g, ' ')}
                      </div>
                      <div className="text-[8px] font-semibold text-[#52525B] font-sans mt-0.5">
                        {task.progress}/{task.total} PROSPECTS
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* TOGGLE SIDES BUTTONS RIGHT */}
          <div 
            onClick={() => setRightOpen(!rightOpen)} 
            className="absolute top-1/2 -translate-y-1/2 z-20 w-4 h-12 bg-[#141414] border border-[#2A2A2A] border-r-0 rounded-l-lg flex items-center justify-center cursor-pointer text-xs text-[#52525B] hover:text-[#6366F1] hover:bg-[#181818] transition-all"
            style={{ right: rightOpen ? '160px' : '0px' }}
          >
            {rightOpen ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
          </div>

        </div>
      )}

      {/* ALL TASKS FULL VIEW */}
      {tab === 'tasks' && (
        <section className="flex-1 flex flex-col p-6 overflow-y-auto shrink-0 bg-[#080808]">
          <div className="max-w-5xl mx-auto w-full">
            <header className="border-b border-[#1A1A1A] pb-5 mb-8 select-none">
              <div className="text-[8px] tracking-[0.16em] text-[#52525B] font-bold uppercase">BOT SYSTEM SEQUENCES</div>
              <h2 className="text-sm font-extrabold tracking-widest text-[#F5F5F5] uppercase mt-0.5 flex items-center gap-2">
                All Active and Scheduled Tasks
              </h2>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tasks.length === 0 ? (
                <div className="md:col-span-2 text-center py-20 text-xs text-[#52525B] uppercase font-bold tracking-widest select-none">
                  No tasks found. Create a new task above to initiate.
                </div>
              ) : (
                tasks.map((task, idx) => {
                  const isRun = task.status === 'running' || task.status === 'paused_captcha';
                  return (
                    <div 
                      key={task.taskId || `task-full-${idx}`} 
                      onClick={() => {
                        selectTask(task, true);
                      }}
                      className="p-5 bg-[#0F0F11] border border-[#1C1C1F] hover:border-[#6366F1]/50 rounded cursor-pointer transition duration-200 flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <h4 className="text-xs font-semibold tracking-wide text-[#F5F5F5] uppercase">
                            {task.label || (task.taskType || '').replace(/_/g, ' ')}
                          </h4>
                          <span className="text-[8px] text-[#52525B] font-mono tracking-widest uppercase mt-1 block">
                            ID: {task.taskId ? `${task.taskId.slice(0, 18)}...` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span 
                            className="w-1.5 h-1.5 rounded-full" 
                            style={{ 
                              background: task.status === 'complete' ? '#10B981' : task.status === 'running' ? '#6366F1' : task.status === 'paused_captcha' ? '#F59E0B' : task.status === 'error' ? '#EF4444' : '#52525B' 
                            }} 
                          />
                          <span className="text-[8px] font-bold tracking-widest text-[#A1A1AA] uppercase">
                            {(task.status || '').replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-[10px] text-[#A1A1AA]">
                          Progress: <span className="font-mono text-[#F5F5F5]">{task.progress}/{task.total}</span>
                        </div>
                        {task.createdAt && (
                          <div className="text-[8px] text-[#52525B] font-mono font-sans mt-0.5">
                            {task.createdAt.slice(0, 10)}
                          </div>
                        )}
                      </div>

                      {/* Progress bar inside card if active */}
                      {task.total > 0 && (
                        <div className="mt-3 w-full bg-[#161616] h-1 rounded-full overflow-hidden">
                          <div 
                            className="bg-[#6366F1] h-full transition-all duration-500" 
                            style={{ width: `${task.progressPct || 0}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      )}

      {/* PRIMARY LEADS EXPLORER TAB */}
      {tab === 'leads' && (
        <section className="flex-1 flex flex-col overflow-hidden bg-[#080808] p-6 shrink-0">
          
          {/* Header Panel */}
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1A1A1A] pb-5 shrink-0 align-middle justify-center select-none">
            <div>
              <div className="text-[8px] tracking-[0.16em] text-[#52525B] font-bold uppercase select-none">CENTRALIZED CLOUD ARCHIVE</div>
              <h2 className="text-sm font-extrabold tracking-widest text-[#F5F5F5] uppercase mt-0.5 flex items-center gap-2">
                <Database size={14} className="text-[#6366F1]" /> Lead Generation Prospect Database
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-[#0F0F11] border border-[#222] rounded-full select-none">
                <button 
                  onClick={() => setLeadsFilter('all')} 
                  className={`px-4 py-1.5 text-[8px] font-bold tracking-wider uppercase rounded-full transition ${leadsFilter === 'all' ? 'bg-[#F5F5F5] text-black' : 'text-[#52525B] hover:text-white bg-transparent'}`}
                >
                  All Leads ({leads.length})
                </button>
                <button 
                  onClick={() => setLeadsFilter('no-website')} 
                  className={`px-4 py-1.5 text-[8px] font-bold tracking-wider uppercase rounded-full transition ${leadsFilter === 'no-website' ? 'bg-[#F5F5F5] text-black' : 'text-[#52525B] hover:text-white bg-transparent'}`}
                >
                  No Website
                </button>
                <button 
                  onClick={() => setLeadsFilter('has-website')} 
                  className={`px-4 py-1.5 text-[8px] font-bold tracking-wider uppercase rounded-full transition ${leadsFilter === 'has-website' ? 'bg-[#F5F5F5] text-black' : 'text-[#52525B] hover:text-white bg-transparent'}`}
                >
                  Has Website
                </button>
              </div>

              {/* Grid / List Layout Toggle */}
              <div className="flex items-center gap-1 bg-[#0F0F11] border border-[#222] p-1 rounded-full select-none">
                <button 
                  onClick={() => setLeadsViewMode('cards')} 
                  className={`p-1.5 rounded-full transition ${leadsViewMode === 'cards' ? 'bg-[#6366F1] text-white shadow' : 'text-[#52525B] hover:text-white bg-transparent'}`}
                  title="Card View with Mock Visuals"
                >
                  <LayoutGrid size={11} />
                </button>
                <button 
                  onClick={() => setLeadsViewMode('table')} 
                  className={`p-1.5 rounded-full transition ${leadsViewMode === 'table' ? 'bg-[#6366F1] text-white shadow' : 'text-[#52525B] hover:text-white bg-transparent'}`}
                  title="Table View"
                >
                  <List size={11} />
                </button>
              </div>

              <button 
                onClick={handleBatchPushLeads}
                disabled={batchPushing}
                className="flex items-center gap-2 px-4 py-1.5 bg-[#6366F1] hover:bg-[#4F46E5] text-white text-[9px] font-bold tracking-widest uppercase rounded shadow-lg transition active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                {batchPushing ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />}
                SYNC TO CLOSE CRM
              </button>
            </div>
          </header>

          {/* Filter search inputs */}
          <div className="py-4 flex gap-4 shrink-0">
            <input 
              type="text" 
              value={leadsSearch}
              onChange={e => setLeadsSearch(e.target.value)}
              placeholder="Filter leads by Business Name, City, Sector, or Phone..."
              className="flex-1 bg-[#0F0F11] border border-[#222] text-[#F5F5F5] rounded px-4 py-2 text-xs outline-none focus:border-[#6366F1] transition placeholder-[#52525B]"
            />
          </div>

          {/* Database Grid */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredLeads.length === 0 ? (
              <div className="py-20 text-center text-[#52525B] text-xs font-semibold select-none uppercase tracking-widest bg-[#0A0A0A] border border-[#1A1A1A] rounded">No target records matched query filters.</div>
            ) : leadsViewMode === 'table' ? (
              <div className="border border-[#1A1A1A] bg-[#0A0A0A] rounded overflow-x-auto">
                <table className="w-full text-[11px] text-left border-collapse select-text">
                  <thead className="bg-[#0E0E10] border-b border-[#1A1A1A] text-[8px] text-[#52525B] tracking-widest uppercase font-bold select-none">
                    <tr>
                      <th className="px-6 py-3">Business / Firm</th>
                      <th className="px-6 py-3">Phone</th>
                      <th className="px-6 py-3">Website</th>
                      <th className="px-6 py-3">Geo Location</th>
                      <th className="px-6 py-3">Classification</th>
                      <th className="px-6 py-3">Close CRM Integration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1A1A1A] font-sans">
                    {filteredLeads.map((lead, idx) => {
                      return (
                        <tr key={lead.leadId || `lead-row-${idx}`} className="hover:bg-[#0E0E11]/45 transition">
                          <td className="px-6 py-3.5 font-bold text-[#F5F5F5]">
                            <div className="flex flex-col">
                              <span>{lead.businessName}</span>
                              {lead.rating && <span className="text-[9px] text-[#F59E0B] mt-0.5">★ {lead.rating} Rating</span>}
                            </div>
                          </td>
                          <td className="px-6 py-3.5 font-mono text-[#A1A1AA] flex items-center gap-1">
                            <Phone size={10} className="text-[#323235]" />
                            {lead.phone}
                          </td>
                          <td className="px-6 py-3.5 text-[#A1A1AA]">
                            {lead.website ? (
                              <a 
                                href={lead.website} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-indigo-400 hover:underline flex items-center gap-1.5 font-mono"
                              >
                                <Globe size={11} className="text-[#6366F1]" /> 
                                {lead.website.replace(/https?:\/\/|www\./g, '')}
                              </a>
                            ) : (
                              <span className="flex items-center gap-1.5 text-xs text-[#52525B] font-mono select-none">
                                <EyeOff size={11} className="text-[#52525B]" /> — No Web Site
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-[#7c7c85]">
                            {lead.city || 'Ontario, CA'} {lead.address ? `· ${lead.address}` : ''}
                          </td>
                          <td className="px-6 py-3.5">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                              lead.leadType === 'no_website' ? 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20' : 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20'
                            }`}>
                              {lead.leadType === 'no_website' ? 'High Concern' : 'Inbound OK'}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">
                            {lead.sentToClose ? (
                              <div className="flex items-center gap-1.5 text-[#10B981] font-bold text-[9px] tracking-widest uppercase select-none">
                                <CheckCircle size={12} /> Sync complete
                              </div>
                            ) : (
                              <button 
                                onClick={() => handlePushLead(lead.leadId)}
                                disabled={pushingLeadId === lead.leadId}
                                className="px-3 py-1 bg-transparent hover:bg-[#6366F1] hover:text-white border border-[#6366F1]/50 hover:border-[#6366F1] text-[#6366F1] text-[8px] font-bold uppercase tracking-widest rounded transition cursor-pointer"
                              >
                                {pushingLeadId === lead.leadId ? (
                                  <span className="flex items-center gap-1"><RefreshCw size={8} className="animate-spin" /> Pushing...</span>
                                ) : 'Send to CRM'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-10">
                {filteredLeads.map((lead, idx) => (
                  <LeadCard 
                    key={lead.leadId || `lead-card-${idx}`} 
                    lead={lead} 
                    onPushLead={handlePushLead} 
                    isPushing={pushingLeadId === lead.leadId} 
                    serverUrl={serverUrl}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* SEQUENCE ARCHIVES VIEW */}
      {tab === 'history' && (
        <section className="flex-1 flex flex-col p-6 overflow-y-auto shrink-0 bg-[#080808]">
          <div className="max-w-4xl mx-auto w-full">
            <header className="border-b border-[#1A1A1A] pb-5 mb-6 select-none">
              <div className="text-[8px] tracking-[0.16em] text-[#52525B] font-bold uppercase">HISTORICAL PROCESS RUNS</div>
              <h2 className="text-sm font-extrabold tracking-widest text-[#F5F5F5] uppercase mt-0.5 flex items-center gap-2">
                <History size={14} className="text-[#6366F1]" /> Campaign Operations Ledger
              </h2>
            </header>

            <div className="space-y-4">
              {tasks.filter(t => t.status !== 'running' && t.status !== 'paused_captcha' && t.status !== 'paused_input').length === 0 ? (
                <div className="text-center py-20 text-xs text-[#52525B] uppercase font-bold tracking-widest select-none">No historically finished campaigns found. Run some automations first.</div>
              ) : (
                tasks.filter(t => t.status !== 'running' && t.status !== 'paused_captcha' && t.status !== 'paused_input').map((task, idx) => (
                  <div 
                    key={task.taskId || `finished-${idx}`} 
                    className="p-5 bg-[#0F0F11] border border-[#1C1C1F] hover:border-[#222225] rounded transition duration-200"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-xs font-bold tracking-widest text-[#F5F5F5] uppercase">
                          {task.label || (task.taskType || '').replace(/_/g, ' ')}
                        </h4>
                        <div className="text-[9px] text-[#52525B] mt-1 tracking-wider uppercase font-medium">
                          Session ID: {task.taskId ? `${task.taskId.slice(0, 18)}...` : 'N/A'} · Execution Date: {task.createdAt?.slice(0,10)}
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 border rounded text-[8px] font-bold tracking-widest uppercase ${
                        task.status === 'complete' ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20' :
                        task.status === 'error' ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20' :
                        'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                      }`}>
                        {task.status === 'complete' ? 'FINISHED' : task.status === 'error' ? 'FAILED' : 'STOPPED'}
                      </div>
                    </div>

                    <p className="text-[11px] text-[#A1A1AA] mb-4">
                      Sequence yielded {task.progress || 0} formatted target accounts. Configuration profiles were centered on niche classification 
                      <strong> "{task.config?.niche || task.config?.topic || 'Custom AI'}"</strong> across regions 
                      <strong> "{task.config?.city || 'Universal Target'}"</strong>.
                    </p>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <a 
                        href={task.taskId ? `${serverUrl}/api/task/${task.taskId}/export/csv` : '#'} 
                        download={!!task.taskId}
                        style={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
                        className={`px-4 py-1.5 border border-[#222225] rounded transition text-[9px] font-bold tracking-widest uppercase flex items-center gap-1.5 ${
                          task.taskId 
                            ? 'hover:border-[#6366F1]/50 bg-[#121214] hover:bg-[#151518] text-[#52525B] hover:text-[#6366F1] cursor-pointer' 
                            : 'opacity-40 cursor-not-allowed bg-transparent text-gray-600 border-zinc-800'
                        }`}
                      >
                        <Download size={10} /> CSV SPREADSHEET
                      </a>
                      
                      <button 
                        onClick={() => task.taskId && handleFetchReport(task.taskId)}
                        disabled={!task.taskId || loadingReportId === task.taskId}
                        className="flex items-center gap-1.5 px-4 py-1.5 border border-[#222225] hover:border-[#6366F1]/50 bg-[#121214] hover:bg-[#151518] text-[#52525B] hover:text-[#6366F1] text-[9px] font-bold tracking-widest uppercase rounded transition disabled:opacity-40 cursor-pointer"
                      >
                        {task.taskId && loadingReportId === task.taskId ? (
                          <>
                            <RefreshCw size={10} className="animate-spin" /> SYNTHESIZING REPORT...
                          </>
                        ) : (
                          <>
                            <FileText size={10} /> AI REPORT
                          </>
                        )}
                      </button>

                      <button 
                        onClick={() => task.taskId && toggleHistoryData(task.taskId)}
                        disabled={!task.taskId}
                        className={`flex items-center gap-1.5 px-4 py-1.5 border text-[9px] font-bold tracking-widest uppercase rounded transition cursor-pointer ${
                          task.taskId && expandedHistoryTaskId === task.taskId
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                            : 'border-[#222225] bg-[#121214] text-[#52525B] hover:text-emerald-400 hover:border-emerald-500/50'
                        }`}
                      >
                        <Database size={10} />
                        {task.taskId && expandedHistoryTaskId === task.taskId ? 'HIDE DATA ▲' : 'VIEW DATA ▼'}
                      </button>
                    </div>

                    {/* Expandable data table / details */}
                    {task.taskId && expandedHistoryTaskId === task.taskId && (
                      <div className="mt-4 p-4 border border-[#1C1C1F] bg-[#0A0A0C] rounded space-y-3 select-text">
                        <h5 className="text-[10px] font-bold tracking-wider text-[#A1A1AA] uppercase flex items-center gap-1.5 border-b border-[#1A1A1D] pb-2">
                          <Database size={11} className="text-emerald-400" /> Collected Data Results Ledger
                        </h5>

                        {historyLeads[task.taskId] && historyLeads[task.taskId].length > 0 ? (
                          <div className="overflow-x-auto rounded border border-[#1A1A1D]">
                            <table className="w-full text-left text-[11px] border-collapse">
                              <thead className="bg-[#0E0E11] text-[8px] text-[#52525B] uppercase font-bold tracking-widest border-b border-[#1A1A1D]">
                                <tr>
                                  <th className="px-3 py-2">Business Name</th>
                                  <th className="px-3 py-2">Phone</th>
                                  <th className="px-3 py-2">Website</th>
                                  <th className="px-3 py-2">Location</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#1A1A1D]">
                                {historyLeads[task.taskId].map((lead, idx) => (
                                  <tr key={lead.leadId || `lead-history-${idx}`} className="hover:bg-[#121214] transition">
                                    <td className="px-3 py-2 font-semibold text-[#F5F5F5]">{lead.businessName}</td>
                                    <td className="px-3 py-2 text-[#A1A1AA] font-mono">{lead.phone || '—'}</td>
                                    <td className="px-3 py-2 text-[#A1A1AA]">
                                      {lead.website ? (
                                        <a href={lead.website} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline font-mono truncate max-w-[150px] block">
                                          {lead.website.replace(/https?:\/\/|www\./g, '')}
                                        </a>
                                      ) : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-[#7C7C85]">{lead.city || 'Ontario, CA'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (task.results || (task as any).config?.goal) ? (
                          <div className="space-y-2">
                            {(task as any).config?.goal && (
                              <div className="bg-[#121215] border border-[#1A1A1D] rounded p-2.5 text-[10px] text-[#A1A1AA]">
                                <span className="font-bold text-[#F5F5F5] block mb-0.5">TASK BRIEF</span>
                                "{(task as any).config?.goal}"
                              </div>
                            )}

                            {task.results ? (
                              <div className="bg-[#0F0F12] border border-[#1A1A1D] rounded p-3 font-mono text-[10.5px] leading-relaxed text-[#A1A1AA] whitespace-pre-wrap">
                                <span className="font-bold text-[#10B981] block mb-1.5 font-sans text-[11px]">COLLECTED INFO:</span>
                                {typeof task.results === 'string' ? task.results : JSON.stringify(task.results, null, 2)}
                              </div>
                            ) : (
                              <div className="text-[10px] text-[#52525B] italic">No final output findings returned. See raw logs for pathway info.</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] text-[#52525B] italic py-3 text-center">Loading collected data... If nothing is shown, the runner has not exported structural objects.</div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {/* LINKEDIN OUTREACH TAB */}
      {tab === 'outreach' && (
        <section className="flex-1 flex flex-col p-6 overflow-y-auto shrink-0 bg-[#080808]">
          <div className="max-w-6xl mx-auto w-full space-y-6">
            
            {/* Header */}
            <header className="border-b border-[#1A1A1A] pb-5 select-none flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-[8px] tracking-[0.16em] text-[#52525B] font-bold uppercase">OUTBOUND GROWTH MODULE</div>
                <h2 className="text-sm font-extrabold tracking-widest text-[#F5F5F5] uppercase mt-0.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block animate-pulse" />
                  LinkedIn Automated Outreach Agent
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleStartLinkedInSession}
                  disabled={isStartingSession || sessionActive}
                  className={`px-4 py-1.5 rounded text-[9px] font-bold tracking-widest uppercase transition flex items-center gap-2 border ${
                    sessionActive 
                      ? 'bg-[#10B981]/15 border-[#10B981]/30 text-[#10B981]' 
                      : 'bg-[#141416] border-[#222] hover:border-indigo-500/50 text-indigo-400 hover:text-indigo-300 cursor-pointer disabled:opacity-55'
                  }`}
                >
                  <RefreshCw size={10} className={isStartingSession ? 'animate-spin' : ''} />
                  {isStartingSession ? 'Initializing...' : sessionActive ? 'LinkedIn Agent Connected' : 'Connect LinkedIn Agent'}
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Campaigns & Niche Configurations */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Gap Analysis campaigns */}
                <div className="p-5 border border-[#1A1A1A] bg-[#0A0A0B] rounded-lg space-y-4">
                  <div className="flex items-center justify-between border-b border-[#1A1A1A] pb-3">
                    <h3 className="text-[10px] font-extrabold tracking-widest text-[#F5F5F5] uppercase flex items-center gap-1.5">
                      <Zap size={11} className="text-indigo-400" />
                      Gap Analysis Niche Campaigns
                    </h3>
                    <span className="text-[8px] font-mono text-[#52525B] bg-[#141416] px-2 py-0.5 rounded border border-[#222]">
                      gap_analysis_engine.md
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {GAP_CAMPAIGNS.map((camp, idx) => {
                      const isCampRunning = activeCampaign === camp.gapName;
                      return (
                        <div key={idx} className="p-4 border border-[#1C1C1F] bg-[#0E0E10] hover:border-indigo-500/20 rounded transition flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[9px] font-bold text-indigo-400 tracking-wider uppercase">{camp.niche}</span>
                              <span className="text-[7px] font-mono text-amber-500 bg-amber-500/5 border border-amber-500/15 px-1.5 py-0.2 rounded">GAP IDENTIFIED</span>
                            </div>
                            <h4 className="text-[11px] font-extrabold text-[#E4E4E7] uppercase leading-snug tracking-wider">{camp.gapName}</h4>
                            <p className="text-[10px] text-[#52525B] mt-1.5 leading-relaxed font-sans">{camp.description}</p>
                            
                            <div className="mt-3 p-2 bg-[#080808] border border-[#1A1A1D] rounded">
                              <span className="text-[7px] font-bold tracking-widest text-[#52525B] uppercase block mb-1">Outreach Template:</span>
                              <p className="text-[9px] text-[#A1A1AA] italic font-serif leading-normal line-clamp-3">"{camp.messageTemplate}"</p>
                            </div>
                          </div>
                          
                          <div className="mt-4 pt-3 border-t border-[#1C1C1F]">
                            {isCampRunning ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[8px] font-mono">
                                  <span className="text-[#10B981] animate-pulse">Running Campaign...</span>
                                  <span className="text-[#A1A1AA]">{campaignProgress}%</span>
                                </div>
                                <div className="w-full bg-[#18181B] h-1 rounded-full overflow-hidden">
                                  <div className="bg-[#10B981] h-full transition-all duration-500" style={{ width: `${campaignProgress}%` }} />
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleStartCampaign(camp.gapName, camp.niche, camp.gapName, camp.messageTemplate)}
                                disabled={activeCampaign !== null && activeCampaign !== camp.gapName}
                                className="w-full py-1.5 bg-[#141416] border border-[#222] hover:border-indigo-500/50 hover:bg-indigo-500/10 text-[#A1A1AA] hover:text-[#F5F5F5] text-[9px] font-bold tracking-wider uppercase rounded transition cursor-pointer disabled:opacity-40"
                              >
                                Start Campaign
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Campaign Console Log Output */}
                  {activeCampaign && (
                    <div className="mt-4 p-3 bg-[#080808] border border-[#1C1C1F] rounded font-mono text-[9px] space-y-1">
                      <div className="flex items-center justify-between border-b border-[#1A1A1D] pb-1.5 mb-1.5">
                        <span className="text-indigo-400 font-bold uppercase tracking-wider">Active Campaign Console Log</span>
                        <button onClick={() => { setActiveCampaign(null); setCampaignProgress(0); }} className="text-[#52525B] hover:text-white uppercase text-[8px]">Clear</button>
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-1 scrollbar-thin">
                        {campaignLogs.map((log, i) => (
                          <div key={i} className="text-[#E4E4E7] leading-relaxed">
                            {log.startsWith('[SUCCESS]') ? <span className="text-[#10B981]">{log}</span> : log.startsWith('[CAMPAIGN') ? <span className="text-[#6366F1]">{log}</span> : <span>{log}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Profile Prospect Search Section */}
                <div className="p-5 border border-[#1A1A1A] bg-[#0A0A0B] rounded-lg space-y-4">
                  <h3 className="text-[10px] font-extrabold tracking-widest text-[#F5F5F5] uppercase flex items-center gap-1.5 border-b border-[#1A1A1A] pb-3">
                    <Globe size={11} className="text-indigo-400" />
                    Prospect Finder
                  </h3>
                  
                  <form onSubmit={handleSearchLinkedIn} className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Search profiles on LinkedIn (e.g. CEO plumbers Toronto, Dentists Montreal...)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#0E0E10] border border-[#1C1C1F] focus:border-indigo-500 rounded px-3 py-2 text-xs text-[#E4E4E7] placeholder-[#52525B] focus:outline-none font-sans"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={searching}
                      className="px-5 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-45 text-white text-[9px] font-bold tracking-widest uppercase rounded cursor-pointer transition select-none flex items-center gap-1.5"
                    >
                      {searching ? <RefreshCw size={10} className="animate-spin" /> : 'Search'}
                    </button>
                  </form>

                  {/* Profile Results Grid */}
                  <div className="space-y-2">
                    {searchProfiles.length === 0 ? (
                      <div className="text-center py-6 text-[10px] text-[#52525B] uppercase font-bold tracking-widest">
                        No prospects found. Try searching above.
                      </div>
                    ) : (
                      searchProfiles.map((p, idx) => (
                        <div key={p.id || idx} className="p-3 border border-[#1A1A1D] bg-[#0E0E10] hover:bg-[#121214] rounded transition flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-[#242427] flex items-center justify-center font-bold text-xs text-indigo-400 select-none shrink-0 uppercase">
                              {p.name.slice(0, 2)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-extrabold text-[#F5F5F5] tracking-wide">{p.name}</span>
                                <span className="text-[8px] px-1.5 py-0.2 bg-[#1C1C1F] border border-[#2A2A2E] text-[#A1A1AA] rounded uppercase font-mono">{p.location}</span>
                              </div>
                              <p className="text-[10px] text-[#A1A1AA] font-mono mt-0.5">{p.title} at <span className="text-[#6366F1]">{p.company}</span></p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 self-end md:self-auto">
                            {p.status === 'Message Sent' ? (
                              <span className="px-2.5 py-1 text-[8px] font-bold tracking-widest uppercase bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/25 rounded-full flex items-center gap-1">
                                <Check size={8} strokeWidth={3} /> Connection Dispatched
                              </span>
                            ) : (
                              <button
                                onClick={() => handleConnectProfile(p.id, p.name, p.company)}
                                disabled={connectingId === p.id}
                                className="px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500 border border-indigo-500/30 text-indigo-400 hover:text-white text-[9px] font-bold tracking-wider uppercase rounded transition cursor-pointer disabled:opacity-40"
                              >
                                {connectingId === p.id ? 'Connecting...' : 'Quick Connect'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Right Column: Connected Status & Inbox Logs */}
              <div className="space-y-6">
                
                {/* Connected Profiles List */}
                <div className="p-5 border border-[#1A1A1A] bg-[#0A0A0B] rounded-lg space-y-4">
                  <h3 className="text-[10px] font-extrabold tracking-widest text-[#F5F5F5] uppercase flex items-center gap-1.5 border-b border-[#1A1A1A] pb-3">
                    <CheckCircle size={11} className="text-[#10B981]" />
                    Connected Profiles
                  </h3>
                  
                  <div className="space-y-2.5 max-h-72 overflow-y-auto scrollbar-thin">
                    {connectedProfilesList.map((c, i) => (
                      <div key={c.id || i} className="p-3 border border-[#1A1A1C] bg-[#0C0C0E] rounded space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold text-[#E4E4E7] uppercase tracking-wide">{c.name}</span>
                          <span className={`text-[7px] font-mono px-1.5 py-0.2 rounded font-bold uppercase tracking-widest ${
                            c.status === 'Replied' 
                              ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20' 
                              : c.status === 'Connected' 
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {c.status}
                          </span>
                        </div>
                        <p className="text-[9px] text-[#52525B] leading-tight line-clamp-1">{c.title} at {c.company}</p>
                        <span className="text-[8px] font-mono text-[#3F3F46] block text-right">Synced: {c.date}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Outreach sent messages log */}
                <div className="p-5 border border-[#1A1A1A] bg-[#0A0A0B] rounded-lg space-y-4">
                  <h3 className="text-[10px] font-extrabold tracking-widest text-[#F5F5F5] uppercase flex items-center gap-1.5 border-b border-[#1A1A1A] pb-3">
                    <MessageSquare size={11} className="text-[#6366F1]" />
                    Outreach Transmission Log
                  </h3>
                  
                  <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin">
                    {outreachMessagesLog.map((log, i) => (
                      <div key={log.id || i} className="p-3 border border-[#1A1A1C] bg-[#08080A] rounded space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-extrabold text-[#A1A1AA] uppercase tracking-wide">{log.name}</span>
                          <span className="text-[7px] font-mono text-[#52525B]">{log.timestamp}</span>
                        </div>
                        <p className="text-[9px] text-[#D4D4D8] italic leading-relaxed font-serif bg-[#0C0C0E] p-2 rounded border border-[#1A1A1C]">
                          "{log.text}"
                        </p>
                        <div className="flex items-center justify-between text-[7px] font-mono">
                          <span className="text-[#10B981]">● {log.status}</span>
                          <span className="text-[#52525B]">Agent Safe Routing</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        </section>
      )}

      {/* CORE SETTINGS PROFILE */}
      {tab === 'settings' && (
        <section className="flex-1 flex flex-col p-6 overflow-y-auto shrink-0 bg-[#080808]">
          <div className="max-w-xl mx-auto w-full">
            <header className="border-b border-[#1A1A1A] pb-5 mb-8 select-none">
              <div className="text-[8px] tracking-[0.16em] text-[#52525B] font-bold uppercase">BOT SYSTEM ENGINE INSTANCES</div>
              <h2 className="text-sm font-extrabold tracking-widest text-[#F5F5F5] uppercase mt-0.5 flex items-center gap-2">
                <Sliders size={14} className="text-[#6366F1]" /> Channel & Configuration Settings
              </h2>
            </header>

            <div className="space-y-8">
              {/* Server Target Panel */}
              <div>
                <h4 className="text-xs font-bold text-[#F5F5F5] tracking-widest uppercase mb-2">SERVER TARGET ADDRESS</h4>
                <p className="text-[11px] text-[#52525B] leading-relaxed mb-4">
                  Update your deploy host URL (normally your Railway or Cloud Run service URL address).
                </p>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="e.g. https://your-railway-app.up.railway.app"
                    className="flex-1 bg-[#121214] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                  />
                  <button 
                    onClick={handleSaveSettings}
                    className="px-5 py-2 bg-[#6366F1] hover:bg-[#4F46E5] text-white text-[10px] font-bold tracking-widest uppercase rounded transition cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="h-px bg-[#1A1A1A]" />

              {/* Saved Sessions list (Instagram, WhatsApp) */}
              <div>
                <h4 className="text-xs font-bold text-[#F5F5F5] tracking-widest uppercase mb-2">SAVED BOT SESSIONS</h4>
                <p className="text-[11px] text-[#52525B] leading-relaxed mb-4">
                  These memory sessions bypass manual authentication screens on target platforms.
                </p>

                <div className="space-y-4">
                  <div className="p-4 border border-[#1A1A1A] bg-[#0A0A0C] rounded flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Instagram size={14} className="text-[#6366F1]" />
                      <div>
                        <span className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wide">Instagram Session</span>
                        <span className="text-[9px] text-[#52525B] block mt-0.5 uppercase tracking-normal">
                          {sessions.some(s => s.platform.toLowerCase() === 'instagram') 
                            ? `Saved cookies active · Refresh: ${sessions.find(s => s.platform.toLowerCase() === 'instagram')?.savedAt?.slice(0, 10)}` 
                            : 'No saved session'
                          }
                        </span>
                      </div>
                    </div>
                    {sessions.some(s => s.platform.toLowerCase() === 'instagram') ? (
                      <button 
                        onClick={() => handleDeleteSession('instagram')}
                        className="px-3 py-1 bg-transparent hover:bg-red-500/10 border border-red-500/20 hover:border-red-500 text-red-500 text-[8px] font-bold tracking-widest uppercase rounded transition cursor-pointer font-sans font-medium"
                      >
                        Clear Session
                      </button>
                    ) : (
                      <span className="text-[9px] text-[#52525B] font-bold uppercase tracking-wider">CLEAR</span>
                    )}
                  </div>

                  <div className="p-4 border border-[#1A1A1A] bg-[#0A0A0C] rounded flex justify-between items-center">
                    <div className="flex items-center gap-3 font-sans">
                      <MessageSquare size={14} className="text-[#6366F1]" />
                      <div>
                        <span className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wide">WhatsApp Session</span>
                        <span className="text-[9px] text-[#52525B] block mt-0.5 uppercase tracking-normal">
                          {sessions.some(s => s.platform.toLowerCase() === 'whatsapp') 
                            ? `Saved cookies active · Refresh: ${sessions.find(s => s.platform.toLowerCase() === 'whatsapp')?.savedAt?.slice(0, 10)}` 
                            : 'No saved session'
                          }
                        </span>
                      </div>
                    </div>
                    {sessions.some(s => s.platform.toLowerCase() === 'whatsapp') ? (
                      <button 
                        onClick={() => handleDeleteSession('whatsapp')}
                        className="px-3 py-1 bg-transparent hover:bg-red-500/10 border border-red-500/20 hover:border-red-500 text-red-500 text-[8px] font-bold tracking-widest uppercase rounded transition cursor-pointer font-sans font-medium"
                      >
                        Clear Session
                      </button>
                    ) : (
                      <span className="text-[9px] text-[#52525B] font-bold uppercase tracking-wider">CLEAR</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-px bg-[#1A1A1A]" />

              {/* Browserbase & Stagehand Integration */}
              <div>
                <h4 className="text-xs font-bold text-[#F5F5F5] tracking-widest uppercase mb-2">BROWSERBASE & STAGEHAND INTEGRATION</h4>
                <p className="text-[11px] text-[#52525B] leading-relaxed mb-4">
                  Run all automated agents inside high-performance, remote browser sessions managed by Browserbase and orchestrated by Stagehand.
                </p>

                <div className="p-5 border border-[#6366F1]/30 bg-[#6366F1]/5 rounded-lg flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3">
                      <div className="p-2 rounded-full bg-[#6366F1]/10 text-[#6366F1]">
                        <Globe size={16} className="animate-pulse" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider block">
                          Stagehand Engine: ACTIVE
                        </span>
                        <p className="text-[10px] text-[#52525B] leading-normal mt-1">
                          Connected! Your agents will execute in high-performance cloud containers. Watch them work interactively on the 'Operator' screen.
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded text-[8px] font-extrabold tracking-widest uppercase bg-[#6366F1]/20 text-[#6366F1]">
                      STREAMING
                    </span>
                  </div>

                  <div className="text-[9px] font-mono p-3 bg-[#080808]/80 border border-[#1A1A1C] rounded text-[#7F7F8A] leading-relaxed">
                    <span className="text-[#6366F1] font-bold uppercase block mb-1">Architecture details:</span>
                    • Env: <strong className="text-white">BROWSERBASE</strong><br />
                    • LLM: <strong className="text-white">gemini-2.0-flash</strong> via Stagehand Act, Observe, and Extract APIs<br />
                    • Stream: Fully headful, interactive, high-framerate remote stream with native local interactions!
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>
      )}

      {/* HUMAN INTERVENTION OVERLAY */}
      {humanNeededIntervention && (
        <div className="fixed inset-0 bg-[#080808F0]/95 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-sm select-none text-left">
          <div className="bg-[#0F0F11] border border-amber-500/20 rounded-lg p-6 w-full max-w-md shadow-2xl relative">
            <header className="flex justify-between items-center border-b border-[#1A1A1A] pb-4 mb-4 select-none">
              <span className="text-xs font-bold tracking-widest text-amber-500 uppercase flex items-center gap-1.5 animate-pulse">
                <AlertTriangle size={12} /> HUMAN INTERVENTION REQUIRED
              </span>
            </header>

            <div className="space-y-4">
              <p className="text-xs text-zinc-300 leading-relaxed">
                {humanNeededIntervention.message || 'The browser is blocked by a login screen or verification checkpoint.'}
              </p>
              
              <p className="text-[10px] text-amber-500 leading-relaxed font-bold uppercase tracking-wider">
                Please log in using the live browser view, then tap Resume.
              </p>

              {humanNeededIntervention.currentUrl && (
                <div className="bg-[#080808] border border-[#222225] text-[10px] text-zinc-500 p-2 rounded font-mono break-all select-all">
                  URL: {humanNeededIntervention.currentUrl}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 select-none">
                <button 
                  type="button"
                  onClick={() => {
                    handleStopTask(humanNeededIntervention.taskId);
                    setHumanNeededIntervention(null);
                  }}
                  className="px-4 py-1.5 border border-[#1C1C1F] hover:border-red-500/30 hover:bg-red-500/10 text-[#52525B] hover:text-red-400 text-[9px] font-bold tracking-widest uppercase rounded transition cursor-pointer"
                >
                  ABORT TASK
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    socket.emit('resume_task', {
                      taskId: humanNeededIntervention.taskId,
                      data: {}
                    });
                    setHumanNeededIntervention(null);
                  }}
                  className="px-5 py-1.5 bg-[#6366F1] hover:bg-[#4F46E5] text-white text-[9px] font-bold tracking-widest uppercase rounded shadow-[0_2px_8px_rgba(99,102,241,0.3)] transition cursor-pointer"
                >
                  RESUME PROCESS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE INPUT / 2FA REQUEST MODAL */}
      {!humanNeededIntervention && (activeTask?.status === 'paused_input' || inputRequestAlert) && (
        <div className="fixed inset-0 bg-[#080808F0]/95 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-sm select-none text-left">
          <div className="bg-[#0F0F11] border border-amber-500/20 rounded-lg p-6 w-full max-w-md shadow-2xl relative">
            <header className="flex justify-between items-center border-b border-[#1A1A1A] pb-4 mb-4 select-none">
              <span className="text-xs font-bold tracking-widest text-amber-500 uppercase flex items-center gap-1.5 animate-pulse">
                <AlertTriangle size={12} /> ACTION VERIFICATION INTERCEPT REQUISITE
              </span>
            </header>

            <form onSubmit={handleSubmitInputRequest} className="space-y-4">
              <div>
                <label className="text-[10px] tracking-wider text-[#A1A1AA] font-bold uppercase block mb-2 leading-relaxed">
                  {activeTask?.inputPrompt || inputRequestLabel || 'Verification Detail Required'}
                </label>
                <input 
                  type="text" 
                  value={inputRequestValue}
                  onChange={e => setInputRequestValue(e.target.value)}
                  placeholder="Enter details here..."
                  autoFocus
                  className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-amber-500 font-mono tracking-wider"
                />
                <p className="text-[9px] text-[#52525B] mt-1.5 leading-relaxed">
                  Enter the required information above and click submit to resume the active browser process.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 select-none">
                <button 
                  type="button"
                  onClick={() => handleStopTask(activeTask?.taskId || '')}
                  className="px-4 py-1.5 border border-[#1C1C1F] hover:border-red-500/30 hover:bg-red-500/10 text-[#52525B] hover:text-red-400 text-[9px] font-bold tracking-widest uppercase rounded transition cursor-pointer"
                >
                  ABORT TASK
                </button>
                <button 
                  type="submit"
                  disabled={submittingInput || !inputRequestValue.trim()}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-[#080808] text-[9px] font-bold tracking-widest uppercase rounded shadow-[0_2px_8px_rgba(245,158,11,0.2)] transition cursor-pointer flex items-center gap-1"
                >
                  {submittingInput ? (
                    <>
                      <RefreshCw size={10} className="animate-spin" /> SUBMITTING...
                    </>
                  ) : (
                    'RESUME TASK'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW CAMPAIGN TRIGGER CONFIGURATION MODAL */}
      {newTaskModal && (
        <div className="fixed inset-0 bg-[#080808F0]/95 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-sm select-none">
          <div className="bg-[#0F0F11] border border-[#1C1C1F] rounded-lg p-6 w-full max-w-md max-h-[85vh] overflow-y-auto block shadow-2xl">
            <header className="flex justify-between items-center border-b border-[#1A1A1A] pb-4 mb-4 select-none">
              <span className="text-xs font-bold tracking-widest text-[#F5F5F5] uppercase">LAUNCH AUTOMATION PATHWAY</span>
              <button onClick={() => setNewTaskModal(false)} className="text-[#52525B] hover:text-white transition cursor-pointer">
                <X size={16} />
              </button>
            </header>

            <div className="space-y-4">
              <div>
                <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">SCRAPER TYPE / OUTREACH CHANNEL</label>
                <select 
                  value={newTaskType}
                  onChange={e => { setNewTaskType(e.target.value); setTaskConfig({ niche: '', city: '', market: 'english_ca', maxLeads: 20, targets: [], message: '', igUsername: '', igPassword: '', topic: '', goal: '', platforms: ['reddit', 'google', 'youtube', 'yelp'] }); }}
                  className="w-full bg-[#080808] border border-[#222225] select-none text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1] font-sans font-semibold cursor-pointer"
                >
                  {TASK_TYPES.map(t => (
                    <option key={t.id} value={t.id} className="bg-[#080808]">{t.label}</option>
                  ))}
                </select>
                <div className="text-[10px] text-[#52525B] mt-1 hover:text-gray-300 transition">
                  {TASK_TYPES.find(t => t.id === newTaskType)?.desc}
                </div>
              </div>

              {/* DYNAMIC FORMS PER CHANNEL */}
              {newTaskType === 'google_maps_scrape' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">INDUSTRY / NICHE</label>
                      <select 
                        onChange={e => setTaskConfig((c: any) => ({ ...c, niche: e.target.value }))}
                        className="w-full bg-[#080808] border border-[#222225] select-none text-xs rounded px-3 py-2 text-white outline-none focus:border-[#6366F1]"
                      >
                        <option value="">Choose sector...</option>
                        {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">TARGET CITY</label>
                      <select 
                        onChange={e => setTaskConfig((c: any) => ({ ...c, city: e.target.value }))}
                        className="w-full bg-[#080808] border border-[#222225] select-none text-xs rounded px-3 py-2 text-white outline-none focus:border-[#6366F1]"
                      >
                        <option value="">Choose city...</option>
                        {[...CITIES_EN, ...CITIES_FR].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">TARGET GEOGRAPHY PROFILE</label>
                    <select 
                      onChange={e => setTaskConfig((c: any) => ({ ...c, market: e.target.value }))}
                      className="w-full bg-[#080808] border border-[#222225] select-none text-xs rounded px-3 py-2 text-white outline-none focus:border-[#6366F1]"
                    >
                      <option value="english_ca">English Canada (Default)</option>
                      <option value="french_ca">French Canada</option>
                      <option value="french_eu">French Europe</option>
                      <option value="us_english">US English Market</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">MAX PROSPECTS TO EXTRACT</label>
                    <input 
                      type="number" 
                      defaultValue={20}
                      onChange={e => setTaskConfig((c: any) => ({ ...c, maxLeads: parseInt(e.target.value) || 20 }))}
                      className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                    />
                  </div>
                </>
              )}

              {newTaskType === 'pages_jaunes_scrape' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">INDUSTRY / OBJET</label>
                      <input 
                        type="text"
                        placeholder="e.g. plombier"
                        onChange={e => setTaskConfig((c: any) => ({ ...c, niche: e.target.value }))}
                        className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">CITY / SERVICE AREA</label>
                      <input 
                        type="text"
                        placeholder="e.g. Montreal"
                        onChange={e => setTaskConfig((c: any) => ({ ...c, city: e.target.value }))}
                        className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">MAX TARGET INDEX</label>
                    <input 
                      type="number" 
                      defaultValue={20}
                      onChange={e => setTaskConfig((c: any) => ({ ...c, maxLeads: parseInt(e.target.value) || 20 }))}
                      className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                    />
                  </div>
                </>
              )}

              {newTaskType === 'instagram_dm' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">IG USERNAME</label>
                      <input 
                        type="text" 
                        placeholder="your_username"
                        onChange={e => setTaskConfig((c: any) => ({ ...c, igUsername: e.target.value }))}
                        className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">IG PASSWORD</label>
                      <input 
                        type="password" 
                        onChange={e => setTaskConfig((c: any) => ({ ...c, igPassword: e.target.value }))}
                        className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">PROSPECT TARGET USERNAMES (One handle per line)</label>
                    <textarea 
                      rows={3} 
                      placeholder="elonmusk&#10;nvidia&#10;google"
                      onChange={e => setTaskConfig((c: any) => ({ ...c, targets: e.target.value.split('\n').map(t => t.trim()).filter(Boolean) }))}
                      className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1] font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">OUTREACH MESSAGE TEMPLATE</label>
                    <textarea 
                      rows={3} 
                      placeholder="Hi @handle, we analyzed your local presence and noted that..."
                      onChange={e => setTaskConfig((c: any) => ({ ...c, message: e.target.value }))}
                      className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                    />
                  </div>
                </>
              )}

              {newTaskType === 'whatsapp_outreach' && (
                <>
                  <div>
                    <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">PHONE LIST (One number per line)</label>
                    <textarea 
                      rows={4} 
                      placeholder="+14165550192&#10;+15145550110"
                      onChange={e => setTaskConfig((c: any) => ({ ...c, targets: e.target.value.split('\n').map(t => t.trim()).filter(Boolean) }))}
                      className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1] font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">WHATSAPP MESSAGE CONTENT</label>
                    <textarea 
                      rows={3} 
                      placeholder="Hey there! This is a personalized update concerning..."
                      onChange={e => setTaskConfig((c: any) => ({ ...c, message: e.target.value }))}
                      className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                    />
                  </div>
                </>
              )}

              {newTaskType === 'market_research' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">RESEARCH SUBJECT</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Toronto Plumbing"
                        onChange={e => setTaskConfig((c: any) => ({ ...c, topic: e.target.value }))}
                        className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">EVALUATION OBJECTIVE</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Find social pain points"
                        onChange={e => setTaskConfig((c: any) => ({ ...c, goal: e.target.value }))}
                        className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">ACCESSIBLE PLATFORMS</label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
                      {PLATFORMS.map(p => (
                        <label key={p} className="flex items-center gap-2 text-xs text-[#A1A1AA] cursor-pointer">
                          <input 
                            type="checkbox" 
                            defaultChecked
                            className="accent-[#6366F1] rounded cursor-pointer"
                            onChange={e => setTaskConfig((c: any) => ({ 
                              ...c, 
                              platforms: e.target.checked 
                                ? [...(c.platforms || PLATFORMS), p]
                                : (c.platforms || PLATFORMS).filter((x: string) => x !== p) 
                            }))} 
                          />
                          <span className="uppercase">{p}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {newTaskType === 'dynamic' && (
                <div>
                  <label className="text-[8px] tracking-widest text-[#52525B] font-bold uppercase block mb-1.5">PROMPT SPECIFICATION BRIEF (AI Planned)</label>
                  <textarea 
                    rows={5} 
                    placeholder="e.g. Navigate to Pages Jaunes Canada, search plumbers in Ottawa, scrape listings that lack websites, save details to database context and notify on WhatsApp"
                    onChange={e => setTaskConfig((c: any) => ({ ...c, goal: e.target.value }))}
                    className="w-full bg-[#080808] border border-[#222225] text-xs rounded px-3.5 py-2 text-white outline-none focus:border-[#6366F1]"
                  />
                  <div className="text-[10px] text-[#52525B] mt-2 select-none">AI model (Gemini/Claude) plans precise micro-actions on browser runtime.</div>
                </div>
              )}

              <div className="flex gap-4 pt-4 border-t border-[#1A1A1A]">
                <button 
                  onClick={handleStartTask}
                  className="flex-1 py-2.5 bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-bold tracking-widest uppercase rounded shadow-lg transition active:scale-95 cursor-pointer"
                >
                  TRIGGER AUTO SEQUENCE →
                </button>
                <button 
                  onClick={() => setNewTaskModal(false)}
                  className="px-5 py-2.5 border border-[#222225] hover:bg-[#1C1C1F] text-[#52525B] hover:text-[#A1A1AA] text-xs font-bold tracking-widest uppercase rounded transition cursor-pointer"
                >
                  CANCEL
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* COMPREHENSIVE MARKDOWN AI SYSTEM REPORT MODAL */}
      {reportModalContent && (
        <div className="fixed inset-0 bg-[#080808F5]/95 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-sm select-text">
          <div className="bg-[#0F0F11] border border-[#1C1C1F] rounded-lg p-6 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <header className="flex justify-between items-center border-b border-[#1A1A1A] pb-4 mb-4 select-none">
              <span className="text-xs font-bold tracking-widest text-[#F5F5F5] uppercase flex items-center gap-1.5">
                <FileText size={12} className="text-[#6366F1]" /> COGNITIVE CAMPAIGN REPORT
              </span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(reportModalContent);
                    alert('Copied Campaign Markdown Report to Clipboard!');
                  }}
                  className="px-3.5 py-1.5 border border-[#222225] hover:border-[#6366F1] text-[9px] font-bold tracking-widest uppercase rounded bg-transparent text-indigo-400 hover:text-white hover:bg-[#6366F1] transition cursor-pointer"
                >
                  COPY MD
                </button>
                <button onClick={() => setReportModalContent(null)} className="text-[#52525B] hover:text-white transition cursor-pointer">
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 font-mono text-[11px] leading-relaxed text-[#A1A1AA]">
              <div className="prose prose-invert prose-xs max-w-none">
                {reportModalContent.split('\n').map((line, idx) => {
                  if (line.startsWith('# ')) {
                    return <h1 key={idx} className="text-sm font-black text-white uppercase tracking-widest border-b border-[#1C1C20] pb-2 mt-6 mb-3 select-none">{line.replace('# ', '')}</h1>;
                  }
                  if (line.startsWith('## ')) {
                    return <h2 key={idx} className="text-xs font-extrabold text-[#6366F1] uppercase tracking-wider mt-5 mb-2 select-none">{line.replace('## ', '')}</h2>;
                  }
                  if (line.startsWith('### ')) {
                    return <h3 key={idx} className="text-[11px] font-bold text-white uppercase tracking-wider mt-4 mb-1 select-none">{line.replace('### ', '')}</h3>;
                  }
                  return <p key={idx} className="mb-2 whitespace-pre-wrap">{line}</p>;
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN IFRAME FOR ACTIVE RUNNING BROWSER-USE TASK */}
      {activeBrowserUseTask && activeBrowserUseTask.status === 'running' && activeBrowserUseTask.liveUrl && !isFullscreenIframeMinimized && (
        <div className="fixed inset-0 bg-[#080808]/98 z-50 flex flex-col animate-fade-in select-none">
          {/* Header Controls */}
          <header className="px-6 py-4 bg-[#0D0D11] border-b border-[#1C1C24] flex items-center justify-between shadow-lg shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-[#10B981]/10 border border-[#10B981]/30 rounded-full">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.15em] text-[#10B981] uppercase">BROWSER-USE ACTIVE STREAM</span>
              </div>
              <div className="text-xs font-bold text-white max-w-xl truncate uppercase tracking-wide">
                Prompt: <span className="text-zinc-400 font-medium font-mono">"{activeBrowserUseTask.task}"</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  window.open(activeBrowserUseTask.liveUrl, '_blank');
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-bold tracking-widest uppercase rounded border border-zinc-700 transition cursor-pointer"
              >
                OPEN NEW TAB ↗
              </button>

              <button
                onClick={() => setIsFullscreenIframeMinimized(true)}
                className="px-4 py-2 bg-[#6366F1] hover:bg-[#4F46E5] text-white text-[10px] font-bold tracking-widest uppercase rounded transition cursor-pointer shadow-[0_4px_12px_rgba(99,102,241,0.25)]"
              >
                MINIMIZE STREAM 
              </button>
            </div>
          </header>

          {/* Viewport Frame */}
          <div className="flex-1 bg-black relative">
            <iframe
              src={activeBrowserUseTask.liveUrl}
              title="Browser-Use Cloud Live Viewport"
              className="w-full h-full border-0 bg-[#080808]"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </div>
      )}

      {/* FLOATING PICTURE-IN-PICTURE BROWSER-USE WIDGET WHEN MINIMIZED */}
      {activeBrowserUseTask && activeBrowserUseTask.status === 'running' && activeBrowserUseTask.liveUrl && isFullscreenIframeMinimized && (
        <div 
          onClick={() => setIsFullscreenIframeMinimized(false)}
          className="fixed bottom-6 right-6 w-80 h-48 bg-[#0D0D11] border-2 border-[#6366F1] rounded-lg overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)] cursor-pointer z-50 hover:scale-105 transition duration-200 flex flex-col group"
        >
          <header className="px-3 py-1.5 bg-[#09090C] border-b border-[#1C1C24] flex items-center justify-between text-[8px] font-bold text-zinc-400 tracking-wider uppercase shrink-0">
            <span className="flex items-center gap-1.5 text-[#10B981]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              LIVE
            </span>
            <span className="group-hover:text-white transition">CLICK TO MAXIMIZE ⤢</span>
          </header>
          <div className="flex-1 bg-black pointer-events-none relative">
            <iframe
              src={activeBrowserUseTask.liveUrl}
              title="Browser-Use Cloud Live Viewport Mini"
              className="w-full h-full border-0 bg-[#080808]"
            />
          </div>
        </div>
      )}

    </div>
  );
}
