"use strict";

const STORAGE_KEY = "teacher-load-manager-v1";
const LOGIN_SESSION_KEY = "teacher-load-manager-authenticated";
const LOGIN_USERNAME = "admin";
const LOGIN_PASSWORD = "Admin@1831";
let appInitialized = false;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DEFAULT_PERIOD_TIMES = Object.fromEntries(
  Array.from({ length: 7 }, (_, index) => [String(index + 1), { start: "", end: "" }]),
);
const DEFAULT_SETTINGS = {
  schoolName: "My School",
  schoolYear: "2026–2027",
  groupNames: ["Morning shift", "Afternoon shift"],
  autoRecordPeriods: true,
  periodTimes: DEFAULT_PERIOD_TIMES,
  groupPeriodTimes: createGroupPeriodTimes(["Morning shift", "Afternoon shift"]),
};
function createGroupPeriodTimes(groupNames, savedGroupTimes = {}, fallbackTimes = DEFAULT_PERIOD_TIMES) {
  return Object.fromEntries(groupNames.map((groupName) => {
    const savedTimes = savedGroupTimes[groupName] ?? {};
    return [groupName, Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => {
        const period = String(index + 1);
        return [period, savedTimes[period] ?? fallbackTimes[period] ?? { start: "", end: "" }];
      }),
    )];
  }));
}

const AVATAR_COLORS = ["", "blue", "amber", "rose"];

const state = {
  teachers: [],
  loads: [],
  substitutionPlans: [],
  settings: { ...DEFAULT_SETTINGS },
  activeView: "overview",
  teacherQuery: "",
  loadQuery: "",
  singleLoadFromAutoMode: false,
  editingSubstitutionPlanId: "",
  settingsDraftGroupPeriodTimes: null,
  settingsPeriodGroup: "",
};

const elements = {
  views: [...document.querySelectorAll(".view-panel")],
  navLinks: [...document.querySelectorAll(".nav-link")],
  breadcrumb: document.querySelector("#breadcrumb-current"),
  teacherDialog: document.querySelector("#teacher-dialog"),
  loadDialog: document.querySelector("#load-dialog"),
  teacherLoadPreview: document.querySelector("#teacher-load-preview"),
  settingsDialog: document.querySelector("#settings-dialog"),
  toastRegion: document.querySelector("#toast-region"),
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `record-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.teachers) || !Array.isArray(parsed.loads)) {
      throw new Error("Saved school records have an invalid format.");
    }
    state.teachers = parsed.teachers;
    state.substitutionPlans = Array.isArray(parsed.substitutionPlans) ? parsed.substitutionPlans : [];
    state.loads = parsed.loads.map((load) => {
      if (load.minutes !== undefined) return { ...load, minutes: Number(load.minutes) };
      const legacyHours = Number(load.hours);
      const { hours, ...legacyLoad } = load;
      return { ...legacyLoad, minutes: Number.isFinite(legacyHours) ? legacyHours * 60 : 0 };
    });
    const groupNames = Array.isArray(parsed.settings?.groupNames) && parsed.settings.groupNames.length
      ? parsed.settings.groupNames
      : [...DEFAULT_SETTINGS.groupNames];
    const periodTimes = { ...DEFAULT_PERIOD_TIMES, ...(parsed.settings?.periodTimes ?? {}) };
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings ?? {}),
      groupNames,
      periodTimes,
      groupPeriodTimes: createGroupPeriodTimes(
        groupNames,
        parsed.settings?.groupPeriodTimes ?? {},
        periodTimes,
      ),
    };
  } catch (error) {
    showToast(`Couldn't read saved records: ${error.message}`, "error");
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      teachers: state.teachers,
      loads: state.loads,
      substitutionPlans: state.substitutionPlans,
      settings: state.settings,
    }));
    return true;
  } catch (error) {
    showToast(`Couldn't save records in this browser: ${error.message}`, "error");
    return false;
  }
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " toast-error" : ""}`;
  const mark = document.createElement("span");
  mark.className = "toast-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = type === "error" ? "!" : "✓";
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(mark, text);
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function formatMinutes(value) {
  return `${Number(value) || 0} min`;
}

function formatLoadDays(days) {
  return Array.isArray(days) && days.length ? days.join(", ") : "—";
}

function formatDate(dateValue) {
  if (!dateValue) return "";
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

function formatTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? "");
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = match[2];
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

function periodTime(period, groupName) {
  const matchingGroup = Object.keys(state.settings.groupPeriodTimes ?? {})
    .find((name) => name.toLocaleLowerCase() === String(groupName ?? "").toLocaleLowerCase());
  const times = state.settings.groupPeriodTimes?.[groupName]?.[String(period)]
    ?? state.settings.groupPeriodTimes?.[matchingGroup]?.[String(period)]
    ?? state.settings.periodTimes?.[String(period)];
  const start = formatTime(times?.start);
  const end = formatTime(times?.end);
  if (start && end) return `${start}–${end}`;
  return start || end;
}

function scheduleStartMinutes(load) {
  const configuredStart = state.settings.groupPeriodTimes?.[load.groupName]?.[String(load.period)]?.start
    ?? state.settings.periodTimes?.[String(load.period)]?.start;
  const configuredMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(configuredStart ?? "");
  if (configuredMatch) return Number(configuredMatch[1]) * 60 + Number(configuredMatch[2]);

  const scheduleMatch = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)/i.exec(load.schedule ?? "");
  if (!scheduleMatch) return Number.POSITIVE_INFINITY;
  const hour = Number(scheduleMatch[1]) % 12 + (scheduleMatch[3].toUpperCase() === "PM" ? 12 : 0);
  return hour * 60 + Number(scheduleMatch[2]);
}

function compareLoadSchedules(a, b) {
  const aDay = Math.min(...(Array.isArray(a.days) ? a.days : [])
    .map((day) => WEEKDAYS.indexOf(day)).filter((index) => index >= 0), WEEKDAYS.length);
  const bDay = Math.min(...(Array.isArray(b.days) ? b.days : [])
    .map((day) => WEEKDAYS.indexOf(day)).filter((index) => index >= 0), WEEKDAYS.length);
  return aDay - bDay
    || scheduleStartMinutes(a) - scheduleStartMinutes(b)
    || (a.groupName ?? "").localeCompare(b.groupName ?? "")
    || Number(a.period || 0) - Number(b.period || 0)
    || (a.subject ?? "").localeCompare(b.subject ?? "");
}

function makePeriodCell(row, period, groupName, schedule) {
  const cell = document.createElement("td");
  const label = document.createElement("span");
  label.className = "table-primary";
  label.textContent = period ? `Period ${period}` : "—";
  cell.append(label);
  const time = schedule || periodTime(period, groupName);
  if (time) {
    const detail = document.createElement("div");
    detail.className = "table-secondary";
    detail.textContent = time;
    cell.append(detail);
  }
  row.append(cell);
}

function renderLoadScheduleOptions({ period = "", selectedGroup = "", selectedSchedule = "" } = {}) {
  const scheduleSelect = document.querySelector("#load-schedule");
  scheduleSelect.replaceChildren();
  scheduleSelect.add(new Option("Select a group, period, and time", ""));
  const groupNames = [...state.settings.groupNames];
  if (selectedGroup && !groupNames.includes(selectedGroup)) groupNames.push(selectedGroup);
  let optionNumber = 0;
  groupNames.forEach((groupName) => {
    for (let periodNumber = 1; periodNumber <= 7; periodNumber += 1) {
      const periodValue = String(periodNumber);
      const time = periodTime(periodValue, groupName);
      const option = new Option(
        `${groupName} · Period ${periodNumber} · ${time || "Time not set"}`,
        `schedule-${optionNumber}`,
      );
      optionNumber += 1;
      option.dataset.groupName = groupName;
      option.dataset.period = periodValue;
      option.dataset.schedule = time;
      scheduleSelect.add(option);

      if (selectedGroup === groupName && period === periodValue && selectedSchedule && selectedSchedule !== time) {
        const savedOption = new Option(
          `${groupName} · Period ${periodNumber} · ${selectedSchedule}`,
          `schedule-${optionNumber}`,
        );
        optionNumber += 1;
        savedOption.dataset.groupName = groupName;
        savedOption.dataset.period = periodValue;
        savedOption.dataset.schedule = selectedSchedule;
        scheduleSelect.add(savedOption);
      }
    }
  });

  const selectedOption = [...scheduleSelect.options].find((option) =>
    option.dataset.groupName === selectedGroup && option.dataset.period === period
    && (!selectedSchedule || option.dataset.schedule === selectedSchedule));
  if (selectedOption) selectedOption.selected = true;
}

function teacherLoads(teacherId) {
  return state.loads.filter((load) => load.teacherId === teacherId);
}

function teacherMinutes(teacherId) {
  return teacherLoads(teacherId).reduce((total, load) => total + Number(load.minutes || 0), 0);
}

function teacherName(teacherId) {
  return state.teachers.find((teacher) => teacher.id === teacherId)?.name ?? "Unknown teacher";
}

function makeCell(row, value, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = value;
  row.append(cell);
  return cell;
}

function makePersonCell(row, name, secondary, index) {
  const cell = document.createElement("td");
  const wrapper = document.createElement("div");
  wrapper.className = "person-cell";
  const avatar = document.createElement("span");
  avatar.className = `avatar ${AVATAR_COLORS[index % AVATAR_COLORS.length]}`;
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
  const info = document.createElement("span");
  info.className = "person-info";
  const primary = document.createElement("strong");
  primary.textContent = name;
  const detail = document.createElement("span");
  detail.textContent = secondary || "No employee ID";
  info.append(primary, detail);
  wrapper.append(avatar, info);
  cell.append(wrapper);
  row.append(cell);
}

function makeMinutesCell(row, minutes) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "hours-badge";
  badge.textContent = formatMinutes(minutes);
  cell.append(badge);
  row.append(cell);
}

function makeStatusCell(row, status) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `status-badge${status === "On leave" ? " status-on-leave" : status === "Inactive" ? " status-inactive" : ""}`;
  badge.textContent = status;
  cell.append(badge);
  row.append(cell);
}

function makeActionCell(row, type, id, label) {
  const cell = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "row-actions";
  const edit = document.createElement("button");
  edit.className = "row-action";
  edit.type = "button";
  edit.setAttribute("aria-label", `Edit ${label}`);
  edit.title = `Edit ${label}`;
  edit.textContent = "✎";
  edit.addEventListener("click", () => type === "teacher" ? openTeacherDialog(id) : openLoadDialog(id));
  const remove = document.createElement("button");
  remove.className = "row-action delete";
  remove.type = "button";
  remove.setAttribute("aria-label", `Delete ${label}`);
  remove.title = `Delete ${label}`;
  remove.textContent = "×";
  remove.addEventListener("click", () => type === "teacher" ? deleteTeacher(id) : deleteLoad(id));
  actions.append(edit, remove);
  cell.append(actions);
  row.append(cell);
}

function setEmptyState(tableBody, emptyState, hasRows) {
  tableBody.replaceChildren();
  emptyState.classList.toggle("visible", !hasRows);
}

function render() {
  renderHeader();
  renderStats();
  renderTeachers();
  renderLoads();
  renderRecentLoads();
  renderSubstitutionPlans();
  document.querySelector("#teacher-nav-count").textContent = String(state.teachers.length);
  document.querySelector("#load-nav-count").textContent = String(state.loads.length);
  document.querySelector("#teacher-dashboard-load-count").textContent = `${state.loads.length} ${state.loads.length === 1 ? "assignment" : "assignments"}`;
  document.querySelector("#teacher-dashboard-substitution-count").textContent = `${state.substitutionPlans.length} ${state.substitutionPlans.length === 1 ? "plan" : "plans"}`;
}

function renderHeader() {
  document.querySelector("#school-context-name").textContent = state.settings.schoolName || DEFAULT_SETTINGS.schoolName;
  document.querySelector("#school-context-year").textContent = state.settings.schoolYear || DEFAULT_SETTINGS.schoolYear;
}

function renderStats() {
  document.querySelector("#stat-teachers").textContent = String(state.teachers.length);
  document.querySelector("#stat-loads").textContent = String(state.loads.length);
  const totalMinutes = state.loads.reduce((total, load) => total + Number(load.minutes || 0), 0);
  const minutesValue = document.querySelector("#stat-minutes");
  minutesValue.replaceChildren(document.createTextNode(String(totalMinutes)));
  const unit = document.createElement("span");
  unit.className = "stat-unit";
  unit.textContent = " min";
  minutesValue.append(unit);
}

function renderTeachers() {
  const tableBody = document.querySelector("#teachers-body");
  const emptyState = document.querySelector("#teachers-empty");
  const query = state.teacherQuery.trim().toLocaleLowerCase();
  const matching = state.teachers
    .filter((teacher) => `${teacher.name} ${teacher.employeeId ?? ""} ${teacher.position ?? ""} ${teacher.status ?? ""}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  setEmptyState(tableBody, emptyState, matching.length > 0);
  document.querySelector("#teacher-list-caption").textContent = `${state.teachers.length} ${state.teachers.length === 1 ? "teacher profile" : "teacher profiles"}`;
  if (!matching.length) {
    const message = emptyState.querySelector("strong");
    const description = emptyState.querySelector("p");
    const addButton = emptyState.querySelector("button");
    message.textContent = state.teachers.length ? "No matching teachers" : "No teachers to show";
    description.textContent = state.teachers.length ? "Try a different name or employee ID." : "Add a teacher profile to get started.";
    addButton.hidden = state.teachers.length > 0;
    return;
  }
  matching.forEach((teacher, index) => {
    const row = document.createElement("tr");
    makePersonCell(row, teacher.name, teacher.employeeId || "No employee ID", index);
    makeCell(row, teacher.employeeId || "—");
    makeCell(row, teacher.position || "—");
    makeCell(row, String(teacherLoads(teacher.id).length));
    makeMinutesCell(row, teacherMinutes(teacher.id));
    makeStatusCell(row, teacher.status || "Active");
    makeActionCell(row, "teacher", teacher.id, teacher.name);
    tableBody.append(row);
  });
}

