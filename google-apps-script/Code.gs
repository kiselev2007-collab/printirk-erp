const SPREADSHEET_ID = '1eH9XpecSVk6CPuVfohbncgvx39JIzUHOdoXVAyGubhg';
const SHEET_NAME = 'Журнал ошибок';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = e.parameter || {};
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);

    const toNumber = (v) => {
      if (v === '' || v == null) return '';
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : v;
    };

    sheet.appendRow([
      new Date(),
      p.version || '',
      p.status || 'Новая',
      p.manager || '',
      p.office || '',
      p.type || '',
      p.source || '',
      p.item || '',
      toNumber(p.price),
      toNumber(p.cost),
      p.expected || '',
      p.comment || '',
      p.details || '',
      p.parsed || '',
      p.origin || 'PRINTIRK CRM'
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ok:true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ok:false,error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ok:true,service:'PRINTIRK error logger'}))
    .setMimeType(ContentService.MimeType.JSON);
}
