import { WORK_CODES, LOCATION_OPTIONS } from './config.js';
import { auth, loginUser, logoutUser, registerUser, resetPassword, subscribeToAuth, updateCurrentUserDisplayName } from './auth.js';
import { cancelActivity, createActivity, deleteActivity, finishActivity, subscribeToActivities, updateActivity } from './firestore.js';
import { Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const state = {
  currentUser: null,
  activeActivity: null,
  activities: [],
  unsubscribeActivities: null,
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
  startActivityBtn: document.querySelector('#start-activity-btn'),
  quickActions: document.querySelector('.quick-actions'),
  activeActivityCard: document.querySelector('#active-activity-card'),
  emptyActiveState: document.querySelector('#empty-active-state'),
  statusBadge: document.querySelector('#status-badge'),
  activityTimer: document.querySelector('#activity-timer'),
  inventoryCode: document.querySelector('#inventory-code'),
  userName: document.querySelector('#user-name'),
  activityLocation: document.querySelector('#activity-location'),
  activityWorkCode: document.querySelector('#activity-work-code'),
  workCodeOptions: document.querySelector('#work-code-options'),
  activityRemarks: document.querySelector('#activity-remarks'),
  customLocationWrap: document.querySelector('#custom-location-wrap'),
  customLocationInput: document.querySelector('#custom-location-input'),
  endActivityBtn: document.querySelector('#end-activity-btn'),
  activityForm: document.querySelector('#activity-form'),
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
  filterDate: document.querySelector('#filter-date'),
  filterStatus: document.querySelector('#filter-status'),
  historyFilterToggle: document.querySelector('#history-filter-toggle'),
  historyFilterPanel: document.querySelector('#history-filter-panel'),
  historyFilterReset: document.querySelector('#history-filter-reset'),
  historyFilterApply: document.querySelector('#history-filter-apply'),
  filterActiveIndicator: document.querySelector('.filter-active-indicator'),
  historyList: document.querySelector('#history-list'),
  toast: document.querySelector('#toast'),
  confirmModal: document.querySelector('#confirm-modal'),
  confirmEndBtn: document.querySelector('#confirm-end'),
  confirmCancelBtn: document.querySelector('#confirm-cancel'),
  cancelActivityControl: document.querySelector('#cancel-activity-control'),
  cancelActivityBtn: document.querySelector('#cancel-activity-btn'),
  cancelConfirmModal: document.querySelector('#cancel-confirm-modal'),
  cancelConfirmBtn: document.querySelector('#cancel-activity-confirm'),
  cancelDismissBtn: document.querySelector('#cancel-activity-dismiss'),
  deleteConfirmModal: document.querySelector('#delete-confirm-modal'),
  deleteConfirmBtn: document.querySelector('#delete-confirm'),
  deleteCancelBtn: document.querySelector('#delete-cancel')
};

let activeTimerLoop = null;
let openSwipeActivityId = null;
let pendingDeleteActivityId = null;
const pendingSwipeFrames = new WeakMap();
const pendingSwipePositions = new WeakMap();

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
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
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
}

function initSelectOptions() {
  const buildOptions = (arr, placeholderText) => {
    return arr
      .map((item) => {
        const value = typeof item === 'string' ? item : item.code;
        const label = typeof item === 'string' ? item : item.label || item.code;
        return `<option value="${value}">${label}</option>`;
      })
      .join('');
  };

  ui.activityLocation.innerHTML = buildOptions(LOCATION_OPTIONS, 'Pilih lokasi');
  ui.filterLocation.innerHTML = '<option value="all">Semua Lokasi</option>' + buildOptions(LOCATION_OPTIONS, 'Pilih lokasi');
  ui.filterWorkCode.innerHTML = '<option value="all">Semua Kode</option>' + buildOptions(WORK_CODES, 'Pilih kode');
  renderWorkCodeButtons();
}

