# 🎓 UET LMS Companion — Chrome Extension (Beta v0.1.0)

![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-212529?style=for-the-badge&logo=googlechrome&logoColor=white)
![Design System](https://img.shields.io/badge/Design_System-Monochrome_Dark-343a40?style=for-the-badge)
![License](https://img.shields.io/badge/License-AGPL--3.0-495057?style=for-the-badge)
![API Backend](https://img.shields.io/badge/API-NestJS_JWT-6c757d?style=for-the-badge)

A high-craft **Manifest V3 Chrome Extension** for students at the **University of Engineering & Technology (UET) Department of Computer Science**. Built directly on top of the reverse-engineered **NestJS REST API** (`https://api-lms.iotpro.uk/`), delivering real-time class timetables, interactive course catalog search, real-time section enrollments, canvas-native Course Learning Outcomes (CLOs), live bulletin notice boards, and student analytics.

> **Developer & Author**: [Abdul Hannan Bhatti](https://github.com/hanan-bhatti) • [Portfolio Website](https://hanan-bhatti.site/)

---

## 🎨 Color Palette & Monochrome Design System

Designed using a refined high-contrast monochrome dark color palette:

```css
--bright-snow:    #f8f9fa; /* High-Contrast Headings & Primary Text */
--platinum:       #e9ecef; /* Body Text & Elevated Accents */
--alabaster-grey: #dee2e6; /* Active Borders & Divider Rules */
--pale-slate:     #ced4da; /* Subtle Borders & Outline Focus Rings */
--pale-slate-2:   #adb5bd; /* Muted Metadata, Timings & Subtitles */
--slate-grey:     #6c757d; /* Inactive Tabs & Secondary Action Borders */
--iron-grey:      #495057; /* Primary Active Buttons & Elevated Monograms */
--gunmetal:       #343a40; /* Card Containers, Headers & Navigation Bar */
--carbon-black:   #212529; /* Primary Page Background Canvas */
```

---

## 🚀 Key Features & Architecture

- ⚡ **Manifest V3 Service Worker (`background.js`)**: Background alarms (`chrome.alarms`) sync class timetables and update dynamic class counters on the extension badge icon (`chrome.action.setBadgeText`).
- 🔑 **Secure Auth & Silent Refresh**: Connects securely to `POST /auth/login`, stores JWT tokens in encrypted Chrome storage, and silently refreshes expired sessions automatically.
- 📅 **Full 7-Day Timetable**: Inspect daily schedules for Today, All Week, or specific weekdays (`Mon`–`Sun`) with instructor designations and lecture hall locations.
- 📚 **Course Catalog & Real Section Enrollments**: Search across 51+ course offerings, inspect real section instructors, and submit or cancel section enrollments with live backend REST API sync (`POST /enrollments/sections/:id/enroll` & `PATCH /enrollments/:id/cancel`).
- 📖 **Canvas-Native Course Learning Outcomes (CLO Reader)**: Full-screen canvas reader view fetching live CLOs directly from the NestJS Postgres database (`GET /course-instances/:id/clos`).
- 📢 **Gazette & Bulletin Board**: Full-screen single-line reader view for official department announcements and faculty notices.
- 👤 **Ultra-Compact Profile**: Monogram avatar, student registration number, current semester info, 3-column stats grid, and quick actions.
- 💬 **Container-Less Community Feedback Page**: Standalone feedback submitter (`feedback.html`) with custom select dropdown styling, rating stars, and GitHub issue tracker integration.

---

## 🛠️ Installation Guide

### Prerequisites
- Google Chrome, Brave, Microsoft Edge, or any Chromium-based browser.

### Steps to Install Unpacked

1. **Clone Repository**:
   ```bash
   git clone https://github.com/hanan-bhatti/uet-lms-extension.git
   ```

2. **Open Extensions Page**:
   - In Chrome, navigate to `chrome://extensions/`.

3. **Enable Developer Mode**:
   - Toggle **Developer mode** in the top right corner.

4. **Load Unpacked Extension**:
   - Click **Load unpacked** in the top left.
   - Select the `uet-lms-extension` directory.

5. **Sign In**:
   - Launch the extension popup and enter your official UET LMS credentials (`e.g., student@student.uet.edu.pk`).

---

## 🏗️ Project Architecture

```
uet-lms-extension/
├── manifest.json       # Chrome Manifest V3 configuration & permissions
├── background.js       # Background Service Worker, Alarms & Badge Sync
├── popup.html          # HTML5 Journal Layout (Playfair Display & Outfit)
├── popup.css           # Monochrome Dark Design System tokens
├── popup.js            # Async REST API Client, SWR Caching, & Search Filter
├── feedback.html       # Container-less Community Feedback Submitter
├── feedback.js         # Feedback Form Controller & Star Rating Handler
├── options.html        # Extension Options & Preferences UI
├── options.js          # Options Controller (Background alarms & storage sync)
├── icons/              # Minimalist SVG & PNG extension icons (16px, 48px, 128px)
├── LICENSE             # GNU Affero General Public License v3.0 (AGPL-3.0)
└── README.md           # Project Documentation
```

---

## 👤 Author & Credits

Designed and developed by **Abdul Hannan Bhatti**.

- **GitHub**: [@hanan-bhatti](https://github.com/hanan-bhatti)
- **Repository**: [github.com/hanan-bhatti/uet-lms-extension](https://github.com/hanan-bhatti/uet-lms-extension)
- **Portfolio Website**: [hanan-bhatti.site](https://hanan-bhatti.site/)
- **Email**: `2025scs136@student.uet.edu.pk` / `hannanbhatti2006@gmail.com`

---

## 📄 License

Licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See `LICENSE` for details.
