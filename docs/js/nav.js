// Danube Vessel Log
// File: docs/js/nav.js
// Version: 0.13.8
// Updated: 2026-07-27

"use strict";

(function () {
  function currentPageId() {
    const file =
      window.location.pathname
        .split("/")
        .pop() ||
      "submissions.html";
  
    /*
     * Die Detailseite gehört zum
     * Navigationsbereich „Schiffe“.
     */
    if (file === "vessel.html") {
      return "vessels";
    }
  
    const navigation =
      Array.isArray(
        window.VesselSite?.navigation
      )
        ? window.VesselSite.navigation
        : [];
  
    const matchingItem =
      navigation.find(item => {
        const itemFile =
          String(item?.href ?? "")
            .split(/[?#]/)[0]
            .split("/")
            .pop();
  
        return itemFile === file;
      });
  
    return matchingItem?.id ?? "";
  }

  function renderNavigation() {
    const target = document.querySelector("[data-site-nav]");
    if (!target) return;

    const items = Array.isArray(window.VesselSite?.navigation)
      ? window.VesselSite.navigation
      : [];
    const activeId = currentPageId();

    const nav = document.createElement("nav");
    nav.className = "site-nav";
    nav.setAttribute("aria-label", "Hauptnavigation");

    const brand = document.createElement("a");
    brand.className = "site-brand";
    brand.href = "submissions.html";
    brand.textContent = "Danube Vessel Log";
    nav.appendChild(brand);

    const links = document.createElement("div");
    links.className = "site-nav-links";

    for (const item of items) {
      const link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.label;
      link.className = "site-nav-link";
      if (item.id === activeId) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
      links.appendChild(link);
    }

    nav.appendChild(links);
    target.replaceChildren(nav);
  }

  document.addEventListener("DOMContentLoaded", renderNavigation);
})();
