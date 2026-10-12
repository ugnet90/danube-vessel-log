// Danube Vessel Log
// File: docs/js/analytics.js
// Version: 0.15.20
// Updated: 2026-10-12

"use strict";

(() => {
  const state = {
    document: null,
    records: [],
    filtered: [],
    sortKey: "sightings",
    sortDirection: "desc"
  };

  const elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function formatInteger(value) {
    return new Intl.NumberFormat("de-AT", { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function quantityLabel(value, singular, plural) {
    const count = Number(value) || 0;
    return `${formatInteger(count)} ${count === 1 ? singular : plural}`;
  }

  function formatDate(value) {
    if (!value) return "–";
    const parts = String(value).split("-");
    if (parts.length !== 3) return value;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  function formatMonth(value) {
    const [year, month] = String(value || "").split("-");
    if (!year || !month) return value || "–";
    return new Intl.DateTimeFormat("de-AT", { month: "short", year: "2-digit", timeZone: "Europe/Vienna" })
      .format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
  }

  function setStatus(message, isError = false) {
    elements.pageStatus.textContent = message;
    elements.pageStatus.classList.toggle("error", isError);
  }

  function addOptions(select, items, valueKey = "id", labelKey = "name") {
    const first = select.querySelector("option")?.cloneNode(true);
    select.replaceChildren();
    if (first) select.appendChild(first);
    for (const item of items) {
      const option = document.createElement("option");
      option.value = typeof item === "string" ? item : String(item[valueKey] ?? "");
      option.textContent = typeof item === "string" ? item : String(item[labelKey] ?? option.value);
      select.appendChild(option);
    }
  }

  function currentFilterValues() {
    return {
      from: elements.dateFrom.value,
      to: elements.dateTo.value,
      location: elements.locationFilter.value,
      berth: elements.berthFilter.value,
      vessel: elements.vesselFilter.value,
      operator: elements.operatorFilter.value,
      movement: elements.movementFilter.value
    };
  }

  function recordMatchesFilters(record, filters, omittedFacet = "") {
    if (filters.from && record.local_date < filters.from) return false;
    if (filters.to && record.local_date > filters.to) return false;
    if (omittedFacet !== "location" && filters.location && record.location_area_id !== filters.location) return false;
    if (omittedFacet !== "berth" && filters.berth && record.berth_id !== filters.berth) return false;
    if (omittedFacet !== "vessel" && filters.vessel && record.vessel_id !== filters.vessel) return false;
    if (
      omittedFacet !== "operator"
      && filters.operator
      && (record.operator || record.cruise_brand) !== filters.operator
    ) return false;
    if (omittedFacet !== "movement" && filters.movement && record.movement !== filters.movement) return false;
    return true;
  }

  function setFacetOptions(select, items) {
    const current = select.value;
    addOptions(select, items);
    const valid = items.some(item => (typeof item === "string" ? item : String(item.id ?? "")) === current);
    select.value = valid ? current : "";
    return current !== "" && !valid;
  }

  function facetRecords(omittedFacet) {
    const filters = currentFilterValues();
    return state.records.filter(record => recordMatchesFilters(record, filters, omittedFacet));
  }

  function updateFacetedFilters() {
    const facets = [
      {
        key: "location",
        select: elements.locationFilter,
        items(records) {
          const seen = new Map();
          for (const record of records) {
            if (!record.location_area_id) continue;
            seen.set(record.location_area_id, record.location_area_name || record.location_area_id);
          }
          return [...seen.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
        }
      },
      {
        key: "berth",
        select: elements.berthFilter,
        items(records) {
          const seen = new Map();
          for (const record of records) {
            if (!record.berth_id) continue;
            seen.set(record.berth_id, record.berth_short_name || record.berth_name || record.berth_id);
          }
          return [...seen.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
        }
      },
      {
        key: "vessel",
        select: elements.vesselFilter,
        items(records) {
          const seen = new Map();
          for (const record of records) {
            if (!record.vessel_id) continue;
            seen.set(record.vessel_id, record.vessel_name || record.vessel_id);
          }
          return [...seen.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
        }
      },
      {
        key: "operator",
        select: elements.operatorFilter,
        items(records) {
          return [...new Set(
            records
              .map(record => record.operator || record.cruise_brand)
              .filter(Boolean)
          )].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
        }
      },
      {
        key: "movement",
        select: elements.movementFilter,
        items(records) {
          const labels = {
            moored: "Liegend",
            moving: "Fahrend",
            unknown: "Unbekannt"
          };
          const values = [...new Set(records.map(record => record.movement || "unknown"))];
          return ["moored", "moving", "unknown"]
            .filter(value => values.includes(value))
            .map(id => ({ id, name: labels[id] }));
        }
      }
    ];

    // Falls eine bestehende Auswahl durch einen anderen Filter unzulässig wird,
    // wird sie auf "Alle" zurückgesetzt. Danach werden alle Facetten noch einmal
    // berechnet, damit die Optionslisten zueinander konsistent bleiben.
    for (let pass = 0; pass < 6; pass += 1) {
      let resetOccurred = false;
      for (const facet of facets) {
        const records = facetRecords(facet.key);
        if (setFacetOptions(facet.select, facet.items(records))) resetOccurred = true;
      }
      if (!resetOccurred) break;
    }
  }

  function populateFilters() {
    updateFacetedFilters();
  }

  function localToday() {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Vienna",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function shiftIsoDate(isoDate, days) {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function applyPeriodPreset() {
    const preset = elements.periodFilter.value;
    const today = localToday();
    if (preset === "all") {
      elements.dateFrom.value = "";
      elements.dateTo.value = "";
    } else if (preset === "year") {
      elements.dateFrom.value = `${today.slice(0, 4)}-01-01`;
      elements.dateTo.value = today;
    } else if (preset === "month") {
      elements.dateFrom.value = `${today.slice(0, 7)}-01`;
      elements.dateTo.value = today;
    } else if (preset === "30days") {
      elements.dateFrom.value = shiftIsoDate(today, -29);
      elements.dateTo.value = today;
    }
  }

  function filterRecords() {
    const filters = currentFilterValues();
    state.filtered = state.records.filter(record => recordMatchesFilters(record, filters));
  }

  function renderKpis() {
    const vesselIds = new Set();
    const days = new Set();
    const locations = new Set();
    let photos = 0;
    let unknownLocations = 0;

    for (const record of state.filtered) {
      vesselIds.add(record.vessel_id);
      days.add(record.local_date);
      photos += Number(record.photo_count) || 0;
      if (record.location_area_id) locations.add(record.location_area_id);
      else unknownLocations += 1;
    }

    elements.kpiSightings.textContent = formatInteger(state.filtered.length);
    elements.kpiVessels.textContent = formatInteger(vesselIds.size);
    elements.kpiDays.textContent = formatInteger(days.size);
    elements.kpiPhotos.textContent = formatInteger(photos);
    elements.kpiLocations.textContent = formatInteger(locations.size);
    elements.kpiSightingsDetail.textContent = state.filtered.length === state.records.length ? "gesamt" : "im aktuellen Filter";
    elements.kpiVesselsDetail.textContent = vesselIds.size === 1 ? "Schiff" : "verschiedene Schiffe";
    elements.kpiDaysDetail.textContent = days.size === 1 ? "Tag" : "verschiedene Tage";
    elements.kpiPhotosDetail.textContent = photos === 1 ? "Originalfoto" : "Originalfotos";
    elements.kpiLocationsDetail.textContent = unknownLocations
      ? `${quantityLabel(unknownLocations, "Sichtung", "Sichtungen")} ohne Standort`
      : (locations.size === 1 ? "bekannter Standort" : "bekannte Standorte");
  }

  function monthRange(records) {
    const values = records.map(record => record.local_month).filter(Boolean).sort();
    if (!values.length) return [];
    const [startYear, startMonth] = values[0].split("-").map(Number);
    const [endYear, endMonth] = values[values.length - 1].split("-").map(Number);
    const result = [];
    let year = startYear;
    let month = startMonth;
    while (year < endYear || (year === endYear && month <= endMonth)) {
      result.push(`${year}-${String(month).padStart(2, "0")}`);
      month += 1;
      if (month === 13) {
        month = 1;
        year += 1;
      }
    }
    return result;
  }

  function renderTrend() {
    const counts = new Map();
    for (const record of state.filtered) {
      counts.set(record.local_month, (counts.get(record.local_month) || 0) + 1);
    }

    const months = monthRange(state.filtered);
    elements.trendChart.replaceChildren();
    elements.trendEmpty.classList.toggle("hidden", months.length > 0);
    elements.trendChart.classList.toggle("hidden", months.length === 0);
    if (!months.length) return;

    const max = Math.max(1, ...months.map(month => counts.get(month) || 0));
    for (const month of months) {
      const value = counts.get(month) || 0;
      const item = document.createElement("div");
      item.className = "analytics-column-item";
      item.title = `${formatMonth(month)}: ${quantityLabel(value, "Sichtung", "Sichtungen")}`;

      const track = document.createElement("div");
      track.className = "analytics-column-track";
      const bar = document.createElement("div");
      bar.className = "analytics-column-bar";
      bar.style.height = `${Math.max(value ? 4 : 0, (value / max) * 100)}%`;
      track.appendChild(bar);

      const valueElement = document.createElement("div");
      valueElement.className = "analytics-column-value";
      valueElement.textContent = formatInteger(value);

      const label = document.createElement("div");
      label.className = "analytics-column-label";
      label.textContent = formatMonth(month);

      item.append(track, valueElement, label);
      elements.trendChart.appendChild(item);
    }
  }

  function countsBy(records, keyFunction) {
    const counts = new Map();
    for (const record of records) {
      const key = keyFunction(record);
      if (!key) continue;
      const item = counts.get(key.id) || { id: key.id, label: key.label, count: 0, href: key.href || "" };
      item.count += 1;
      counts.set(key.id, item);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de", { numeric: true }));
  }

  function renderBars(target, items, limit = 10, emptyLabel = "Keine Daten im Filter.") {
    target.replaceChildren();
    const list = items.slice(0, limit);
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "analytics-empty";
      empty.textContent = emptyLabel;
      target.appendChild(empty);
      return;
    }

    const max = Math.max(1, ...list.map(item => item.count));
    for (const item of list) {
      const row = document.createElement("div");
      row.className = "analytics-bar-row";

      const label = document.createElement("div");
      label.className = "analytics-bar-label";
      if (item.href) {
        const link = document.createElement("a");
        link.href = item.href;
        link.textContent = item.label;
        label.appendChild(link);
      } else {
        label.textContent = item.label;
      }
      label.title = item.label;

      const track = document.createElement("div");
      track.className = "analytics-bar-track";
      const fill = document.createElement("div");
      fill.className = "analytics-bar-fill";
      fill.style.width = `${(item.count / max) * 100}%`;
      track.appendChild(fill);

      const value = document.createElement("div");
      value.className = "analytics-bar-value";
      value.textContent = formatInteger(item.count);

      row.append(label, track, value);
      target.appendChild(row);
    }
  }

  function renderRankings() {
    renderBars(elements.topVesselsChart, countsBy(state.filtered, record => ({
      id: record.vessel_id,
      label: record.vessel_name || record.vessel_id,
      href: `vessel.html?id=${encodeURIComponent(record.vessel_id)}`
    })));

    renderBars(elements.topBerthsChart, countsBy(state.filtered, record => record.berth_id ? ({
      id: record.berth_id,
      label: record.berth_short_name || record.berth_name || record.berth_id
    }) : null));

    const locationItems = countsBy(state.filtered, record => record.location_area_id ? ({
      id: record.location_area_id,
      label: record.location_area_name || record.location_area_id
    }) : ({ id: "__unknown__", label: "Unbekannter Standort" }));
    renderBars(elements.topLocationsChart, locationItems);

    const operatorItems = countsBy(state.filtered, record => {
      const label = record.operator || record.cruise_brand || "Betreiber / Marke unbekannt";
      return { id: label || "__unknown__", label };
    });
    renderBars(elements.topOperatorsChart, operatorItems);
  }

  function aggregateVessels() {
    const map = new Map();
    for (const record of state.filtered) {
      let item = map.get(record.vessel_id);
      if (!item) {
        item = {
          vessel_id: record.vessel_id,
          name: record.vessel_name || record.vessel_id,
          sightings: 0,
          dates: new Set(),
          first: record.local_date,
          last: record.local_date,
          locationIds: new Set(),
          photos: 0
        };
        map.set(record.vessel_id, item);
      }
      item.sightings += 1;
      item.dates.add(record.local_date);
      if (record.local_date < item.first) item.first = record.local_date;
      if (record.local_date > item.last) item.last = record.local_date;
      if (record.location_area_id) item.locationIds.add(record.location_area_id);
      item.photos += Number(record.photo_count) || 0;
    }

    return [...map.values()].map(item => ({
      vessel_id: item.vessel_id,
      name: item.name,
      sightings: item.sightings,
      days: item.dates.size,
      first: item.first,
      last: item.last,
      locations: item.locationIds.size,
      photos: item.photos
    }));
  }

  function sortVesselRows(rows) {
    const key = state.sortKey;
    const direction = state.sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let result;
      if (["sightings", "days", "locations", "photos"].includes(key)) {
        result = Number(a[key]) - Number(b[key]);
      } else {
        result = String(a[key] || "").localeCompare(String(b[key] || ""), "de", { numeric: true });
      }
      return result * direction || a.name.localeCompare(b.name, "de", { numeric: true });
    });
  }

  function updateSortHeaders() {
    for (const header of document.querySelectorAll(".analytics-table th[data-sort-key]")) {
      const active = header.dataset.sortKey === state.sortKey;
      header.classList.toggle("is-sorted", active);
      const indicator = header.querySelector("span");
      if (indicator) indicator.textContent = active ? (state.sortDirection === "asc" ? "↑" : "↓") : "↕";
    }
  }

  function renderTable() {
    const rows = sortVesselRows(aggregateVessels());
    elements.analyticsTableBody.replaceChildren();
    elements.tableResultCount.textContent = quantityLabel(rows.length, "Schiff", "Schiffe");
    elements.tableEmpty.classList.toggle("hidden", rows.length > 0);
    elements.analyticsTableBody.closest(".analytics-table-scroll").classList.toggle("hidden", rows.length === 0);

    for (const item of rows) {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      const link = document.createElement("a");
      link.className = "analytics-vessel-link";
      link.href = `vessel.html?id=${encodeURIComponent(item.vessel_id)}`;
      link.textContent = item.name;
      nameCell.appendChild(link);
      row.appendChild(nameCell);

      for (const key of ["sightings", "days"]) {
        const cell = document.createElement("td");
        cell.className = "numeric";
        cell.textContent = formatInteger(item[key]);
        row.appendChild(cell);
      }

      const first = document.createElement("td");
      first.textContent = formatDate(item.first);
      row.appendChild(first);
      const last = document.createElement("td");
      last.textContent = formatDate(item.last);
      row.appendChild(last);

      for (const key of ["locations", "photos"]) {
        const cell = document.createElement("td");
        cell.className = "numeric";
        cell.textContent = formatInteger(item[key]);
        row.appendChild(cell);
      }

      elements.analyticsTableBody.appendChild(row);
    }
    updateSortHeaders();
  }

  function renderAll() {
    updateFacetedFilters();
    filterRecords();
    renderKpis();
    renderTrend();
    renderRankings();
    renderTable();
    const filteredLabel = quantityLabel(state.filtered.length, "Sichtung", "Sichtungen");
    const totalLabel = quantityLabel(state.records.length, "Sichtung", "Sichtungen");
    setStatus(`${filteredLabel} von ${totalLabel} im aktuellen Filter.`);
  }

  function resetFilters() {
    elements.periodFilter.value = "all";
    elements.dateFrom.value = "";
    elements.dateTo.value = "";
    elements.locationFilter.value = "";
    elements.berthFilter.value = "";
    elements.vesselFilter.value = "";
    elements.operatorFilter.value = "";
    elements.movementFilter.value = "";
    renderAll();
  }

  function bindEvents() {
    elements.reloadButton.addEventListener("click", loadData);
    elements.resetFiltersButton.addEventListener("click", resetFilters);

    elements.periodFilter.addEventListener("change", () => {
      applyPeriodPreset();
      renderAll();
    });

    for (const element of [elements.dateFrom, elements.dateTo]) {
      element.addEventListener("change", () => {
        elements.periodFilter.value = "custom";
        renderAll();
      });
    }

    for (const element of [
      elements.locationFilter,
      elements.berthFilter,
      elements.vesselFilter,
      elements.operatorFilter,
      elements.movementFilter
    ]) {
      element.addEventListener("change", renderAll);
    }

    for (const header of document.querySelectorAll(".analytics-table th[data-sort-key]")) {
      header.querySelector("button")?.addEventListener("click", () => {
        const key = header.dataset.sortKey;
        if (state.sortKey === key) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
        else {
          state.sortKey = key;
          state.sortDirection = ["name", "first", "last"].includes(key) ? "asc" : "desc";
        }
        renderTable();
      });
    }
  }

  async function loadData() {
    setStatus("Auswertungsdaten werden geladen …");
    elements.reloadButton.disabled = true;
    try {
      const response = await fetch(`data/analytics.json?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const documentData = await response.json();
      if (!documentData || !Array.isArray(documentData.records)) throw new Error("Ungültiges Datenformat");

      state.document = documentData;
      state.records = documentData.records;
      populateFilters();
      resetFilters();

      const updated = documentData.source_updated_at || documentData.generated_at;
      elements.dataUpdatedAt.textContent = updated
        ? `Datenstand: ${new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Vienna" }).format(new Date(updated))}`
        : "Datenstand: –";
    } catch (error) {
      state.document = null;
      state.records = [];
      state.filtered = [];
      renderKpis();
      renderTrend();
      renderRankings();
      renderTable();
      setStatus(`Auswertungsdaten konnten nicht geladen werden: ${error instanceof Error ? error.message : String(error)}. Falls die Auswertungsdaten gerade neu aufgebaut werden, zuerst den Workflow „Build analytics data“ erfolgreich durchlaufen lassen.`, true);
    } finally {
      elements.reloadButton.disabled = false;
    }
  }

  function init() {
    Object.assign(elements, {
      reloadButton: byId("reloadButton"),
      resetFiltersButton: byId("resetFiltersButton"),
      pageStatus: byId("pageStatus"),
      periodFilter: byId("periodFilter"),
      dateFrom: byId("dateFrom"),
      dateTo: byId("dateTo"),
      locationFilter: byId("locationFilter"),
      berthFilter: byId("berthFilter"),
      vesselFilter: byId("vesselFilter"),
      operatorFilter: byId("operatorFilter"),
      movementFilter: byId("movementFilter"),
      kpiSightings: byId("kpiSightings"),
      kpiSightingsDetail: byId("kpiSightingsDetail"),
      kpiVessels: byId("kpiVessels"),
      kpiVesselsDetail: byId("kpiVesselsDetail"),
      kpiDays: byId("kpiDays"),
      kpiDaysDetail: byId("kpiDaysDetail"),
      kpiPhotos: byId("kpiPhotos"),
      kpiPhotosDetail: byId("kpiPhotosDetail"),
      kpiLocations: byId("kpiLocations"),
      kpiLocationsDetail: byId("kpiLocationsDetail"),
      trendChart: byId("trendChart"),
      trendEmpty: byId("trendEmpty"),
      topVesselsChart: byId("topVesselsChart"),
      topBerthsChart: byId("topBerthsChart"),
      topLocationsChart: byId("topLocationsChart"),
      topOperatorsChart: byId("topOperatorsChart"),
      analyticsTableBody: byId("analyticsTableBody"),
      tableResultCount: byId("tableResultCount"),
      tableEmpty: byId("tableEmpty"),
      dataUpdatedAt: byId("dataUpdatedAt")
    });

    bindEvents();
    loadData();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
