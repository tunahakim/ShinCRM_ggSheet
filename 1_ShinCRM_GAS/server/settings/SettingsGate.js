/**
 * Cổng cài đặt dùng chung: bốn công cụ đọc, kiểm, ghi và tra phần cài đặt trong DocumentProperties. Tài liệu 01 Phần 2.8.
 *
 * Cổng không biết có những phần cài đặt nào; mỗi module tự khai phần của mình (thuần dữ liệu) và `settingsSectionList` gom lại. Mỗi phần một khóa kho `SETTINGS:<tên phần>`, giá trị là một object JSON theo tên trường.
 *
 * Chỉ `settingsWrite` ghi khóa `SETTINGS:`, và chỉ người điều phối `settingsSave` gọi nó sau khi `settingsValidate` đạt; nhờ vậy đọc không cần kiểm lại. Giá trị lệch vì Category đổi sau khi lưu là chuyện của bên dùng (ví dụ `settingsDefaultsChecked`), không phải của cổng.
 */

var SETTINGS_KEY_PREFIX = 'SETTINGS:';

/** Công cụ tra: khai của một phần theo tên. Tên lạ là lỗi lập trình, ném ngay. */
function settingsSection(name) {
  var found = null;
  settingsSectionList().some(function (section) {
    if (section.name !== name) { return false; }
    found = section;
    return true;
  });
  if (!found) { throw new Error('Không có phần cài đặt "' + name + '". Các phần đang khai: ' + settingsSectionList().map(function (s) { return s.name; }).join(', ') + '.'); }
  return found;
}

function settingsKey(section) {
  return SETTINGS_KEY_PREFIX + section.name;
}

/** Phần này có trường nào cần Category để kiểm không; người điều phối dựa vào đây để chỉ đọc Category khi cần. */
function settingsNeedsCategory(section) {
  return Object.keys(section.fields).some(function (name) { return SETTINGS_KINDS[section.fields[name].kind].needsCategory === true; });
}

/**
 * Công cụ đọc: giá trị đang lưu của một phần, trường chưa lưu lấy giá trị rỗng của kiểu. JSON hỏng thì `documentPropertyJson` ném `DOCUMENT_PROPERTY_CORRUPT`: rơi về rỗng rồi ai đó lưu là xóa âm thầm cài đặt của người dùng.
 */
function settingsRead(section) {
  var stored = documentPropertyJson(documentProps(), settingsKey(section), 'cài đặt ' + section.label, 'object') || {};
  var result = {};
  Object.keys(section.fields).forEach(function (name) {
    var field = section.fields[name];
    result[name] = Object.prototype.hasOwnProperty.call(stored, name) ? stored[name] : SETTINGS_KINDS[field.kind].empty(field);
  });
  return result;
}

/**
 * Công cụ kiểm (thuần): đối chiếu cả phần với bảng khai. `context.category` là Category đã đọc, bắt buộc khi phần có kiểu cần Category. Trả `{ ok, values, problems }`; `values` đã chuẩn hóa, `problems` mỗi trường hỏng một dòng `{ field, label, reason }`.
 */
function settingsValidate(section, values, context) {
  var input = values || {}, result = {}, problems = [];
  if (settingsNeedsCategory(section) && !(context && context.category)) {
    throw new Error('Phần cài đặt "' + section.name + '" cần Category đã đọc để kiểm; người điều phối phải truyền vào.');
  }
  Object.keys(input).forEach(function (name) {
    if (!section.fields[name]) { problems.push({ field: name, label: name, reason: 'Không có trường "' + name + '" trong phần ' + section.label + '.' }); }
  });
  Object.keys(section.fields).forEach(function (name) {
    var field = section.fields[name], kind = SETTINGS_KINDS[field.kind];
    var value = Object.prototype.hasOwnProperty.call(input, name) ? input[name] : kind.empty(field);
    var checked = kind.check(value, field, context || {});
    if (checked.reason) { problems.push({ field: name, label: field.label, reason: field.label + ': ' + checked.reason }); return; }
    result[name] = checked.value;
  });
  return { ok: !problems.length, values: result, problems: problems };
}

/** Công cụ ghi: thay cả phần bằng giá trị đã kiểm. Trong khóa tài liệu thì kho gửi lúc nhả khóa. */
function settingsWrite(section, values) {
  documentProps().setProperty(settingsKey(section), JSON.stringify(values));
}

/** Công cụ đọc một trường của một phần, cho bên chỉ cần một giá trị. */
function settingsValue(sectionName, fieldName) {
  return settingsRead(settingsSection(sectionName))[fieldName];
}
