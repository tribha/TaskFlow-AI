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
import {
  getRecognitionTranscript,
  romanizeTranscript,
  transcribeRecording,
} from './voiceTranscription';

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
      return 'Browser speech recognition was blocked. Your microphone recording can still be transcribed after you stop.';
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

function getPreferredRecordingMimeType(MediaRecorderConstructor) {
  if (typeof MediaRecorderConstructor.isTypeSupported !== 'function') return '';

  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ].find((mimeType) => MediaRecorderConstructor.isTypeSupported(mimeType)) || '';
}

function stopMicrophoneTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function disposeVoiceSession(session) {
  if (!session) return;
  session.cancelled = true;
  session.chunks.length = 0;

  const recognition = session.recognition;
  if (recognition) {
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {}
  }

  const recorder = session.recorder;
  if (recorder && recorder.state !== 'inactive') {
    recorder.ondataavailable = null;
    recorder.onstop = () => stopMicrophoneTracks(session.stream);
    try {
      recorder.stop();
    } catch {
      stopMicrophoneTracks(session.stream);
    }
  } else {
    stopMicrophoneTracks(session.stream);
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
  const [hasRecordedAudio, setHasRecordedAudio] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [currentPage, setCurrentPage] = useState(getPageFromPath);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const recognitionRef = useRef(null);
  const recordingPhaseRef = useRef('idle');
  const recordingSessionRef = useRef(0);
  const voiceSessionRef = useRef(null);
  const audioRecordingRef = useRef(null);
  const isTranscribingRef = useRef(false);
  const transcriptionRequestRef = useRef(0);
  const mountedRef = useRef(false);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(false);

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
    const canRecordAudio = Boolean(navigator.mediaDevices?.getUserMedia)
      && typeof window.MediaRecorder === 'function';
    setIsSpeechRecognitionSupported(Boolean(SpeechRecognition));
    setIsVoiceSupported(Boolean(SpeechRecognition || canRecordAudio));
    return undefined;
  }, []);

  const cancelVoiceCapture = () => {
    recordingSessionRef.current += 1;
    recordingPhaseRef.current = 'idle';
    const session = voiceSessionRef.current;
    voiceSessionRef.current = null;
    recognitionRef.current = null;
    disposeVoiceSession(session);
    audioRecordingRef.current = null;
    setHasRecordedAudio(false);
    setIsListening(false);
  };

  useEffect(() => {
    if (currentPage !== 'voice') cancelVoiceCapture();
  }, [currentPage]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingSessionRef.current += 1;
      recordingPhaseRef.current = 'idle';
      const session = voiceSessionRef.current;
      voiceSessionRef.current = null;
      recognitionRef.current = null;
      disposeVoiceSession(session);
    };
  }, []);

  const requestAudioTranscription = async (audioBlob, sessionId, source) => {
    if (!audioBlob || isTranscribingRef.current) return;

    isTranscribingRef.current = true;
    setIsTranscribing(true);
    const requestId = transcriptionRequestRef.current + 1;
    transcriptionRequestRef.current = requestId;
    setMessage(source === 'automatic'
      ? 'Browser recognition did not produce a usable transcript. Transcribing the recorded audio...'
      : 'Improving transcript from the recorded audio...');

    try {
      await transcribeRecording(audioBlob, api.transcribeAudio, (transcript) => {
        if (
          recordingSessionRef.current === sessionId
          && audioRecordingRef.current?.sessionId === sessionId
          && transcriptionRequestRef.current === requestId
          && mountedRef.current
        ) {
          const transcriptBase = source === 'automatic'
            ? romanizeTranscript(audioRecordingRef.current.transcriptBase)
            : '';
          setVoiceText([transcriptBase, transcript].filter(Boolean).join(' '));
        }
      });

      if (
        mountedRef.current
        && recordingSessionRef.current === sessionId
        && audioRecordingRef.current?.sessionId === sessionId
      ) {
        setMessage('Transcript updated from the recorded audio. Review or edit it before extracting tasks.');
      }
    } catch (error) {
      if (
        mountedRef.current
        && recordingSessionRef.current === sessionId
        && audioRecordingRef.current?.sessionId === sessionId
      ) {
        const reason = error instanceof Error && error.message ? ` ${error.message}` : '';
        setMessage(`Audio transcription failed.${reason} Your existing transcript is unchanged; you can edit it or retry.`);
      }
    } finally {
      if (mountedRef.current && transcriptionRequestRef.current === requestId) {
        isTranscribingRef.current = false;
        setIsTranscribing(false);
      }
    }
  };

  const finishVoiceSession = (session) => {
    if (
      session.cancelled
      || session.finalized
      || recordingSessionRef.current !== session.id
      || !session.recorderStopped
      || !session.recognitionEnded
    ) {
      return;
    }

    session.finalized = true;
    stopMicrophoneTracks(session.stream);
    session.stream = null;
    voiceSessionRef.current = null;
    recognitionRef.current = null;
    if (session.recognition) {
      session.recognition.onstart = null;
      session.recognition.onresult = null;
      session.recognition.onerror = null;
      session.recognition.onend = null;
      try {
        session.recognition.abort();
      } catch {}
      session.recognition = null;
    }
    recordingPhaseRef.current = 'idle';
    setIsListening(false);

    const chunks = session.chunks.filter((chunk) => chunk.size > 0);
    const audioBlob = chunks.length
      ? new Blob(chunks, { type: session.recorder?.mimeType || chunks[0].type || 'audio/webm' })
      : null;

    if (audioBlob?.size) {
      audioRecordingRef.current = {
        blob: audioBlob,
        sessionId: session.id,
        transcriptBase: session.transcriptBase,
      };
      setHasRecordedAudio(true);
    } else {
      audioRecordingRef.current = null;
      setHasRecordedAudio(false);
    }

    if (audioBlob && (session.recognitionFailed || !session.recognitionTranscript.trim())) {
      void requestAudioTranscription(audioBlob, session.id, 'automatic');
    } else if (!session.recognitionTranscript.trim() && !audioBlob) {
      setMessage('No transcript or recording was captured. Check browser recognition support, or type/paste a transcript.');
    } else if (!session.recognitionTranscript.trim()) {
      setMessage('Recording finished. Review the transcript or record again.');
    } else {
      setMessage('Recording finished. Review or edit the transcript before extracting tasks.');
    }

    session.chunks.length = 0;
  };

  const handleVoiceCapture = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (recordingPhaseRef.current === 'requesting') {
      cancelVoiceCapture();
      setMessage('Microphone request cancelled.');
      return;
    }

    if (recordingPhaseRef.current === 'recording') {
      const session = voiceSessionRef.current;
      recordingPhaseRef.current = 'stopping';
      if (session?.recognition) {
        try {
          session.recognition.stop();
        } catch {
          session.recognitionFailed = true;
          session.recognitionEnded = true;
          try {
            session.recognition.abort();
          } catch {}
          session.recognition = null;
          recognitionRef.current = null;
        }
      } else if (session) {
        session.recognitionEnded = true;
      }

      if (session?.recorder && session.recorder.state !== 'inactive') {
        try {
          session.recorder.stop();
        } catch {
          session.recorderStopped = true;
          setMessage('Audio recording could not be finalized. Your browser transcript is still available.');
          stopMicrophoneTracks(session.stream);
          session.stream = null;
        }
      } else if (session) {
        session.recorderStopped = true;
      }

      if (session) finishVoiceSession(session);
      return;
    }

    if (recordingPhaseRef.current === 'stopping') {
      setMessage('The current recording is still finishing. Please wait before starting another.');
      return;
    }

    const canRecordAudio = Boolean(navigator.mediaDevices?.getUserMedia)
      && typeof window.MediaRecorder === 'function';
    if (!SpeechRecognition && !canRecordAudio) {
      setMessage('Voice recording is not supported in this browser. Type or paste a transcript instead.');
      return;
    }

    const sessionId = recordingSessionRef.current + 1;
    recordingSessionRef.current = sessionId;
    recordingPhaseRef.current = 'requesting';
    voiceSessionRef.current = null;
    audioRecordingRef.current = null;
    setHasRecordedAudio(false);
    setIsListening(true);
    setMessage('Requesting microphone access...');

    let stream;
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (sessionId !== recordingSessionRef.current) return;

      const session = {
        id: sessionId,
        stream: null,
        recorder: null,
        recognition: null,
        chunks: [],
        recognitionTranscript: '',
        transcriptBase: voiceText.trim(),
        recognitionFailed: false,
        recognitionEnded: !SpeechRecognition,
        recorderStopped: true,
        finalized: false,
        cancelled: false,
      };
      voiceSessionRef.current = session;
      recordingPhaseRef.current = 'recording';

      if (stream && canRecordAudio) {
        const MediaRecorderConstructor = window.MediaRecorder;
        const mimeType = getPreferredRecordingMimeType(MediaRecorderConstructor);
        try {
          const recorder = mimeType
            ? new MediaRecorderConstructor(stream, { mimeType })
            : new MediaRecorderConstructor(stream);
          session.stream = stream;
          session.recorder = recorder;
          session.recorderStopped = false;
          recorder.ondataavailable = (event) => {
            if (recordingSessionRef.current !== sessionId || session.cancelled || !event.data?.size) return;
            session.chunks.push(event.data);
          };
          recorder.onstop = () => {
            if (recordingSessionRef.current !== sessionId || session.cancelled) {
              stopMicrophoneTracks(session.stream);
              session.stream = null;
              return;
            }
            session.recorderStopped = true;
            finishVoiceSession(session);
          };
          recorder.onerror = () => {
            if (recordingSessionRef.current !== sessionId || session.cancelled) return;
            setMessage('Audio recording failed. Any browser transcript remains available.');
          };
          recorder.start();
          stream = null;
        } catch {
          session.recorderStopped = true;
          session.stream = null;
          setMessage('Audio recording is unavailable. Browser speech recognition can still be used.');
        }
      }

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          session.recognition = recognition;
          recognitionRef.current = recognition;
          recognition.lang = 'en-IN';
          recognition.interimResults = true;
          recognition.continuous = true;

          recognition.onstart = () => {
            if (recordingSessionRef.current !== sessionId || session.cancelled) return;
            setMessage('Listening... speak naturally in Hindi, English, or both.');
          };

          recognition.onresult = (event) => {
            if (recordingSessionRef.current !== sessionId || session.cancelled) return;
            try {
              const transcript = getRecognitionTranscript(event);
              session.recognitionTranscript = transcript;
              setVoiceText([
                session.transcriptBase,
                transcript,
              ].filter(Boolean).join(' '));
            } catch {
              session.recognitionFailed = true;
              setMessage('Browser transcript could not be safely converted to Latin script. The recorded audio will be used for fallback transcription when you stop.');
            }
          };

          recognition.onerror = (event) => {
            if (recordingSessionRef.current !== sessionId || session.cancelled) return;
            session.recognitionFailed = true;
            session.recognitionEnded = true;
            recognitionRef.current = null;
            setMessage(getRecognitionErrorMessage(event?.error));
            finishVoiceSession(session);
          };

          recognition.onend = () => {
            if (recordingSessionRef.current !== sessionId || session.cancelled) return;
            session.recognitionEnded = true;
            if (!session.recognitionTranscript.trim()) session.recognitionFailed = true;
            session.recognition = null;
            recognitionRef.current = null;
            finishVoiceSession(session);
          };

          recognition.start();
        } catch (error) {
          session.recognitionFailed = true;
          session.recognitionEnded = true;
          session.recognition = null;
          recognitionRef.current = null;
          setMessage(getRecognitionErrorMessage(error?.error));
          finishVoiceSession(session);
        }
      } else {
        setMessage('Browser speech recognition is not supported. Recorded audio will be transcribed after you stop, if the service is available.');
      }

      if (stream) {
        stopMicrophoneTracks(stream);
        stream = null;
      }

    } catch (error) {
      if (sessionId === recordingSessionRef.current) {
        recordingPhaseRef.current = 'idle';
        setIsListening(false);
        setMessage(getMicrophoneErrorMessage(error));
        const session = voiceSessionRef.current;
        voiceSessionRef.current = null;
        disposeVoiceSession(session);
      }
    } finally {
      stopMicrophoneTracks(stream);
    }
  };

  const handleImproveTranscript = () => {
    const audio = audioRecordingRef.current;
    if (!audio?.blob || isTranscribingRef.current) return;
    void requestAudioTranscription(audio.blob, audio.sessionId, 'improve');
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
    voice: <VoiceAIPage
      voiceText={voiceText}
      onVoiceTextChange={(text) => {
        try {
          setVoiceText(romanizeTranscript(text));
        } catch {
          setMessage('This text could not be safely converted to Latin script. Your existing transcript is unchanged.');
        }
      }}
      isListening={isListening}
      isVoiceSupported={isVoiceSupported}
      isSpeechRecognitionSupported={isSpeechRecognitionSupported}
      hasRecordedAudio={hasRecordedAudio}
      isTranscribing={isTranscribing}
      onVoiceCapture={handleVoiceCapture}
      onVoiceSubmit={handleVoiceSubmit}
      onImproveTranscript={handleImproveTranscript}
    />,
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