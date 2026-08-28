/**
 * UET CS LMS Companion — Anti-Slop Editorial Edition (Beta v0.1.0) Controller
 * Optimizations: SWR Caching, Debounced Filtering, Offline Fallback, Onboarding Flow
 * Author: Abdul Hannan Bhatti (https://github.com/hanan-bhatti)
 */

const BASE_URL = "https://api-lms.iotpro.uk";
const GITHUB_ISSUES_URL = "https://github.com/hanan-bhatti/uet-lms-extension/issues/new";

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
  theme: "dark",
  token: null,
  user: null,
  courses: [],
  selectedDay: "today",
  isOffline: false
};

const WEEKDAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" }
];

// Debounce Utility
function debounce(fn, wait = 150) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

// --------------------------------------------------------------------------
// 3. API Request Wrapper with Error Handling & Offline State
// --------------------------------------------------------------------------
async function apiRequest(endpoint, method = "GET", body = null) {
  const token = await Storage.get("lms_token");
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
      if (response.status === 401 && endpoint !== "/auth/login") {
        await handleLogout();
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
  await initTheme();
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

// Theme Management
async function initTheme() {
  const savedTheme = await Storage.get("lms_theme") || "dark";
  setTheme(savedTheme);

  const themeBtn = document.getElementById("btn-theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", async () => {
      const nextTheme = state.theme === "dark" ? "light" : "dark";
      await setTheme(nextTheme);
    });
  }
}

async function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  await Storage.set("lms_theme", theme);

  const iconSun = document.getElementById("icon-sun");
  const iconMoon = document.getElementById("icon-moon");

  if (theme === "dark") {
    iconSun.classList.remove("hidden");
    iconMoon.classList.add("hidden");
  } else {
    iconSun.classList.add("hidden");
    iconMoon.classList.remove("hidden");
  }
}

// Navigation Tabs & Day Bar
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

  // Day Selector Bar (Supports Today, All Week, Mon-Sun)
  const dayChips = document.querySelectorAll(".day-chip");
  dayChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      dayChips.forEach((c) => c.classList.remove("active"));
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

  // Debounced Course Search Filter
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
    logoutBtn.addEventListener("click", handleLogout);
  }

  const refreshBtn = document.getElementById("btn-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      showToast("Refreshing journal data...");
      await loadDashboardData(true);
    });
  }

  // GitHub Issue Triggers
  const reportIssueBtn = document.getElementById("btn-report-issue");
  if (reportIssueBtn) {
    reportIssueBtn.addEventListener("click", openGitHubIssues);
  }

  const openIssuesTabBtn = document.getElementById("btn-open-issues-tab");
  if (openIssuesTabBtn) {
    openIssuesTabBtn.addEventListener("click", openGitHubIssues);
  }
}

function openGitHubIssues() {
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: GITHUB_ISSUES_URL });
  } else {
    window.open(GITHUB_ISSUES_URL, "_blank");
  }
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
      await Storage.set("lms_token", res.accessToken);
      state.token = res.accessToken;
      showToast("Session authenticated successfully! ✦");
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

async function handleLogout() {
  await Storage.remove("lms_token");
  await Storage.remove("cache_profile");
  await Storage.remove("cache_schedule");
  await Storage.remove("cache_courses");
  await Storage.remove("cache_notices");
  state.token = null;
  showToast("Session terminated");
  showLogin();
}

function showLogin() {
  document.getElementById("view-login").classList.remove("hidden");
  document.getElementById("view-dashboard").classList.add("hidden");
  document.getElementById("btn-refresh").classList.add("hidden");
  document.getElementById("badge-semester").innerText = "OFFLINE";
}

function showDashboard() {
  document.getElementById("view-login").classList.add("hidden");
  document.getElementById("view-dashboard").classList.remove("hidden");
  document.getElementById("btn-refresh").classList.remove("hidden");

  loadDashboardData();
}

