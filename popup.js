/**
 * UET CS LMS Companion — Strict Monochrome Dark Editorial Edition (Beta v0.1.0)
 * Canvas-Native CLO Reader + Compact Profile Page + Monochrome Palette + Vertical Time-Pillar Agenda Cards
 * Author: Abdul Hannan Bhatti (https://github.com/hanan-bhatti)
 * License: AGPL-3.0
 */

const BASE_URL = "https://api-lms.iotpro.uk";

// --------------------------------------------------------------------------
// 1. Storage Manager (Chrome Storage Local with LocalStorage Fallback)
// --------------------------------------------------------------------------
const Storage = {
  get: (key) => new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([key], (res) => resolve(res[key]));
    } else {
      try {
        const val = localStorage.getItem(key);
        resolve(val ? JSON.parse(val) : null);
      } catch {
        resolve(localStorage.getItem(key));
      }
    }
  }),
  set: (key, value) => new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [key]: value }, resolve);
    } else {
      localStorage.setItem(key, typeof value === "object" ? JSON.stringify(value) : value);
      resolve();
    }
  }),
  remove: (key) => new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove([key], resolve);
    } else {
      localStorage.removeItem(key);
      resolve();
    }
  })
};

// --------------------------------------------------------------------------
// 2. Global State & Constants
// --------------------------------------------------------------------------
let state = {
  token: null,
  user: null,
  courses: [],
  sectionsCache: {}, // courseInstanceId -> sections array
  closCache: {}, // courseInstanceId -> CLOs array
  serverEnrollments: [], // array of real enrollment objects from GET /enrollments/me
  enrolledSectionMap: new Map(), // sectionId -> enrollmentId
  catalogFilter: "all", // "all" | "enrolled"
  notices: [],
  selectedDay: "today",
  isOffline: false
};

let refreshPromise = null; // Single-flight Promise lock for concurrent token refresh

const WEEKDAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" }
];

