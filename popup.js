document.addEventListener('DOMContentLoaded', () => {
  const keywordInput = document.getElementById('keywordInput');
  const pillsContainer = document.getElementById('pills');
  const maxHoursEl = document.getElementById('maxHours');
  const timeToggle = document.getElementById('timeToggle');
  const timeControls = document.getElementById('timeControls');

  let keywords = [];

  function renderPills() {
    pillsContainer.innerHTML = '';
    keywords.forEach((k, i) => {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.innerHTML = `${k} <button class="pill-remove" data-index="${i}">✕</button>`;
      pillsContainer.appendChild(pill);
    });
    pillsContainer.querySelectorAll('.pill-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        keywords.splice(parseInt(btn.dataset.index, 10), 1);
        renderPills();
        saveToStorage();
      });
    });
  }

  function saveToStorage() {
    chrome.storage.sync.set({
      blockedKeywords: keywords,
      maxHours: parseInt(maxHoursEl.value, 10) || 0,
      maxHoursEnabled: timeToggle.checked
    });
  }

  keywordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = e.target.value.trim();
      if (val && !keywords.includes(val)) {
        keywords.push(val);
        renderPills();
        e.target.value = '';
        saveToStorage();
      }
    }
  });

  maxHoursEl.addEventListener('input', saveToStorage);

  chrome.storage.sync.get(['blockedKeywords', 'maxHours', 'maxHoursEnabled'], (result) => {
    keywords = result.blockedKeywords || [];
    renderPills();
    if (result.maxHours !== undefined) {
      maxHoursEl.value = result.maxHours;
    }
    timeToggle.checked = result.maxHoursEnabled !== false;
    timeControls.style.display = timeToggle.checked ? '' : 'none';
  });

  timeToggle.addEventListener('change', () => {
    timeControls.style.display = timeToggle.checked ? '' : 'none';
    saveToStorage();
  });
});
