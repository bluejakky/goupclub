// 独立的支付异常监控应用
(function(){
  const { createApp, ref, reactive, computed, watch } = Vue;

  // 使用统一 HTTP 封装

  createApp({
    setup(){
      const adminLogin = reactive({ username:'', password:'' });
      const adminToken = ref(localStorage.getItem('adminToken') || '');
      const errorsLimit = ref(50);
      const paymentErrors = ref([]);
      const totalCount = ref(0);
      const providerFilter = ref('全部');
      const keyword = ref('');

      // 自动刷新与分页
      const autoRefresh = ref(false);
      const refreshIntervalMs = ref(10000);
      const pageSize = ref(10);
      const currentPage = ref(1);
      let timerId = null;

      const providerOptions = computed(() => {
        const set = new Set();
        (paymentErrors.value || []).forEach(e => { if (e && e.provider) set.add(String(e.provider)); });
        return ['全部', ...Array.from(set)];
      });
      // 采用服务端分页与筛选后，前端直接展示服务端返回的数据
      const filteredErrors = computed(() => Array.isArray(paymentErrors.value) ? paymentErrors.value : []);
      const totalPages = computed(() => {
        const len = Number(totalCount.value || 0);
        const size = Number(pageSize.value) || 10;
        return Math.max(1, Math.ceil(len / Math.max(1, size)));
      });
      const visibleErrors = computed(() => {
        // 服务端已按页返回，直接使用当前列表
        return filteredErrors.value;
      });

      async function doAdminLogin(){
        try {
          const data = await http.json('/admin/login', {
            method:'POST',
            body: JSON.stringify({ username: adminLogin.username, password: adminLogin.password })
          });
          adminToken.value = data.token || '';
          if (adminToken.value) localStorage.setItem('adminToken', adminToken.value);
          // 登录后可选择自动刷新
          if (autoRefresh.value) startAutoRefresh();
        } catch(err){
          console.error('login failed', err);
          alert('登录失败');
        }
      }

      function logoutAdmin(){
        adminToken.value='';
        localStorage.removeItem('adminToken');
        stopAutoRefresh();
      }

      async function fetchPaymentErrors(){
        if (!adminToken.value) { alert('请先登录'); return; }
        try {
          const pf = providerFilter.value;
          const kw = (keyword.value || '').trim();
          const qs = new URLSearchParams();
          if (pf && pf !== '全部') qs.set('provider', pf);
          if (kw) qs.set('keyword', kw);
          qs.set('page', String(Math.max(1, Number(currentPage.value) || 1)));
          qs.set('pageSize', String(Math.max(1, Number(pageSize.value) || 10)));
          const data = await http.json(`/payments/errors?${qs.toString()}`);
          paymentErrors.value = Array.isArray(data?.items) ? data.items : [];
          totalCount.value = Number(data?.total || 0);
          // 修正当前页范围
          if (currentPage.value > totalPages.value) currentPage.value = totalPages.value;
        } catch(err){
          console.error('fetch errors failed', err);
          alert('获取异常记录失败');
        }
      }

      function startAutoRefresh(){
        stopAutoRefresh();
        const iv = Math.max(3000, Number(refreshIntervalMs.value) || 10000);
        timerId = setInterval(() => {
          if (adminToken.value) fetchPaymentErrors();
        }, iv);
      }
      function stopAutoRefresh(){
        if (timerId) { clearInterval(timerId); timerId = null; }
      }

      function setPage(n){
        const p = Math.min(Math.max(1, Number(n) || 1), totalPages.value);
        currentPage.value = p;
        // 翻页即重新拉取服务端数据
        fetchPaymentErrors();
      }

      // 监听自动刷新开关与间隔变化
      watch([autoRefresh, refreshIntervalMs, adminToken], ([on]) => {
        if (adminToken.value && on) startAutoRefresh(); else stopAutoRefresh();
      });

      // 切换每页数量时重置页码
      watch(pageSize, () => { currentPage.value = 1; });
      watch([providerFilter, keyword], () => { currentPage.value = 1; });

      // 监听登录过期事件，清理令牌与定时器
      window.addEventListener('admin-auth-expired', () => {
        adminToken.value = '';
        try { localStorage.removeItem('adminToken'); } catch(_) {}
        stopAutoRefresh();
        alert('登录已过期，请重新登录');
      });

      return {
        adminLogin,
        adminToken,
        errorsLimit,
        paymentErrors,
        autoRefresh,
        refreshIntervalMs,
        pageSize,
        currentPage,
        totalPages,
        visibleErrors,
        providerOptions,
        providerFilter,
        keyword,
        doAdminLogin,
        logoutAdmin,
        fetchPaymentErrors,
        startAutoRefresh,
        stopAutoRefresh,
        setPage,
        exportCSV: () => {
          const rows = Array.isArray(filteredErrors.value) ? filteredErrors.value : [];
          const headers = ['id','provider','orderId','reason','detail','createdAt'];
          const escape = (v) => {
            const s = (v === null || v === undefined) ? '' : String(v);
            // Escape double quotes and wrap field
            return '"' + s.replace(/"/g, '""') + '"';
          };
          const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => escape(r[h])).join(','))).join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const ts = new Date().toISOString().replace(/[:.]/g,'-');
          a.download = `payment-errors-${ts}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        },
      };
    }
  }).mount('#errors-app');
})();