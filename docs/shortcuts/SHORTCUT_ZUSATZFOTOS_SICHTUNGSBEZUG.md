# iPhone-Kurzbefehl „Foto(s) zu Schiff hinzufügen“ – Sichtungsbezug

Projektversion: **0.14.39**  
Stand: **20.08.2026**

## Ziel

Der bestehende Kurzbefehl bleibt ohne Änderung vollständig funktionsfähig. Ohne neue Felder werden Zusatzfotos weiterhin mit `relation_type = vessel` behandelt und gehören nur zum Schiff.

Optional kann der Kurzbefehl nach der Schiffsauswahl fragen, ob die Fotos:

- **Nur zum Schiff** gehören oder
- **Zu bestehender Sichtung** gehören.

Alle Fotos eines einzelnen Zusatzfoto-Uploads erhalten dabei denselben Sichtungsbezug. Die fotoindividuellen Aufnahmezeiten und GPS-Koordinaten bleiben davon unabhängig.

## 1. Bestehende Schiffsauswahl beibehalten

Die vorhandene Abfrage von

`GET /vessel-names`

bleibt unverändert. Für die folgenden Schritte muss nach der Auswahl neben dem Schiffsnamen auch die zugehörige `vessel_id` verfügbar sein.

## 2. Menü „Zuordnung“ ergänzen

Direkt nach der Schiffsauswahl ein Menü mit zwei Einträgen ergänzen:

- `Nur zum Schiff`
- `Zu bestehender Sichtung`

Zwei Variablen verwenden:

- `relation_type`
- `relation_submission_id`

Bei **Nur zum Schiff** setzen:

- `relation_type` = `vessel`
- `relation_submission_id` = leer

## 3. Sichtungen des ausgewählten Schiffs laden

Nur im Zweig **Zu bestehender Sichtung** folgende URL aufrufen:

`<WORKER-URL>/vessel-sightings-upload?vessel_id=<VESSEL-ID>`

Methode: `GET`

Header:

`X-Upload-Key: <vorhandener Upload-Key>`

Die Antwort enthält unter `sightings` die vorhandenen Sichtungen des Schiffs, neueste zuerst. Je Eintrag stehen unter anderem zur Verfügung:

- `submission_id`
- `captured_at`
- `location`
- `berth`
- `movement`
- `direction`

Für die Auswahl am iPhone eignet sich als sichtbarer Text beispielsweise:

`20.08.2026 07:08 · Linz 1 – Brucknerhaus`

bzw. ohne Anlegestelle:

`20.08.2026 07:08 · Urfahraner Donaulände, Linz`

Als intern weiterzuverwendender Wert muss die zugehörige `submission_id` erhalten bleiben.

Bei Auswahl einer Sichtung setzen:

- `relation_type` = `sighting`
- `relation_submission_id` = ausgewählte `submission_id`

Wenn keine Sichtungen vorhanden sind, automatisch auf **Nur zum Schiff** zurückfallen.

## 4. Metadata-JSON ergänzen

Im vorhandenen Metadata-JSON des Zusatzfoto-Uploads zwei Felder ergänzen:

```json
"relation_type":"[relation_type]",
"relation_submission_id":"[relation_submission_id]"
```

Die bisherigen Felder wie `captured_at`, `photo_lat`, `photo_lon`, `photo_metadata`, `vessel_name_entered`, `vessel_id` und `notes` bleiben unverändert.

Beispiel **Nur zum Schiff**:

```json
"relation_type":"vessel",
"relation_submission_id":""
```

Beispiel **Zu bestehender Sichtung**:

```json
"relation_type":"sighting",
"relation_submission_id":"SUB-20260820-062732-2DAB3E"
```

## 5. Servervalidierung

Der Worker akzeptiert einen Sichtungsbezug nur, wenn:

- die Submission-ID gültig ist;
- die Sichtung vorhanden ist;
- die Sichtung bestätigt/reviewed ist;
- die Sichtung tatsächlich zum ausgewählten Schiff gehört.

Damit kann ein Zusatzfoto nicht versehentlich mit einer Sichtung eines anderen Schiffs verknüpft werden.

## 6. Nachträgliche Korrektur

Eine beim Upload falsch oder gar nicht gesetzte Zuordnung kann später auf `vessel.html` direkt am Zusatzfoto geändert werden. Möglich sind wiederum:

- **Nur zum Schiff**;
- eine konkrete vorhandene Sichtung dieses Schiffs.

Das ursprüngliche Submission-JSON wird dabei nicht verändert. Der Sichtungsbezug bleibt eine Eigenschaft des Zusatzfotos.

Nach einer nachträglichen Änderung einmal **Actions -> Rebuild location matches -> Run workflow** ausführen, damit die zentrale Standortkarte den neuen Bezug in `data/photo_locations.json` Schema 3 übernimmt.
