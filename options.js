/**
 * UET CS LMS Companion — Options & Settings Controller
 * Author: Abdul Hannan Bhatti (https://github.com/hanan-bhatti)
 * License: AGPL-3.0
 */

document.addEventListener("DOMContentLoaded", async () => {
  const chkBadge = document.getElementById("chk-enable-badge");
  const selSync = document.getElementById("sel-sync-interval");
  const selTab = document.getElementById("sel-default-tab");

  // Load saved preferences
  const settings = await chrome.storage.local.get([
    "opt_enable_badge",
    "opt_sync_interval",
    "opt_default_tab"
  ]);

  if (settings.opt_enable_badge !== undefined) {
    chkBadge.checked = settings.opt_enable_badge;
  }
  if (settings.opt_sync_interval) {
    selSync.value = settings.opt_sync_interval;
  }
  if (settings.opt_default_tab) {
    selTab.value = settings.opt_default_tab;
  }

  // Save changes on user input
  chkBadge.addEventListener("change", async () => {
    await chrome.storage.local.set({ opt_enable_badge: chkBadge.checked });
    if (!chkBadge.checked) {
      chrome.runtime.sendMessage({ type: "CLEAR_BADGE" });
    } else {
      chrome.runtime.sendMessage({ type: "UPDATE_BADGE" });
    }
  });

  selSync.addEventListener("change", async () => {
    const mins = parseInt(selSync.value, 10);
    await chrome.storage.local.set({ opt_sync_interval: mins });
    await chrome.alarms.create("lms-sync-alarm", { periodInMinutes: mins });
  });

  selTab.addEventListener("change", async () => {
    await chrome.storage.local.set({ opt_default_tab: selTab.value });
  });
});
