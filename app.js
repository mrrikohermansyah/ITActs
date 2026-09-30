import { WORK_CODES, LOCATION_OPTIONS } from './config.js';
import { auth, loginUser, logoutUser, registerUser, resetPassword, subscribeToAuth, updateCurrentUserDisplayName } from './auth.js';
import { cancelActivity, createActivity, deleteActivity, finishActivity, subscribeToActivities, updateActivity } from './firestore.js';
import { Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const state = {
  currentUser: null,
  activeActivities: [],
  activities: [],
  unsubscribeActivities: null,
  activityListenerGeneration: 0,
  currentView: 'loading',
  authReady: false
};

const ui = {
  loadingView: document.querySelector('#loading-view'),
  authView: document.querySelector('#auth-view'),
  dashboardView: document.querySelector('#dashboard-view'),
  historyView: document.querySelector('#history-view'),
  profileView: document.querySelector('#profile-view'),
  pageTitle: document.querySelector('#page-title'),
  topbarUser: document.querySelector('#topbar-user'),
  bottomNav: document.querySelector('.bottom-nav'),
  startActivityBtn: document.querySelector('#start-activity-btn'),
  addActivityFab: document.querySelector('#add-activity-fab'),
  quickActions: document.querySelector('.quick-actions'),
  activeActivitiesList: document.querySelector('#active-activities-list'),
  activeActivityTemplate: document.querySelector('#active-activity-template'),
  emptyActiveState: document.querySelector('#empty-active-state'),
  loginForm: document.querySelector('#login-form'),
  registerForm: document.querySelector('#register-form'),
  forgotPasswordBtn: document.querySelector('#forgot-password-btn'),
  profileName: document.querySelector('#profile-name'),
  profileEmail: document.querySelector('#profile-email'),
  profileAvatar: document.querySelector('#profile-avatar'),
  editNameBtn: document.querySelector('#edit-name-btn'),
  editNameModal: document.querySelector('#edit-name-modal'),
  editNameInput: document.querySelector('#edit-name-input'),
  editNameForm: document.querySelector('#edit-name-form'),
  editNameCancelBtn: document.querySelector('#edit-name-cancel'),
  editNameSaveBtn: document.querySelector('#edit-name-save'),
  logoutBtn: document.querySelector('#logout-btn'),
  searchInput: document.querySelector('#search-input'),
  filterLocation: document.querySelector('#filter-location'),
  filterWorkCode: document.querySelector('#filter-workcode'),
  filterDateFrom: document.querySelector('#filter-date-from'),
  filterDateTo: document.querySelector('#filter-date-to'),
  filterStatus: document.querySelector('#filter-status'),
  historyToolbar: document.querySelector('#history-view .toolbar'),
  historyFilterToggle: document.querySelector('#history-filter-toggle'),
  historyFilterClose: document.querySelector('#history-filter-close'),
  historyExportBtn: document.querySelector('#history-export-btn'),
  historyFilterPanel: document.querySelector('#history-filter-panel'),
  historyFilterReset: document.querySelector('#history-filter-reset'),
  historyFilterApply: document.querySelector('#history-filter-apply'),
  filterActiveIndicator: document.querySelector('.filter-active-indicator'),
  resumeScope: document.querySelector('#resume-scope'),
  resumeTotalCount: document.querySelector('#resume-total-count'),
  resumeTotalDuration: document.querySelector('#resume-total-duration'),
  resumeTotalMinutes: document.querySelector('#resume-total-minutes'),
  historyList: document.querySelector('#history-list'),
  toast: document.querySelector('#toast'),
  confirmModal: document.querySelector('#confirm-modal'),
  confirmEndBtn: document.querySelector('#confirm-end'),
  confirmCancelBtn: document.querySelector('#confirm-cancel'),
  cancelConfirmModal: document.querySelector('#cancel-confirm-modal'),
  cancelConfirmBtn: document.querySelector('#cancel-activity-confirm'),
  cancelDismissBtn: document.querySelector('#cancel-activity-dismiss'),
  deleteConfirmModal: document.querySelector('#delete-confirm-modal'),
  deleteConfirmBtn: document.querySelector('#delete-confirm'),
  deleteCancelBtn: document.querySelector('#delete-cancel'),
  logoutConfirmModal: document.querySelector('#logout-confirm-modal'),
  logoutConfirmBtn: document.querySelector('#logout-confirm'),
  logoutCancelBtn: document.querySelector('#logout-cancel')
};

let activeTimerLoop = null;
let openSwipeActivityId = null;
let pendingDeleteActivityId = null;
let pendingEndActivityId = null;
let pendingCancelActivityId = null;
// Activity ids whose card has unsaved local edits. Remote snapshots must not
// clobber a card the user is still editing on this device.
const dirtyActivityCards = new Set();

// Placeholder option for the card location select. Its value is '' so an
// unpicked location is never a valid location.
const LOCATION_PLACEHOLDER_OPTION = { value: '', label: 'Pilih Lokasi' };
const pendingSwipeFrames = new WeakMap();
const pendingSwipePositions = new WeakMap();

// Cards that are currently playing their exit animation. They stay in the DOM
// (and in their original slot) until the collapse finishes, then get removed.
const exitingActiveActivityIds = new Set();
// Exit animations last 300ms; the timer is only a fallback for cases where
// transitionend never fires (display:none, reduced motion, ...).
const EXIT_ANIMATION_MS = 300;
const EXIT_ANIMATION_FALLBACK_MS = EXIT_ANIMATION_MS + 120;
// Set while a Riwayat card is collapsing, so snapshot-driven re-renders cannot
// wipe the animation away mid-flight.
let historyRemovalInFlight = false;

// Bottom navigation auto-hide. The breakpoint matches the one that reveals
// .bottom-nav in style.css, so desktop never runs any of this.
const BOTTOM_NAV_MEDIA_QUERY = '(max-width: 900px)';
// Movement smaller than this is accumulated rather than applied, so a 1px
// jitter or a brief gesture reversal cannot flip the bar in and out.
const BOTTOM_NAV_SCROLL_THRESHOLD = 8;
// Fractional scroll offsets settle just above 0 on iOS; a small tolerance keeps
// the "at the top the bar is always visible" rule from getting stuck.
const BOTTOM_NAV_TOP_TOLERANCE = 2;

const bottomNavMedia = window.matchMedia(BOTTOM_NAV_MEDIA_QUERY);
let bottomNavHidden = false;
let bottomNavWasMobile = bottomNavMedia.matches;
let bottomNavLastScrollY = window.scrollY;
let bottomNavFrameQueued = false;

function toUppercaseInventory(value) {
  return String(value || '').toUpperCase();
}

function toTitleCase(value) {
  const raw = String(value || '');

  if (!raw) {
    return '';
  }

  return raw.replace(/\S+/g, (word) => {
    if (!word) return word;
    // Only capitalize the first character of each word and keep the rest EXACTLY
    // as typed. Never call .toLowerCase() on the remainder: that would destroy
    // acronyms the user typed in caps (IT, QA, HR, PIC, ...). Whitespace between
    // words is untouched, so spaces can still be typed normally.
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

function applyTitleCaseInput(inputElement) {
  const previousValue = inputElement.value || '';
  const formattedValue = toTitleCase(previousValue);

  if (formattedValue === previousValue) {
    return;
  }

  const caretStart = inputElement.selectionStart ?? previousValue.length;
  const caretEnd = inputElement.selectionEnd ?? previousValue.length;

  inputElement.value = formattedValue;

  const nextCaretPosition = Math.min(Math.max(caretStart, 0), formattedValue.length);
  inputElement.setSelectionRange(nextCaretPosition, nextCaretPosition);

  if (caretStart !== caretEnd) {
    const rangeEnd = Math.min(Math.max(caretEnd, 0), formattedValue.length);
    inputElement.setSelectionRange(nextCaretPosition, rangeEnd);
  }
}

function normalizeWorkCodes(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
  }

  if (typeof value === 'string') {
    return value
      .split('&')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function formatWorkCodes(value) {
  const items = normalizeWorkCodes(value);
  return items.join(' & ');
}

function showToast(message, type = 'success') {
  ui.toast.textContent = message;
  ui.toast.className = `toast ${type} visible`;

  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    ui.toast.className = 'toast hidden';
  }, 2500);
}

function setBottomNavHidden(isHidden) {
  if (bottomNavHidden === isHidden) {
    return;
  }
  bottomNavHidden = isHidden;
  ui.bottomNav.classList.toggle('nav-hidden', isHidden);
  document.body.classList.toggle('nav-hidden', isHidden);
}

function updateBottomNavOnScroll() {
  bottomNavFrameQueued = false;

  if (!bottomNavMedia.matches) {
    return;
  }

  const currentScrollY = window.scrollY;

  if (currentScrollY <= BOTTOM_NAV_TOP_TOLERANCE) {
    bottomNavLastScrollY = currentScrollY;
    setBottomNavHidden(false);
    return;
  }

  const delta = currentScrollY - bottomNavLastScrollY;

  // lastScrollY is deliberately not advanced here: sub-threshold movement keeps
  // accumulating until the gesture is clearly directional in one way or the other.
  if (Math.abs(delta) < BOTTOM_NAV_SCROLL_THRESHOLD) {
    return;
  }

  bottomNavLastScrollY = currentScrollY;
  setBottomNavHidden(delta > 0);
}

// Rotating a tablet can cross the 900px breakpoint while the bar is tucked away.
// Without this the class would survive until the next upward scroll.
function syncBottomNavWithViewport() {
  const isMobile = bottomNavMedia.matches;

  if (isMobile === bottomNavWasMobile) {
    return;
  }

  bottomNavWasMobile = isMobile;
  bottomNavLastScrollY = window.scrollY;
  setBottomNavHidden(false);
}

// Switching tabs changes the document height, which can clamp scrollY under us.
// Re-anchoring here keeps the bar usable and stops it vanishing mid-navigation.
function resetBottomNavForViewChange() {
  bottomNavLastScrollY = window.scrollY;
  setBottomNavHidden(false);
}

function setView(viewName) {
  state.currentView = viewName;

  const allPanels = [ui.loadingView, ui.authView, ui.dashboardView, ui.historyView, ui.profileView];
  allPanels.forEach((panel) => {
    if (panel) {
      panel.classList.add('hidden');
    }
  });

  const viewMap = {
    loading: ui.loadingView,
    auth: ui.authView,
    dashboard: ui.dashboardView,
    history: ui.historyView,
    profile: ui.profileView
  };

  if (viewMap[viewName]) {
    viewMap[viewName].classList.remove('hidden');
  }

  const titleMap = {
    loading: 'Memuat',
    auth: 'Masuk',
    dashboard: 'Dashboard',
    history: 'Riwayat Aktivitas',
    profile: 'Profil'
  };

  ui.pageTitle.textContent = titleMap[viewName] || 'Dashboard';

  document.querySelectorAll('[data-view]').forEach((button) => {
    const isActive = button.dataset.view === viewName;
    button.classList.toggle('active', isActive);
  });

  if (viewName !== 'loading' && viewName !== 'auth') {
    localStorage.setItem('actlog-current-view', viewName);
  }

  // Runs after the panel swap so window.scrollY is read post-clamping.
  resetBottomNavForViewChange();
}

function populateSelect(select, options, firstOption) {
  select.replaceChildren();

  if (firstOption) {
    select.add(new Option(firstOption.label, firstOption.value));
  }

  options.forEach((item) => {
    const value = typeof item === 'string' ? item : item.code;
    const label = typeof item === 'string' ? item : item.label || item.code;
    select.add(new Option(label, value));
  });
}

function initSelectOptions() {
  populateSelect(ui.filterLocation, LOCATION_OPTIONS, { value: 'all', label: 'Semua Lokasi' });
  populateSelect(ui.filterWorkCode, WORK_CODES, { value: 'all', label: 'Semua Kode' });
}

function renderWorkCodeButtonsForCard(card) {
  const hiddenInput = card.querySelector('.activity-work-code');
  const container = card.querySelector('.work-code-options');
  const selectedCodes = normalizeWorkCodes(hiddenInput.value);

  container.replaceChildren();

  WORK_CODES.forEach((item) => {
    const code = item.code;
    const isActive = selectedCodes.includes(code);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `work-code-option${isActive ? ' active' : ''}`;
    button.dataset.workCode = code;
    button.setAttribute('aria-pressed', String(isActive));
    button.textContent = code;
    container.append(button);
  });

  // Initial state for a fresh activity: no code pre-selected, just a hint so
  // the empty group does not look broken. It disappears once a code is picked.
  if (!selectedCodes.length) {
    const hint = document.createElement('span');
    hint.className = 'work-code-empty-hint';
    hint.textContent = 'Belum ada kode yang dipilih.';
    container.append(hint);
  }

  container.querySelectorAll('.work-code-option').forEach((button) => {
    button.addEventListener('click', () => {
      const nextValue = button.dataset.workCode;
      const currentCodes = normalizeWorkCodes(hiddenInput.value);
      const nextCodes = currentCodes.includes(nextValue)
        ? currentCodes.filter((code) => code !== nextValue)
        : [...currentCodes, nextValue];

      hiddenInput.value = formatWorkCodes(nextCodes);
      container.classList.remove('field-invalid');
      markCardDirty(card.dataset.activityId);
      renderWorkCodeButtonsForCard(card);
    });
  });
}

function renderUserHeader() {
  ui.topbarUser.textContent = state.currentUser
    ? state.currentUser.displayName || state.currentUser.email || 'User'
    : 'Belum masuk';

  if (state.currentUser) {
    ui.profileName.textContent = state.currentUser.displayName || 'User';
    ui.profileEmail.textContent = state.currentUser.email || '-';
    const initial = (state.currentUser.displayName || state.currentUser.email || 'U').charAt(0).toUpperCase();
    ui.profileAvatar.textContent = initial;
  }
}

function showEditNameModal() {
  const currentName = state.currentUser?.displayName || '';
  ui.editNameInput.value = currentName;
  ui.editNameInput.classList.remove('field-invalid');
  ui.editNameModal.classList.remove('hidden');
  ui.editNameModal.setAttribute('aria-hidden', 'false');
  ui.editNameInput.focus();
}

function hideEditNameModal() {
  ui.editNameModal.classList.add('hidden');
  ui.editNameModal.setAttribute('aria-hidden', 'true');
}

async function handleEditNameSubmit(event) {
  event.preventDefault();

  const formattedName = toTitleCase(ui.editNameInput.value.trim());

  if (!formattedName) {
    ui.editNameInput.classList.add('field-invalid');
    ui.editNameInput.focus();
    return;
  }

  ui.editNameSaveBtn.disabled = true;

  try {
    const updatedUser = await updateCurrentUserDisplayName(formattedName);
    state.currentUser = updatedUser;
    renderUserHeader();
    hideEditNameModal();
    showToast('Nama berhasil diperbarui.', 'success');
  } catch (error) {
    console.error('[Profile] Name update failed:', error);
    showToast('Gagal memperbarui nama.', 'error');
  } finally {
    ui.editNameSaveBtn.disabled = false;
  }
}

function toJsDate(value) {
  if (!value) {
    return null;
  }
  return value.toDate ? value.toDate() : new Date(value);
}

function toMillis(value) {
  const date = toJsDate(value);
  return date ? date.getTime() : 0;
}

// Local calendar day key (YYYY-MM-DD) using the device's timezone, NOT UTC.
// Firestore timestamps are absolute instants; toISOString() would shift evening
// activities in WIB (UTC+7) to the previous day, so we read local date parts.
function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCard(activityId) {
  return Array.from(
    ui.activeActivitiesList.querySelectorAll('.active-activity-card')
  ).find((card) => card.dataset.activityId === activityId) || null;
}

// Called right after a new activity card is rendered: add a subtle "new"
// highlight, then smooth-scroll just enough so the top of the fresh card
// lands ~20px below the top of the viewport (the topbar is not fixed, so no
// extra header offset is needed).
function focusNewActivityCard(activityId) {
  const card = getCard(activityId);
  if (!card) {
    return;
  }

  card.classList.remove('activity-new');
  void card.offsetWidth;
  card.classList.add('activity-new');
  card.addEventListener('animationend', () => card.classList.remove('activity-new'), { once: true });

  requestAnimationFrame(() => {
    const topOffset = 20;
    const targetY = card.getBoundingClientRect().top + window.scrollY - topOffset;
    window.scrollTo({ top: Math.max(targetY, 0), behavior: 'smooth' });
  });
}

// Mark a card as having unsaved local edits and reset its save-button label back
// to "Simpan Detail" so the button always reflects the card's real saved state.
function markCardDirty(activityId) {
  if (!activityId) {
    return;
  }

  dirtyActivityCards.add(activityId);

  const card = getCard(activityId);
  const saveBtn = card?.querySelector('.save-activity-btn');
  const saveBtnText = saveBtn?.querySelector('.save-activity-btn-text');
  if (saveBtnText && saveBtnText.textContent !== 'Simpan Detail') {
    saveBtnText.textContent = 'Simpan Detail';
  }
}

function clearCardDirty(activityId) {
  dirtyActivityCards.delete(activityId);
}

// Push the latest saved data for an activity into its existing card. This is what
// makes "Simpan Detail" on one device appear on another: the Firestore snapshot
// updates state.activities, and here we reflect it into the already-rendered card.
// We skip a card the user is focused in or has unsaved edits on, so remote updates
// never clobber local typing.
function syncCardFromActivity(card, activity) {
  if (!card || !activity) {
    return;
  }

  if (dirtyActivityCards.has(activity.id) || card.contains(document.activeElement)) {
    return;
  }

  const inventoryInput = card.querySelector('.inventory-code');
  const userNameInput = card.querySelector('.user-name');
  const locationSelect = card.querySelector('.activity-location');
  const workCodeHidden = card.querySelector('.activity-work-code');
  const remarksInput = card.querySelector('.activity-remarks');
  const customWrap = card.querySelector('.custom-location-wrap');
  const customInput = card.querySelector('.custom-location-input');

  const nextInventory = toUppercaseInventory(activity.inventoryCode || '');
  if (inventoryInput.value !== nextInventory) {
    inventoryInput.value = nextInventory;
  }

  const nextUserName = toTitleCase(activity.userName || '');
  if (userNameInput.value !== nextUserName) {
    userNameInput.value = nextUserName;
  }

  // Mirror buildActiveActivityCard: empty location keeps the placeholder,
  // known locations select themselves, custom values reveal the manual input.
  const location = activity.location || '';
  if (!location) {
    locationSelect.value = '';
    customInput.value = '';
    customWrap.classList.add('hidden');
  } else if (LOCATION_OPTIONS.includes(location)) {
    locationSelect.value = location;
    customInput.value = '';
    customWrap.classList.add('hidden');
  } else {
    locationSelect.value = 'OTHER LOCATION';
    customInput.value = location;
    customWrap.classList.remove('hidden');
  }

  const nextWorkCode = formatWorkCodes(activity.workCode || '');
  if (workCodeHidden.value !== nextWorkCode) {
    workCodeHidden.value = nextWorkCode;
    renderWorkCodeButtonsForCard(card);
  }

  const nextRemarks = activity.remarks || '';
  if (remarksInput.value !== nextRemarks) {
    remarksInput.value = nextRemarks;
  }
}

function updateCardCustomLocationVisibility(card) {
  const locationSelect = card.querySelector('.activity-location');
  const customWrap = card.querySelector('.custom-location-wrap');
  const customInput = card.querySelector('.custom-location-input');

  locationSelect.classList.remove('field-invalid');
  customInput.classList.remove('field-invalid');

  if (locationSelect.value === 'OTHER LOCATION') {
    customWrap.classList.remove('hidden');
    customInput.focus();
  } else {
    customWrap.classList.add('hidden');
  }
}

// Re-populate every location <select> so a newly added custom location becomes
// selectable, while preserving each control's current value.
function refreshAllLocationSelects() {
  const filterCurrent = ui.filterLocation.value;
  populateSelect(ui.filterLocation, LOCATION_OPTIONS, { value: 'all', label: 'Semua Lokasi' });
  ui.filterLocation.value = filterCurrent;

  ui.activeActivitiesList.querySelectorAll('.active-activity-card').forEach((card) => {
    const locationSelect = card.querySelector('.activity-location');
    const current = locationSelect.value;
    populateSelect(locationSelect, LOCATION_OPTIONS, LOCATION_PLACEHOLDER_OPTION);
    // Keep the placeholder selected when no location has been picked yet.
    locationSelect.value = !current || LOCATION_OPTIONS.includes(current)
      ? current
      : 'OTHER LOCATION';
  });
}

function getCardFormPayload(card) {
  const locationSelect = card.querySelector('.activity-location');
  const customInput = card.querySelector('.custom-location-input');
  let locationValue = locationSelect.value;

  if (!locationValue) {
    throw new Error('Pilih lokasi terlebih dahulu.');
  }

  if (locationValue === 'OTHER LOCATION') {
    const customValue = customInput.value.trim();

    if (!customValue) {
      throw new Error('Isi lokasi manual jika memilih OTHER LOCATION');
    }

    const exists = LOCATION_OPTIONS.some(
      (item) => item.toLowerCase() === customValue.toLowerCase()
    );

    if (exists) {
      throw new Error('Lokasi sudah ada di daftar lokasi');
    }

    LOCATION_OPTIONS.push(customValue);
    locationValue = customValue;
    refreshAllLocationSelects();
    locationSelect.value = customValue;
    card.querySelector('.custom-location-wrap').classList.add('hidden');
  }

  const selectedWorkCodes = normalizeWorkCodes(card.querySelector('.activity-work-code').value);

  if (!selectedWorkCodes.length) {
    throw new Error('Pilih minimal satu kode pengerjaan.');
  }

  return {
    inventoryCode: toUppercaseInventory(card.querySelector('.inventory-code').value.trim()),
    userName: toTitleCase(card.querySelector('.user-name').value.trim()),
    location: locationValue,
    workCode: formatWorkCodes(selectedWorkCodes),
    remarks: card.querySelector('.activity-remarks').value.trim()
  };
}

function validateCardEndFields(card) {
  const inventoryInput = card.querySelector('.inventory-code');
  const userNameInput = card.querySelector('.user-name');
  const customInput = card.querySelector('.custom-location-input');
  const remarksInput = card.querySelector('.activity-remarks');
  const workOptions = card.querySelector('.work-code-options');
  const locationSelect = card.querySelector('.activity-location');
  const workHidden = card.querySelector('.activity-work-code');

  [inventoryInput, userNameInput, locationSelect, customInput, remarksInput, workOptions].forEach((element) => {
    element.classList.remove('field-invalid');
  });

  // Ordered top-to-bottom like the form layout so when several fields are
  // empty only the topmost one gets highlighted first.
  const requiredFields = [
    {
      element: inventoryInput,
      focusTarget: inventoryInput,
      isEmpty: !(inventoryInput.value || '').trim()
    },
    {
      element: userNameInput,
      focusTarget: userNameInput,
      isEmpty: !(userNameInput.value || '').trim()
    },
    {
      element: locationSelect,
      focusTarget: locationSelect,
      isEmpty: !locationSelect.value
    },
    {
      element: workOptions,
      focusTarget: workOptions.querySelector('.work-code-option'),
      isEmpty: !normalizeWorkCodes(workHidden.value).length
    },
    {
      element: customInput,
      focusTarget: customInput,
      isEmpty: locationSelect.value === 'OTHER LOCATION'
        && !(customInput.value || '').trim()
    },
    {
      element: remarksInput,
      focusTarget: remarksInput,
      isEmpty: !(remarksInput.value || '').trim()
    }
  ];

  const firstInvalidField = requiredFields.find((field) => field.isEmpty);

  if (!firstInvalidField) {
    return true;
  }

  firstInvalidField.element.classList.add('field-invalid');
  firstInvalidField.focusTarget?.focus({ preventScroll: true });
  firstInvalidField.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
}

function recomputeActiveActivities() {
  state.activeActivities = state.activities
    .filter((item) => item.status === 'ongoing')
    .sort((a, b) => toMillis(a.startedAt) - toMillis(b.startedAt));
}

function buildActiveActivityCard(activity) {
  const card = ui.activeActivityTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.activityId = activity.id;

  const inventoryInput = card.querySelector('.inventory-code');
  const userNameInput = card.querySelector('.user-name');
  const locationSelect = card.querySelector('.activity-location');
  const workCodeHidden = card.querySelector('.activity-work-code');
  const remarksInput = card.querySelector('.activity-remarks');
  const customWrap = card.querySelector('.custom-location-wrap');
  const customInput = card.querySelector('.custom-location-input');
  const form = card.querySelector('.activity-form');
  const endBtn = card.querySelector('.end-activity-btn');
  const cancelBtn = card.querySelector('.cancel-activity-btn');
  const badge = card.querySelector('.status-badge');

  badge.textContent = 'Sedang Berlangsung';
  badge.className = 'status-badge ongoing';

  populateSelect(locationSelect, LOCATION_OPTIONS, LOCATION_PLACEHOLDER_OPTION);

  inventoryInput.value = toUppercaseInventory(activity.inventoryCode || '');
  userNameInput.value = toTitleCase(activity.userName || '');

  // Empty location means the user has not picked one yet: keep the placeholder
  // selected. Only fall back to OTHER LOCATION when a saved location is a
  // custom value outside LOCATION_OPTIONS.
  const location = activity.location || '';
  if (!location) {
    locationSelect.value = '';
    customInput.value = '';
    customWrap.classList.add('hidden');
  } else if (LOCATION_OPTIONS.includes(location)) {
    locationSelect.value = location;
    customInput.value = '';
    customWrap.classList.add('hidden');
  } else {
    locationSelect.value = 'OTHER LOCATION';
    customInput.value = location;
    customWrap.classList.remove('hidden');
  }

  workCodeHidden.value = formatWorkCodes(activity.workCode || '');
  renderWorkCodeButtonsForCard(card);
  remarksInput.value = activity.remarks || '';

  // Each card is wired to its own document id, so Akhiri / Cancel / Simpan act
  // on this activity only and never touch the others.
  form.addEventListener('submit', (event) => handleSaveActivity(event, activity.id));
  endBtn.addEventListener('click', () => showConfirmModal(activity.id));
  cancelBtn.addEventListener('click', () => showCancelConfirmation(activity.id));
  locationSelect.addEventListener('change', () => updateCardCustomLocationVisibility(card));
  customInput.addEventListener('input', () => customInput.classList.remove('field-invalid'));
  inventoryInput.addEventListener('input', (event) => {
    event.target.value = toUppercaseInventory(event.target.value);
  });
  userNameInput.addEventListener('input', (event) => {
    event.target.classList.remove('field-invalid');
    applyTitleCaseInput(event.target);
  });
  userNameInput.addEventListener('blur', () => {
    userNameInput.value = toTitleCase(userNameInput.value || '');
  });
  remarksInput.addEventListener('input', () => remarksInput.classList.remove('field-invalid'));

  // Any local edit marks this card dirty so a remote snapshot won't overwrite the
  // user's in-progress typing (work-code button clicks mark dirty in their handler).
  card.addEventListener('input', () => markCardDirty(activity.id));
  card.addEventListener('change', () => markCardDirty(activity.id));

  return card;
}

function renderActiveActivities() {
  const ongoing = state.activeActivities;
  const hasOngoing = ongoing.length > 0;
  // A card that is still collapsing out keeps the dashboard in its "activity
  // running" look until it is gone, so nothing pops during the animation.
  const showActiveLayout = hasOngoing || exitingActiveActivityIds.size > 0;

  ui.quickActions.classList.toggle('is-active', showActiveLayout);
  ui.startActivityBtn.classList.toggle('is-active-layout', showActiveLayout);

  if (!showActiveLayout) {
    ui.startActivityBtn.querySelector('.start-activity-icon').classList.remove('hidden');
    ui.startActivityBtn.querySelector('.start-activity-button-text').classList.add('hidden');
  } else {
    ui.startActivityBtn.querySelector('.start-activity-icon').classList.add('hidden');
    ui.startActivityBtn.querySelector('.start-activity-button-text').classList.remove('hidden');
  }
  // Never disabled just because activities are already running: the + button
  // always starts another activity.
  ui.startActivityBtn.setAttribute('tabindex', '0');

  ui.emptyActiveState.classList.toggle('hidden', showActiveLayout);
  ui.addActivityFab.classList.toggle('visible', showActiveLayout);

  const currentCards = Array.from(
    ui.activeActivitiesList.querySelectorAll('.active-activity-card')
  );
  // Cards mid exit-animation are already gone from state, so they are ignored
  // when checking the order; they keep their slot via the re-insert below.
  const activeCards = currentCards.filter(
    (card) => !exitingActiveActivityIds.has(card.dataset.activityId)
  );
  const currentIds = activeCards.map((card) => card.dataset.activityId);
  const desiredIds = ongoing.map((activity) => activity.id);
  const sameOrder = desiredIds.length === currentIds.length
    && desiredIds.every((id, index) => id === currentIds[index]);

  // Only touch the DOM when the set/order of active activities actually changes.
  // Existing cards are moved (not rebuilt), so in-progress typing is preserved.
  if (!sameOrder) {
    const existing = new Map(currentCards.map((card) => [card.dataset.activityId, card]));

    desiredIds.forEach((id) => {
      let card = existing.get(id);
      if (!card) {
        const activity = ongoing.find((item) => item.id === id);
        card = buildActiveActivityCard(activity);
      }
      ui.activeActivitiesList.append(card);
    });

    existing.forEach((card, id) => {
      if (!desiredIds.includes(id) && !exitingActiveActivityIds.has(id)) {
        exitActiveActivityCard(card, id);
      }
    });

    // Appending reorders the list, so put every still-animating card back in the
    // slot it had, right before the next card that is still active.
    currentCards.forEach((card) => {
      const activityId = card.dataset.activityId;
      if (!exitingActiveActivityIds.has(activityId)) {
        return;
      }

      const index = currentCards.indexOf(card);
      const nextActive = currentCards
        .slice(index + 1)
        .find((other) => !exitingActiveActivityIds.has(other.dataset.activityId));

      ui.activeActivitiesList.insertBefore(card, nextActive || null);
    });
  }

  // Drop dirty flags for activities that are no longer active.
  Array.from(dirtyActivityCards).forEach((id) => {
    if (!desiredIds.includes(id)) {
      dirtyActivityCards.delete(id);
    }
  });

  // Reflect the latest saved data into every existing card. Cards are only rebuilt
  // when the id set/order changes, so without this a "Simpan Detail" performed on
  // another device would never update here. syncCardFromActivity skips cards that
  // are focused or have unsaved local edits, so local typing is never clobbered.
  ongoing.forEach((activity) => {
    syncCardFromActivity(getCard(activity.id), activity);
  });

  if (hasOngoing) {
    ensureTimerLoop();
  } else {
    stopTimerLoop();
  }
}

// Cancel/removal exit for one activity card: it fades and collapses vertically
// (the style lives in .active-activity-card.is-removing) while the cards below
// rise smoothly, and is only taken out of the DOM once the collapse is done.
function exitActiveActivityCard(card, activityId) {
  if (exitingActiveActivityIds.has(activityId)) {
    return;
  }

  exitingActiveActivityIds.add(activityId);

  const listGap = parseFloat(getComputedStyle(ui.activeActivitiesList).rowGap) || 0;

  card.style.maxHeight = `${card.offsetHeight}px`;
  void card.offsetHeight;
  card.classList.add('is-removing');

  requestAnimationFrame(() => {
    card.style.maxHeight = '0px';
    card.style.marginBottom = `-${listGap}px`;
  });

  let finished = false;
  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    card.remove();
    exitingActiveActivityIds.delete(activityId);
    // Re-render so the empty state / + button follow once the card is gone.
    renderActiveActivities();
  };

  card.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'max-height') {
      finish();
    }
  });
  window.setTimeout(finish, EXIT_ANIMATION_FALLBACK_MS);
}

