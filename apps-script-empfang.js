/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Immokanzlei GmbH — Empfangs-Skript für Mieterselbstauskunft (Formular 1)
 *                     und Detailangaben (Formular 2)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  ÜBERSICHT
 *  ─────────
 *  Dieses Apps-Script-Projekt empfängt POST-Anfragen aus zwei HTML-Formularen
 *  (formular-1-mieterselbstauskunft.html und formular-2-detailangaben.html),
 *  schreibt die eingehenden Daten in eine Google-Tabelle, bewertet die
 *  Bewerber automatisch in die Kategorien A / B / C und versendet
 *  Folge-E-Mails (Formular-2-Link an Kategorie-A-Bewerber, interne
 *  Benachrichtigung an Mitarbeiter nach Eingang von Formular 2).
 *
 *  EINRICHTUNG (einmalig)
 *  ─────────────────────────────────────────────────────────────────────
 *  1. In Google Drive eine neue Tabelle anlegen, z. B. "Immokanzlei –
 *     Mieterbewerbungen". Zwei Tabellenblätter (Sheets) erstellen:
 *        ─ "Formular 1"
 *        ─ "Formular 2"
 *
 *  2. Im Tabellen-Editor: Erweiterungen → Apps Script → Inhalt dieser
 *     Datei einfügen.
 *
 *  3. Im CONFIG-Objekt unten anpassen:
 *        ─ FIRMA, KALTMIETE, MIN_FAKTOR
 *        ─ MITARBEITER_EMAIL  (interne Empfangsadresse)
 *        ─ FORMULAR_2_LINK    (Web-Adresse von Formular 2)
 *        ─ A_BESCHAEFTIGUNG_LIST (welche Beschäftigungsarten als "A" gelten)
 *
 *  4. Speichern und Bereitstellen → Neue Bereitstellung →
 *     Typ "Webanwendung":
 *        Ausführen als:  ich
 *        Zugriff:        Jeder
 *     Die generierte Web-App-URL kopieren und in beide HTML-Formulare
 *     in die Konstante GAS_URL eintragen.
 *
 *  5. Beim ersten Aufruf von doPost() / sendeFormular2() müssen die
 *     Berechtigungen (Tabellen + Mailversand) genehmigt werden.
 *
 *  6. Optional: Trigger einrichten, der bewertungABC() automatisch
 *     nach jedem Formular-1-Eingang ausführt (Bearbeiter →
 *     installierbarer Trigger, "Bei Formular-Eingabe" / zeitgesteuert).
 *
 *  HINWEIS ZU CORS
 *  ─────────────────────────────────────────────────────────────────────
 *  Die HTML-Formulare senden im "no-cors"-Modus, damit der Browser keine
 *  CORS-Preflight-Anfrage erzwingt. Antworten sind dann opak — die
 *  Erfolgsanzeige wird im Frontend lokal angezeigt, ohne auf eine Antwort
 *  zu warten.
 * ═══════════════════════════════════════════════════════════════════════
 */


/* ─────────────────────────────────────────────────────────────────────
 *  KONFIGURATION
 * ───────────────────────────────────────────────────────────────────── */
const CONFIG = {
  FIRMA: 'Immokanzlei GmbH',
  TELEFON: '+49 7808 5060730',
  WEBSITE: 'https://immokanzlei24.de',

  // E-Mail-Adresse, an die interne Benachrichtigungen gehen:
  MITARBEITER_EMAIL: 'info@immokanzlei24.de',

  // Öffentliche URL des Formulars 2 (z. B. auf eigenem Server gehostet):
  FORMULAR_2_LINK: 'https://immokanzlei24.de/formular-2-detailangaben.html',

  // Google-Drive-Ordner-ID — übergeordneter Ordner, in dem für jede
  // Bewerbung ein Unterordner "[Vorname Nachname] - [Datum]" erzeugt
  // wird. ID aus der Drive-URL kopieren, z. B.:
  // https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt
  //                                          ^^^^^^^^^^^^^^^^^^^^^
  DRIVE_FOLDER_ID: 'IHRE_GOOGLE_DRIVE_ORDNER_ID',

  // Bewertungslogik
  KALTMIETE: 800,                  // EUR – Referenzkaltmiete der Wohnung
  MIN_FAKTOR: 3.0,                 // Nettoeinkommen muss >= KALTMIETE * MIN_FAKTOR sein
  A_BESCHAEFTIGUNG_LIST: [         // Beschäftigungsarten, die als A-Kandidat zählen
    'Angestellt (unbefristet)',
    'Beamter',
    'Beamtin'
  ],

  // Tabellenblatt-Namen
  SHEET_FORM1: 'Formular 1',
  SHEET_FORM2: 'Formular 2',

  // Spalte (1-basiert), in die die A/B/C-Kategorie geschrieben wird
  KATEGORIE_SPALTE: 30,

  // Branding (für E-Mails)
  COLOR_PRIMARY: '#0d1f3c',
  COLOR_ACCENT: '#c9a84c',
  COLOR_BG: '#f4f2ed',
  LOGO_URL: 'https://immokanzlei24.de/wp-content/uploads/2025/03/Logo-Immokanzlei-GmbH-transparent-e1742371123325-300x183.png'
};


