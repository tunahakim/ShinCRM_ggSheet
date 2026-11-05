/** Chuan hoa va tinh fingerprint cho doi soat FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chuẩn hóa chuỗi và dòng mới về cùng một dạng so sánh; giá trị ngày (Date hoặc `/Date(ms)/` của .NET) đi qua `dateNormalize`, không có cách tính ngày thứ hai. */
FbmSync.isDate = function (value) { return Object.prototype.toString.call(value) === '[object Date]'; };
FbmSync.normalize = function (value) {
  if (value === null || value === undefined) { return ''; }
  if (FbmSync.isDate(FbmSync.fbDate(value))) { return FbmSync.dateNormalize(value); }
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
};

/** FBM dùng hai mốc giả cho ô ngày chưa có giá trị. */
FbmSync.isEmptyFbmDate = function (value) {
  if (!FbmSync.isDate(value) || isNaN(value.getTime())) { return false; }
  var key = dateToText(value, 'day');
  return Number(key.slice(0, 4)) <= 1900 || key === '1999-01-01';
};

/**
 * Khóa ngày `yyyy-MM-dd` theo giờ Việt Nam cho mọi giá trị ngày của đồng bộ: Date của Sheet, `/Date(ms)/` của FBM, chữ năm-tháng-ngày. Ngày giả của FBM, Date hỏng và chữ không phải ngày thành rỗng.
 * Đổi Date thành chữ đi qua `dateToText` của lõi, nên ngày của dấu vân, của cửa sổ quét và của lệnh ghi cùng một múi giờ với ngày trên Sheet.
 */
FbmSync.dateNormalize = function (value) {
  var date = FbmSync.fbDate(value);
  if (FbmSync.isDate(date)) { return isNaN(date.getTime()) || FbmSync.isEmptyFbmDate(date) ? '' : dateToText(date, 'day'); }
  var match = String(date === null || date === undefined ? '' : date).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return match ? match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2) : '';
};

/** Bỏ dấu nhận diện do ShinCRM gắn vào Activity trước khi so fingerprint. */
FbmSync.stripActivityMarker = function (value) {
  return String(value === null || value === undefined ? '' : value).replace(FbmSync.ACTIVITY_MARKER_RE, '').trim();
};

/** Lấy mã Activity nội bộ từ dấu nhận diện để khôi phục phản hồi bị mất. */
FbmSync.activityMarkerId = function (value) {
  var match = String(value === null || value === undefined ? '' : value).match(FbmSync.ACTIVITY_MARKER_RE);
  return match ? String(match[1]).trim() : '';
};

/** Danh sách trường FBM tính dấu vân của một loại bản ghi; loại lạ là lỗi của bên gọi, không phải "không có trường nào". */
FbmSync.fingerprintFields = function (entity) {
  var fields = FbmSync.FINGERPRINT_FIELDS[entity];
  if (!fields) { throw new Error('Loại bản ghi đồng bộ không hợp lệ: ' + String(entity)); }
  return fields;
};

/**
 * Bản ghi (tên trường ShinCRM hoặc tên FBM) thành các trường dấu vân theo tên FBM, giá trị danh mục đổi sang mã FBM, ngày thành khóa ngày. So bằng tên FBM để đổi tên cột Sheet không đổi mốc.
 * Thiếu cổng danh mục là lỗi: băm tên hiển thị thay cho mã sẽ ra dấu vân khác mà không ai thấy.
 */