function setActivityUiLoading(isLoading) {
  ui.quickActions.classList.toggle('activity-ui-loading', isLoading);
  ui.quickActions.classList.remove('activity-ui-error');
  ui.quickActions.setAttribute('aria-busy', String(isLoading));
  // The + button is base UI and does not depend on the Firestore query, so it is
  // never gated on loading. handleStartActivity() still guards on currentUser.
}

function renderActivityLoadError() {
  state.activeActivities = [];
  dirtyActivityCards.clear();
  stopTimerLoop();
  ui.quickActions.classList.remove('activity-ui-loading');
  ui.quickActions.classList.add('activity-ui-error');
  ui.quickActions.setAttribute('aria-busy', 'false');
  ui.startActivityBtn.disabled = true;
  ui.activeActivitiesList.replaceChildren();
  ui.emptyActiveState.classList.add('hidden');
}

function tickActiveTimers() {
  state.activeActivities.forEach((activity) => {
    const card = getCard(activity.id);
    if (!card) {
      return;
    }

    const startedAt = toJsDate(activity.startedAt);
    if (!startedAt) {
      return;
    }

    const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
    card.querySelector('.timer').textContent = formatClock(totalSeconds);
  });
}

// A single 1s loop drives every active card's timer, so multiple concurrent
// activities each tick independently from their own startedAt.
function ensureTimerLoop() {
  if (!state.activeActivities.length) {
    stopTimerLoop();
    return;
  }

  tickActiveTimers();

  if (activeTimerLoop) {
    return;
  }

  activeTimerLoop = setInterval(() => {
    if (!state.activeActivities.length) {
      stopTimerLoop();
      return;
    }
    tickActiveTimers();
  }, 1000);
}

