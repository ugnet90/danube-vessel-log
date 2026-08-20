# Danube Vessel Log

Aktuelle Version: **0.14.39**  
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

### 4.3 Bedeutung von Sichtung, Aufnahmeort und Schiffsposition

Eine **Sichtung** ist das Beobachtungsereignis und nicht bloß ein einzelner Kartenpunkt. Sie verknüpft ein bestimmtes Schiff mit einem Zeitpunkt bzw. einem zusammengehörigen Aufnahmevorgang.

Dabei werden drei Ebenen getrennt:

- **Sichtung**: das Ereignis bzw. die Submission;
- **Foto-Aufnahmeort / Beobachtungsort**: tatsächliche GPS-Position des iPhones bzw. Fotografen; jedes Foto kann einen eigenen Aufnahmeort besitzen;
- **Schiffsposition**: bekannte Position des beobachteten Schiffs. Bei `movement = moored` ist dies die erfasste Anlegestelle. Bei fahrenden Schiffen wird ohne belastbaren Positionsnachweis kein Schiffspunkt erfunden.

Mehrere Fotos derselben Sichtung dürfen daher von unterschiedlichen Aufnahmeorten stammen. Auf der Karte werden diese Aufnahmeorte jeweils direkt mit der bekannten Schiffsposition derselben Sichtung verbunden. Die gestrichelte Linie bedeutet **„Foto gehört zu dieser Sichtung“** und stellt keinen Fahrweg dar.

### 4.4 Review-Flow

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

Ab Version **0.14.39** besitzt ein direktes Zusatzfoto zusätzlich einen expliziten Bezug:

- `relation.type = "vessel"`: Foto gehört nur zum Schiff;
- `relation.type = "sighting"` plus `relation.submission_id`: Foto wurde nachträglich einer konkreten bestehenden Sichtung zugeordnet.

Auch bei Sichtungsbezug bleibt das Foto kanonisch in `data/vessel_photos/<vessel_id>.json`; die ursprüngliche Submission wird nicht rückwirkend umgeschrieben. Die Schiffdetailseite stellt ein solches Foto trotzdem bei der zugeordneten Sichtung dar. Die Zuordnung kann dort später geändert oder wieder auf **Nur zum Schiff** zurückgesetzt werden.

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
- `relation.type` (`vessel` oder `sighting`)
- bei Sichtungsbezug `relation.submission_id`
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

## 41. Version 0.14.31 – Fotoindividuelle Zusatzfoto-Metadaten

Version **0.14.31** korrigiert den Uploadpfad **„Foto(s) zu Schiff hinzufügen“**.

Der iPhone-Kurzbefehl übermittelt bei mehreren Fotos bereits ein Array `photo_metadata` mit einem Datensatz pro Foto. Bis einschließlich 0.14.30 wertete der Worker beim direkten Anhängen an ein bestehendes Schiff jedoch nur die gemeinsamen Felder `captured_at`, `photo_lat` und `photo_lon` aus. Dadurch erhielten alle gleichzeitig hinzugefügten Fotos Zeit und Standort des ersten Fotos.

Ab 0.14.31 gilt auch für Zusatzfotos:

- `photo_metadata[0]` gehört zu Foto 1, `photo_metadata[1]` zu Foto 2 usw.;
- jedes Foto erhält sein eigenes `captured_at`;
- jedes Foto erhält seine eigenen `photo_lat`/`photo_lon`;
- der Aufnahmeort wird für jedes Foto separat gegen `data/location_areas.geojson` aufgelöst;
- `metadata_version = 1` kennzeichnet fotoindividuelle Metadaten;
- der Ablagepfad `inbox/photos/JJJJ/MM/...` richtet sich bei vorhandenen Individualdaten nach dem Aufnahmezeitpunkt des jeweiligen Fotos;
- ältere Kurzbefehle ohne `photo_metadata` bleiben kompatibel und verwenden weiterhin die gemeinsamen Felder.

Die gleiche Logik wird auch genutzt, wenn Fotos nachträglich einer bestehenden Submission hinzugefügt werden.

### 41.1 Bestehende Sichtungsfotos und Polygonänderungen

Der vorhandene Workflow **`Rebuild location matches`** bleibt das Werkzeug, um gespeicherte Foto-Koordinaten nach einer Änderung von `data/location_areas.geojson` erneut auszuwerten.

Der reale Testpunkt `48.30854666666666 / 14.28225` liegt im aktuellen, aus uMap übernommenen Polygon **„Donauufer Alt-Urfahr, Linz“** und soll daher genau so dargestellt werden. Dafür ist keine Änderung dieses Polygons erforderlich.

### 41.2 Deployment

Da `cloudflare/worker.js` geändert wird, ist nach dem Commit ein **Cloudflare-Worker-Deployment erforderlich**.

Anschließend:

1. den Workflow `Rebuild location matches` ausführen, damit bereits gespeicherte Sichtungsfotos mit ihren vorhandenen GPS-Daten gegen die aktuellen uMap-Polygone neu aufgelöst werden;
2. den Kurzbefehl **„Foto(s) zu Schiff hinzufügen“** mit zwei Fotos unterschiedlicher Aufnahmezeit bzw. unterschiedlichem Aufnahmeort testen.

## 42. Technische Prüfung für 0.14.31

Geprüft wurden:

- JavaScript-Syntax des Workers mit `node --check`;
- `photo_metadata` wird im Zusatzfoto-Endpunkt validiert;
- pro Foto werden individuelle Zeit und Koordinaten verwendet;
- pro Foto wird der Standort separat aufgelöst;
- Legacy-Fallback ohne `photo_metadata` bleibt erhalten;
- die API-Antwort enthält die gespeicherten fotoindividuellen Werte zur leichteren Kontrolle;
- ZIP-Integrität.

## 43. Dateiversionen 0.14.31

### cloudflare/worker.js

- Version: `0.14.31`
- Updated: `2026-08-20`
- fotoindividuelle Zusatzfoto-Metadaten und Standortauflösung

### docs/shortcuts/KURZBEFEHL_FOTOS_ZU_SCHIFF_HINZUFUEGEN.md

- dokumentiert das in 0.14.31 erwartete `photo_metadata`-Format
- beschreibt Rückwärtskompatibilität und Testablauf

### README.md

- vollständige Projektbeschreibung
- aktueller Stand: `0.14.31`

## 44. Version 0.14.32 – verfeinerte uMap-Polygone