// SVG Icon Templates
const SVG_ICONS = {
  clock: `<svg class="inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  mapPin: `<svg class="inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  teacher: `<svg class="inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  pin: `<svg class="inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  check: `<svg class="inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  calendar: `<svg class="inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  book: `<svg class="inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
};

function debounce(fn, wait = 150) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

// --------------------------------------------------------------------------
// 3. API Request Wrapper with Thread-Safe Single-Flight Token Refresh
// --------------------------------------------------------------------------
async function apiRequest(endpoint, method = "GET", body = null, isRetry = false) {
  let token = await Storage.get("lms_token");
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "UET-LMS-Companion/0.1.0"
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const config = { method, headers };
  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 && endpoint !== "/auth/login" && !isRetry) {
        const refreshed = await silentSessionRefresh();
        if (refreshed) {
          return await apiRequest(endpoint, method, body, true);
        } else {
          await handleLogout(true);
        }
      }
      throw new Error(data.message || `HTTP ${response.status}`);
    }

    setOfflineStatus(false);
    return data;
  } catch (err) {
    if (method === "GET") {
      setOfflineStatus(true);
    }
    throw err;
  }
}

// Single-Flight Mutex for Session Refresh (Prevents Race Conditions)
async function silentSessionRefresh() {
  if (refreshPromise) {
    return await refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const creds = await Storage.get("lms_saved_creds");
      if (!creds || !creds.email || !creds.password) {
        return false;
      }

      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: creds.email, password: creds.password })
      });

      const data = await res.json();
      if (res.ok && data.accessToken) {
        await Storage.set("lms_token", data.accessToken);
        state.token = data.accessToken;
        return true;
      }
    } catch (err) {
      console.warn("[LMS Companion] Silent session refresh error:", err);
    }
    return false;
  })();

  try {
    const result = await refreshPromise;
    return result;
  } finally {
    refreshPromise = null;
  }
}

function setOfflineStatus(isOffline) {
  state.isOffline = isOffline;
  const offlineBadge = document.getElementById("badge-offline");
  if (offlineBadge) {
    if (isOffline) offlineBadge.classList.remove("hidden");
    else offlineBadge.classList.add("hidden");
  }
}

// --------------------------------------------------------------------------
// 4. Initialization & Event Listeners
// --------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await loadSavedEmail();
  initTabs();
  initListeners();

  const token = await Storage.get("lms_token");
  if (token) {
    state.token = token;
    showDashboard();
  } else {
    showLogin();
  }
});

async function loadSavedEmail() {
  const savedEmail = await Storage.get("lms_saved_email");
  const inputEmail = document.getElementById("input-email");
  if (savedEmail && inputEmail) {
    inputEmail.value = savedEmail;
  }
}

function initTabs() {
  const tabBtns = document.querySelectorAll(".editorial-tab");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const targetPane = document.getElementById(btn.dataset.target);
      if (targetPane) targetPane.classList.add("active");
    });
  });

  const dayChips = document.querySelectorAll(".day-chip");
  dayChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.id === "filter-catalog-all" || chip.id === "filter-catalog-enrolled") return;
      dayChips.forEach((c) => {
        if (c.id !== "filter-catalog-all" && c.id !== "filter-catalog-enrolled") c.classList.remove("active");
      });
      chip.classList.add("active");
      state.selectedDay = chip.dataset.day;

      const dateLabel = document.getElementById("schedule-date-label");
      if (dateLabel) {
        if (state.selectedDay === "today") dateLabel.innerText = "TODAY";
        else if (state.selectedDay === "all") dateLabel.innerText = "FULL WEEK SCHEDULE";
        else dateLabel.innerText = state.selectedDay.toUpperCase();
      }

      loadSchedule(state.selectedDay);
    });
  });

  const btnCatAll = document.getElementById("filter-catalog-all");
  const btnCatEnrolled = document.getElementById("filter-catalog-enrolled");

  if (btnCatAll && btnCatEnrolled) {
    btnCatAll.addEventListener("click", () => {
      btnCatAll.classList.add("active");
      btnCatEnrolled.classList.remove("active");
      state.catalogFilter = "all";
      renderCourses(state.courses);
    });

    btnCatEnrolled.addEventListener("click", () => {
      btnCatEnrolled.classList.add("active");
      btnCatAll.classList.remove("active");
      state.catalogFilter = "enrolled";
      renderCourses(state.courses);
    });
  }

  const searchInput = document.getElementById("search-course");
  if (searchInput) {
    searchInput.addEventListener("input", debounce((e) => {
      filterCourses(e.target.value);
    }, 150));
  }
}

function initListeners() {
  const loginForm = document.getElementById("form-login");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => handleLogout(false));
  }

  const refreshBtn = document.getElementById("btn-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      showToast("Refreshing journal data...");
      await loadDashboardData(true);
    });
  }

  const backNoticeBtn = document.getElementById("btn-back-to-notices");
  if (backNoticeBtn) {
    backNoticeBtn.addEventListener("click", () => {
      document.getElementById("view-notice-detail").classList.add("hidden");
      document.getElementById("view-dashboard").classList.remove("hidden");
    });
  }

  const backCatalogBtn = document.getElementById("btn-back-to-catalog");
  if (backCatalogBtn) {
    backCatalogBtn.addEventListener("click", () => {
      document.getElementById("view-clo-detail").classList.add("hidden");
      document.getElementById("view-dashboard").classList.remove("hidden");
    });
  }

  const feedbackBtn = document.getElementById("btn-open-feedback");
  if (feedbackBtn) {
    feedbackBtn.addEventListener("click", openFeedbackPage);
  }

  const feedbackProfileBtn = document.getElementById("btn-open-feedback-profile");
  if (feedbackProfileBtn) {
    feedbackProfileBtn.addEventListener("click", openFeedbackPage);
  }

  const btnGiveFeedback = document.getElementById("btn-prompt-give-feedback");
  if (btnGiveFeedback) {
    btnGiveFeedback.addEventListener("click", async () => {
      await Storage.set("opt_never_feedback", true);
      document.getElementById("banner-feedback-prompt").classList.add("hidden");
      openFeedbackPage();
    });
  }

  const btnRemindLater = document.getElementById("btn-prompt-remind-later");
  if (btnRemindLater) {
    btnRemindLater.addEventListener("click", async () => {
      const threeDaysLater = Date.now() + 3 * 24 * 60 * 60 * 1000;
      await Storage.set("opt_remind_feedback_timestamp", threeDaysLater);
      document.getElementById("banner-feedback-prompt").classList.add("hidden");
      showToast("Remind set for 3 days later");
    });
  }

  const btnNeverAgain = document.getElementById("btn-prompt-never-again");
  if (btnNeverAgain) {
    btnNeverAgain.addEventListener("click", async () => {
      await Storage.set("opt_never_feedback", true);
      document.getElementById("banner-feedback-prompt").classList.add("hidden");
      showToast("Feedback prompt suppressed");
    });
  }
}

function openNoticeDetailView(notice) {
  document.getElementById("view-dashboard").classList.add("hidden");
  document.getElementById("view-clo-detail").classList.add("hidden");
  const readerView = document.getElementById("view-notice-detail");

  document.getElementById("full-notice-title").innerText = notice.title || "Official Announcement";
  document.getElementById("full-notice-author").innerText = notice.creatorName || notice.createdBy || "Syed Tehseen Ul Hasan Shah";

  const d = notice.createdAt ? new Date(notice.createdAt) : new Date();
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  document.getElementById("full-notice-datetime").innerText = `${dateStr} • ${timeStr}`;
  document.getElementById("full-notice-body").innerText = notice.description || notice.content || "No details provided.";

  readerView.classList.remove("hidden");
}

async function openCloDetailView(courseInstanceId, courseName, courseCode) {
  document.getElementById("view-dashboard").classList.add("hidden");
  document.getElementById("view-notice-detail").classList.add("hidden");
  const cloView = document.getElementById("view-clo-detail");

  document.getElementById("clo-course-title").innerText = `Course Learning Outcomes`;
  document.getElementById("clo-course-code-tag").innerText = courseCode;
  document.getElementById("clo-course-full-name").innerText = courseName;

  const bodyContainer = document.getElementById("clo-full-body");
  bodyContainer.innerHTML = `<div class="editorial-skeleton" style="height:100px;"></div>`;
  cloView.classList.remove("hidden");

  try {
    const clos = await apiRequest(`/course-instances/${courseInstanceId}/clos`);
    state.closCache[courseInstanceId] = clos || [];

    if (Array.isArray(clos) && clos.length > 0) {
      bodyContainer.innerHTML = clos.map((clo, idx) => `
        <div class="clo-canvas-item">
          <span class="clo-item-code">${escapeHtml(clo.code || `CLO-${idx + 1}`)}</span>
          <p class="clo-item-desc">${escapeHtml(clo.description || clo.title || 'Course outcome objective.')}</p>
        </div>
      `).join("");
    } else {
      bodyContainer.innerHTML = `
        <div class="editorial-empty" style="padding:28px 10px;">
          <p style="font-size:12px; color:var(--text-muted); font-weight:600;">
            No Course Learning Outcomes (CLOs) published for <strong>${escapeHtml(courseCode)}</strong> yet.
          </p>
        </div>
      `;
    }
  } catch (err) {
    bodyContainer.innerHTML = `
      <div class="editorial-empty" style="padding:28px 10px;">
        <p style="font-size:12px; color:var(--text-muted);">Unable to load Course Learning Outcomes from server.</p>
      </div>
    `;
  }
}

function openFeedbackPage() {
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: "feedback.html" });
  } else {
    window.open("feedback.html", "_blank");
  }
}

async function checkFeedbackBanner() {
  const neverAsk = await Storage.get("opt_never_feedback");
  const remindTime = await Storage.get("opt_remind_feedback_timestamp");
  const banner = document.getElementById("banner-feedback-prompt");

  if (!banner) return;

  if (neverAsk) {
    banner.classList.add("hidden");
    return;
  }

  if (remindTime && Date.now() < remindTime) {
    banner.classList.add("hidden");
    return;
  }

  banner.classList.remove("hidden");
}

// --------------------------------------------------------------------------
// 5. Auth Handlers
// --------------------------------------------------------------------------
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("input-email").value.trim();
  const password = document.getElementById("input-password").value;
  const errorAlert = document.getElementById("login-error");
  const submitBtn = document.getElementById("btn-submit-login");

  errorAlert.classList.add("hidden");
  submitBtn.disabled = true;
  submitBtn.style.opacity = "0.7";

  try {
    const res = await apiRequest("/auth/login", "POST", { email, password });
    if (res.accessToken) {
      await Storage.set("lms_saved_email", email);
      await Storage.set("lms_saved_creds", { email, password });
      await Storage.set("lms_token", res.accessToken);
      state.token = res.accessToken;
      showToast("Session authenticated successfully!");
      showDashboard();
    } else {
      throw new Error("No token returned by server.");
    }
  } catch (err) {
    errorAlert.querySelector("span").innerText = err.message || "Invalid credentials";
    errorAlert.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    submitBtn.style.opacity = "1";
  }
}

async function handleLogout(isExpired = false) {
  await Storage.remove("lms_token");
  await Storage.remove("lms_saved_creds");
  await Storage.remove("cache_profile");
  await Storage.remove("cache_schedule");
  await Storage.remove("cache_courses");
  await Storage.remove("cache_notices");
  state.token = null;

  if (isExpired) {
    showToast("Session expired. Please sign in again.");
  } else {
    showToast("Signed out successfully");
  }

  showLogin();
  await loadSavedEmail();
}

function showLogin() {
  document.getElementById("view-login").classList.remove("hidden");
  document.getElementById("view-dashboard").classList.add("hidden");
  document.getElementById("view-notice-detail").classList.add("hidden");
  document.getElementById("view-clo-detail").classList.add("hidden");
  document.getElementById("btn-refresh").classList.add("hidden");
  document.getElementById("badge-semester").innerText = "OFFLINE";
}

function showDashboard() {
  document.getElementById("view-login").classList.add("hidden");
  document.getElementById("view-notice-detail").classList.add("hidden");
  document.getElementById("view-clo-detail").classList.add("hidden");
  document.getElementById("view-dashboard").classList.remove("hidden");
  document.getElementById("btn-refresh").classList.remove("hidden");

  checkFeedbackBanner();
  loadDashboardData();
}

// --------------------------------------------------------------------------
// 6. Data Loaders (SWR Pattern with Live Backend Server Sync)
// --------------------------------------------------------------------------
async function loadDashboardData(forceRefresh = false) {
  loadProfile(forceRefresh);
  loadSemester(forceRefresh);
  await loadServerEnrollments(forceRefresh);
  loadCourses(forceRefresh);
  loadNotices(forceRefresh);
  loadSchedule(state.selectedDay, forceRefresh);
}

async function loadServerEnrollments(forceRefresh = false) {
  try {
    const enrollments = await apiRequest("/enrollments/me");
    state.serverEnrollments = Array.isArray(enrollments) ? enrollments : [];
    
    state.enrolledSectionMap.clear();
    state.serverEnrollments.forEach((e) => {
      if (e.section?.id && e.enrollmentId) {
        state.enrolledSectionMap.set(e.section.id, e.enrollmentId);
      }
    });
  } catch (err) {
    console.warn("[LMS Companion] Could not fetch server enrollments:", err);
  }
}

async function loadProfile(forceRefresh = false) {
  const cached = await Storage.get("cache_profile");
  if (cached && !forceRefresh) {
    renderProfile(cached);
  }

  try {
    const user = await apiRequest("/user/me");
    state.user = user;
    await Storage.set("cache_profile", user);
    renderProfile(user);
  } catch (err) {
    if (!cached) console.error("Profile fetch error:", err);
  }
}

function renderProfile(user) {
  document.getElementById("user-full-name").innerText = user.name || "Student Name";
  document.getElementById("user-reg-no").innerText = user.registrationNo || "N/A";
  document.getElementById("user-email-text").innerText = user.email || "";

  const initials = (user.name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  document.getElementById("user-avatar-initial").innerText = initials;

  document.getElementById("stat-role").innerText = (user.role || "student").toUpperCase();
  document.getElementById("stat-term").innerText = user.currentSemester || "Fall 2026";
}

// Active Semester API Integration: GET /semesters/active
async function loadSemester(forceRefresh = false) {
  try {
    const sem = await apiRequest("/semesters/active");
    if (sem && sem.season) {
      document.getElementById("badge-semester").innerText = `VOL. ${sem.year} • ${sem.season.toUpperCase()}`;

      const bar = document.getElementById("active-semester-bar");
      if (bar) {
        document.getElementById("sem-val-mid").innerText = formatDateShort(sem.midDate);
        document.getElementById("sem-val-final").innerText = formatDateShort(sem.finalDate);
        bar.classList.remove("hidden");
      }

      if (sem.startDate && sem.endDate) {
        updateSemesterProgress(sem.startDate, sem.endDate);
      }
    }
  } catch (err) {
    document.getElementById("badge-semester").innerText = "VOL. 2026 • FALL";
  }
}

// Real-time Prominent Semester Progress Renderer
function updateSemesterProgress(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const now = new Date();

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, Math.round((end - start) / msPerDay));
  
  let elapsedDays = Math.round((now - start) / msPerDay);
  if (elapsedDays < 0) elapsedDays = 0;
  if (elapsedDays > totalDays) elapsedDays = totalDays;

  const pct = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));

  const pctBadge = document.getElementById("progress-percent-text");
  const fill = document.getElementById("progress-fill-bar");
  
  if (pctBadge) pctBadge.innerText = `${pct}% (${elapsedDays} of ${totalDays} days)`;
  if (fill) fill.style.width = `${pct}%`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function loadSchedule(day = "today", forceRefresh = false) {
  const container = document.getElementById("container-schedule");

  const cacheKey = `cache_schedule_${day}`;
  const cached = await Storage.get(cacheKey);
  if (cached && !forceRefresh) {
    renderSchedule(cached, day);
  } else if (!cached) {
    container.innerHTML = `<div class="editorial-skeleton"></div>`;
  }

  try {
    let data;
    if (day === "today") {
      data = await apiRequest("/timetable/today");
    } else {
      data = await apiRequest("/timetable");
    }

    data = mergeServerEnrollmentsToSchedule(data, day);

    await Storage.set(cacheKey, data);
    renderSchedule(data, day);
  } catch (err) {
    const fallbackData = mergeServerEnrollmentsToSchedule(null, day);
    renderSchedule(fallbackData, day);
  }
}

function mergeServerEnrollmentsToSchedule(apiData, day) {
  if (state.serverEnrollments.length === 0) return apiData;

  const generatedSchedule = {
    monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
  };
  const daysList = ["monday", "tuesday", "wednesday", "thursday", "friday"];

  state.serverEnrollments.forEach((e, idx) => {
    const sec = e.section || {};
    const course = sec.course || {};
    const instructor = sec.instructor || {};

    const assignedDay = daysList[idx % daysList.length];
    generatedSchedule[assignedDay].push({
      id: e.enrollmentId,
      subject: `${course.name || "Enrolled Course"} (Section ${sec.label || 'A'})`,
      courseCode: course.courseCode || "CS",
      time: idx % 2 === 0 ? "08:30 AM - 10:00 AM" : "11:00 AM - 12:30 PM",
      room: sec.shift === "morning" ? "Lecture Hall A" : "CS-Lab 1",
      teacher: instructor.name || "Department Instructor",
      isLab: false
    });
  });

  if (day === "today") {
    const todayKey = daysList[new Date().getDay() - 1] || "monday";
    const apiList = Array.isArray(apiData) ? apiData : [];
    return [...apiList, ...generatedSchedule[todayKey]];
  }

  const baseObj = (typeof apiData === "object" && apiData !== null) ? apiData : {};
  daysList.forEach((d) => {
    const baseArr = Array.isArray(baseObj[d]) ? baseObj[d] : [];
    baseObj[d] = [...baseArr, ...generatedSchedule[d]];
  });

  return baseObj;
}

function renderSchedule(data, day) {
  const container = document.getElementById("container-schedule");

  if (!data) {
    container.innerHTML = `
      <div class="editorial-empty">
        <p>No classes scheduled for selected view.</p>
      </div>
    `;
    return;
  }

  // 1. Full 7-Day Week View ("all")
  if (day === "all") {
    let html = "";
    let totalClassesCount = 0;

    for (const dayObj of WEEKDAYS) {
      const dayClasses = data[dayObj.key] || [];
      if (Array.isArray(dayClasses) && dayClasses.length > 0) {
        totalClassesCount += dayClasses.length;
        html += `<div class="day-section-title"><span>${dayObj.label}</span><span>${dayClasses.length} Classes</span></div>`;
        html += dayClasses.map(renderClassCard).join("");
      }
    }

    if (totalClassesCount > 0) {
      container.innerHTML = html;
    } else {
      container.innerHTML = `
        <div class="editorial-empty">
          <p>No class enrollments found for the entire week.</p>
        </div>
      `;
    }
    return;
  }

  // 2. Today's Classes View ("today")
  if (day === "today") {
    const list = Array.isArray(data) ? data : (data.monday || []);
    if (list.length > 0) {
      container.innerHTML = list.map(renderClassCard).join("");
    } else {
      container.innerHTML = `
        <div class="editorial-empty">
          <p>No classes scheduled for <strong>TODAY</strong></p>
        </div>
      `;
    }
    return;
  }

  // 3. Specific Day Selection
  const dayClasses = Array.isArray(data) ? data : (data[day] || []);
  if (Array.isArray(dayClasses) && dayClasses.length > 0) {
    container.innerHTML = dayClasses.map(renderClassCard).join("");
  } else {
    container.innerHTML = `
      <div class="editorial-empty">
        <p>No classes scheduled for <strong>${day.toUpperCase()}</strong></p>
      </div>
    `;
  }
}

function parseTimeRange(timeStr) {
  if (!timeStr) return { start: "Active", end: "" };
  const parts = timeStr.split("-").map((s) => s.trim());
  if (parts.length >= 2) {
    return { start: parts[0], end: parts[1] };
  }
  return { start: timeStr, end: "" };
}

function renderClassCard(item) {
  const { start, end } = parseTimeRange(item.time);
  
  let subjectName = item.subject || item.courseName || "Scheduled Class";
  let sectionLabel = "";
  
  const secMatch = subjectName.match(/\(Section\s+([^)]+)\)/i);
  if (secMatch) {
    sectionLabel = `SEC ${secMatch[1]}`;
    subjectName = subjectName.replace(/\(Section\s+[^)]+\)/i, "").trim();
  }

  return `
    <div class="timetable-agenda-card">
      <div class="time-pillar">
        <span class="pillar-start-time">${escapeHtml(start)}</span>
        ${end ? `<span class="pillar-end-time">${escapeHtml(end)}</span>` : ""}
      </div>

      <div class="timeline-vertical-track"></div>

      <div class="agenda-card-body">
        <div class="agenda-title-row">
          <span class="agenda-course-title" title="${escapeHtml(subjectName)}">${escapeHtml(subjectName)}</span>
          ${sectionLabel ? `<span class="agenda-sec-badge">${escapeHtml(sectionLabel)}</span>` : ""}
        </div>
        <div class="agenda-meta-row">
          <span class="meta-item">${SVG_ICONS.mapPin} ${escapeHtml(item.room || "Lecture Hall")}</span>
          <span class="meta-dot">•</span>
          <span class="meta-item">${SVG_ICONS.teacher} ${escapeHtml(item.teacher || "Faculty")}</span>
        </div>
      </div>
    </div>
  `;
}

async function loadCourses(forceRefresh = false) {
  const container = document.getElementById("container-courses");

  const cached = await Storage.get("cache_courses");
  if (cached && !forceRefresh) {
    state.courses = cached;
    renderCourses(cached);
  } else if (!cached) {
    container.innerHTML = `<div class="editorial-skeleton"></div>`;
  }

  try {
    const list = await apiRequest("/course-instances/offered");
    state.courses = list || [];
    await Storage.set("cache_courses", state.courses);

    const chip = document.getElementById("course-count-chip");
    if (chip) chip.innerText = `${state.courses.length} COURSES`;

    renderCourses(state.courses);
  } catch (err) {
    if (!cached) {
      container.innerHTML = `
        <div class="editorial-empty">
          <p>Unable to load course catalog.</p>
        </div>
      `;
    }
  }
}

function renderCourses(courses) {
  const container = document.getElementById("container-courses");

  if (!Array.isArray(courses) || courses.length === 0) {
    container.innerHTML = `
      <div class="editorial-empty">
        <p>No matching courses found.</p>
      </div>
    `;
    return;
  }

  let displayList = courses;
  if (state.catalogFilter === "enrolled") {
    displayList = courses.filter((ci) => {
      return state.serverEnrollments.some((e) => e.section?.courseInstanceId === ci.id);
    });
  }

  if (displayList.length === 0) {
    container.innerHTML = `
      <div class="editorial-empty">
        <p>No enrolled courses found.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = displayList.slice(0, 40).map((ci) => {
    const c = ci.course || {};
    const hasEnrolledSection = state.serverEnrollments.some((e) => e.section?.courseInstanceId === ci.id);

    return `
      <div class="editorial-accordion-card ${hasEnrolledSection ? 'is-enrolled' : ''}" id="card-course-${ci.id}">
        <div class="accordion-header" data-courseid="${ci.id}" data-cardid="card-course-${ci.id}">
          <div class="accordion-header-row">
            <div class="card-title-wrap">
              <span class="card-title-compact">${escapeHtml(c.name || "Course")}</span>
              ${hasEnrolledSection ? `<span class="badge-enrolled-tag">ENROLLED</span>` : ""}
            </div>
            <div class="card-badge-row">
              <span class="card-code">${escapeHtml(c.courseCode || "CS")}</span>
              <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
          
          <div class="card-details-single-line">
            <span>${c.creditHours || 2} Cr</span>
            <span>•</span>
            <span>${c.contactHours || c.creditHours || 2} Contact</span>
            <span>•</span>
            <span>${escapeHtml(ci.department || "CS")}</span>
            ${c.isLab ? `<span>•</span><span class="pill-lab">LAB</span>` : ""}
            <span>•</span>
            <button class="btn-open-clo-inline" data-courseid="${ci.id}" data-coursename="${escapeHtml(c.name || '')}" data-coursecode="${escapeHtml(c.courseCode || '')}">
              VIEW CLOs
            </button>
          </div>
        </div>

        <div class="accordion-drawer">
          <div class="section-list" id="section-list-${ci.id}">
            <div class="editorial-skeleton" style="height:40px;"></div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".accordion-header").forEach((header) => {
    header.addEventListener("click", async (e) => {
      if (e.target.closest(".btn-toggle-section") || e.target.closest(".btn-open-clo-inline")) return;
      const courseId = header.dataset.courseid;
      const card = document.getElementById(header.dataset.cardid);
      
      if (card) {
        const isOpen = card.classList.toggle("open");
        if (isOpen) {
          await loadAndRenderSections(courseId);
        }
      }
    });
  });

  container.querySelectorAll(".btn-open-clo-inline").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openCloDetailView(btn.dataset.courseid, btn.dataset.coursename, btn.dataset.coursecode);
    });
  });
}

async function loadAndRenderSections(courseInstanceId) {
  const container = document.getElementById(`section-list-${courseInstanceId}`);
  if (!container) return;

  if (state.sectionsCache[courseInstanceId]) {
    renderSectionsList(container, courseInstanceId, state.sectionsCache[courseInstanceId]);
    return;
  }

  try {
    const sections = await apiRequest(`/course-instances/${courseInstanceId}/sections`);
    state.sectionsCache[courseInstanceId] = sections || [];
    renderSectionsList(container, courseInstanceId, state.sectionsCache[courseInstanceId]);
  } catch (err) {
    container.innerHTML = `<div class="editorial-empty" style="padding:10px; font-size:11px;">Unable to fetch real sections.</div>`;
  }
}

function renderSectionsList(container, courseInstanceId, sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    container.innerHTML = `<div class="editorial-empty" style="padding:10px; font-size:11px;">No active sections offered.</div>`;
    return;
  }

  container.innerHTML = sections.map((sec) => {
    const enrollmentId = state.enrolledSectionMap.get(sec.id);
    const isEnrolled = !!enrollmentId;
    const instructorName = sec.instructor?.name || "Faculty Instructor";
    const designation = sec.instructor?.designation || "";

    return `
      <div class="section-item-row">
        <div class="section-info">
          <span class="section-badge-name">
            <span>Section ${escapeHtml(sec.label || 'A')}</span>
            <span>•</span>
            <span style="color:var(--text-muted); font-size:10px;">${escapeHtml(sec.shift || 'morning')}</span>
          </span>
          <span class="section-timing">${SVG_ICONS.teacher} ${escapeHtml(instructorName)} ${designation ? '(' + escapeHtml(designation) + ')' : ''}</span>
        </div>

        <button class="${isEnrolled ? 'btn-enrolled-action' : 'btn-enroll-action'} btn-toggle-section" data-secid="${sec.id}" data-seclabel="${sec.label}" data-enrollmentid="${enrollmentId || ''}">
          ${isEnrolled ? SVG_ICONS.check + ' Enrolled (Cancel)' : '+ Enroll Section'}
        </button>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".btn-toggle-section").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const secId = btn.dataset.secid;
      const secLabel = btn.dataset.seclabel;
      const enrollmentId = btn.dataset.enrollmentid;

      if (enrollmentId) {
        await cancelRealEnrollment(enrollmentId, secLabel);
      } else {
        await enrollRealSection(secId, secLabel);
      }
    });
  });
}

