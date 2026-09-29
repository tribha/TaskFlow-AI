import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';

const defaultForm = {
  name: '',
  email: 'demo@example.com',
  password: 'password123',
};

const defaultTaskForm = {
  title: '',
  description: '',
  priority: 'Medium',
  category: 'General',
  dueDate: '',
  status: 'todo',
};

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
  const [message, setMessage] = useState('');
  const [voiceText, setVoiceText] = useState(
    'Tomorrow I have to finish my Java assignment, call Rahul about the project, and submit the DBMS assignment by Friday.'
  );
  const [isListening, setIsListening] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const recognitionRef = useRef(null);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);

  const isLoggedIn = Boolean(token && user);

  const stats = useMemo(
    () => [
      { label: 'Total tasks', value: summary.total },
      { label: 'To do', value: summary.todo },
      { label: 'In Progress', value: summary.inProgress },
      { label: 'Completed', value: summary.completed },
      { label: 'High Priority', value: summary.highPriority },
    ],
    [summary]
  );

  const filteredTasks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesQuery = !normalizedQuery || [task.title, task.description, task.category, task.dueDate]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(normalizedQuery));

      const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [tasks, searchQuery, statusFilter]);

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
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsVoiceSupported(false);
      return undefined;
    }

    setIsVoiceSupported(true);
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ');

      setVoiceText((currentText) => (currentText ? `${currentText} ${transcript}` : transcript));
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      const errorMessage = event?.error === 'not-allowed'
        ? 'Microphone permission was blocked. Please allow microphone access or paste the transcript manually.'
        : 'Microphone capture failed. Please try again or paste a transcript manually.';

      setMessage(errorMessage);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, []);

  const handleVoiceCapture = async () => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setMessage('Your browser does not support voice input. Try Chrome or Edge, or paste a transcript manually.');
      return;
    }

    if (!recognitionRef.current) {
      setMessage('Voice recognition is still initializing.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      recognitionRef.current.start();
      setIsListening(true);
      setMessage('Listening... speak now.');
    } catch (error) {
      setMessage('Microphone permission was blocked. Please allow access or type/paste the transcript manually.');
      setIsListening(false);
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
      setUser(result.user);
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
    setMessage('');

    try {
      await api.createVoiceTasks({ transcript: voiceText });
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
    localStorage.removeItem('taskflow_token');
    localStorage.removeItem('taskflow_user');
    setToken('');
    setUser(null);
    setTasks([]);
    setSummary({ total: 0, todo: 0, inProgress: 0, completed: 0, highPriority: 0 });
    setMessage('Logged out successfully.');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">TaskFlow AI</p>
          <h1>Voice-to-Task Productivity Platform</h1>
        </div>
        {isLoggedIn && (
          <div className="user-actions">
            <span className="welcome">Hi, {user.name}</span>
            <button className="secondary-btn" onClick={logout}>Logout</button>
          </div>
        )}
      </header>

      {!isLoggedIn ? (
        <section className="auth-card panel">
          <div className="auth-tabs">
            <button
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => setAuthMode('login')}
              type="button"
            >
              Login
            </button>
            <button
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => setAuthMode('register')}
              type="button"
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="auth-form">
            {authMode === 'register' && (
              <label>
                Name
                <input
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  placeholder="Your name"
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                placeholder="Password"
              />
            </label>

            <button type="submit" className="primary-btn">
              {authMode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>
        </section>
      ) : (
        <main className="dashboard">
          <section className="stats-grid">
            {stats.map((stat) => (
              <div key={stat.label} className="stat-box panel">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </section>

          <section className="content-grid">
            <div className="panel">
              <h2>Voice Task Input</h2>
              <form onSubmit={handleVoiceSubmit} className="stacked-form">
                <div className="voice-toolbar">
                  <button
                    type="button"
                    className={`record-btn ${isListening ? 'listening' : ''}`}
                    onClick={handleVoiceCapture}
                    disabled={!isVoiceSupported}
                    title={isVoiceSupported ? 'Start voice capture' : 'Voice capture is not supported in this browser'}
                  >
                    {isListening ? 'Stop recording' : isVoiceSupported ? 'Start recording' : 'Voice not supported'}
                  </button>
                </div>
                <textarea
                  rows="6"
                  value={voiceText}
                  onChange={(e) => setVoiceText(e.target.value)}
                  placeholder="Speak or paste a voice note..."
                />
                <button type="submit" className="primary-btn">Extract tasks</button>
              </form>
            </div>

            <div className="panel">
              <h2>Create task manually</h2>
              <form onSubmit={handleTaskSubmit} className="stacked-form">
                <input
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="Task title"
                />
                <textarea
                  rows="3"
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Description"
                />
                <div className="inline-fields">
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                  <select
                    value={taskForm.category}
                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                  >
                    <option value="General">General</option>
                    <option value="Study">Study</option>
                    <option value="Communication">Communication</option>
                    <option value="Work">Work</option>
                  </select>
                </div>
                <input
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  placeholder="Due date (e.g. Friday)"
                />
                <button type="submit" className="primary-btn">Add task</button>
              </form>
            </div>
          </section>

          <section className="panel">
            <div className="board-toolbar">
              <h2>Task board</h2>
              <div className="board-filters">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All tasks</option>
                  <option value="todo">To do</option>
                  <option value="in-progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="kanban-board">
              {['todo', 'in-progress', 'completed'].map((status) => (
                <div key={status} className="kanban-column">
                  <h3>{status === 'todo' ? 'To do' : status === 'in-progress' ? 'In progress' : 'Completed'}</h3>
                  {filteredTasks.filter((task) => task.status === status).length === 0 ? (
                    <div className="empty-column">No tasks</div>
                  ) : (
                    filteredTasks
                      .filter((task) => task.status === status)
                      .map((task) => (
                        <div key={task.id} className="task-card">
                          <div className="task-header">
                            <h4>{task.title}</h4>
                            <span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span>
                          </div>
                          <p>{task.description || 'No description'}</p>
                          <div className="meta-row">
                            <span>{task.category}</span>
                            <span>{task.dueDate || 'No deadline'}</span>
                          </div>
                          <div className="task-actions">
                            <select
                              value={task.status}
                              onChange={(e) => handleStatusChange(task.id, e.target.value)}
                            >
                              <option value="todo">To do</option>
                              <option value="in-progress">In progress</option>
                              <option value="completed">Completed</option>
                            </select>
                            <button className="danger-btn" onClick={() => handleDeleteTask(task.id)} type="button">
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {message && <div className="message-banner">{message}</div>}
    </div>
  );
}

export default App;
