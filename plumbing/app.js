/**
 * Emergency Plumbing – vanilla JS
 * Mobile nav toggle, click-to-call tracking (console), callback form (no backend).
 */

(function () {
  "use strict";

  // ---------- DOM refs ----------
  var navToggle = document.querySelector(".nav-toggle");
  var mainNav = document.querySelector("#main-nav");
  var callButtons = document.querySelectorAll(".btn-call, .nav-cta[href^='tel']");
  var callbackForm = document.getElementById("callback-form");
  var yearEl = document.getElementById("year");

  // ---------- Mobile nav toggle ----------
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      var expanded = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-expanded", !expanded);
      mainNav.classList.toggle("is-open");
    });

    // Close menu when clicking a nav link (for in-page anchors)
    mainNav.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function () {
        navToggle.setAttribute("aria-expanded", "false");
        mainNav.classList.remove("is-open");
      });
    });
  }

  // ---------- Click-to-call tracking (console only, no backend) ----------
  callButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var track = btn.getAttribute("data-track") || "unknown";
      console.log("[Plumbing] Click-to-call from: " + track);
    });
  });

  // ---------- Callback form – client-side only, no submit to server ----------
  if (callbackForm) {
    callbackForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var nameInput = document.getElementById("callback-name");
      var phoneInput = document.getElementById("callback-phone");
      var name = nameInput && nameInput.value ? nameInput.value.trim() : "";
      var phone = phoneInput && phoneInput.value ? phoneInput.value.trim() : "";

      if (!name || !phone) {
        alert("Please enter your name and phone number.");
        return;
      }

      // No backend: just log and show confirmation
      console.log("[Plumbing] Callback requested – name: " + name + ", phone: " + phone);
      alert("Thanks! We'll call you back at " + phone + " as soon as possible.");
      callbackForm.reset();
    });
  }

  // ---------- Footer year ----------
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
})();
