# Danube Vessel Log -- Architektur

## Status

**Architekturversion:** 1.0

Dieses Dokument beschreibt die verbindliche technische Grundlage des
Projekts.

------------------------------------------------------------------------

## 1. Zweck

Danube Vessel Log dokumentiert eigene Schiffsbeobachtungen auf der
Donau.

-   einfache Fotoerfassung mit dem iPhone
-   eindeutige Katalogisierung realer Schiffe
-   wiederholte Beobachtungen desselben Schiffes
-   spätere Ergänzung fehlender Daten
-   Auswertungen nach Schiff, Flagge, Betreiber, Ort, Richtung und
    Beobachtungshäufigkeit

------------------------------------------------------------------------

## 2. Systemarchitektur

``` text
iPhone
  ↓
Apple-Kurzbefehl
  ↓
Cloudflare Worker API
  ↓
GitHub Repository
  ↓
GitHub Actions
  ↓
GitHub Pages
```

### Komponenten

**iPhone** - Fotos auswählen - Minimalangaben erfassen - Upload starten

**Cloudflare Worker** - Upload-Key prüfen - Eingaben validieren - IDs
erzeugen - Dateien in GitHub anlegen

**GitHub** - einzige dauerhafte Datenquelle

**GitHub Actions** - Verarbeitung - Validierung - Website erzeugen

**GitHub Pages** - Dashboard - Review - Statistiken

------------------------------------------------------------------------

## 3. Datenfluss

``` text
Fotoaufnahme
↓
Submission
↓
Review
↓
Schiffszuordnung
↓
Observation
↓
Auswertungen
```

------------------------------------------------------------------------

## 4. Entitäten

-   **Vessel** -- reales Schiff
-   **Submission** -- unverarbeiteter Eingang
-   **Observation** -- geprüfte Beobachtung
-   **Location** -- Beobachtungsort

------------------------------------------------------------------------

## 5. IDs

-   Location: `LOC-001`
-   Submission: `SUB-YYYYMMDD-HHMMSS-XXXXXX`
-   Vessel: `VES-000001`
-   Observation: `OBS-000001`

------------------------------------------------------------------------

## 6. Primäre Daten

-   `data/reference_data.json`
-   `data/vessels.json`
-   `data/observations.json`

------------------------------------------------------------------------

## 7. Inbox

``` text
inbox/submissions/YYYY/MM/
photos/inbox/SUB-...
```

------------------------------------------------------------------------

## 8. Statusmodell

-   new
-   needs_identification
-   needs_review
-   ready
-   processed
-   rejected

------------------------------------------------------------------------

## 9. Beobachtungslogik

Bewegung: - moving - moored - unknown

Richtung: - upstream - downstream - unknown

Ereignis: - passage - arrival - departure - stay - unknown

------------------------------------------------------------------------

## 10. Lokale Regel Linz

Angelegte Schiffe sind grundsätzlich flussaufwärts ausgerichtet. Die
sichtbare Ausrichtung ist keine sichere Fahrtrichtung.

------------------------------------------------------------------------

## 11. API

Endpunkte:

-   GET /
-   POST /test-upload
-   POST /submission

Authentifizierung:

-   Header `X-Upload-Key`
-   Secret `UPLOAD_KEY`
-   GitHub Token nur als Cloudflare Secret

------------------------------------------------------------------------

## 12. Sicherheitsregeln

-   nur neue Dateien anlegen
-   nichts überschreiben
-   nichts löschen
-   serverseitige Validierung

------------------------------------------------------------------------

## 13. Fotoverarbeitung

-   Originale bleiben auf dem iPhone
-   Arbeitskopien werden verwendet
-   mehrere Fotos pro Submission
-   EXIF möglichst übernehmen

------------------------------------------------------------------------

## 14. Grundsätze

-   GitHub ist die einzige dauerhafte Datenquelle.
-   Schiff und Beobachtung bleiben getrennte Entitäten.
-   Eine unvollständige Sichtung darf nicht verloren gehen.
-   AIS ergänzt eigene Beobachtungen.
-   Erweiterungen dürfen bestehende IDs nicht brechen.
