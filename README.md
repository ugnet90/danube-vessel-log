# Danube Vessel Log

Aktuelle Version: **0.14.30**  
Stand: **20.08.2026**

## 1. Projektzweck

Danube Vessel Log ist eine private, GitHub-basierte Schiffs- und Sichtungsdatenbank für Schiffe auf der Donau. Der Schwerpunkt liegt auf einer belastbaren kanonischen Schiffsverwaltung, eigenen Sichtungen, Fotos, Standort- und Anlegestelleninformationen sowie einer späteren Anreicherung der Stammdaten.

Die Datenerfassung erfolgt vor allem mit dem iPhone. Apple-Kurzbefehle senden Sichtungen und Fotos an einen Cloudflare Worker. Der Worker prüft und normalisiert die Daten und schreibt sie über die GitHub API in das Repository. Die Weboberfläche unter `docs/` dient zur Kontrolle, Bearbeitung, Zuordnung und Darstellung.

## 2. Grundarchitektur

Der Datenfluss ist grundsätzlich:

`iPhone-Kurzbefehl -> Cloudflare Worker -> GitHub -> GitHub Pages/Weboberfläche`

Wesentliche Komponenten:

- **iPhone / Apple Kurzbefehle** für Sichtungen und Foto-Uploads
- **Cloudflare Worker** in `cloudflare/worker.js`
- **GitHub Repository** als persistente Datenhaltung
- **GitHub Pages** für die Weboberfläche unter `docs/`
- **GitHub Actions** für abgeleitete Daten und Hilfsprozesse

Der Worker erzeugt Änderungen möglichst atomar in einem gemeinsamen Git-Commit, damit zusammengehörige JSON-Daten, Fotos und Indizes nicht auseinanderlaufen.

## 3. Kanonische Schiffsdaten

### 3.1 Schiffsindex

`data/vessels.csv`

Der CSV-Index enthält die zentralen Such- und Übersichtsangaben der vorhandenen Schiffe sowie den Pfad zum jeweiligen kanonischen JSON-Datensatz.

Produktive Vessel-IDs beginnen ab:

`VES-000100`

Die IDs `VES-000000` bis `VES-000099` sind für Testdaten reserviert.

### 3.2 Kanonischer Datensatz je Schiff

`data/vessels/<vessel_id>.json`

Der JSON-Datensatz ist die maßgebliche Quelle für die Stammdaten des Schiffs. Typische Bereiche sind:

- Identität
  - Name
  - frühere Namen
  - MMSI
  - IMO
  - ENI
  - Rufzeichen
- Klassifikation
  - Schiffstyp
  - Untertyp
  - Flagge
  - Status
- technische Daten
  - Baujahr
  - Werft
  - Länge
  - Breite
  - Tiefgang
  - Passagierzahl
- Betrieb
  - Betreiber
  - Eigentümer
  - Manager
  - Marke
  - Heimathafen
- Quellen
- Medien/Hauptfoto
- Audit- und Änderungshistorie
- Notizen

### 3.3 Statusregel

Eine **bestätigte eigene Sichtung ist ein belastbarer Aktivitätsnachweis**.

Daraus folgt:

- neue Schiffe aus einer bestätigten Sichtung werden mit `active` angelegt;
- wird eine bestätigte Sichtung einem bestehenden Schiff zugeordnet, wird dessen Status serverseitig auf `active` gesetzt;
- war der vorherige Status `unknown`, `inactive` oder `scrapped`, wird die Statusänderung in der Historie mit Submission-ID und Sichtungszeitpunkt dokumentiert.

## 4. Sichtungen

### 4.1 Ablage

Einzelne Submissions liegen unter:

`inbox/submissions/YYYY/MM/<submission_id>.json`

Die Submission-ID hat die Form:

`SUB-YYYYMMDD-HHMMSS-XXXXXX`

Zusätzlich existiert der zentrale Sichtungsindex:

`data/sightings.json`

Dieser Index wird für die schnelle Darstellung der Sichtungshistorie verwendet.

### 4.2 Wichtige Sichtungsdaten

Eine Sichtung kann unter anderem enthalten:

- `captured_at`
- eingegebenen Schiffsnamen
- automatische bzw. bestätigte Vessel-Zuordnung
- Aufnahme-/Beobachtungskoordinaten
- aufgelösten Aufnahmeort
- Bewegung
- Richtung/Ausrichtung
- Anlegestelle
- Notiz
- ein oder mehrere Fotos
- Review-Status

### 4.3 Review-Flow

Der Review kennt insbesondere die Entscheidungen:

- `confirmed`
- `corrected`
- `rejected`

Bei einer bestätigten oder korrigierten Zuordnung wird die Sichtung mit dem kanonischen Schiff verknüpft. Historische Änderungen sollen nachvollziehbar bleiben.

## 5. Fotos

### 5.1 Sichtungsfotos

Fotos einer Sichtung werden unter anderem unter

`inbox/photos/YYYY/MM/<photo_id>.jpg`

gespeichert.

Mehrere Fotos können zu einer Sichtung gehören. Neue Fotos dürfen vorhandene Fotos einer bereits gespeicherten Sichtung nicht überschreiben oder entfernen.

### 5.2 Zusätzliche Schiffsfotos ohne neue Sichtung

Zusätzliche Fotos können direkt einem bestehenden Schiff zugeordnet werden, ohne dafür eine neue Sichtung anzulegen.

Die Metadaten dieser direkten Schiffsfotos werden in

`data/vessel_photos/<vessel_id>.json`

geführt.

Ein direktes Schiffsfoto ist **keine Sichtung**. Es darf daher nicht automatisch eine neue Sichtungsanzahl erzeugen und keine Bewegung, Richtung oder Anlegestelle vortäuschen.

