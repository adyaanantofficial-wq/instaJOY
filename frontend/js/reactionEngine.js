(function () {
  const STORAGE_KEY = 'instajoy_last_reaction';
  const REACTIONS = [
    { key: 'love', emoji: '❤️', label: 'Love', color: '#ff5a72' },
    { key: 'inspired', emoji: '🔥', label: 'Inspired', color: '#ffb74d' },
    { key: 'funny', emoji: '😂', label: 'Funny', color: '#f5d76e' },
    { key: 'wow', emoji: '😮', label: 'Wow', color: '#73c9ff' },
    { key: 'useful', emoji: '💡', label: 'Useful', color: '#76e4a4' },
    { key: 'emotional', emoji: '🥹', label: 'Emotional', color: '#9b7cff' },
    { key: 'respect', emoji: '👏', label: 'Respect', color: '#a7b9ff' },
  ];

  function getLastReaction() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (REACTIONS.some((reaction) => reaction.key === stored)) {
      return stored;
    }
    return 'love';
  }

  function setLastReaction(key) {
    if (!REACTIONS.some((reaction) => reaction.key === key)) {
      key = 'love';
    }
    localStorage.setItem(STORAGE_KEY, key);
    return key;
  }

  function getReaction(key) {
    return REACTIONS.find((reaction) => reaction.key === key) || REACTIONS[0];
  }

  function createBubble(text, x, y) {
    const bubble = document.createElement('div');
    bubble.className = 'reaction-bubble';
    bubble.textContent = text;
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    document.body.appendChild(bubble);
    requestAnimationFrame(() => {
      bubble.classList.add('visible');
    });
    window.setTimeout(() => bubble.remove(), 900);
  }

  function buildSummary(reactions = {}) {
    if (!reactions || typeof reactions !== 'object') {
      return 'No reactions yet';
    }
    const entries = REACTIONS.map((reaction) => ({
      key: reaction.key,
      label: reaction.label,
      count: Number(reactions[reaction.key] || 0),
    })).filter((item) => item.count > 0);

    if (!entries.length) {
      return 'Be the first to react';
    }

    entries.sort((left, right) => right.count - left.count);
    const topTwo = entries.slice(0, 2).map((entry) => `${entry.count} ${entry.label}`);
    return topTwo.join(' • ');
  }

  function renderRadialMenu(postId, anchorElement, onSelect) {
    closeRadialMenu();
    if (!anchorElement) {
      return null;
    }

    const overlay = document.createElement('div');
    overlay.id = 'reactionOverlay';
    overlay.className = 'reaction-overlay';

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeRadialMenu();
      }
    });

    const rect = anchorElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    REACTIONS.forEach((reaction, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reaction-option';
      button.textContent = reaction.emoji;
      button.title = reaction.label;
      const angle = (index / REACTIONS.length) * Math.PI * 2 - Math.PI / 2;
      const radius = 84;
      button.style.left = `${centerX + Math.cos(angle) * radius - 24}px`;
      button.style.top = `${centerY + Math.sin(angle) * radius - 24}px`;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (typeof onSelect === 'function') {
          onSelect(reaction.key);
        }
        setLastReaction(reaction.key);
        createBubble(reaction.emoji, centerX, centerY);
        closeRadialMenu();
      });
      overlay.appendChild(button);
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  function closeRadialMenu() {
    const existing = document.getElementById('reactionOverlay');
    if (existing) {
      existing.remove();
    }
  }

  window.ReactionEngine = {
    REACTIONS,
    getLastReaction,
    setLastReaction,
    getReaction,
    renderRadialMenu,
    closeRadialMenu,
    buildSummary,
  };
})();