async function enrollRealSection(sectionId, secLabel) {
  try {
    showToast(`Submitting section enrollment...`);
    const res = await apiRequest(`/enrollments/sections/${sectionId}/enroll`, "POST");
    
    if (res.enrollmentId) {
      showToast(`Enrolled in Section ${secLabel}! ✦`);
      await loadServerEnrollments(true);
      renderCourses(state.courses);
      loadSchedule(state.selectedDay, true);
    }
  } catch (err) {
    showToast(`Enrollment update: ${err.message}`);
    await loadServerEnrollments(true);
    renderCourses(state.courses);
  }
}

async function cancelRealEnrollment(enrollmentId, secLabel) {
  try {
    showToast(`Canceling section enrollment...`);
    await apiRequest(`/enrollments/${enrollmentId}/cancel`, "PATCH");
    showToast(`Enrollment for Section ${secLabel} canceled`);
    
    await loadServerEnrollments(true);
    renderCourses(state.courses);
    loadSchedule(state.selectedDay, true);
  } catch (err) {
    showToast(`Cancel error: ${err.message}`);
    await loadServerEnrollments(true);
    renderCourses(state.courses);
  }
}

function filterCourses(query) {
  if (!query) {
    renderCourses(state.courses);
    return;
  }

  const q = query.toLowerCase();
  const filtered = state.courses.filter((ci) => {
    const c = ci.course || {};
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.courseCode && c.courseCode.toLowerCase().includes(q)) ||
      (c.abbreviation && c.abbreviation.toLowerCase().includes(q))
    );
  });

  renderCourses(filtered);
}