function stopTimerLoop() {
  if (activeTimerLoop) {
    clearInterval(activeTimerLoop);
    activeTimerLoop = null;
  }
}

function formatClock(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function formatClockFromMinutes(minutes) {
  const totalSeconds = Number(minutes || 0) * 60;
  return formatClock(totalSeconds);
}

function hasActiveHistoryFilters() {
  return Boolean(
    ui.searchInput.value.trim()
    || ui.filterLocation.value !== 'all'
    || ui.filterWorkCode.value !== 'all'
    || ui.filterDateFrom.value
    || ui.filterDateTo.value
    || ui.filterStatus.value !== 'all'
  );
}

function updateHistoryFilterIndicator() {
  const isActive = hasActiveHistoryFilters();
  ui.historyFilterToggle.classList.toggle('has-active-filter', isActive);
  ui.filterActiveIndicator.setAttribute('aria-hidden', String(!isActive));
}

// Opening/closing only toggles visibility: the filter values themselves live in
// the inputs, so dismissing the panel keeps whatever the user already picked.
function setHistoryFilterPanelOpen(isOpen) {
  ui.historyFilterPanel.hidden = !isOpen;
  ui.historyFilterPanel.classList.toggle('is-open', isOpen);
  ui.historyFilterToggle.setAttribute('aria-expanded', String(isOpen));
  ui.historyFilterToggle.setAttribute('aria-label', isOpen ? 'Tutup filter riwayat' : 'Buka filter riwayat');
  ui.historyFilterToggle.title = isOpen ? 'Tutup filter' : 'Filter';
}

function isExcelJSAvailable() {
  return Boolean(
    window.ExcelJS &&
    typeof window.ExcelJS.Workbook === 'function'
  );
}

function loadExcelJS() {
  if (isExcelJSAvailable()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-exceljs-loader="true"]');

    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (isExcelJSAvailable()) {
          resolve();
          return;
        }
        reject(new Error('ExcelJS loaded but Workbook is missing.'));
      }, { once: true });

      existingScript.addEventListener('error', () => {
        reject(new Error('ExcelJS CDN gagal dimuat.'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-exceljs-loader', 'true');

    script.addEventListener('load', () => {
      if (isExcelJSAvailable()) {
        resolve();
        return;
      }
      reject(new Error('ExcelJS loaded but Workbook is missing.'));
    }, { once: true });

    script.addEventListener('error', () => {
      reject(new Error('ExcelJS CDN gagal dimuat.'));
    }, { once: true });

    document.head.appendChild(script);
  });
}

function getFilteredHistoryData() {
  const searchText = ui.searchInput.value.trim().toLowerCase();
  const locationFilter = ui.filterLocation.value;
  const workFilter = ui.filterWorkCode.value;
  const statusFilter = ui.filterStatus.value;
  const fromKey = ui.filterDateFrom.value;
  const toKey = ui.filterDateTo.value;

  // Both date fields empty falls back to TODAY only. The comparison uses the
  // local calendar day, so a WIB evening activity is never pushed to yesterday.
  // Either bound may be used alone, and both ends are inclusive. Filtering only
  // narrows the view; the data itself is never modified or deleted.
  const todayKey = getLocalDateKey(new Date());
  const hasRange = Boolean(fromKey || toKey);

  return state.activities.filter((item) => {
    if (item.status !== 'completed') {
      return false;
    }

    const matchesSearch =
      !searchText ||
      (item.userName || '').toLowerCase().includes(searchText) ||
      (item.inventoryCode || '').toLowerCase().includes(searchText);

    const matchesLocation = locationFilter === 'all' || item.location === locationFilter;
    const matchesWork = workFilter === 'all' || item.workCode === workFilter;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    const itemDate = toJsDate(item.startedAt);

    if (!itemDate) {
      return false;
    }

    // Local date keys are YYYY-MM-DD, so plain string comparison is chronological.
    const itemDateKey = getLocalDateKey(itemDate);
    const matchesDate = hasRange
      ? (!fromKey || itemDateKey >= fromKey) && (!toKey || itemDateKey <= toKey)
      : itemDateKey === todayKey;

    return matchesSearch && matchesLocation && matchesWork && matchesDate && matchesStatus;
  });
}

// Duration of a single activity in whole minutes. Prefers the durationMinutes
// field written by finishActivity(); only when it is missing (legacy documents)
// does it recompute from startedAt/endedAt with the same rounding formula.
function getActivityDurationMinutes(item) {
  const stored = Number(item?.durationMinutes);

  if (Number.isFinite(stored) && stored >= 0) {
    return stored;
  }

  const startedMs = toMillis(item?.startedAt);
  const endedMs = toMillis(item?.endedAt);

  if (!startedMs || !endedMs) {
    return 0;
  }

  return Math.max(0, Math.round((endedMs - startedMs) / 60000));
}

// "455" -> "7 Jam 35 Menit". Whole hours drop the minutes part ("2 Jam"),
// a zero total renders as "0 Menit", and sub-hour totals keep the
// "0 Jam 45 Menit" form.
function formatResumeDuration(totalMinutes) {
  const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (total === 0) {
    return '0 Menit';
  }

  if (minutes === 0) {
    return `${hours} Jam`;
  }

  return `${hours} Jam ${minutes} Menit`;
}

// 'YYYY-MM-DD' -> '25 Sep 2026'. Parsed at local midnight so the label never
// drifts a day the way a UTC parse of a bare date string would.
function formatDateKeyLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? dateKey
    : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function getResumeScopeLabel() {
  const fromKey = ui.filterDateFrom.value;
  const toKey = ui.filterDateTo.value;

  if (fromKey && toKey) {
    return fromKey === toKey
      ? formatDateKeyLabel(fromKey)
      : `${formatDateKeyLabel(fromKey)} - ${formatDateKeyLabel(toKey)}`;
  }

  if (fromKey) {
    return `Sejak ${formatDateKeyLabel(fromKey)}`;
  }

  if (toKey) {
    return `Sampai ${formatDateKeyLabel(toKey)}`;
  }

  return 'Hari Ini';
}

// Summary of exactly the activities the history list is showing, so the resume
// follows the active filter and stays consistent with the rendered feed.
function renderHistoryResume(filtered) {
  const totalMinutes = filtered.reduce(
    (sum, item) => sum + getActivityDurationMinutes(item),
    0
  );

  ui.resumeTotalCount.textContent = `${filtered.length} Aktivitas`;
  ui.resumeTotalDuration.textContent = formatResumeDuration(totalMinutes);
  ui.resumeTotalMinutes.textContent = `${totalMinutes} Menit`;
  ui.resumeScope.textContent = getResumeScopeLabel();
}

function renderHistory() {
  // A card is collapsing right now: leave the list alone until it is out of the
  // DOM, otherwise a snapshot-driven re-render would cut the animation short.
  if (historyRemovalInFlight) {
    return;
  }

  updateHistoryFilterIndicator();
  const filtered = getFilteredHistoryData();
  renderHistoryResume(filtered);

  if (!filtered.length) {
    openSwipeActivityId = null;
    ui.historyList.innerHTML = '<div class="empty-state">Belum ada data sesuai filter.</div>';
    return;
  }

  ui.historyList.innerHTML = filtered
    .map((item) => {
      const startedAt = item.startedAt?.toDate ? item.startedAt.toDate() : new Date(item.startedAt);
      const endedAt = item.endedAt?.toDate ? item.endedAt.toDate() : item.endedAt ? new Date(item.endedAt) : null;
      const workCode = item.workCode || 'HW';
      const durationText = item.durationMinutes ?? 0;
      const displayedUserName = item.userName || 'User';

      return `
        <article class="swipe-item" data-activity-id="${escapeHtml(item.id)}">
          <button class="swipe-delete-action" type="button" data-delete-activity-id="${escapeHtml(item.id)}" aria-label="Hapus aktivitas ${escapeHtml(displayedUserName)}">
            <svg class="trash-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
          </button>
          <div class="feed-card card swipe-content">
            <div class="feed-header">
              <div>
                <h3>${escapeHtml(displayedUserName)}</h3>
                <p>${formatDateTime(startedAt)}${endedAt ? ' - ' + formatDateTime(endedAt) : ''}</p>
              </div>
              <span class="work-badge ${escapeHtml(String(workCode).toLowerCase())}">${escapeHtml(workCode)}</span>
            </div>

            <div class="feed-body">
              <div class="meta-grid">
                <span><strong>Inventaris:</strong> ${escapeHtml(item.inventoryCode || '-')}</span>
                <span><strong>Lokasi:</strong> ${escapeHtml(item.location || '-')}</span>
                <span><strong>Durasi:</strong> ${escapeHtml(durationText)} menit</span>
                <span><strong>Status:</strong> ${item.status === 'ongoing' ? 'Berlangsung' : item.status === 'cancelled' ? 'Dibatalkan' : 'Selesai'}</span>
              </div>
              <p class="remarks">${escapeHtml(item.remarks || 'Tidak ada keterangan.')}</p>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  bindSwipeGestures();
}

const SWIPE_THRESHOLD = 92;
const SWIPE_MAX_OFFSET = 124;

function setSwipePosition(item, position, isDragging = false) {
  const content = item.querySelector('.swipe-content');
  const blob = item.querySelector('.swipe-delete-action');
  const boundedPosition = Math.max(-SWIPE_MAX_OFFSET, Math.min(0, position));
  const progress = Math.min(1, Math.abs(boundedPosition) / SWIPE_THRESHOLD);
  const blobWidth = 34 + progress * 22;
  const blobHeight = 36 + progress * 20;
  const blobRadius = progress >= 1 ? '50%' : `${48 + progress * 8}% ${52 - progress * 8}% ${58 - progress * 10}% ${42 + progress * 10}%`;
  const blobScale = 0.78 + progress * 0.22;
  const iconProgress = Math.max(0, Math.min(1, (progress - 0.55) / 0.45));
  const iconScale = 0.5 + iconProgress * 0.5;

  content.style.transform = `translateX(${boundedPosition}px)`;
  blob.style.setProperty('--blob-width', `${blobWidth}px`);
  blob.style.setProperty('--blob-height', `${blobHeight}px`);
  blob.style.setProperty('--blob-radius', blobRadius);
  blob.style.setProperty('--blob-scale', blobScale.toFixed(3));
  blob.style.setProperty('--blob-progress', progress.toFixed(3));
  blob.style.setProperty('--icon-opacity', iconProgress.toFixed(3));
  blob.style.setProperty('--icon-scale', iconScale.toFixed(3));
  item.classList.toggle('is-open', boundedPosition < 0);
  item.classList.toggle('is-ready', progress >= 1);
  item.classList.toggle('is-dragging', isDragging);
}

function scheduleSwipePosition(item, position) {
  pendingSwipePositions.set(item, position);

  if (pendingSwipeFrames.has(item)) {
    return;
  }

  const frameId = requestAnimationFrame(() => {
    pendingSwipeFrames.delete(item);
    setSwipePosition(item, pendingSwipePositions.get(item), true);
  });

  pendingSwipeFrames.set(item, frameId);
}

function cancelPendingSwipeFrame(item) {
  const frameId = pendingSwipeFrames.get(item);
  if (!frameId) {
    return;
  }

  cancelAnimationFrame(frameId);
  pendingSwipeFrames.delete(item);
}

function settleSwipeItem(item) {
  cancelPendingSwipeFrame(item);

  setSwipePosition(item, -SWIPE_MAX_OFFSET);
  item.classList.add('is-settling');
  window.setTimeout(() => {
    item.classList.remove('is-settling');
  }, 460);
}

function closeSwipeItems(exceptId = null) {
  ui.historyList.querySelectorAll('.swipe-item').forEach((item) => {
    if (item.dataset.activityId !== exceptId) {
      cancelPendingSwipeFrame(item);
      setSwipePosition(item, 0);
    }
  });

  openSwipeActivityId = exceptId;
}

// Delete exit for one Riwayat card: it fades, drifts slightly left and collapses
// (see .swipe-item.is-removing) so the cards below rise smoothly. Resolves once
// the node is really out of the DOM.
function animateHistoryItemRemoval(activityId) {
  const item = ui.historyList.querySelector(`[data-activity-id="${activityId}"]`);

  if (!item) {
    return Promise.resolve();
  }

  historyRemovalInFlight = true;
  cancelPendingSwipeFrame(item);

  const listGap = parseFloat(getComputedStyle(ui.historyList).rowGap) || 0;

  item.style.maxHeight = `${item.offsetHeight}px`;
  void item.offsetHeight;
  item.classList.add('is-removing');

  requestAnimationFrame(() => {
    item.style.maxHeight = '0px';
    item.style.marginBottom = `-${listGap}px`;
  });

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      item.remove();
      historyRemovalInFlight = false;
      resolve();
    };

    item.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'max-height') {
        finish();
      }
    });
    window.setTimeout(finish, EXIT_ANIMATION_FALLBACK_MS);
  });
}

function openDeleteConfirmation(activityId) {
  pendingDeleteActivityId = activityId;
  ui.deleteConfirmModal.classList.remove('hidden');
  ui.deleteConfirmModal.setAttribute('aria-hidden', 'false');
}

function hideDeleteConfirmation(restoreItem = true) {
  const activityId = pendingDeleteActivityId;
  pendingDeleteActivityId = null;
  ui.deleteConfirmModal.classList.add('hidden');
  ui.deleteConfirmModal.setAttribute('aria-hidden', 'true');

  if (restoreItem && activityId) {
    const item = ui.historyList.querySelector(`[data-activity-id="${activityId}"]`);
    if (item) {
      setSwipePosition(item, 0);
    }
  }

  openSwipeActivityId = null;
}

async function handleDeleteActivity() {
  const activityId = pendingDeleteActivityId;

  if (!activityId) {
    hideDeleteConfirmation();
    return;
  }

  ui.deleteConfirmBtn.disabled = true;

  try {
    console.log('[History] Confirmed delete for Firestore document:', activityId);
    await deleteActivity(activityId);

    // Close the dialog first so the user sees the card leave, then let it
    // collapse before the list (and the resume numbers) re-render around it.
    hideDeleteConfirmation(false);
    await animateHistoryItemRemoval(activityId);

    state.activities = state.activities.filter((activity) => activity.id !== activityId);
    if (state.activeActivities.some((activity) => activity.id === activityId)) {
      recomputeActiveActivities();
      renderActiveActivities();
    }

    renderHistory();
    showToast('Aktivitas berhasil dihapus.', 'success');
  } catch (error) {
    console.error('[History] Delete error:', error);
    hideDeleteConfirmation();
    showToast('Gagal menghapus aktivitas. Silakan coba lagi.', 'error');
  } finally {
    ui.deleteConfirmBtn.disabled = false;
  }
}

function bindSwipeGestures() {
  ui.historyList.querySelectorAll('.swipe-item').forEach((item) => {
    const content = item.querySelector('.swipe-content');
    const deleteButton = item.querySelector('.swipe-delete-action');
    let startX = 0;
    let startY = 0;
    let startOffset = 0;
    let isHorizontalSwipe = false;

    item.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startOffset = item.classList.contains('is-open') ? -SWIPE_MAX_OFFSET : 0;
      isHorizontalSwipe = false;
      item.classList.remove('is-settling');
      closeSwipeItems(item.dataset.activityId);
    }, { passive: true });

    item.addEventListener('touchmove', (event) => {
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!isHorizontalSwipe && Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
        isHorizontalSwipe = true;
      }

      if (!isHorizontalSwipe) {
        return;
      }

      event.preventDefault();
      scheduleSwipePosition(item, startOffset + deltaX);
    }, { passive: false });

    item.addEventListener('touchend', (event) => {
      if (!isHorizontalSwipe) {
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const shouldOpen = deltaX <= -SWIPE_THRESHOLD || startOffset < 0 && deltaX < 20;

      cancelPendingSwipeFrame(item);

      if (shouldOpen) {
        settleSwipeItem(item);
        openSwipeActivityId = item.dataset.activityId;
      } else {
        setSwipePosition(item, 0);
        openSwipeActivityId = null;
      }

      event.preventDefault();
    }, { passive: false });

    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      closeSwipeItems(item.dataset.activityId);
      openDeleteConfirmation(item.dataset.activityId);
    });

    content.addEventListener('click', () => {
      if (openSwipeActivityId === item.dataset.activityId) {
        setSwipePosition(item, 0);
        openSwipeActivityId = null;
      }
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDuration(minutes) {
  const totalMinutes = Number(minutes || 0);

  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return '';
  }

  const roundedMinutes = Math.max(0, Math.round(totalMinutes));

  if (roundedMinutes === 1) {
    return '1 Minute';
  }

  return `${roundedMinutes} Minutes`;
}

function getExportCodeValue(item) {
  const legacyValue = item?.kode_pekerjaan ?? item?.workCode ?? item?.work_code ?? '';

  if (Array.isArray(legacyValue)) {
    return legacyValue
      .filter((part) => typeof part === 'string' && part.trim())
      .map((part) => part.trim())
      .join(' & ');
  }

  if (typeof legacyValue === 'string') {
    return legacyValue
      .split('&')
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' & ');
  }

  return '';
}

function getExportRows() {
  return getFilteredHistoryData().map((item) => {
    const startDate = item.startedAt?.toDate ? item.startedAt.toDate() : new Date(item.startedAt);
    // ExcelJS derives the serial from UTC milliseconds, so rebuild the local
    // calendar day at UTC midnight: the cell holds a whole-day serial with no
    // time-of-day part and the Tgl. / Date column shows only DD/MM/YYYY.
    const exportDate = Number.isNaN(startDate.getTime())
      ? null
      : new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
    const durationMinutes = item.durationMinutes ?? null;
    const durationValue = durationMinutes != null ? formatDuration(durationMinutes) : '';
    const remarks = String(item.remarks || '');
    const quality = item.quality || 'Finish';

    return [
      exportDate,
      item.inventoryCode || '',
      getExportCodeValue(item),
      'Bintan / ' + (item.location || ''),
      remarks,
      item.userName || '',
      durationValue,
      quality
    ];
  });
}

function getExportPeriodLabel() {
  // Month-granularity label used for the "Periode" cell and the file name.
  // Anchored on the earliest explicit date bound so an empty result set still
  // reports the period the user asked for.
  const anchorKey = ui.filterDateFrom.value || ui.filterDateTo.value;

  if (anchorKey) {
    const date = new Date(`${anchorKey}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  const filtered = getFilteredHistoryData();
  if (!filtered.length) {
    return '';
  }

  const sortedDates = filtered
    .map((item) => item.startedAt?.toDate ? item.startedAt.toDate() : new Date(item.startedAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);

  if (!sortedDates.length) {
    return '';
  }

  const start = sortedDates[0];
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
}

function getTemplateWorkbookCandidates() {
  const candidates = [
    './templates/DAILY REPORT_Tamplates.xlsx',
  ];

  return [...new Set(candidates)];
}

async function loadTemplateWorkbook() {
  if (!isExcelJSAvailable()) {
    return null;
  }

  for (const templatePath of getTemplateWorkbookCandidates()) {
    try {
      const response = await fetch(templatePath, { cache: 'no-store' });
      if (!response.ok) {
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const workbook = new window.ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      return workbook;
    } catch (error) {
      console.warn('[Export] Template not available at path:', templatePath, error);
    }
  }

  return null;
}

function resolveTemplateWorksheet(workbook) {
  if (!workbook) {
    return null;
  }

  const candidates = ['2026-9', '2026-9 ', '2026-9\t', '2026-9\r'];
  return workbook.getWorksheet(candidates.find((name) => workbook.getWorksheet(name)))
    || workbook.worksheets?.[workbook.worksheets.length - 1]
    || null;
}

function applyExportCellAlignment(cell, columnIndex) {
  const currentAlignment = cell.alignment || {};

  if (columnIndex === 0) {
    cell.alignment = {
      ...currentAlignment,
      horizontal: 'right',
      vertical: currentAlignment.vertical || 'top'
    };
    return;
  }

  if (columnIndex === 2 || columnIndex === 6 || columnIndex === 7) {
    cell.alignment = {
      ...currentAlignment,
      horizontal: 'center',
      vertical: currentAlignment.vertical || 'top'
    };
    return;
  }

  if (columnIndex === 4) {
    cell.alignment = {
      ...currentAlignment,
      wrapText: false,
      horizontal: currentAlignment.horizontal || 'left',
      vertical: currentAlignment.vertical || 'top'
    };
    return;
  }

  cell.alignment = {
    ...currentAlignment,
    vertical: currentAlignment.vertical || 'top'
  };
}

function normalizeExportHeader(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function findExportHeaderColumns(worksheet) {
  const expectedHeaders = {
    date: normalizeExportHeader('Tgl. / Date'),
    inventory: normalizeExportHeader('Kode Inv. (uraian) / Inv. Code ( Description)'),
    code: normalizeExportHeader('Kode / Code'),
    location: normalizeExportHeader('Lokasi / Location'),
    remarks: normalizeExportHeader('Keterangan / Remarks'),
    user: normalizeExportHeader('Pengguna / User'),
    duration: normalizeExportHeader('Durasi / Duration'),
    quality: normalizeExportHeader('Kendali Mutu / Quality Assurance')
  };
  let headerRowNumber = null;
  const columns = {};

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headerRowNumber !== null) {
      return;
    }

    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const header = normalizeExportHeader(cell.text || cell.value);

      Object.entries(expectedHeaders).forEach(([key, expectedHeader]) => {
        if (header === expectedHeader || header.startsWith(`${expectedHeader} `)) {
          columns[key] = columnNumber;
        }
      });
    });

    if (columns.date && columns.code && columns.quality) {
      headerRowNumber = rowNumber;
    }
  });

  if (!headerRowNumber) {
    return null;
  }

  return { headerRowNumber, columns };
}

function snapshotProtectedTemplateColumns(worksheet) {
  const protectedColumns = [];
  const lastRowNumber = worksheet.lastRow?.number || 0;

  for (let rowNumber = 1; rowNumber <= lastRowNumber; rowNumber += 1) {
    for (let columnNumber = 16; columnNumber <= 23; columnNumber += 1) {
      const cell = worksheet.getCell(rowNumber, columnNumber);
      protectedColumns.push({
        rowNumber,
        columnNumber,
        value: cell.value
      });
    }
  }

  return protectedColumns;
}

function summarizeProtectedTemplateColumns(snapshot) {
  return snapshot
    .filter(({ value }) => value !== null && value !== undefined && value !== '')
    .map(({ rowNumber, columnNumber, value }) => ({ rowNumber, columnNumber, value }));
}

function assertProtectedTemplateColumnsIntact(worksheet, snapshot, rowOffset = 0) {
  const changedCells = snapshot.filter(({ rowNumber, columnNumber, value }) => {
    const currentValue = worksheet.getCell(rowNumber + rowOffset, columnNumber).value;
    return JSON.stringify(currentValue) !== JSON.stringify(value);
  });

  if (changedCells.length) {
    throw new Error(`Template columns 16-23 were modified (${changedCells.length} cells).`);
  }

  console.debug('[Export] Protected template columns 16-23 preserved', {
    worksheet: worksheet.name,
    checkedCells: snapshot.length
  });
}

function applyFinalExportAlignment(worksheet, rowCount) {
  const headerInfo = findExportHeaderColumns(worksheet);

  if (!headerInfo || !rowCount) {
    console.warn('[Export] Final alignment skipped: export headers or data rows not found.');
    return false;
  }

  const firstDataRow = headerInfo.headerRowNumber + 1;
  const lastDataRow = firstDataRow + rowCount - 1;
  const alignmentByColumn = [
    [headerInfo.columns.date, 'right'],
    [headerInfo.columns.code, 'center'],
    [headerInfo.columns.quality, 'center']
  ];

  for (let rowNumber = firstDataRow; rowNumber <= lastDataRow; rowNumber += 1) {
    alignmentByColumn.forEach(([columnNumber, horizontal]) => {
      const cell = worksheet.getCell(rowNumber, columnNumber);
      cell.alignment = {
        horizontal,
        vertical: 'top'
      };
      if (columnNumber === headerInfo.columns.date) {
        cell.numFmt = 'dd/mm/yyyy';
      }
    });

    const remarksCell = worksheet.getCell(rowNumber, headerInfo.columns.remarks);
    remarksCell.alignment = {
      ...remarksCell.alignment,
      wrapText: false,
      vertical: 'top'
    };

    [
      headerInfo.columns.inventory,
      headerInfo.columns.location,
      headerInfo.columns.user,
      headerInfo.columns.duration
    ].forEach((columnNumber) => {
      const cell = worksheet.getCell(rowNumber, columnNumber);
      cell.alignment = {
        ...cell.alignment,
        vertical: 'top'
      };
    });
  }

  const debugRows = Math.min(3, rowCount);
  console.debug('[Export] Final alignment applied', {
    worksheet: worksheet.name,
    headerRowNumber: headerInfo.headerRowNumber,
    firstDataRow,
    lastDataRow,
    columns: headerInfo.columns,
    sample: Array.from({ length: debugRows }, (_, index) => {
      const rowNumber = firstDataRow + index;
      return {
        rowNumber,
        date: worksheet.getCell(rowNumber, headerInfo.columns.date).alignment,
        dateValue: worksheet.getCell(rowNumber, headerInfo.columns.date).value,
        dateNumFmt: worksheet.getCell(rowNumber, headerInfo.columns.date).numFmt,
        code: worksheet.getCell(rowNumber, headerInfo.columns.code).alignment,
        quality: worksheet.getCell(rowNumber, headerInfo.columns.quality).alignment
      };
    })
  });

  return true;
}

function cellHasExportValue(cell) {
  return cell.value !== null && cell.value !== undefined && cell.value !== '';
}

function findTemplateFooterStartRow(worksheet, firstDataRow, columns) {
  const lastRowNumber = worksheet.lastRow?.number || firstDataRow;

  for (let rowNumber = firstDataRow; rowNumber <= lastRowNumber; rowNumber += 1) {
    const dateCell = worksheet.getCell(rowNumber, columns.date);
    const hasOtherTemplateContent = [
      columns.inventory,
      columns.code,
      columns.location,
      columns.remarks,
      columns.user,
      columns.duration,
      columns.quality
    ].some((columnNumber) => cellHasExportValue(worksheet.getCell(rowNumber, columnNumber)));

    if (!cellHasExportValue(dateCell) && hasOtherTemplateContent) {
      return rowNumber;
    }
  }

  return lastRowNumber + 1;
}

function snapshotTemplateRange(worksheet, startRow, endRow) {
  const snapshot = [];
  const lastColumnNumber = Math.max(worksheet.columnCount || 0, 23);

  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    for (let columnNumber = 1; columnNumber <= lastColumnNumber; columnNumber += 1) {
      snapshot.push({ rowNumber, columnNumber, value: worksheet.getCell(rowNumber, columnNumber).value });
    }
  }

  return snapshot;
}