Version **0.14.32** übernimmt die vom Nutzer in uMap nochmals präzise bearbeiteten Linzer Aufnahmebereiche. Die Geometrien wurden **1:1** aus dem gelieferten GeoJSON übernommen; es erfolgt keine automatische Glättung, Pufferung, Verschiebung oder sonstige geometrische Interpretation.

### 44.1 Schwerpunkt der Korrektur

Insbesondere die Grenzbereiche zwischen der `Nibelungenbrücke` und den direkt angrenzenden Bereichen wurden in uMap genauer nachgezeichnet:

- `Donauufer Alt-Urfahr`
- `Urfahraner Donaulände`
- `Obere Donaulände`
- `Untere Donaulände`

Die Prioritäten bleiben unverändert:

- `Nibelungenbrücke`: `priority = 100`
- alle vier Uferbereiche: `priority = 80`

Damit entscheidet die Brücke weiterhin bei einer tatsächlichen geometrischen Überlappung.

### 44.2 Kontrolle mit realen Foto-GPS-Daten

Die drei zuletzt geprüften Foto-GPS-Punkte werden mit den neuen Polygonen wie folgt zugeordnet:

- `48.308546666666666 / 14.28225` → `Donauufer Alt-Urfahr, Linz`
- `48.309096666666667 / 14.283453333333333` → `Donauufer Alt-Urfahr, Linz`
- `48.306766666666667 / 14.283395333333333` → `Obere Donaulände, Linz`

Der früher geprüfte Brückenpunkt

- `48.3074 / 14.285275`

liegt weiterhin in `Nibelungenbrücke, Linz`.

### 44.3 Verhältnis zu 0.14.31

Das ZIP-Paket 0.14.32 ist **kumulativ** und enthält auch den Worker-Fix aus 0.14.31 für fotoindividuelle Metadaten beim Kurzbefehl **„Foto(s) zu Schiff hinzufügen“**. Dadurch kann 0.14.32 auch direkt auf 0.14.30 angewendet werden.

Falls 0.14.31 bereits eingespielt wurde, sind `cloudflare/worker.js` und die Kurzbefehldokumentation in 0.14.32 inhaltlich unverändert; neu ist in diesem Schritt `data/location_areas.geojson`.

### 44.4 Deployment und Rebuild

- Falls der Worker-Fix aus **0.14.31 noch nicht deployed** wurde: nach dem Commit den Cloudflare Worker deployen.
- Falls 0.14.31 bereits deployed wurde: wegen der Polygonänderung ist **kein erneutes Worker-Deployment** erforderlich.
- Danach `Rebuild location matches` ausführen, damit vorhandene Foto-GPS-Daten gegen die neuen Polygone neu aufgelöst werden.

## 45. Technische Prüfung für 0.14.32

Geprüft wurden:

- exakt fünf Features im gelieferten uMap-GeoJSON;
- alle fünf erwarteten Namen vorhanden;
- alle Geometrien vom Typ `Polygon`;
- alle Polygonringe geschlossen;
- alle fünf Polygone geometrisch gültig;
- die vier genannten realen GPS-Testpunkte ergeben die erwarteten Bereiche;
- Projekt-GeoJSON ist gültiges JSON;
- ZIP-Integrität.

## 46. Dateiversionen 0.14.32

### data/location_areas.geojson

- Version: `0.14.32`
- Updated: `2026-08-20`
- Geometrien 1:1 aus dem verfeinerten uMap-Export übernommen

### cloudflare/worker.js

- Stand: `0.14.31`
- unverändert gegenüber 0.14.31
- im kumulativen Paket enthalten

### docs/shortcuts/KURZBEFEHL_FOTOS_ZU_SCHIFF_HINZUFUEGEN.md

- Stand: `0.14.31`
- unverändert gegenüber 0.14.31
- im kumulativen Paket enthalten

### README.md

- vollständige Projektbeschreibung
- aktueller Projektstand: `0.14.32`

## 47. Version 0.14.33 – Standortkarte in der Weboberfläche

Version **0.14.33** integriert die Polygonkontrolle direkt in die Weboberfläche. Die bisher separat erzeugte HTML-Kontrollkarte ist damit für den normalen Betrieb nicht mehr erforderlich.

### 47.1 Neuer Navigationspunkt

Die Hauptnavigation enthält neu den Eintrag:

`Standorte`

Der Link öffnet:

`docs/location_areas.html`

Die Seite verwendet OpenStreetMap als Hintergrund und zeigt die aktuell veröffentlichten Linzer Standortpolygone deutlich eingefärbt und mit kräftiger Kontur.

### 47.2 Funktionen der Standortseite

Die neue Seite bietet:

- Darstellung aller aktuellen Standortpolygone auf OpenStreetMap;
- farblich eindeutige Polygone mit verstärkter Kontur und höherer Deckkraft;
- Bereichsliste links neben der Karte;
- Klick auf einen Bereich zoomt direkt auf das Polygon;
- Klick auf ein Polygon zeigt Name, Priorität und Beschreibung;
- optionales Ein-/Ausblenden aller nummerierten Eckpunkte;
- Klick auf einen Eckpunkt zeigt Breiten- und Längengrad;
- direkter Link auf das verwendete GeoJSON.

### 47.3 GeoJSON-Spiegel für GitHub Pages

Die kanonische Polygondatei bleibt:

`data/location_areas.geojson`

Da die GitHub-Pages-Oberfläche aus `docs/` veröffentlicht wird, verwendet die neue Standortseite zusätzlich einen synchronen Spiegel:

`docs/data/location_areas.geojson`

Bei jeder zukünftigen Polygonänderung müssen beide Dateien denselben Geometriestand enthalten. Die von ChatGPT erzeugten Update-Pakete sollen beide Dateien gemeinsam aktualisieren.

Der in 0.14.33 neu hinzugefügte Spiegel entspricht exakt dem Polygonstand aus 0.14.32.

### 47.4 Deployment

Für 0.14.33 ist **kein Cloudflare-Worker-Deployment** erforderlich. Nach dem Commit steht der neue Navigationslink über die GitHub-Pages-Weboberfläche zur Verfügung.

## 48. Technische Prüfung für 0.14.33

Geprüft wurden:

- `docs/data/location_areas.geojson` ist byte-identisch zum Polygonstand aus 0.14.32;
- neue HTML-, CSS- und JavaScript-Dateien sind vollständig vorhanden;
- `docs/js/site_map.js` enthält den neuen Navigationspunkt `Standorte`;
- JavaScript-Syntax von `docs/js/location_areas.js` mit `node --check`;
- JSON-Syntax des GeoJSON-Spiegels;
- ZIP-Integrität.

