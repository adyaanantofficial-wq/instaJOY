(function () {
  const STORAGE_KEY = 'instajoy_mood';

  const MOODS = [
    { key: 'happy', emoji: '😄', label: 'Happy', tags: ['bright', 'joy', 'smile', 'uplift'] },
    { key: 'motivation', emoji: '🔥', label: 'Motivation', tags: ['drive', 'goal', 'energy', 'win'] },
    { key: 'calm', emoji: '😌', label: 'Calm', tags: ['breathe', 'quiet', 'peace', 'soft'] },
    { key: 'music', emoji: '🎵', label: 'Music', tags: ['song', 'sound', 'beat', 'vibe'] },
    { key: 'fun', emoji: '😂', label: 'Fun', tags: ['joke', 'laugh', 'play', 'goofy'] },
    { key: 'learn', emoji: '📚', label: 'Learn', tags: ['idea', 'fact', 'smart', 'story'] },
    { key: 'explore', emoji: '🌍', label: 'Explore', tags: ['travel', 'discover', 'journey', 'world'] },
    { key: 'mixed', emoji: '⭐', label: 'Mixed', tags: [] },
  ];

  function getSavedMood() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && MOODS.some((m) => m.key === stored)) {
      return stored;
    }
    return 'mixed';
  }

  function saveMood(key) {
    if (!MOODS.some((m) => m.key === key)) {
      key = 'mixed';
    }
    localStorage.setItem(STORAGE_KEY, key);
    return key;
  }

  function getMood(key) {
    return MOODS.find((m) => m.key === key) || MOODS[MOODS.length - 1];
  }

  function buildMoodSelector(containerId, labelId, callback) {
    const container = document.getElementById(containerId);
    const label = document.getElementById(labelId);
    if (!container || !label) {
      return;
    }

    const activeMood = getSavedMood();
    container.innerHTML = MOODS.map((mood) => `
      <button class="mood-chip ${mood.key === activeMood ? 'is-active' : ''}" type="button" data-mood="${mood.key}">
        <span>${mood.emoji}</span>
        <span>${mood.label}</span>
      </button>
    `).join('');

    label.textContent = `Because you're in ${getMood(activeMood).label} mood`;

    container.querySelectorAll('[data-mood]').forEach((button) => {
      button.addEventListener('click', () => {
        const moodKey = button.dataset.mood;
        if (!moodKey) return;
        container.querySelectorAll('[data-mood]').forEach((node) => node.classList.remove('is-active'));
        button.classList.add('is-active');
        const chosen = saveMood(moodKey);
        label.textContent = `Because you're in ${getMood(chosen).label} mood`;
        if (typeof callback === 'function') {
          callback(chosen);
        }
      });
      button.addEventListener('pointerdown', () => {
        button.classList.add('is-pressed');
      });
      button.addEventListener('pointerup', () => {
        button.classList.remove('is-pressed');
      });
      button.addEventListener('pointerleave', () => {
        button.classList.remove('is-pressed');
      });
    });
  }

  function getMoodScoreForPost(post, activeMood, affinity) {
    const mood = getMood(activeMood);
    const category = String(post.category || '').toLowerCase();
    const content = String(post.caption || post.content || '').toLowerCase();
    const authorId = post.user_id;

    const engagement = Math.log1p((Number(post.like_count || post.likes || 0) * 1) + (Number(post.comment_count || 0) * 2) + (post.type === 'reel' ? 7 : 0) + 1);
    const freshness = Math.max(0.3, 1 - (hoursSince(post.created_at) / 72));

    let moodMatch = 1;
    if (mood.key !== 'mixed') {
      if (mood.tags.some((tag) => content.includes(tag))) moodMatch += 0.45;
      if (category && mood.tags.includes(category)) moodMatch += 0.35;
      if (category === 'ideas' && mood.key === 'learn') moodMatch += 0.25;
      if (category === 'jokes' && mood.key === 'fun') moodMatch += 0.25;
      if (category === 'fun-knowledge' && mood.key === 'explore') moodMatch += 0.22;
      if (mood.key === 'calm' && post.type === 'image') moodMatch += 0.18;
    }

    const relevance = 1 + (affinity?.likedCategories?.has(category) ? 0.4 : 0) + (affinity?.likedAuthorIds?.has(authorId) ? 0.3 : 0) + (affinity?.commentCategories?.has(category) ? 0.22 : 0);

    const score = engagement * moodMatch * freshness * relevance;
    return Number(score.toFixed(4));
  }

  function scorePosts(posts, activeMood, affinity) {
    if (!Array.isArray(posts) || !posts.length) {
      return posts || [];
    }

    return [...posts].sort((a, b) => {
      const left = getMoodScoreForPost(a, activeMood, affinity);
      const right = getMoodScoreForPost(b, activeMood, affinity);
      if (left !== right) {
        return right - left;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  function hoursSince(value) {
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) {
      return 0;
    }
    return Math.max(0, (Date.now() - when.getTime()) / (1000 * 60 * 60));
  }

  window.MoodEngine = {
    buildMoodSelector,
    getSavedMood,
    saveMood,
    scorePosts,
    getMood,
    getMoodScoreForPost,
    moods: MOODS,
  };
})();
