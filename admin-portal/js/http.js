// Unified HTTP wrapper with auth header and 401/403 handling
(function(){
  const isLocal = (typeof location !== 'undefined') && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const DEFAULT_BASE = isLocal ? 'http://127.0.0.1:3000/api' : 'https://www.goupclub.com/api';
  const API_BASE = (typeof window !== 'undefined' && window.HTTP_API_BASE)
    ? String(window.HTTP_API_BASE)
    : DEFAULT_BASE;

  async function request(path, options = {}){
    const headers = { ...(options.headers || {}) };
    // 若为 FormData，勿手动设定 Content-Type（浏览器会自动设置带 boundary 的 multipart/form-data）
    const isFormData = options && options.body && typeof FormData !== 'undefined' && (options.body instanceof FormData);
    if (!isFormData && options.body && !('Content-Type' in headers)) {
      headers['Content-Type'] = 'application/json';
    }
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