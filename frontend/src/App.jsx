import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import {
  AnalyticsPage,
  CalendarPage,
  DashboardPage,
  MyTasksPage,
  ProfilePage,
  VoiceAIPage,
} from './pages';

const defaultForm = {
  name: '',
  email: '',
  password: '',
};

const defaultTaskForm = {
  title: '',
  description: '',
  priority: 'Medium',
  category: 'General',
  dueDate: '',
  status: 'todo',
};

const defaultProfile = {
  age: '',
  occupation: '',
  bio: '',
  interests: [],
  preferences: '',
  avatar: '',
};

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: '◫' },
  { id: 'tasks', label: 'My Tasks', icon: '☷' },
  { id: 'voice', label: 'Voice AI', icon: '◉' },
  { id: 'calendar', label: 'Calendar', icon: '▦' },
  { id: 'analytics', label: 'Analytics', icon: '⌁' },
];

const pageIds = [...navigation.map((item) => item.id), 'profile'];

function getPageFromPath() {
  const pathPage = window.location.pathname.replace(/^\/+|\/+$/g, '') || 'dashboard';
  return pageIds.includes(pathPage) ? pathPage : 'dashboard';
}

function getProfileStorageKey(userId) {
  return userId ? `taskflow_profile_${userId}` : null;
}

function loadUserProfile(userId, fallbackName = '') {
  const storageKey = getProfileStorageKey(userId);
  if (!storageKey) return { ...defaultProfile, name: fallbackName };

  try {
    const savedProfile = localStorage.getItem(storageKey);
    return savedProfile ? { ...defaultProfile, ...JSON.parse(savedProfile) } : {
      ...defaultProfile,
      name: fallbackName,
    };
  } catch {
    return { ...defaultProfile, name: fallbackName };
  }
}

function saveUserProfile(userId, profile) {
  const storageKey = getProfileStorageKey(userId);
  if (storageKey) localStorage.setItem(storageKey, JSON.stringify(profile));
}

function getMicrophoneErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was denied or blocked for this site. Allow microphone access in your browser settings, or type/paste a transcript.';
    case 'NotFoundError':
      return 'No microphone was found. Connect a microphone or type/paste a transcript.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The microphone is unavailable or being used by another app. Close other apps using it and try again.';
    case 'OverconstrainedError':
      return 'The available microphone does not meet the requested settings. Try another microphone or type/paste a transcript.';
    case 'InvalidStateError':
      return 'Voice recognition is already active. Stop the current recording before starting another.';
    default:
      return 'Could not start microphone capture. Check your microphone and try again, or type/paste a transcript.';
  }
}