Ab Version **0.14.24** werden bei neuen direkten Schiffsfotos folgende Metadaten gespeichert:

- `photo_id`
- Dateipfad und Dateiname
- Originaldateiname
- Dateigröße
- Reihenfolge
- `captured_at`
- `added_at`
- `photo_lat`
- `photo_lon`
- aufgelöster `location`-Datensatz
- `vessel_name_entered`
- `notes`
- Quelle `direct_vessel_upload`

Die GPS-Koordinaten werden ab Version **0.14.25** zuerst gegen die präzisen Aufnahmebereiche in `data/location_areas.geojson` geprüft. Wenn für eine übergeordnete Location keine Flächen definiert sind, bleibt die bisherige Radiusauflösung über `data/locations.csv` als Rückfall erhalten. Ein Treffer speichert Location-ID, gegebenenfalls `area_id`, öffentlichen Namen, Gemeinde, Land und Matching-Art.

### 5.3 Hauptfoto

Jedes Schiff kann ein Hauptfoto besitzen. Ein vorhandenes Sichtungsfoto oder ein direktes Schiffsfoto kann über die Weboberfläche als Hauptfoto gesetzt werden.

Wird ein Foto gelöscht, muss ein eventuell betroffenes Hauptfoto konsistent behandelt werden.

### 5.4 Foto-Löschung

Einzelne Fotos können über die Weboberfläche gelöscht werden. Dabei werden sowohl der Bildblob als auch die zugehörigen Verweise bzw. Metadateneinträge aktualisiert. Die Löschinformation wird soweit vorgesehen historisch dokumentiert.

## 6. Standortdaten

### 6.1 Kanonische Locations

`data/locations.csv`

Locations enthalten unter anderem:

- Location-ID
- Name
- öffentlichen Namen
- Gemeinde
- Land
- Referenzkoordinaten
- Matching-Radius

Beispiel:

`LOC-001` – Nibelungenbrücke / zentraler Linzer Aufnahmebereich

Der Radius bleibt als allgemeiner Rückfall für Locations bestehen, für die noch keine präzisen Aufnahmebereiche definiert sind.

### 6.2 Präzise Aufnahmebereiche

`data/location_areas.geojson`

Ab Version **0.14.25** können innerhalb einer kanonischen Location beliebig viele polygonale Aufnahmebereiche definiert werden.

Wesentliche Eigenschaften eines Bereichs:

- `area_id` – eindeutige Kennung des Aufnahmebereichs
- `location_id` – übergeordnete kanonische Location
- `public_name` – Name, der als Aufnahme-/Sichtungsort angezeigt wird
- `municipality`
- `country`
- `priority`
- GeoJSON-Geometrie als `Polygon` oder `MultiPolygon`

Die GPS-Koordinate beschreibt den Standort des Beobachters bzw. Fotografen, nicht die Position des Schiffs.

Matching-Reihenfolge:

1. explizite `location_id`, wenn keine GPS-Koordinaten vorhanden sind;
2. präziser GeoJSON-Aufnahmebereich (`matched_by = "geo_area"`);
3. Radius-Matching über `data/locations.csv` (`matched_by = "coordinates"`) nur für Locations ohne definierte Aufnahmebereiche;
4. sonst `unknown`.

Sobald für eine Location präzise Flächen vorhanden sind, wird deren großzügiger Radius bei GPS-Matching nicht mehr verwendet. Dadurch kann `LOC-001` außerhalb der definierten Linzer Bereiche nicht mehr pauschal als Nibelungenbrücke zurückgegeben werden.

### 6.3 Erste Linzer Aufnahmebereiche

Version 0.14.25 enthält zunächst fünf Bereiche unterhalb von `LOC-001`:

- `AREA-LINZ-NIBELUNGENBRUECKE` – **Nibelungenbrücke, Linz**
- `AREA-LINZ-OBERE-DONAULAENDE` – **Obere Donaulände, Linz**
- `AREA-LINZ-UNTERE-DONAULAENDE` – **Untere Donaulände, Linz**
- `AREA-LINZ-ALT-URFAHR` – **Donauufer Alt-Urfahr, Linz**
- `AREA-LINZ-URFAHR-DONAULAENDE` – **Urfahraner Donaulände, Linz**

Die Nibelungenbrücke besitzt mit `priority = 100` eine höhere Priorität als die vier Uferbereiche mit `priority = 80`. Kleine Überschneidungen an den Brückenköpfen sind dadurch ausdrücklich erlaubt; innerhalb einer Überschneidung gewinnt die Brücke.

Die Flächen sind Daten und nicht im Worker hart codiert. Sie können daher später in `data/location_areas.geojson` erweitert oder geometrisch angepasst werden, ohne die Matching-Logik neu zu programmieren.

### 6.4 Speicherung des Ergebnisses

Bei einem Flächentreffer bleiben zwei Ebenen erhalten:

- `location.id` bzw. `location_id` – übergeordnete kanonische Location, derzeit für die Linzer Bereiche `LOC-001`;
- `location.area_id` – konkreter Aufnahmebereich.

Der angezeigte `location.name` wird aus dem präzisen Aufnahmebereich übernommen.

Beispiel:

```json
{
  "status": "matched",
  "matched_by": "geo_area",
  "id": "LOC-001",
  "area_id": "AREA-LINZ-UNTERE-DONAULAENDE",
  "name": "Untere Donaulände, Linz",
  "municipality": "Linz",
  "country": "Österreich",
  "distance_m": null
}
```

Diese Hierarchie erhält die bestehende `location_id`-Kompatibilität, insbesondere zu den bereits hinterlegten Linzer Anlegestellen, und ermöglicht trotzdem einen deutlich präziseren Aufnahmeort.

### 6.5 Doppelte Ortsbestandteile

