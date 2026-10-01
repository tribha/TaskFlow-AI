import { useMemo, useRef, useState } from 'react';

const statuses = [
  { value: 'todo', label: 'To do' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

function initials(name) {
  return (name || 'TF').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function sortRecent(tasks) {
  return [...tasks].sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
}

function resolveDueDate(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isoDate = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));

  if (normalized === 'today') return today;
  if (normalized === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = dayNames.findIndex((day) => normalized.includes(day));
  if (dayIndex >= 0) {
    const date = new Date(today);
    let offset = (dayIndex - today.getDay() + 7) % 7;
    if (normalized.includes('next ') || offset === 0) offset += 7;
    date.setDate(date.getDate() + offset);
    return date;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function Avatar({ name, src, size = 'regular' }) {
  return <span className={`avatar avatar-${size}`}>{src ? <img src={src} alt="" /> : initials(name)}</span>;
}

function TaskCard({ task, onStatusChange, onDeleteTask, compact = false }) {
  return (
    <article className={`task-card ${compact ? 'task-card-compact' : ''}`}>
      <div className="task-header">
        <h3>{task.title}</h3>
        <span className={`priority priority-${String(task.priority || 'medium').toLowerCase()}`}>{task.priority || 'Medium'}</span>
      </div>
      {!compact && <p className="task-description">{task.description || 'No description'}</p>}
      <div className="task-meta"><span>{task.category || 'General'}</span><span>{task.dueDate || 'No deadline'}</span></div>
      <div className="task-actions">
        <select aria-label={`Update status for ${task.title}`} value={task.status} onChange={(event) => onStatusChange(task.id, event.target.value)}>
          {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
        {onDeleteTask && <button className="text-action danger-text" type="button" onClick={() => onDeleteTask(task.id)}>Delete</button>}
      </div>
    </article>
  );
}

export function DashboardPage({ user, profile, tasks, stats, onNavigate, onStartRecording, onStatusChange }) {
  const recentTasks = sortRecent(tasks).slice(0, 4);
  const name = profile.name || user.name;
  const topStats = stats;

  return (
    <div className="page-content dashboard-content">
      <section className="welcome-row">
        <div><p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h2>{greeting()}, {name} <span aria-hidden="true">👋</span></h2><p>Here’s your day, organized and ready to move.</p></div>
        <button className="primary-btn" onClick={() => onNavigate('tasks')}><span aria-hidden="true">＋</span> New task</button>
      </section>

      <section className="dashboard-overview-grid">
        <article className="panel profile-summary">
          <div className="profile-summary-heading"><Avatar name={name} src={profile.avatar} size="large" /><div><h3>{name}</h3><p>{profile.occupation || 'Tell us what you do'}</p></div><button className="icon-action" onClick={() => onNavigate('profile')} aria-label="Edit profile">↗</button></div>
          <p className="profile-bio">{profile.bio || 'Add a short bio to introduce yourself.'}</p>
          <div className="interest-row">{(profile.interests || []).slice(0, 4).length ? profile.interests.slice(0, 4).map((interest) => <span className="interest-chip" key={interest}>{interest}</span>) : <span className="muted-copy">Add your interests in profile settings</span>}</div>
        </article>
        <article className="voice-quick-action">
          <div className="voice-orbit" aria-hidden="true"><span>◉</span></div>
          <div className="voice-quick-copy"><span className="eyebrow">Voice AI</span><h3>Tell TaskFlow what you need to do.</h3><p>Capture a thought and turn it into an actionable task.</p></div>
          <button className="voice-quick-button" onClick={() => { onNavigate('voice'); onStartRecording(); }}><span aria-hidden="true">◉</span> Start recording</button>
        </article>
      </section>

      <section className="stats-grid dashboard-stats" aria-label="Task overview">
        {topStats.map((stat, index) => <article className="panel stat-box" key={stat.label}><div className={`stat-icon stat-icon-${index}`} aria-hidden="true">{['↗', '◷', '✓', '!'][index]}</div><span>{stat.label}</span><strong>{stat.value}</strong><small>{index === 0 ? 'Across your workspace' : 'Tasks right now'}</small></article>)}
      </section>

      <section className="panel recent-tasks-panel">
        <div className="section-heading"><div><span className="eyebrow">Stay in motion</span><h2>Recent tasks</h2></div><button className="text-action" onClick={() => onNavigate('tasks')}>View all tasks <span aria-hidden="true">→</span></button></div>
        {recentTasks.length ? <div className="recent-task-list">{recentTasks.map((task) => <TaskCard key={task.id} task={task} onStatusChange={onStatusChange} compact />)}</div> : <div className="empty-state"><span className="empty-icon">☷</span><h3>Your task list starts here</h3><p>Add a task or tell TaskFlow what’s on your mind.</p><button className="secondary-btn" onClick={() => onNavigate('tasks')}>Create your first task</button></div>}
      </section>
    </div>
  );
}

export function MyTasksPage({ tasks, taskForm, setTaskForm, onTaskSubmit, onStatusChange, onDeleteTask }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState('all');
  const categories = [...new Set(tasks.map((task) => task.category).filter(Boolean))];
  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const search = query.trim().toLowerCase();
    const matchesQuery = !search || [task.title, task.description, task.category, task.dueDate].filter(Boolean).some((field) => String(field).toLowerCase().includes(search));
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || String(task.priority).toLowerCase() === priorityFilter;
    const matchesCategory = categoryFilter === 'all' || task.category === categoryFilter;
    const dueDate = resolveDueDate(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const matchesDue = dueFilter === 'all'
      || (dueFilter === 'dated' && Boolean(task.dueDate))
      || (dueFilter === 'undated' && !task.dueDate)
      || (dueFilter === 'overdue' && dueDate && dueDate < today && task.status !== 'completed')
      || (dueFilter === 'upcoming' && dueDate && dueDate >= today && dueDate <= nextWeek);
    return matchesQuery && matchesStatus && matchesPriority && matchesCategory && matchesDue;
  }), [tasks, query, statusFilter, priorityFilter, categoryFilter, dueFilter]);

  return (
    <div className="page-content">
      <section className="panel task-management-panel">
        <div className="section-heading task-page-heading"><div><span className="eyebrow">Your workspace</span><h2>Task board <span className="count-pill">{filteredTasks.length}</span></h2></div><button className="primary-btn" onClick={() => document.getElementById('create-task-title')?.focus()}><span>＋</span> Add task</button></div>
        <div className="filters-row">
          <label className="search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks..." aria-label="Search tasks" /></label>
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
          <select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">All priorities</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select>
          <select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
          <select aria-label="Filter by due date" value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}><option value="all">Any due date</option><option value="upcoming">Due in 7 days</option><option value="overdue">Overdue</option><option value="dated">Has due date</option><option value="undated">No due date</option></select>
        </div>
        <div className="kanban-board">
          {statuses.map((status) => {
            const columnTasks = filteredTasks.filter((task) => task.status === status.value);
            return <section key={status.value} className={`kanban-column column-${status.value}`}><header className="column-heading"><span className="column-dot" /><h3>{status.label}</h3><span className="column-count">{columnTasks.length}</span></header>{columnTasks.length ? columnTasks.map((task) => <TaskCard key={task.id} task={task} onStatusChange={onStatusChange} onDeleteTask={onDeleteTask} />) : <div className="empty-column">No tasks here</div>}</section>;
          })}
        </div>
      </section>
      <section className="panel create-task-panel">
        <div className="section-heading"><div><span className="eyebrow">Make it actionable</span><h2>Create a task</h2></div><span className="create-task-symbol" aria-hidden="true">＋</span></div>
        <form onSubmit={onTaskSubmit} className="task-create-form">
          <label className="task-title-field">Task title<input id="create-task-title" value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="What needs to get done?" required /></label>
          <label className="task-description-field">Description<textarea rows="3" value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} placeholder="Add helpful details (optional)" /></label>
          <label>Priority<select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}><option>High</option><option>Medium</option><option>Low</option></select></label>
          <label>Category<select value={taskForm.category} onChange={(event) => setTaskForm({ ...taskForm, category: event.target.value })}><option>General</option><option>Study</option><option>Communication</option><option>Work</option></select></label>
          <label>Due date<input value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} placeholder="e.g. Friday" /></label>
          <button type="submit" className="primary-btn task-submit">Add task <span aria-hidden="true">→</span></button>
        </form>
      </section>
    </div>
  );
}

