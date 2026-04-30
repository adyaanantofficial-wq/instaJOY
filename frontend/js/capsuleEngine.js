(function () {
  const STORAGE_KEY = 'instajoy_capsule_mode';

  const OPTIONS = [
    { key: 'tomorrow', label: 'Tomorrow', days: 1 },
    { key: 'one_week', label: '1 week', days: 7 },
    { key: 'one_month', label: '1 month', days: 30 },
    { key: 'birthday', label: 'Birthday', special: 'birthday' },
    { key: 'anniversary', label: 'Anniversary', special: 'anniversary' },
    { key: 'custom', label: 'Custom date', special: 'custom' },
  ];

  function getSavedMode() {
    return localStorage.getItem(STORAGE_KEY) || 'now';
  }

  function saveMode(mode) {
    localStorage.setItem(STORAGE_KEY, mode);
    return mode;
  }

  function buildCapsuleControls(containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <button class="capsule-button is-active" type="button" data-capsule-action="now">Post Now</button>
      <button class="capsule-button" type="button" data-capsule-action="schedule">Schedule</button>
      <button class="capsule-button" type="button" data-capsule-action="capsule">Time Capsule ⏳</button>
    `;

    container.querySelectorAll('[data-capsule-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.capsuleAction;
        container.querySelectorAll('[data-capsule-action]').forEach((item) => item.classList.remove('is-active'));
        button.classList.add('is-active');
        if (typeof callback === 'function') {
          callback(action);
        }
      });
    });
  }

  function openCapsuleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.hidden = false;
    modal.classList.add('animate-in');
    window.setTimeout(() => modal.classList.remove('animate-in'), 380);
  }

  function closeCapsuleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.hidden = true;
  }

  function buildCapsulePayload(formData) {
    const mode = formData.get('capsuleMode') || 'now';
    const unlockValue = formData.get('capsuleUnlock') || 'tomorrow';
    const note = String(formData.get('capsuleMessage') || '').trim();
    const secret = String(formData.get('capsuleSecret') || '').trim();
    const notify = formData.get('capsuleNotify') === 'on';
    const privateOnly = formData.get('capsulePrivate') === 'on';

    const payload = {
      capsule_mode: mode,
      capsule_unlock_at: null,
      capsule_private: privateOnly,
      capsule_secret_code: secret || null,
      capsule_note: note || null,
      capsule_notify_followers: notify,
    };

    if (mode === 'schedule' || mode === 'capsule') {
      const now = new Date();
      if (unlockValue === 'tomorrow') {
        now.setDate(now.getDate() + 1);
      } else if (unlockValue === 'one_week') {
        now.setDate(now.getDate() + 7);
      } else if (unlockValue === 'one_month') {
        now.setMonth(now.getMonth() + 1);
      } else {
        const custom = formData.get('capsuleCustomDate');
        if (custom) {
          const parsed = new Date(custom);
          if (!Number.isNaN(parsed.getTime())) {
            now.setTime(parsed.getTime());
          }
        }
      }
      payload.capsule_unlock_at = now.toISOString();
    }

    return payload;
  }

  function formatCountdown(post) {
    if (!post || !post.capsule_unlock_at) {
      return null;
    }

    const target = new Date(post.capsule_unlock_at);
    const deltaMs = target.getTime() - Date.now();
    if (deltaMs <= 0) {
      return 'Arriving now';
    }

    const days = Math.floor(deltaMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((deltaMs / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((deltaMs / (1000 * 60)) % 60);
    return `${days ? `${days}d ` : ''}${hours ? `${hours}h ` : ''}${minutes ? `${minutes}m` : ''}`.trim();
  }

  function badgeText(post) {
    if (!post || !post.capsule_unlock_at) {
      return null;
    }
    const countdown = formatCountdown(post);
    return countdown ? `⏳ Opens in ${countdown}` : '⏳ Memory has arrived';
  }

  window.CapsuleEngine = {
    getSavedMode,
    saveMode,
    buildCapsuleControls,
    openCapsuleModal,
    closeCapsuleModal,
    buildCapsulePayload,
    formatCountdown,
    badgeText,
    OPTIONS,
  };
})();