/* ─────────────────────────────────────────────────────────────────────
 *  Spalten-Reihenfolge je Formular
 *  (logische Sortierung — Zeitstempel zuerst, dann Bezugsdaten)
 * ───────────────────────────────────────────────────────────────────── */
const SPALTEN_FORM1 = [
  'zeitstempel',
  'vorname', 'nachname', 'email', 'telefon', 'geburtsdatum', 'geburtsort',
  'staatsangehoerigkeit', 'familienstand', 'anzahlPersonen',
  'haustiere', 'haustiereDetail', 'ausweisnummer',
  'beschaeftigung', 'arbeitgeber', 'beschaeftigtSeit',
  'nettoEinkommen', 'weitereEinkuenfte', 'weitereEinkuenfteBetrag', 'probezeit',
  'aktuelleAdresse', 'kaltmiete', 'vermieterName', 'vermieterKontakt', 'wohnenSeit',
  'mietschulden', 'schufa', 'insolvenz', 'kaution',
  'kategorie',
  'einzugstermin', 'mietdauer', 'umzugsgrund', 'anmerkungen',
  'bestaetigung1', 'datenschutz1'
];

const SPALTEN_FORM2 = [
  'zeitstempel',
  'vorname', 'nachname', 'email', 'beruf', 'unbefristet',
  'zusaetzlicheInfos',
  'lohnabrechnung1Datei', 'lohnabrechnung2Datei', 'lohnabrechnung3Datei',
  'ausweisDatei',
  'driveOrdner'
];


