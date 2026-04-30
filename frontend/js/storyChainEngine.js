(function () {
  const STORAGE_KEY = 'instajoy_chain_mode';

  const CHAIN_TEMPLATES = [
    { key: 'public', label: 'Public join', description: 'Anyone can add a segment to this chain.' },
    { key: 'invite', label: 'Invite only', description: 'Only invited friends can append to the story.' },
  ];

  function getSavedMode() {
    return localStorage.getItem(STORAGE_KEY) || 'public';
  }

  function saveMode(mode) {
    const isValid = CHAIN_TEMPLATES.some((item) => item.key === mode);
    const next = isValid ? mode : 'public';
    localStorage.setItem(STORAGE_KEY, next);
    return next;
  }

  function buildChainButton(containerId, onCreate) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const button = document.createElement('button');
    button.className = 'story-card story-chain-card';
    button.type = 'button';
    button.innerHTML = `
      <div class="story-chain-ring">
        <span class="story-chain-icon">➕</span>
      </div>
      <span>Create Chain Story</span>
    `;
    button.addEventListener('click', () => {
      if (typeof onCreate === 'function') {
        onCreate();
      }
    });
    container.prepend(button);
  }

  function renderChainViewer(modalId, chainData) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const title = modal.querySelector('.chain-title');
    const timeline = modal.querySelector('.chain-progress-bar');
    const avatars = modal.querySelector('.chain-avatars');
    const details = modal.querySelector('.chain-details');

    title.textContent = chainData?.title || 'Group Story Chain';
    if (timeline) {
      timeline.style.width = `${Math.min(100, (chainData?.segments?.length || 0) * 12)}%`;
    }
    avatars.innerHTML = (chainData?.participants || []).slice(0, 6).map((participant) => `
      <img class="avatar tiny" src="${escapeHtml(participant.avatar_url || 'ilogo.png')}" alt="${escapeHtml(participant.username)}">
    `).join('');
    details.innerHTML = (chainData?.segments || []).map((segment, index) => `
      <article class="card compact-card chain-segment-card">
        <div class="row-between">
          <strong>${escapeHtml(segment.username || 'unknown')}</strong>
          <span>${escapeHtml(segment.type === 'video' ? 'Video' : 'Photo')}</span>
        </div>
        <div class="post-meta">Chapter ${index + 1} • ${escapeHtml(segment.status || 'Live')}</div>
        <p>${escapeHtml(segment.caption || segment.note || 'Shared a new story segment.')}</p>
      </article>
    `).join('');

    modal.hidden = false;
  }

  function formatChainBadge(chain) {
    if (!chain || !Array.isArray(chain.segments)) {
      return '';
    }
    return `${chain.segments.length} segments • ${chain.mode === 'invite' ? 'Invite only' : 'Open join'}`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.StoryChainEngine = {
    CHAIN_TEMPLATES,
    getSavedMode,
    saveMode,
    buildChainButton,
    renderChainViewer,
    formatChainBadge,
  };
})();
