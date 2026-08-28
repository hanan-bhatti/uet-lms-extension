/**
 * UET CS LMS Companion — Manifest V3 Background Service Worker
 * Architecture: Service Worker Lifecycle, Alarms, Extension Badges, Cross-Script Messaging
 * Author: Abdul Hannan Bhatti (https://github.com/hanan-bhatti)
 * License: AGPL-3.0
 */

const BASE_URL = "https://api-lms.iotpro.uk";
const ALARM_NAME = "lms-sync-alarm";
const SYNC_INTERVAL_MINS = 30;

// --------------------------------------------------------------------------
// 1. Service Worker Lifecycle Hooks
// --------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`[UET LMS Service Worker] Installed. Reason: ${details.reason}`);

  // Create background periodic alarm
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINS
  });

  // Sync initial badge state
  await updateScheduleBadge();
});

// --------------------------------------------------------------------------
// 2. Alarm Listener for Periodic Sync
// --------------------------------------------------------------------------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("[UET LMS Service Worker] Running periodic background sync...");
    await updateScheduleBadge();
  }
});

// --------------------------------------------------------------------------
// 3. Message Passing Listener (Popups & Options)
// --------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_BADGE") {
    updateScheduleBadge().then(() => sendResponse({ status: "ACK" }));
    return true; // Keep channel open for async response
  }

  if (message.type === "CLEAR_BADGE") {
    chrome.action.setBadgeText({ text: "" });
    sendResponse({ status: "ACK" });
    return true;
  }

  if (message.type === "GET_BG_STATUS") {
    sendResponse({ status: "ONLINE", version: "0.1.0-beta" });
    return true;
  }
});

// --------------------------------------------------------------------------
// 4. Background Sync Helper: Fetch Timetable & Update Extension Badge
// --------------------------------------------------------------------------
async function updateScheduleBadge() {
  try {
    const res = await chrome.storage.local.get(["lms_token"]);
    const token = res.lms_token;

    if (!token) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }

    const response = await fetch(`${BASE_URL}/timetable/today`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        await chrome.storage.local.remove(["lms_token"]);
        chrome.action.setBadgeText({ text: "" });
      }
      return;
    }

    const todayClasses = await response.json();
    if (Array.isArray(todayClasses) && todayClasses.length > 0) {
      chrome.action.setBadgeText({ text: todayClasses.length.toString() });
      chrome.action.setBadgeBackgroundColor({ color: "#e63946" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (err) {
    console.warn("[UET LMS Service Worker] Sync error:", err);
  }
}
