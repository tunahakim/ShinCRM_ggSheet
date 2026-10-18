/** Đường ghi Sheet duy nhất của module đồng bộ: mọi thay đổi dòng Customer/Activity của đồng bộ là một hàm quyết đưa cho Cửa bản ghi (tài liệu 06 Phần 1), đọc dữ liệu cục bộ bên trong khóa. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chủ của đồng bộ trong sổ bận. Mỗi lúc chỉ một lượt đồng bộ chạy (khóa điều phối), nên đường thu hồi nhả được mọi mục của chủ này. */
FbmSync.RECORD_HOLDER = 'fbm';
FbmSync.PUSH_HOLD_REASON = 'Đồng bộ đang đẩy bản ghi này lên FBM.';

/** Schema đồng bộ đọc và ghi: dữ liệu cùng cột đồng bộ. Hàm chứ không phải biến vì GAS nạp tệp theo thứ tự không chắc. */
FbmSync.recordSchemas = function () { return [DATA_SCHEMA, SYNC_SCHEMA]; };

/**
 * Chạy một hàm quyết qua Cửa bản ghi với chủ `fbm`. Mục `save` thiếu `schemas` thì nhận schema đồng bộ.
 * Cửa ghi báo thất bại theo hai kiểu: lỗi hệ thống thì ném, trường không đạt hoặc bản ghi đã vắng thì trả `ok:false`. Kiểu thứ hai từng bị bỏ qua nên luồng đi tiếp như đã ghi (FBM-001, FBM-002, FBM-004); ở đây nó thành exception để `runSlice` chuyển phiên sang lỗi trước khi cursor tiến hoặc request ghi FBM được phát.
 */
FbmSync.recordChange = function (decide) {
  var plan = null;
  var result = recordGateRun({ by: FbmSync.RECORD_HOLDER, run: String(FbmSync.stateRead().runId || ''), decide: function (gate) {
    plan = decide(gate) || {};
    (plan.save || []).forEach(function (item) { if (!item.schemas) { item.schemas = FbmSync.recordSchemas(); } });
    return plan;
  } });
  if (result.ok) { return result; }
  var item = (plan.save || [])[result.saves.length - 1] || {};
  throw FbmSync.sheetWriteError(item.entity, item.records, item.source, result.saves[result.saves.length - 1]);
};

/** Lỗi `FBM_SHEET_WRITE_FAILED` từ kết quả không đạt của cửa ghi; từng trường không đạt vào bộ gom Log. `source` (`pull`/`push`) quyết định chiều của dòng Log. */
FbmSync.sheetWriteError = function (entity, records, source, saved) {
  var invalid = saved && Array.isArray(saved.invalid) ? saved.invalid : [];
  invalid.forEach(function (item) {
    FbmSync.recordIssueAdd(source, entity, FbmSync.SYNC_STATUS.error, String(item.id || ''), 'Cửa ghi Sheet chặn trường ' + String(item.label || item.field || ''), typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error');
  });
  var first = invalid[0];
  var gone = saved && Array.isArray(saved.gone) ? saved.gone : [];
  var detail = first ? String(first.label || first.field || '') + ' của ' + String(first.id || 'bản ghi mới') + ': ' + String(first.reason || '')
    : gone.length ? 'Bản ghi không còn trên Sheet (vừa bị xóa dòng): ' + gone.join(', ')
    : String(saved && saved.error || 'cửa ghi trả kết quả không thành công');
  var error = new Error('Không ghi được ' + (records || []).length + ' bản ghi ' + entity + ' vào Sheet (' + invalid.length + ' trường không đạt). ' + detail);
  error.code = 'FBM_SHEET_WRITE_FAILED';
  return error;
};

/** Chữ ký của một dòng cục bộ: dòng đọc lại trong cửa khác chữ ký lúc chọn nghĩa là có người vừa sửa nó. */
FbmSync.recordSignature = function (record) { return JSON.stringify(record || null); };

/**
 * Thay đổi đúng một dòng của chiều đẩy: đọc lại dòng trong cửa rồi mới quyết. Trả `{ status, local, busy, value }`, `status` là `ok`, `gone` (dòng không còn), `changed` (khác `expect`) hoặc `busy` (chủ khác giữ).
 * `options`: `expect` chữ ký lúc chọn ứng viên (bỏ trống khi dòng đã do đồng bộ giữ); `build(local)` trả `{ patch, release, hold, value }`; `release` nhả mặc định; `releaseGone` nhả khi dòng đã vắng; `allowGone` không ném khi dòng vắng.
 */
FbmSync.pushRowChange = function (entity, id, options) {
  var opts = options || {}, release = function (yes) { return yes ? [{ entity: entity, ids: [id] }] : []; };
  return FbmSync.recordChange(function (gate) {
    var local = gate.readById(entity, FbmSync.recordSchemas(), id);
    if (!local) {
      if (!opts.allowGone) { throw FbmSync.sheetWriteError(entity, [{ id: id }], 'push', { gone: [id] }); }
      return { release: release(opts.releaseGone), value: { status: 'gone', local: null } };
    }
    var busy = gate.busy(entity, [id])[id];
    if (busy) { return { value: { status: 'busy', local: local, busy: busy } }; }
    if (opts.expect !== undefined && FbmSync.recordSignature(local) !== opts.expect) { return { value: { status: 'changed', local: local } }; }
    var built = opts.build ? opts.build(local) || {} : {};
    return {
      save: built.patch ? [{ entity: entity, records: [built.patch], source: 'push' }] : [],
      hold: built.hold ? [{ entity: entity, ids: [id], reason: built.hold }] : [],
      release: release(built.release === undefined ? opts.release : built.release),
      value: { status: 'ok', local: local, value: built.value }
    };
  }).value;
};
