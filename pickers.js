const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

const WEEKDAY_LABELS_ID = ['Sn', 'Sl', 'Rb', 'Km', 'Jm', 'Sb', 'Mg'];

const PICKER_STYLES_ID = 'custom-picker-styles';

let activePicker = null;

function ensurePickerStyles() {
  if (document.getElementById(PICKER_STYLES_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = PICKER_STYLES_ID;
  style.textContent = `
.custom-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  background: rgba(15, 23, 42, 0.55);
  box-sizing: border-box;
  overflow: hidden;
}

.custom-picker-dialog {
  width: min(360px, 100%);
  max-width: 100%;
  max-height: calc(100dvh - 32px);
  box-sizing: border-box;
  overflow-y: auto;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
}

.custom-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 10px;
}

.custom-picker-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #172033;
}

.custom-picker-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  flex: none;
}

.custom-picker-close:hover {
  background: #f1f5f9;
  color: #172033;
}

.custom-picker-close:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.custom-picker-close svg {
  width: 20px;
  height: 20px;
}

.custom-picker-month-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 8px;
}

.custom-picker-month-label {
  font-size: 0.95rem;
  font-weight: 700;
  color: #172033;
}

.custom-picker-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 12px;
  background: #f1f5f9;
  color: #172033;
  cursor: pointer;
  flex: none;
}

.custom-picker-nav-btn:hover {
  background: #e2e8f0;
}

.custom-picker-nav-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.custom-picker-nav-btn svg {
  width: 18px;
  height: 18px;
}

.custom-picker-weekdays,
.custom-picker-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  padding: 0 16px;
}

.custom-picker-weekday {
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: #94a3b8;
  padding: 6px 0;
}

.custom-picker-day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 42px;
  border: none;
  border-radius: 12px;
  background: transparent;
  font-size: 0.95rem;
  color: #172033;
  cursor: pointer;
}

.custom-picker-day:hover {
  background: #eff6ff;
}

.custom-picker-day:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
}

.custom-picker-day.is-today {
  box-shadow: inset 0 0 0 1.5px #93c5fd;
}

.custom-picker-day.is-selected {
  background: #2563eb;
  color: #ffffff;
  font-weight: 700;
}

.custom-picker-day.is-selected.is-today {
  box-shadow: inset 0 0 0 1.5px #1d4ed8;
}

.custom-picker-day:disabled {
  visibility: hidden;
  cursor: default;
}

.custom-picker-time-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 16px 4px;
}

.custom-picker-time-part {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.custom-picker-time-value {
  width: 84px;
  height: 64px;
  box-sizing: border-box;
  border: 1.5px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
  font-size: 1.6rem;
  font-weight: 700;
  color: #172033;
  text-align: center;
  -moz-appearance: textfield;
  appearance: textfield;
}

.custom-picker-time-value::-webkit-outer-spin-button,
.custom-picker-time-value::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.custom-picker-time-value:focus {
  outline: none;
  border-color: #2563eb;
  background: #ffffff;
}

.custom-picker-time-separator {
  font-size: 1.6rem;
  font-weight: 700;
  color: #172033;
  padding-bottom: 34px;
}

.custom-picker-time-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.custom-picker-stepper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 12px;
  background: #f1f5f9;
  color: #172033;
  font-size: 1.3rem;
  font-weight: 700;
  cursor: pointer;
}

.custom-picker-stepper:hover {
  background: #e2e8f0;
}

.custom-picker-stepper:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.custom-picker-stepper-minus {
  font-size: 1.5rem;
  line-height: 1;
}

.custom-picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 16px 16px;
}

.custom-picker-btn {
  min-height: 46px;
  padding: 0 20px;
  border: none;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}

.custom-picker-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.custom-picker-btn-cancel {
  background: #f1f5f9;
  color: #334155;
}

.custom-picker-btn-cancel:hover {
  background: #e2e8f0;
}

.custom-picker-btn-confirm {
  background: #2563eb;
  color: #ffffff;
}

.custom-picker-btn-confirm:hover {
  background: #1d4ed8;
}
`;
  document.head.appendChild(style);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseDateValue(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]) - 1,
        day: Number(match[3])
      };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function parseTimeValue(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      return { hour: Number(match[1]), minute: Number(match[2]) };
    }
  }
  const now = new Date();
  return { hour: now.getHours(), minute: now.getMinutes() };
}

function toDateKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function createSvg(pathData, viewBox) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox || '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);
  return svg;
}

function buildPickerDialog(titleText) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-picker-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'custom-picker-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', titleText);

  const header = document.createElement('div');
  header.className = 'custom-picker-header';

  const title = document.createElement('h2');
  title.className = 'custom-picker-title';
  title.textContent = titleText;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'custom-picker-close';
  closeButton.setAttribute('aria-label', 'Tutup');
  closeButton.appendChild(createSvg('M6 6l12 12M18 6L6 18'));

  header.appendChild(title);
  header.appendChild(closeButton);

  const body = document.createElement('div');
  body.className = 'custom-picker-body';

  const footer = document.createElement('div');
  footer.className = 'custom-picker-footer';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'custom-picker-btn custom-picker-btn-cancel';
  cancelButton.textContent = 'Batal';

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'custom-picker-btn custom-picker-btn-confirm';
  confirmButton.textContent = 'Pilih';

  footer.appendChild(cancelButton);
  footer.appendChild(confirmButton);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);

  return { overlay, dialog, body, closeButton, cancelButton, confirmButton };
}

function openPickerDialog(buildBody, options) {
  if (activePicker) {
    activePicker.close();
  }

  ensurePickerStyles();

  const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const { overlay, dialog, body, closeButton, cancelButton, confirmButton } = buildPickerDialog(
    options.title || 'Pilih'
  );
  const state = buildBody(body, confirmButton);

  let settled = false;
  const finish = (result) => {
    if (settled) {
      return;
    }
    settled = true;
    activePicker = null;
    document.removeEventListener('keydown', handleKeyDown, true);
    overlay.remove();
    document.body.style.overflow = previousBodyOverflow;
    if (previousActiveElement) {
      previousActiveElement.focus({ preventScroll: true });
    }
    if (result !== null && typeof options.onSelect === 'function') {
      options.onSelect(result);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      finish(null);
      return;
    }
    if (typeof state.handleKeyDown === 'function') {
      state.handleKeyDown(event);
    }
  };
  document.addEventListener('keydown', handleKeyDown, true);

  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) {
      finish(null);
    }
  });
  closeButton.addEventListener('click', () => finish(null));
  cancelButton.addEventListener('click', () => finish(null));
  confirmButton.addEventListener('click', () => finish(state.getValue()));

  document.body.appendChild(overlay);
  if (typeof state.focusInitial === 'function') {
    state.focusInitial();
  } else {
    confirmButton.focus({ preventScroll: true });
  }

  activePicker = { close: () => finish(null) };
}

