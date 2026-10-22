/**
 * Bộ kiểu trường cài đặt cố định: mỗi kiểu biết giá trị rỗng của mình và cách kiểm một giá trị. Tài liệu 01 Phần 2.8.
 *
 * Chỉ có những kiểu đang được một phần cài đặt dùng thật (tài liệu 01 nguyên tắc 5). Thêm cài đặt bot hay Extension mà dùng được kiểu sẵn có thì chỉ thêm bảng khai; cần kiểu mới thì thêm vào đây, không viết bộ kiểm riêng ở module.
 *
 * Mọi hàm `check` thuần: nhận giá trị, khai của trường và ngữ cảnh đã đọc sẵn (`context.category`), trả `{ value }` (đã chuẩn hóa) hoặc `{ reason }`. Không tự đọc Sheet hay kho.
 */

/** Mã cột đúng dạng, cùng luật với `SCHEMA_CHECK_CODE_PATTERN` phía client (tài liệu 02 Phần 2.3). */
var SETTINGS_COLUMN_CODE_PATTERN = /^@[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

function settingsKindIsObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Chữ của một ô cài đặt: `null`/`undefined` thành rỗng, cắt khoảng trắng hai đầu. */
function settingsKindText(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

/**
 * Kiểm bảng ngầm định gõ tay của một kênh nhập: `{ customer: { tênTrường: giá trị } }`. Trả `{ values, problems }`: `values` chỉ giữ mục đạt, `problems` mỗi mục hỏng một dòng `{ entity, field, reason }`.
 *
 * Giá trị kiểm bằng đúng bộ kiểm của cửa ghi (`writeGateCheckValue`), nên ngầm định đạt ở đây thì lưu xuống cũng đạt. Ba loại trường bị chặn bằng luật chứ không bằng phép kiểm giá trị: trường chỉ đọc (máy điền), trường đã có ngầm định tính toán trong `DATA_SCHEMA` (luật một nguồn ngầm định, tài liệu 03 Phần 2) và trường ngày (ngày cố định gõ tay hết đúng sau một ngày; ngày nên tính bằng hàm như `today`).
 *
 * `field.entities` (nếu có) giới hạn trường được phép theo kênh, ví dụ kênh kéo từ FBM chỉ điền những trường FBM không có.
 */
function settingsDefaultsCheck(input, field, category) {
  var values = {}, problems = [];
  var source = settingsKindIsObject(input) ? input : {};
  if (!settingsKindIsObject(input) && input !== undefined && input !== null) {
    problems.push({ entity: '', field: '', reason: 'Bảng ngầm định phải là một bảng theo thực thể.' });
  }
  Object.keys(source).forEach(function (entity) {
    var schema = DATA_SCHEMA[entity];
    if (!schema || !settingsKindIsObject(source[entity])) {
      problems.push({ entity: entity, field: '', reason: 'Không có thực thể "' + entity + '" để đặt ngầm định.' });
      return;
    }
    var allowed = field.entities ? field.entities[entity] || [] : null;
    Object.keys(source[entity]).forEach(function (name) {
      var raw = source[entity][name];
      if (settingsKindText(raw) === '') { return; }
      var spec = schema[name];
      var reason = '';
      if (!spec) { reason = 'Không có trường "' + name + '".'; }
      else if (allowed && allowed.indexOf(name) < 0) { reason = 'Kênh này không đặt ngầm định cho trường "' + spec.label + '".'; }
      else if (spec.readonly) { reason = 'Trường "' + spec.label + '" do máy điền, không đặt ngầm định.'; }
      else if (spec.default) { reason = 'Trường "' + spec.label + '" đã có ngầm định tính toán, mỗi trường chỉ một nguồn ngầm định.'; }
      else if (spec.type === 'DATE') { reason = 'Trường ngày "' + spec.label + '" không đặt ngầm định gõ tay.'; }
      if (!reason) {
        var checked = writeGateCheckValue(raw, spec, {}, spec.source ? writeGateSelectAllowed(category, [spec.source]) : null);
        if (checked.reason) { reason = checked.reason; }
        else {
          values[entity] = values[entity] || {};
          values[entity][name] = checked.value;
          return;
        }
      }
      problems.push({ entity: entity, field: name, reason: reason });
    });
  });
  return { values: values, problems: problems };
}

/** Bảng kiểu. `needsCategory` báo người điều phối phải đọc Category trước khi kiểm. */
var SETTINGS_KINDS = {
  select: {
    empty: function (field) { return field.empty; },
    check: function (value, field) {
      var text = settingsKindText(value);
      return field.options.indexOf(text) >= 0 ? { value: text } : { reason: 'chỉ nhận một trong các giá trị: ' + field.options.join(', ') + '.' };
    }
  },
  number: {
    empty: function () { return ''; },
    // Nhận cả khuôn người Việt gõ (`500.000`): bỏ dấu chấm, phẩy, khoảng trắng trước khi đọc, vì `parseInt('500.000')` là 500.
    check: function (value, field) {
      var digits = settingsKindText(value).replace(/[.,\s]/g, '');
      if (digits === '') { return { value: '' }; }
      if (!/^[0-9]+$/.test(digits) || Number(digits) < field.min) { return { reason: 'phải là số nguyên từ ' + field.min + ' trở lên, hoặc để trống.' }; }
      return { value: Number(digits) };
    }
  },
  text: {
    empty: function () { return ''; },
    check: function (value, field) {
      var text = settingsKindText(value);
      return text.length > field.max ? { reason: 'dài tối đa ' + field.max + ' ký tự.' } : { value: text };
    }
  },
  /** Kiểu của cột người dùng tự thêm vào sheet kho, lưu theo mã cột: `{ '@CUS_X': 'NUMBER' }`. Cột đã có trong `DATA_SCHEMA` thì kiểu thuộc code. */
  columnTypes: {
    empty: function () { return {}; },
    check: function (value) {
      if (!settingsKindIsObject(value)) { return { reason: 'phải là bảng mã cột → kiểu.' }; }
      var result = {}, bad = [];
      Object.keys(value).forEach(function (code) {
        var type = settingsKindText(value[code]).toUpperCase();
        if (!SETTINGS_COLUMN_CODE_PATTERN.test(code) || dataSchemaHasCode(code) || DATA_TYPES.indexOf(type) < 0) { bad.push(code + ' = ' + value[code]); return; }
        result[code] = type;
      });
      return bad.length ? { reason: 'mã cột sai dạng, trùng cột của code hoặc kiểu không thuộc ' + DATA_TYPES.join(', ') + ': ' + bad.join('; ') + '.' } : { value: result };
    }
  },
  /** Sắp xếp chung của sheet quản trị: mảng theo thứ tự ưu tiên `[{ col, level: 'asc'|'desc' }]`, thứ tự phần tử mang nghĩa. */
  sortLevels: {
    empty: function () { return []; },
    check: function (value) {
      if (!Array.isArray(value)) { return { reason: 'phải là danh sách cấp sắp xếp.' }; }
      if (value.length > VIEW_SORT_MAX_LEVELS) { return { reason: 'tối đa ' + VIEW_SORT_MAX_LEVELS + ' cấp.' }; }
      var result = [], bad = [];
      value.forEach(function (item) {
        var col = settingsKindText(item && item.col), level = sortSpecLevel(item && item.level);
        if (!/^@(?:CUS|ACT)_/.test(col) || !level) { bad.push(col + ' ' + settingsKindText(item && item.level)); return; }
        result.push({ col: col, level: level });
      });
      return bad.length ? { reason: 'cấp cần mã cột @CUS_/@ACT_ và chiều tăng hoặc giảm: ' + bad.join('; ') + '.' } : { value: result };
    }
  },
  fieldDefaults: {
    needsCategory: true,
    empty: function () { return {}; },
    check: function (value, field, context) {
      var result = settingsDefaultsCheck(value, field, context.category);
      if (!result.problems.length) { return { value: result.values }; }
      return { reason: result.problems.map(function (p) { return (p.entity ? p.entity + '.' + p.field + ': ' : '') + p.reason; }).join(' ') };
    }
  }
};
