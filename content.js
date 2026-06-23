let blockedKeywords = [];
let maxHours = 0;
let maxHoursEnabled = true;

chrome.storage.sync.get(['blockedKeywords', 'maxHours', 'maxHoursEnabled'], (result) => {
  blockedKeywords = result.blockedKeywords || [];
  maxHours = result.maxHours || 0;
  maxHoursEnabled = result.maxHoursEnabled !== false;
  filterJobs();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockedKeywords) {
    blockedKeywords = changes.blockedKeywords.newValue || [];
  }
  if (changes.maxHours) {
    maxHours = changes.maxHours.newValue || 0;
  }
  if (changes.maxHoursEnabled) {
    maxHoursEnabled = changes.maxHoursEnabled.newValue !== false;
  }
  filterJobs();
});

const postedRe = /\bPosted\s+(\d+)\s*(hour|hours|h|day|days|d|week|weeks|w|month|months|mo|minute|minutes|min|m)\s+ago/i;
const postedRe2 = /(\d+)\s*(hour|hours|h|day|days|d|week|weeks|w|month|months|mo|minute|minutes|min|m)\s+ago/i;

function getTextWalker(root) {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      if (node.parentElement) {
        const tag = node.parentElement.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
          return NodeFilter.FILTER_REJECT;
        }
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  }, false);
}

function normalizeText(text) {
  return text.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function parseTimeUnit(num, unit) {
  const u = unit.toLowerCase();
  if (u === 'm' || u === 'min' || u.startsWith('minute')) return num / 60;
  if (u === 'h' || u.startsWith('hour')) return num;
  if (u === 'd' || u.startsWith('day')) return num * 24;
  if (u === 'w' || u.startsWith('week')) return num * 168;
  if (u === 'mo' || u.startsWith('month')) return num * 720;
  return null;
}

function getCardHoursAgo(card) {
  const walker = getTextWalker(card);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node || !node.textContent) continue;
    const txt = node.textContent.replace(/\s+/g, ' ');
    const m = txt.match(postedRe);
    if (m) {
      return parseTimeUnit(parseInt(m[1], 10), m[2]);
    }
  }
  const walker2 = getTextWalker(card);
  while (walker2.nextNode()) {
    const node = walker2.currentNode;
    if (!node || !node.textContent) continue;
    const txt = node.textContent.replace(/\s+/g, ' ');
    if (/repost|applied|saved|updated|closed/i.test(txt)) continue;
    const m = txt.match(postedRe2);
    if (m) return parseTimeUnit(parseInt(m[1], 10), m[2]);
  }
  return null;
}

function checkCard(card) {
  if (blockedKeywords.length > 0 && matchesKeyword(card.textContent.trim(), blockedKeywords)) return true;
  if (maxHoursEnabled && maxHours > 0) {
    const h = getCardHoursAgo(card);
    if (h !== null && h > maxHours) return true;
  }
  return false;
}

function matchesKeyword(text, keywords) {
  const normalized = normalizeText(text);
  return keywords.some(keyword => {
    const k = keyword.trim();
    if (!k) return false;
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(normalized);
  });
}

function findCardsListItems() {
  const list = document.querySelector('.jobs-search-results__list');
  if (list && list.children.length >= 2) return [...list.children];
  return null;
}

function findCardsBySelector() {
  const selectors = [
    '[data-job-id]',
    '.job-card-container',
    '.jobs-search-results__list-item',
    'article[data-entity-urn*="job"]'
  ];
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    if (els.length >= 2) return [...els];
  }
  return null;
}

function findCardsByText() {
  const leaves = [];
  const walker = getTextWalker(document.body);
  while (walker.nextNode()) {
    const txt = walker.currentNode.textContent;
    if (txt && postedRe.test(txt)) {
      leaves.push(walker.currentNode.parentElement);
    }
  }
  const unique = [...new Set(leaves)];
  if (unique.length < 2) return [];
  const cards = new Set();
  for (const leaf of unique) {
    let cur = leaf;
    while (cur && cur.parentElement) {
      const matches = Array.from(cur.parentElement.children).filter(s => {
        const t = s.textContent;
        return t && postedRe.test(t);
      });
      if (matches.length >= 2) {
        matches.forEach(s => cards.add(s));
        break;
      }
      cur = cur.parentElement;
    }
  }
  return [...cards];
}

function findCards() {
  return findCardsListItems()
    || findCardsBySelector()
    || findCardsByText()
    || [];
}

function filterJobs() {
  try {
    const cards = findCards();
    let hidden = 0;
    cards.forEach(card => {
      try {
        if (checkCard(card)) {
          if (!card.dataset.ljfHidden) {
            card.dataset.ljfOrigDisplay = card.style.display;
            card.dataset.ljfHidden = 'true';
            card.style.setProperty('display', 'none', 'important');
            hidden++;
          }
        } else if (card.dataset.ljfHidden) {
          card.style.display = card.dataset.ljfOrigDisplay || '';
          delete card.dataset.ljfHidden;
          delete card.dataset.ljfOrigDisplay;
        }
      } catch (e) {
        console.warn('LJF: error processing card', e);
      }
    });
    console.log('LJF: cards=' + cards.length + ' hidden=' + hidden + ' maxHours=' + maxHours + ' maxHoursEnabled=' + maxHoursEnabled + ' keywords=' + blockedKeywords.length);
  } catch (e) {
    console.error('LJF: error in filterJobs', e);
  }
}

let filterTimer;
const observer = new MutationObserver(() => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(filterJobs, 200);
});
observer.observe(document.body, { childList: true, subtree: true });

let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(filterJobs, 500);
  }
}).observe(document, { subtree: true, childList: true });
