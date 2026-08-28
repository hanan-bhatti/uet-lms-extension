/**
 * UET CS LMS Companion — Feedback Controller
 * Converts user feedback into pre-formatted GitHub Issues
 * Author: Abdul Hannan Bhatti (https://github.com/hanan-bhatti)
 * License: AGPL-3.0
 */

let selectedStar = 4;

document.addEventListener("DOMContentLoaded", () => {
  const starBtns = document.querySelectorAll(".star-btn");
  starBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedStar = parseInt(btn.dataset.star, 10);
      starBtns.forEach((b, idx) => {
        if (idx < selectedStar) b.classList.add("active");
        else b.classList.remove("active");
      });
    });
  });

  const submitBtn = document.getElementById("btn-submit-feedback");
  submitBtn.addEventListener("click", () => {
    const category = document.getElementById("feedback-category").value;
    const details = document.getElementById("feedback-text").value.trim();

    if (!details) {
      alert("Please enter details before submitting.");
      return;
    }

    const title = encodeURIComponent(`[${category}] ${details.substring(0, 50)}...`);
    const body = encodeURIComponent(
      `**Category**: ${category}\n` +
      `**Rating**: ${"★".repeat(selectedStar)} (${selectedStar}/5)\n\n` +
      `**Description / Details**:\n${details}\n\n` +
      `--- \n*Submitted via UET LMS Companion Feedback Page*`
    );

    const issueUrl = `https://github.com/hanan-bhatti/uet-lms-extension/issues/new?title=${title}&body=${body}`;
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: issueUrl });
    } else {
      window.open(issueUrl, "_blank");
    }
  });
});