function renderWorkCodeButtons() {
  const selectedCodes = normalizeWorkCodes(ui.activityWorkCode.value);

  ui.workCodeOptions.innerHTML = WORK_CODES.map((item) => {
    const code = item.code;
    const isActive = selectedCodes.includes(code);
    return `
      <button
        type="button"
        class="work-code-option ${isActive ? 'active' : ''}"
        data-work-code="${code}"
        aria-pressed="${isActive}"
      >
        ${code}
      </button>
    `;
  }).join('');

  ui.workCodeOptions.querySelectorAll('.work-code-option').forEach((button) => {
    button.addEventListener('click', () => {
      const nextValue = button.dataset.workCode;
      const currentCodes = normalizeWorkCodes(ui.activityWorkCode.value);
      const nextCodes = currentCodes.includes(nextValue)
        ? currentCodes.filter((code) => code !== nextValue)
        : [...currentCodes, nextValue];

      ui.activityWorkCode.value = formatWorkCodes(nextCodes);
      ui.workCodeOptions.classList.remove('field-invalid');
      renderWorkCodeButtons();
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

function resetActivityForm() {
  ui.inventoryCode.value = '';
  ui.userName.value = '';
  ui.activityLocation.value = 'REST AREA';
  ui.activityWorkCode.value = '';
  ui.activityRemarks.value = '';
  ui.customLocationInput.value = '';
  ui.customLocationWrap.classList.add('hidden');
  renderWorkCodeButtons();
}

function updateCustomLocationVisibility() {
  const selectedLocation = ui.activityLocation.value;
  ui.customLocationInput.classList.remove('field-invalid');

  if (selectedLocation === 'OTHER LOCATION') {
    ui.customLocationWrap.classList.remove('hidden');
    ui.customLocationInput.focus();
  } else {
    ui.customLocationWrap.classList.add('hidden');
  }
}

function getActiveActivityFormPayload() {
  let locationValue = ui.activityLocation.value;

  if (locationValue === 'OTHER LOCATION') {
    const customValue = ui.customLocationInput.value.trim();

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
    initSelectOptions();
    ui.activityLocation.value = customValue;
  }

  const selectedWorkCodes = normalizeWorkCodes(ui.activityWorkCode.value);

  if (!selectedWorkCodes.length) {
    throw new Error('Pilih minimal satu kode pengerjaan.');
  }

  return {
    inventoryCode: toUppercaseInventory(ui.inventoryCode.value.trim()),
    userName: toTitleCase(ui.userName.value.trim()),
    location: locationValue,
    workCode: formatWorkCodes(selectedWorkCodes),
    remarks: ui.activityRemarks.value.trim()
  };
}

function renderActiveActivity() {
  const hasOngoingActivity = Boolean(state.activeActivity && state.activeActivity.status === 'ongoing');
  ui.quickActions.classList.toggle('is-active', hasOngoingActivity);
  ui.startActivityBtn.classList.toggle('is-active-layout', hasOngoingActivity);
  ui.cancelActivityControl.classList.toggle('hidden', !hasOngoingActivity);

  if (!hasOngoingActivity) {
    ui.startActivityBtn.querySelector('.start-activity-icon').classList.remove('hidden');
    ui.startActivityBtn.querySelector('.start-activity-button-text').classList.add('hidden');
    ui.startActivityBtn.setAttribute('tabindex', '0');
  } else {
    ui.startActivityBtn.querySelector('.start-activity-icon').classList.add('hidden');
    ui.startActivityBtn.querySelector('.start-activity-button-text').classList.remove('hidden');
    ui.startActivityBtn.setAttribute('tabindex', '-1');
  }

  if (!state.activeActivity) {
    ui.activeActivityCard.classList.add('hidden');
    ui.emptyActiveState.classList.remove('hidden');
    if (activeTimerLoop) {
      clearInterval(activeTimerLoop);
      activeTimerLoop = null;
    }
    ui.activityTimer.textContent = '00:00:00';
    return;
  }

  ui.emptyActiveState.classList.add('hidden');
  ui.activeActivityCard.classList.remove('hidden');
  ui.statusBadge.textContent = state.activeActivity.status === 'ongoing' ? 'Sedang Berlangsung' : 'Selesai';
  ui.statusBadge.className = `status-badge ${state.activeActivity.status === 'ongoing' ? 'ongoing' : 'completed'}`;

  ui.inventoryCode.value = toUppercaseInventory(state.activeActivity.inventoryCode || '');
  ui.userName.value = toTitleCase(state.activeActivity.userName || '');
  ui.activityLocation.value = LOCATION_OPTIONS.includes(state.activeActivity.location)
    ? state.activeActivity.location
    : 'OTHER LOCATION';

  if (ui.activityLocation.value === 'OTHER LOCATION') {
    ui.customLocationInput.value = state.activeActivity.location || '';
    ui.customLocationWrap.classList.remove('hidden');
  } else {
    ui.customLocationInput.value = '';
    ui.customLocationWrap.classList.add('hidden');
  }

  ui.activityWorkCode.value = formatWorkCodes(state.activeActivity.workCode || '');
  renderWorkCodeButtons();
  ui.activityRemarks.value = state.activeActivity.remarks || '';

  if (state.activeActivity.status === 'ongoing') {
    startTimer();
  } else {
    if (activeTimerLoop) {
      clearInterval(activeTimerLoop);
      activeTimerLoop = null;
    }
    ui.activityTimer.textContent = formatClockFromMinutes(state.activeActivity.durationMinutes || 0);
  }
}

function startTimer() {
  if (activeTimerLoop) {
    clearInterval(activeTimerLoop);
  }

  activeTimerLoop = setInterval(() => {
    if (!state.activeActivity || state.activeActivity.status !== 'ongoing') {
      clearInterval(activeTimerLoop);
      activeTimerLoop = null;
      return;
    }

    const startedAt = state.activeActivity.startedAt?.toDate ? state.activeActivity.startedAt.toDate() : new Date(state.activeActivity.startedAt);
    const diffMs = Date.now() - startedAt.getTime();
    const totalSeconds = Math.floor(diffMs / 1000);
    ui.activityTimer.textContent = formatClock(totalSeconds);
  }, 1000);

  const startedAt = state.activeActivity.startedAt?.toDate ? state.activeActivity.startedAt.toDate() : new Date(state.activeActivity.startedAt);
  const diffMs = Date.now() - startedAt.getTime();
  ui.activityTimer.textContent = formatClock(Math.floor(diffMs / 1000));
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
    || ui.filterDate.value
    || ui.filterStatus.value !== 'all'
  );
}

function updateHistoryFilterIndicator() {
  const isActive = hasActiveHistoryFilters();
  ui.historyFilterToggle.classList.toggle('has-active-filter', isActive);
  ui.filterActiveIndicator.setAttribute('aria-hidden', String(!isActive));
}

function setHistoryFilterPanelOpen(isOpen) {
  ui.historyFilterToggle.setAttribute('aria-expanded', String(isOpen));
  ui.historyFilterToggle.setAttribute('aria-label', isOpen ? 'Tutup filter riwayat' : 'Buka filter riwayat');

  if (isOpen) {
    ui.historyFilterPanel.hidden = false;
    ui.historyFilterPanel.classList.add('is-open');
  } else {
    ui.historyFilterPanel.classList.remove('is-open');
    window.setTimeout(() => {
      if (ui.historyFilterToggle.getAttribute('aria-expanded') === 'false') {
        ui.historyFilterPanel.hidden = true;
      }
    }, 180);
  }
}

function renderHistory() {
  updateHistoryFilterIndicator();
  const searchText = ui.searchInput.value.trim().toLowerCase();
  const locationFilter = ui.filterLocation.value;
  const workFilter = ui.filterWorkCode.value;
  const dateFilter = ui.filterDate.value;
  const statusFilter = ui.filterStatus.value;

  const filtered = state.activities.filter((item) => {
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

    const itemDate = item.startedAt?.toDate ? item.startedAt.toDate() : new Date(item.startedAt);
    const matchesDate = !dateFilter || itemDate.toISOString().slice(0, 10) === dateFilter;

    return matchesSearch && matchesLocation && matchesWork && matchesDate && matchesStatus;
  });

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

      console.log('[History] Activity data:', item);
      console.log('[History] Nama yang ditampilkan:', displayedUserName);

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
              <span class="work-badge ${workCode.toLowerCase()}">${workCode}</span>
            </div>

            <div class="feed-body">
              <div class="meta-grid">
                <span><strong>Inventaris:</strong> ${escapeHtml(item.inventoryCode || '-')}</span>
                <span><strong>Lokasi:</strong> ${escapeHtml(item.location || '-')}</span>
                <span><strong>Durasi:</strong> ${durationText} menit</span>
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

    state.activities = state.activities.filter((activity) => activity.id !== activityId);
    if (state.activeActivity?.id === activityId) {
      state.activeActivity = null;
      renderActiveActivity();
    }

    hideDeleteConfirmation(false);
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

  if (state.activeActivity) {
    showToast('Masih ada aktivitas yang sedang berjalan', 'warning');
    return;
  }

  try {
    console.debug('[Activity] Preparing data...');
    const now = Timestamp.now();
    const initialWorkCode = formatWorkCodes(['HW']);
    const newActivity = await createActivity({
      userId: state.currentUser.uid,
      inventoryCode: '',
      userName: '',
      location: 'REST AREA',
      workCode: initialWorkCode,
      remarks: '',
      startedAt: now
    });

    console.debug('[Activity] Save successful', { id: newActivity.id });
    showToast('Aktivitas dimulai', 'success');
    state.activeActivity = newActivity;
    renderActiveActivity();
  } catch (error) {
    console.error('[Activity] Save failed:', error);
    showToast('Gagal memulai aktivitas', 'error');
  }
}

async function handleSaveActivity(event) {
  event.preventDefault();

  if (!state.activeActivity) {
    showToast('Tidak ada aktivitas aktif', 'warning');
    return;
  }

  try {
    const payload = getActiveActivityFormPayload();
    console.log('[Activity] Nama input:', ui.userName.value);
    console.log('[Activity] Activity data:', payload);

    console.debug('[Activity] Saving to Firestore...', {
      activityId: state.activeActivity.id,
      payload
    });

    await updateActivity(state.activeActivity.id, {
      inventoryCode: payload.inventoryCode,
      userName: payload.userName,
      location: payload.location,
      workCode: payload.workCode,
      remarks: payload.remarks
    });

    console.debug('[Activity] Save successful', {
      activityId: state.activeActivity.id,
      workCode: payload.workCode
    });

    showToast('Detail service berhasil disimpan.', 'success');
  } catch (error) {
    console.error('[Activity] Save failed:', error);
    if (error && error.message === 'Pilih minimal satu kode pengerjaan.') {
      showToast('Pilih minimal satu kode pengerjaan.', 'error');
      return;
    }
    showToast('Detail service gagal disimpan.', 'error');
  }
}

function showConfirmModal() {
  ui.confirmModal.classList.remove('hidden');
  ui.confirmModal.setAttribute('aria-hidden', 'false');
}

function hideConfirmModal() {
  ui.confirmModal.classList.add('hidden');
  ui.confirmModal.setAttribute('aria-hidden', 'true');
}

function clearEndActivityValidation() {
  [ui.userName, ui.customLocationInput, ui.activityRemarks, ui.workCodeOptions].forEach((element) => {
    element.classList.remove('field-invalid');
  });
}

function validateEndActivityFields() {
  clearEndActivityValidation();

  const requiredFields = [
    {
      element: ui.userName,
      focusTarget: ui.userName,
      isEmpty: !(ui.userName.value || '').trim()
    },
    {
      element: ui.customLocationInput,
      focusTarget: ui.customLocationInput,
      isEmpty: ui.activityLocation.value === 'OTHER LOCATION'
        && !(ui.customLocationInput.value || '').trim()
    },
    {
      element: ui.activityRemarks,
      focusTarget: ui.activityRemarks,
      isEmpty: !(ui.activityRemarks.value || '').trim()
    },
    {
      element: ui.workCodeOptions,
      focusTarget: ui.workCodeOptions.querySelector('.work-code-option'),
      isEmpty: !normalizeWorkCodes(ui.activityWorkCode.value).length
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

async function handleEndActivity() {
  if (!state.activeActivity) {
    showToast('Tidak ada aktivitas aktif', 'warning');
    hideConfirmModal();
    return;
  }

  hideConfirmModal();

  if (!validateEndActivityFields()) {
    return;
  }

  try {
    const payload = getActiveActivityFormPayload();
    const selectedWorkCodes = normalizeWorkCodes(ui.activityWorkCode.value);

    console.log('[Activity] Nama input:', ui.userName.value);
    console.log('[Activity] Activity data:', payload);
    console.log('[Activity] Saving to Firestore:', payload);

    await updateActivity(state.activeActivity.id, {
      inventoryCode: payload.inventoryCode,
      userName: payload.userName,
      location: payload.location,
      workCode: payload.workCode,
      remarks: payload.remarks
    });

    console.debug('[Activity] Confirm end activity', {
      activityId: state.activeActivity.id,
      startedAt: state.activeActivity.startedAt,
      userName: payload.userName,
      workCode: formatWorkCodes(selectedWorkCodes)
    });

    await finishActivity(state.activeActivity.id, state.activeActivity.startedAt);
    console.log('[Activity] Firestore save successful');
    hideConfirmModal();
    showToast('Service berhasil diakhiri.', 'success');
  } catch (error) {
    console.error('[Activity] Save error:', error);
    console.error('[Activity] Finish failed:', error);
    showToast('Gagal mengakhiri service. Silakan coba lagi.', 'error');
    return;
  }
}

function showCancelConfirmation() {
  if (!state.activeActivity || state.activeActivity.status !== 'ongoing') {
    showToast('Tidak ada aktivitas aktif', 'warning');
    return;
  }

  ui.cancelConfirmModal.classList.remove('hidden');
  ui.cancelConfirmModal.setAttribute('aria-hidden', 'false');
}

function hideCancelConfirmation() {
  ui.cancelConfirmModal.classList.add('hidden');
  ui.cancelConfirmModal.setAttribute('aria-hidden', 'true');
}

async function handleCancelActivity() {
  if (!state.activeActivity || state.activeActivity.status !== 'ongoing') {
    hideCancelConfirmation();
    showToast('Tidak ada aktivitas aktif', 'warning');
    return;
  }

  const activityId = state.activeActivity.id;
  ui.cancelConfirmBtn.disabled = true;

  try {
    await cancelActivity(activityId, state.activeActivity.startedAt);
    hideCancelConfirmation();
    state.activeActivity = null;
    renderActiveActivity();
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

async function handleLogout() {
  try {
    await logoutUser();
    showToast('Berhasil logout', 'success');
  } catch (error) {
    console.error(error);
    showToast('Gagal logout', 'error');
  }
}

function handleAuthStateChange(user) {
  state.currentUser = user;
  state.authReady = true;
  renderUserHeader();

  if (state.currentUser) {
    if (state.unsubscribeActivities) {
      state.unsubscribeActivities();
    }

    state.unsubscribeActivities = subscribeToActivities(state.currentUser.uid, (items) => {
      state.activities = items;
      const ongoing = items.find((item) => item.status === 'ongoing');
      state.activeActivity = ongoing || null;
      renderActiveActivity();
      renderHistory();
    });

    const persistedView = localStorage.getItem('actlog-current-view') || 'dashboard';
    setView(persistedView);
    ui.loginForm.reset();
    ui.registerForm.reset();
  } else {
    state.activities = [];
    state.activeActivity = null;
    renderHistory();
    localStorage.removeItem('actlog-current-view');
    setView('auth');
    ui.activityForm.reset();
    resetActivityForm();
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
  ui.logoutBtn.addEventListener('click', handleLogout);
  ui.editNameBtn.addEventListener('click', showEditNameModal);
  ui.editNameForm.addEventListener('submit', handleEditNameSubmit);
  ui.editNameCancelBtn.addEventListener('click', hideEditNameModal);
  ui.startActivityBtn.addEventListener('click', handleStartActivity);
  ui.activityForm.addEventListener('submit', handleSaveActivity);
  ui.endActivityBtn.addEventListener('click', showConfirmModal);
  ui.confirmEndBtn.addEventListener('click', handleEndActivity);
  ui.confirmCancelBtn.addEventListener('click', hideConfirmModal);
  ui.cancelActivityBtn.addEventListener('click', showCancelConfirmation);
  ui.cancelConfirmBtn.addEventListener('click', handleCancelActivity);
  ui.cancelDismissBtn.addEventListener('click', hideCancelConfirmation);
  ui.activityLocation.addEventListener('change', updateCustomLocationVisibility);
  ui.customLocationInput.addEventListener('input', () => {
    ui.customLocationInput.classList.remove('field-invalid');
  });
  ui.inventoryCode.addEventListener('input', (event) => {
    event.target.value = toUppercaseInventory(event.target.value);
  });
  ui.userName.addEventListener('input', (event) => {
    event.target.classList.remove('field-invalid');
    applyTitleCaseInput(event.target);
  });
  ui.userName.addEventListener('blur', () => {
    ui.userName.value = toTitleCase(ui.userName.value || '');
  });

  ui.searchInput.addEventListener('input', renderHistory);
  ui.activityRemarks.addEventListener('input', () => {
    ui.activityRemarks.classList.remove('field-invalid');
  });
  ui.filterLocation.addEventListener('change', renderHistory);
  ui.filterWorkCode.addEventListener('change', renderHistory);
  ui.filterDate.addEventListener('change', renderHistory);
  ui.filterStatus.addEventListener('change', renderHistory);
  ui.historyFilterToggle.addEventListener('click', () => {
    const isOpen = ui.historyFilterToggle.getAttribute('aria-expanded') === 'true';
    setHistoryFilterPanelOpen(!isOpen);
  });
  ui.historyFilterApply.addEventListener('click', () => {
    renderHistory();
    setHistoryFilterPanelOpen(false);
  });
  ui.historyFilterReset.addEventListener('click', () => {
    ui.searchInput.value = '';
    ui.filterLocation.value = 'all';
    ui.filterWorkCode.value = 'all';
    ui.filterDate.value = '';
    ui.filterStatus.value = 'all';
    renderHistory();
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
