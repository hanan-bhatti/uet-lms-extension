# 🎓 UET LMS Companion — Editorial Chrome Extension

![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-1d3557?style=for-the-badge&logo=googlechrome&logoColor=white)
![Design System](https://img.shields.io/badge/Design_System-Editorial_Serif-e63946?style=for-the-badge)
![API Backend](https://img.shields.io/badge/API-NestJS_JWT-457b9d?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-a8dadc?style=for-the-badge)

A high-craft **Editorial Design Chrome Extension** for students at the **University of Engineering & Technology (UET) Department of Computer Science**. Built directly on top of the reverse-engineered **NestJS REST API** (`https://api-lms.iotpro.uk/`), delivering real-time class timetables, interactive course search, live bulletin notice boards, and student analytics.

> **Developer & Author**: [Abdul Hannan Bhatti](https://github.com/hanan-bhatti) • [Portfolio Website](https://hanan-bhatti.site/)

---

## 🎨 Color Palette & Design Tokens

Crafted using a high-contrast editorial color system:

```css
--punch-red:    #e63946; /* Vivid Crimson Punch - Primary Buttons & Active Pills */
--honeydew:     #f1faee; /* Soft Pale Mint - Light Mode Canvas & Text Contrast */
--frosted-blue: #a8dadc; /* Frosted Blue - Soft Highlights & Time Badges */
--cerulean:     #457b9d; /* Deep Cerulean - Secondary Text, Borders & Subtitles */
--oxford-navy:  #1d3557; /* Rich Oxford Navy - Dark Mode Canvas & Monogram Logo */
```

---

## 🚀 Features

- 🔑 **Secure Authentication**: Connects securely to `POST /auth/login` and stores JWT session tokens in encrypted Chrome local storage.
- 📅 **Full 7-Day Timetable**: View today's schedule or inspect the entire week (`Mon`–`Sun`) with daily section dividers and instructor info.
- 📚 **Course Catalog & Live Search**: Instant debounced search across **51+ course offerings** with credit hour badges and lab tags.
- 📢 **Gazette & Bulletin Board**: Real-time access to department notices and academic announcements.
- 👤 **Student Directory & Profile**: Displays student registration number, academic role, and current semester details.
- ⚡ **0ms SWR Caching**: Instant rendering from local storage cache with automated background revalidation & offline recovery.

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
   - Launch the extension popup and enter your official UET LMS email (`e.g., student@student.uet.edu.pk`) and password.

---

## 🏗️ Project Architecture

```
uet-lms-extension/
├── manifest.json       # Chrome Manifest V3 configuration & permissions
├── popup.html          # HTML5 Editorial Journal Layout (Playfair Display & Outfit fonts)
├── popup.css           # Editorial Design System tokens (Oxford Navy & Punch Red)
├── popup.js            # Async REST API Client, SWR Caching, & Search Filter
├── icons/              # Extension icons (16px, 48px, 128px)
└── README.md           # Documentation annotated with author profile
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

Distributed under the MIT License. See `LICENSE` for details.
