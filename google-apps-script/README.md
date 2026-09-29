# PRINTIRK — Google Sheets error logger

This Apps Script writes calculation feedback from the GitHub Pages CRM prototype into:
- Spreadsheet: ПРАЙС ОТП 2025
- Sheet: Журнал ошибок

## One-time deployment
1. Open the Google Sheet.
2. Extensions → Apps Script.
3. Replace Code.gs with the contents of Code.gs in this folder.
4. Save.
5. Deploy → New deployment → Web app.
6. Execute as: Me.
7. Who has access: Anyone.
8. Deploy and authorize.
9. Copy the Web app URL ending in /exec.

Send that URL back in the CRM project chat; it will be inserted into data/error_log_config.json.

The CRM keeps a local browser backup even when the shared endpoint is enabled.
