const { createApp, ref, reactive } = Vue;

createApp({
  setup() {
    const ready = Vue.ref(false);
    const tab = ref('activity');
    const notice = ref('');
    const toast = (msg) => {
      notice.value = msg;
      setTimeout(() => (notice.value = ''), 2000);
    };

    // 可切换的后端API层（预留）。切换 useApi 为 true 即走真实接口。
    const api = {
      useApi: ref(false),
      async createActivity(payload) {
        const res = await fetch('/api/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('创建活动失败');
        return res.json();
      },
      async updateActivity(id, payload) {
        const res = await fetch(`/api/activities/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('更新活动失败');
        return res.json();
      },
      async changeActivityStatus(id, status) {
        const res = await fetch(`/api/activities/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        if (!res.ok) throw new Error('更新状态失败');
        return res.json();
      },
      async listActivities() {
        const res = await fetch('/api/activities');
        if (!res.ok) throw new Error('获取活动列表失败');
        return res.json();
      },
      async createCategory(data) {
        const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error('创建分类失败');
        return res.json();
      },
      async updateCategory(id, data) {
        const res = await fetch(`/api/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error('更新分类失败');
        return res.json();
      },
      async deleteCategory(id) {
        const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除分类失败');
        return res.json();
      },
      async listCategories() {
        const res = await fetch('/api/categories');
        if (!res.ok) throw new Error('获取分类失败');
        return res.json();
      },
    };
    // 兼容模板绑定：将 api.useApi 封装为可双向绑定的 computed
    const useApiVal = Vue.computed({
      get() { return !!(api && api.useApi && api.useApi.value); },
      set(v) { if (api && api.useApi) api.useApi.value = !!v; }
    });

    // 分类（增加排序权重字段）
    const categories = reactive([
      { id: 1, name: '汉语', builtin: true, editing: false, weight: 10 },
      { id: 2, name: '英语', builtin: true, editing: false, weight: 20 },
      { id: 3, name: '小语种', builtin: true, editing: false, weight: 30 },
      { id: 4, name: '志愿', builtin: true, editing: false, weight: 40 },
      { id: 5, name: '主题', builtin: true, editing: false, weight: 50 },
    ]);
    const newCategory = ref('');
    const addCategory = async () => {
      const name = newCategory.value.trim();
      if (!name) return toast('请输入分类名称');
      const exists = categories.some((c) => c.name === name);
      if (exists) return toast('分类已存在');
      if (api.useApi.value) {
        try {
          const created = await api.createCategory({ name, weight: 60 });
          categories.push({ id: created.id, name: created.name, builtin: false, editing: false, weight: created.weight ?? 60 });
        } catch (e) {
          console.error(e);
          return toast('创建分类失败');
        }
      } else {
        categories.push({ id: Date.now(), name, builtin: false, editing: false, weight: 60 });
      }
      newCategory.value = '';
      toast('已新增分类');
      saveToLocal();
    };
    const saveCategory = async (c) => {
      c.editing = false;
      if (api.useApi.value) {
        try { await api.updateCategory(c.id, { name: c.name, weight: c.weight }); } catch (e) { console.error(e); toast('保存分类失败'); }
      }
      toast('已保存分类');
      saveToLocal();
    };
    const deleteCategory = async (c) => {
      if (c.builtin) return toast('基础分类不可删除');
      const used = activities.some((a) => a.categoryIds.includes(c.id));
      if (used) return toast('分类已关联活动，无法删除');
      const idx = categories.findIndex((x) => x.id === c.id);
      if (idx >= 0) categories.splice(idx, 1);
      if (api.useApi.value) {
        try { await api.deleteCategory(c.id); } catch (e) { console.error(e); toast('删除分类失败'); }
      }
      toast('已删除分类');
      saveToLocal();
    };

    // 活动
    const groupOptions = reactive(['外国人', '中国人', '男', '女', '未成年']);
    const statusOptions = reactive(['草稿', '待发布', '已发布', '已结束', '已取消']);
    const activities = reactive([
      {
        id: 101,
        title: '英语角交流',
        start: '2025-10-10T19:00',
        end: '2025-10-10T21:00',
        place: '市图书馆',
        lat: null,
        lng: null,
        categoryIds: [2],
        groups: ['外国人', '中国人'],
        min: 0,
        max: 20,
        waitlist: 5,
        enrolled: 18,
        price: 20.0,
        status: '已发布',
        isTop: false,
        isHot: true,
        publishedAt: '2025-10-01T12:00',
        mainImage: '',
        images: [],
        content: '',
      },
    ]);
    const showActivityModal = ref(false);
    const editingId = ref(null);
    const showPlacePicker = ref(false);
    const placeSearchKeyword = ref('');
    const placeSearchResults = ref([]);
    const placeSearching = ref(false);
    const fullAlertPercent = ref(90);
    let quillInstance = null;
    let cropper = null;
    let leafletMap = null;
    let leafletMarker = null;
    let searchMarkers = null;
    let selectedLatLng = null;
    const selectedResultIndex = ref(-1);
    const clearAlsoSelected = ref(false);
    const pinColors = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#22d3ee'];
    // 搜索分页状态
    const placePage = ref(0);
    const pageSize = ref(8);
    const hasNextPlace = ref(false);
    // 主题切换（明/暗/跟随系统）
    const themeMode = ref(localStorage.getItem('themeMode') || 'system');
    const applyTheme = () => {
      let mode = themeMode.value;
      if (mode === 'system') {
        mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      }
      const themes = ['dark','light','ocean','forest','sunset','slate'];
      try {
        themes.forEach((t) => document.body.classList.remove('theme-' + t));
        document.body.classList.add('theme-' + mode);
      } catch (e) {}
    };
    const setTheme = (name) => { themeMode.value = name; };
    const themeLabel = Vue.computed(() => {
      const map = { system: '跟随系统', dark: '夜蓝', light: '明亮', ocean: '海洋', forest: '森林', sunset: '暮色', slate: '石板' };
      return map[themeMode.value] || themeMode.value;
    });
    Vue.watch(themeMode, (v) => { try { localStorage.setItem('themeMode', v); } catch (e) {} applyTheme(); });
    Vue.onMounted(() => { applyTheme(); });
    const activityForm = reactive({
      title: '',
      start: '',
      end: '',
      place: '',
      categoryIds: [],
      groups: [],
      min: 0,
      max: 1,
      waitlist: 0,
      enrolled: 0,
      price: 0,
      status: '草稿',
      isTop: false,
      isHot: false,
      publishedAt: '',
      mainImage: '',
      images: [],
      imagesText: '',
      content: '',
      lat: null,
      lng: null,
    });
    // 表单校验（即时显示错误与禁用保存）
    const computeFormErrors = () => {
      const errs = {};
      if (!activityForm.title) errs.title = '请填写标题';
      if (activityForm.title && activityForm.title.length > 30) errs.title = '标题不超过30字';
      if (!activityForm.start) errs.start = '请填写开始时间';
      if (!activityForm.end) errs.end = '请填写结束时间';
      if (activityForm.start && activityForm.end && activityForm.end <= activityForm.start) errs.end = '结束时间需晚于开始时间';
      if (activityForm.categoryIds.length < 1) errs.categoryIds = '至少选择一个分类';
      if (activityForm.groups.length < 1) errs.groups = '至少选择一个分组';
      if (activityForm.min < 0) errs.min = '最小人数不能为负数';
      if (activityForm.max < 1) errs.max = '最大人数需≥1';
      if (activityForm.min > activityForm.max) errs.min = '最小人数不能超过最大人数';
      if (activityForm.waitlist < 0) errs.waitlist = '候补名额不能为负数';
      // 报名金额：必须为整数（元）且≥0
      const priceNum = Number(activityForm.price ?? 0);
      if (priceNum < 0) errs.price = '报名金额需≥0（元）';
      else if (!Number.isInteger(priceNum)) errs.price = '报名金额需为整数（元）';
      return errs;
    };
    const formErrors = Vue.computed(computeFormErrors);
    const isFormValid = Vue.computed(() => Object.keys(formErrors.value).length === 0);
    const initQuill = () => {
      const el = document.getElementById('rich-editor');
      if (!el) return;
      if (!quillInstance) {
        const imageHandler = function () {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            try {
              const url = await uploadImage(file);
              const range = quillInstance.getSelection(true);
              quillInstance.insertEmbed(range.index, 'image', url, 'user');
            } catch (err) {
              console.error('上传图片失败', err);
              toast('上传图片失败');
            }
          };
          input.click();
        };
        quillInstance = new Quill('#rich-editor', {
          theme: 'snow',
          modules: {
            toolbar: { 
              container: [["bold", "italic", "underline", "strike"], [{ list: "ordered" }, { list: "bullet" }], ["link", "image"]],
              handlers: { image: imageHandler },
            },
          },
        });
      }
      quillInstance.root.innerHTML = activityForm.content || '';
    };
    const openActivityForm = () => {
      Object.assign(activityForm, {
        title: '', start: '', end: '', place: '', categoryIds: [], groups: [], min: 0, max: 1, waitlist: 0, enrolled: 0, price: 0, status: '草稿', isTop: false, isHot: false, publishedAt: '', mainImage: '', images: [], imagesText: '', content: '',
      });
      editingId.value = null;
      showActivityModal.value = true;
      Vue.nextTick(() => initQuill());
    };
    const openEditActivity = (a) => {
      Object.assign(activityForm, JSON.parse(JSON.stringify(a)));
      activityForm.imagesText = Array.isArray(a.images) ? a.images.join(',') : '';
      activityForm.images = Array.isArray(a.images) ? [...a.images] : [];
      editingId.value = a.id;
      showActivityModal.value = true;
      Vue.nextTick(() => initQuill());
    };
    const renderCategoryNames = (ids) => {
      return ids.map((id) => {
        const c = categories.find((x) => x.id === id);
        return c ? c.name : id;
      }).join('、');
    };

    // 分类排序视图
    const sortedCategories = Vue.computed(() => {
      return [...categories].sort((a, b) => (a.weight || 0) - (b.weight || 0));
    });
    const saveActivity = async () => {
      if (!activityForm.title) return toast('请填写标题');
      if (activityForm.title && activityForm.title.length > 30) toast('提示：标题建议不超过30字');
      if (!activityForm.start || !activityForm.end) return toast('请填写开始/结束时间');
      if (activityForm.end <= activityForm.start) return toast('结束时间需晚于开始时间');
      if (activityForm.categoryIds.length < 1) return toast('至少选择一个分类');
      if (activityForm.groups.length < 1) return toast('至少选择一个分组');
      if (activityForm.min < 0) return toast('最小人数不能为负数');
      if (activityForm.max < 1) return toast('最大人数需≥1');
      if (activityForm.min > activityForm.max) return toast('最小人数不能超过最大人数');
      if (activityForm.waitlist < 0) return toast('候补名额不能为负数');
      if (!Number.isInteger(Number(activityForm.price ?? 0)) || Number(activityForm.price ?? 0) < 0) {
        return toast('报名金额需为整数（元）且≥0');
      }
      const payload = JSON.parse(JSON.stringify(activityForm));
      const textImgs = (payload.imagesText || '').split(',').map(s => s.trim()).filter(Boolean);
      payload.images = [...textImgs, ...(activityForm.images || [])];
      delete payload.imagesText;
      // 正规化数值字段
      payload.min = Number(payload.min || 0);
      payload.max = Number(payload.max || 0);
      payload.waitlist = Number(payload.waitlist || 0);
      payload.price = Math.round(Number(payload.price || 0));
      payload.enrolled = Number(payload.enrolled || 0);
      payload.lat = (activityForm.lat === null || activityForm.lat === undefined || activityForm.lat === '') ? null : Number(activityForm.lat);
      payload.lng = (activityForm.lng === null || activityForm.lng === undefined || activityForm.lng === '') ? null : Number(activityForm.lng);
      try { if (quillInstance) payload.content = quillInstance.root.innerHTML || ''; } catch (e) {}
      // 统一将可选文本字段的 undefined/空字符串 转为 null，避免后端 SQL 绑定错误
      payload.place = String(payload.place || '').trim() || null;
      payload.mainImage = String(payload.mainImage || '').trim() || null;
      payload.content = (typeof payload.content === 'string' && payload.content.trim() !== '') ? payload.content : null;
      // 处理发布时间：发布状态未填则补当前时间；非发布状态则为 null
      if (payload.status === '已发布' && !payload.publishedAt) {
        payload.publishedAt = new Date().toISOString().slice(0,16);
      } else {
        const v = String(payload.publishedAt || '').trim();
        payload.publishedAt = v ? v : null;
      }
      if (api.useApi.value) {
        try {
          if (editingId.value) {
            await withRetry(() => api.updateActivity(editingId.value, payload));
            toast('活动已更新（后端）');
          } else {
            await withRetry(() => api.createActivity(payload));
            toast('活动已创建（后端）');
          }
        } catch (e) {
          console.error(e);
          return toast('保存活动失败（已重试）');
        }
      } else {
        if (editingId.value) {
          const idx = activities.findIndex((x) => x.id === editingId.value);
          if (idx >= 0) activities[idx] = { id: editingId.value, ...payload };
          toast('活动已更新');
          if (payload.status === '已发布') checkCapacityAlert(payload);
        } else {
          activities.push({ id: Date.now(), ...payload });
          toast('活动已创建');
          if (payload.status === '已发布') checkCapacityAlert(payload);
        }
      }
      showActivityModal.value = false;
      saveToLocal();
    };
    const changeStatus = (a) => {
      if (a.status === '已发布' && !a.publishedAt) {
        a.publishedAt = new Date().toISOString().slice(0,16);
      }
      if (a.status === '已发布') checkCapacityAlert(a);
      toast('状态已更新：' + a.status);
      saveToLocal();
    };

    const onMainImageSelect = (e) => {
      try {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const imgEl = document.getElementById('mainImageCropper');
        if (!imgEl) return;
        const reader = new FileReader();
        reader.onload = () => {
          imgEl.src = reader.result;
          if (cropper) cropper.destroy();
          cropper = new Cropper(imgEl, { aspectRatio: 16 / 9, viewMode: 1 });
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('选择主图失败', err);
        toast('选择主图失败');
      }
    };
    const applyMainImageCrop = () => {
      try {
        if (!cropper) return toast('请先选择图片');
        const canvas = cropper.getCroppedCanvas({ width: 1280, height: 720 });
        if (!canvas) return toast('裁剪失败');
        activityForm.mainImage = canvas.toDataURL('image/jpeg', 0.9);
        toast('主图已裁剪并保存');
      } catch (err) {
        console.error('裁剪主图失败', err);
        toast('裁剪主图失败');
      }
    };

    const onImagesSelect = async (e) => {
      try {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        for (const file of files) {
          await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              activityForm.images.push(reader.result);
              resolve();
            };
            reader.readAsDataURL(file);
          });
        }
        toast('已添加附图：' + files.length + ' 张');
      } catch (err) {
        console.error('附图上传失败', err);
        toast('附图上传失败');
      }
    };

    const openPlacePicker = () => {
      showPlacePicker.value = true;
      try { document.body.style.overflow = 'hidden'; } catch (e) {}
      Vue.nextTick(() => {
        const el = document.getElementById('mapContainer');
        if (!el) return;
        const hasCoord = activityForm.lat != null && activityForm.lng != null;
        const center = hasCoord ? [activityForm.lat, activityForm.lng] : [31.2304, 121.4737];
        // 如果地图实例存在但容器已被销毁或替换，重新创建实例
        try {
          if (leafletMap && leafletMap._container !== el) {
            leafletMap.remove();
            leafletMap = null;
            leafletMarker = null;
            searchMarkers = null;
          }
        } catch (e) {}
        if (!leafletMap) {
          leafletMap = L.map(el).setView(center, 11);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(leafletMap);
          leafletMap.on('click', (e) => {
            selectedLatLng = e.latlng;
            if (leafletMarker) {
              leafletMarker.setLatLng(selectedLatLng);
              if (leafletMarker.dragging) leafletMarker.dragging.enable();
            } else {
              leafletMarker = L.marker(selectedLatLng, { draggable: true }).addTo(leafletMap);
              leafletMarker.on('dragend', (ev) => {
                const p = ev.target.getLatLng();
                selectedLatLng = p;
              });
            }
          });
          if (hasCoord) {
            selectedLatLng = { lat: activityForm.lat, lng: activityForm.lng };
            leafletMarker = L.marker(selectedLatLng, { draggable: true }).addTo(leafletMap);
            leafletMarker.on('dragend', (ev) => {
              const p = ev.target.getLatLng();
              selectedLatLng = p;
            });
          }
        } else {
          leafletMap.setView(center);
          leafletMap.invalidateSize();
        }
        // 轻微延迟再次刷新尺寸，避免弹窗动画影响初次渲染
        setTimeout(() => { try { leafletMap && leafletMap.invalidateSize(); } catch (e) {} }, 200);
      });
    };
    const closePlacePicker = () => {
      showPlacePicker.value = false;
      try { document.body.style.overflow = ''; } catch (e) {}
      // 关闭时清理地图实例，避免下次打开容器失效
      try {
        if (leafletMap) { leafletMap.remove(); }
      } catch (e) {}
      leafletMap = null;
      leafletMarker = null;
      if (searchMarkers) {
        try { searchMarkers.clearLayers(); } catch (e) {}
      }
      searchMarkers = null;
    };
    const searchPlace = async () => {
      const q = placeSearchKeyword.value.trim();
      if (!q) return toast('请输入地址关键词');
      placeSearching.value = true;
      try {
        placeSearchResults.value = [];
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=8`, { headers: { 'Accept': 'application/json' } });
        const list = await res.json();
        if (!Array.isArray(list) || list.length === 0) { toast('未找到匹配地址'); return; }
        placeSearchResults.value = list.map((it, idx) => {
          const a = it.address || {};
          const district = a.city || a.town || a.village || a.county || a.state || a.suburb || a.region || '';
          const category = [it.class, it.type].filter(Boolean).join('/');
          return { id: it.place_id || it.osm_id || it.display_name, name: it.display_name, lat: Number(it.lat), lng: Number(it.lon), district, category, idx };
        });
        if (leafletMap) {
          if (!searchMarkers) searchMarkers = L.layerGroup().addTo(leafletMap);
          searchMarkers.clearLayers();
          const latLngs = [];
          placeSearchResults.value.forEach((r, idx) => {
            const color = pinColors[idx % pinColors.length];
            const m = L.marker([r.lat, r.lng], {
              icon: L.divIcon({ className: 'map-pin-wrap', html: `<div class="map-pin" style="background:${color}">${idx + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] })
            }).addTo(searchMarkers);
            m.on('click', () => {
              chooseSearchResult(r);
            });
            latLngs.push([r.lat, r.lng]);
          });
          if (latLngs.length > 0) {
            try { leafletMap.fitBounds(latLngs, { padding: [20, 20] }); } catch (e) {}
          }
        }
      } catch (e) {
        console.error('地址搜索失败', e);
        toast('地址搜索失败');
      } finally {
        placeSearching.value = false;
      }
    };
    const chooseSearchResult = (item) => {
      try {
        // 记录当前选中的候选索引用于列表高亮
        try { selectedResultIndex.value = placeSearchResults.value.findIndex((x) => x && x.id === item.id); } catch (e) {}
        selectedLatLng = { lat: item.lat, lng: item.lng };
        if (leafletMap) {
          leafletMap.setView([item.lat, item.lng], 14);
          if (leafletMarker) {
            leafletMarker.setLatLng(selectedLatLng);
            if (leafletMarker.dragging) leafletMarker.dragging.enable();
          } else {
            leafletMarker = L.marker(selectedLatLng, { draggable: true }).addTo(leafletMap);
            leafletMarker.on('dragend', (ev) => { selectedLatLng = ev.target.getLatLng(); });
          }
        }
        if (item.name) activityForm.place = item.name;
      } catch (e) { console.error(e); }
    };

    // 分页获取地址候选（使用 limit/offset）
    const fetchPlacePage = async () => {
      const q = placeSearchKeyword.value.trim();
      if (!q) return toast('请输入地址关键词');
      placeSearching.value = true;
      try {
        placeSearchResults.value = [];
        const offset = placePage.value * pageSize.value;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=${pageSize.value}&offset=${offset}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        const list = await res.json();
        hasNextPlace.value = Array.isArray(list) && list.length === pageSize.value;
        if (!Array.isArray(list) || list.length === 0) { toast('未找到匹配地址'); return; }
        placeSearchResults.value = list.map((it, idx) => {
          const a = it.address || {};
          const district = a.city || a.town || a.village || a.county || a.state || a.suburb || a.region || '';
          const category = [it.class, it.type].filter(Boolean).join('/');
          return { id: it.place_id || it.osm_id || it.display_name, name: it.display_name, lat: Number(it.lat), lng: Number(it.lon), district, category, idx };
        });
        if (leafletMap) {
          if (!searchMarkers) searchMarkers = L.layerGroup().addTo(leafletMap);
          searchMarkers.clearLayers();
          const latLngs = [];
          placeSearchResults.value.forEach((r, idx) => {
            const color = pinColors[idx % pinColors.length];
            const m = L.marker([r.lat, r.lng], {
              icon: L.divIcon({ className: 'map-pin-wrap', html: `<div class="map-pin" style="background:${color}">${idx + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] })
            }).addTo(searchMarkers);
            try { m.bindTooltip(`${r.district}（${r.category}）`, { direction: 'top', offset: [0, -18], opacity: 0.9, sticky: true }); } catch (e) {}
            m.on('click', () => { chooseSearchResult(r); });
            latLngs.push([r.lat, r.lng]);
          });
          if (latLngs.length > 0) {
            try { leafletMap.fitBounds(latLngs, { padding: [20, 20] }); } catch (e) {}
          }
        }
      } catch (e) {
        console.error('地址搜索失败', e);
        toast('地址搜索失败');
      } finally {
        placeSearching.value = false;
      }
    };
    const nextPlacePage = async () => {
      if (placeSearching.value) return;
      placePage.value += 1;
      selectedResultIndex.value = -1;
      await fetchPlacePage();
    };
    const prevPlacePage = async () => {
      if (placeSearching.value || placePage.value <= 0) return;
      placePage.value -= 1;
      selectedResultIndex.value = -1;
      await fetchPlacePage();
    };
    Vue.watch(pageSize, async () => {
      placePage.value = 0;
      if (placeSearchKeyword.value.trim()) await fetchPlacePage();
    });

    // 清除候选列表与地图上的候选标记
    const clearPlaceCandidates = () => {
      try {
        placeSearchResults.value = [];
        selectedResultIndex.value = -1;
        if (searchMarkers) searchMarkers.clearLayers();
        if (clearAlsoSelected.value) {
          selectedLatLng = null;
          try {
            if (leafletMarker) {
              leafletMarker.remove();
              leafletMarker = null;
            }
          } catch (e) {}
          activityForm.lat = null;
          activityForm.lng = null;
        }
      } catch (e) { console.error(e); }
    };

    // 键盘选择候选项（↑/↓）
    const moveSelection = (step) => {
      const len = placeSearchResults.value.length;
      if (!len) return;
      if (selectedResultIndex.value < 0) {
        selectedResultIndex.value = step > 0 ? 0 : len - 1;
      } else {
        selectedResultIndex.value = Math.max(0, Math.min(len - 1, selectedResultIndex.value + step));
      }
      const item = placeSearchResults.value[selectedResultIndex.value];
      if (item && leafletMap) {
        try { leafletMap.panTo([item.lat, item.lng]); } catch (e) {}
      }
    };

    // 回车选择当前候选，未选中则触发搜索
    const chooseSelectedIfAny = () => {
      const idx = selectedResultIndex.value;
      if (idx >= 0 && idx < placeSearchResults.value.length) {
        const item = placeSearchResults.value[idx];
        chooseSearchResult(item);
      } else {
        searchPlace();
      }
    };
    const confirmPlacePicker = () => {
      if (!selectedLatLng) return toast('请在地图上点击选择地点');
      const { lat, lng } = selectedLatLng;
      activityForm.lat = lat;
      activityForm.lng = lng;
      reverseGeocode(lat, lng).then((addr) => {
        activityForm.place = addr || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }).catch(() => {
        activityForm.place = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      });
      closePlacePicker();
      toast('地点已设置');
    };

    // 简易失败重试工具（指数退避）
    const delay = (ms) => new Promise((res) => setTimeout(res, ms));
    const withRetry = async (fn, retries = 2, baseDelay = 300) => {
      let lastErr;
      for (let i = 0; i <= retries; i++) {
        try { return await fn(); } catch (e) {
          lastErr = e;
          if (i < retries) await delay(baseDelay * Math.pow(2, i));
        }
      }
      throw lastErr;
    };

    const reverseGeocode = async (lat, lng) => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, { headers: { 'Accept': 'application/json' } });
        const json = await res.json();
        return (json && json.display_name) ? json.display_name : '';
      } catch (e) {
        console.error('反向地理编码失败', e);
        return '';
      }
    };

    // 支持按 ESC 关闭地图弹窗，减少遮挡卡住的体验
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && showPlacePicker.value) {
        closePlacePicker();
      }
    });

    const checkCapacityAlert = (obj) => {
      const max = Number(obj.max || 0);
      const enrolled = Number(obj.enrolled || 0);
      if (max <= 0) return false;
      const percent = (enrolled / max) * 100;
      if (percent >= (fullAlertPercent.value || 90)) {
        toast(`满员提醒：已达 ${percent.toFixed(0)}%`);
        return true;
      }
      return false;
    };

    const uploadImage = async (file) => {
      // 示例实现：若后端未接入，返回对象URL用于演示；接入后改为POST后端返回永久URL
      try {
        // TODO: 接入后端：
        // const form = new FormData();
        // form.append('file', file);
        // const res = await fetch('/api/upload/image', { method: 'POST', body: form });
        // const json = await res.json();
        // return json.url;
        return URL.createObjectURL(file);
      } catch (e) {
        console.error('图片上传失败', e);
        throw e;
      }
    };

    const endActivity = async (a) => {
      if (a.status === '已结束') return toast('该活动已结束');
      if (!confirm(`确认结束活动「${a.title}」吗？`)) return;
      if (api.useApi.value) {
        try { await withRetry(() => api.changeActivityStatus(a.id, '已结束')); } catch (e) { console.error(e); return toast('更新后端状态失败（已重试）'); }
      }
      a.status = '已结束';
      toast('活动已标记为已结束');
      saveToLocal();
    };

    const cancelActivity = async (a) => {
      if (a.status === '已取消') return toast('该活动已取消');
      if (!confirm(`确认取消活动「${a.title}」吗？`)) return;
      if (api.useApi.value) {
        try { await withRetry(() => api.changeActivityStatus(a.id, '已取消')); } catch (e) { console.error(e); return toast('更新后端状态失败（已重试）'); }
      }
      a.status = '已取消';
      toast('活动已标记为已取消');
      saveToLocal();
    };

    const statusFilter = ref('全部');
    const activitySearch = ref('');
    const showTopOnly = ref(false);
    const showHotOnly = ref(false);
    const displayedActivities = Vue.computed(() => {
      // base list by status
      let list = statusFilter.value === '全部'
        ? activities
        : activities.filter((a) => a.status === statusFilter.value);

      // keyword filtering
      const kw = activitySearch.value.trim().toLowerCase();
      if (kw) {
        list = list.filter((a) => {
          const t = (a.title || '').toLowerCase();
          const p = (a.place || '').toLowerCase();
          return t.includes(kw) || p.includes(kw);
        });
      }

      // flag filters
      if (showTopOnly.value) list = list.filter((a) => !!a.isTop);
      if (showHotOnly.value) list = list.filter((a) => !!a.isHot);

      // sort: top first, then publishedAt/start desc
      return [...list].sort((a, b) => {
        if ((a.isTop ? 1 : 0) !== (b.isTop ? 1 : 0)) return (b.isTop ? 1 : 0) - (a.isTop ? 1 : 0);
        const ap = a.publishedAt || a.start || '';
        const bp = b.publishedAt || b.start || '';
        return bp.localeCompare(ap);
      });
    });

    // 批量选择与批量状态更新
    const selectedActivityIds = ref([]);
    const selectAllFiltered = () => {
      const ids = displayedActivities.value.map((a) => a.id);
      selectedActivityIds.value = ids;
      toast('已全选当前筛选结果');
    };
    const clearSelection = () => {
      selectedActivityIds.value = [];
    };
    const batchUpdateStatus = (newStatus) => {
      if (selectedActivityIds.value.length === 0) return toast('请先勾选活动');
      if (!confirm(`确认将 ${selectedActivityIds.value.length} 个活动批量更新为「${newStatus}」吗？`)) return;
      activities.forEach((a) => {
        if (selectedActivityIds.value.includes(a.id)) {
          a.status = newStatus;
        }
      });
      toast('已批量更新为：' + newStatus);
      saveToLocal();
    };

    // 会员管理（示例 + 操作）
    const members = reactive([
      {
        id: 5001,
        nameEn: 'Alice',
        gender: '女',
        age: 24,
        nation: '中国',
        flag: '🇨🇳',
        registeredAt: '2025-09-20',
        group: '核心会员',
        totalParticipations: 12,
        disabled: false,
      },
      {
        id: 5002,
        nameEn: 'Bob',
        gender: '男',
        age: 29,
        nation: '美国',
        flag: '🇺🇸',
        registeredAt: '2025-08-11',
        group: '志愿者',
        totalParticipations: 5,
        disabled: false,
      },
    ]);
    const memberGroups = reactive(['核心会员', '志愿者', '普通会员']);
    const showMemberModal = ref(false);
    const memberDetailEditing = ref(false);
    const savingMember = ref(false);
    const memberDetail = reactive({});
    const openMemberDetail = (m) => {
      Object.assign(memberDetail, JSON.parse(JSON.stringify(m)));
      memberDetailEditing.value = false;
      showMemberModal.value = true;
    };
    const closeMemberModal = () => {
      showMemberModal.value = false;
      memberDetailEditing.value = false;
    };
    const saveMemberProfile = async () => {
      if (!memberDetail.id) return toast('无效的会员');
      savingMember.value = true;
      try {
        const payload = {
          // 保留未修改字段，避免后端用 null 覆盖
          nameEn: String(memberDetail.nameEn || ''),
          gender: String(memberDetail.gender || ''),
          age: Number.isFinite(Number(memberDetail.age)) ? Number(memberDetail.age) : null,
          nation: String(memberDetail.nation || ''),
          flag: String(memberDetail.flag || ''),
          registeredAt: String(memberDetail.registeredAt || ''),
          group: String(memberDetail.group || ''),
          totalParticipations: Number.isFinite(Number(memberDetail.totalParticipations)) ? Number(memberDetail.totalParticipations) : 0,
          disabled: !!memberDetail.disabled,
          avatar: String(memberDetail.avatar || ''),
          // 资料编辑字段
          language: String(memberDetail.language || ''),
          occupation: String(memberDetail.occupation || ''),
          city: String(memberDetail.city || ''),
          favorite: String(memberDetail.favorite || ''),
        };
        if (api.useApi.value && api.updateMember) {
          await api.updateMember(memberDetail.id, payload);
          const idx = members.findIndex((x) => x.id === memberDetail.id);
          if (idx >= 0) Object.assign(members[idx], payload);
          toast('资料已保存');
          memberDetailEditing.value = false;
          refreshMembersFromApi();
        } else {
          const idx = members.findIndex((x) => x.id === memberDetail.id);
          if (idx >= 0) Object.assign(members[idx], payload);
          toast('资料已保存（本地）');
          memberDetailEditing.value = false;
          saveToLocal();
        }
      } catch (e) {
        console.error(e);
        toast('保存失败');
      } finally {
        savingMember.value = false;
      }
    };
    const updateMemberGroup = (m, group) => {
      if (api.updateMemberGroup) {
        api.updateMemberGroup(m.id, group)
          .then(() => {
            m.group = group;
            toast('已更新分组');
            refreshMembersFromApi();
          })
          .catch((e) => {
            console.error(e);
            toast('更新分组失败');
          });
      } else {
        m.group = group;
        toast('已更新分组');
        saveToLocal();
      }
    };
    const toggleDisableMember = (m) => {
      const next = !m.disabled;
      if (api.toggleDisableMember) {
        api.toggleDisableMember(m.id, next)
          .then(() => {
            m.disabled = next;
            toast(m.disabled ? '已禁用账号' : '已解除禁用');
            refreshMembersFromApi();
          })
          .catch((e) => {
            console.error(e);
            toast('切换禁用失败');
          });
      } else {
        m.disabled = next;
        toast(m.disabled ? '已禁用账号' : '已解除禁用');
        saveToLocal();
      }
    };

    // 成员检索与积分管理
    const memberSearchQ = ref('');
    const selectedMember = ref(null);
    const pointsAccount = ref(null);
    const pointsTxn = ref([]);
    const txnPage = ref(1);
    const txnPageSize = ref(10);
    const txnTotal = ref(0);
    const adjustAmount = ref(0);
    const adjustDirection = ref('credit');
    const adjustType = ref('manual');
    const adjustNote = ref('');

    const searchMembers = async () => {
      if (!api.searchMembers) { toast('未启用后端API'); return; }
      if (!adminToken.value) { toast('请先登录'); return; }
      try {
        const res = await api.searchMembers(memberSearchQ.value || '', 1, 50);
        const items = res?.items || [];
        members.splice(0, members.length, ...items);
        toast(`已检索到 ${items.length} 位成员`);
      } catch(e) { console.error(e); toast('检索失败'); }
    };

    const selectMember = (m) => {
      selectedMember.value = m;
      txnPage.value = 1;
      fetchPointsAccount();
      fetchTransactions();
    };

    const fetchPointsAccount = async () => {
      if (!selectedMember.value) return;
      if (!api.getPointsAccount) { toast('未启用后端API'); return; }
      try {
        const acc = await api.getPointsAccount(selectedMember.value.id);
        pointsAccount.value = acc || null;
      } catch(e) { console.error(e); toast('获取积分账户失败'); }
    };

    const fetchTransactions = async () => {
      if (!selectedMember.value) return;
      if (!api.listPointsTransactions) { toast('未启用后端API'); return; }
      try {
        const res = await api.listPointsTransactions(selectedMember.value.id, txnPage.value, txnPageSize.value);
        pointsTxn.value = Array.isArray(res?.items) ? res.items : [];
        txnTotal.value = Number(res?.total || 0);
      } catch(e){ console.error(e); toast('获取交易失败'); }
    };

    const setTxnPage = async (p) => {
      const maxPage = Math.max(1, Math.ceil(Number(txnTotal.value || 0) / Number(txnPageSize.value || 10)));
      txnPage.value = Math.min(Math.max(1, p), maxPage);
      await fetchTransactions();
    };

    const doAdjustPoints = async () => {
      if (!selectedMember.value) return toast('请先选择会员');
      const amt = Math.floor(Number(adjustAmount.value || 0));
      if (!Number.isFinite(amt) || amt <= 0) return toast('请输入有效积分数量');
      if (!api.adjustPoints) return toast('未启用后端API');
      try {
        const payload = { memberId: selectedMember.value.id, amount: amt, direction: String(adjustDirection.value || 'credit'), type: adjustType.value || 'manual', note: adjustNote.value || '' };
        const res = await api.adjustPoints(payload);
        await fetchPointsAccount();
        await fetchTransactions();
        toast('积分已变更');
      } catch(e){ console.error(e); toast('积分变更失败'); }
    };

    // 导入/导出 JSON
    const importFileInput = ref(null);
    const triggerImport = () => {
      if (importFileInput.value) importFileInput.value.click();
    };
    const handleImportFile = async (e) => {
      try {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text);
        const cat = Array.isArray(data.categories) ? data.categories : [];
        const act = Array.isArray(data.activities) ? data.activities : [];
        const mem = Array.isArray(data.members) ? data.members : [];
        categories.splice(0, categories.length, ...cat);
        activities.splice(0, activities.length, ...act);
        if (mem.length) members.splice(0, members.length, ...mem);
        saveToLocal();
        toast(`已导入：分类 ${cat.length} 项，活动 ${act.length} 项，会员 ${mem.length} 项`);
      } catch (e) {
        console.error('导入失败', e);
        toast('导入失败：JSON格式错误');
      } finally {
        if (importFileInput.value) importFileInput.value.value = '';
      }
    };
    const exportData = () => {
      try {
        const payload = {
          categories: JSON.parse(JSON.stringify(categories)),
          activities: JSON.parse(JSON.stringify(activities)),
          members: JSON.parse(JSON.stringify(members)),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `goup-admin-data-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('已导出JSON');
      } catch (e) {
        console.error('导出失败', e);
        toast('导出失败');
      }
    };

    // 本地持久化（localStorage）
    const defaultCategories = JSON.parse(JSON.stringify(categories));
    const defaultActivities = JSON.parse(JSON.stringify(activities));
    const defaultMembers = JSON.parse(JSON.stringify(members));
    const LS_CATEGORIES_KEY = 'goup_admin_categories';
    const LS_ACTIVITIES_KEY = 'goup_admin_activities';
    const LS_MEMBERS_KEY = 'goup_admin_members';
    const saveToLocal = () => {
      try {
        const c = JSON.parse(JSON.stringify(categories));
        const a = JSON.parse(JSON.stringify(activities));
        const m = JSON.parse(JSON.stringify(members));
        localStorage.setItem(LS_CATEGORIES_KEY, JSON.stringify(c));
        localStorage.setItem(LS_ACTIVITIES_KEY, JSON.stringify(a));
        localStorage.setItem(LS_MEMBERS_KEY, JSON.stringify(m));
      } catch (e) {
        console.error('保存本地失败', e);
        toast('保存本地失败');
      }
    };
    const loadFromLocal = () => {
      try {
        const cStr = localStorage.getItem(LS_CATEGORIES_KEY);
        const aStr = localStorage.getItem(LS_ACTIVITIES_KEY);
        const mStr = localStorage.getItem(LS_MEMBERS_KEY);
        if (!cStr && !aStr) return;
        if (cStr) {
          const items = JSON.parse(cStr);
          categories.splice(0, categories.length, ...items);
        }
        if (aStr) {
          const items = JSON.parse(aStr);
          activities.splice(0, activities.length, ...items);
        }
        if (mStr) {
          const items = JSON.parse(mStr);
          members.splice(0, members.length, ...items);
        }
        toast('已从本地恢复');
      } catch (e) {
        console.error('恢复本地失败', e);
        toast('恢复失败：数据格式错误');
      }
    };
    const resetToDefault = () => {
      if (!confirm('确认重置为示例数据并清空本地保存吗？')) return;
      localStorage.removeItem(LS_CATEGORIES_KEY);
      localStorage.removeItem(LS_ACTIVITIES_KEY);
      localStorage.removeItem(LS_MEMBERS_KEY);
      categories.splice(0, categories.length, ...defaultCategories);
      activities.splice(0, activities.length, ...defaultActivities);
      members.splice(0, members.length, ...defaultMembers);
      toast('已重置为示例数据');
    };

    // 当启用后端API时，尝试从后端拉取活动列表
    const refreshActivitiesFromApi = async () => {
      if (!api.listActivities) return;
      try {
        const data = await withRetry(() => api.listActivities());
        if (Array.isArray(data)) {
          activities.splice(0, activities.length, ...data);
          toast('已从后端加载活动列表');
        }
      } catch (e) {
        console.error(e);
        toast('加载后端活动列表失败（已重试）');
      }
    };
    // 会员列表刷新（启用后端API时）
    const refreshMembersFromApi = async () => {
      if (!api.listMembers) return;
      try {
        const rows = await withRetry(() => api.listMembers());
        if (Array.isArray(rows)) {
          members.splice(0, members.length, ...rows);
          toast('已从后端加载会员列表');
        }
      } catch (e) {
        console.error(e);
        toast('加载后端会员列表失败（已重试）');
      }
    };
    // 当启用后端API时，切换到后端基地址（默认 http://localhost:3000）
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://127.0.0.1:3000' : 'https://www.goupclub.com';
    const fetchWithBase = async (path, options = {}) => {
      const headers = { ...(options.headers || {}) };
      // 自动附带 JSON 头（在有 body 时）
      if (options.body && !('Content-Type' in headers)) headers['Content-Type'] = 'application/json';
      // 自动附带令牌
      try {
        const token = localStorage.getItem('adminToken');
        if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
      } catch(_) {}
      const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      if (res && (res.status === 401 || res.status === 403)){
        try { localStorage.removeItem('adminToken'); } catch(_){ }
        if (typeof window !== 'undefined' && window && window.dispatchEvent){
          window.dispatchEvent(new CustomEvent('admin-auth-expired', { detail: { status: res.status } }));
        }
        throw new Error(`AUTH_${res.status}`);
      }
      return res;
    };

    // 管理员登录态
    const adminLogin = Vue.reactive({ username: '', password: '' });
    const adminToken = Vue.ref(localStorage.getItem('adminToken') || '');
    const doAdminLogin = async () => {
      try {
        const res = await fetchWithBase('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(adminLogin) });
        if (!res.ok) throw new Error('登录失败');
        const data = await res.json();
        if (data && data.token) {
          adminToken.value = data.token;
          localStorage.setItem('adminToken', data.token);
          toast('登录成功');
        } else {
          toast('登录失败');
        }
      } catch (e) {
        console.error(e);
        toast('登录失败');
      }
    };
    const logoutAdmin = () => {
      adminToken.value = '';
      localStorage.removeItem('adminToken');
      toast('已退出登录');
    };

    // 全局监听登录过期，清理令牌并提示
    window.addEventListener('admin-auth-expired', () => {
      adminToken.value = '';
      toast('登录已过期，请重新登录');
    });

    setTimeout(() => { ready.value = true; }, 0);

    // 统计概览
    const statsOverview = Vue.ref(null);
    const fetchStatsOverview = async () => {
      if (!adminToken.value) { toast('请先登录'); return; }
      if (api.statsOverview) {
        try {
          const data = await api.statsOverview();
          statsOverview.value = data || {};
          toast('已加载统计概览');
        } catch (e) {
          console.error(e);
          toast('加载统计概览失败');
        }
      } else {
        toast('未启用后端API');
      }
    };

    // 趋势统计（每日）
    const dateFrom = Vue.ref('');
    const dateTo = Vue.ref('');
    const dailyStats = Vue.ref([]);
    const trendGranularity = Vue.ref('week');
    const trendsData = Vue.ref([]);
    const categoryShare = Vue.ref([]);
    let trendChartInstance = null;
    const initDefaultStatsRange = () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6);
      dateFrom.value = start.toISOString().slice(0, 10);
      dateTo.value = end.toISOString().slice(0, 10);
    };
    const drawDailyChart = () => {
      try {
        const canvas = document.getElementById('dailyChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const data = dailyStats.value || [];
        if (!data.length) return;
        const maxOrders = Math.max(...data.map((d) => Number(d.orders || 0)), 1);
        const maxAmount = Math.max(...data.map((d) => Number(d.paidAmount || 0)), 1);
        const leftPad = 40;
        const rightPad = 40;
        const topPad = 20;
        const bottomPad = 30;
        const chartW = w - leftPad - rightPad;
        const chartH = h - topPad - bottomPad;
        const stepX = chartW / Math.max(data.length - 1, 1);
        // grid
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const y = topPad + (chartH * i) / 4;
          ctx.beginPath();
          ctx.moveTo(leftPad, y);
          ctx.lineTo(w - rightPad, y);
          ctx.stroke();
        }
        // orders line (blue)
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach((d, i) => {
          const x = leftPad + i * stepX;
          const y = topPad + chartH - (Number(d.orders || 0) / maxOrders) * chartH;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        // amount line (green)
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach((d, i) => {
          const x = leftPad + i * stepX;
          const y = topPad + chartH - (Number(d.paidAmount || 0) / maxAmount) * chartH;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        // x axis labels
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px system-ui, -apple-system';
        const labelCount = Math.min(data.length, 6);
        const interval = Math.max(1, Math.floor(data.length / labelCount));
        data.forEach((d, i) => {
          if (i % interval === 0 || i === data.length - 1) {
            const x = leftPad + i * stepX;
            ctx.fillText(String(d.date || ''), x - 24, h - 8);
          }
        });
        // legend
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(leftPad, 4, 10, 10);
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`订单数(最大 ${maxOrders})`, leftPad + 16, 14);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(leftPad + 160, 4, 10, 10);
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`支付金额(最大 ¥${Number(maxAmount).toFixed(0)})`, leftPad + 176, 14);
      } catch (e) {
        console.error('drawDailyChart error', e);
      }
    };
    const fetchDailyStats = async () => {
      if (!dateFrom.value || !dateTo.value) {
        toast('请先选择日期范围');
        return;
      }
      if (!adminToken.value) { toast('请先登录'); return; }
      if (api.statsDaily) {
        try {
          const rows = await api.statsDaily(dateFrom.value, dateTo.value);
          dailyStats.value = Array.isArray(rows) ? rows : [];
          drawDailyChart();
          toast('趋势数据已加载');
        } catch (e) {
          console.error(e);
          toast('加载趋势数据失败');
        }
      } else {
        toast('未启用后端API');
      }
    };

    const drawTrendChart = (rows) => {
      try {
        const canvas = document.getElementById('trendChart');
        if (!canvas || !window.Chart) return;
        const labels = rows.map((x) => x.week || x.month);
        const paid = rows.map((x) => Number(x.paidAmount || 0));
        const data = {
          labels,
          datasets: [{ label: 'Paid Amount', data: paid, borderColor: 'rgba(54,162,235,1)', backgroundColor: 'rgba(54,162,235,0.2)' }]
        };
        const config = { type: 'line', data, options: { responsive: true, maintainAspectRatio: false } };
        if (trendChartInstance) { trendChartInstance.destroy(); }
        trendChartInstance = new Chart(canvas.getContext('2d'), config);
      } catch (e) { console.error('drawTrendChart error', e); }
    };
    const fetchTrends = async () => {
      if (!dateFrom.value || !dateTo.value) { toast('请先选择日期范围'); return; }
      if (!adminToken.value) { toast('请先登录'); return; }
      if (api.statsTrends) {
        try {
          const rows = await api.statsTrends(trendGranularity.value, dateFrom.value, dateTo.value);
          trendsData.value = Array.isArray(rows) ? rows : [];
          drawTrendChart(trendsData.value);
          const share = await api.categoryShare(dateFrom.value, dateTo.value);
          categoryShare.value = Array.isArray(share) ? share : [];
          toast('趋势与分类占比已加载');
        } catch (e) { console.error(e); toast('加载趋势失败'); }
      } else { toast('未启用后端API'); }
    };
    const exportExcel = async () => {
      if (!dateFrom.value || !dateTo.value) { toast('请先选择日期范围'); return; }
      if (!api.statsExport) { toast('未启用后端API'); return; }
      try {
        const blob = await api.statsExport('excel', trendGranularity.value, dateFrom.value, dateTo.value);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `report-${trendGranularity.value}.xlsx`; a.click();
        URL.revokeObjectURL(url);
        toast('Excel 已导出');
      } catch (e) { console.error(e); toast('导出Excel失败'); }
    };
    const exportPNG = async () => {
      if (!dateFrom.value || !dateTo.value) { toast('请先选择日期范围'); return; }
      if (!api.statsExport) { toast('未启用后端API'); return; }
      try {
        const blob = await api.statsExport('png', trendGranularity.value, dateFrom.value, dateTo.value);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `report-${trendGranularity.value}.png`; a.click();
        URL.revokeObjectURL(url);
        toast('图片已导出');
      } catch (e) { console.error(e); toast('导出图片失败'); }
    };

    // 积分支付配置（扩展字段）
    const voucherConfig = Vue.ref({
      discountRate: 0,
      maxDiscount: 0,
      cashbackRate: 0,
      singleVoucherOnly: false,
      minAmount: 0,
      categoryRules: [],
      cashbackTiers: [],
      specialActivities: [],
      updatedAt: null,
    });
    const fetchVoucherConfig = async () => {
      if (!adminToken.value) { toast('请先登录'); return; }
      if (api.getVoucherConfig) {
        try {
          const cfg = await api.getVoucherConfig();
          voucherConfig.value = cfg || {
            discountRate: 0, maxDiscount: 0, cashbackRate: 0, singleVoucherOnly: false, minAmount: 0,
            categoryRules: [], cashbackTiers: [], specialActivities: [], updatedAt: null,
          };
          toast('已加载积分支付配置');
        } catch (e) {
          console.error(e);
          toast('加载积分支付配置失败');
        }
      } else {
        toast('未启用后端API');
      }
    };
    const saveVoucherConfig = async () => {
      if (!adminToken.value) { toast('请先登录'); return; }
      if (api.updateVoucherConfig) {
        try {
          const payload = {
            discountRate: Number(voucherConfig.value.discountRate || 0),
            maxDiscount: Number(voucherConfig.value.maxDiscount || 0),
            cashbackRate: Number(voucherConfig.value.cashbackRate || 0),
            singleVoucherOnly: !!voucherConfig.value.singleVoucherOnly,
            minAmount: Number(voucherConfig.value.minAmount || 0),
            // 允许用文本框编辑 JSON，做解析防御
            categoryRules: Array.isArray(voucherConfig.value.categoryRules)
              ? voucherConfig.value.categoryRules
              : (() => { try { return JSON.parse(String(voucherConfig.value.categoryRules || '[]')); } catch { return []; } })(),
            cashbackTiers: Array.isArray(voucherConfig.value.cashbackTiers)
              ? voucherConfig.value.cashbackTiers
              : (() => { try { return JSON.parse(String(voucherConfig.value.cashbackTiers || '[]')); } catch { return []; } })(),
            specialActivities: Array.isArray(voucherConfig.value.specialActivities)
              ? voucherConfig.value.specialActivities
              : (() => { try { return JSON.parse(String(voucherConfig.value.specialActivities || '[]')); } catch { return []; } })(),
          };
          const cfg = await api.updateVoucherConfig(payload);
          voucherConfig.value = cfg || payload;
          toast('积分支付配置已保存');
        } catch (e) {
          console.error(e);
          toast('保存积分支付配置失败');
        }
      } else {
        toast('未启用后端API');
      }
    };

    // 积分支付测试模拟（本地计算，不依赖后端新接口）
    const simInput = Vue.reactive({ amount: 0, activityId: null, categoryIdsText: '', memberVoucherAmount: 0 });
    const simResult = Vue.ref(null);
    const runVoucherSimulation = () => {
      try {
        const amount = Number(simInput.amount || 0);
        const memberVoucherAmount = Number(simInput.memberVoucherAmount || 0);
        const categoryIds = String(simInput.categoryIdsText || '')
          .split(',')
          .map((x) => Number(x.trim()))
          .filter((x) => Number.isFinite(x));
        const cfg = voucherConfig.value || {};
        // 计算抵扣（全局或类别规则）
        let rate = Number(cfg.discountRate || 0);
        let maxD = Number(cfg.maxDiscount || 0);
        const minAmt = Number(cfg.minAmount || 0);
        const singleOnly = !!cfg.singleVoucherOnly;
        try {
          const rules = Array.isArray(cfg.categoryRules) ? cfg.categoryRules : JSON.parse(String(cfg.categoryRules || '[]'));
          if (Array.isArray(rules) && rules.length && categoryIds.length) {
            let best = null;
            for (const r of rules) {
              const cid = Number(r.categoryId || r.category);
              if (categoryIds.includes(cid)) {
                const rr = Number(r.discountRate || 0);
                const md = Number(r.maxDiscount || 0);
                const est = Math.min(amount * rr, md);
                if (!best || est > best.est) best = { rr, md, est };
              }
            }
            if (best) { rate = best.rr; maxD = best.md; }
          }
        } catch {}
        // 全局抵扣与会员券不叠加（若启用单次限用且会员券使用>0）
        let discount = 0;
        let payable = amount;
        let voucherApplied = {};
        if (!(singleOnly && memberVoucherAmount > 0) && payable >= minAmt && rate > 0) {
          const d = Math.min(payable * rate, maxD);
          discount += d;
          payable = Math.max(payable - d, 0);
          voucherApplied.global = { rate, maxDiscount: maxD, minAmount: minAmt };
        }
        if (memberVoucherAmount > 0) {
          const can = Math.min(memberVoucherAmount, payable);
          discount += can;
          payable = Math.max(payable - can, 0);
          voucherApplied.member = { usedAmount: can };
        }
        // 计算返券（阶梯+特殊活动）
        let baseRate = Number(cfg.cashbackRate || 0);
        try {
          const tiers = Array.isArray(cfg.cashbackTiers) ? cfg.cashbackTiers : JSON.parse(String(cfg.cashbackTiers || '[]'));
          if (Array.isArray(tiers) && tiers.length) {
            let chosen = null;
            for (const t of tiers) {
              const th = Number(t.threshold || t.min || 0);
              const rt = Number(t.rate || 0);
              if (payable >= th) {
                if (!chosen || th > chosen.th) chosen = { th, rt };
              }
            }
            if (chosen) baseRate = chosen.rt;
          }
        } catch {}
        let multiplier = 1;
        try {
          const specs = Array.isArray(cfg.specialActivities) ? cfg.specialActivities : JSON.parse(String(cfg.specialActivities || '[]'));
          if (Array.isArray(specs) && specs.length && simInput.activityId) {
            const match = specs.find((s) => Number(s.activityId || s.id) === Number(simInput.activityId));
            if (match) multiplier = Number(match.cashbackMultiplier || match.multiplier || 1);
          }
        } catch {}
        const effRate = baseRate * (Number.isFinite(multiplier) ? multiplier : 1);
        const cashback = Number((payable * effRate).toFixed(2));
        simResult.value = { discount, payable, voucherApplied, cashbackRate: effRate, cashback };
        toast('模拟完成');
      } catch (e) {
        console.error(e);
        toast('模拟失败');
      }
    };

    // 覆盖 api.* 方法以使用后端服务
    Vue.watch(api.useApi, (val) => {
      if (val) {
        api.listActivities = async () => {
          const res = await fetchWithBase('/api/activities');
          if (!res.ok) throw new Error('获取活动列表失败');
          const data = await res.json();
          // 将后端JSON字符串字段转换为前端需要的数组/布尔类型
          return (Array.isArray(data) ? data : []).map((a) => ({
            ...a,
            categoryIds: typeof a.categoryIds === 'string' ? JSON.parse(a.categoryIds || '[]') : (a.categoryIds || []),
            groups: typeof a.groups === 'string' ? JSON.parse(a.groups || '[]') : (a.groups || []),
            images: typeof a.images === 'string' ? JSON.parse(a.images || '[]') : (a.images || []),
            isTop: a.isTop === 1 || a.isTop === true,
            isHot: a.isHot === 1 || a.isHot === true,
            price: Number(a.price || 0),
            min: Number(a.min || 0),
            max: Number(a.max || 1),
            waitlist: Number(a.waitlist || 0),
            enrolled: Number(a.enrolled || 0),
          }));
        };
        api.changeActivityStatus = async (id, status) => {
          const res = await fetchWithBase(`/api/activities/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
          if (!res.ok) throw new Error('更新状态失败');
          return res.json();
        };
        api.createActivity = async (payload) => {
          const res = await fetchWithBase('/api/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error('创建活动失败');
          return res.json();
        };
        api.updateActivity = async (id, payload) => {
          const res = await fetchWithBase(`/api/activities/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error('更新活动失败');
          return res.json();
        };
        api.listCategories = async () => {
          const res = await fetchWithBase('/api/categories');
          if (!res.ok) throw new Error('获取分类失败');
          return res.json();
        };
        api.createCategory = async (data) => {
          const res = await fetchWithBase('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          if (!res.ok) throw new Error('创建分类失败');
          return res.json();
        };
        api.updateCategory = async (id, data) => {
          const res = await fetchWithBase(`/api/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          if (!res.ok) throw new Error('更新分类失败');
          return res.json();
        };
        api.deleteCategory = async (id) => {
          const res = await fetchWithBase(`/api/categories/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('删除分类失败');
          return res.json();
        };
        api.statsOverview = async () => {
          const res = await fetchWithBase('/api/stats/overview');
          if (!res.ok) throw new Error('获取统计概览失败');
          return res.json();
        };
        api.statsDaily = async (from, to) => {
          const res = await fetchWithBase(`/api/stats/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
          if (!res.ok) throw new Error('获取每日统计失败');
          return res.json();
        };
        api.statsTrends = async (granularity, from, to) => {
          const res = await fetchWithBase(`/api/stats/trends?granularity=${encodeURIComponent(granularity)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
          if (!res.ok) throw new Error('获取趋势统计失败');
          return res.json();
        };
        api.categoryShare = async (from, to) => {
          const res = await fetchWithBase(`/api/stats/category-share?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
          if (!res.ok) throw new Error('获取分类占比失败');
          return res.json();
        };
        api.statsExport = async (type, granularity, from, to) => {
          const res = await fetchWithBase(`/api/stats/export?type=${encodeURIComponent(type)}&granularity=${encodeURIComponent(granularity)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
          if (!res.ok) throw new Error('导出失败');
          const blob = await res.blob();
          return blob;
        };
        api.listPaymentErrors = async (limit = 50, token = '') => {
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await fetchWithBase(`/api/payments/errors?limit=${encodeURIComponent(limit)}`, { headers });
          if (res.status === 401 || res.status === 403) throw new Error('未授权或账号被禁用');
          if (!res.ok) throw new Error('获取支付异常失败');
          return res.json();
        };
        api.getVoucherConfig = async () => {
          const res = await fetchWithBase('/api/voucher');
          if (!res.ok) throw new Error('获取积分支付配置失败');
          return res.json();
        };
        api.updateVoucherConfig = async (payload) => {
          const res = await fetchWithBase('/api/voucher', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error('保存积分支付配置失败');
          return res.json();
        };
        // 会员 API 覆盖
        api.listMembers = async () => {
          const res = await fetchWithBase('/api/members');
          if (!res.ok) throw new Error('获取会员列表失败');
          const data = await res.json();
          return Array.isArray(data) ? data.map((m) => ({
            ...m,
            disabled: m.disabled === 1 || m.disabled === true,
            age: m.age != null ? Number(m.age) : m.age,
            totalParticipations: m.totalParticipations != null ? Number(m.totalParticipations) : 0,
          })) : [];
        };
        api.searchMembers = async (q = '', page = 1, pageSize = 20) => {
          const res = await fetchWithBase(`/api/members/search?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`);
          if (!res.ok) throw new Error('检索会员失败');
          return res.json();
        };
        api.getPointsAccount = async (memberId) => {
          const res = await fetchWithBase(`/api/points/account?memberId=${encodeURIComponent(memberId)}`);
          if (!res.ok) throw new Error('获取积分账户失败');
          return res.json();
        };
        api.listPointsTransactions = async (memberId, page = 1, pageSize = 20) => {
          const res = await fetchWithBase(`/api/points/transactions?memberId=${encodeURIComponent(memberId)}&page=${page}&pageSize=${pageSize}`);
          if (!res.ok) throw new Error('获取积分交易失败');
          return res.json();
        };
        api.grantPoints = async (payload) => {
          const res = await fetchWithBase('/api/points/grant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error('发放积分失败');
          return res.json();
        };
        api.adjustPoints = async (payload) => {
          const res = await fetchWithBase('/api/points/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error('积分调整失败');
          return res.json();
        };
        api.updateMemberGroup = async (id, group) => {
          const res = await fetchWithBase(`/api/members/${id}/group`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group }) });
          if (!res.ok) throw new Error('更新会员分组失败');
          return res.json();
        };
        api.toggleDisableMember = async (id, disabled) => {
          const res = await fetchWithBase(`/api/members/${id}/disable`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disabled }) });
          if (!res.ok) throw new Error('切换会员禁用状态失败');
          return res.json();
        };
        api.updateMember = async (id, payload) => {
          const res = await fetchWithBase(`/api/members/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error('更新会员资料失败');
          return res.json();
        };
        refreshActivitiesFromApi();

    // 支付异常监控
    const errorsLimit = Vue.ref(50);
    const updateErrorsLimit = (e) => {
      const v = Number(e?.target?.value ?? 50);
      errorsLimit.value = Number.isFinite(v) ? v : 50;
    };
    const paymentErrors = Vue.ref([]);
    const fetchPaymentErrors = async () => {
      if (!api.listPaymentErrors) { toast('未启用后端API'); return; }
      try {
        const rows = await api.listPaymentErrors(Number(errorsLimit.value || 50), adminToken.value);
        paymentErrors.value = Array.isArray(rows) ? rows : [];
        toast(`已加载 ${paymentErrors.value.length} 条异常记录`);
      } catch (e) { console.error(e); toast(`加载异常记录失败：${e.message}`); }
    };
        refreshMembersFromApi();
      }
    });

    // 初始化尝试从本地恢复
    loadFromLocal();

    return {
      tab,
      notice,
      toast,
      api,
      // 分类
      categories,
      sortedCategories,
      newCategory,
      addCategory,
      saveCategory,
      deleteCategory,
      // 活动
      groupOptions,
      statusOptions,
      activities,
      displayedActivities,
      statusFilter,
      activitySearch,
      showTopOnly,
      showHotOnly,
      selectedActivityIds,
      selectAllFiltered,
      clearSelection,
      batchUpdateStatus,
      importFileInput,
      triggerImport,
      handleImportFile,
      exportData,
      saveToLocal,
      loadFromLocal,
      resetToDefault,
      showActivityModal,
      activityForm,
      // 表单校验
      formErrors,
      isFormValid,
      openActivityForm,
      openEditActivity,
      saveActivity,
      changeStatus,
      endActivity,
      cancelActivity,
      renderCategoryNames,
      editingId,
      onMainImageSelect,
      applyMainImageCrop,
      onImagesSelect,
      openPlacePicker,
      closePlacePicker,
      confirmPlacePicker,
      showPlacePicker,
      placeSearchKeyword,
      searchPlace,
      fetchPlacePage,
      placeSearching,
      placeSearchResults,
      placePage,
      pageSize,
      hasNextPlace,
      nextPlacePage,
      prevPlacePage,
      clearPlaceCandidates,
      clearAlsoSelected,
      selectedResultIndex,
      moveSelection,
      chooseSelectedIfAny,
      chooseSearchResult,
      selectedLatLng,
      themeMode,
      applyTheme,
      setTheme,
      themeLabel,
      fullAlertPercent,
      // 统计
      statsOverview,
      fetchStatsOverview,
      dateFrom,
      dateTo,
      dailyStats,
      fetchDailyStats,
      trendGranularity,
      trendsData,
      fetchTrends,
      exportExcel,
      exportPNG,
      categoryShare,
      useApiVal,
      // 登录
      adminLogin,
      adminToken,
      doAdminLogin,
      logoutAdmin,
      // 异常
      errorsLimit,
      updateErrorsLimit,
      paymentErrors,
      fetchPaymentErrors,
      // 会员
      members,
      memberGroups,
      showMemberModal,
      memberDetail,
      memberDetailEditing,
      savingMember,
      openMemberDetail,
      closeMemberModal,
      saveMemberProfile,
      updateMemberGroup,
      toggleDisableMember,
      // 成员检索与积分管理
      memberSearchQ,
      searchMembers,
      selectedMember,
      selectMember,
      pointsAccount,
      fetchPointsAccount,
      pointsTxn,
      txnPage,
      txnPageSize,
      txnTotal,
      setTxnPage,
      adjustAmount,
      adjustDirection,
      adjustType,
      adjustNote,
      doAdjustPoints,
      fetchTransactions,
      // 积分支付配置
      voucherConfig,
      fetchVoucherConfig,
      saveVoucherConfig,
      // 模拟
      simInput,
      simResult,
      runVoucherSimulation,
      ready,
    };
  },
}).mount('#app');