## 49. Dateiversionen 0.14.33

### docs/location_areas.html

- Version: `0.14.33`
- neue integrierte OpenStreetMap-Polygonansicht

### docs/css/location_areas.css

- Version: `0.14.33`
- Layout, Kartenhöhe, Bereichsliste und Eckpunktdarstellung

### docs/js/location_areas.js

- Version: `0.14.33`
- Laden und Darstellen der Standortpolygone
- Bereichszoom und optionale Eckpunktanzeige

### docs/js/site_map.js

- Version: `0.14.33`
- neuer Navigationspunkt `Standorte`

### docs/data/location_areas.geojson

- Stand der Geometrie: `0.14.32`
- synchroner GitHub-Pages-Spiegel von `data/location_areas.geojson`

### README.md

- vollständige Projektbeschreibung
- aktueller Projektstand: `0.14.33`

## 50. Version 0.14.34 – Fotoaufnahme direkt auf Standortkarte

Version **0.14.34** verknüpft fotoindividuelle GPS-Daten direkt mit der integrierten Standortkarte.

### 50.1 Link an Fotos

Bei Fotos mit gespeicherten `photo_lat`- und `photo_lon`-Werten erscheint auf der Schiffdetailseite neu der Link:

`Auf Karte`

Der Link wird sowohl bei

- **Zusätzlichen Schiffsfotos** als auch
- den einzelnen Fotos innerhalb einer **Sichtung**

angezeigt. Fotos ohne verwertbare GPS-Koordinaten erhalten keinen Kartenlink.

### 50.2 Zielseite mit Foto-Marker und Polygonen

Der Kartenlink öffnet `docs/location_areas.html` mit den GPS-Koordinaten des gewählten Fotos als URL-Parameter.

Die Standortseite:

- lädt weiterhin alle aktuellen Standortpolygone auf OpenStreetMap;
- setzt zusätzlich einen deutlich sichtbaren Marker auf den exakten gespeicherten GPS-Punkt des Fotos;
- zoomt automatisch auf den GPS-Punkt;
- zeigt Aufnahmezeit und Koordinaten;
- zeigt die aktuell am Foto gespeicherte Standortzuordnung;
- berechnet clientseitig, in welchem bzw. welchen Polygonen der GPS-Punkt tatsächlich liegt;
- sortiert Mehrfachtreffer nach der hinterlegten Polygon-Priorität.

Damit lässt sich insbesondere bei Grenzfällen sofort unterscheiden, ob ein falscher Standort aus der Polygongeometrie bzw. Prioritätslogik stammt oder ob bereits die vom iPhone gespeicherte GPS-Position außerhalb des tatsächlich besuchten Bereichs liegt.

### 50.3 Keine Änderung der Standortlogik

0.14.34 verändert **keine** serverseitige Polygon- oder Rebuild-Logik und ändert keine Standortzuordnung. Die neue Funktion ist zunächst eine direkte visuelle Kontrolle der bereits gespeicherten Foto-GPS-Daten.

Für diese Version ist **kein Cloudflare-Worker-Deployment** erforderlich.

## 51. Technische Prüfung für 0.14.34

Geprüft wurden:

- JavaScript-Syntax von `docs/js/vessel.js`;
- JavaScript-Syntax von `docs/js/location_areas.js`;
- Kartenlinks werden nur bei gültigen Koordinaten erzeugt;
- URL-Parameter werden über `URLSearchParams` kodiert;
- die Standortkarte zeigt einen separaten Foto-Marker;
- Punkt-in-Polygon-Prüfung unterstützt Grenzpunkte;
- Mehrfachtreffer werden nach `priority` sortiert;
- ZIP-Integrität.

## 52. Dateiversionen 0.14.34

### docs/js/vessel.js

- Version: `0.14.34`
- Kartenlink je Foto mit fotoindividuellen GPS-Daten

### docs/css/vessel.css

- Version: `0.14.34`
- Darstellung des neuen Links `Auf Karte`

### docs/location_areas.html

- Version: `0.14.34`
- Informationsfeld für ein aus der Schiffseite geöffnetes Foto

### docs/js/location_areas.js

- Version: `0.14.34`
- Foto-Marker, URL-Parameter und clientseitige Polygonprüfung

### docs/css/location_areas.css

- Version: `0.14.34`
- Darstellung der Foto-Informationen auf der Standortseite

### README.md

- vollständige Projektbeschreibung
- aktueller Projektstand: `0.14.34`

## 53. Version 0.14.35 – Fotoorte, Kartenfilter und Anlegestellen

Version **0.14.35** baut die in 0.14.33/0.14.34 eingeführte Standortkarte zu einer gemeinsamen räumlichen Auswertungsoberfläche aus.

### 53.1 Gemeinsame Kartenlogik

Die wiederverwendbare Kartenlogik liegt neu in:

`docs/js/location_map.js`

Sie wird sowohl von der Seite `Standorte` als auch vom Foto-Kartenoverlay der Schiffdetailseite verwendet. Dadurch werden Polygonprüfung, OpenStreetMap-Darstellung, Anlegestellen und Foto-Marker nicht mehr in mehreren Dateien getrennt implementiert.

### 53.2 Foto-Aufnahmeorte auf der Standortkarte

Der Rebuild erzeugt neu einen zentralen abgeleiteten Foto-Standortindex:

- `data/photo_locations.json` – kanonischer abgeleiteter Index;
- `docs/data/photo_locations.json` – synchroner GitHub-Pages-Spiegel.

Ein Eintrag enthält unter anderem:

- `photo_id`;
- `source_type` (`sighting` oder `direct`);
- `submission_id`, soweit vorhanden;
- `vessel_id`;
- `vessel_name`;
- `captured_at`;
- `photo_lat` und `photo_lon`;
- die am Foto gespeicherte Standortzuordnung;
- die Anlegestelle der Sichtung, soweit vorhanden;
- den Bildpfad.

Nur Fotos mit gültigen, von `0/0` verschiedenen GPS-Koordinaten werden in den Kartenindex aufgenommen.

### 53.3 Filter auf der Seite „Standorte“

Auf `docs/location_areas.html` können die folgenden Ebenen unabhängig ein- und ausgeblendet werden:

- **Polygone**;
- **Anlegestellen**;
- **Foto-Aufnahmeorte**;
- **Polygon-Eckpunkte**.