async function loadNotices(forceRefresh = false) {
  const container = document.getElementById("container-notices");

  const cached = await Storage.get("cache_notices");
  if (cached && !forceRefresh) {
    state.notices = cached;
    renderNotices(cached);
  } else if (!cached) {
    container.innerHTML = `<div class="editorial-skeleton"></div>`;
  }

  try {
    const res = await apiRequest("/notices");
    const notices = res.notices || [];
    state.notices = notices;
    await Storage.set("cache_notices", notices);
    renderNotices(notices);
  } catch (err) {
    if (!cached) {
      container.innerHTML = `
        <div class="editorial-empty">
          <p>Gazette up to date.</p>
        </div>
      `;
    }
  }
}

function renderNotices(notices) {
  const container = document.getElementById("container-notices");

  if (Array.isArray(notices) && notices.length > 0) {
    container.innerHTML = notices.map((n, idx) => `
      <div class="editorial-item-card notice-card-clickable" data-idx="${idx}">
        <div class="card-top">
          <span class="card-title">${escapeHtml(n.title || "Notice")}</span>
          <span class="editorial-chip" style="font-size:9px;">READ FULL</span>
        </div>
        <p style="font-size: 11px; color: var(--text-muted); margin-top:4px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${escapeHtml(n.description || n.content || "")}
        </p>
      </div>
    `).join("");

    container.querySelectorAll(".notice-card-clickable").forEach((card) => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.dataset.idx, 10);
        if (notices[idx]) {
          openNoticeDetailView(notices[idx]);
        }
      });
    });
  } else {
    container.innerHTML = `
      <div class="editorial-empty">
        <p>No active announcements on the bulletin.</p>
      </div>
    `;
  }
}

// --------------------------------------------------------------------------
// 7. Toast & Helper Utilities
// --------------------------------------------------------------------------
function showToast(message) {
  const toast = document.getElementById("toast-banner");
  const msgSpan = document.getElementById("toast-message");

  msgSpan.innerText = message;
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 2500);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[m]);
}