function renderLoads() {
  const tableBody = document.querySelector("#loads-body");
  const emptyState = document.querySelector("#loads-empty");
  const query = state.loadQuery.trim().toLocaleLowerCase();
  const matching = state.loads
    .filter((load) => `${teacherName(load.teacherId)} ${load.subject} ${load.grade} ${load.section ?? ""} ${load.groupName ?? ""} ${load.period ?? ""} ${formatLoadDays(load.days)} ${periodTime(load.period, load.groupName)} ${load.schedule ?? ""}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => teacherName(a.teacherId).localeCompare(teacherName(b.teacherId)) || compareLoadSchedules(a, b));
  setEmptyState(tableBody, emptyState, matching.length > 0);
  document.querySelector("#load-list-caption").textContent = `${state.loads.length} ${state.loads.length === 1 ? "teaching assignment" : "teaching assignments"}`;
  if (!matching.length) {
    const message = emptyState.querySelector("strong");
    const description = emptyState.querySelector("p");
    const addButton = emptyState.querySelector("button");
    message.textContent = state.loads.length ? "No matching assignments" : "No assignments to show";
    description.textContent = state.loads.length ? "Try another teacher, class, or learning area." : state.teachers.length ? "Add a teaching load to get started." : "Add a teacher profile before creating an assignment.";
    addButton.hidden = state.teachers.length === 0 || state.loads.length > 0;
    return;
  }
  matching.forEach((load, index) => {
    const teacher = state.teachers.find((item) => item.id === load.teacherId);
    const row = document.createElement("tr");
    makePersonCell(row, teacher?.name ?? "Unknown teacher", teacher?.employeeId || "No employee ID", state.teachers.indexOf(teacher));
    makeCell(row, load.subject, "table-primary");
    makeCell(row, `${load.grade}${load.section ? ` · ${load.section}` : ""}`);
    makeCell(row, load.groupName || "—");
    makePeriodCell(row, load.period, load.groupName, load.schedule);
    makeCell(row, load.schedule || "—", "table-secondary");
    makeCell(row, formatLoadDays(load.days));
    makeMinutesCell(row, load.minutes);
    makeActionCell(row, "load", load.id, `${load.subject} assignment`);
    tableBody.append(row);
  });
}

function renderRecentLoads() {
  const tableBody = document.querySelector("#recent-loads-body");
  const emptyState = document.querySelector("#recent-empty");
  const recent = [...state.loads].slice(-5).reverse();
  setEmptyState(tableBody, emptyState, recent.length > 0);
  if (!recent.length) return;
  recent.forEach((load, index) => {
    const teacher = state.teachers.find((item) => item.id === load.teacherId);
    const row = document.createElement("tr");
    makePersonCell(row, teacher?.name ?? "Unknown teacher", teacher?.employeeId || "No employee ID", index);
    makeCell(row, load.subject, "table-primary");
    makeCell(row, `${load.grade}${load.section ? ` · ${load.section}` : ""}`);
    makeCell(row, load.groupName || "—");
    makePeriodCell(row, load.period, load.groupName, load.schedule);
    makeCell(row, formatLoadDays(load.days));
    makeMinutesCell(row, load.minutes);
    tableBody.append(row);
  });
}

function renderSubstitutionPlans() {
  const tableBody = document.querySelector("#substitution-plans-body");
  const emptyState = document.querySelector("#substitution-plans-empty");
  const plans = [...state.substitutionPlans].sort((a, b) => a.startDate.localeCompare(b.startDate));
  setEmptyState(tableBody, emptyState, plans.length > 0);
  document.querySelector("#substitution-plan-caption").textContent =
    `${plans.length} ${plans.length === 1 ? "substitution plan" : "substitution plans"}`;
  plans.forEach((plan) => {
    const leaveTeacher = state.teachers.find((teacher) => teacher.id === plan.leaveTeacherId);
    const substituteTeacher = state.teachers.find((teacher) => teacher.id === plan.substituteTeacherId);
    const row = document.createElement("tr");
    makeCell(row, leaveTeacher?.name ?? "Unknown teacher", "table-primary");
    makeCell(row, substituteTeacher?.name ?? "Unknown teacher", "table-primary");
    makeCell(row, `${formatDate(plan.startDate)} – ${formatDate(plan.endDate)}`);
    const coveredLoads = plan.loadIds
      .map((id) => state.loads.find((load) => load.id === id))
      .filter(Boolean);
    makeCell(row, coveredLoads.map((load) =>
      `${load.subject} · ${load.grade}${load.section ? ` ${load.section}` : ""} · ${load.groupName || "No group"} · Period ${load.period || "—"}${load.schedule ? ` · ${load.schedule}` : ""} · ${formatLoadDays(load.days)}`,
    ).join("; "));
    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const preview = document.createElement("button");
    preview.className = "button button-secondary button-small substitution-preview-action";
    preview.type = "button";
    preview.setAttribute("aria-label", `Preview substitution plan for ${leaveTeacher?.name ?? "teacher"}`);
    preview.title = "Open print preview for substitution plan";
    preview.textContent = "Print preview";
    preview.addEventListener("click", () => openSubstitutionPlanPreview(plan.id));
    const edit = document.createElement("button");
    edit.className = "row-action";
    edit.type = "button";
    edit.setAttribute("aria-label", `Edit substitution plan for ${leaveTeacher?.name ?? "teacher"}`);
    edit.title = "Edit substitution plan";
    edit.textContent = "✎";
    edit.addEventListener("click", () => openSubstitutionDialog(plan.id));
    const remove = document.createElement("button");
    remove.className = "row-action delete";
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete substitution plan for ${leaveTeacher?.name ?? "teacher"}`);
    remove.title = "Delete substitution plan";
    remove.textContent = "×";
    remove.addEventListener("click", () => deleteSubstitutionPlan(plan.id));
    actions.append(preview, edit, remove);
    actionsCell.append(actions);
    row.append(actionsCell);
    tableBody.append(row);
  });
}