// --------------------------------------------------------------------------
// 6. Data Loaders (SWR Pattern)
// --------------------------------------------------------------------------
async function loadDashboardData(forceRefresh = false) {
  loadProfile(forceRefresh);
  loadSemester(forceRefresh);
  loadSchedule(state.selectedDay, forceRefresh);
  loadCourses(forceRefresh);
  loadNotices(forceRefresh);
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

async function loadSemester(forceRefresh = false) {
  try {
    const sem = await apiRequest("/semesters/active");
    if (sem && sem.season) {
      document.getElementById("badge-semester").innerText = `VOL. ${sem.year} • ${sem.season.toUpperCase()}`;
    }
  } catch (err) {
    document.getElementById("badge-semester").innerText = "VOL. 2026 • FALL";
  }
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

    await Storage.set(cacheKey, data);
    renderSchedule(data, day);
  } catch (err) {
    if (!cached) {
      container.innerHTML = `
        <div class="editorial-empty">
          <div class="empty-icon">📜</div>
          <p>No classes scheduled for selected view.</p>
        </div>
      `;
    }
  }
}

function renderSchedule(data, day) {
  const container = document.getElementById("container-schedule");

  // 1. Full 7-Day Week View ("all")
  if (day === "all") {
    let html = "";
    let totalClassesCount = 0;

    for (const dayObj of WEEKDAYS) {
      const dayClasses = data[dayObj.key] || [];
      if (Array.isArray(dayClasses) && dayClasses.length > 0) {
        totalClassesCount += dayClasses.length;
        html += `<div class="day-section-title"><span>✦ ${dayObj.label}</span><span>${dayClasses.length} Classes</span></div>`;
        html += dayClasses.map(renderClassCard).join("");
      }
    }

    if (totalClassesCount > 0) {
      container.innerHTML = html;
    } else {
      container.innerHTML = `
        <div class="editorial-empty">
          <div class="empty-icon">✦</div>
          <p>No class enrollments found for the entire week.</p>
        </div>
      `;
    }
    return;
  }

  // 2. Today's Classes View ("today")
  if (day === "today") {
    if (Array.isArray(data) && data.length > 0) {
      container.innerHTML = data.map(renderClassCard).join("");
    } else {
      container.innerHTML = `
        <div class="editorial-empty">
          <div class="empty-icon">✦</div>
          <p>No classes scheduled for <strong>TODAY</strong></p>
        </div>
      `;
    }
    return;
  }

  // 3. Specific Day Selection
  const dayClasses = data[day] || [];
  if (Array.isArray(dayClasses) && dayClasses.length > 0) {
    container.innerHTML = dayClasses.map(renderClassCard).join("");
  } else {
    container.innerHTML = `
      <div class="editorial-empty">
        <div class="empty-icon">📜</div>
        <p>No classes scheduled for <strong>${day.toUpperCase()}</strong></p>
      </div>
    `;
  }
}

function renderClassCard(item) {
  return `
    <div class="editorial-item-card">
      <div class="card-top">
        <span class="card-title">${escapeHtml(item.subject || item.courseName || "Scheduled Class")}</span>
        <span class="pill-time">${escapeHtml(item.time || "Active")}</span>
      </div>
      <div class="card-details">
        <span>📍 ${escapeHtml(item.room || "Hall / Lab")}</span>
        <span>•</span>
        <span>👨‍🏫 ${escapeHtml(item.teacher || "Instructor")}</span>
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

  container.innerHTML = courses.slice(0, 35).map((ci) => {
    const c = ci.course || {};
    return `
      <div class="editorial-item-card">
        <div class="card-top">
          <span class="card-title">${escapeHtml(c.name || "Course")}</span>
          <span class="card-code">${escapeHtml(c.courseCode || "CS")}</span>
        </div>
        <div class="card-details">
          <span>${c.creditHours || 3} Credit Hours</span>
          <span>•</span>
          <span>Dept: ${escapeHtml(ci.department || "CS")}</span>
          ${c.isLab ? `<span class="pill-lab">LAB</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
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
    renderNotices(cached);
  } else if (!cached) {
    container.innerHTML = `<div class="editorial-skeleton"></div>`;
  }

  try {
    const res = await apiRequest("/notices");
    const notices = res.notices || [];
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
    container.innerHTML = notices.map((n) => `
      <div class="editorial-item-card">
        <div class="card-top">
          <span class="card-title">${escapeHtml(n.title || "Notice")}</span>
        </div>
        <p style="font-size: 11px; color: var(--text-muted); margin-top:4px; line-height: 1.4;">
          ${escapeHtml(n.content || n.description || "")}
        </p>
      </div>
    `).join("");
  } else {
    container.innerHTML = `
      <div class="editorial-empty">
        <div class="empty-icon">📢</div>
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