export function VoiceAIPage({ voiceText, setVoiceText, isListening, isVoiceSupported, onVoiceCapture, onVoiceSubmit }) {
  return (
    <div className="page-content voice-page">
      <section className={`voice-studio ${isListening ? 'is-listening' : ''}`}>
        <div className="studio-copy"><span className="eyebrow">Voice capture</span><h2>Say it. We’ll sort it.</h2><p>Speak naturally about what you need to do. TaskFlow will find the tasks, priorities, and deadlines in your words.</p></div>
        <div className="microphone-stage"><div className="mic-ring"><span className="mic-glyph" aria-hidden="true">◉</span></div><p className="listening-state">{isListening ? 'Listening now…' : isVoiceSupported ? 'Ready when you are' : 'Voice input unavailable in this browser'}</p><button className={`record-btn ${isListening ? 'listening' : ''}`} onClick={onVoiceCapture} disabled={!isVoiceSupported} type="button"><span aria-hidden="true">{isListening ? '■' : '◉'}</span>{isListening ? 'Stop recording' : 'Start recording'}</button></div>
      </section>
      <div className="voice-workspace-grid">
        <section className="panel transcript-panel"><div className="section-heading"><div><span className="eyebrow">Your words</span><h2>Transcript</h2></div><span className="live-indicator"><i />{isListening ? 'Recording' : 'Editable'}</span></div><form onSubmit={onVoiceSubmit} className="transcript-form"><textarea rows="8" value={voiceText} onChange={(event) => setVoiceText(event.target.value)} placeholder="Your transcript will appear here. You can also type or paste a note." /><div className="transcript-footer"><span>{voiceText.trim().split(/\s+/).filter(Boolean).length} words</span><button type="submit" className="primary-btn" disabled={!voiceText.trim()}>Extract tasks <span aria-hidden="true">→</span></button></div></form></section>
        <aside className="panel voice-help-panel"><span className="eyebrow">Try a prompt</span><h2>Speak like you think.</h2><div className="command-example"><span className="quote-mark">“</span><p>Finish my project report by Thursday. It’s high priority, and I also need to call Maya about the research notes.</p></div><div className="workflow-list"><span><b>01</b> Capture a voice note</span><span><b>02</b> Review your transcript</span><span><b>03</b> Extract tasks to your board</span></div></aside>
      </div>
    </div>
  );
}