Die Foto-Aufnahmeorte können gefiltert werden nach:

- Schiff;
- Aufnahmeort;
- Fotoart: Sichtungsfoto oder zusätzliches Schiffsfoto;
- Datum von;
- Datum bis.

Für die Foto-Marker ist zusätzlich eine optionale Beschriftung möglich:

- keine Beschriftung;
- Schiffsname;
- Datum;
- Sichtungs-ID;
- Schiff + Datum.

Die Zahl der nach dem Filter noch sichtbaren Fotoorte wird direkt angezeigt.

Die Datenstruktur des Fotoindexes ist bewusst chronologisch auswertbar aufgebaut. Eine dynamische Zeitleiste bzw. ein Abspielmodus kann damit in einer späteren Version ergänzt werden, ohne den Datenbestand nochmals umzubauen.

### 53.4 Anlegestellen als Kartenebene

Die Anlegestellen werden nicht als Polygone geführt. Sie sind punktförmige Referenzobjekte und werden anhand der bereits in `data/berths.csv` vorhandenen Koordinaten dargestellt.

Die Standortseite lädt die aktiven Linzer Anlegestellen über den bestehenden Worker-Endpunkt:

`GET /berths?location_id=LOC-001`

Jede Anlegestelle erscheint mit einem Anker-Marker. Soweit vorhanden, zeigt der Marker bzw. sein Popup:

- Kurzname / öffentlicher Name;
- Stationsnummer;
- Donau-km;
- Ufer;
- Anlagentyp;
- Zugangsart.

Die bisherige Skizze `assets/berths/linz-nibelungen.svg` kann als statische Referenz im Repository verbleiben. Für die normale Standortkontrolle ist sie nicht mehr erforderlich, weil die Anlegestellen direkt in OpenStreetMap eingeblendet werden.

### 53.5 „Auf Karte“ ohne neues Browserfenster

Der Button `Auf Karte` bei einem Foto öffnet ab 0.14.35 **kein neues Fenster und keinen neuen Tab** mehr.

Stattdessen erzeugt `docs/js/vessel.js` auf der bestehenden Schiffdetailseite ein Kartenoverlay. Auf dem iPhone nimmt dieses Overlay nahezu den gesamten Bildschirm ein; am PC erscheint es als großer Dialog über der Schiffseite.

Das Overlay zeigt:

- den exakten fotoindividuellen GPS-Punkt;
- die aktuellen Standortpolygone;
- die aktiven Linzer Anlegestellen;
- Aufnahmezeit;
- GPS-Koordinaten;
- die am Foto gespeicherte Standortbezeichnung;
- den aufgrund der Polygone clientseitig ermittelten Bereich.

Das Overlay kann über `×`, durch Klick auf den Hintergrund oder mit `Esc` geschlossen werden. Die Schiffseite bleibt dabei an derselben Scrollposition erhalten.

Leaflet und die gemeinsame Kartenlogik werden auf `vessel.html` nur bei Bedarf dynamisch geladen. Deshalb muss die bestehende `docs/vessel.html` für diese Funktion nicht ersetzt werden.

## 54. Korrektur einer Anlegestelle nach der Sichtung

0.14.35 ergänzt erstmals die nachträgliche Korrektur der bei einer Sichtung gespeicherten Anlegestelle.

### 54.1 Oberfläche

In der Detailansicht einer Sichtung wird die gespeicherte **Anlegestelle** angezeigt. Über `Ändern` kann sie unabhängig vom Review-Status der Sichtung korrigiert werden.

Zur Auswahl stehen:

- eine aktive Anlegestelle aus `data/berths.csv`;
- `Unbekannt`;
- `Andere, nicht gelistete Anlegestelle` mit Freitext;
- `Nicht zutreffend`.

Bei einer Sichtung mit Bewegung `moving` ist nur `Nicht zutreffend` zulässig.

### 54.2 Worker-Endpunkt

Neu:

`POST /submission-berth`

Der Endpunkt verwendet den Management-API-Schlüssel und:

1. lädt die vorhandene Submission;
2. validiert die neue Anlegestelle gegen die aktiven Referenzdaten;
3. verhindert eine Anlegestelle bei einer Sichtung `in Fahrt`;
4. archiviert den bisherigen und den neuen Wert in `berth_history`;
5. aktualisiert `submission.berth`;
6. aktualisiert bei bereits reviewed Sichtungen im selben atomaren Commit auch `data/sightings.json`.

Eine irrtümlich gewählte Anlegestelle erfordert daher keine neue Sichtung mehr.

### 54.3 Änderungshistorie

Jede tatsächliche Änderung wird in der Submission unter `berth_history` protokolliert mit:

- `changed_at`;
- `previous`;
- `current`.

Wird derselbe Wert nochmals gespeichert, erzeugt der Worker keinen neuen Änderungseintrag.

## 55. Rebuild-Erweiterung in 0.14.35

`tools/rebuild_location_matches.py` bleibt das zentrale Werkzeug zur Neuberechnung der fotoindividuellen Standortzuordnungen und wird zusätzlich erweitert.

Der Rebuild:

- aktualisiert weiterhin Submission- und direkte Foto-Standorte;
- synchronisiert weiterhin `data/sightings.json`;
- erzeugt `data/photo_locations.json` vollständig neu aus dem aktuellen Bestand;
- erzeugt den Spiegel `docs/data/photo_locations.json`;
- synchronisiert `data/location_areas.geojson` nach `docs/data/location_areas.geojson`.

Der Workflow `.github/workflows/rebuild_location_matches.yml` nimmt diese Dateien automatisch in seinen Commit auf.

### 55.1 Erstes Einspielen von 0.14.35

Nach dem Commit von 0.14.35 sind **zwei Schritte** erforderlich:

1. den Cloudflare Worker neu deployen, weil `POST /submission-berth` neu hinzukommt;
2. anschließend einmal `Rebuild location matches` manuell starten, damit der bestehende Fotobestand in `photo_locations.json` aufgenommen wird.

Neue Fotos erscheinen im zentralen Kartenindex nach dem nächsten Rebuild. Die normale Fotoanzeige und die fotoindividuelle Standortzuordnung selbst sind davon nicht abhängig.

## 56. Technische Prüfung für 0.14.35

Geprüft wurden:

- JavaScript-Syntax von `cloudflare/worker.js`;
- JavaScript-Syntax von `docs/js/api.js`;
- JavaScript-Syntax von `docs/js/submissions.js`;
- JavaScript-Syntax von `docs/js/vessel.js`;
- JavaScript-Syntax von `docs/js/location_map.js`;
- JavaScript-Syntax von `docs/js/location_areas.js`;
- Python-Syntax von `tools/rebuild_location_matches.py`;
- synthetischer Rebuild mit Sichtungsfotos und direktem Schiffsfoto;
- Erzeugung von kanonischem und GitHub-Pages-Fotoindex;
- Synchronisierung des Polygonspiegels;
- Filtergrundlagen für Schiff, Ort, Fotoart und Datum;
- ZIP-Integrität.

## 57. Dateiversionen 0.14.35

### cloudflare/worker.js

- Version: `0.14.35`
- neuer Endpunkt `POST /submission-berth`;
- Anlegestellenkorrektur mit Historie und Sichtungsindex-Synchronisierung.

### docs/js/api.js

- Version: `0.14.35`
- `getBerths`;
- `updateSubmissionBerth`.

### docs/submissions.html

- Version: `0.14.35`
- Anzeige und Korrektur der Anlegestelle;
- kein Versionssuffix mehr bei `submissions.js`.

### docs/js/submissions.js

- Version: `0.14.35`
- Auswahl und Speichern einer korrigierten Anlegestelle.

### docs/css/submissions.css

- Version: `0.14.35`
- Layout des Anlegestellen-Korrekturbereichs.

### docs/js/location_map.js

- Version: `0.14.35`
- gemeinsame OSM-/Polygon-/Anlegestellen-/Foto-Marker-Logik.

### docs/location_areas.html

- Version: `0.14.35`
- Ebenenschalter und Foto-Filter.

### docs/js/location_areas.js

- Version: `0.14.35`
- Anzeige aller Fotoorte und aktiven Anlegestellen;
- Filterung und Marker-Beschriftung.

### docs/css/location_areas.css

- Version: `0.14.35`
- Karten-, Filter-, Anlegestellen- und Marker-Darstellung.

### docs/js/vessel.js

- Version: `0.14.35`
- `Auf Karte` als Overlay statt neuem Browserfenster;
- Leaflet und Kartenmodul werden bei Bedarf dynamisch geladen.

### docs/css/vessel.css

- Version: `0.14.35`
- responsives Foto-Kartenoverlay.

### tools/rebuild_location_matches.py

- Version: `0.14.35`
- Aufbau und Spiegelung des Foto-Standortindexes;
- Synchronisierung des Polygonspiegels.

### data/photo_locations.json

- Schema-Version: `1`;
- abgeleiteter zentraler Foto-Standortindex.

### docs/data/photo_locations.json

- Schema-Version: `1`;
- GitHub-Pages-Spiegel des Foto-Standortindexes.

### README.md

- vollständige Projektbeschreibung;
- aktueller Projektstand: `0.14.35`.

## 58. Version 0.14.36 – Koordinaten für Linz 1 und Linz 32

Version **0.14.36** ergänzt die bislang fehlenden Kartenkoordinaten für die beiden Donaustationen, die bereits seit 0.14.3 als aktive Anlegestellen in `data/berths.csv` enthalten sind.

### 58.1 Ursache

`BER-000005` (Donaustation Linz 1) und `BER-000006` (Donaustation Linz 32) waren als aktive Anlegestellen vorhanden, ihre Felder `latitude` und `longitude` waren jedoch leer.

Die Standortkarte 0.14.35 zeichnet Anlegestellen bewusst nur dann als Marker, wenn beide Koordinaten numerisch vorhanden und gültig sind. Deshalb erschienen Linz 1 und Linz 32 nicht auf der Karte, obwohl sie über `GET /berths` geliefert wurden.

### 58.2 Ergänzte Koordinaten

Die Koordinaten wurden aus den `Route planen`-Links der jeweiligen offiziellen Anlegestellenseiten der Donau Schiffsstationen GmbH übernommen:

- `BER-000005` – Donaustation Linz 1 (Brucknerhaus)
  - Breite: `48.310960`
  - Länge: `14.291569`
  - Kartenbereich: Untere Donaulände, Linz
- `BER-000006` – Donaustation Linz 32
  - Breite: `48.313344`
  - Länge: `14.290028`
  - Kartenbereich: Urfahraner Donaulände, Linz

Die vorhandenen IDs, Namen, Stationsnummern, Uferangaben, Strom-km-Angaben und Sortierreihenfolgen bleiben unverändert.

### 58.3 Einspielen

Für 0.14.36 ist **kein Cloudflare-Worker-Deployment** erforderlich.

Der Worker liest `data/berths.csv` bei der Abfrage der Anlegestellen aus dem Repository. Nach dem Commit und der Aktualisierung der GitHub-Pages-Seite sollten beide zusätzlichen Marker auf `Standorte` sichtbar sein.

Ein `Rebuild location matches` ist für diese Änderung ebenfalls **nicht erforderlich**.

## 59. Dateiversionen 0.14.36

### data/berths.csv

- vollständige Anlegestellendatei;
- Koordinaten von Linz 1 und Linz 32 ergänzt;
- Quellen-URLs für diese beiden Einträge auf die jeweiligen offiziellen Donaustationen-Seiten gesetzt;
- Prüfdatum dieser beiden Einträge auf `2026-08-20` aktualisiert.

### README.md

- vollständige Projektbeschreibung;
- aktueller Projektstand: `0.14.36`.

## 60. Version 0.14.37 – Karten-Hover und Schiff-Anlegepositionen

Version **0.14.37** erweitert die Standortkarte um zwei miteinander kombinierte Darstellungen.

### 60.1 Foto-Aufnahmeorte mit Mouseover

Foto-Aufnahmeorte zeigen ihre Kerndaten jetzt bereits beim Darüberfahren mit der Maus. Angezeigt werden – soweit vorhanden – Schiff, Aufnahmezeit, Aufnahmeort und Sichtungs-ID bzw. Fotoart.

Ein Klick auf den Marker öffnet weiterhin das ausführlichere Popup mit Link zum Schiff.

Ist eine permanente Marker-Beschriftung aktiviert, wird diese beim Mouseover vorübergehend durch die Detailinformation ersetzt und danach wiederhergestellt.

### 60.2 Schiffe an Anlegestellen

Die Standortkarte besitzt eine zusätzliche, separat schaltbare Ebene **„Schiffe an Anlegestellen“**.

Dargestellt werden Sichtungen, bei denen:

- `source_type = sighting` gilt,
- die Bewegung `moored`/`angelegt` ist,
- eine bekannte `berth.id` gespeichert ist und
- für diese Anlegestelle gültige Kartenkoordinaten vorhanden sind.

Mehrere Fotos derselben Sichtung erzeugen nur **einen** Schiffmarker. Der Marker verwendet ein Schiff-Symbol statt eines gewöhnlichen Punktes.

Wichtig: Die Position dieses Markers ist die hinterlegte Koordinate der **Anlegestelle** und keine per GPS gemessene Position des Schiffsrumpfs. Das wird auch im Popup ausdrücklich angegeben.

Die vorhandenen Foto-Filter für Schiff und Datum wirken zugleich auf diese Schiffmarker. Bei Filterung auf zusätzliche Schiffsfotos werden folgerichtig keine Anlegepositionen gezeigt, weil direkte Zusatzfotos keine Sichtungen sind.

### 60.3 Bedienung

- Foto-Punkt: Mouseover = Kurzinformation, Klick = Detail-Popup.
- Schiff-Symbol: Mouseover = Schiff, Zeitpunkt, Anlegestelle und Sichtungs-ID; Klick = Detail-Popup.
- `Polygone`, `Anlegestellen`, `Foto-Aufnahmeorte`, `Schiffe an Anlegestellen` und `Eckpunkte` bleiben getrennt ein- und ausschaltbar.

### 60.4 Einspielen

Für Version 0.14.37 ist **kein Cloudflare-Worker-Deployment** erforderlich.

Ein neuer `Rebuild location matches` ist ebenfalls nicht erforderlich, sofern der Foto-Standortindex aus Version 0.14.35 bereits aufgebaut wurde und die Foto-Aufnahmeorte auf der Karte sichtbar sind. Die Schiff-Anlegepositionen werden im Browser aus diesem Index und den aktuellen Anlegestellendaten gebildet.

## 61. Dateiversionen 0.14.37

### docs/js/location_map.js

- Version: `0.14.37`
- Mouseover-Details für Foto-Aufnahmeorte;
- neuer Schiffmarker mit eigenem Schiff-Symbol;
- Popup und Mouseover-Information für Schiff-Anlegepositionen.

### docs/js/location_areas.js

- Version: `0.14.37`
- neue Ebene `Schiffe an Anlegestellen`;
- Gruppierung mehrerer Fotos derselben Sichtung zu genau einem Schiffmarker;
- bestehende Foto-Filter steuern auch die Schiffmarker.

### docs/location_areas.html

- Version: `0.14.37`
- zusätzlicher Ebenenschalter und Zähler für Schiff-Anlegepositionen;
- aktualisierter Bedienhinweis für Mouseover und Klick.

### docs/css/location_areas.css

- Version: `0.14.37`
- Gestaltung der Hover-Tooltips und Schiffmarker.

### data/berths.csv

- unverändert aus Version `0.14.36` mitgeführt, damit Linz 1 und Linz 32 auch bei direktem Sprung auf 0.14.37 ihre Kartenkoordinaten behalten.

### README.md

- vollständige Projektbeschreibung;
- aktueller Projektstand: `0.14.37`.


## 62. Version 0.14.38 – kanonische Kartendaten, vollständige Anlege-Sichtungen und API-Fix

Version **0.14.38** bereinigt die Datenquellen der Standortkarte und korrigiert zwei Regressionen aus dem Ausbau der Kartenfunktionen.

### 62.1 `data/` ist die kanonische Quelle

Für die Kartenoberfläche benötigt GitHub Pages Dateien unter `docs/`, während Worker und Wartungswerkzeuge mit den eigentlichen Projektdaten unter `data/` arbeiten. Ab 0.14.38 gilt deshalb verbindlich:

- `data/location_areas.geojson` ist die **kanonische** Polygondatei;
- `data/photo_locations.json` ist der **kanonische** Kartenindex;
- `docs/data/location_areas.geojson` und `docs/data/photo_locations.json` sind ausschließlich automatisch erzeugte, byte-identische Veröffentlichungs-Spiegel für GitHub Pages;
- Dateien unter `docs/data/` werden für diese beiden Datensätze **nicht manuell gepflegt**.

Das Werkzeug `tools/sync_public_data.py` kopiert ausschließlich von `data/` nach `docs/data/`. Mit `--check` wird geprüft, dass beide Paare exakt identisch sind. Eine Abweichung liefert einen Fehlercode.

Der neue GitHub-Workflow `Sync public data` läuft manuell oder automatisch, wenn eine der beiden kanonischen Dateien auf `main` geändert wird. Damit muss beispielsweise nach einem neuen uMap-Export nur noch `data/location_areas.geojson` ersetzt werden.

Auch `Rebuild location matches` erzeugt zuerst die kanonische Datei `data/photo_locations.json`, synchronisiert danach die Pages-Spiegel und prüft die exakte Übereinstimmung.

### 62.2 Kartenindex Schema 2: Sichtungen unabhängig von Fotos

Bis 0.14.37 wurde die Ebene **„Schiffe an Anlegestellen“** aus den Fotoeinträgen von `photo_locations.json` abgeleitet. Dadurch konnten nur Sichtungen mit einem GPS-indexierten Foto erscheinen. Sichtungen ohne Foto fehlten vollständig; mehrere vorhandene Schiffe im Gesamtbestand sind außerdem nicht automatisch gleichbedeutend mit einer angelegten Sichtung.

Ab 0.14.38 besitzt `data/photo_locations.json` Schema-Version 2 mit zwei getrennten Sammlungen:

- `photos` – GPS-Aufnahmeorte einzelner Fotos;
- `sightings` – bestätigte, korrigiert bestätigte oder aus der Sichtung neu angelegte Schiffszuordnungen, unabhängig davon, ob die Sichtung Fotos enthält.

Ein Sichtungsdatensatz enthält unter anderem `submission_id`, `vessel_id`, `vessel_name`, `captured_at`, `location`, `berth`, `movement`, `direction` und `photo_count`.

Die Schiffmarker an Anlegestellen werden ausschließlich aus diesen Sichtungsdatensätzen erzeugt. Angezeigt werden Sichtungen mit `movement = moored` und einer bekannten Anlegestelle mit Kartenkoordinaten.

Der Zähler unterscheidet nun ausdrücklich zwischen Anzahl der **Anlege-Sichtungen** und Anzahl der darin vorkommenden **unterschiedlichen Schiffe**. Die Zahl muss daher nicht der Gesamtzahl aller in der Datenbank gespeicherten Schiffe entsprechen.

