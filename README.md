# Trainingsplan

Persönliche Trainings-App fürs Handy (iPhone und Android) (Web-App/PWA). Alle Daten bleiben lokal auf dem Gerät.

- Muskelkarte im Reiter „Übungen“ (drehbar, Muskel antippen zeigt passende Übungen); trainierte Muskeln in den Animationen rot markiert
- Plan erstellen lassen (Fragebogen) oder eigenen Plan bauen
- Training protokollieren: Sätze, Wiederholungen, Gewicht; Läufe mit Strecke und Zeit
- Timer und Stoppuhr, bei Zeitübungen direkt pro Satz startbar
- Übungsbibliothek mit animierten Skizzen, Erklärungen, typischen Fehlern und Videolinks
- Kalender-Übersicht, Erinnerungen als Kalendertermine, Backup

Installieren: iPhone: Safari → Teilen → „Zum Home-Bildschirm“. Android: Chrome → Menü → „App installieren“ (Samsung Internet löst eine Play-Protect-Warnung aus).

Keine Build-Schritte: `index.html`, `app.js`, `exercises.js`, `style.css`, `sw.js`.
Bei Änderungen die `VERSION` in `sw.js` erhöhen, damit installierte Apps das Update laden.