Bei der Ausgabe werden doppelte Ortsbestandteile entfernt. Aus

`Nibelungenbrücke, Linz, Linz, Österreich`

wird beispielsweise:

`Nibelungenbrücke, Linz, Österreich`

### 6.6 Anlegestellen

Anlegestellen werden separat geführt und können einer Location zugeordnet sein. Für Linz sind unter anderem Donaustationen und weitere definierte Liegestellen hinterlegt.

Ist bei einer Sichtung keine Location direkt gespeichert, kann die Web-/API-Ausgabe die Location über die bekannte `location_id` der Anlegestelle ergänzen.

Bei einer Sichtung **in Fahrt** soll keine Anlegestelle erzwungen werden.

## 7. iPhone-Kurzbefehle

Die beiden bestehenden Sichtungs-Kurzbefehle heißen:

- **Schiffsichtung mit Foto(s)**
- **Schiffsichtung ohne Foto**

Für reine zusätzliche Schiffsfotos existiert ein separater Foto-Upload-Workflow. Dieser erzeugt keine neue Sichtung.

Für direkte Schiffsfotos liefert der aktuelle Kurzbefehl bereits folgende Metadaten an den Worker:

```json
{
  "captured_at": "...",
  "photo_lat": "...",
  "photo_lon": "...",
  "vessel_name_entered": "...",
  "vessel_id": "...",
  "notes": ""
}
```

`vessel_id` darf bei direkten Schiffsfotos leer sein, wenn der eingegebene Schiffsname eindeutig einem bestehenden Schiff zugeordnet werden kann. Bei einem mehrdeutigen oder nicht vorhandenen Namen werden keine Fotos gespeichert.

## 8. Cloudflare Worker

Hauptdatei:

`cloudflare/worker.js`

Der Worker übernimmt unter anderem:

- Authentifizierung
- Validierung der Uploads
- Verarbeitung von JPEG-Fotos
- Erzeugung von Submission- und Photo-IDs
- Schiffsnamensabgleich
- Standortauflösung mit Polygonen und Radius-Fallback
- Anlegestellenauflösung
- Review und Vessel-Zuordnung
- Statusaktualisierung auf `active`
- Schiffsneuanlage und -bearbeitung
- Quellenverwaltung
- Hauptfoto-Verwaltung
- Einzelbildlöschung
- Löschen kompletter Schiffe
- Sichtungsindex-Verwaltung
- direkte Zusatzfotos
- AIS-Testfunktionen
- atomare GitHub-Commits

### 8.1 Relevante Endpunkte

Der aktuelle Worker stellt unter anderem folgende Endpunkte bereit:

**Lesen / Verwaltung**

- `GET /`
- `GET /berths`
- `GET /vessels`
- `GET /vessel-names`
- `GET /vessel`
- `GET /vessel-delete-preview`
- `GET /vessel-id-suggestion`
- `GET /vessel-name-suggestions`

**Schiffe**

- `POST /vessel`
- `POST /vessel-update`
- `POST /vessel-delete`
- `POST /vessel-candidate-link`
- `POST /vessel-primary-photo`
- `POST /vessel-photo-delete`
- `POST /vessel-source-add`
- `POST /vessel-source-update`
- `POST /vessel-source-remove`
- `POST /vessel-enrichment-review`

**Sichtungen und Fotos**

- `POST /submission`
- `POST /submission-photo`
- `POST /photo-attachment`
- `POST /vessel-photos`
- `GET /review-submissions`
- `POST /submission-review`

**AIS**

- `GET /ais-live-config`
- `GET /ais-live`

## 9. Authentifizierung und Worker-Konfiguration

Der Worker verwendet je nach Funktion Upload- oder Management-Authentifizierung.

### Upload

Header:

`X-Upload-Key`

Worker-Secret:

`UPLOAD_KEY`

### Management

Header:

`X-API-Key`

Worker-Variable/Secret:

`MANAGEMENT_API_KEY`

### GitHub-Zugriff