### 62.3 Foto-Kartenoverlay mit fotografiertem Schiff

Wird bei einem Sichtungsfoto `Auf Karte` geöffnet, zeigt das bestehende Overlay weiterhin den exakten GPS-Aufnahmeort des Fotografen und die Standortpolygone.

Ist die zugehörige Sichtung als `moored` gespeichert und besitzt sie eine bekannte Anlegestelle, wird zusätzlich:

- das fotografierte Schiff mit dem Schiff-Symbol an der Koordinate der erfassten Anlegestelle dargestellt;
- eine gestrichelte Verbindungslinie vom Foto-GPS-Punkt zur Anlegestelle gezeichnet;
- die Anlegestelle in der Kopfinformation genannt.

Die Schiffmarkierung ist ausdrücklich **keine Schiff-GPS-Position**, sondern die Referenzkoordinate der bei der Sichtung erfassten Anlegestelle.

Bei Sichtungen in Fahrt und bei direkten zusätzlichen Schiffsfotos wird keine Schiffposition erfunden. Dort bleibt es bei der tatsächlichen Foto-GPS-Position und den übrigen Karteninformationen.

### 62.4 Reparatur von Startseite und Schiffsübersicht

Beim Ausbau von `docs/js/api.js` in 0.14.35 ging die bereits vorhandene Methode `getVessels()` versehentlich verloren. Seiten, die die Schiffsliste über `window.VesselApi.getVessels()` laden, konnten deshalb keine Daten mehr darstellen und meldeten unter anderem `window.VesselApi.getVessels is not a function`.

0.14.38 stellt `getVessels()` wieder her, ohne die neueren API-Funktionen für Anlegestellen und Anlegestellenkorrekturen zu entfernen. Damit funktionieren die Schiffsliste und davon abhängige Übersichten wieder mit derselben `/vessels`-API wie vor der Regression.

### 62.5 Einspielen

Für Version 0.14.38 ist **kein Cloudflare-Worker-Deployment** erforderlich.

Nach dem Commit muss einmal ausgeführt werden:

`Actions -> Rebuild location matches -> Run workflow`

Dieser Rebuild erzeugt den Kartenindex in Schema-Version 2 mit der neuen `sightings`-Sammlung und synchronisiert die öffentlichen Datenspiegel. Erst danach kann die Standortseite alle vorhandenen bestätigten angelegten Sichtungen unabhängig von Fotos anzeigen.

Bei späteren reinen Änderungen an `data/location_areas.geojson` oder `data/photo_locations.json` darf nur noch die kanonische Datei unter `data/` geändert werden. Der Workflow `Sync public data` erzeugt die passende Kopie unter `docs/data/` automatisch.

## 63. Dateiversionen 0.14.38

- `docs/js/api.js`: Version `0.14.38`; `getVessels()` wiederhergestellt, neuere API-Methoden bleiben erhalten.
- `tools/rebuild_location_matches.py`: Version `0.14.38`; Kartenindex Schema 2, Sichtungsebene unabhängig von Fotos, kanonische Erzeugung und Synchronisierung.
- `tools/sync_public_data.py`: Version `0.14.38`; zentrale Synchronisierung `data/` -> `docs/data/` mit exakter Konsistenzprüfung.
- `.github/workflows/sync_public_data.yml`: neuer Workflow für die GitHub-Pages-Spiegel.
- `.github/workflows/rebuild_location_matches.yml`: zusätzliche Konsistenzprüfung der öffentlichen Datenspiegel.
- `docs/js/location_map.js`: Version `0.14.38`; gemeinsamer Foto-/Sichtungsindex und Verbindung Foto-Aufnahmeort -> Anlegestelle.
- `docs/js/location_areas.js`: Version `0.14.38`; Schiffmarker aus Sichtungen statt aus Fotos; Filter und getrennte Zähler.
- `docs/location_areas.html`: Version `0.14.38`; präzisierte Erklärung und Zähler.
- `docs/css/location_areas.css`: Version `0.14.38`; Layoutanpassung für die erweiterten Zähler.
- `docs/js/vessel.js`: Version `0.14.38`; Foto-Kartenoverlay mit Schiffmarker und Verbindungslinie bei angelegten Sichtungen.
- `docs/css/vessel.css`: Version `0.14.38`; Darstellung des Schiffmarkers im Foto-Kartenoverlay.
- `README.md`: vollständige Projektbeschreibung; aktueller Projektstand `0.14.38`.


## 64. Version 0.14.39 – Sichtungsbezug, Verbindungslinien und historische Anlegepunkte

Version **0.14.39** präzisiert das Kartenmodell und erweitert direkte Zusatzfotos um einen optionalen Bezug zu einer bestehenden Sichtung.

### 64.1 Sichtung als Ereignis

Eine Sichtung ist ab dieser Version ausdrücklich das übergeordnete Beobachtungsereignis. Foto-Aufnahmeorte und Schiffsposition sind getrennte räumliche Informationen innerhalb dieser Sichtung.

Bei einer angelegten Sichtung gilt:

- Schiffssymbol = Koordinate der erfassten Anlegestelle;
- Fotopunkt = tatsächliche GPS-Koordinate des jeweiligen Fotos;
- gestrichelte Linie = dieses Foto gehört zu dieser Sichtung;
- mehrere Fotos aus verschiedenen Aufnahmeorten erzeugen mehrere direkte Linien zum selben Schiffssymbol.

Bei `movement != moored` wird ohne belastbaren Schiffspositionsnachweis kein künstlicher Schiffspunkt erzeugt.

### 64.2 Zusatzfoto nur zum Schiff oder zu einer Sichtung

Direkte Zusatzfotos in `data/vessel_photos/<vessel_id>.json` erhalten einen expliziten Relation-Block:

```json
{
  "relation": {
    "type": "vessel",
    "submission_id": ""
  }
}
```

oder:

```json
{
  "relation": {
    "type": "sighting",
    "submission_id": "SUB-..."
  }
}
```

Fehlt der Block in historischen Datensätzen, wird das Foto rückwärtskompatibel als **Nur zum Schiff** behandelt. Der Rebuild ergänzt bei vorhandenen direkten Fotos den expliziten Standardbezug.

Der Upload-Endpunkt `/vessel-photos` akzeptiert optional:

- `relation_type`: `vessel` oder `sighting`;
- `relation_submission_id`: erforderliche Submission-ID bei `sighting`.