/* ═════════════════════════════════════════════════════════════════════
 *  doPost(e)
 *  ─────────────────────────────────────────────────────────────────────
 *  Empfangs-Endpunkt. Nimmt JSON aus beiden Formularen entgegen und
 *  schreibt eine Zeile in das passende Tabellenblatt.
 * ═════════════════════════════════════════════════════════════════════ */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheetName, spalten;

    if (data.formular === 'Mieterselbstauskunft') {
      sheetName = CONFIG.SHEET_FORM1;
      spalten = SPALTEN_FORM1;
    } else if (data.formular === 'Detailangaben') {
      sheetName = CONFIG.SHEET_FORM2;
      spalten = SPALTEN_FORM2;

      // Dateien zuerst in Drive ablegen, anschließend die URLs in
      // die zur Sheet-Spalte gehörenden Felder schreiben. Die rohen
      // Base64-Inhalte werden NICHT in die Tabelle übernommen.
      try {
        const result = saveFilesToDrive(data);
        data.lohnabrechnung1Datei = result.lohn1Url;
        data.lohnabrechnung2Datei = result.lohn2Url;
        data.lohnabrechnung3Datei = result.lohn3Url;
        data.ausweisDatei = result.ausweisUrl;
        data.driveOrdner = result.folderUrl;
      } catch (driveErr) {
        Logger.log('Drive-Upload fehlgeschlagen: ' + driveErr);
        data.lohnabrechnung1Datei = 'FEHLER: ' + driveErr;
        data.lohnabrechnung2Datei = '';
        data.lohnabrechnung3Datei = '';
        data.ausweisDatei = '';
        data.driveOrdner = '';
      }
      delete data.lohnabrechnung1;
      delete data.lohnabrechnung2;
      delete data.lohnabrechnung3;
      delete data.ausweis;
    } else {
      return _jsonResponse({ status: 'error', message: 'Unknown formular type' });
    }

    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, spalten.length).setValues([spalten]);
      sheet.getRange(1, 1, 1, spalten.length)
           .setFontWeight('bold')
           .setBackground(CONFIG.COLOR_PRIMARY)
           .setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    const row = spalten.map(k => (data[k] !== undefined && data[k] !== null) ? data[k] : '');
    sheet.appendRow(row);

    // Auto-Bewertung nur für Formular 1
    if (data.formular === 'Mieterselbstauskunft') {
      try {
        const lastRow = sheet.getLastRow();
        const rowData = _rowToObject(sheet, lastRow, spalten);
        const kategorie = bewertungABC(rowData);
        const katIdx = spalten.indexOf('kategorie') + 1;
        if (katIdx > 0) {
          sheet.getRange(lastRow, katIdx).setValue(kategorie);
        } else {
          sheet.getRange(lastRow, CONFIG.KATEGORIE_SPALTE).setValue(kategorie);
        }

        // Bei A-Kandidaten automatisch Formular 2 senden
        if (kategorie === 'A' && data.email) {
          sendeFormular2(data.email, data.vorname || '', data.nachname || '');
        }
      } catch (innerErr) {
        Logger.log('Bewertung fehlgeschlagen: ' + innerErr);
      }
    }

    // Bei Formular 2: interne Benachrichtigung
    if (data.formular === 'Detailangaben') {
      try { onForm2Submit(data); } catch (innerErr) {
        Logger.log('onForm2Submit fehlgeschlagen: ' + innerErr);
      }
    }

    return _jsonResponse({ status: 'ok' });

  } catch (err) {
    Logger.log('doPost error: ' + err);
    return _jsonResponse({ status: 'error', message: String(err) });
  }
}

function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _rowToObject(sheet, rowNum, spalten) {
  const values = sheet.getRange(rowNum, 1, 1, spalten.length).getValues()[0];
  const obj = {};
  spalten.forEach((k, i) => obj[k] = values[i]);
  return obj;
}


/* ═════════════════════════════════════════════════════════════════════
 *  saveFilesToDrive(data)
 *  ─────────────────────────────────────────────────────────────────────
 *  Legt für eine Bewerbung einen Unterordner im konfigurierten
 *  DRIVE_FOLDER_ID an (Name: "[Vorname Nachname] - [Datum]") und
 *  speichert die übergebenen Dateien dort ab.
 *
 *  Erwartet im data-Objekt jeweils ein einzelnes Datei-Objekt
 *  (oder null) der Form { filename, mimeType, base64 }:
 *      data.lohnabrechnung1
 *      data.lohnabrechnung2
 *      data.lohnabrechnung3
 *      data.ausweis
 *
 *  Rückgabe:
 *      { folderUrl, lohn1Url, lohn2Url, lohn3Url, ausweisUrl }
 * ═════════════════════════════════════════════════════════════════════ */