function buildCalendar(body, confirmButton, initial) {
  let viewYear = initial.year;
  let viewMonth = initial.month;
  let selectedYear = initial.year;
  let selectedMonth = initial.month;
  let selectedDay = initial.day;

  const monthNav = document.createElement('div');
  monthNav.className = 'custom-picker-month-nav';

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'custom-picker-nav-btn';
  prevButton.setAttribute('aria-label', 'Bulan sebelumnya');
  prevButton.appendChild(createSvg('M15 6l-6 6 6 6'));

  const monthLabel = document.createElement('div');
  monthLabel.className = 'custom-picker-month-label';

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'custom-picker-nav-btn';
  nextButton.setAttribute('aria-label', 'Bulan berikutnya');
  nextButton.appendChild(createSvg('M9 6l6 6-6 6'));

  monthNav.appendChild(prevButton);
  monthNav.appendChild(monthLabel);
  monthNav.appendChild(nextButton);

  const weekdays = document.createElement('div');
  weekdays.className = 'custom-picker-weekdays';
  WEEKDAY_LABELS_ID.forEach((label) => {
    const cell = document.createElement('div');
    cell.className = 'custom-picker-weekday';
    cell.textContent = label;
    weekdays.appendChild(cell);
  });

  const grid = document.createElement('div');
  grid.className = 'custom-picker-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Kalender');

  body.appendChild(monthNav);
  body.appendChild(weekdays);
  body.appendChild(grid);

  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  let dayButtons = [];

  const isValidDay = (day) => {
    const date = new Date(viewYear, viewMonth, day);
    return date.getFullYear() === viewYear && date.getMonth() === viewMonth;
  };

  const moveFocus = (currentIndex, delta) => {
    const next = dayButtons[currentIndex + delta];
    if (next && !next.disabled) {
      next.focus();
    }
  };

  const render = () => {
    monthLabel.textContent = `${MONTH_NAMES_ID[viewMonth]} ${viewYear}`;
    grid.textContent = '';
    dayButtons = [];

    const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const totalCells = Math.ceil((firstWeekday + 31) / 7) * 7;

    for (let cell = 0; cell < totalCells; cell += 1) {
      const day = cell - firstWeekday + 1;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'custom-picker-day';

      if (!isValidDay(day)) {
        button.disabled = true;
        button.setAttribute('aria-hidden', 'true');
        grid.appendChild(button);
        dayButtons.push(button);
        continue;
      }

      const key = toDateKey(viewYear, viewMonth, day);
      button.textContent = String(day);
      button.setAttribute('aria-label', `${day} ${MONTH_NAMES_ID[viewMonth]} ${viewYear}`);
      if (key === todayKey) {
        button.classList.add('is-today');
      }
      if (key === toDateKey(selectedYear, selectedMonth, selectedDay)) {
        button.classList.add('is-selected');
        button.setAttribute('aria-selected', 'true');
      } else {
        button.setAttribute('aria-selected', 'false');
      }

      const index = dayButtons.length;
      button.addEventListener('click', () => {
        selectedYear = viewYear;
        selectedMonth = viewMonth;
        selectedDay = day;
        render();
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          moveFocus(index, -1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          moveFocus(index, 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveFocus(index, -7);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveFocus(index, 7);
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          button.click();
        }
      });

      grid.appendChild(button);
      dayButtons.push(button);
    }
  };

  const shiftMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    viewYear = next.getFullYear();
    viewMonth = next.getMonth();
    render();
  };

  prevButton.addEventListener('click', () => shiftMonth(-1));
  nextButton.addEventListener('click', () => shiftMonth(1));

  render();

  return {
    getValue: () => toDateKey(selectedYear, selectedMonth, selectedDay),
    focusInitial: () => {
      const selected = grid.querySelector('.custom-picker-day.is-selected');
      if (selected) {
        selected.focus({ preventScroll: true });
      } else {
        confirmButton.focus({ preventScroll: true });
      }
    }
  };
}