Ohne diese Felder bleibt das bisherige Verhalten unverändert und die Fotos werden nur dem Schiff zugeordnet.

Für den iPhone-Kurzbefehl steht zusätzlich der mit `X-Upload-Key` geschützte Endpunkt

`GET /vessel-sightings-upload?vessel_id=VES-000123`

zur Verfügung. Er liefert die bestehenden Sichtungen des ausgewählten Schiffs in absteigender Zeitfolge und ermöglicht damit eine Auswahl **Nur zum Schiff / Zu bestehender Sichtung** bereits beim Zusatzfoto-Upload. Die konkrete Kurzbefehlanpassung ist in `SHORTCUT_ZUSATZFOTOS_SICHTUNGSBEZUG.md` beschrieben.

### 64.3 Nachträgliche Zuordnung in der Schiffdetailseite

Bei direkten Zusatzfotos steht nun die Auswahl **Zuordnung** zur Verfügung. Möglich sind:

- **Nur zum Schiff**;
- jede bestätigte vorhandene Sichtung dieses Schiffs.

Die Weboberfläche speichert Änderungen über den neuen Management-Endpunkt:

`POST /vessel-photo-relation`

Ein Zusatzfoto mit gültigem Sichtungsbezug wird in `vessel.html` bei der betreffenden Sichtung als **Nachträglich ergänzt** angezeigt. Es bleibt physisch und kanonisch dennoch ein direkter Schiffsfoto-Datensatz. Wird der Bezug wieder entfernt, erscheint das Foto erneut im Abschnitt **Zusätzliche Schiffsfotos**.

Nach einer Änderung dieser Relation ist für die zentrale Seite **Standorte** ein `Rebuild location matches` erforderlich, damit `data/photo_locations.json` und der automatisch erzeugte öffentliche Spiegel den neuen Bezug übernehmen. Das Foto-Kartenoverlay der Schiffdetailseite verwendet dagegen unmittelbar den aktuellen Schiffsdatensatz.

### 64.4 Kartenindex Schema 3

`data/photo_locations.json` verwendet ab 0.14.39 Schema-Version **3**. Fotoeinträge enthalten zusätzlich den Relation-Block. Bei Sichtungsfotos wird automatisch der Bezug zu ihrer eigenen Submission gespeichert; bei direkten Zusatzfotos wird der kanonische Relation-Block übernommen.

`data/` bleibt weiterhin die einzige manuell bzw. fachlich maßgebliche Datenquelle. `docs/data/` wird ausschließlich automatisch gespiegelt.

### 64.5 Mehrere Aufnahmeorte einer Sichtung

Die Seite `location_areas.html` zeichnet für alle sichtbaren Fotos mit Sichtungsbezug gestrichelte Verbindungen zur bekannten Schiffsposition, sofern die Sichtung `moored` ist und die Anlegestelle gültige Koordinaten besitzt.

Dadurch kann ein angelegtes Schiff beispielsweise von drei verschiedenen Ufer- oder Brückenpositionen fotografiert worden sein und erscheint als ein Schiffspunkt mit drei getrennten Linien zu den drei Foto-Aufnahmeorten.

Auch der **Auf Karte**-Layer in `vessel.html` zeigt beim Öffnen eines Fotos nun den gesamten räumlichen Kontext dieser Sichtung: alle verfügbaren Foto-Aufnahmeorte, die gemeinsame Schiffsposition und je Aufnahmeort eine eigene Verbindungslinie. Das angeklickte Foto wird hervorgehoben.

### 64.6 Mehrere historische Sichtungen an derselben Anlegestelle

Mehrere Schiffsmarker an exakt derselben Anlegestellenkoordinate werden nicht mehr unsichtbar übereinandergelegt. Stattdessen wird ein gemeinsamer Schiffmarker mit Zähler dargestellt.

Antippen bzw. Anklicken öffnet eine chronologisch sortierte Liste der betreffenden Anlege-Sichtungen mit:

- Schiffname;
- Datum/Uhrzeit;
- Submission-ID;
- Link zur Schiffdetailseite.

Bei nur einer sichtbaren Anlege-Sichtung bleibt der normale einzelne Schiffmarker erhalten. Die Gruppierung reagiert auf die bestehenden Schiffs-, Datums-, Orts- und Fotoartfilter.

### 64.7 Deployment

Version 0.14.39 verändert den Cloudflare Worker und erfordert daher ein **Worker-Deployment**.

Anschließend einmal:

`Actions -> Rebuild location matches -> Run workflow`

ausführen. Dadurch werden historische direkte Zusatzfotos mit dem Standardbezug `vessel` normalisiert und der Kartenindex auf Schema 3 aktualisiert.

## 65. Dateiversionen 0.14.39

- `cloudflare/worker.js`: Version `0.14.39`; Relation für direkte Zusatzfotos, Validierung eines Sichtungsbezugs sowie neue Endpunkte `/vessel-photo-relation` und `/vessel-sightings-upload`.
- `docs/js/api.js`: Version `0.14.39`; API-Methode zum Ändern der Zusatzfoto-Zuordnung.
- `docs/js/vessel.js`: Version `0.14.39`; Zusatzfoto-Zuordnung, Anzeige nachträglich zugeordneter Fotos in Sichtungen und Mehrfachlinien im Foto-Kartenoverlay.
- `docs/css/vessel.css`: Version `0.14.39`; Darstellung der Relation-Auswahl und Kennzeichnung nachträglich ergänzter Fotos.
- `tools/rebuild_location_matches.py`: Version `0.14.39`; Kartenindex Schema 3 und Migration historischer direkter Fotos auf Relation `vessel`.
- `docs/js/location_map.js`: Version `0.14.39`; Sammelmarker für mehrere historische Anlege-Sichtungen.
- `docs/js/location_areas.js`: Version `0.14.39`; direkte Foto-zu-Schiff-Verbindungen, gruppierte Anlege-Sichtungen und Relation-Filterung.
- `docs/location_areas.html`: Version `0.14.39`; präzisierte Ebenen- und Bedienbeschreibung.
- `docs/css/location_areas.css`: Version `0.14.39`; Sammelmarker und historische Sichtungsliste.
- `README.md`: vollständige Projektbeschreibung; aktueller Projektstand `0.14.39`.

- `SHORTCUT_ZUSATZFOTOS_SICHTUNGSBEZUG.md`: Schrittfolge für die optionale Sichtungsauswahl im iPhone-Kurzbefehl „Foto(s) zu Schiff hinzufügen“.
