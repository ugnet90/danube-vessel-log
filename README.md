# Danube Vessel Log

Aktuelle Version: **0.14.24**  
Stand: **19.08.2026**

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

Die GPS-Koordinaten werden gegen `data/locations.csv` aufgelöst. Ein Treffer speichert Location-ID, öffentlichen Namen, Gemeinde, Land, Matching-Art und Entfernung.

### 5.3 Hauptfoto

Jedes Schiff kann ein Hauptfoto besitzen. Ein vorhandenes Sichtungsfoto oder ein direktes Schiffsfoto kann über die Weboberfläche als Hauptfoto gesetzt werden.

Wird ein Foto gelöscht, muss ein eventuell betroffenes Hauptfoto konsistent behandelt werden.

### 5.4 Foto-Löschung

Einzelne Fotos können über die Weboberfläche gelöscht werden. Dabei werden sowohl der Bildblob als auch die zugehörigen Verweise bzw. Metadateneinträge aktualisiert. Die Löschinformation wird soweit vorgesehen historisch dokumentiert.

## 6. Standortdaten

### 6.1 Locations

`data/locations.csv`

Locations enthalten unter anderem:

- Location-ID
- Name
- öffentlichen Namen
- Gemeinde
- Land
- Koordinaten
- Matching-Radius

Beispiel:

`LOC-001` – Nibelungenbrücke, Linz

Der Worker kann eine Location über GPS-Koordinaten oder eine explizite `location_id` bestimmen.

### 6.2 Doppelte Ortsbestandteile

Bei der Ausgabe werden doppelte Ortsbestandteile entfernt. Aus

`Nibelungenbrücke, Linz, Linz, Österreich`

wird beispielsweise:

`Nibelungenbrücke, Linz, Österreich`

### 6.3 Anlegestellen

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
- Standortauflösung
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

## 16. Version 0.14.24 – Änderung

### Problem

Der iPhone-Kurzbefehl für zusätzliche Schiffsfotos lieferte bereits:

- `captured_at`
- `photo_lat`
- `photo_lon`
- `vessel_name_entered`
- `vessel_id`
- `notes`

Der Worker speicherte bei `direct_vessel_upload` bisher jedoch nur einen Teil davon. Insbesondere gingen `photo_lat` und `photo_lon` verloren und es wurde keine Location bestimmt. `vessel.html` zeigte bei den zusätzlichen Schiffsfotos außerdem keine Metadaten an.

### Korrektur im Worker

`cloudflare/worker.js` speichert ab 0.14.24 bei direkten Schiffsfotos zusätzlich:

- GPS-Breite
- GPS-Länge
- aufgelösten Location-Datensatz
- eingegebenen Schiffsnamen

Die bereits vorhandenen Werte `captured_at`, `added_at` und `notes` bleiben erhalten.

Die Standortauflösung verwendet die bereits im Projekt vorhandene Location-Logik und `data/locations.csv`.

### Korrektur in vessel.js

`docs/js/vessel.js` zeigt bei zusätzlichen Schiffsfotos nun:

- Aufnahmezeitpunkt mit Uhrzeit
- Aufnahmeort
- optional die Notiz

Auch die große Fotoansicht zeigt bei direkten Schiffsfotos Aufnahmezeitpunkt und – sofern vorhanden – Aufnahmeort.

### Keine Änderung am iPhone-Kurzbefehl

Der Kurzbefehl ist für diese Korrektur bereits richtig vorbereitet und muss **nicht** nochmals geändert werden.

## 17. Verhalten bestehender Zusatzfotos

Die Änderung ist rückwärtskompatibel.

Bereits vorhandene direkte Schiffsfotos besitzen in ihren bisherigen JSON-Datensätzen normalerweise bereits `captured_at`. Dieser Wert wird ab 0.14.24 in der Oberfläche angezeigt.

GPS und Location älterer direkter Fotos wurden vor 0.14.24 jedoch nicht gespeichert. Diese fehlenden Informationen können aus dem bisherigen JSON-Datensatz nicht automatisch rekonstruiert werden. Solche Fotos erscheinen daher gegebenenfalls mit:

`Aufnahmeort unbekannt`

Neue Uploads speichern die GPS-/Location-Daten korrekt.

## 18. Installation des Updates 0.14.24

Dieses ZIP enthält die **vollständigen geänderten Dateien**, nicht nur Patches.

Zu ersetzen sind:

- `cloudflare/worker.js`
- `docs/js/vessel.js`

Vorgehen:

1. ZIP entpacken.
2. `cloudflare/worker.js` im Repository vollständig ersetzen.
3. `docs/js/vessel.js` im Repository vollständig ersetzen.
4. `README.md` im Projektstamm durch die mitgelieferte vollständige Projekt-README ersetzen bzw. übernehmen.
5. Änderungen mit dem Inhalt aus `COMMIT_MESSAGE.txt` committen.
6. Cloudflare Worker neu deployen.
7. GitHub Pages die aktualisierte `vessel.js` bereitstellen lassen.
8. `vessel.html` neu laden; bei Bedarf Browser-Cache umgehen.

## 19. Test für Version 0.14.24

### Neuer direkter Foto-Upload

Mit dem vorhandenen iPhone-Kurzbefehl ein zusätzliches Foto zu einem bestehenden Schiff hochladen.

Danach prüfen:

1. Foto erscheint unter **Zusätzliche Schiffsfotos**.
2. Aufnahmezeitpunkt entspricht dem Foto und nicht dem späteren Uploadzeitpunkt.
3. Bei gültigen Foto-Koordinaten wird der passende Aufnahmeort angezeigt.
4. Eine Notiz wird angezeigt, wenn sie übermittelt wurde.
5. Es wird **keine neue Sichtung** angelegt.
6. Die Sichtungsanzahl bleibt unverändert.
7. Hauptfoto- und Löschfunktion funktionieren weiterhin.

### JSON-Prüfung

In

`data/vessel_photos/<vessel_id>.json`

muss ein neuer Datensatz unter anderem `captured_at`, `photo_lat`, `photo_lon` und `location` enthalten.

## 20. Technische Prüfung

Für Version 0.14.24 wurden die geänderten JavaScript-Dateien mit

`node --check`

auf Syntaxfehler geprüft.

## 21. Rückfall

Bei unerwarteten Problemen können

- `cloudflare/worker.js`
- `docs/js/vessel.js`

auf Version 0.14.23 zurückgesetzt und erneut deployed werden.

Die mit 0.14.24 neu gespeicherten optionalen Foto-Metadaten stören die ältere Leseroutine nicht, werden dort jedoch nicht vollständig angezeigt.

## 22. Dateiversionen dieses Pakets

### cloudflare/worker.js

- Version: `0.14.24`
- Updated: `2026-08-19`

### docs/js/vessel.js

- Version: `0.14.24`
- Updated: `2026-08-19`