function saveFilesToDrive(data) {
  if (!CONFIG.DRIVE_FOLDER_ID || CONFIG.DRIVE_FOLDER_ID === 'IHRE_GOOGLE_DRIVE_ORDNER_ID') {
    throw new Error('CONFIG.DRIVE_FOLDER_ID ist nicht gesetzt.');
  }

  const parent = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const tz = Session.getScriptTimeZone() || 'Europe/Berlin';
  const datum = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const personName = ((data.vorname || '') + ' ' + (data.nachname || '')).trim() || 'Unbekannt';
  const folderName = personName + ' - ' + datum;

  const folder = parent.createFolder(folderName);

  function _saveOne(f, prefix) {
    if (!f || !f.base64) return '';
    const safeName = (f.filename || 'datei').replace(/[\\/:*?"<>|]/g, '_');
    const blob = Utilities.newBlob(
      Utilities.base64Decode(f.base64),
      f.mimeType || 'application/octet-stream',
      prefix + '_' + safeName
    );
    return folder.createFile(blob).getUrl();
  }

  return {
    folderUrl: folder.getUrl(),
    lohn1Url: _saveOne(data.lohnabrechnung1, 'Lohnabrechnung_1'),
    lohn2Url: _saveOne(data.lohnabrechnung2, 'Lohnabrechnung_2'),
    lohn3Url: _saveOne(data.lohnabrechnung3, 'Lohnabrechnung_3'),
    ausweisUrl: _saveOne(data.ausweis, 'Ausweis')
  };
}


/* ═════════════════════════════════════════════════════════════════════
 *  bewertungABC(data)
 *  ─────────────────────────────────────────────────────────────────────
 *  Klassifiziert einen Bewerber anhand der vier zentralen Kennzahlen
 *  in Kategorien A / B / C.
 *
 *      A   alle vier Kriterien erfüllt → besichtigungsbereit
 *      B   mindestens 2 von 3 Hauptkriterien erfüllt → manuelle Prüfung
 *      C   sonst → Absage / Nachreichungen erforderlich
 * ═════════════════════════════════════════════════════════════════════ */
function bewertungABC(data) {
  const netto = Number(data.nettoEinkommen) || 0;
  const beschaeftigung = String(data.beschaeftigung || '');
  const mietschulden = String(data.mietschulden || '');
  const schufa = String(data.schufa || '');
  const insolvenz = String(data.insolvenz || '');

  const einkommenOK = netto >= CONFIG.KALTMIETE * CONFIG.MIN_FAKTOR;
  const jobOK = CONFIG.A_BESCHAEFTIGUNG_LIST.some(j => beschaeftigung.indexOf(j) !== -1);
  const schufaOK = schufa === 'Ja';
  const mietschuldenOK = mietschulden === 'Nein';
  const insolvenzOK = insolvenz !== 'Ja';

  if (einkommenOK && jobOK && schufaOK && mietschuldenOK && insolvenzOK) {
    return 'A';
  }
  const hauptKriterien = [einkommenOK, jobOK, schufaOK].filter(Boolean).length;
  if (hauptKriterien >= 2 && mietschuldenOK) {
    return 'B';
  }
  return 'C';
}


/**
 *  bewertungAlleZeilen()
 *  Manuell aus dem Editor ausführbar — bewertet alle Zeilen in
 *  "Formular 1" neu und schreibt das Ergebnis in die kategorie-Spalte.
 */
function bewertungAlleZeilen() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_FORM1);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const katIdx = SPALTEN_FORM1.indexOf('kategorie') + 1 || CONFIG.KATEGORIE_SPALTE;

  for (let r = 2; r <= lastRow; r++) {
    const data = _rowToObject(sheet, r, SPALTEN_FORM1);
    const k = bewertungABC(data);
    sheet.getRange(r, katIdx).setValue(k);
  }
}


/* ═════════════════════════════════════════════════════════════════════
 *  sendeFormular2(email, vorname, nachname)
 *  ─────────────────────────────────────────────────────────────────────
 *  Sendet eine gebrandete HTML-E-Mail mit dem Link zum Formular 2 an
 *  einen Kategorie-A-Bewerber.
 * ═════════════════════════════════════════════════════════════════════ */
