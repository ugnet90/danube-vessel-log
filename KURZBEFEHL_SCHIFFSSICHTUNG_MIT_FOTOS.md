# Kurzbefehl „Schiffsichtung mit Foto(s)“ – Version 0.14.22

## Ziel

Für eine Foto-Sichtung müssen Aufnahmezeit und Aufnahmeort aus den Fotodaten stammen – nicht vom späteren Zeitpunkt bzw. Standort des Uploads.

Bei mehreren Fotos bestimmt das **erste ausgewählte Foto** die Metadaten der Sichtung.

## Bestehender Anfang des Kurzbefehls

Der Kurzbefehl enthält bereits sinngemäß:

1. `Erstes Objekt von Kurzbefehleingabe abrufen`
2. `Ort aus Objekt aus Liste abrufen`
3. `Aktuellen Ort abrufen`
4. `Breitengrad aus Aktueller Standort abrufen`
5. `Längengrad aus Aktueller Standort abrufen`
6. `Aktuelles Datum`
7. `Datum formatieren`

## A. Aufnahmedatum aus dem Foto verwenden

### 1. Erstes Foto beibehalten

Die vorhandene Aktion

`Erstes Objekt von Kurzbefehleingabe abrufen`

bleibt bestehen.

### 2. Foto-Aufnahmedatum lesen

Direkt danach eine weitere Aktion zum Abrufen der Bilddetails einfügen bzw. die bestehende Detail-Aktion duplizieren.

Als Detail auswählen:

`Aufnahmedatum`

Quelle ist dasselbe **erste Objekt aus der Liste**.

Das Ergebnis ist der tatsächliche Aufnahmezeitpunkt des ersten Fotos.

### 3. Variable festlegen

Das Ergebnis als Variable festlegen, z. B.:

`sighting_captured_at`

### 4. Bisheriges „Aktuelles Datum“ nicht mehr für captured_at verwenden

Die Aktion `Aktuelles Datum` darf nicht mehr die Eingabe für das später verwendete `Datum formatieren` sein.

Die vorhandene Aktion `Datum formatieren` bleibt bestehen; nur ihre Eingabe wird auf

`sighting_captured_at`

geändert.

Die bisherigen Format-Einstellungen der Aktion bleiben unverändert.

Damit wird das Format weiterhin so erzeugt, wie der Worker es bereits akzeptiert; nur der zugrunde liegende Zeitpunkt ist nun der Fotozeitpunkt.

### 5. Falls kein Aufnahmedatum vorhanden ist

Falls die Bilddetail-Aktion kein Aufnahmedatum liefert, nach Datum und Uhrzeit der tatsächlichen Sichtung fragen und dieses Ergebnis als `sighting_captured_at` verwenden.

Nicht automatisch auf den Uploadzeitpunkt zurückfallen.

## B. Foto-GPS statt aktuellem iPhone-Standort verwenden

### 1. Vorhandenen Foto-Ort verwenden

Die vorhandene Aktion

`Ort aus Objekt aus Liste abrufen`

liefert den im ersten Foto gespeicherten Ort.

### 2. Aktuellen Standort nicht mehr als Foto-Ort verwenden

Die folgenden Aktionen dürfen für eine Foto-Sichtung nicht mehr die Werte von `photo_lat` und `photo_lon` liefern:

- `Aktuellen Ort abrufen`
- `Breitengrad aus Aktueller Standort abrufen`
- `Längengrad aus Aktueller Standort abrufen`

### 3. Koordinaten aus dem Foto-Ort lesen

Stattdessen:

- `Breitengrad aus [Ort des Fotos] abrufen`
- `Längengrad aus [Ort des Fotos] abrufen`

Diese Ergebnisse werden weiterhin als die Variablen verwendet, die später im Metadata-JSON bei `photo_lat` und `photo_lon` eingesetzt werden.

### 4. Foto ohne GPS

Hat das Foto keinen gespeicherten Ort, sollen `photo_lat` und `photo_lon` leer bleiben.

Nicht den aktuellen Standort beim Upload einsetzen.

Eine ausgewählte bekannte Anlegestelle kann der Worker anschließend über deren `location_id` dem Aufnahmeort zuordnen.

## C. Metadata-JSON

Die Struktur bleibt grundsätzlich erhalten:

```json
{
  "captured_at":"[Formatiertes Foto-Aufnahmedatum]",
  "photo_lat":"[Breitengrad aus Foto-Ort]",
  "photo_lon":"[Längengrad aus Foto-Ort]",
  "movement":"[movement]",
  "direction":"[direction]",
  "berth_status":"[berth_status]",
  "berth_id":"[berth_id]",
  "berth_name_entered":"[berth_name_entered]",
  "vessel_name_entered":"[vessel_name_entered]",
  "vessel_id":"[vessel_id]",
  "notes":""
}
```

## D. Kontrolltest

Für ein Foto, das am **17.08.2026 um 07:07 Uhr** aufgenommen und erst am **18.08.2026** hochgeladen wird, muss gelten:

- Website „Aufgenommen“: `17.08.2026, 07:07`
- `uploaded_at`: 18.08.2026 zum tatsächlichen Uploadzeitpunkt
- `captured_at`: 17.08.2026 entsprechend 07:07 Uhr lokaler Aufnahmezeit
- `photo_lat` / `photo_lon`: Koordinaten des Fotos oder leer
- niemals Koordinaten des aktuellen Upload-Standorts als Ersatz für Foto-GPS

## E. Wichtig für alte Sichtungen

Diese Shortcut-Änderung wirkt nur bei neuen Uploads.

Bereits falsch gespeicherte `captured_at`-Werte müssen separat korrigiert werden, wenn der tatsächliche Aufnahmezeitpunkt bekannt ist.
