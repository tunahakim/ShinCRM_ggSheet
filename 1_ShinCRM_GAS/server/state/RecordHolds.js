/**
 * Sổ bận: bản ghi Customer/Activity nào đang bị tiến trình nào giữ, vì sao, từ lúc nào. Tài liệu 06 Phần 2.
 *
 * Chỉ Cửa bản ghi (`RecordGate.js`) gọi tệp này, và chỉ trong khóa tài liệu: ngoài khóa thì sổ đọc được có thể đã cũ ngay lúc đọc, nên mọi hàm đọc/ghi ném lỗi khi chưa cầm khóa. Phiên ngắn (một lần cầm khóa) không ghi gì vào sổ — trong lúc nó cầm khóa không ai hỏi được sổ, nên giữ trong bộ nhớ là đủ; chỉ phiên kéo dài qua nhiều lần gọi (đồng bộ đẩy) mới ghi kho.
 * Mục sổ: `"entity:mã": { by, run, reason, at }`. Chủ nào giữ thì chủ đó nhả; nhả hay giữ đè bản ghi của chủ khác là trái hợp đồng và ném lỗi, không bỏ qua.
 * Cạm bẫy: sổ hỏng (không phải JSON object) thì ném lỗi chứ không coi là rỗng — coi là rỗng là thả mọi bản ghi đang đẩy cho người khác ghi đè.
 */
var RECORD_HOLDS_KEY = 'SHIN_RECORD_HOLDS_V1';

function recordHoldsAssertLocked() {
  if (!(DOCUMENT_STORE.docLockDepth > 0)) { throw new Error('Sổ bận chỉ đọc/ghi trong khóa tài liệu (qua Cửa bản ghi).'); }
}

function recordHoldsKey(entity, id) { return String(entity) + ':' + String(id === null || id === undefined ? '' : id).trim(); }

function recordHoldsParse(raw) {
  if (raw === null || raw === undefined || raw === '') { return {}; }
  var holds;
  try { holds = JSON.parse(raw); } catch (error) { throw new Error('Sổ bận ' + RECORD_HOLDS_KEY + ' hỏng (không đọc được JSON): ' + error.message); }
  if (!holds || typeof holds !== 'object' || Array.isArray(holds)) { throw new Error('Sổ bận ' + RECORD_HOLDS_KEY + ' hỏng: không phải một bảng mục giữ.'); }
  return holds;
}

/** Đọc sổ trong khóa tài liệu. */
function recordHoldsRead() {
  recordHoldsAssertLocked();
  return recordHoldsParse(documentProps().getProperty(RECORD_HOLDS_KEY));
}

/**
 * Nhìn sổ khi chưa cầm khóa, chỉ để biết có cần lấy khóa hay không. Chỉ đúng cho chủ mà mỗi lúc chỉ có một lượt chạy (đồng bộ FBM, nhờ khóa điều phối): không ai khác ghi mục của chủ đó, nên "không có mục" đọc ngoài khóa vẫn đúng lúc cầm khóa.
 */
function recordHoldsPeekOwner(by) {
  var holds = recordHoldsParse(documentProps().getProperty(RECORD_HOLDS_KEY));
  return Object.keys(holds).some(function (key) { return holds[key] && holds[key].by === by; });
}

/** Hàm thuần: `{ mã: { by, reason, at } }` của những mã đang bị chủ khác `by` giữ. */
function recordHoldsBusy(holds, by, entity, ids) {
  var busy = {};
  (ids || []).forEach(function (id) {
    var held = holds[recordHoldsKey(entity, id)];
    if (held && held.by !== by) { busy[String(id).trim()] = { by: held.by, reason: held.reason, at: held.at }; }
  });
  return busy;
}

/**
 * Hàm thuần: sổ mới sau khi chủ `by` (lượt `run`) giữ và nhả theo `hold: [{ entity, ids, reason }]`, `release: [{ entity, ids }]`. Nhả mã không ai giữ thì bỏ qua (kết cục mong muốn đã đạt).
 */
function recordHoldsApply(holds, by, run, hold, release, at) {
  var next = JSON.parse(JSON.stringify(holds));
  (release || []).forEach(function (item) {
    (item.ids || []).forEach(function (id) {
      var key = recordHoldsKey(item.entity, id), held = next[key];
      if (!held) { return; }
      if (held.by !== by) { throw new Error('Chủ "' + by + '" nhả bản ghi ' + key + ' do "' + held.by + '" giữ. Chủ nào giữ thì chủ đó nhả.'); }
      delete next[key];
    });
  });
  (hold || []).forEach(function (item) {
    var reason = String(item.reason || '').trim();
    if (!reason) { throw new Error('Giữ bản ghi ' + item.entity + ' cần lý do để người dùng đọc.'); }
    (item.ids || []).forEach(function (id) {
      var key = recordHoldsKey(item.entity, id), held = next[key];
      if (held && held.by !== by) { throw new Error('Chủ "' + by + '" giữ bản ghi ' + key + ' đang do "' + held.by + '" giữ.'); }
      next[key] = { by: by, run: String(run || ''), reason: reason, at: at };
    });
  });
  return next;
}

/** Hàm thuần: sổ mới sau khi bỏ mọi mục của chủ `by`, trừ các khóa trong `keep` (`["entity:mã"]`). */
function recordHoldsWithoutOwner(holds, by, keep) {
  var giu = {};
  (keep || []).forEach(function (key) { giu[key] = true; });
  var next = {};
  Object.keys(holds).forEach(function (key) { if (!(holds[key] && holds[key].by === by) || giu[key]) { next[key] = holds[key]; } });
  return next;
}

/** Ghi sổ trong khóa tài liệu, chỉ khi khác bản đã đọc; sổ rỗng thì xóa khóa kho. */
function recordHoldsWrite(before, after) {
  recordHoldsAssertLocked();
  var text = JSON.stringify(after);
  if (text === JSON.stringify(before)) { return false; }
  if (Object.keys(after).length) { documentProps().setProperty(RECORD_HOLDS_KEY, text); } else { documentProps().deleteProperty(RECORD_HOLDS_KEY); }
  return true;
}