function assertTemplateRangeIntact(worksheet, snapshot, rowOffset = 0) {
  const changedCells = snapshot.filter(({ rowNumber, columnNumber, value }) => {
    const currentValue = worksheet.getCell(rowNumber + rowOffset, columnNumber).value;
    return JSON.stringify(currentValue) !== JSON.stringify(value);
  });

  if (changedCells.length) {
    throw new Error(`Template footer changed (${changedCells.length} cells).`);
  }
}

function assertActivityBufferRowsEmpty(worksheet, emptyRows, dataColumns) {
  const populatedCells = emptyRows.flatMap((rowNumber) => dataColumns
    .map((columnNumber) => ({ rowNumber, columnNumber, value: worksheet.getCell(rowNumber, columnNumber).value }))
    .filter(({ value }) => value !== null && value !== undefined && value !== ''));

  if (populatedCells.length) {
    throw new Error(`Activity buffer rows are not empty (${populatedCells.length} cells).`);
  }
}

function populateTemplateWorksheet(worksheet, rows) {
  if (!worksheet) {
    return false;
  }

  const headerInfo = findExportHeaderColumns(worksheet);
  const requiredColumns = ['date', 'inventory', 'code', 'location', 'remarks', 'user', 'duration', 'quality'];

  if (!headerInfo || requiredColumns.some((key) => !headerInfo.columns[key])) {
    console.error('[Export] Template data headers are incomplete.', {
      worksheet: worksheet.name,
      columns: headerInfo?.columns || null
    });
    return false;
  }

  const columns = headerInfo.columns;
  // Activity data always starts on the first row after the header (row 11 in the
  // current template) and grows vertically, one row per activity: B11, B12, B13...
  const firstDataRow = headerInfo.headerRowNumber + 1;
  // Row where the protected template block (Tgl./Note/signatures) ACTUALLY begins
  // in the file - detected from the template, never hard-coded.
  const footerStartRow = findTemplateFooterStartRow(worksheet, firstDataRow, columns);
  const bufferRowCount = 2;
  const availableRows = Math.max(0, footerStartRow - firstDataRow);
  // Rows that must fit above the protected block: every activity + 2 buffer rows.
  // Whatever does not fit is INSERTED (not overwritten) just above the footer.
  const insertedRows = Math.max(0, rows.length + bufferRowCount - availableRows);

  // Capture a pristine activity row's full styling so inserted rows and the two
  // buffer rows keep the template grid (border/fill/font/alignment/number format)
  // instead of rendering bare. Column range covers the table plus the styled M/N.
  const maxColumn = Math.max(worksheet.columnCount || 0, 14);
  const donorRow = worksheet.getRow(firstDataRow);
  const donorHeight = donorRow.height || 15;
  const donorStyles = {};
  for (let columnNumber = 1; columnNumber <= maxColumn; columnNumber += 1) {
    donorStyles[columnNumber] = { ...donorRow.getCell(columnNumber).style };
  }

  // Insert the extra rows above the protected block so the whole footer shifts down
  // intact (values, formulas, styles, merges, row heights, columns 16-23). The
  // worksheet is never cleared or rebuilt.
  if (insertedRows > 0) {
    worksheet.spliceRows(footerStartRow, 0, ...Array.from({ length: insertedRows }, () => []));
  }

  // Re-apply the activity-row styling across the whole activity + buffer region so
  // original, inserted and buffer rows all share the same standard grid and height.
  const activityRegionEndRow = footerStartRow + insertedRows - 1;
  for (let rowNumber = firstDataRow; rowNumber <= activityRegionEndRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = donorHeight;
    for (let columnNumber = 1; columnNumber <= maxColumn; columnNumber += 1) {
      row.getCell(columnNumber).style = { ...donorStyles[columnNumber] };
    }
  }

  // Write activity values, one row each, starting at firstDataRow (B11 downward).
  rows.forEach((record, index) => {
    const targetRow = firstDataRow + index;
    const valuesByHeader = {
      date: record[0],
      inventory: record[1],
      code: record[2],
      location: record[3],
      remarks: record[4],
      user: record[5],
      duration: record[6],
      quality: record[7]
    };

    requiredColumns.forEach((key) => {
      worksheet.getCell(targetRow, columns[key]).value = valuesByHeader[key];
    });

    // Remarks stay on a single line: no wrap text, no dynamic row height.
    const remarksCell = worksheet.getCell(targetRow, columns.remarks);
    remarksCell.alignment = { ...(remarksCell.alignment || {}), wrapText: false, vertical: 'top' };
  });

  // Exactly two empty buffer rows after the last activity: values cleared, but the
  // formatting applied above (border/fill/font/alignment/height) is preserved.
  const lastDataRow = firstDataRow + rows.length - 1;
  const emptyRows = [lastDataRow + 1, lastDataRow + 2];
  const dataColumns = requiredColumns.map((key) => columns[key]);
  emptyRows.forEach((rowNumber) => {
    dataColumns.forEach((columnNumber) => {
      worksheet.getCell(rowNumber, columnNumber).value = null;
    });
  });

  console.log('[Export] Application data written to template', {
    exportDataCount: rows.length,
    worksheet: worksheet.name,
    firstDataRow,
    lastDataRow,
    footerStartRow: footerStartRow + insertedRows,
    insertedRows,
    emptyRows
  });

  return {
    firstDataRow,
    lastDataRow,
    emptyRows,
    footerStartRow: footerStartRow + insertedRows,
    insertedRows
  };
}

