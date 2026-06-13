const { createApp, ref, onMounted, computed } = Vue;

const API_BASE = 'http://localhost:3114/api';

createApp({
  setup() {
    const isLoggedIn = ref(false);
    const user = ref(null);
    const token = ref(null);

    const loginForm = ref({ username: '', password: '' });
    const loginLoading = ref(false);
    const loginError = ref('');

    const dreams = ref([]);
    const randomDream = ref(null);
    const monthlyStats = ref({ count: 0, avgLucidity: 0 });

    const currentTab = ref('dreams');
    const materialbox = ref([]);
    const showMaterialModal = ref(false);
    const modalMode = ref('add');
    const editingDream = ref(null);
    const editingMaterialId = ref(null);
    const selectedTags = ref([]);

    const TAG_OPTIONS = [
      { key: 'novel', label: '📖 小说', color: '#f472b6' },
      { key: 'painting', label: '🎨 绘画', color: '#60a5fa' },
      { key: 'video', label: '🎬 短视频', color: '#34d399' },
      { key: 'music', label: '🎵 音乐', color: '#fbbf24' }
    ];

    const now = new Date();
    const selectedYear = ref(now.getFullYear());
    const selectedMonth = ref(now.getMonth() + 1);
    const yearOptions = computed(() => {
      const current = new Date().getFullYear();
      const years = [];
      for (let y = current - 5; y <= current; y++) {
        years.push(y);
      }
      return years;
    });

    const materialboxGrouped = computed(() => {
      const groups = {};
      TAG_OPTIONS.forEach(tag => {
        groups[tag.key] = [];
      });
      materialbox.value.forEach(item => {
        item.tags.forEach(tag => {
          if (groups[tag]) {
            groups[tag].push(item);
          }
        });
      });
      return groups;
    });

    const materialboxDreamIds = computed(() => {
      return new Set(materialbox.value.map(m => m.dreamId));
    });

    function getTagInfo(key) {
      return TAG_OPTIONS.find(t => t.key === key) || { label: key, color: '#888' };
    }

    const newDream = ref({
      content: '',
      lucidity: 3,
      date: new Date().toISOString().split('T')[0]
    });

    const isPlaying = ref(false);
    let audioContext = null;
    let noiseNode = null;
    let gainNode = null;

    function getToken() {
      return localStorage.getItem('dream_token');
    }

    function saveToken(t) {
      localStorage.setItem('dream_token', t);
      token.value = t;
    }

    function clearToken() {
      localStorage.removeItem('dream_token');
      token.value = null;
    }

    function saveUser(u) {
      localStorage.setItem('dream_user', JSON.stringify(u));
      user.value = u;
    }

    function loadUser() {
      const saved = localStorage.getItem('dream_user');
      if (saved) {
        user.value = JSON.parse(saved);
        isLoggedIn.value = true;
      }
    }

    async function apiRequest(url, options = {}) {
      const headers = { 'Content-Type': 'application/json', ...options.headers };
      const t = getToken();
      if (t) {
        headers['Authorization'] = `Bearer ${t}`;
      }

      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers
      });

      if (response.status === 401 || response.status === 403) {
        clearToken();
        isLoggedIn.value = false;
        user.value = null;
        throw new Error('未登录');
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '请求失败');
      }
      return data;
    }

    async function handleLogin() {
      if (!loginForm.value.username || !loginForm.value.password) {
        loginError.value = '请输入用户名和密码';
        return;
      }

      loginLoading.value = true;
      loginError.value = '';

      try {
        const data = await apiRequest('/login', {
          method: 'POST',
          body: JSON.stringify(loginForm.value)
        });

        saveToken(data.token);
        saveUser(data.user);
        isLoggedIn.value = true;
        loadData();
      } catch (e) {
        loginError.value = e.message;
      } finally {
        loginLoading.value = false;
      }
    }

    function handleLogout() {
      clearToken();
      stopWhiteNoise();
      isLoggedIn.value = false;
      user.value = null;
      dreams.value = [];
      randomDream.value = null;
      materialbox.value = [];
    }

    async function fetchDreams() {
      try {
        const data = await apiRequest('/dreams');
        dreams.value = data;
      } catch (e) {
        console.error('获取梦境列表失败', e);
      }
    }

    async function fetchRandomDream() {
      try {
        const data = await apiRequest('/dreams/random');
        randomDream.value = data;
        if (!isPlaying.value) {
          startWhiteNoise();
          setTimeout(() => {
            stopWhiteNoise();
          }, 12000);
        }
      } catch (e) {
        alert(e.message);
      }
    }

    async function fetchMonthlyStats() {
      try {
        const data = await apiRequest(`/stats/monthly?year=${selectedYear.value}&month=${selectedMonth.value}`);
        monthlyStats.value = data;
      } catch (e) {
        console.error('获取月度统计失败', e);
      }
    }

    function onMonthChange() {
      fetchMonthlyStats();
    }

    async function addDream() {
      if (!newDream.value.content.trim()) {
        alert('请输入梦境内容');
        return;
      }

      try {
        await apiRequest('/dreams', {
          method: 'POST',
          body: JSON.stringify(newDream.value)
        });

        newDream.value = {
          content: '',
          lucidity: 3,
          date: new Date().toISOString().split('T')[0]
        };

        loadData();
      } catch (e) {
        alert(e.message);
      }
    }

    async function fetchMaterialbox() {
      try {
        const data = await apiRequest('/materialbox');
        materialbox.value = data;
      } catch (e) {
        console.error('获取素材箱失败', e);
      }
    }

    function openAddToMaterialModal(dream) {
      editingDream.value = dream;
      editingMaterialId.value = null;
      modalMode.value = 'add';
      const existing = materialbox.value.find(m => m.dreamId === dream.id);
      selectedTags.value = existing ? [...existing.tags] : [];
      showMaterialModal.value = true;
    }

    function openEditMaterialModal(item) {
      editingDream.value = { id: item.dreamId, content: item.content, lucidity: item.lucidity, date: item.date };
      editingMaterialId.value = item.id;
      modalMode.value = 'edit';
      selectedTags.value = [...item.tags];
      showMaterialModal.value = true;
    }

    function closeMaterialModal() {
      showMaterialModal.value = false;
      editingDream.value = null;
      editingMaterialId.value = null;
      selectedTags.value = [];
    }

    function toggleTag(tagKey) {
      const idx = selectedTags.value.indexOf(tagKey);
      if (idx > -1) {
        selectedTags.value.splice(idx, 1);
      } else {
        selectedTags.value.push(tagKey);
      }
    }

    async function saveMaterialboxItem() {
      if (selectedTags.value.length === 0) {
        alert('请至少选择一个创作标签');
        return;
      }
      try {
        if (modalMode.value === 'edit' && editingMaterialId.value) {
          await apiRequest(`/materialbox/${editingMaterialId.value}`, {
            method: 'PUT',
            body: JSON.stringify({ tags: selectedTags.value })
          });
        } else {
          await apiRequest('/materialbox', {
            method: 'POST',
            body: JSON.stringify({ dreamId: editingDream.value.id, tags: selectedTags.value })
          });
        }
        closeMaterialModal();
        fetchMaterialbox();
      } catch (e) {
        alert(e.message);
      }
    }

    async function removeFromMaterialbox(itemId) {
      if (!confirm('确定要从素材箱移除吗？')) return;
      try {
        await apiRequest(`/materialbox/${itemId}`, { method: 'DELETE' });
        fetchMaterialbox();
      } catch (e) {
        alert(e.message);
      }
    }

    function loadData() {
      fetchDreams();
      fetchMonthlyStats();
      fetchMaterialbox();
    }

    function createWhiteNoise() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();

      const bufferSize = 2 * audioContext.sampleRate;
      const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      noiseNode = audioContext.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      noiseNode.loop = true;

      gainNode = audioContext.createGain();
      gainNode.gain.value = 0.05;

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;

      noiseNode.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(audioContext.destination);

      noiseNode.start();
    }

    function toggleWhiteNoise() {
      if (isPlaying.value) {
        stopWhiteNoise();
      } else {
        startWhiteNoise();
      }
    }

    function startWhiteNoise() {
      if (!audioContext) {
        createWhiteNoise();
      } else if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      if (gainNode) {
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
      }
      isPlaying.value = true;
    }

    function stopWhiteNoise() {
      if (gainNode && audioContext) {
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      }
      isPlaying.value = false;
    }

    onMounted(() => {
      loadUser();
      if (isLoggedIn.value) {
        loadData();
      }
    });

    return {
      isLoggedIn,
      user,
      loginForm,
      loginLoading,
      loginError,
      handleLogin,
      handleLogout,
      dreams,
      randomDream,
      monthlyStats,
      newDream,
      fetchRandomDream,
      addDream,
      isPlaying,
      toggleWhiteNoise,
      selectedYear,
      selectedMonth,
      yearOptions,
      onMonthChange,
      currentTab,
      materialbox,
      materialboxGrouped,
      materialboxDreamIds,
      TAG_OPTIONS,
      showMaterialModal,
      modalMode,
      editingDream,
      selectedTags,
      openAddToMaterialModal,
      openEditMaterialModal,
      closeMaterialModal,
      toggleTag,
      saveMaterialboxItem,
      removeFromMaterialbox,
      getTagInfo
    };
  }
}).mount('#app');