FbmSync.toFbmCodes = function (record, entity, categoryGate) {
  if (!categoryGate || typeof categoryGate !== 'object' || !categoryGate.map) { throw new Error('Thiếu cổng danh mục khi tính dấu vân ' + String(entity) + '.'); }
  var aliases = FbmSync.FIELD_ALIASES[entity] || {}, source = record || {}, result = {};
  FbmSync.fingerprintFields(entity).forEach(function (alias) {
    var key = alias;
    var syncKey = (entity === 'customer' && alias === 'stt_rec_kh') ? 'fbmId' : (entity === 'customer' && alias === 'ma_kh') ? 'fbmCustomerCode' : (entity === 'activity' && alias === 'id') ? 'fbmId' : '';
    if (syncKey) { key = syncKey; }
    else {
      Object.keys(aliases).some(function (localName) {
        if (aliases[localName] === alias) { key = localName; return true; }
        return false;
      });
    }
    var raw = FbmSync.value(source, key, FbmSync.value(source, alias, ''));
    if (entity === 'activity' && alias === 'details') { raw = FbmSync.stripActivityMarker(raw); }
    if ((raw === '' || raw === null || raw === undefined) && entity === 'customer' && alias === 'dc_lh_tinh') { raw = FbmSync.value(source, 'ten_dclh_tinh', ''); }
    if ((raw === '' || raw === null || raw === undefined) && entity === 'customer' && alias === 'nguon_dm') { raw = FbmSync.value(source, 'ten_nguon_dm', ''); }
    if ((raw === '' || raw === null || raw === undefined) && entity === 'activity' && alias === 'ma_cv') { raw = FbmSync.value(source, 'ten_cv', ''); }
    // FBM dùng id=0 cho Activity chưa lưu; đây không phải định danh ổn định.
    if (entity === 'activity' && alias === 'id' && (raw === 0 || String(raw).trim() === '0')) { raw = ''; }
    if (entity === 'customer' && alias === 'dc_lh_tinh') { raw = FbmSync.categoryCode(categoryGate, '@CAT_TINH_THANH', raw); }
    if (entity === 'customer' && alias === 'nguon_dm') { raw = FbmSync.categoryCode(categoryGate, '@CAT_NGUON_KH', raw); }
    if (entity === 'activity' && alias === 'ma_cv') { raw = FbmSync.categoryCode(categoryGate, '@CAT_CONG_VIEC', raw); }
    // Ngày làm việc so theo ngày Việt Nam để giờ FBM không làm lệch dấu vân; chữ không phải ngày giữ nguyên để sửa sai vẫn thấy đổi.
    result[alias] = entity === 'activity' && alias === 'end_date' ? (FbmSync.dateNormalize(raw) || FbmSync.normalize(raw)) : FbmSync.normalize(raw);
  });
  return result;
};

/**
 * Dấu vân của một bản ghi: công cụ duy nhất tính hBASE, hSHIN, hFBM. Người điều phối tính một lần cho mỗi bản ghi rồi truyền dấu vân bằng dữ liệu, không tính lại ở công cụ khác.
 * Đổi công thức là đổi mọi mốc đã lưu trên Sheet và trong kho (sổ chờ xác nhận, sổ lỗi đẩy): test giữ giá trị cố định cho các bản ghi mẫu.
 */
FbmSync.hash = function (record, entity, categoryGate) {
  var value = FbmSync.toFbmCodes(record, entity, categoryGate);
  var keys = Object.keys(value).sort();
  var text = keys.map(function (key) { return key + '=' + FbmSync.normalize(value[key]); }).join('\u001f');
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
  return ('00000000' + hash.toString(16)).slice(-8);
};

/** So ba dấu vân đã tính: mốc (rỗng vẫn có nghĩa, hai bên khác nhau là xung đột), ShinCRM, FBM. Chỉ nhận chữ, không tự tính dấu vân. */
FbmSync.threeWay = function (hBase, hShin, hFbm) {
  [hBase, hShin, hFbm].forEach(function (value) { if (typeof value !== 'string') { throw new Error('threeWay chỉ nhận dấu vân dạng chữ, nhận ' + Object.prototype.toString.call(value) + '.'); } });
  return { hBASE: hBase, hSHIN: hShin, hFBM: hFbm, unchanged: hShin === hBase && hFbm === hBase, shinChanged: hShin !== hBase, fbmChanged: hFbm !== hBase, conflict: hShin !== hBase && hFbm !== hBase && hShin !== hFbm };
};

/** Trả về các field khác nhau để màn hình conflict không phải đoán từ ba hash; `only` giới hạn trường cần so mà vẫn dùng chung bước chuẩn hóa với hash. */
FbmSync.diff = function (entity, left, right, categoryGate, only) {
  var a = FbmSync.toFbmCodes(left, entity, categoryGate), b = FbmSync.toFbmCodes(right, entity, categoryGate), fields = [];
  Object.keys(a).sort().forEach(function (field) { if ((!only || only.indexOf(field) >= 0) && a[field] !== b[field]) { fields.push({ field: field, left: a[field], right: b[field] }); } });
  return fields;
};

/** Đổi tên field fingerprint về tên field nội bộ trước khi cửa ghi nhận bản trộn conflict. */
FbmSync.conflictLocalField = function (entity, field) {
  var aliases = FbmSync.FIELD_ALIASES[entity] || {};
  var wanted = String(field || '');
  var found = '';
  Object.keys(aliases).some(function (localName) {
    if (aliases[localName] === wanted) { found = localName; return true; }
    return false;
  });
  return found || wanted;
};