function switchView(viewName) {
  state.activeView = viewName;
  elements.views.forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
  elements.navLinks.forEach((link) => link.classList.toggle("active", Boolean(link.dataset.view) && link.dataset.view === viewName));
  const label = { overview: "Overview", teachers: "Teachers", loads: "Teaching loads", substitutions: "Substitution plans" }[viewName];
  elements.breadcrumb.textContent = label;
  document.title = `${label} · Teacher Load Manager`;
  closeSidebar();
}

function loadWeekdays(load) {
  const selectedDays = Array.isArray(load.days) ? load.days.filter((day) => WEEKDAYS.includes(day)) : [];
  return selectedDays.length ? selectedDays : WEEKDAYS;
}

function timeInMinutes(hourValue, minuteValue, meridiem) {
  let hour = Number(hourValue);
  if (meridiem) {
    hour %= 12;
    if (meridiem.toUpperCase() === "PM") hour += 12;
  }
  return hour * 60 + Number(minuteValue);
}

function loadTimeRange(load) {
  const configured = state.settings.groupPeriodTimes?.[load.groupName]?.[String(load.period)]
    ?? Object.entries(state.settings.groupPeriodTimes ?? {})
      .find(([groupName]) => groupName.toLocaleLowerCase() === String(load.groupName ?? "").toLocaleLowerCase())?.[1]?.[String(load.period)]
    ?? state.settings.periodTimes?.[String(load.period)];
  const configuredStart = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(configured?.start ?? "");
  const configuredEnd = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(configured?.end ?? "");
  if (configuredStart && configuredEnd) {
    return {
      start: Number(configuredStart[1]) * 60 + Number(configuredStart[2]),
      end: Number(configuredEnd[1]) * 60 + Number(configuredEnd[2]),
    };
  }

  const range = /(\d{1,2}):([0-5]\d)\s*(AM|PM)?\s*[–-]\s*(\d{1,2}):([0-5]\d)\s*(AM|PM)?/i.exec(load.schedule ?? "");
  if (range && (range[3] || range[6])) {
    const startMeridiem = range[3] ?? range[6];
    const endMeridiem = range[6] ?? range[3];
    return {
      start: timeInMinutes(range[1], range[2], startMeridiem),
      end: timeInMinutes(range[4], range[5], endMeridiem),
    };
  }

  if (range) {
    return {
      start: timeInMinutes(range[1], range[2], ""),
      end: timeInMinutes(range[4], range[5], ""),
    };
  }
  return null;
}

function hasWeekdayDuringDates(weekday, startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return true;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const targetWeekday = (WEEKDAYS.indexOf(weekday) + 1) % 7;
  for (let date = start; date <= end; date = new Date(date.getTime() + 86400000)) {
    if (date.getUTCDay() === targetWeekday) return true;
  }
  return false;
}

function loadOccursDuringDates(load, startDate, endDate) {
  return loadWeekdays(load).some((day) => hasWeekdayDuringDates(day, startDate, endDate));
}

function loadsOverlap(first, second, startDate = "", endDate = "") {
  const sharedDays = loadWeekdays(first).filter((day) =>
    loadWeekdays(second).includes(day) && hasWeekdayDuringDates(day, startDate, endDate));
  if (!sharedDays.length) return false;

  const firstRange = loadTimeRange(first);
  const secondRange = loadTimeRange(second);
  if (firstRange && secondRange) {
    return firstRange.start < secondRange.end && secondRange.start < firstRange.end;
  }
  return first.groupName === second.groupName && String(first.period) === String(second.period);
}

function substituteCommitments(teacherId, startDate, endDate, excludedPlanId = "") {
  const commitments = teacherLoads(teacherId).map((load) => ({ load, plan: null }));
  state.substitutionPlans
    .filter((plan) => plan.id !== excludedPlanId
      && plan.substituteTeacherId === teacherId
      && plan.startDate <= endDate && startDate <= plan.endDate)
    .forEach((plan) => {
      (Array.isArray(plan.loadIds) ? plan.loadIds : []).forEach((id) => {
        const load = state.loads.find((item) => item.id === id);
        if (load) commitments.push({ load, plan });
      });
    });
  return commitments;
}

function substitutionConflict(load, substituteTeacherId, startDate, endDate, excludedPlanId = "") {
  const commitments = substituteCommitments(substituteTeacherId, startDate, endDate, excludedPlanId);
  return commitments.find(({ load: assignedLoad }) =>
    loadsOverlap(load, assignedLoad, startDate, endDate));
}

function populateSubstitutionTeachers(leaveTeacherId, startDate = "", endDate = "") {
  const select = document.querySelector("#substitution-cover-teacher");
  const currentSelection = select.value;
  const selectedGroup = document.querySelector("#substitution-group-filter").value;
  const selectedPeriod = document.querySelector("#substitution-period-filter").value;
  const loads = teacherLoads(leaveTeacherId);
  const selectedLoadIds = new Set([...document.querySelectorAll('#substitution-load-options input[name="loadIds"]:checked')]
    .map((input) => input.value));
  const matchingLoads = loads.filter((load) =>
    (!selectedGroup || load.groupName === selectedGroup)
    && (!selectedPeriod || String(load.period) === selectedPeriod));
  const selectedLoads = matchingLoads.filter((load) => selectedLoadIds.has(load.id));
  const targetLoads = selectedLoads.length ? selectedLoads : matchingLoads;
  const activeTeachers = state.teachers
    .filter((teacher) => teacher.id !== leaveTeacherId && (teacher.status || "Active") === "Active")
    .sort((a, b) => a.name.localeCompare(b.name));
  const availableTeachers = targetLoads.length
    ? activeTeachers.filter((teacher) => selectedLoads.length
      ? targetLoads.every((load) => !substitutionConflict(load, teacher.id, startDate, endDate, state.editingSubstitutionPlanId))
      : targetLoads.some((load) => !substitutionConflict(load, teacher.id, startDate, endDate, state.editingSubstitutionPlanId)))
    : activeTeachers;

  select.replaceChildren(new Option(
    availableTeachers.length ? "Select available teacher" : "No available teachers for this period",
    "",
  ));
  availableTeachers.forEach((teacher) => select.add(new Option(teacher.name, teacher.id)));
  if (availableTeachers.some((teacher) => teacher.id === currentSelection)) {
    select.value = currentSelection;
  }
}