export function CalendarPage({ tasks }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const datedTasks = tasks.map((task) => ({ task, date: resolveDueDate(task.dueDate) })).filter((item) => item.date);
  const taskMap = new Map();
  datedTasks.forEach(({ task, date }) => {
    const key = dateKey(date);
    taskMap.set(key, [...(taskMap.get(key) || []), task]);
  });
  const upcoming = [...datedTasks].filter(({ date, task }) => date >= new Date(new Date().setHours(0, 0, 0, 0)) && task.status !== 'completed').sort((a, b) => a.date - b.date).slice(0, 6);
  const todayKey = dateKey(new Date());

  return (
    <div className="page-content calendar-layout">
      <section className="panel calendar-panel"><div className="calendar-toolbar"><div><span className="eyebrow">Plan ahead</span><h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2></div><div className="calendar-controls"><button className="icon-action" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><button className="secondary-btn today-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button className="icon-action" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div></div>
        <div className="calendar-grid calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid calendar-days">{calendarDays.map((date) => {
          const key = dateKey(date);
          const dayTasks = taskMap.get(key) || [];
          return <div key={key} className={`calendar-day ${date.getMonth() !== month.getMonth() ? 'outside-month' : ''} ${key === todayKey ? 'is-today' : ''}`}><span className="calendar-day-number">{date.getDate()}</span>{dayTasks.slice(0, 2).map((task) => <span key={task.id} className={`calendar-task ${task.status === 'completed' ? 'calendar-task-complete' : ''}`} title={task.title}>{task.title}</span>)}{dayTasks.length > 2 && <span className="more-tasks">+{dayTasks.length - 2} more</span>}</div>;
        })}</div>
      </section>
      <aside className="panel upcoming-panel"><span className="eyebrow">Coming up</span><h2>Upcoming deadlines</h2>{upcoming.length ? <div className="upcoming-list">{upcoming.map(({ task, date }) => <article className="upcoming-item" key={task.id}><div className="upcoming-date"><strong>{date.getDate()}</strong><span>{date.toLocaleDateString(undefined, { month: 'short' })}</span></div><div><h3>{task.title}</h3><p>{task.category || 'General'} <span>·</span> {task.priority || 'Medium'} priority</p></div></article>)}</div> : <div className="empty-state compact-empty"><span className="empty-icon">▦</span><h3>No upcoming deadlines</h3><p>Tasks with recognized due dates will appear here.</p></div>}<p className="calendar-note">Showing tasks with dates that can be interpreted from your existing task data.</p></aside>
    </div>
  );
}