function getRecognitionErrorMessage(error) {
  switch (error) {
    case 'not-allowed':
      return 'Microphone access was denied or blocked for this site. Allow microphone access in your browser settings, or type/paste a transcript.';
    case 'service-not-allowed':
      return 'The browser blocked its speech recognition service. Check your browser settings or type/paste a transcript.';
    case 'audio-capture':
      return 'The microphone could not be accessed. Check that one is connected and not in use by another app.';
    case 'network':
      return 'Speech recognition could not reach its service. Check your internet connection and try again.';
    case 'no-speech':
      return 'No speech was detected. Try recording again, or type/paste a transcript.';
    case 'language-not-supported':
      return 'Speech recognition does not support the selected language in this browser.';
    case 'aborted':
      return 'Recording was stopped before speech recognition finished.';
    default:
      return 'Speech recognition failed. Try again, or type/paste a transcript.';
  }
}

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(defaultForm);
  const [taskForm, setTaskForm] = useState(defaultTaskForm);
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState({ total: 0, todo: 0, inProgress: 0, completed: 0, highPriority: 0 });
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('taskflow_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('taskflow_token') || '');
  const [profile, setProfile] = useState(() => loadUserProfile(user?.id, user?.name || ''));
  const [message, setMessage] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [currentPage, setCurrentPage] = useState(getPageFromPath);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const recognitionRef = useRef(null);
  const recordingPhaseRef = useRef('idle');
  const recordingSessionRef = useRef(0);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);

  const isLoggedIn = Boolean(token && user);

  const stats = useMemo(
    () => [
      { label: 'Total tasks', value: summary.total },
      { label: 'To do', value: summary.todo },
      { label: 'In progress', value: summary.inProgress },
      { label: 'Completed', value: summary.completed },
      { label: 'High priority', value: summary.highPriority },
    ],
    [summary]
  );

  useEffect(() => {
    if (!user) return;
    saveUserProfile(user.id, profile);
  }, [profile, user?.id]);

  const loadData = async () => {
    if (!token) return;
    try {
      const [taskList, summaryData] = await Promise.all([api.getTasks(), api.getSummary()]);
      setTasks(taskList);
      setSummary(summaryData);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  useEffect(() => {
    const handlePopState = () => setCurrentPage(getPageFromPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsVoiceSupported(false);
      return undefined;
    }

    setIsVoiceSupported(true);
    return undefined;
  }, []);

  const cancelVoiceCapture = () => {
    recordingSessionRef.current += 1;
    recordingPhaseRef.current = 'idle';
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {}
    }
    setIsListening(false);
  };

  useEffect(() => {
    if (currentPage !== 'voice') cancelVoiceCapture();
  }, [currentPage]);

  useEffect(() => () => {
    recordingSessionRef.current += 1;
    recordingPhaseRef.current = 'idle';
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {}
  }, []);

  const handleVoiceCapture = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessage('Your browser does not support voice input. Try Chrome or Edge, or paste a transcript manually.');
      return;
    }

    if (recordingPhaseRef.current === 'requesting') {
      cancelVoiceCapture();
      return;
    }

    if (recordingPhaseRef.current === 'recording') {
      recordingPhaseRef.current = 'stopping';
      try {
        recognitionRef.current?.stop();
      } catch (error) {
        setMessage(getMicrophoneErrorMessage(error));
        cancelVoiceCapture();
      }
      return;
    }

    if (recordingPhaseRef.current === 'stopping') {
      setMessage('The current recording is still finishing. Please wait a moment before starting again.');
      return;
    }

    const sessionId = recordingSessionRef.current + 1;
    recordingSessionRef.current = sessionId;
    recordingPhaseRef.current = 'requesting';
    setIsListening(true);
    setMessage('Requesting microphone access...');

    let stream;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (sessionId !== recordingSessionRef.current) return;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        if (recordingSessionRef.current !== sessionId || recognitionRef.current !== recognition) return;
        recordingPhaseRef.current = 'recording';
        setMessage('Listening... speak now.');
      };

      recognition.onresult = (event) => {
        if (recordingSessionRef.current !== sessionId || recognitionRef.current !== recognition) return;
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(' ');
        setVoiceText((currentText) => (currentText ? `${currentText} ${transcript}` : transcript));
      };

      recognition.onerror = (event) => {
        if (recordingSessionRef.current !== sessionId || recognitionRef.current !== recognition) return;
        setMessage(getRecognitionErrorMessage(event?.error));
        cancelVoiceCapture();
      };

      recognition.onend = () => {
        if (recordingSessionRef.current !== sessionId || recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        recordingPhaseRef.current = 'idle';
        recordingSessionRef.current += 1;
        setIsListening(false);
        setMessage('Recording finished. Review the transcript or record again.');
      };

      recognition.start();
      recordingPhaseRef.current = 'recording';
    } catch (error) {
      if (sessionId === recordingSessionRef.current) {
        setMessage(getMicrophoneErrorMessage(error));
        cancelVoiceCapture();
      }
    } finally {
      if (stream) stream.getTracks().forEach((track) => track.stop());
    }
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

    try {
      const payload = authMode === 'register'
        ? { name: authForm.name, email: authForm.email, password: authForm.password }
        : { email: authForm.email, password: authForm.password };

      const result = authMode === 'register' ? await api.register(payload) : await api.login(payload);
      localStorage.setItem('taskflow_token', result.token);
      localStorage.setItem('taskflow_user', JSON.stringify(result.user));
      setToken(result.token);
      setProfile(loadUserProfile(result.user.id, result.user.name || ''));
      setUser(result.user);
      window.history.replaceState({}, '', '/');
      setCurrentPage('dashboard');
      setMessage(authMode === 'register' ? 'Account created successfully.' : 'Logged in successfully.');
      setAuthForm(defaultForm);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleTaskSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

    try {
      await api.createTask(taskForm);
      setTaskForm(defaultTaskForm);
      await loadData();
      setMessage('Task created successfully.');
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleVoiceSubmit = async (event) => {
    event.preventDefault();
    const transcript = voiceText.trim();
    if (!transcript) {
      setMessage('Enter or record a transcript before extracting tasks.');
      return;
    }

    cancelVoiceCapture();
    setMessage('');

    try {
      await api.createVoiceTasks({ transcript });
      setVoiceText('');
      await loadData();
      setMessage('Voice tasks extracted and saved.');
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleStatusChange = async (taskId, status) => {
    try {
      await api.updateTask(taskId, { status });
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await api.deleteTask(taskId);
      await loadData();
      setMessage('Task deleted.');
    } catch (error) {
      setMessage(error.message);
    }
  };

  const logout = () => {
    cancelVoiceCapture();
    localStorage.removeItem('taskflow_token');
    localStorage.removeItem('taskflow_user');
    setToken('');
    setUser(null);
    setTasks([]);
    setSummary({ total: 0, todo: 0, inProgress: 0, completed: 0, highPriority: 0 });
    setMessage('Logged out successfully.');
  };

  const navigate = (page) => {
    const path = page === 'dashboard' ? '/' : `/${page}`;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setCurrentPage(page);
    setSidebarOpen(false);
  };

  const updateProfile = (field, value) => setProfile((current) => ({ ...current, [field]: value }));

  if (!isLoggedIn) {
    return (
      <div className="auth-screen">
        <div className="auth-brand"><span className="brand-mark">T</span><span>TaskFlow <b>AI</b></span></div>
        <section className="auth-card">
          <p className="eyebrow">Your work, in flow</p>
          <h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="auth-subtitle">Turn the things on your mind into clear next steps.</p>
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthForm(defaultForm); }} type="button">Login</button>
            <button className={authMode === 'register' ? 'active' : ''} onClick={() => { setAuthMode('register'); setAuthForm(defaultForm); }} type="button">Register</button>
          </div>
          <form onSubmit={handleAuthSubmit} className="auth-form">
            {authMode === 'register' && (
              <label>Name<input autoComplete="name" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} placeholder="Your name" required /></label>
            )}
            <label>Email<input type="email" autoComplete="username" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="you@example.com" required /></label>
            <label>Password<input type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} placeholder="Password" required /></label>
            <button type="submit" className="primary-btn">{authMode === 'login' ? 'Login' : 'Create account'}<span aria-hidden="true">→</span></button>
          </form>
        </section>
        {message && <div className="message-banner" role="status">{message}</div>}
      </div>
    );
  }

  const pageTitles = {
    dashboard: ['Dashboard', 'Your productivity, at a glance'],
    tasks: ['My Tasks', 'Plan the work. Make it happen.'],
    voice: ['Voice AI', 'Capture a thought. Let TaskFlow shape it.'],
    calendar: ['Calendar', 'Your deadlines, all in one view.'],
    analytics: ['Analytics', 'Understand your productivity over time.'],
    profile: ['Profile & Settings', 'Make TaskFlow feel like yours.'],
  };

  const pageContent = {
    dashboard: <DashboardPage user={user} profile={profile} tasks={tasks} stats={stats} onNavigate={navigate} onStartRecording={handleVoiceCapture} onStatusChange={handleStatusChange} />,
    tasks: <MyTasksPage tasks={tasks} taskForm={taskForm} setTaskForm={setTaskForm} onTaskSubmit={handleTaskSubmit} onStatusChange={handleStatusChange} onDeleteTask={handleDeleteTask} />,
    voice: <VoiceAIPage voiceText={voiceText} setVoiceText={setVoiceText} isListening={isListening} isVoiceSupported={isVoiceSupported} onVoiceCapture={handleVoiceCapture} onVoiceSubmit={handleVoiceSubmit} />,
    calendar: <CalendarPage tasks={tasks} />,
    analytics: <AnalyticsPage tasks={tasks} stats={stats} summary={summary} />,
    profile: <ProfilePage user={user} profile={profile} onProfileChange={updateProfile} onLogout={logout} />,
  };

  return (
    <div className="workspace-shell">
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <button className="brand" onClick={() => navigate('dashboard')} aria-label="TaskFlow AI dashboard">
          <span className="brand-mark">T</span><span>TaskFlow <b>AI</b></span>
        </button>
        <div className="sidebar-label">Workspace</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button key={item.id} className={`nav-link ${currentPage === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-link ${currentPage === 'profile' ? 'active' : ''}`} onClick={() => navigate('profile')}><span className="nav-icon" aria-hidden="true">⚙</span>Settings</button>
          <button className="nav-link logout-link" onClick={logout}><span className="nav-icon" aria-hidden="true">↪</span>Logout</button>
          <button className="sidebar-user" onClick={() => navigate('profile')}>
            <Avatar name={profile.name || user.name} src={profile.avatar} />
            <span><strong>{profile.name || user.name}</strong><small>View profile</small></span>
            <span className="user-more" aria-hidden="true">···</span>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="page-header">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><span>☰</span></button>
          <div><p className="eyebrow">TaskFlow AI / Workspace</p><h1>{pageTitles[currentPage][0]}</h1><p className="page-subtitle">{pageTitles[currentPage][1]}</p></div>
          <button className="header-profile" onClick={() => navigate('profile')} aria-label="Open profile settings"><Avatar name={profile.name || user.name} src={profile.avatar} /><span>{profile.name || user.name}</span><span className="chevron">⌄</span></button>
        </header>
        {pageContent[currentPage]}
      </main>
      {message && <div className="message-banner" role="status">{message}<button onClick={() => setMessage('')} aria-label="Dismiss message">×</button></div>}
    </div>
  );
}

function Avatar({ name, src, size = 'regular' }) {
  const initials = (name || 'TF').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <span className={`avatar avatar-${size}`}>{src ? <img src={src} alt="" /> : initials}</span>;
}

export default App;