function populateSubstitutionLoads(leaveTeacherId, substituteTeacherId = "", startDate = "", endDate = "") {
  const container = document.querySelector("#substitution-load-options");
  const hint = document.querySelector("#substitution-load-hint");
  const selectedGroup = document.querySelector("#substitution-group-filter").value;
  const selectedPeriod = document.querySelector("#substitution-period-filter").value;
  const selectedLoadIds = new Set([...container.querySelectorAll('input[name="loadIds"]:checked')].map((input) => input.value));
  container.replaceChildren();
  if (!leaveTeacherId) {
    hint.textContent = "Choose a teacher on leave to list their assignments.";
    return;
  }
  const loads = teacherLoads(leaveTeacherId).sort(compareLoadSchedules);
  if (!loads.length) {
    hint.textContent = "This teacher has no teaching assignments to cover.";
    return;
  }
  hint.textContent = "Select one or more assignments. Group and period times sync with Groups & periods; unavailable times are marked against the substitute's current schedule.";
  loads.forEach((load, index) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "loadIds";
    checkbox.value = load.id;
    checkbox.checked = selectedLoadIds.has(load.id);
    const description = document.createElement("span");
    const currentSchedule = periodTime(load.period, load.groupName) || load.schedule || "Time not set";
    description.textContent = `${load.subject} · ${load.grade}${load.section ? ` ${load.section}` : ""} · ${load.groupName || "No group"} · Period ${load.period || "—"} · ${currentSchedule} · ${formatLoadDays(load.days)}`;
    label.hidden = (selectedGroup && load.groupName !== selectedGroup)
      || (selectedPeriod && String(load.period) !== selectedPeriod);
    label.append(checkbox, description);
    const substituteScheduleConflict = substituteTeacherId
      ? substitutionConflict(load, substituteTeacherId, startDate, endDate, state.editingSubstitutionPlanId)
      : null;
    const selectedLoadConflict = loads.slice(0, index).find((selectedLoad) =>
      selectedLoadIds.has(selectedLoad.id) && loadsOverlap(load, selectedLoad, startDate, endDate));
    const conflict = startDate && endDate && !loadOccursDuringDates(load, startDate, endDate)
      ? { load, message: "No selected weekdays fall within these leave dates." }
      : substituteScheduleConflict
      ?? (selectedLoadConflict ? { load: selectedLoadConflict, plan: null } : null);
    if (conflict) {
      checkbox.checked = false;
      checkbox.disabled = true;
      label.classList.add("is-unavailable");
      const reason = document.createElement("small");
      reason.className = "substitution-conflict";
      const conflictingSchedule = periodTime(conflict.load.period, conflict.load.groupName)
        || conflict.load.schedule;
      reason.textContent = conflict.message
        ? `Unavailable: ${conflict.message}`
        : `Unavailable: overlaps ${conflict.load.subject}${conflictingSchedule ? ` at ${conflictingSchedule}` : ""}${formatLoadDays(conflict.load.days) !== "—" ? ` on ${formatLoadDays(conflict.load.days)}` : ""}${conflict.plan ? " in another substitution plan" : ""}.`;
      label.append(reason);
    }
    container.append(label);
  });
}

function populateSubstitutionFilters() {
  const groupSelect = document.querySelector("#substitution-group-filter");
  const periodSelect = document.querySelector("#substitution-period-filter");
  const groups = [...new Set([
    ...state.settings.groupNames,
    ...state.loads.map((load) => load.groupName).filter(Boolean),
  ])];
  groupSelect.replaceChildren(new Option("All groups", ""));
  groups.forEach((groupName) => groupSelect.add(new Option(groupName, groupName)));

  const periods = [...new Set([
    ...Array.from({ length: 7 }, (_, index) => String(index + 1)),
    ...state.loads.map((load) => String(load.period ?? "")).filter((period) => period && !/^[1-7]$/.test(period)),
  ])];
  periodSelect.replaceChildren(new Option("All periods", ""));
  periods.forEach((period) => periodSelect.add(new Option(`Period ${period}`, period)));
}

function openSubstitutionDialog(planId = "") {
  const plan = state.substitutionPlans.find((item) => item.id === planId);
  state.editingSubstitutionPlanId = plan?.id ?? "";
  const form = document.querySelector("#substitution-form");
  form.reset();
  document.querySelector("#substitution-dialog-title").textContent = plan ? "Edit substitution plan" : "Create substitution plan";
  document.querySelector("#substitution-form button[type=\"submit\"]").textContent =
    plan ? "Save changes" : "Save substitution plan";
  const leaveSelect = document.querySelector("#substitution-leave-teacher");
  const substituteSelect = document.querySelector("#substitution-cover-teacher");
  const leaveHelp = document.querySelector("#substitution-leave-help");
  leaveSelect.replaceChildren(new Option("Select teacher on leave", ""));
  substituteSelect.replaceChildren(new Option("Select available teacher", ""));
  populateSubstitutionFilters();
  state.teachers
    .filter((teacher) => teacher.status === "On leave")
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((teacher) => leaveSelect.add(new Option(teacher.name, teacher.id)));
  leaveHelp.hidden = leaveSelect.options.length > 1;
  if (plan) {
    if (![...leaveSelect.options].some((option) => option.value === plan.leaveTeacherId)) {
      leaveSelect.add(new Option(
        state.teachers.find((teacher) => teacher.id === plan.leaveTeacherId)?.name ?? "Unknown teacher",
        plan.leaveTeacherId,
      ));
    }
    leaveSelect.value = plan.leaveTeacherId;
    document.querySelector("#substitution-start-date").value = plan.startDate;
    document.querySelector("#substitution-end-date").value = plan.endDate;
    populateSubstitutionLoads(plan.leaveTeacherId, "", plan.startDate, plan.endDate);
    document.querySelectorAll('#substitution-load-options input[name="loadIds"]').forEach((input) => {
      input.checked = plan.loadIds.includes(input.value);
    });
    populateSubstitutionTeachers(plan.leaveTeacherId, plan.startDate, plan.endDate);
    populateSubstitutionLoads(
      plan.leaveTeacherId,
      plan.substituteTeacherId,
      plan.startDate,
      plan.endDate,
    );
    document.querySelector("#substitution-cover-teacher").value = plan.substituteTeacherId;
  } else {
    populateSubstitutionTeachers("");
    populateSubstitutionLoads("");
  }
  document.querySelector("#substitution-dialog").showModal();
  if (leaveSelect.options.length === 1) {
    showToast("Mark the teacher's status as On leave before creating a substitution plan.", "error");
  }
  if (substituteSelect.options.length === 1) {
    showToast("No Active teachers are available to substitute. Update a teacher's status or add a teacher.", "error");
  }
}

function printSubstitutionPlan() {
  const leaveTeacherId = document.querySelector("#substitution-leave-teacher").value;
  const substituteTeacherId = document.querySelector("#substitution-cover-teacher").value;
  const startDate = document.querySelector("#substitution-start-date").value;
  const endDate = document.querySelector("#substitution-end-date").value;
  const selectedLoadIds = [...document.querySelectorAll('#substitution-load-options input[name="loadIds"]:checked')]
    .map((input) => input.value);
  const leaveTeacher = state.teachers.find((teacher) => teacher.id === leaveTeacherId);
  const substituteTeacher = state.teachers.find((teacher) => teacher.id === substituteTeacherId);
  const selectedLoads = selectedLoadIds
    .map((id) => state.loads.find((load) => load.id === id))
    .filter((load) => load && load.teacherId === leaveTeacherId);

  if (!leaveTeacher || !substituteTeacher || !startDate || !endDate || startDate > endDate || !selectedLoads.length) {
    showToast("Select the leave teacher, available substitute, valid leave dates, and at least one load before printing.", "error");
    return;
  }

  populateSubstitutionPrintSheet(leaveTeacher, substituteTeacher, startDate, endDate, selectedLoads);
  printSubstitutionSheet();
}