export function AnalyticsPage({ tasks, stats, summary }) {
  const completion = summary.total ? Math.round((summary.completed / summary.total) * 100) : 0;
  const priorityCounts = [
    { label: 'High', count: tasks.filter((task) => String(task.priority).toLowerCase() === 'high').length },
    { label: 'Medium', count: tasks.filter((task) => String(task.priority).toLowerCase() === 'medium').length },
    { label: 'Low', count: tasks.filter((task) => String(task.priority).toLowerCase() === 'low').length },
  ];
  const categories = [...new Set(tasks.map((task) => task.category || 'General'))].map((category) => ({ category, count: tasks.filter((task) => (task.category || 'General') === category).length })).sort((a, b) => b.count - a.count).slice(0, 5);
  const maxPriority = Math.max(1, ...priorityCounts.map((item) => item.count));

  return (
    <div className="page-content analytics-page">
      <section className="stats-grid analytics-stats">{stats.map((stat, index) => <article className="panel stat-box" key={stat.label}><div className={`stat-icon stat-icon-${index}`} aria-hidden="true">{['↗', '◷', '↗', '✓', '!'][index]}</div><span>{stat.label}</span><strong>{stat.value}</strong><small>{index === 0 ? 'Total in your workspace' : 'Current task count'}</small></article>)}</section>
      <div className="analytics-grid">
        <section className="panel completion-panel"><div className="section-heading"><div><span className="eyebrow">Completion overview</span><h2>Work in progress</h2></div><span className="count-pill">{completion}% complete</span></div><div className="completion-visual"><div className="completion-ring" style={{ '--completion': `${completion}%` }}><div><strong>{completion}%</strong><span>completed</span></div></div><div className="completion-legend"><span><i className="legend-complete" />Completed <strong>{summary.completed}</strong></span><span><i className="legend-active" />In progress <strong>{summary.inProgress}</strong></span><span><i className="legend-todo" />To do <strong>{summary.todo}</strong></span></div></div></section>
        <section className="panel priority-panel"><div className="section-heading"><div><span className="eyebrow">Task mix</span><h2>Priority breakdown</h2></div></div><div className="bar-chart">{priorityCounts.map((item) => <div className="bar-row" key={item.label}><span>{item.label}</span><div className="bar-track"><i className={`bar-fill bar-${item.label.toLowerCase()}`} style={{ width: `${(item.count / maxPriority) * 100}%` }} /></div><strong>{item.count}</strong></div>)}</div><p className="analytics-note">A snapshot of task priorities currently on your board.</p></section>
        <section className="panel categories-panel"><div className="section-heading"><div><span className="eyebrow">Where work goes</span><h2>Task categories</h2></div></div>{categories.length ? <div className="category-list">{categories.map(({ category, count }) => <div className="category-row" key={category}><span className="category-dot" /><span>{category}</span><strong>{count}</strong></div>)}</div> : <div className="empty-state compact-empty"><h3>No task data yet</h3><p>Create a task to see your breakdown.</p></div>}</section>
        <section className="analytics-footnote"><span className="analytics-footnote-mark">i</span><p>Analytics are calculated from tasks already loaded in your workspace. No additional activity or historical data is inferred.</p></section>
      </div>
    </div>
  );
}