function setupNewWorksheet(worksheet, rows) {
  const headers = [
    'Tgl. / Date',
    'Kode Inv. (uraian) / Inv. Code ( Description)',
    'Kode / Code',
    'Lokasi / Location',
    'Keterangan / Remarks',
    'Pengguna / User',
    'Durasi / Duration',
    'Kendali Mutu / Quality Assurance'
  ];

  worksheet.mergeCells('A1:H1');
  worksheet.mergeCells('A2:H2');
  worksheet.mergeCells('A4:H4');

  worksheet.getCell('A1').value = 'PT MEINDO ELANG INDAH';
  worksheet.getCell('A1').font = { bold: true, size: 14, name: 'Arial' };
  worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.getCell('A2').value = 'AKTIVITAS-AKTIVITAS IT / IT ACTIVITIES';
  worksheet.getCell('A2').font = { bold: true, size: 12, name: 'Arial' };
  worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.getCell('A4').value = `Nama / Name : ${state.currentUser?.displayName || 'User'}`;
  worksheet.getCell('A4').font = { bold: true, size: 10, name: 'Arial' };

  const periodLabel = getExportPeriodLabel();
  worksheet.getCell('A5').value = `Periode : ${periodLabel || 'Semua'}`;
  worksheet.getCell('A5').font = { bold: true, size: 10, name: 'Arial' };

  worksheet.getRow(1).height = 28;
  worksheet.getRow(2).height = 28;
  worksheet.getRow(5).height = 20;

  const headerRowIndex = 7;
  worksheet.getRow(headerRowIndex).values = headers;
  worksheet.getRow(headerRowIndex).height = 24;

  const columnWidths = [15, 22, 18, 22, 42, 18, 14, 20];
  worksheet.columns = columnWidths.map((width, index) => ({
    width,
    key: String.fromCharCode(65 + index),
    style: { font: { name: 'Arial', size: 10 } }
  }));

  const headerCellStyle = {
    font: { bold: true, name: 'Arial', size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      top: { style: 'thick', color: { argb: 'FF000000' } },
      left: { style: 'thick', color: { argb: 'FF000000' } },
      right: { style: 'thick', color: { argb: 'FF000000' } },
      bottom: { style: 'thick', color: { argb: 'FF000000' } }
    }
  };

  headers.forEach((_, index) => {
    const cell = worksheet.getCell(headerRowIndex, index + 1);
    Object.assign(cell, { style: headerCellStyle });
  });

  const tableRows = rows.map((record) => ({
    values: record,
    height: 15
  }));

  const firstDataRow = 8;

  tableRows.forEach((rowData, index) => {
    const rowIndex = headerRowIndex + index + 1;
    const row = worksheet.getRow(rowIndex);
    row.values = rowData.values;
    row.height = rowData.height;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const isDate = colNumber === 1;
      const isCode = colNumber === 3;
      const isDuration = colNumber === 7;
      const isQuality = colNumber === 8;
      const horizontal = isDate ? 'right' : isCode || isDuration || isQuality ? 'center' : 'left';

      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
      cell.alignment = {
        vertical: 'top',
        horizontal,
        wrapText: false,
        indent: 0
      };
      cell.border = {
        top: { style: 'hair', color: { argb: 'FF6B7280' } },
        left: { style: colNumber === 1 ? 'thick' : 'hair', color: { argb: 'FF000000' } },
        right: { style: colNumber === 8 ? 'thick' : 'hair', color: { argb: 'FF000000' } },
        bottom: { style: 'hair', color: { argb: 'FF6B7280' } }
      };

    });
  });

  const blankStartRow = headerRowIndex + tableRows.length + 1;
  for (let i = 0; i < 2; i += 1) {
    const rowIndex = blankStartRow + i;
    const row = worksheet.getRow(rowIndex);
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        top: { style: 'hair', color: { argb: 'FF6B7280' } },
        left: { style: colNumber === 1 ? 'thick' : 'hair', color: { argb: 'FF000000' } },
        right: { style: colNumber === 8 ? 'thick' : 'hair', color: { argb: 'FF000000' } },
        bottom: { style: colNumber === 8 ? 'thick' : 'hair', color: { argb: 'FF000000' } }
      };
    });
  }

  worksheet.getRow(blankStartRow + 1).height = 20;
  worksheet.getRow(1).border = { top: { style: 'thick' }, left: { style: 'thick' }, right: { style: 'thick' }, bottom: { style: 'thick' } };
  worksheet.getCell('A1').border = { top: 'thick', left: 'thick', right: 'thick', bottom: 'thick' };

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber >= headerRowIndex && rowNumber <= blankStartRow + 1) {
      row.alignment = row.alignment || {};
      row.alignment.vertical = 'top';
    }
  });
}

