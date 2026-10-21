/** Hàm dò DEV: cặp mã Sheet mà `server/sheet/Book.js` đã ghi cho script này, để nghiệm thu việc chuyển Sheet. */
function probeBookBinding() {
  var props = PropertiesService.getScriptProperties();
  return { scriptId: ScriptApp.getScriptId(), raw: props.getProperty(BOOK_BINDING_KEY), boundSpreadsheetId: shinBookBindingRead(props) };
}