export function ProfilePage({ user, profile, onProfileChange, onLogout }) {
  const [interestInput, setInterestInput] = useState('');
  const fileInputRef = useRef(null);
  const name = profile.name || user.name;
  const addInterest = (event) => {
    event.preventDefault();
    const interest = interestInput.trim();
    if (!interest || (profile.interests || []).includes(interest)) return;
    onProfileChange('interests', [...(profile.interests || []), interest]);
    setInterestInput('');
  };
  const setAvatarFromFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => onProfileChange('avatar', String(reader.result));
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div className="page-content profile-page">
      <section className="panel profile-editor"><div className="section-heading"><div><span className="eyebrow">Your profile</span><h2>Personal details</h2></div><span className="saved-locally"><i /> Saved on this device</span></div>
        <div className="avatar-editor"><Avatar name={name} src={profile.avatar} size="profile" /><div><strong>Your photo</strong><p>Choose an image or use your initials.</p><div className="avatar-actions"><button className="secondary-btn" onClick={() => fileInputRef.current?.click()} type="button">Change photo</button>{profile.avatar && <button className="text-action danger-text" onClick={() => onProfileChange('avatar', '')} type="button">Remove photo</button>}<input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={setAvatarFromFile} /></div></div></div>
        <div className="profile-fields"><label>Full name<input value={profile.name ?? user.name ?? ''} onChange={(event) => onProfileChange('name', event.target.value)} placeholder={user.name} /></label><label>Age<input type="number" min="1" max="120" value={profile.age} onChange={(event) => onProfileChange('age', event.target.value)} placeholder="Your age" /></label><label>What I do<input value={profile.occupation} onChange={(event) => onProfileChange('occupation', event.target.value)} placeholder="e.g. Product designer" /></label><label className="profile-bio-field">Short bio<textarea rows="4" value={profile.bio} onChange={(event) => onProfileChange('bio', event.target.value)} placeholder="A little about you and what you're working on." /></label></div>
      </section>
      <section className="panel profile-interests"><div className="section-heading"><div><span className="eyebrow">Make it personal</span><h2>Interests & focus</h2></div></div><div className="interest-row profile-interest-list">{(profile.interests || []).map((interest) => <span className="interest-chip removable-chip" key={interest}>{interest}<button type="button" onClick={() => onProfileChange('interests', profile.interests.filter((item) => item !== interest))} aria-label={`Remove ${interest}`}>×</button></span>)}{!profile.interests?.length && <span className="muted-copy">Add a few things you’re interested in.</span>}</div><form className="interest-form" onSubmit={addInterest}><input value={interestInput} onChange={(event) => setInterestInput(event.target.value)} placeholder="Add an interest" aria-label="New interest" /><button className="secondary-btn" type="submit" disabled={!interestInput.trim()}>Add interest <span aria-hidden="true">＋</span></button></form></section>
      <section className="panel preferences-panel"><div className="section-heading"><div><span className="eyebrow">Your experience</span><h2>Personal preferences</h2></div></div><label>What would you like to focus on?<textarea rows="3" value={profile.preferences} onChange={(event) => onProfileChange('preferences', event.target.value)} placeholder="For example: keep my study tasks visible, or help me stay on top of deadlines." /></label><p className="field-note">These preferences are stored locally and do not change task processing.</p></section>
      <section className="panel account-panel"><div><span className="eyebrow">Account</span><h2>Login & security</h2><p>Signed in as <strong>{user.email}</strong></p><p className="field-note">Your account access is managed by your existing TaskFlow login.</p></div><button className="danger-btn" onClick={onLogout} type="button"><span aria-hidden="true">↪</span> Logout</button></section>
    </div>
  );
}