Benötigte Worker-Konfiguration:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_TOKEN`

### AIS

Je nach aktivierter Funktion:

- `AISSTREAM_API_KEY`
- `AIS_LIVE_ACCESS_KEY`

Geheimnisse gehören nicht in das Repository.

## 10. Weboberfläche

Die statische Weboberfläche liegt unter `docs/`.

Wesentliche Seiten sind unter anderem:

- `index.html` – Einstieg/Weiterleitung
- `dashboard.html` – Übersicht
- `submissions.html` – Sichtungen und Review
- `vessels.html` – Schiffsübersicht
- `vessel.html` – Schiffsdetail, Bearbeitung, Fotos, Quellen, Historie
- `vessel_enrichment.html` – Datenanreicherung
- `ais_live.html` – manueller AIS-Empfangstest

Die Navigation wird zentral über die Projekt-JavaScript-Dateien aufgebaut.

### 10.1 vessel.html

Die Schiffsdetailseite zeigt unter anderem:

- Stammdaten
- Hauptfoto
- Blättern durch verfügbare Fotos
- zusätzliche Schiffsfotos
- Sichtungen
- Quellen
- Änderungshistorie
- Verwaltungsfunktionen

Ab 0.14.24 zeigt der Bereich **Zusätzliche Schiffsfotos** unter jedem Foto den tatsächlichen Aufnahmezeitpunkt und den aufgelösten Aufnahmeort. Eine vorhandene Notiz wird ebenfalls angezeigt.

Beispiel:

`17.08.2026, 07:07 · Nibelungenbrücke, Linz, Österreich`

Ohne aufgelösten Ort:

`17.08.2026, 07:07 · Aufnahmeort unbekannt`

## 11. Referenzdaten

Referenzdaten der Weboberfläche liegen unter anderem unter:

`docs/data/reference/`

Dazu gehören beispielsweise:

- Flaggen
- Schiffsklassifikation
- Quellenreferenzen

Auswahlwerte sollen möglichst zentral und nicht mehrfach in einzelnen Oberflächen hart codiert werden.

## 12. Anreicherung

Für noch unvollständige Schiffe existiert ein Anreicherungsworkflow mit Kandidaten und Quellen. Automatisch gefundene Daten sollen nicht ungeprüft kanonische Stammdaten überschreiben.

Die Weboberfläche bietet dafür einen eigenen Bereich. Kandidaten, Quellen und Entscheidungen bleiben getrennt von den kanonischen Vessel-Daten, bis eine Übernahme erfolgt.

## 13. AIS-Test

Das Projekt enthält einen manuellen AIS-Liveempfang über AISStream.

Die auswählbaren Testdauern werden zentral im Worker gepflegt. Aktuell sind vorgesehen:

- 1 Minute
- 2 Minuten
- 5 Minuten
- 10 Minuten

Der AIS-Test ist von der eigentlichen Sichtungs- und Schiffsverwaltung getrennt.

## 14. GitHub- und Deployment-Prinzip

### Weboberfläche

Änderungen unter `docs/` werden über GitHub Pages veröffentlicht.

### Worker

Änderungen an `cloudflare/worker.js` müssen zusätzlich als Cloudflare Worker deployed werden.

### Datenänderungen

Der Worker schreibt die benötigten Dateien über die GitHub API. Zusammengehörige Änderungen sollen atomar in einem Commit erfolgen.

## 15. Versions- und Auslieferungsregeln

Bei Änderungen an diesem Projekt gilt:

- geänderte Dateien werden **vollständig** geliefert;
- die Lieferung erfolgt als ZIP-Datei;
- das ZIP enthält eine vollständige `README.md`;
- das ZIP enthält `COMMIT_MESSAGE.txt`;
- Versionsköpfe aller geänderten Dateien werden aktualisiert;
- reine Code-Schnipsel sind nicht die primäre Auslieferungsform;
- Commit-Kommentare dürfen maximal **50 Zeichen** lang sein.

## 16. Version 0.14.25 – Änderung

### Problem

`LOC-001` besitzt für die Nibelungenbrücke einen bewusst großzügigen GPS-Radius. Dadurch wurden auch Beobachtungen und Fotoaufnahmen an benachbarten Donauufern häufig als **Nibelungenbrücke, Linz** klassifiziert.

Eine reine Verkleinerung des Radius wäre unflexibel und würde bei anderen Standorten weiterhin keine länglichen oder unregelmäßigen Aufnahmebereiche abbilden.

### Lösung

Version 0.14.25 ergänzt eine polygonbasierte Standortauflösung über:

`data/location_areas.geojson`

Der Worker führt bei vorhandenen GPS-Koordinaten zuerst einen Point-in-Polygon-Test durch.

- Treffer in einem Aufnahmebereich: `matched_by = "geo_area"`
- mehrere Treffer durch überlappende Flächen: höchste `priority` gewinnt
- kein Flächentreffer: Radius-Fallback nur für Locations, für die **keine** Aufnahmebereiche definiert sind
- kein Treffer: Standort bleibt unbekannt

### Hierarchische Location-Struktur

Die fünf Linzer Aufnahmebereiche sind Unterbereiche von `LOC-001`.

Damit bleiben bestehende Verknüpfungen, insbesondere die Zuordnung der Linzer Anlegestellen zu `LOC-001`, kompatibel. Der konkrete Aufnahmebereich wird zusätzlich als `area_id` gespeichert.

### Direkte Schiffsfotos

Die in Version 0.14.24 ergänzte Standortauflösung für direkte Schiffsfotos verwendet automatisch dieselbe neue Polygonlogik. Der iPhone-Kurzbefehl muss nicht geändert werden.

### Sichtungen

Auch normale Sichtungen mit Beobachtungskoordinaten verwenden automatisch die neue Polygonlogik. `location.name` enthält anschließend den präzisen Aufnahmebereich.

## 17. Installation des Updates 0.14.25

Dieses ZIP enthält die **vollständigen geänderten bzw. neu benötigten Dateien**, nicht nur Patches.

Zu ersetzen bzw. neu anzulegen sind:

- `cloudflare/worker.js` – vollständig ersetzen
- `data/location_areas.geojson` – neu anlegen
- `README.md` – vollständige Projekt-README übernehmen
- `COMMIT_MESSAGE.txt` – Commit-Kommentar

`data/locations.csv` muss für dieses Update **nicht** ersetzt werden.

Vorgehen:

1. ZIP entpacken.
2. `cloudflare/worker.js` im Repository vollständig ersetzen.
3. `data/location_areas.geojson` im Repository neu anlegen.
4. `README.md` im Projektstamm durch die mitgelieferte vollständige Projekt-README ersetzen.
5. Änderungen mit dem Inhalt aus `COMMIT_MESSAGE.txt` committen.
6. Cloudflare Worker neu deployen.
7. Eine Sichtung bzw. ein direktes Zusatzfoto aus jedem gewünschten Bereich testen.

Für dieses Update ist keine Änderung an `docs/js/vessel.js` und keine Änderung an den iPhone-Kurzbefehlen erforderlich.

## 18. Test für Version 0.14.25

### Nibelungenbrücke

Eine Aufnahme auf der Brücke soll liefern:

- `matched_by = "geo_area"`
- `area_id = "AREA-LINZ-NIBELUNGENBRUECKE"`
- Anzeige: `Nibelungenbrücke, Linz, Österreich`

### Südliches Ufer westlich der Brücke

Eine Aufnahme im definierten zentralen Bereich der Oberen Donaulände soll liefern:

- `area_id = "AREA-LINZ-OBERE-DONAULAENDE"`
- Anzeige: `Obere Donaulände, Linz, Österreich`

### Südliches Ufer östlich der Brücke

Eine Aufnahme im Bereich Untere Donaulände / Brucknerhaus soll liefern:

- `area_id = "AREA-LINZ-UNTERE-DONAULAENDE"`
- Anzeige: `Untere Donaulände, Linz, Österreich`

### Nordufer

Je nach Seite der Brücke soll geliefert werden:

- `AREA-LINZ-ALT-URFAHR`
- oder `AREA-LINZ-URFAHR-DONAULAENDE`

### Außerhalb der fünf Flächen

Eine GPS-Koordinate, die zwar noch innerhalb des alten großzügigen Radius von `LOC-001`, aber außerhalb aller fünf definierten Aufnahmebereiche liegt, darf **nicht mehr automatisch Nibelungenbrücke** ergeben.

Der Standort bleibt in diesem Fall `unknown`, sofern keine andere Location ohne Polygonbereiche über ihren Radius trifft.

## 19. Anpassung und Erweiterung der Polygone

Neue oder geänderte Aufnahmebereiche werden ausschließlich in

`data/location_areas.geojson`

gepflegt.

GeoJSON verwendet die Koordinatenreihenfolge:

`[Längengrad, Breitengrad]`

Ein Polygonring muss geschlossen sein, also mit derselben Koordinate beginnen und enden.

Neue Bereiche können derselben `location_id` oder später weiteren kanonischen Locations zugeordnet werden.

Empfehlung für Prioritäten:

- `100` – sehr spezifischer Bereich, z. B. eine Brücke
- `80` – Ufer-/Promenadenbereich
- niedrigere Werte – größere oder allgemeinere Bereiche

Die Flächen dürfen sich überlappen. Die höhere Priorität entscheidet.

## 20. Rückwärtskompatibilität

Neue Standortauflösungen ab Deployment von Version 0.14.25 verwenden direkt die Polygonlogik.

Das Wartungswerkzeug `tools/rebuild_location_matches.py` berücksichtigt ab **Version 0.14.27** die Qualität der vorhandenen Koordinaten. Historische Foto-Sichtungen ohne fotoindividuell verlässliche Metadaten werden nicht mehr künstlich auf präzise Polygone umklassifiziert. Bereits durch 0.14.26 erzeugte scheinbare Präzision wird bei solchen Legacy-Fällen auf die übergeordnete kanonische Location zurückgenommen.

Neue fotoindividuelle Datensätze mit `metadata_version >= 1`, direkte Zusatzfotos und Sichtungen ohne Foto mit tatsächlichen `observer_*`-Koordinaten können dagegen anhand der aktuellen Polygon- und Radiuslogik neu berechnet werden. Manuell gesetzte Standorte mit

`matched_by = "location_id"`

werden vom Werkzeug nicht überschrieben.

Neue Datensätze können zusätzlich enthalten:

- `matched_by = "geo_area"`
- `area_id`

Leseroutinen, die `area_id` noch nicht verwenden, können weiterhin mit `location.id` und `location.name` arbeiten.

## 21. Technische Prüfung

Für Version 0.14.25 wurde:

- `cloudflare/worker.js` mit `node --check` auf Syntaxfehler geprüft;
- `data/location_areas.geojson` als JSON validiert;
- der GeoJSON-Parser des Workers mit Testpunkten für Nibelungenbrücke, Ars-Electronica-Uferbereich, Brucknerhaus/Untere Donaulände und einen Punkt außerhalb der definierten Flächen geprüft;
- die Prioritätslogik für Flächentreffer vorbereitet;
- das ZIP nach Erstellung mit `unzip -t` geprüft.

## 22. Rückfall

Bei unerwarteten Problemen kann `cloudflare/worker.js` auf Version 0.14.24 zurückgesetzt und erneut deployed werden.

`data/location_areas.geojson` kann dabei im Repository verbleiben, weil Version 0.14.24 diese Datei nicht liest.

## 23. Dateiversionen in 0.14.25

### cloudflare/worker.js

- Version: `0.14.25`
- Updated: `2026-08-19`

### data/location_areas.geojson

- Schema-Version: `1`
- Projektversion: `0.14.25`
- Updated: `2026-08-19`

### README.md

- vollständige Projektbeschreibung
- aktueller Stand: `0.14.25`


## 24. Nachträgliche Neuzuordnung bestehender Standortdaten (0.14.26)

Mit Version **0.14.26** kommt ein Wartungswerkzeug hinzu:

`tools/rebuild_location_matches.py`

Zweck des Werkzeugs:

- bestehende Sichtungen in `inbox/submissions/**` neu bewerten;
- bestehende direkte Schiffsfotos in `data/vessel_photos/*.json` neu bewerten;
- vorhandene Einträge in `data/sightings.json` konsistent nachziehen.

Das Werkzeug verwendet dieselbe fachliche Logik wie die aktuelle Standortauflösung:

1. Polygonbereiche aus `data/location_areas.geojson`
2. Radius-Matching nur für Locations ohne definierte Polygonbereiche
3. `unknown`, wenn weder Polygon noch zulässiger Radius passt

### 24.1 Schutz manuell gesetzter Standorte

Standorte mit

`matched_by = "location_id"`

werden bewusst **nicht** automatisch überschrieben.

Damit werden nur automatisch ermittelte oder historisch unvollständig gespeicherte Standortangaben neu berechnet.

### 24.2 Verwendung lokal

Trockenlauf:

`python tools/rebuild_location_matches.py`

Tatsächliche Anwendung:

`python tools/rebuild_location_matches.py --apply`

### 24.3 Verwendung über GitHub Actions

Zusätzlich enthält Version 0.14.26 den manuellen Workflow:

`.github/workflows/rebuild_location_matches.yml`

Er kann im GitHub-Repository über **Actions -> Rebuild location matches -> Run workflow** gestartet werden.

Der Workflow:

- checkt das Repository aus,
- führt `python tools/rebuild_location_matches.py --apply` aus,
- committet erkannte Änderungen automatisch,
- pusht das Ergebnis zurück in den aktuellen Branch.

Der automatische Commit-Kommentar des Workflows lautet:

`Rebuild location matches`

### 24.4 Typischer Anwendungsfall

Beispiel: Historische Aufnahmen rund um das Lentos oder das Brucknerhaus wurden vor 0.14.25 mit dem alten großzügigen Radius noch als `Nibelungenbrücke, Linz` gespeichert.

Nach Ausführung des Werkzeugs werden diese Datensätze – sofern ihre GPS-Koordinaten innerhalb des Polygons liegen – beispielsweise zu:

- `Untere Donaulände, Linz`
- `Urfahraner Donaulände, Linz`
- `Donauufer Alt-Urfahr, Linz`

umklassifiziert.

## 25. Technische Prüfung für 0.14.26

Für Version 0.14.26 wurde:

- `tools/rebuild_location_matches.py` mit `python3 -m py_compile` geprüft;
- der GitHub-Workflow `.github/workflows/rebuild_location_matches.yml` syntaktisch gegengeprüft;
- das ZIP nach Erstellung mit `unzip -t` geprüft.

## 26. Dateiversionen in 0.14.26

### tools/rebuild_location_matches.py

- Version: `0.14.26`
- Updated: `2026-08-19`

### .github/workflows/rebuild_location_matches.yml

- manueller GitHub-Workflow zur nachträglichen Standort-Neuzuordnung
- Stand: `2026-08-19`

### README.md

- vollständige Projektbeschreibung
- aktueller Stand: `0.14.26`


## 27. Fotoindividuelle Metadaten bei Mehrfachsichtungen (0.14.27)

Ab Version **0.14.27** kann `Schiffsichtung mit Foto(s)` zusätzlich das Array

`photo_metadata`

übermitteln. Es enthält exakt einen Eintrag pro hochgeladenem Foto und bleibt positionsgleich zur Foto-Reihenfolge.

Je Foto werden unterstützt:

- `captured_at`
- `photo_lat`
- `photo_lon`

Der Worker speichert diese Werte im jeweiligen Element von `submission.photos` und ergänzt:

- `metadata_version = 1`
- den fotoindividuell aufgelösten `location`-Block

Die Polygonauflösung wird serverseitig durchgeführt. Für eine Mehrfachsichtung werden `data/locations.csv` und `data/location_areas.geojson` nur einmal geladen; anschließend werden alle Foto-Koordinaten gegen denselben geladenen Standortkontext geprüft. Dadurch entstehen keine unnötigen GitHub-Subrequests pro Foto.

### 27.1 Rückwärtskompatibler Sichtungsort

Für bestehende Leseroutinen bleibt `submission.location` erhalten. Bei neuen fotoindividuellen Metadaten entspricht dieser Block zunächst dem ersten Foto mit individuellen Metadaten.

Die eigentliche präzise Darstellung erfolgt jedoch anhand der Foto-Datensätze.

### 27.2 Mehrere Aufnahmeorte in einer Sichtung

Die Schiffsdetailseite ermittelt aus den aktuell vorhandenen Foto-Metadaten die eindeutigen Aufnahmeorte.

- genau ein Ort: normale Anzeige dieses Ortes;
- mehrere Orte: `Mehrere Aufnahmeorte: …`;
- keine fotoindividuellen Daten: Rückfall auf den bisherigen Sichtungsort.

Die Daten werden nicht nur als Mouseover angezeigt. Unter jedem neuen Foto stehen Aufnahmezeit und Aufnahmeort sichtbar, damit die Funktion auch am iPhone vollständig nutzbar ist.

### 27.3 Foto-Löschung

Beim Löschen eines Sichtungsfotos:

1. wird das Foto aus `submission.photos` entfernt;
2. werden die verbleibenden Fotos neu nummeriert;
3. wird der rückwärtskompatible Submission-Ort auf das erste verbleibende Foto mit zuverlässigen Metadaten synchronisiert;
4. wird `data/sightings.json` aus der geänderten Submission aktualisiert;
5. bildet die Weboberfläche die Ortsüberschrift aus den verbleibenden Fotos neu.

Dadurch verschwindet z. B. `Untere Donaulände, Linz` automatisch aus `Mehrere Aufnahmeorte`, sobald das letzte Foto dieses Aufnahmeortes gelöscht wurde.

## 28. Korrektur der historischen Neuzuordnung aus 0.14.26

Version 0.14.26 konnte ältere Foto-Sichtungen anhand von Koordinaten präzisieren, die historisch noch nicht zuverlässig fotoindividuell erfasst worden waren. Dadurch waren scheinbar exakte, aber fachlich falsche Zuordnungen möglich, z. B. `Donauufer Alt-Urfahr, Linz` für tatsächlich auf der Nibelungenbrücke aufgenommene Fotos.

Version **0.14.27** korrigiert diese Strategie:

- Foto-Sichtungen mit `uploaded_at` **vor dem 18.08.2026** und ohne `metadata_version >= 1` gelten als Legacy-Fälle, weil ihre damaligen Koordinaten noch nicht zuverlässig aus dem Foto stammen mussten;
- wenn 0.14.26 bei einem solchen Legacy-Datensatz bereits `matched_by = "geo_area"` gesetzt hat, wird die scheinbare Präzision auf die übergeordnete kanonische Location zurückgenommen;
- ab dem 18.08.2026 bleiben Sichtungen aus der 0.14.22-Kurzbefehl-Generation auf Sichtungsebene über die verlässlichen Koordinaten des ersten ausgewählten Fotos präzisierbar;
- Sichtungen ohne Foto dürfen weiterhin über `observer_lat` / `observer_lon` neu berechnet werden;
- direkte Zusatzfotos behalten ihre eigene GPS-basierte Standortauflösung;
- neue Mehrfachfoto-Sichtungen mit `metadata_version = 1` werden fotoindividuell präzise neu berechnet.

Für zurückgenommene historische Präzision verwendet das Wartungswerkzeug intern:

`matched_by = "legacy_parent"`

Damit bleibt nachvollziehbar, dass kein präziser historischer Polygon-Treffer behauptet wird.

## 29. iPhone-Kurzbefehl für 0.14.27

Die vollständige Anpassungsanleitung liegt unter:

`docs/shortcuts/KURZBEFEHL_SCHIFFSSICHTUNG_MIT_FOTOS.md`

Der bisherige Metadatenblock bleibt bestehen und wird um `photo_metadata` ergänzt. Fehlt dieses Array, bleibt der Worker rückwärtskompatibel.

## 30. Technische Prüfung für 0.14.27

Für Version 0.14.27 werden geprüft:

- `cloudflare/worker.js` mit `node --check`;
- `docs/js/vessel.js` mit `node --check`;
- `tools/rebuild_location_matches.py` mit `python3 -m py_compile`;
- GitHub-Workflow als YAML;
- ZIP-Integrität mit `unzip -t`.

## 31. Dateiversionen dieses Pakets

### cloudflare/worker.js

- Version: `0.14.27`
- Updated: `2026-08-19`

### docs/js/vessel.js

- Version: `0.14.27`
- Updated: `2026-08-19`

### tools/rebuild_location_matches.py

- Version: `0.14.27`
- Updated: `2026-08-19`

### .github/workflows/rebuild_location_matches.yml

- manueller GitHub-Workflow zur sicheren Nachkorrektur der Standortdaten

### docs/shortcuts/KURZBEFEHL_SCHIFFSSICHTUNG_MIT_FOTOS.md

- vollständige Anleitung für fotoindividuelle Aufnahmezeit und GPS-Daten

### README.md

- vollständige Projektbeschreibung
- aktueller Stand: `0.14.27`


## 32. Neu gezeichnete Linzer Standortpolygone (0.14.28)

Version **0.14.28** ersetzt die fünf ersten Linzer Aufnahmebereiche vollständig durch eine neu gezeichnete Geometrie.

Grund für die Änderung war die visuelle Kontrolle der bisherigen KML in Google Earth: Das bisherige Polygon `AREA-LINZ-NIBELUNGENBRUECKE` entsprach nicht der tatsächlichen Brückengeometrie. Dadurch konnte ein real auf der Nibelungenbrücke aufgenommenes Foto außerhalb des Brückenpolygons liegen.

### 32.1 Nibelungenbrücke

Die Nibelungenbrücke wird nun aus dem tatsächlichen OpenStreetMap-Brückenumriss `way 85676904` abgeleitet. Um normale GPS-Abweichungen des iPhones abzufangen, wird um den tatsächlichen Brückenumriss ein kleiner Toleranzbereich von ungefähr **7 Metern** verwendet.

Die Brücke behält:

`priority = 100`

Dadurch gewinnt sie weiterhin gegenüber angrenzenden Uferbereichen mit Priorität 80.

Der reale Testpunkt

`48.307400 / 14.285275`

liegt mit der neuen Geometrie innerhalb des Brückenbereichs.

### 32.2 Obere und Untere Donaulände

Die beiden südlichen Uferbereiche wurden als fotografische Aufenthaltskorridore neu gezeichnet:

- `Obere Donaulände, Linz` westlich/stromaufwärts der Nibelungenbrücke;
- `Untere Donaulände, Linz` östlich/stromabwärts der Nibelungenbrücke über den Bereich Lentos bis Brucknerhaus.

Die Übergänge zur Brücke überlappen bewusst geringfügig mit dem Brückenpolygon. Wegen der höheren Brückenpriorität entsteht dadurch keine Mehrdeutigkeit.

Der reale Testpunkt

`48.307980 / 14.287803333333333`

liegt weiterhin in `Untere Donaulände, Linz`.

### 32.3 Nordufer

Auch die beiden nördlichen Bereiche wurden neu aufgebaut:

- `Donauufer Alt-Urfahr, Linz` westlich der Brücke;
- `Urfahraner Donaulände, Linz` östlich der Brücke einschließlich Bereich Ars Electronica.

Beide Polygone bleiben auf der Urfahraner Seite der Donau und besitzen weiterhin Priorität 80.

### 32.4 Kontrolle in Google Earth

Für die visuelle Prüfung werden zusätzlich außerhalb des produktiven Datenmodells KML/KMZ-Kontrollfiles erzeugt. In diesen Dateien ist **jeder Polygon-Eckpunkt ein eigenes Placemark** mit Punktnummer sowie Breiten- und Längengrad. Damit sind die Eckpunkte auch in Google Earth am PC und in der mobilen Google-Earth-App sichtbar.

Die HTML-Karte ist für die Polygonprüfung am iPhone nicht erforderlich.

### 32.5 Nach Einspielen von 0.14.28

Nach dem Commit ist **kein Worker-Deployment erforderlich**, weil nur `data/location_areas.geojson` geändert wird.

Für bereits gespeicherte automatisch ermittelte Standortdaten kann anschließend der vorhandene GitHub-Workflow

`Rebuild location matches`

erneut manuell gestartet werden.

## 33. Technische Prüfung für 0.14.28

Für Version 0.14.28 wurden geprüft:

- `data/location_areas.geojson` als gültiges JSON;
- alle fünf Polygone auf geometrische Gültigkeit;
- der Testpunkt vom 18.08.2026 liegt im neuen Brückenpolygon;
- der Testpunkt vom 19.08.2026 liegt in `Untere Donaulände`;
- KML und KMZ enthalten alle Flächen und jeden Eckpunkt als eigenes Placemark;
- ZIP-Integrität.

## 34. Dateiversionen 0.14.28

### data/location_areas.geojson

- Version: `0.14.28`
- Updated: `2026-08-19`
- fünf Linzer Aufnahmebereiche vollständig neu gezeichnet

### README.md

- vollständige Projektbeschreibung
- aktueller Stand: `0.14.28`


## 35. Version 0.14.29 – Polygonkorrekturen nach Screenshot-Markierungen

Für Version **0.14.29** wurden die Linzer Standortpolygone erneut anhand der vom Nutzer auf OpenStreetMap markierten Korrekturbilder überarbeitet.

### 35.1 Ziel der Anpassung

Die in `0.14.28` neu gezeichneten Flächen waren in mehreren Bereichen noch zu knapp. Gewünscht war insbesondere eine **deutliche Erweiterung der Bereiche außerhalb der Nibelungenbrücke**.

### 35.2 Angepasste Bereiche

Folgende fünf Bereiche wurden neu definiert:

- `Nibelungenbrücke` – leicht vergrößert, damit die Brücke an beiden Enden und seitlich toleranter erfasst wird;
- `Obere Donaulände` – südliches Ufer westlich der Brücke deutlich erweitert;
- `Untere Donaulände` – südliches Ufer östlich der Brücke deutlich erweitert;
- `Donauufer Alt-Urfahr` – nördliches Ufer westlich der Brücke deutlich erweitert;
- `Urfahraner Donaulände` – nördliches Ufer östlich der Brücke deutlich erweitert.

Die neuen Geometrien basieren ausdrücklich auf den vom Nutzer übermittelten Korrektur-Screenshots und dienen als praktische Arbeitsdefinition für die Standortzuordnung in Linz.

### 35.3 Nach Einspielen von 0.14.29

Nach dem Commit ist **kein Worker-Deployment erforderlich**, weil weiterhin nur `data/location_areas.geojson` geändert wird.

Für bereits gespeicherte automatisch ermittelte Standortdaten kann anschließend der vorhandene GitHub-Workflow

`Rebuild location matches`

erneut manuell gestartet werden.

## 36. Technische Prüfung für 0.14.29

Für Version 0.14.29 wurden geprüft:

- `data/location_areas.geojson` als gültiges JSON;
- alle fünf Polygone auf geschlossene Ringstruktur;
- ZIP-Integrität.

## 37. Dateiversionen 0.14.29

### data/location_areas.geojson

- Version: `0.14.29`
- Updated: `2026-08-20`
- fünf Linzer Aufnahmebereiche nach Nutzer-Screenshots neu definiert

### README.md

- vollständige Projektbeschreibung
- aktueller Stand: `0.14.29`


## 38. Version 0.14.30 – uMap-Geometrien 1:1 übernommen

Version **0.14.30** ersetzt die Polygongeometrien aus 0.14.29 vollständig.

Quelle ist die vom Nutzer am 20.08.2026 bereitgestellte uMap-Datei `unbenannte_karte.geojson`. Sie enthält genau fünf benannte Polygonobjekte:

- `Nibelungenbrücke`
- `Obere Donaulände`
- `Untere Donaulände`
- `Donauufer Alt-Urfahr`
- `Urfahraner Donaulände`

### 38.1 Verbindliche Übernahmeregel

Die Koordinaten wurden **1:1 aus dem uMap-Export übernommen**. Es erfolgte ausdrücklich keine visuelle Rekonstruktion aus Screenshots und keine geometrische Interpretation durch ChatGPT.

Nicht vorgenommen wurden insbesondere:

- keine Glättung;
- keine zusätzliche Pufferung;
- keine Verschiebung von Eckpunkten;
- keine Vereinfachung der Polygonringe;
- keine automatisierte Anpassung an Straßen- oder Uferlinien.

Ergänzt wurden ausschließlich die bestehenden Projekt-Metadaten wie `area_id`, `location_id`, `public_name`, `priority`, Gemeinde und Land.

### 38.2 Prioritäten

Die bestehende Prioritätslogik bleibt unverändert:

- `Nibelungenbrücke`: `priority = 100`
- alle vier Uferbereiche: `priority = 80`

Damit gewinnt die Nibelungenbrücke bei einer eventuellen geometrischen Überlappung weiterhin vor einem Uferbereich.

### 38.3 Deployment und Rebuild

Für dieses Update ist **kein Cloudflare-Worker-Deployment** erforderlich, weil nur `data/location_areas.geojson` geändert wird.

Nach dem Commit kann der bestehende GitHub-Workflow

`Rebuild location matches`

erneut ausgeführt werden, um automatisch ermittelte Bestandsstandorte anhand der neuen, vom Nutzer gezeichneten Polygone neu zuzuordnen.

## 39. Technische Prüfung für 0.14.30

Geprüft wurden:

- exakt fünf Features im gelieferten uMap-GeoJSON;
- alle fünf erwarteten Namen vorhanden;
- alle fünf Geometrien vom Typ `Polygon`;
- alle Polygonringe geschlossen;
- alle fünf Polygone geometrisch gültig;
- Projekt-GeoJSON als gültiges JSON;
- ZIP-Integrität.

## 40. Dateiversionen 0.14.30

### data/location_areas.geojson

- Version: `0.14.30`
- Updated: `2026-08-20`
- Geometrien 1:1 aus dem uMap-Export des Nutzers übernommen

### README.md

- vollständige Projektbeschreibung
- aktueller Stand: `0.14.30`