function sendeFormular2(email, vorname, nachname) {
  if (!email) return;

  const anrede = (vorname || nachname)
    ? `Liebe/r ${[vorname, nachname].filter(Boolean).join(' ').trim()},`
    : 'Sehr geehrte Damen und Herren,';

  const subject = 'Ihre Bewerbung – nächster Schritt: Detailangaben';

  const html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; background:${CONFIG.COLOR_BG}; font-family:Arial,Helvetica,sans-serif; color:#0d1f3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${CONFIG.COLOR_BG}; padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.08);">

        <tr><td style="background:${CONFIG.COLOR_PRIMARY}; padding:28px 32px; border-bottom:3px solid ${CONFIG.COLOR_ACCENT};">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td>
              <div style="color:${CONFIG.COLOR_ACCENT}; font-size:11px; font-weight:bold; letter-spacing:0.18em; text-transform:uppercase; margin-bottom:6px;">Immokanzlei GmbH</div>
              <div style="color:#ffffff; font-size:22px; font-weight:600; font-family:'Cormorant Garamond',Georgia,serif;">Nächster Schritt Ihrer Bewerbung</div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:32px;">
          <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">${anrede}</p>
          <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">
            herzlichen Dank für Ihre Mieterselbstauskunft. Auf Basis Ihrer Angaben möchten wir Ihre Bewerbung gerne mit weiteren Detailinformationen ergänzen, um Ihnen schnellstmöglich einen Besichtigungstermin anbieten zu können.
          </p>
          <p style="font-size:15px; line-height:1.6; margin:0 0 24px;">
            Bitte füllen Sie dazu unser Formular 2 aus:
          </p>

          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
            <tr><td style="background:${CONFIG.COLOR_ACCENT}; border-radius:8px;">
              <a href="${CONFIG.FORMULAR_2_LINK}" style="display:inline-block; padding:13px 26px; color:${CONFIG.COLOR_PRIMARY}; font-size:15px; font-weight:bold; text-decoration:none;">Formular 2 ausfüllen →</a>
            </td></tr>
          </table>

          <p style="font-size:13px; line-height:1.6; color:#6b7280; margin:0 0 8px;">
            Die Bearbeitung dauert ca. 5–7 Minuten. Halten Sie idealerweise Angaben zu Einkommen und Vermieterreferenz bereit.
          </p>
          <p style="font-size:13px; line-height:1.6; color:#6b7280; margin:0;">
            Bei Rückfragen erreichen Sie uns unter <a href="tel:${CONFIG.TELEFON}" style="color:${CONFIG.COLOR_PRIMARY}; font-weight:600;">${CONFIG.TELEFON}</a> oder per E-Mail an <a href="mailto:${CONFIG.MITARBEITER_EMAIL}" style="color:${CONFIG.COLOR_PRIMARY}; font-weight:600;">${CONFIG.MITARBEITER_EMAIL}</a>.
          </p>
        </td></tr>

        <tr><td style="background:#f4f2ed; padding:18px 32px; border-top:1px solid #d4d0c9; font-size:12px; color:#6b7280; text-align:center;">
          ${CONFIG.FIRMA} · <a href="${CONFIG.WEBSITE}" style="color:#6b7280;">${CONFIG.WEBSITE}</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: html,
    name: CONFIG.FIRMA,
    replyTo: CONFIG.MITARBEITER_EMAIL
  });
}


/* ═════════════════════════════════════════════════════════════════════
 *  onForm2Submit(data)
 *  ─────────────────────────────────────────────────────────────────────
 *  Wird nach Eingang von Formular 2 aufgerufen. Sendet eine
 *  Benachrichtigungs-E-Mail mit allen Antworten an die interne Adresse.
 * ═════════════════════════════════════════════════════════════════════ */
