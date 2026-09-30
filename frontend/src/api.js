const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('taskflow_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  getTasks: () => request('/tasks'),
  getSummary: () => request('/tasks/summary'),
  createTask: (payload) => request('/tasks/manual', { method: 'POST', body: JSON.stringify(payload) }),
  createVoiceTasks: (payload) => request('/tasks/voice', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (taskId, payload) => request(`/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTask: (taskId) => request(`/tasks/${taskId}`, { method: 'DELETE' }),
};
