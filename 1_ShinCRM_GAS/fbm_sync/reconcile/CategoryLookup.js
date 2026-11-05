/** Đối chiếu bảng tra danh mục (lookup) FBM của phiên với Category của Sheet; không ghi Sheet. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Giữ payload Rows của completion để đối chiếu Category. */
FbmSync.lookupPayload = function (response) {
  var parsed = FbmSync.protocol.parse(response) || {}, data = parsed.d || parsed;
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || []; }
  if (Array.isArray(data) || (data && Array.isArray(data.Rows))) { return data; }
  return [];
};

/** Chuẩn hóa response completion thành map mã -> tên. */
FbmSync.lookupPairs = function (response) {
  if (response && typeof response === 'object' && response.pairs && typeof response.pairs === 'object' && !Array.isArray(response.pairs)) {
    return response.pairs;
  }
  var data = FbmSync.lookupPayload(response);
  if (data && !Array.isArray(data) && Array.isArray(data.Rows)) { data = data.Rows; }
  var out = {};
  data.forEach(function (item) {
    if (Array.isArray(item)) { out[String(item[0] || '').trim()] = String(item[1] || '').trim(); }
    else if (item) { out[String(item.Value || item.value || item.Code || item.code || '').trim()] = String(item.Text || item.text || item.Name || item.name || '').trim(); }
  });
  return out;
};

/** Ba danh mục FBM đi chung một lô: một lần gọi GAS thay cho ba (Tài liệu 09/01 "Lô request đọc độc lập"). */
FbmSync.lookupBatchRequest = function () {
  return { items: FbmSync.SYNC_LOOKUPS.map(function (lookup) { return FbmSync.completionRequest(lookup.controller, lookup.key); }), meta: { kind: 'batch', entity: 'category' } };
};

/**
 * Nhận lô danh mục vào `state.session.lookups`; chỉ giữ mã Category đang dùng vì Rows đầy đủ có thể vượt trần một khóa state.
 * Phần tử thiếu, lạ hoặc lỗi để danh mục đó trống nên `validateLookupGate` chặn cả chiều đẩy. Trả `false` khi có phần tử nghi phiên: caller đi đường probe, cursor giữ nguyên để dựng lại đúng lô.
 */
FbmSync.lookupBatchApply = function (state, rawResponse) {
  var byId = {}, expectedBySource = FbmSync.readCategoryGate().namesBySource || {}, suspected = false;
  (rawResponse && Array.isArray(rawResponse.items) ? rawResponse.items : []).forEach(function (item) { byId[String(item && item.id)] = item; });
  state.session.lookups = {};
  FbmSync.SYNC_LOOKUPS.forEach(function (lookup, position) {
    var item = byId[String(position)], check = item ? FbmSync.protocol.assertSuccess(item) : { ok: false, code: 'FBM_BATCH_ITEM_MISSING' };
    if (!check.ok) { suspected = suspected || check.code === 'SESSION_SUSPECTED'; state.session.lookups[lookup.key] = { error: String(check.code || 'FBM_ERROR') }; return; }
    var pairs = FbmSync.lookupPairs(item), expected = expectedBySource[lookup.key] || {}, compact = {};
    Object.keys(expected).forEach(function (code) { if (Object.prototype.hasOwnProperty.call(pairs, code)) { compact[code] = pairs[code]; } });
    if (!Object.keys(expected).length && Object.keys(pairs).length) { compact.__FBM_LOOKUP_PRESENT__ = ''; }
    state.session.lookups[lookup.key] = { pairs: compact };
  });
  state.metadata = state.metadata || {};
  state.metadata.categoryCheck = { at: Date.now(), pushed: 0 };
  return !suspected;
};

/**
 * Lượt có cần nạp danh mục FBM (`SYNC_LOOKUPS`) không. Chiều Lấy từ FBM → ShinCRM không nạp (2A điểm 12, chủ dự án chốt 2026-10-07): bản ghi kéo về vẫn kiểm theo từng bản ghi bằng Sheet Category; chỉ bỏ phép kiểm "FBM đã đổi tên danh mục", phép này còn ở chiều đẩy và "Kiểm tra an toàn".
 * Mỗi danh mục là một lần gọi GAS (khoảng 5 giây, đo 2026-10-07), nên bỏ nạp tiết kiệm khoảng 15 giây đầu mỗi lượt Lấy.
 */
FbmSync.needsFbmLookups = function (state) { return String(state && state.mode || 'read') !== 'read'; };

/** Tìm các mã Sheet không còn tồn tại hoặc đã đổi tên trên FBM. */
FbmSync.validateLookupGate = function (state, categoryGate) {
  var blocked = [], session = state && state.session && state.session.lookups || {};
  (FbmSync.SYNC_LOOKUPS || []).forEach(function (lookup) {
    var fbm = session[lookup.key], pairs = FbmSync.lookupPairs(fbm);
    if (!Object.keys(pairs).length) { blocked.push({ source: lookup.key, reason: 'Không lấy được danh mục FBM' + (fbm && fbm.error ? ' (' + fbm.error + ')' : '') + '.' }); return; }
    if (!categoryGate || !categoryGate.namesBySource) { return; }
    var expected = categoryGate.namesBySource[lookup.key] || {};
    Object.keys(expected).forEach(function (code) {
      if (Object.prototype.hasOwnProperty.call(pairs, code) && pairs[code] !== expected[code]) {
        blocked.push({ source: lookup.key, code: code, reason: 'Tên danh mục trên FBM khác Category: ' + pairs[code] });
      } else if (!Object.prototype.hasOwnProperty.call(pairs, code)) {
        blocked.push({ source: lookup.key, code: code, reason: 'Mã danh mục không tồn tại trên FBM.' });
      }
    });
  });
  return blocked;
};