function onForm2Submit(data) {
  const vorname = data.vorname || '';
  const nachname = data.nachname || '';
  const fullName = [vorname, nachname].filter(Boolean).join(' ').trim() || 'Unbekannt';

  const subject = `✅ Besichtigungsbereit: ${fullName}`;

  // Tabelle aller Antworten
  const labels = {
    vorname: 'Vorname',
    nachname: 'Nachname',
    email: 'E-Mail',
    beruf: 'Beruf',
    unbefristet: 'Unbefristet?',
    zusaetzlicheInfos: 'Zusätzliche Informationen',
    lohnabrechnung1Datei: 'Lohnabrechnung 1',
    lohnabrechnung2Datei: 'Lohnabrechnung 2',
    lohnabrechnung3Datei: 'Lohnabrechnung 3',
    ausweisDatei: 'Ausweis',
    driveOrdner: 'Drive-Ordner',
    zeitstempel: 'Eingangszeit'
  };

  const rows = Object.keys(labels).map(k => {
    const v = data[k];
    if (v === undefined || v === null || v === '') return '';
    const str = String(v);
    // URLs (Drive-Links) klickbar machen, mehrzeilige Listen erlauben
    const cell = str.split('\n').map(line => {
      if (/^https?:\/\//.test(line.trim())) {
        return `<a href="${_escape(line.trim())}" style="color:${CONFIG.COLOR_PRIMARY}; font-weight:600;">${_escape(line.trim())}</a>`;
      }
      return _escape(line);
    }).join('<br>');
    return `
      <tr>
        <td style="padding:8px 12px; border-bottom:1px solid #e8e4dc; font-size:13px; color:#6b7280; width:40%; vertical-align:top;">${labels[k]}</td>
        <td style="padding:8px 12px; border-bottom:1px solid #e8e4dc; font-size:13px; color:#0d1f3c; font-weight:500; word-break:break-all;">${cell}</td>
      </tr>`;
  }).filter(Boolean).join('');

  const propstackUrl = 'https://app.propstack.de/contacts';

  const html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; background:#f4f2ed; font-family:Arial,Helvetica,sans-serif; color:#0d1f3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2ed; padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.08);">

        <tr><td style="background:${CONFIG.COLOR_PRIMARY}; padding:24px 32px; border-bottom:3px solid ${CONFIG.COLOR_ACCENT};">
          <div style="color:${CONFIG.COLOR_ACCENT}; font-size:11px; font-weight:bold; letter-spacing:0.18em; text-transform:uppercase; margin-bottom:4px;">Interner Eingang · Formular 2</div>
          <div style="color:#ffffff; font-size:20px; font-weight:600; font-family:'Cormorant Garamond',Georgia,serif;">Bewerbung vollständig — besichtigungsbereit</div>
        </td></tr>

        <tr><td style="background:#1f7a3a; padding:14px 32px; color:#ffffff; font-size:13px; font-weight:600;">
          ✅ Vollständige Unterlagen eingegangen — bereit zur Terminvereinbarung
        </td></tr>

        <tr><td style="padding:28px 32px;">
          <h2 style="margin:0 0 6px; font-family:'Cormorant Garamond',Georgia,serif; font-size:26px; color:#0d1f3c;">${_escape(fullName)}</h2>
          <p style="margin:0 0 22px; color:#6b7280; font-size:13px;">Eingegangen am ${_escape(data.zeitstempel || new Date().toLocaleString('de-DE'))}</p>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2ed; border-radius:8px; padding:14px 18px; margin-bottom:24px;">
            <tr><td style="font-size:13px; color:#0d1f3c;">
              <strong>📧 ${_escape(data.email || '–')}</strong><br>
              <strong>💼 Beruf:</strong> ${_escape(data.beruf || '–')}<br>
              <strong>📁 Drive-Ordner:</strong> ${data.driveOrdner ? `<a href="${_escape(data.driveOrdner)}" style="color:${CONFIG.COLOR_PRIMARY}; font-weight:600;">öffnen</a>` : '–'}
            </td></tr>
          </table>

          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
            <tr><td style="background:${CONFIG.COLOR_ACCENT}; border-radius:8px;">
              <a href="${propstackUrl}" style="display:inline-block; padding:12px 22px; color:${CONFIG.COLOR_PRIMARY}; font-size:14px; font-weight:bold; text-decoration:none;">In Propstack öffnen →</a>
            </td></tr>
          </table>

          <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.12em; color:#6b7280; margin:0 0 10px; font-weight:bold;">Alle Antworten</h3>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e8e4dc; border-radius:8px; overflow:hidden;">
            ${rows}
          </table>
        </td></tr>

        <tr><td style="background:#f4f2ed; padding:16px 32px; border-top:1px solid #d4d0c9; font-size:12px; color:#6b7280; text-align:center;">
          Automatische Benachrichtigung · ${CONFIG.FIRMA}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  MailApp.sendEmail({
    to: CONFIG.MITARBEITER_EMAIL,
    subject: subject,
    htmlBody: html,
    name: CONFIG.FIRMA + ' (Formulare)'
  });
}

function _escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


/* ─────────────────────────────────────────────────────────────────────
 *  TEST-FUNKTIONEN (manuell aus dem Editor ausführbar)
 * ───────────────────────────────────────────────────────────────────── */
function _testBewertung() {
  const sample = {
    nettoEinkommen: 3200,
    beschaeftigung: 'Angestellt (unbefristet)',
    schufa: 'Ja',
    mietschulden: 'Nein',
    insolvenz: 'Nein'
  };
  Logger.log('Kategorie: ' + bewertungABC(sample));   // erwartet: A
}

function _testFormular2Mail() {
  sendeFormular2(CONFIG.MITARBEITER_EMAIL, 'Max', 'Mustermann');
}
