/** Chuan hoa va tinh fingerprint cho doi soat FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chuẩn hóa chuỗi, dòng mới và ngày .NET về cùng một dạng so sánh. */
FbmSync.isDate = function (value) { return Object.prototype.toString.call(value) === '[object Date]'; };
FbmSync.normalize = function (value) {
  if (value === null || value === undefined) { return ''; }
  if (FbmSync.isDate(value)) { return isNaN(value.getTime()) ? '' : value.toISOString(); }
  var text = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  var dateMatch = text.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/);
  if (dateMatch) {
    var ms = Number(dateMatch[1]), date = new Date(ms);
    if (!isFinite(ms) || isNaN(date.getTime()) || FbmSync.isEmptyFbmDate(date)) { return ''; }
    return date.toISOString();
  }
  return text;
};

/** FBM dùng hai mốc giả cho ô ngày chưa có giá trị. */
FbmSync.isEmptyFbmDate = function (value) {
  if (!FbmSync.isDate(value) || isNaN(value.getTime())) { return false; }
  // Mốc 1999 tính theo ngày Việt Nam, không theo nửa đêm UTC.
  var localDate = new Date(value.getTime() + 7 * 60 * 60 * 1000), year = localDate.getUTCFullYear(), month = localDate.getUTCMonth(), day = localDate.getUTCDate();
  return year <= 1900 || (year === 1999 && month === 0 && day === 1);
};

