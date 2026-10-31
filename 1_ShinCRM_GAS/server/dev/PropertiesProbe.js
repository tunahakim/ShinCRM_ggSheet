/**
 * Đo hành vi thật của DocumentProperties mà kho giả ở `tests/lib/gas/kho-thuoc-tinh.js` phải theo: chuỗi rỗng đã lưu đọc lại ra gì, khóa chưa có ra gì, số lưu thành gì. Chỉ dùng khóa tạm của chính hàm dò và xóa trước khi trả.
 */

var PROPERTIES_PROBE_PREFIX = 'DEV_PROPERTIES_PROBE_';

function probePropertiesBehavior() {
  var props = PropertiesService.getDocumentProperties();
  var keys = { empty: PROPERTIES_PROBE_PREFIX + 'EMPTY', number: PROPERTIES_PROBE_PREFIX + 'NUMBER', missing: PROPERTIES_PROBE_PREFIX + 'MISSING' };
  var describe = function (value) { return { type: value === null ? 'null' : typeof value, json: JSON.stringify(value) }; };
  try {
    props.setProperty(keys.empty, '');
    props.setProperty(keys.number, 5);
    var all = props.getProperties();
    return {
      emptyGet: describe(props.getProperty(keys.empty)),
      emptyInGetProperties: Object.prototype.hasOwnProperty.call(all, keys.empty),
      emptyFromGetProperties: describe(all[keys.empty]),
      numberGet: describe(props.getProperty(keys.number)),
      missingGet: describe(props.getProperty(keys.missing)),
      missingInGetProperties: Object.prototype.hasOwnProperty.call(all, keys.missing)
    };
  } finally {
    props.deleteProperty(keys.empty);
    props.deleteProperty(keys.number);
  }
}
