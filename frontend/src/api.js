const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('taskflow_token');
  const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(!isMultipart ? { 'Content-Type': 'application/json' } : {}),
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
  transcribeAudio: (audioBlob) => {
    const formData = new FormData();
    const mimeType = String(audioBlob.type || '').split(';')[0].toLowerCase();
    const extensionByMimeType = {
      'audio/aac': 'aac',
      'audio/flac': 'flac',
      'audio/mp3': 'mp3',
      'audio/mp4': 'mp4',
      'audio/m4a': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/webm': 'webm',
      'audio/x-m4a': 'm4a',
      'audio/x-wav': 'wav',
    };
    formData.append('audio', audioBlob, `recording.${extensionByMimeType[mimeType] || 'webm'}`);
    return request('/tasks/transcribe', { method: 'POST', body: formData });
  },
  updateTask: (taskId, payload) => request(`/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTask: (taskId) => request(`/tasks/${taskId}`, { method: 'DELETE' }),
};
