// Unified HTTP wrapper with auth header and 401/403 handling
(function(){
  const DEFAULT_BASE = 'https://www.goupclub.com/api';
  const API_BASE = (typeof window !== 'undefined' && window.HTTP_API_BASE)
    ? String(window.HTTP_API_BASE)
    : DEFAULT_BASE;

  async function request(path, options = {}){
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    try {
      const token = localStorage.getItem('adminToken');
      if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
    } catch(_) {}
    const safePath = String(path || '');
    const url = `${API_BASE}${safePath.startsWith('/') ? '' : '/'}${safePath}`;
    const res = await fetch(url, { ...options, headers });
    if (res && (res.status === 401 || res.status === 403)){
      try { localStorage.removeItem('adminToken'); } catch(_){ }
      if (typeof window !== 'undefined' && window && window.dispatchEvent){
        window.dispatchEvent(new CustomEvent('admin-auth-expired', { detail: { status: res.status } }));
      }
      throw new Error(`AUTH_${res.status}`);
    }
    return res;
  }

  async function json(path, options = {}){
    const res = await request(path, options);
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return res.json();
  }

  window.http = { request, json };
})();