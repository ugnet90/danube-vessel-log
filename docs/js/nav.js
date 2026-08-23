// Danube Vessel Log
// File: docs/js/nav.js
// Version: 0.14.45
// Updated: 2026-08-23

"use strict";

(function () {
  const SESSION_API_KEY =
    "danube-vessel-log:management-api-key";

  function currentPageId() {
    const file =
      window.location.pathname
        .split("/")
        .pop() ||
      "dashboard.html";

    if (
      file === "index.html" ||
      file === "" ||
      file === "dashboard.html"
    ) {
      return "dashboard";
    }

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

  function readSessionApiKey() {
    try {
      return sessionStorage.getItem(
        SESSION_API_KEY
      ) || "";
    } catch {
      return "";
    }
  }

  function storeSessionApiKey(value) {
    try {
      if (value) {
        sessionStorage.setItem(
          SESSION_API_KEY,
          value
        );
      } else {
        sessionStorage.removeItem(
          SESSION_API_KEY
        );
      }
    } catch {
      // Die Oberfläche funktioniert auch ohne sessionStorage.
    }
  }

  function createNavigationLink(
    item,
    activeId,
    className
  ) {
    const link =
      document.createElement("a");

    link.href = item.href;
    link.textContent = item.label;
    link.className = className;

    if (item.id === activeId) {
      link.classList.add("active");
      link.setAttribute(
        "aria-current",
        "page"
      );
    }

    return link;
  }

  function prepareSettings() {
    const source =
      document.querySelector(
        "[data-api-key-settings]"
      );

    if (!source) {
      return null;
    }

    const input =
      source.querySelector("#apiKey");

    const field =
      input?.closest(".form-field");

    if (!input || !field) {
      return null;
    }

    const saved = readSessionApiKey();

    if (!input.value && saved) {
      input.value = saved;
    }

    const label =
      field.querySelector(
        'label[for="apiKey"]'
      );

    if (label) {
      label.textContent =
        "Management-API-Schlüssel";
    }

    field.classList.add(
      "site-settings-field"
    );

    input.addEventListener(
      "input",
      () => {
        storeSessionApiKey(
          input.value.trim()
        );
      }
    );

    source.remove();

    return { input, field };
  }

  function renderNavigation() {
    const target =
      document.querySelector(
        "[data-site-nav]"
      );

    if (!target) {
      return;
    }

    const items =
      Array.isArray(
        window.VesselSite?.navigation
      )
        ? window.VesselSite.navigation
        : [];

    const activeId = currentPageId();
    const settings = prepareSettings();

    const nav =
      document.createElement("nav");

    nav.className = "site-nav";
    nav.setAttribute(
      "aria-label",
      "Hauptnavigation"
    );

    const brand =
      document.createElement("a");

    brand.className = "site-brand";
    brand.href = "dashboard.html";
    brand.textContent =
      "Danube Vessel Log";

    nav.appendChild(brand);

    const links =
      document.createElement("div");

    links.className = "site-nav-links";

    for (const item of items) {
      links.appendChild(
        createNavigationLink(
          item,
          activeId,
          "site-nav-link"
        )
      );
    }

    let settingsPanel = null;
    let settingsButton = null;

    function closeMenu() {
      mobileMenu.classList.add(
        "hidden"
      );
      menuButton.setAttribute(
        "aria-expanded",
        "false"
      );
    }

    function closeSettings() {
      if (!settingsPanel) return;
      settingsPanel.classList.add(
        "hidden"
      );
      settingsButton?.setAttribute(
        "aria-expanded",
        "false"
      );
      mobileSettingsButton?.setAttribute(
        "aria-expanded",
        "false"
      );
    }

    function openSettings() {
      if (!settingsPanel) return;
      closeMenu();
      settingsPanel.classList.remove(
        "hidden"
      );
      settingsButton?.setAttribute(
        "aria-expanded",
        "true"
      );
      mobileSettingsButton?.setAttribute(
        "aria-expanded",
        "true"
      );
      window.setTimeout(
        () => settings.input.focus(),
        0
      );
    }

    function toggleSettings() {
      if (!settingsPanel) return;
      if (
        settingsPanel.classList.contains(
          "hidden"
        )
      ) {
        openSettings();
      } else {
        closeSettings();
      }
    }

    if (settings) {
      settingsButton =
        document.createElement("button");

      settingsButton.type = "button";
      settingsButton.className =
        "site-nav-link site-nav-settings-button";
      settingsButton.textContent =
        "Einstellungen";
      settingsButton.setAttribute(
        "aria-expanded",
        "false"
      );

      links.appendChild(
        settingsButton
      );
    }

    nav.appendChild(links);

    const menuButton =
      document.createElement("button");

    menuButton.type = "button";
    menuButton.className =
      "site-nav-toggle";
    menuButton.setAttribute(
      "aria-label",
      "Menü öffnen"
    );
    menuButton.setAttribute(
      "aria-expanded",
      "false"
    );
    menuButton.innerHTML =
      '<span class="site-nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>';

    nav.appendChild(menuButton);

    const mobileMenu =
      document.createElement("div");

    mobileMenu.className =
      "site-mobile-menu hidden";
    mobileMenu.setAttribute(
      "aria-label",
      "Mobiles Menü"
    );

    const mobileItems = [
      {
        id: "dashboard",
        label: "Übersicht",
        href: "dashboard.html"
      },
      ...items
    ];

    for (const item of mobileItems) {
      mobileMenu.appendChild(
        createNavigationLink(
          item,
          activeId,
          "site-mobile-menu-link"
        )
      );
    }

    let mobileSettingsButton = null;

    if (settings) {
      mobileSettingsButton =
        document.createElement("button");

      mobileSettingsButton.type =
        "button";
      mobileSettingsButton.className =
        "site-mobile-settings";
      mobileSettingsButton.textContent =
        "Einstellungen";
      mobileSettingsButton.setAttribute(
        "aria-expanded",
        "false"
      );

      mobileMenu.appendChild(
        mobileSettingsButton
      );
    }

    if (settings) {
      settingsPanel =
        document.createElement("section");

      settingsPanel.className =
        "site-settings-panel hidden";
      settingsPanel.setAttribute(
        "aria-label",
        "Einstellungen"
      );

      const header =
        document.createElement("div");
      header.className =
        "site-settings-header";

      const heading =
        document.createElement("h2");
      heading.textContent =
        "Einstellungen";

      const closeButton =
        document.createElement("button");
      closeButton.type = "button";
      closeButton.className =
        "site-settings-close";
      closeButton.setAttribute(
        "aria-label",
        "Einstellungen schließen"
      );
      closeButton.textContent = "×";

      header.append(
        heading,
        closeButton
      );

      settingsPanel.append(
        header,
        settings.field
      );

      const hint =
        document.createElement("p");
      hint.className =
        "site-settings-hint";
      hint.textContent =
        "Der Schlüssel wird nur für diese Browser-Sitzung gespeichert und beim Schließen der Sitzung nicht dauerhaft abgelegt.";
      settingsPanel.appendChild(hint);

      const actions =
        document.createElement("div");
      actions.className =
        "site-settings-actions";

      const clearButton =
        document.createElement("button");
      clearButton.type = "button";
      clearButton.className =
        "secondary-button";
      clearButton.textContent =
        "Löschen";

      const applyButton =
        document.createElement("button");
      applyButton.type = "button";
      applyButton.className =
        "primary-button";
      applyButton.textContent =
        "Übernehmen";

      actions.append(
        clearButton,
        applyButton
      );
      settingsPanel.appendChild(actions);

      closeButton.addEventListener(
        "click",
        closeSettings
      );

      clearButton.addEventListener(
        "click",
        () => {
          settings.input.value = "";
          storeSessionApiKey("");
          settings.input.dispatchEvent(
            new Event(
              "change",
              { bubbles: true }
            )
          );
        }
      );

      applyButton.addEventListener(
        "click",
        () => {
          storeSessionApiKey(
            settings.input.value.trim()
          );
          settings.input.dispatchEvent(
            new Event(
              "change",
              { bubbles: true }
            )
          );
          closeSettings();
        }
      );

      settingsButton.addEventListener(
        "click",
        toggleSettings
      );

      mobileSettingsButton.addEventListener(
        "click",
        openSettings
      );
    }

    menuButton.addEventListener(
      "click",
      () => {
        closeSettings();
        const opening =
          mobileMenu.classList.contains(
            "hidden"
          );
        mobileMenu.classList.toggle(
          "hidden",
          !opening
        );
        menuButton.setAttribute(
          "aria-expanded",
          String(opening)
        );
        menuButton.setAttribute(
          "aria-label",
          opening
            ? "Menü schließen"
            : "Menü öffnen"
        );
      }
    );

    target.replaceChildren(
      nav,
      mobileMenu,
      ...(settingsPanel
        ? [settingsPanel]
        : [])
    );

    document.addEventListener(
      "click",
      event => {
        if (!target.contains(event.target)) {
          closeMenu();
          closeSettings();
        }
      }
    );

    document.addEventListener(
      "keydown",
      event => {
        if (event.key === "Escape") {
          closeMenu();
          closeSettings();
        }
      }
    );

    window.addEventListener(
      "resize",
      () => {
        if (window.innerWidth > 760) {
          closeMenu();
        }
      }
    );
  }

  document.addEventListener(
    "DOMContentLoaded",
    renderNavigation
  );
})();