async function exportExcel() {
  if (!state.currentUser) {
    showToast('Silakan login terlebih dahulu', 'error');
    return;
  }

  if (!isExcelJSAvailable()) {
    try {
      await loadExcelJS();
    } catch (error) {
      console.error('[Export] ExcelJS library unavailable:', error);
      showToast('Library ExcelJS belum tersedia. Silakan refresh halaman atau cek koneksi internet.', 'error');
      return;
    }
  }

  const rows = getExportRows();

  if (!rows.length) {
    showToast('Tidak ada data riwayat untuk diekspor.', 'warning');
    return;
  }

  try {
    const workbook = await loadTemplateWorkbook();
    if (!workbook) {
      throw new Error('Template export tidak dapat dimuat.');
    }

    const worksheet = resolveTemplateWorksheet(workbook);
    if (!worksheet) {
      throw new Error('Worksheet template export tidak ditemukan.');
    }

    const protectedTemplateColumns = snapshotProtectedTemplateColumns(worksheet);
    const templateHeaderInfo = findExportHeaderColumns(worksheet);
    const templateFooterStart = templateHeaderInfo
      ? findTemplateFooterStartRow(worksheet, templateHeaderInfo.headerRowNumber + 1, templateHeaderInfo.columns)
      : null;
    const templateFooterEnd = worksheet.lastRow?.number || templateFooterStart;
    const templateFooterSnapshot = templateFooterStart
      ? snapshotTemplateRange(worksheet, templateFooterStart, templateFooterEnd)
      : [];
    console.log('Template col 16-23 before:', summarizeProtectedTemplateColumns(protectedTemplateColumns));
    console.log('Template footer before:', templateFooterSnapshot.filter(({ value }) => value !== null && value !== undefined && value !== ''));
    const hasTemplateData = populateTemplateWorksheet(worksheet, rows);
    if (!hasTemplateData) {
      throw new Error('Data History gagal ditulis ke worksheet template.');
    }

    const alignmentApplied = applyFinalExportAlignment(worksheet, rows.length);
    if (!alignmentApplied) {
      throw new Error('Kolom alignment export tidak ditemukan pada template.');
    }

    assertProtectedTemplateColumnsIntact(worksheet, protectedTemplateColumns, hasTemplateData.insertedRows);
    assertTemplateRangeIntact(worksheet, templateFooterSnapshot, hasTemplateData.insertedRows);
    assertActivityBufferRowsEmpty(
      worksheet,
      hasTemplateData.emptyRows,
      ['date', 'inventory', 'code', 'location', 'remarks', 'user', 'duration', 'quality']
        .map((key) => templateHeaderInfo.columns[key])
    );
    console.log('Template col 16-23 after:', summarizeProtectedTemplateColumns(snapshotProtectedTemplateColumns(worksheet)));
    console.log('Template footer after:', {
      footerStartRow: hasTemplateData.footerStartRow,
      insertedRows: hasTemplateData.insertedRows
    });

    workbook.creator = state.currentUser.displayName || 'ActLog';
    workbook.lastModifiedBy = state.currentUser.displayName || 'ActLog';
    workbook.modified = new Date();

    console.debug('[Export] Downloading populated template workbook', {
      worksheet: worksheet.name,
      exportDataCount: rows.length
    });

    const periodTerm = getExportPeriodLabel();
    const fileName = periodTerm ? `DAILY REPORT - ${periodTerm}.xlsx` : 'DAILY REPORT.xlsx';
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    showToast('Report Excel berhasil diunduh.', 'success');
  } catch (error) {
    console.error('[Export] Excel export failed:', error);
    showToast('Gagal membuat report Excel', 'error');
  }
}