function buildClock(body, confirmButton, initial) {
  let hour = initial.hour;
  let minute = initial.minute;

  const display = document.createElement('div');
  display.className = 'custom-picker-time-display';

  const hourPart = document.createElement('div');
  hourPart.className = 'custom-picker-time-part';

  const hourUp = document.createElement('button');
  hourUp.type = 'button';
  hourUp.className = 'custom-picker-stepper';
  hourUp.setAttribute('aria-label', 'Tambah jam');
  hourUp.textContent = '+';

  const hourInput = document.createElement('input');
  hourInput.type = 'text';
  hourInput.inputMode = 'numeric';
  hourInput.autocomplete = 'off';
  hourInput.className = 'custom-picker-time-value';
  hourInput.setAttribute('aria-label', 'Jam');
  hourInput.maxLength = 2;

  const hourLabel = document.createElement('div');
  hourLabel.className = 'custom-picker-time-label';
  hourLabel.textContent = 'Jam';

  const hourDown = document.createElement('button');
  hourDown.type = 'button';
  hourDown.className = 'custom-picker-stepper custom-picker-stepper-minus';
  hourDown.setAttribute('aria-label', 'Kurangi jam');
  hourDown.textContent = '−';

  hourPart.appendChild(hourUp);
  hourPart.appendChild(hourInput);
  hourPart.appendChild(hourLabel);
  hourPart.appendChild(hourDown);

  const separator = document.createElement('div');
  separator.className = 'custom-picker-time-separator';
  separator.textContent = ':';

  const minutePart = document.createElement('div');
  minutePart.className = 'custom-picker-time-part';

  const minuteUp = document.createElement('button');
  minuteUp.type = 'button';
  minuteUp.className = 'custom-picker-stepper';
  minuteUp.setAttribute('aria-label', 'Tambah menit');
  minuteUp.textContent = '+';

  const minuteInput = document.createElement('input');
  minuteInput.type = 'text';
  minuteInput.inputMode = 'numeric';
  minuteInput.autocomplete = 'off';
  minuteInput.className = 'custom-picker-time-value';
  minuteInput.setAttribute('aria-label', 'Menit');
  minuteInput.maxLength = 2;

  const minuteLabel = document.createElement('div');
  minuteLabel.className = 'custom-picker-time-label';
  minuteLabel.textContent = 'Menit';

  const minuteDown = document.createElement('button');
  minuteDown.type = 'button';
  minuteDown.className = 'custom-picker-stepper custom-picker-stepper-minus';
  minuteDown.setAttribute('aria-label', 'Kurangi menit');
  minuteDown.textContent = '−';

  minutePart.appendChild(minuteUp);
  minutePart.appendChild(minuteInput);
  minutePart.appendChild(minuteLabel);
  minutePart.appendChild(minuteDown);

  display.appendChild(hourPart);
  display.appendChild(separator);
  display.appendChild(minutePart);

  body.appendChild(display);

  const render = () => {
    hourInput.value = pad2(hour);
    minuteInput.value = pad2(minute);
  };

  const commitNumericInput = (input, max, apply) => {
    const digits = input.value.replace(/\D/g, '').slice(0, 2);
    if (digits === '') {
      render();
      return;
    }
    apply(Math.min(max, Number(digits)));
    render();
  };

  hourInput.addEventListener('change', () => commitNumericInput(hourInput, 23, (value) => { hour = value; }));
  minuteInput.addEventListener('change', () => commitNumericInput(minuteInput, 59, (value) => { minute = value; }));

  hourUp.addEventListener('click', () => { hour = (hour + 1) % 24; render(); });
  hourDown.addEventListener('click', () => { hour = (hour + 23) % 24; render(); });
  minuteUp.addEventListener('click', () => { minute = (minute + 5) % 60; render(); });
  minuteDown.addEventListener('click', () => { minute = (minute + 55) % 60; render(); });

  render();

  return {
    getValue: () => `${pad2(hour)}:${pad2(minute)}`,
    focusInitial: () => hourInput.focus({ preventScroll: true }),
    handleKeyDown: (event) => {
      if (event.key === 'Enter' && (event.target === hourInput || event.target === minuteInput)) {
        event.preventDefault();
        confirmButton.click();
      }
    }
  };
}

export function openCustomDatePicker(options = {}) {
  const initial = parseDateValue(options.value);
  openPickerDialog(
    (body, confirmButton) => buildCalendar(body, confirmButton, initial),
    { ...options, title: options.title || 'Pilih Tanggal' }
  );
}

export function openCustomTimePicker(options = {}) {
  const initial = parseTimeValue(options.value);
  openPickerDialog(
    (body, confirmButton) => buildClock(body, confirmButton, initial),
    { ...options, title: options.title || 'Pilih Waktu' }
  );
}
