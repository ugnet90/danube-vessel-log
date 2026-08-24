# Kurzbefehl-Anpassung 0.15.0 – Liegeposition

## Ziel

Ab Version 0.15.0 kann eine angelegte Sichtung zusätzlich speichern, in welcher Reihe ein Schiff längsseits liegt.

Gespeichert wird im Feld:

`alongside_position`

Zulässige Werte:

- `1` = direkt an der Anlegestelle;
- `2` = zweite Reihe, längsseits am inneren Schiff;
- `3` = dritte Reihe, längsseits an der zweiten Reihe;
- `unknown` bzw. leer = Liegeposition nicht bekannt.

Die Angabe beschreibt ausschließlich die konkrete Sichtung. Aus mehreren historischen Sichtungen an derselben Anlegestelle wird keine gleichzeitige Päckchenbelegung abgeleitet.

## Betroffene Kurzbefehle

Die Anpassung gilt für beide Sichtungs-Kurzbefehle:

- **Schiffsichtung mit Foto(s)**
- **Schiffsichtung ohne Foto**

Der separate Kurzbefehl für zusätzliche Fotos benötigt keine Änderung, weil er keine neue Sichtung erzeugt.

## 1. Nur bei „angelegt“ fragen

Die Abfrage wird unmittelbar nach der Auswahl der Anlegestelle eingefügt.

Wenn `movement = moored` gilt und eine konkrete gelistete oder nicht gelistete Anlegestelle ausgewählt wurde, aus einer Liste auswählen:

- `1 – direkt am Anleger`
- `2 – zweite Reihe`
- `3 – dritte Reihe`
- `Unbekannt`

Wenn `movement = moving`, `movement = unknown` oder die Anlegestelle unbekannt/nicht zutreffend ist, wird keine zusätzliche Frage gestellt und die Variable `alongside_position` auf `unknown` gesetzt.

## 2. Auswahl in den technischen Wert umwandeln

Empfohlene Zuordnung:

| sichtbare Auswahl | Wert für `alongside_position` |
|---|---|
| 1 – direkt am Anleger | `1` |
| 2 – zweite Reihe | `2` |
| 3 – dritte Reihe | `3` |
| Unbekannt | `unknown` |

Die Variable kann im Kurzbefehl ebenfalls `alongside_position` heißen.

## 3. Metadaten bei „Schiffsichtung mit Foto(s)“

Im bestehenden Metadata-JSON wird genau eine Zeile ergänzt:

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
  "alongside_position":"[alongside_position]",
  "vessel_name_entered":"[vessel_name_entered]",
  "vessel_id":"[vessel_id]",
  "notes":""
}
```

Die vorhandenen fotoindividuellen `photo_metadata`-Datensätze bleiben unverändert. Die Liegeposition gehört zur Sichtung, nicht zu einem einzelnen Foto.

## 4. Metadaten bei „Schiffsichtung ohne Foto“

Auch im JSON dieses Kurzbefehls wird ergänzt:

```json
"alongside_position":"[alongside_position]"
```

An den übrigen Feldern ändert sich nichts.

## 5. Rückwärtskompatibilität

Ältere Kurzbefehle, die `alongside_position` nicht senden, funktionieren weiter. Der Worker speichert dann:

```json
"alongside_position": null
```

Eine alte Sichtung wird dadurch nicht nachträglich als Position 1 interpretiert.

## 6. Plausibilitätsregeln im Worker

Der Worker akzeptiert nur:

- `1`, `2`, `3`;
- `unknown`;
- leer bzw. nicht vorhanden.

Bei einer Sichtung in Fahrt darf keine Position 1–3 gespeichert werden.

## 7. Kontrolltests

Nach dem Worker-Deployment jeweils eine Testsichtung durchführen:

1. `moored` + bekannte Anlegestelle + Position 1;
2. `moored` + bekannte Anlegestelle + Position 2;
3. `moored` + bekannte Anlegestelle + Position 3;
4. `moored` + Position unbekannt;
5. `moving` ohne Liegepositionsfrage.

Auf der Review-Seite muss die gespeicherte Liegeposition sichtbar und korrigierbar sein. Auf der Standortkarte müssen Position 1, 2 und 3 in unterschiedlichen parallelen Abständen flussseitig der Liegekante erscheinen.