function formatDateTime(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

async function handleStartActivity() {
  if (!state.currentUser) {
    showToast('Silakan login terlebih dahulu', 'error');
    return;
  }

  ui.startActivityBtn.disabled = true;
  ui.addActivityFab.disabled = true;

  try {
    console.debug('[Activity] Preparing data...');
    const now = Timestamp.now();
    // Each press creates its own Firestore document with its own id, so any
    // number of activities can run at the same time without overwriting one
    // another. Location and work code start empty: every new activity is a
    // fresh form and the user must pick both before the activity can be saved
    // or ended.
    const newActivity = await createActivity({
      userId: state.currentUser.uid,
      inventoryCode: '',
      userName: '',
      location: '',
      workCode: '',
      remarks: '',
      startedAt: now
    });

    console.debug('[Activity] Save successful', { id: newActivity.id });

    // Optimistic add so the new card shows immediately; the Firestore listener
    // reconciles by document id, so this never duplicates the card.
    state.activities = [newActivity, ...state.activities.filter((item) => item.id !== newActivity.id)];
    recomputeActiveActivities();
    renderActiveActivities();
    focusNewActivityCard(newActivity.id);

    showToast('Aktivitas dimulai', 'success');
  } catch (error) {
    console.error('[Activity] Save failed:', error);
    showToast('Gagal memulai aktivitas', 'error');
  } finally {
    ui.startActivityBtn.disabled = false;
    ui.addActivityFab.disabled = false;
  }
}

async function handleSaveActivity(event, activityId) {
  event.preventDefault();

  const card = getCard(activityId);
  const activity = state.activeActivities.find((item) => item.id === activityId);

  if (!card || !activity) {
    showToast('Tidak ada aktivitas aktif', 'warning');
    return;
  }

  try {
    const payload = getCardFormPayload(card);

    console.debug('[Activity] Saving to Firestore...', {
      activityId,
      fields: Object.keys(payload)
    });

    await updateActivity(activityId, {
      inventoryCode: payload.inventoryCode,
      userName: payload.userName,
      location: payload.location,
      workCode: payload.workCode,
      remarks: payload.remarks
    });

    console.debug('[Activity] Save successful', {
      activityId,
      workCode: payload.workCode
    });

    // Write succeeded: this card is now clean and its button confirms the save.
    // On failure the catch below leaves the label as "Simpan Detail".
    clearCardDirty(activityId);
    const saveBtn = card.querySelector('.save-activity-btn');
    const saveBtnText = saveBtn?.querySelector('.save-activity-btn-text');
    if (saveBtnText) {
      saveBtnText.textContent = 'Detail tersimpan';
    }

    showToast('Detail service berhasil disimpan.', 'success');
  } catch (error) {
    console.error('[Activity] Save failed:', error);
    const saveBtn = card.querySelector('.save-activity-btn');
    const saveBtnText = saveBtn?.querySelector('.save-activity-btn-text');
    if (saveBtnText) {
      saveBtnText.textContent = 'Simpan Detail';
    }
    const knownMessages = [
      'Pilih lokasi terlebih dahulu.',
      'Pilih minimal satu kode pengerjaan.',
      'Isi lokasi manual jika memilih OTHER LOCATION',
      'Lokasi sudah ada di daftar lokasi'
    ];
    if (error && knownMessages.includes(error.message)) {
      showToast(error.message, 'error');
      return;
    }
    showToast('Detail service gagal disimpan.', 'error');
  }
}

function showConfirmModal(activityId) {
  pendingEndActivityId = activityId;
  ui.confirmModal.classList.remove('hidden');
  ui.confirmModal.setAttribute('aria-hidden', 'false');
}

function hideConfirmModal() {
  pendingEndActivityId = null;
  ui.confirmModal.classList.add('hidden');
  ui.confirmModal.setAttribute('aria-hidden', 'true');
}

async function handleEndActivity() {
  const activityId = pendingEndActivityId;
  hideConfirmModal();

  if (!activityId) {
    return;
  }

  const card = getCard(activityId);
  const activity = state.activeActivities.find((item) => item.id === activityId);

  if (!card || !activity) {
    showToast('Tidak ada aktivitas aktif', 'warning');
    return;
  }

  if (!validateCardEndFields(card)) {
    return;
  }

  try {
    const payload = getCardFormPayload(card);

    await updateActivity(activityId, {
      inventoryCode: payload.inventoryCode,
      userName: payload.userName,
      location: payload.location,
      workCode: payload.workCode,
      remarks: payload.remarks
    });

    console.debug('[Activity] Confirm end activity', {
      activityId,
      startedAt: activity.startedAt
    });

    // Ends only this document; other active activities are untouched.
    await finishActivity(activityId, activity.startedAt);
    console.log('[Activity] Firestore save successful');
    showToast('Service berhasil diakhiri.', 'success');
  } catch (error) {
    console.error('[Activity] Save error:', error);
    console.error('[Activity] Finish failed:', error);
    const knownMessages = [
      'Pilih lokasi terlebih dahulu.',
      'Pilih minimal satu kode pengerjaan.',
      'Isi lokasi manual jika memilih OTHER LOCATION',
      'Lokasi sudah ada di daftar lokasi'
    ];
    if (error && knownMessages.includes(error.message)) {
      showToast(error.message, 'error');
      return;
    }
    showToast('Gagal mengakhiri service. Silakan coba lagi.', 'error');
  }
}

function showCancelConfirmation(activityId) {
  const activity = state.activeActivities.find((item) => item.id === activityId);

  if (!activity) {
    showToast('Tidak ada aktivitas aktif', 'warning');
    return;
  }

  pendingCancelActivityId = activityId;
  ui.cancelConfirmModal.classList.remove('hidden');
  ui.cancelConfirmModal.setAttribute('aria-hidden', 'false');
}

function hideCancelConfirmation() {
  pendingCancelActivityId = null;
  ui.cancelConfirmModal.classList.add('hidden');
  ui.cancelConfirmModal.setAttribute('aria-hidden', 'true');
}

async function handleCancelActivity() {
  const activityId = pendingCancelActivityId;
  hideCancelConfirmation();

  if (!activityId) {
    return;
  }

  const activity = state.activities.find((item) => item.id === activityId);

  if (!activity) {
    showToast('Tidak ada aktivitas aktif', 'warning');
    return;
  }

  ui.cancelConfirmBtn.disabled = true;

  try {
    // Cancels only this document; the listener then drops just this card.
    // Cancelled activities never enter Riwayat (status !== 'completed').
    await cancelActivity(activityId, activity.startedAt);
    showToast('Aktivitas berhasil dibatalkan.', 'success');
  } catch (error) {
    console.error('[Activity] Cancel failed:', error);
    showToast('Gagal membatalkan aktivitas. Silakan coba lagi.', 'error');
  } finally {
    ui.cancelConfirmBtn.disabled = false;
  }
}

async function onLogin(event) {
  event.preventDefault();
  const email = document.querySelector('#login-email').value.trim();
  const password = document.querySelector('#login-password').value;

  if (!email || !password) {
    showToast('Email dan password wajib diisi', 'error');
    return;
  }

  try {
    await loginUser(email, password);
    showToast('Login berhasil', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Login gagal', 'error');
  }
}

async function onRegister(event) {
  event.preventDefault();
  const email = document.querySelector('#register-email').value.trim();
  const password = document.querySelector('#register-password').value;

  if (!email || !password) {
    showToast('Email dan password wajib diisi', 'error');
    return;
  }

  if (password.length < 6) {
    showToast('Password minimal 6 karakter', 'warning');
    return;
  }

  try {
    await registerUser(email, password);
    showToast('Pendaftaran berhasil', 'success');
    ui.registerForm.reset();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Pendaftaran gagal', 'error');
  }
}

async function onForgotPassword() {
  const email = document.querySelector('#login-email').value.trim() || document.querySelector('#register-email').value.trim();

  if (!email) {
    showToast('Masukkan email terlebih dahulu', 'warning');
    return;
  }

  try {
    await resetPassword(email);
    showToast('Link reset password telah dikirim', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Gagal mengirim email reset', 'error');
  }
}

function showLogoutConfirmation() {
  ui.logoutConfirmModal.classList.remove('hidden');
  ui.logoutConfirmModal.setAttribute('aria-hidden', 'false');
}

function hideLogoutConfirmation() {
  ui.logoutConfirmModal.classList.add('hidden');
  ui.logoutConfirmModal.setAttribute('aria-hidden', 'true');
}

async function handleLogout() {
  hideLogoutConfirmation();

  try {
    await logoutUser();
    showToast('Berhasil logout', 'success');
  } catch (error) {
    console.error(error);
    showToast('Gagal logout', 'error');
  }
}

function stopActivityListener() {
  state.activityListenerGeneration += 1;

  if (state.unsubscribeActivities) {
    console.debug('[Activity] Stopping Firestore listener', {
      generation: state.activityListenerGeneration
    });
    state.unsubscribeActivities();
    state.unsubscribeActivities = null;
  }
}

function handleAuthStateChange(user) {
  state.currentUser = user;
  state.authReady = true;
  renderUserHeader();
  stopActivityListener();

  if (state.currentUser) {
    setActivityUiLoading(true);
    const listenerGeneration = state.activityListenerGeneration;
    console.debug('[Activity] Auth ready; creating Firestore listener', {
      uid: state.currentUser.uid,
      generation: listenerGeneration
    });
    state.unsubscribeActivities = subscribeToActivities(
      state.currentUser.uid,
      (items) => {
        if (listenerGeneration !== state.activityListenerGeneration) {
          return;
        }
        state.activities = items;
        recomputeActiveActivities();
        renderActiveActivities();
        renderHistory();
        setActivityUiLoading(false);
      },
      (error) => {
        if (listenerGeneration !== state.activityListenerGeneration) {
          return;
        }
        console.error('[Activity] Firestore listener rejected', {
          uid: state.currentUser?.uid || null,
          code: error.code
        });
        state.activities = [];
        renderHistory();
        renderActivityLoadError();
      }
    );

    const persistedView = localStorage.getItem('actlog-current-view') || 'dashboard';
    setView(persistedView);
    ui.loginForm.reset();
    ui.registerForm.reset();
  } else {
    setActivityUiLoading(false);
    state.activities = [];
    state.activeActivities = [];
    dirtyActivityCards.clear();
    stopTimerLoop();
    ui.activeActivitiesList.replaceChildren();
    renderHistory();
    localStorage.removeItem('actlog-current-view');
    setView('auth');
  }
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextView = button.dataset.view;

      if (!state.currentUser && nextView !== 'auth') {
        setView('auth');
        showToast('Silakan masuk sebelum melanjutkan', 'warning');
        return;
      }

      setView(nextView);
    });
  });

  // The media-query guard sits in the listener itself so desktop scroll events
  // never even schedule a frame. rAF coalesces the burst of events a mobile
  // flick produces into one state evaluation per painted frame.
  window.addEventListener('scroll', () => {
    if (bottomNavFrameQueued || !bottomNavMedia.matches) {
      return;
    }
    bottomNavFrameQueued = true;
    requestAnimationFrame(updateBottomNavOnScroll);
  }, { passive: true });

  window.addEventListener('resize', syncBottomNavWithViewport, { passive: true });

  document.querySelector('.tab-btn[data-auth-tab="login"]').addEventListener('click', () => {
    document.querySelector('#login-form').classList.remove('hidden');
    document.querySelector('#register-form').classList.add('hidden');
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.authTab === 'login'));
  });

  document.querySelector('.tab-btn[data-auth-tab="register"]').addEventListener('click', () => {
    document.querySelector('#register-form').classList.remove('hidden');
    document.querySelector('#login-form').classList.add('hidden');
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.authTab === 'register'));
  });

  ui.loginForm.addEventListener('submit', onLogin);
  ui.registerForm.addEventListener('submit', onRegister);
  ui.forgotPasswordBtn.addEventListener('click', onForgotPassword);
  ui.logoutBtn.addEventListener('click', showLogoutConfirmation);
  ui.logoutConfirmBtn.addEventListener('click', handleLogout);
  ui.logoutCancelBtn.addEventListener('click', hideLogoutConfirmation);
  ui.logoutConfirmModal.addEventListener('click', (event) => {
    if (event.target === ui.logoutConfirmModal) {
      hideLogoutConfirmation();
    }
  });
  ui.editNameBtn.addEventListener('click', showEditNameModal);
  ui.editNameForm.addEventListener('submit', handleEditNameSubmit);
  ui.editNameCancelBtn.addEventListener('click', hideEditNameModal);
  ui.startActivityBtn.addEventListener('click', handleStartActivity);
  ui.addActivityFab.addEventListener('click', handleStartActivity);
  ui.confirmEndBtn.addEventListener('click', handleEndActivity);
  ui.confirmCancelBtn.addEventListener('click', hideConfirmModal);
  ui.cancelConfirmBtn.addEventListener('click', handleCancelActivity);
  ui.cancelDismissBtn.addEventListener('click', hideCancelConfirmation);

  ui.searchInput.addEventListener('input', renderHistory);
  ui.filterLocation.addEventListener('change', renderHistory);
  ui.filterWorkCode.addEventListener('change', renderHistory);
  ui.filterDateFrom.addEventListener('change', renderHistory);
  ui.filterDateTo.addEventListener('change', renderHistory);
  ui.filterStatus.addEventListener('change', renderHistory);

  ui.historyFilterToggle.addEventListener('click', () => {
    setHistoryFilterPanelOpen(ui.historyFilterPanel.hidden);
  });
  ui.historyFilterClose.addEventListener('click', () => {
    setHistoryFilterPanelOpen(false);
  });
  ui.historyExportBtn.addEventListener('click', () => {
    exportExcel();
  });
  ui.historyFilterApply.addEventListener('click', () => {
    renderHistory();
    setHistoryFilterPanelOpen(false);
  });
  // Reset clears the inputs only; the panel stays open so a new range can be
  // picked straight away without reopening it.
  ui.historyFilterReset.addEventListener('click', () => {
    ui.searchInput.value = '';
    ui.filterLocation.value = 'all';
    ui.filterWorkCode.value = 'all';
    ui.filterDateFrom.value = '';
    ui.filterDateTo.value = '';
    ui.filterStatus.value = 'all';
    renderHistory();
  });

  document.addEventListener('click', (event) => {
    if (ui.historyFilterPanel.hidden || ui.historyToolbar.contains(event.target)) {
      return;
    }
    setHistoryFilterPanelOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !ui.historyFilterPanel.hidden) {
      setHistoryFilterPanelOpen(false);
    }
  });

  ui.confirmModal.addEventListener('click', (event) => {
    if (event.target === ui.confirmModal) {
      hideConfirmModal();
    }
  });
  ui.deleteConfirmBtn.addEventListener('click', handleDeleteActivity);
  ui.deleteCancelBtn.addEventListener('click', () => hideDeleteConfirmation());
  ui.deleteConfirmModal.addEventListener('click', (event) => {
    if (event.target === ui.deleteConfirmModal) {
      hideDeleteConfirmation();
    }
  });
  ui.cancelConfirmModal.addEventListener('click', (event) => {
    if (event.target === ui.cancelConfirmModal) {
      hideCancelConfirmation();
    }
  });
  ui.editNameModal.addEventListener('click', (event) => {
    if (event.target === ui.editNameModal) {
      hideEditNameModal();
    }
  });
  ui.editNameInput.addEventListener('input', (event) => {
    event.target.classList.remove('field-invalid');
    applyTitleCaseInput(event.target);
  });
  ui.editNameInput.addEventListener('blur', () => {
    ui.editNameInput.value = toTitleCase(ui.editNameInput.value || '');
  });
}

function initializeApp() {
  initSelectOptions();
  bindEvents();
  renderUserHeader();
  setView('loading');
  subscribeToAuth(handleAuthStateChange);

  if ('serviceWorker' in navigator && (window.isSecureContext || window.location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then(() => console.debug('[PWA] Service worker registered'))
      .catch((error) => console.error('[PWA] Service worker registration failed:', error));
  }
}

initializeApp();