function populateSubstitutionPrintSheet(leaveTeacher, substituteTeacher, startDate, endDate, loads) {
  document.querySelector("#substitution-print-summary").textContent =
    `Teacher on leave: ${leaveTeacher.name} | Substitute: ${substituteTeacher.name} | Leave dates: ${formatDate(startDate)} – ${formatDate(endDate)}`;
  const tableBody = document.querySelector("#substitution-print-loads");
  tableBody.replaceChildren();
  loads.forEach((load) => {
    const row = document.createElement("tr");
    [
      load.subject,
      `${load.grade}${load.section ? ` ${load.section}` : ""}`,
      load.groupName || "—",
      [load.period ? `Period ${load.period}` : "", periodTime(load.period, load.groupName) || load.schedule || "Time not set"]
        .filter(Boolean).join(" · "),
      formatLoadDays(load.days),
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    tableBody.append(row);
  });
}

function printSubstitutionSheet() {
  const openDialog = document.querySelector("dialog[open]");
  if (openDialog) openDialog.close();
  document.body.classList.add("printing-substitution-plan");
  const finishPrinting = () => {
    document.body.classList.remove("printing-substitution-plan");
    if (openDialog?.isConnected) openDialog.showModal();
  };
  window.addEventListener("afterprint", finishPrinting, { once: true });
  requestAnimationFrame(() => {
    window.print();
  });
}

function openSubstitutionPlanPreview(planId) {
  const plan = state.substitutionPlans.find((item) => item.id === planId);
  if (!plan) {
    showToast("Couldn't find this substitution plan.", "error");
    return;
  }
  const leaveTeacher = state.teachers.find((teacher) => teacher.id === plan.leaveTeacherId);
  const substituteTeacher = state.teachers.find((teacher) => teacher.id === plan.substituteTeacherId);
  if (!leaveTeacher || !substituteTeacher) {
    showToast("This plan's teacher details are missing, so it can't be previewed.", "error");
    return;
  }
  const loads = plan.loadIds
    .map((id) => state.loads.find((load) => load.id === id))
    .filter(Boolean);
  const summary = `Teacher on leave: ${leaveTeacher.name} · Substitute: ${substituteTeacher.name} · Leave dates: ${formatDate(plan.startDate)} – ${formatDate(plan.endDate)}`;
  document.querySelector("#substitution-plan-preview-summary").textContent = summary;
  const tableBody = document.querySelector("#substitution-plan-preview-loads");
  tableBody.replaceChildren();
  loads.forEach((load) => {
    const row = document.createElement("tr");
    [
      load.subject,
      `${load.grade}${load.section ? ` ${load.section}` : ""}`,
      load.groupName || "—",
      [load.period ? `Period ${load.period}` : "", periodTime(load.period, load.groupName) || load.schedule || "Time not set"]
        .filter(Boolean).join(" · "),
      formatLoadDays(load.days),
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    tableBody.append(row);
  });
  const previewDialog = document.querySelector("#substitution-plan-preview");
  document.querySelector("#print-saved-substitution-plan").onclick = () => {
    populateSubstitutionPrintSheet(leaveTeacher, substituteTeacher, plan.startDate, plan.endDate, loads);
    printSubstitutionSheet();
  };
  previewDialog.showModal();
}

function saveSubstitutionPlan(event) {
  event.preventDefault();
  const isEditing = Boolean(state.editingSubstitutionPlanId);
  const form = new FormData(event.currentTarget);
  const leaveTeacherId = String(form.get("leaveTeacherId") ?? "");
  const substituteTeacherId = String(form.get("substituteTeacherId") ?? "");
  const startDate = String(form.get("startDate") ?? "");
  const endDate = String(form.get("endDate") ?? "");
  const loadIds = [...new Set(form.getAll("loadIds").map(String))];
  const leaveTeacher = state.teachers.find((teacher) => teacher.id === leaveTeacherId);
  const substituteTeacher = state.teachers.find((teacher) => teacher.id === substituteTeacherId);

  if (leaveTeacher?.status !== "On leave") {
    showToast("Select a teacher whose employment status is On leave.", "error");
    document.querySelector("#substitution-leave-teacher").focus();
    return;
  }
  if (!substituteTeacher || (substituteTeacher.status || "Active") !== "Active") {
    showToast("Select an available teacher whose status is Active.", "error");
    document.querySelector("#substitution-cover-teacher").focus();
    return;
  }
  if (!startDate || !endDate || startDate > endDate) {
    showToast("Enter valid leave dates, with the end date on or after the start date.", "error");
    document.querySelector(startDate ? "#substitution-end-date" : "#substitution-start-date").focus();
    return;
  }
  const leaveLoads = teacherLoads(leaveTeacherId);
  if (!loadIds.length || loadIds.some((id) => !leaveLoads.some((load) => load.id === id))) {
    showToast("Select at least one teaching load belonging to the teacher on leave.", "error");
    return;
  }
  const nonoccurringLoad = loadIds
    .map((id) => leaveLoads.find((load) => load.id === id))
    .find((load) => !loadOccursDuringDates(load, startDate, endDate));
  if (nonoccurringLoad) {
    showToast(`${nonoccurringLoad.subject} has no scheduled weekdays during these leave dates.`, "error");
    return;
  }
  const conflictingLoad = loadIds
    .map((id) => leaveLoads.find((load) => load.id === id))
    .find((load) => substitutionConflict(load, substituteTeacherId, startDate, endDate, state.editingSubstitutionPlanId));
  if (conflictingLoad) {
    populateSubstitutionLoads(leaveTeacherId, substituteTeacherId, startDate, endDate);
    showToast(`${conflictingLoad.subject} cannot be covered because its group, period, time, or weekdays overlap the substitute's schedule.`, "error");
    return;
  }
  const selectedLoads = loadIds.map((id) => leaveLoads.find((load) => load.id === id));
  for (let index = 0; index < selectedLoads.length; index += 1) {
    const overlappingLoad = selectedLoads.slice(0, index).find((load) =>
      loadsOverlap(selectedLoads[index], load, startDate, endDate));
    if (overlappingLoad) {
      showToast("The selected leave assignments overlap each other and cannot both be covered by one substitute at the same time.", "error");
      return;
    }
  }
  const plan = {
    id: state.editingSubstitutionPlanId || createId(),
    leaveTeacherId,
    substituteTeacherId,
    startDate,
    endDate,
    loadIds,
  };
  const previousPlans = state.substitutionPlans;
  if (state.editingSubstitutionPlanId) {
    state.substitutionPlans = previousPlans.map((item) => item.id === plan.id ? plan : item);
  } else {
    state.substitutionPlans = [...previousPlans, plan];
  }
  if (!saveState()) {
    state.substitutionPlans = previousPlans;
    return;
  }
  state.editingSubstitutionPlanId = "";
  document.querySelector("#substitution-dialog").close();
  renderSubstitutionPlans();
  showToast(isEditing ? "Substitution plan updated." : "Substitution plan saved.");
}

function deleteSubstitutionPlan(id) {
  const plan = state.substitutionPlans.find((item) => item.id === id);
  if (!plan || !window.confirm("Delete this substitution plan?")) return;
  const previousPlans = state.substitutionPlans;
  state.substitutionPlans = previousPlans.filter((plan) => plan.id !== id);
  if (!saveState()) {
    state.substitutionPlans = previousPlans;
    return;
  }
  renderSubstitutionPlans();
  showToast("Substitution plan deleted.");
}

function openTeacherDialog(teacherId) {
  const teacher = state.teachers.find((item) => item.id === teacherId);
  document.querySelector("#teacher-form").reset();
  document.querySelector("#teacher-id").value = teacher?.id ?? "";
  document.querySelector("#teacher-name").value = teacher?.name ?? "";
  document.querySelector("#teacher-employee-id").value = teacher?.employeeId ?? "";
  document.querySelector("#teacher-position").value = teacher?.position ?? "";
  document.querySelector("#teacher-status").value = teacher?.status ?? "Active";
  document.querySelector("#teacher-dialog-title").textContent = teacher ? "Edit teacher" : "Add teacher";
  elements.teacherDialog.showModal();
  document.querySelector("#teacher-name").focus();
}

function openLoadDialog(loadId, selectedTeacherId = "") {
  if (!state.teachers.length) {
    showToast("Add a teacher profile before creating a teaching assignment.", "error");
    switchView("teachers");
    return;
  }
  const load = state.loads.find((item) => item.id === loadId);
  const teacherSelect = document.querySelector("#load-teacher");
  teacherSelect.replaceChildren();
  state.teachers.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((teacher) => {
    const option = document.createElement("option");
    option.value = teacher.id;
    option.textContent = teacher.name;
    teacherSelect.append(option);
  });
  const groupSelect = document.querySelector("#load-group-name");
  const selectedGroup = load?.groupName ?? "";
  groupSelect.replaceChildren(new Option("Select group", ""));
  const groupNames = [...state.settings.groupNames];
  if (selectedGroup && !groupNames.includes(selectedGroup)) groupNames.push(selectedGroup);
  groupNames.forEach((groupName) => groupSelect.add(new Option(groupName, groupName)));
  const autoGenerate = !load && state.settings.autoRecordPeriods;
  state.singleLoadFromAutoMode = false;
  const autoGenerateCard = document.querySelector("#auto-generate-card");
  const singleAssignmentFields = document.querySelector("#single-assignment-fields");
  autoGenerateCard.hidden = !autoGenerate;
  singleAssignmentFields.hidden = autoGenerate;
  document.querySelector("#load-period").required = !autoGenerate;
  groupSelect.required = !autoGenerate;
  document.querySelector("#load-form").reset();
  autoGenerateCard.hidden = !autoGenerate;
  singleAssignmentFields.hidden = autoGenerate;
  document.querySelector("#load-period").required = !autoGenerate;
  groupSelect.required = !autoGenerate;
  document.querySelector("#load-id").value = load?.id ?? "";
  document.querySelector("#preview-teacher-load").hidden = !load;
  document.querySelector("#save-add-another-load").hidden = !load;
  if (load) {
    teacherSelect.value = load.teacherId;
    document.querySelector("#load-subject").value = load.subject;
    document.querySelector("#load-grade").value = load.grade;
    document.querySelector("#load-section").value = load.section ?? "";
    const selectedDays = new Set(Array.isArray(load.days) ? load.days : []);
    document.querySelectorAll('input[name="days"]').forEach((checkbox) => {
      checkbox.checked = selectedDays.has(checkbox.value);
    });
    document.querySelector("#load-group-name").value = load.groupName ?? "";
    document.querySelector("#load-period").value = load.period ?? "";
    document.querySelector("#load-minutes").value = load.minutes;
  } else if (selectedTeacherId) {
    teacherSelect.value = selectedTeacherId;
  }
  const selectedPeriod = document.querySelector("#load-period").value;
  const savedSchedule = load?.schedule ?? "";
  renderLoadScheduleOptions({
    period: selectedPeriod,
    selectedGroup: groupSelect.value,
    selectedSchedule: savedSchedule,
  });
  document.querySelector("#load-schedule-hint").textContent = autoGenerate
    ? "Choose a period and time to add one assignment, or leave it unselected to add all groups and periods."
    : "Choose a group, period, and configured time. The group and period fields update automatically.";
  document.querySelector("#load-dialog-title").textContent = load ? "Edit teaching load" : "Add teaching load";
  elements.loadDialog.showModal();
  teacherSelect.focus();
}

function saveTeacher(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = document.querySelector("#teacher-id").value;
  const employeeId = String(form.get("employeeId") ?? "").trim();
  if (employeeId && state.teachers.some((teacher) => teacher.id !== id && teacher.employeeId?.toLocaleLowerCase() === employeeId.toLocaleLowerCase())) {
    showToast("That employee ID is already used by another teacher.", "error");
    document.querySelector("#teacher-employee-id").focus();
    return;
  }
  const record = {
    id: id || createId(),
    name: String(form.get("name") ?? "").trim(),
    employeeId,
    position: String(form.get("position") ?? "").trim(),
    status: String(form.get("status") ?? "Active"),
  };
  if (!record.name) return;
  const previousTeachers = [...state.teachers];
  if (id) state.teachers = state.teachers.map((teacher) => teacher.id === id ? record : teacher);
  else state.teachers.push(record);
  if (!saveState()) {
    state.teachers = previousTeachers;
    return;
  }
  elements.teacherDialog.close();
  render();
  showToast(id ? "Teacher profile updated." : "Teacher profile added.");
}

function saveLoad(event) {
  event.preventDefault();
  const addAnother = event.submitter?.value === "add-another";
  const form = new FormData(event.currentTarget);
  const minutes = Number(form.get("minutes"));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
    showToast("Enter a whole number of weekly minutes from 1 to 10,080.", "error");
    document.querySelector("#load-minutes").focus();
    return;
  }
  const id = document.querySelector("#load-id").value;
  const record = {
    id: id || createId(),
    teacherId: String(form.get("teacherId") ?? ""),
    subject: String(form.get("subject") ?? "").trim(),
    grade: String(form.get("grade") ?? "").trim(),
    section: String(form.get("section") ?? "").trim(),
    days: form.getAll("days").filter((day) => WEEKDAYS.includes(day)),
    groupName: String(form.get("groupName") ?? "").trim(),
    period: String(form.get("period") ?? "").trim(),
    minutes,
    schedule: String(form.get("schedule") ?? "").trim(),
  };
  const selectedScheduleOption = document.querySelector("#load-schedule").selectedOptions[0];
  if (selectedScheduleOption?.dataset.groupName) {
    record.groupName = selectedScheduleOption.dataset.groupName;
    record.period = selectedScheduleOption.dataset.period;
    record.schedule = selectedScheduleOption.dataset.schedule;
  }
  if (!state.teachers.some((teacher) => teacher.id === record.teacherId)) {
    showToast("Select a teacher profile for this assignment.", "error");
    return;
  }
  const autoGenerate = !id && state.settings.autoRecordPeriods && !state.singleLoadFromAutoMode;
  if (!record.subject || !record.grade || (!autoGenerate && !/^[1-7]$/.test(record.period))) {
    showToast("Enter a learning area and grade level, and select a period from 1 to 7 for a single assignment.", "error");
    return;
  }
  const previousLoads = [...state.loads];
  if (id) {
    state.loads = state.loads.map((load) => load.id === id ? record : load);
  } else if (autoGenerate) {
    const generatedRecords = state.settings.groupNames.flatMap((groupName) =>
      Array.from({ length: 7 }, (_, index) => ({
        ...record,
        id: createId(),
        days: [...record.days],
        groupName,
        period: String(index + 1),
        schedule: periodTime(String(index + 1), groupName),
      })),
    );
    state.loads.push(...generatedRecords);
  } else {
    state.loads.push(record);
  }
  if (!saveState()) {
    state.loads = previousLoads;
    return;
  }
  elements.loadDialog.close();
  state.singleLoadFromAutoMode = false;
  render();
  showToast(id ? "Teaching assignment updated." : autoGenerate ? "14 teaching assignments added; the entered minutes apply to each." : "Teaching assignment added.");
  if (addAnother) openLoadDialog(undefined, record.teacherId);
}

function previewTeacherLoads() {
  const teacherId = document.querySelector("#load-teacher").value;
  const teacher = state.teachers.find((item) => item.id === teacherId);
  if (!teacher) {
    showToast("Select a teacher to preview their teaching loads.", "error");
    return;
  }
  const loads = teacherLoads(teacherId).slice().sort(compareLoadSchedules);
  document.querySelector("#teacher-load-preview-title").textContent = teacher.name;
  document.querySelector("#teacher-load-preview-subtitle").textContent = `${loads.length} ${loads.length === 1 ? "teaching assignment" : "teaching assignments"}`;
  document.querySelector("#teacher-load-preview-summary").textContent =
    `Total weekly teaching time: ${formatMinutes(teacherMinutes(teacherId))}`;
  const tableBody = document.querySelector("#teacher-load-preview-body");
  tableBody.replaceChildren();
  loads.forEach((load) => {
    const row = document.createElement("tr");
    makeCell(row, load.subject, "table-primary");
    makeCell(row, `${load.grade}${load.section ? ` · ${load.section}` : ""}`);
    makeCell(row, load.groupName || "—");
    makeCell(row, [load.period ? `Period ${load.period}` : "", load.schedule || periodTime(load.period, load.groupName)].filter(Boolean).join(" · ") || "—");
    makeCell(row, formatLoadDays(load.days));
    makeCell(row, formatMinutes(load.minutes));
    tableBody.append(row);
  });
  document.querySelector("#teacher-load-preview-empty").hidden = loads.length > 0;
  elements.teacherLoadPreview.showModal();
}

function deleteTeacher(id) {
  const teacher = state.teachers.find((item) => item.id === id);
  if (!teacher) return;
  const assignedCount = teacherLoads(id).length;
  const message = assignedCount
    ? `${teacher.name} has ${assignedCount} teaching ${assignedCount === 1 ? "assignment" : "assignments"}. Delete the teacher and all of those assignments?`
    : `Delete ${teacher.name}'s teacher profile?`;
  if (!window.confirm(message)) return;
  const previousTeachers = state.teachers;
  const previousLoads = state.loads;
  const previousSubstitutionPlans = state.substitutionPlans;
  state.teachers = state.teachers.filter((item) => item.id !== id);
  state.loads = state.loads.filter((item) => item.teacherId !== id);
  state.substitutionPlans = state.substitutionPlans.filter((plan) =>
    plan.leaveTeacherId !== id && plan.substituteTeacherId !== id);
  if (!saveState()) {
    state.teachers = previousTeachers;
    state.loads = previousLoads;
    state.substitutionPlans = previousSubstitutionPlans;
    render();
    return;
  }
  render();
  showToast("Teacher profile deleted.");
}

function deleteLoad(id) {
  const load = state.loads.find((item) => item.id === id);
  if (!load || !window.confirm(`Delete the ${load.subject} assignment for ${teacherName(load.teacherId)}?`)) return;
  const previousLoads = state.loads;
  const previousSubstitutionPlans = state.substitutionPlans;
  state.loads = state.loads.filter((item) => item.id !== id);
  state.substitutionPlans = state.substitutionPlans
    .map((plan) => ({ ...plan, loadIds: (Array.isArray(plan.loadIds) ? plan.loadIds : []).filter((loadId) => loadId !== id) }))
    .filter((plan) => plan.loadIds.length > 0);
  if (!saveState()) {
    state.loads = previousLoads;
    state.substitutionPlans = previousSubstitutionPlans;
    render();
    return;
  }
  render();
  showToast("Teaching assignment deleted.");
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportCsv() {
  const columns = ["School", "School Year", "Teacher", "Employee ID", "Position", "Employment Status", "Learning Area", "Grade Level", "Section", "Group Name", "Period", "Period Start Time", "Period End Time", "Days", "Minutes Per Week", "Schedule"];
  const rows = state.loads.map((load) => {
    const teacher = state.teachers.find((item) => item.id === load.teacherId);
    return [
      state.settings.schoolName,
      state.settings.schoolYear,
      teacher?.name ?? "Unknown teacher",
      teacher?.employeeId ?? "",
      teacher?.position ?? "",
      teacher?.status ?? "",
      load.subject,
      load.grade,
      load.section ?? "",
      load.groupName ?? "",
      load.period ? `Period ${load.period}` : "",
      state.settings.groupPeriodTimes?.[load.groupName]?.[String(load.period)]?.start ?? state.settings.periodTimes?.[String(load.period)]?.start ?? "",
      state.settings.groupPeriodTimes?.[load.groupName]?.[String(load.period)]?.end ?? state.settings.periodTimes?.[String(load.period)]?.end ?? "",
      Array.isArray(load.days) ? load.days.join(", ") : "",
      load.minutes,
      load.schedule ?? "",
    ];
  });
  const csv = [columns, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `teacher-loads-${(state.settings.schoolYear || "school-year").replaceAll(/[^a-z0-9-]/gi, "-")}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(state.loads.length ? "Teaching-load CSV exported." : "CSV template exported. Add assignments to include records.");
}

function openSettingsDialog() {
  document.querySelector("#setting-school").value = state.settings.schoolName ?? "";
  document.querySelector("#setting-year").value = state.settings.schoolYear ?? "";
  document.querySelector("#setting-auto-record").checked = Boolean(state.settings.autoRecordPeriods);
  const groupNames = state.settings.groupNames ?? DEFAULT_SETTINGS.groupNames;
  state.settingsDraftGroupPeriodTimes = createGroupPeriodTimes(
    groupNames,
    state.settings.groupPeriodTimes ?? {},
    state.settings.periodTimes ?? DEFAULT_PERIOD_TIMES,
  );
  renderGroupNameOptions(groupNames);
  renderPeriodGroupOptions(groupNames, groupNames[0]);
  renderPeriodTimeInputs(groupNames[0]);
  elements.settingsDialog.showModal();
}

function renderGroupNameOptions(groupNames, selectedGroup = "") {
  const select = document.querySelector("#setting-group-names");
  select.replaceChildren();
  groupNames.forEach((groupName) => select.add(new Option(groupName, groupName)));
  if (selectedGroup && groupNames.includes(selectedGroup)) select.value = selectedGroup;
  document.querySelector("#remove-group-name").disabled = groupNames.length <= 1;
}

function capturePeriodTimeInputs(groupName) {
  if (!groupName || !state.settingsDraftGroupPeriodTimes) return;
  state.settingsDraftGroupPeriodTimes[groupName] ??= createGroupPeriodTimes([groupName])[groupName];
  for (let period = 1; period <= 7; period += 1) {
    state.settingsDraftGroupPeriodTimes[groupName][String(period)] = {
      start: document.querySelector(`[data-period-start="${period}"]`).value,
      end: document.querySelector(`[data-period-end="${period}"]`).value,
    };
  }
}

function renderPeriodGroupOptions(groupNames, selectedGroup = "") {
  const select = document.querySelector("#setting-period-group");
  select.replaceChildren();
  groupNames.forEach((groupName) => select.add(new Option(groupName, groupName)));
  if (selectedGroup && groupNames.includes(selectedGroup)) select.value = selectedGroup;
  state.settingsPeriodGroup = select.value;
  if (select.value) renderPeriodTimeInputs(select.value);
}

function renderPeriodTimeInputs(groupName) {
  const timesByPeriod = state.settingsDraftGroupPeriodTimes?.[groupName] ?? {};
  for (let period = 1; period <= 7; period += 1) {
    const times = timesByPeriod[String(period)] ?? { start: "", end: "" };
    document.querySelector(`[data-period-start="${period}"]`).value = times.start ?? "";
    document.querySelector(`[data-period-end="${period}"]`).value = times.end ?? "";
  }
}

function addGroupName() {
  const input = document.querySelector("#new-group-name");
  const groupName = input.value.trim();
  if (!groupName) {
    showToast("Enter a group name to add.", "error");
    input.focus();
    return;
  }
  const groupNames = [...document.querySelector("#setting-group-names").options].map((option) => option.value);
  const existingGroup = groupNames.find((name) => name.toLocaleLowerCase() === groupName.toLocaleLowerCase());
  if (existingGroup) {
    document.querySelector("#setting-group-names").value = existingGroup;
    capturePeriodTimeInputs(document.querySelector("#setting-period-group").value);
    renderPeriodGroupOptions(
      groupNames,
      existingGroup,
    );
    input.value = "";
    showToast(`${existingGroup} is already in your group list. It is selected in Available groups.`);
    return;
  }
  capturePeriodTimeInputs(document.querySelector("#setting-period-group").value);
  groupNames.push(groupName);
  state.settingsDraftGroupPeriodTimes[groupName] = createGroupPeriodTimes([groupName])[groupName];
  renderGroupNameOptions(groupNames, groupName);
  renderPeriodGroupOptions(groupNames, groupName);
  input.value = "";
}

function removeGroupName() {
  const select = document.querySelector("#setting-group-names");
  const groupNames = [...select.options].map((option) => option.value);
  if (groupNames.length <= 1) {
    showToast("Keep at least one group name.", "error");
    return;
  }
  capturePeriodTimeInputs(document.querySelector("#setting-period-group").value);
  const removedName = select.value;
  const remainingNames = groupNames.filter((name) => name !== removedName);
  renderGroupNameOptions(remainingNames, remainingNames[0]);
  renderPeriodGroupOptions(remainingNames, remainingNames[0]);
}

function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const groupNames = [...document.querySelector("#setting-group-names").options].map((option) => option.value);
  if (!groupNames.length) {
    showToast("Enter at least one group name.", "error");
    document.querySelector("#setting-group-names").focus();
    return;
  }
  capturePeriodTimeInputs(document.querySelector("#setting-period-group").value);
  const groupPeriodTimes = createGroupPeriodTimes(
    groupNames,
    state.settingsDraftGroupPeriodTimes ?? {},
    DEFAULT_PERIOD_TIMES,
  );
  const previous = state.settings;
  for (const groupName of groupNames) {
    for (let period = 1; period <= 7; period += 1) {
      const periodKey = String(period);
      const times = groupPeriodTimes[groupName][periodKey];
      const previousTimes = previous.groupPeriodTimes?.[groupName]?.[periodKey]
        ?? previous.periodTimes?.[periodKey]
        ?? DEFAULT_PERIOD_TIMES[periodKey];
      if (times.start === previousTimes.start && times.end === previousTimes.end) continue;
      if (Boolean(times.start) !== Boolean(times.end)) {
        showToast(`Enter both a start and end time for ${groupName}, Period ${period}, or leave both blank.`, "error");
        document.querySelector("#setting-period-group").value = groupName;
        state.settingsPeriodGroup = groupName;
        renderPeriodTimeInputs(groupName);
        document.querySelector(`[data-period-${times.start ? "end" : "start"}="${period}"]`).focus();
        return;
      }
      if (times.start && times.start >= times.end) {
        showToast(`${groupName}, Period ${period}: end time must be later than start time.`, "error");
        document.querySelector("#setting-period-group").value = groupName;
        state.settingsPeriodGroup = groupName;
        renderPeriodTimeInputs(groupName);
        document.querySelector(`[data-period-end="${period}"]`).focus();
        return;
      }
    }
  }
  state.settings = {
    schoolName: String(form.get("schoolName") ?? "").trim() || DEFAULT_SETTINGS.schoolName,
    schoolYear: String(form.get("schoolYear") ?? "").trim() || DEFAULT_SETTINGS.schoolYear,
    groupNames,
    autoRecordPeriods: document.querySelector("#setting-auto-record").checked,
    periodTimes: previous.periodTimes ?? DEFAULT_PERIOD_TIMES,
    groupPeriodTimes,
  };
  if (!saveState()) {
    state.settings = previous;
    return;
  }
  elements.settingsDialog.close();
  state.settingsDraftGroupPeriodTimes = null;
  state.settingsPeriodGroup = "";
  render();
  showToast("School details, group names, and period times updated.");
}

function closeSidebar() {
  document.querySelector("#sidebar").classList.remove("is-open");
  document.querySelector("#sidebar-scrim").classList.remove("is-visible");
}

function enterApplication() {
  document.querySelector("#login-screen").hidden = true;
  document.querySelector("#app-shell").hidden = false;
  if (!appInitialized) {
    initializeApp();
    appInitialized = true;
  }
}

function initialize() {
  const loginForm = document.querySelector("#login-form");
  const loginError = document.querySelector("#login-error");
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.querySelector("#login-username").value.trim();
    const password = document.querySelector("#login-password").value;
    if (username !== LOGIN_USERNAME || password !== LOGIN_PASSWORD) {
      loginError.hidden = false;
      document.querySelector("#login-password").value = "";
      document.querySelector("#login-password").focus();
      return;
    }
    loginError.hidden = true;
    try {
      sessionStorage.setItem(LOGIN_SESSION_KEY, "true");
    } catch (error) {
      loginError.textContent = `Couldn't start a sign-in session: ${error.message}`;
      loginError.hidden = false;
      return;
    }
    enterApplication();
  });
  document.querySelector("#logout-button").addEventListener("click", () => {
    try {
      sessionStorage.removeItem(LOGIN_SESSION_KEY);
    } catch (error) {
      showToast(`Couldn't clear the sign-in session: ${error.message}`, "error");
      return;
    }
    document.querySelector("#app-shell").hidden = true;
    document.querySelector("#login-screen").hidden = false;
    document.querySelector("#login-form").reset();
    document.querySelector("#login-error").hidden = true;
    document.querySelector("#login-username").focus();
  });

  try {
    if (sessionStorage.getItem(LOGIN_SESSION_KEY) === "true") enterApplication();
  } catch (error) {
    loginError.textContent = `Couldn't check the sign-in session: ${error.message}`;
    loginError.hidden = false;
  }
}