/** Chuẩn hóa ngày làm việc theo ngày Việt Nam, không để giờ FBM gây lệch hash. */
FbmSync.normalizeFingerprintValue = function (entity, field, value) {
  if (entity === 'activity' && field === 'end_date') {
    var date = FbmSync.isDate(value) ? value : (typeof FbmSync.fbDate === 'function' ? FbmSync.fbDate(value) : value);
    if (FbmSync.isDate(date) && !FbmSync.isEmptyFbmDate(date)) {
      return typeof Utilities !== 'undefined' && Utilities.formatDate ? Utilities.formatDate(date, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }
  }
  return FbmSync.normalize(value);
};

/** Bỏ lịch sử Activity trước mốc cấu hình mà không coi đó là bản ghi bị mất. */
FbmSync.activitySinceAllows = function (record, state) {
  var since = '';
  try { since = String(FbmSync.scriptSettings().activitySince || '').trim(); } catch (ignore) {}
  if (!since) { return true; }
  var date = record && FbmSync.isDate(record.workDate) ? record.workDate : (typeof FbmSync.fbDate === 'function' ? FbmSync.fbDate(record && record.workDate) : record && record.workDate);
  var floor = new Date(since);
  if (!FbmSync.isDate(date) || isNaN(date.getTime()) || isNaN(floor.getTime())) { return true; }
  return date.getTime() >= floor.getTime();
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

/** Chọn đúng field FBM để fingerprint, bỏ qua các alias chỉ dùng hiển thị. */
FbmSync.canonical = function (entity, record, categoryGate) {
  // So sánh bằng tên field FBM để đổi tên cột Sheet không đổi baseline.
  var aliases = FbmSync.FIELD_ALIASES[entity] || {};
  var result = {};
  (FbmSync.FINGERPRINT_FIELDS[entity] || []).forEach(function (alias) {
    var key = alias;
    var syncKey = (entity === 'customer' && alias === 'stt_rec_kh') ? 'fbmId' : (entity === 'customer' && alias === 'ma_kh') ? 'fbmCustomerCode' : (entity === 'activity' && alias === 'id') ? 'fbmId' : '';
    if (syncKey) { key = syncKey; }
    else {
      Object.keys(aliases).some(function (localName) {
        if (aliases[localName] === alias) { key = localName; return true; }
        return false;
      });
    }
    var raw = FbmSync.value(record, key, FbmSync.value(record, alias, ''));
    if (entity === 'activity' && alias === 'details') { raw = FbmSync.stripActivityMarker(raw); }
    if ((raw === '' || raw === null || raw === undefined) && entity === 'customer' && alias === 'dc_lh_tinh') { raw = FbmSync.value(record, 'ten_dclh_tinh', ''); }
    if ((raw === '' || raw === null || raw === undefined) && entity === 'customer' && alias === 'nguon_dm') { raw = FbmSync.value(record, 'ten_nguon_dm', ''); }
    if ((raw === '' || raw === null || raw === undefined) && entity === 'activity' && alias === 'ma_cv') { raw = FbmSync.value(record, 'ten_cv', ''); }
    // FBM dùng id=0 cho Activity chưa lưu; đây không phải định danh ổn định.
    if (entity === 'activity' && alias === 'id' && (raw === 0 || String(raw).trim() === '0')) { raw = ''; }
    // Fingerprint SELECT values in FBM-code space, never display-name space.
    var toFbmCode = typeof FbmSync.categoryCode === 'function' ? FbmSync.categoryCode : function (gate, source, value) { return value; };
    if (entity === 'customer' && alias === 'dc_lh_tinh') { raw = toFbmCode(categoryGate || {}, '@CAT_TINH_THANH', raw); }
    if (entity === 'customer' && alias === 'nguon_dm') { raw = toFbmCode(categoryGate || {}, '@CAT_NGUON_KH', raw); }
    if (entity === 'customer' && alias === 'ma_sp') { raw = toFbmCode(categoryGate || {}, '@CAT_SAN_PHAM', raw); }
    if (entity === 'activity' && alias === 'ma_cv') { raw = toFbmCode(categoryGate || {}, '@CAT_CONG_VIEC', raw); }
    if (entity === 'activity' && alias === 'ma_sp') { raw = toFbmCode(categoryGate || {}, '@CAT_SAN_PHAM', raw); }
    result[alias] = FbmSync.normalizeFingerprintValue(entity, alias, raw);
  });
  return result;
};

/** Tạo fingerprint ổn định, độc lập với thứ tự thuộc tính. */
FbmSync.hash = function (record, entity, categoryGate) {
  var value = entity ? FbmSync.canonical(entity, record || {}, categoryGate) : record || {};
  var keys = Object.keys(value).sort();
  var text = keys.map(function (key) { return key + '=' + FbmSync.normalize(value[key]); }).join('\u001f');
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
  return ('00000000' + hash.toString(16)).slice(-8);
};

/** Đối chiếu baseline, Sheet và FBM để phát hiện thay đổi hoặc conflict. */
FbmSync.threeWay = function (base, shin, fbm, entity, categoryGate) {
  // Baseline rỗng vẫn có nghĩa; hai giá trị đầu tiên khác nhau là conflict.
  var hBase = base && Object.prototype.hasOwnProperty.call(base, 'hBASE') ? String(base.hBASE || '') : FbmSync.hash(base || {}, entity);
  var hShin = shin && Object.prototype.hasOwnProperty.call(shin, 'hSHIN') ? String(shin.hSHIN || '') : FbmSync.hash(shin || {}, entity, categoryGate);
  var hFbm = fbm && Object.prototype.hasOwnProperty.call(fbm, 'hFBM') ? String(fbm.hFBM || '') : FbmSync.hash(fbm || {}, entity, categoryGate);
  return { hBASE: hBase, hSHIN: hShin, hFBM: hFbm, unchanged: hShin === hBase && hFbm === hBase, shinChanged: hShin !== hBase, fbmChanged: hFbm !== hBase, conflict: hShin !== hBase && hFbm !== hBase && hShin !== hFbm };
};

/** Trả về các field khác nhau để màn hình conflict không phải đoán từ ba hash. */
FbmSync.diff = function (entity, left, right, categoryGate) {
  var a = FbmSync.canonical(entity, left || {}, categoryGate), b = FbmSync.canonical(entity, right || {}, categoryGate), fields = [];
  Object.keys(a).sort().forEach(function (field) { if (a[field] !== b[field]) { fields.push({ field: field, left: a[field], right: b[field] }); } });
  return fields;
};