function initializeApp() {
  loadState();
  render();

  elements.navLinks.forEach((link) => {
    if (link.dataset.view) link.addEventListener("click", () => switchView(link.dataset.view));
  });
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.go)));
  document.querySelectorAll("[data-add-teacher]").forEach((button) => button.addEventListener("click", () => openTeacherDialog()));
  document.querySelectorAll("[data-add-load]").forEach((button) => button.addEventListener("click", () => openLoadDialog()));
  document.querySelector("#add-teacher").addEventListener("click", () => openTeacherDialog());
  document.querySelector("#add-load").addEventListener("click", () => openLoadDialog());
  document.querySelector("#quick-add-load").addEventListener("click", () => openLoadDialog());
  document.querySelector("#sidebar-export").addEventListener("click", exportCsv);
  document.querySelector("#export-loads").addEventListener("click", exportCsv);
  document.querySelector("#print-overview").addEventListener("click", () => window.print());
  document.querySelector("#open-settings").addEventListener("click", openSettingsDialog);
  document.querySelector("#add-substitution-plan").addEventListener("click", openSubstitutionDialog);
  document.querySelector("#manage-leave-teachers")?.addEventListener("click", () => {
    document.querySelector("#substitution-dialog").close();
    switchView("teachers");
  });
  document.querySelectorAll("[data-add-substitution-plan]").forEach((button) =>
    button.addEventListener("click", openSubstitutionDialog));
  const refreshSubstitutionLoads = () => populateSubstitutionLoads(
    document.querySelector("#substitution-leave-teacher").value,
    document.querySelector("#substitution-cover-teacher").value,
    document.querySelector("#substitution-start-date").value,
    document.querySelector("#substitution-end-date").value,
  );
  const refreshSubstitutionAvailability = () => {
    const leaveTeacherId = document.querySelector("#substitution-leave-teacher").value;
    const startDate = document.querySelector("#substitution-start-date").value;
    const endDate = document.querySelector("#substitution-end-date").value;
    populateSubstitutionTeachers(leaveTeacherId, startDate, endDate);
    refreshSubstitutionLoads();
  };
  document.querySelector("#substitution-leave-teacher").addEventListener("change", refreshSubstitutionAvailability);
  document.querySelector("#substitution-cover-teacher").addEventListener("change", refreshSubstitutionLoads);
  document.querySelector("#substitution-start-date").addEventListener("change", (event) => {
    document.querySelector("#substitution-end-date").min = event.currentTarget.value;
    refreshSubstitutionAvailability();
  });
  document.querySelector("#substitution-end-date").addEventListener("change", refreshSubstitutionAvailability);
  document.querySelector("#substitution-group-filter").addEventListener("change", refreshSubstitutionAvailability);
  document.querySelector("#substitution-period-filter").addEventListener("change", refreshSubstitutionAvailability);
  document.querySelector("#substitution-load-options").addEventListener("change", (event) => {
    if (event.target.matches('input[name="loadIds"]')) refreshSubstitutionAvailability();
  });
  document.querySelector("#substitution-form").addEventListener("submit", saveSubstitutionPlan);
  document.querySelector("#print-substitution-plan").addEventListener("click", printSubstitutionPlan);
  document.querySelector("#add-group-name").addEventListener("click", addGroupName);
  document.querySelector("#new-group-name").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addGroupName();
    }
  });
  document.querySelector("#remove-group-name").addEventListener("click", removeGroupName);
  document.querySelector("#setting-group-names").addEventListener("change", (event) => {
    const groupNames = [...event.currentTarget.options].map((option) => option.value);
    const selectedGroup = event.currentTarget.value;
    capturePeriodTimeInputs(document.querySelector("#setting-period-group").value);
    renderPeriodGroupOptions(groupNames, selectedGroup);
  });
  document.querySelector("#setting-period-group").addEventListener("change", (event) => {
    capturePeriodTimeInputs(state.settingsPeriodGroup);
    state.settingsPeriodGroup = event.currentTarget.value;
    renderPeriodTimeInputs(event.currentTarget.value);
  });
  document.querySelector("#open-groups-periods").addEventListener("click", () => {
    closeSidebar();
    openSettingsDialog();
  });
  document.querySelector("#teacher-form").addEventListener("submit", saveTeacher);
  document.querySelector("#load-form").addEventListener("submit", saveLoad);
  document.querySelector("#preview-teacher-load").addEventListener("click", previewTeacherLoads);
  document.querySelector("#load-group-name").addEventListener("change", (event) => {
    renderLoadScheduleOptions({
      period: document.querySelector("#load-period").value,
      selectedGroup: event.currentTarget.value,
    });
  });
  document.querySelector("#load-period").addEventListener("change", (event) => {
    renderLoadScheduleOptions({
      period: event.currentTarget.value,
      selectedGroup: document.querySelector("#load-group-name").value,
    });
  });
  document.querySelector("#load-schedule").addEventListener("change", (event) => {
    const selectedOption = event.currentTarget.selectedOptions[0];
    if (selectedOption?.dataset.groupName) {
      document.querySelector("#load-group-name").value = selectedOption.dataset.groupName;
      document.querySelector("#load-period").value = selectedOption.dataset.period;
      const isNewAutoRecordedLoad = !document.querySelector("#load-id").value && state.settings.autoRecordPeriods;
      if (isNewAutoRecordedLoad) {
        state.singleLoadFromAutoMode = true;
        document.querySelector("#auto-generate-card").hidden = true;
        document.querySelector("#single-assignment-fields").hidden = false;
        document.querySelector("#load-group-name").required = true;
        document.querySelector("#load-period").required = true;
      }
    } else if (!document.querySelector("#load-id").value && state.settings.autoRecordPeriods) {
      state.singleLoadFromAutoMode = false;
      document.querySelector("#auto-generate-card").hidden = false;
      document.querySelector("#single-assignment-fields").hidden = true;
      document.querySelector("#load-group-name").required = false;
      document.querySelector("#load-period").required = false;
    }
  });
  document.querySelector("#settings-form").addEventListener("submit", saveSettings);
  document.querySelector("#teacher-search").addEventListener("input", (event) => {
    state.teacherQuery = event.currentTarget.value;
    renderTeachers();
  });
  document.querySelector("#load-search").addEventListener("input", (event) => {
    state.loadQuery = event.currentTarget.value;
    renderLoads();
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  document.querySelector("#mobile-menu").addEventListener("click", () => {
    document.querySelector("#sidebar").classList.add("is-open");
    document.querySelector("#sidebar-scrim").classList.add("is-visible");
  });
  document.querySelector("#sidebar-scrim").addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
  });
}

initialize();
