/**
 * Cửa xóa: một hành động Xóa của người dùng, hai kết cục do hệ thống quyết. Tài liệu 06 Phần 5.
 *
 * **Xóa hẳn** là xóa dòng khỏi sheet, không để lại dấu vết. **Xóa mềm** là đặt `recordStatus` thành `deleted` và giữ dòng lại. Chọn đường nào thì hỏi các người gác trong sổ `HARD_DELETE_GUARDS`, mỗi người một lần cho cả danh sách mã; một người gác hỏng thì mọi mã chỉ bị xóa mềm. Lõi không bao giờ biết tầng bên kia là cái gì, nó chỉ nhận lý do giữ lại rồi đưa cho người dùng đọc `[RÀNG BUỘC CỨNG]`.
 *
 * Cửa này là người điều phối, không tự chạm Sheet: biết mã nào còn qua `entityPresentIds`, xóa mềm qua tiến trình ghi `writeGateApply` (xóa mềm là một lượt ghi), xóa hẳn qua `entityDeleteRecords`. Không công cụ nào nhận số dòng, nên thứ tự xóa mềm – xóa hẳn không làm sai dòng; xóa mềm đứng trước chỉ để lần tra mã của xóa hẳn còn dùng được cột mã đã đọc.
 *
 * Cửa này **không xóa lan** sang giao dịch của khách bị xóa. Không có đường nào trên sidebar xóa một khách, nên phép xóa lan hôm nay là code không ai gọi; và một phép xóa lan chạm hai sheet trong một lần khóa thì phải được chốt bằng tay chứ không phải sinh ra như một hệ quả phụ.
 */

/** Nguồn ghi log của cửa xóa. Giống cửa ghi: đây là tầng lõi, không phải tầng sidebar. */
var DELETE_GATE_SOURCE = 'core';

/**
 * Sổ người gác xóa hẳn: `{ tên module: hàm(entity, ids) → { soft: { mã: lý do } } }`. Module cần giữ dòng tự đăng ký ngay trong tệp khai hàm gác, nên tệp có mặt trên GAS là có đăng ký; lõi không biết tên module nào.
 * Khai kiểu "có rồi thì dùng tiếp" vì GAS nạp tệp theo thứ tự không chắc: tệp module chạy trước tệp này thì dòng đăng ký vẫn còn.
 */
var HARD_DELETE_GUARDS = typeof HARD_DELETE_GUARDS !== 'undefined' ? HARD_DELETE_GUARDS : {};

/**
 * Hỏi mọi người gác trong sổ, mỗi người một lần cho cả danh sách mã: trả `{ mã: lý do }` của những mã phải giữ lại (xóa mềm). Mã không người gác nào giữ là được xóa hẳn; sổ trống thì mọi mã được xóa hẳn.
 *
 * Một người gác không phải hàm, ném lỗi hay trả sai hình dạng thì **giữ lại mọi mã** và ghi Log mức lỗi: người gác hỏng không được hiểu là cổng mở. Giữ lại thì sửa được, xóa rồi thì không.
 */
function deleteGateAskHook(entity, ids) {
  if (!ids.length) { return {}; }

  var reasons = {};
  Object.keys(HARD_DELETE_GUARDS).forEach(function (owner) {
    try {
      var guard = HARD_DELETE_GUARDS[owner];
      if (typeof guard !== 'function') { throw new Error('mục đăng ký không phải hàm'); }
      var answer = guard(entity, ids);
      var soft = answer && answer.soft;
      if (!soft || typeof soft !== 'object' || Array.isArray(soft)) { throw new Error('trả sai hình dạng (cần `{ soft: { mã: lý do } }`)'); }
      ids.forEach(function (id) {
        if (Object.prototype.hasOwnProperty.call(soft, id) && !reasons[id]) { reasons[id] = String(soft[id] || 'Module "' + owner + '" đang cần bản ghi này.'); }
      });
    } catch (loi) {
      logEvent({ source: DELETE_GATE_SOURCE, action: 'hardDeleteGuard', outcome: LOG_ERROR, entity: entity, recordId: ids.join(' '), reason: 'Người gác xóa hẳn "' + owner + '" lỗi nên giữ lại mọi bản ghi: ' + loi.message });
      ids.forEach(function (id) { reasons[id] = 'Không hỏi được module "' + owner + '" nên giữ lại bản ghi: ' + loi.message; });
    }
  });
  return reasons;
}

/** Hàm thuần: chia mã (đã cắt khoảng trắng, bỏ rỗng và trùng) thành xóa hẳn, xóa mềm và đã không còn trên sheet. */
function deleteGateSplit(ids, gone, reasons) {
  var vang = {};
  gone.forEach(function (id) { vang[id] = true; });
  var split = { hard: [], soft: [], gone: gone.slice() };
  ids.forEach(function (id) {
    if (vang[id]) { return; }
    (Object.prototype.hasOwnProperty.call(reasons, id) ? split.soft : split.hard).push(id);
  });
  return split;
}

/** Mã đã chuẩn: chuỗi cắt khoảng trắng, bỏ rỗng, bỏ trùng, giữ thứ tự. */
function deleteGateIds(ids) {
  var seen = {};
  return ids.map(function (raw) { return String(raw === null || raw === undefined ? '' : raw).trim(); })
    .filter(function (id) { if (!id || seen[id]) { return false; } seen[id] = true; return true; });
}

/**
 * Xóa một hoặc nhiều bản ghi. Nhận `{ entity, ids }`, trả về `{ ok, entity, hard, soft, gone, reasons, recordIds, ms }`.
 *
 * `hard` là mảng mã đã xóa hẳn — bộ nhớ phải **bỏ** chúng đi. `soft` là `{ fields, rows }` của những dòng chỉ bị xóa mềm, đúng hình dạng đường nạp, để bộ nhớ ghi đè lại chúng qua `Store.upsertRecord`. `reasons` nói vì sao từng mã ấy không xóa hẳn được, để hiện cho người dùng đọc.
 *
 * `gone` là mã đã không còn trên sheet trước khi xóa (thường là cùng lệnh xóa gửi hai lần, hoặc người dùng vừa xóa dòng tay): kết cục mong muốn đã đạt nên không ném lỗi, nhưng trả riêng để bộ nhớ cũng bỏ chúng thay vì giữ bản ghi ma tới lần nạp sau.
 */
function deleteGateRemove(yeuCau) {
  var batDau = Date.now();
  var req = yeuCau || {};
  var entity = req.entity;

  if (!Array.isArray(req.ids)) {
    throw new Error('Cửa xóa cần `ids` là một mảng mã. Nhận được: ' + (req.ids === undefined ? 'không có' : typeof req.ids) + '.');
  }
  if (!DATA_SCHEMA[entity]) {
    throw new Error('Không có thực thể "' + entity + '" trong DATA_SCHEMA. Chỉ có: ' + Object.keys(DATA_SCHEMA).join(', ') + '.');
  }
  var ids = deleteGateIds(req.ids);
  if (!ids.length) {
    return { ok: true, entity: entity, hard: [], soft: { fields: entityReadFields(entity), rows: [] }, gone: [], reasons: {}, recordIds: [], ms: Date.now() - batDau };
  }

  if (typeof writeCommitAssertAvailable !== 'function') {
    throw new Error('Thiếu WriteCommit; không xóa dữ liệu để tránh mất signal reload.');
  }
  writeCommitAssertAvailable();

  return documentLockRun(function () {
    var result = deleteGateRun(entity, ids, batDau);
    if (result.recordIds.length) {
      result.reloadDecision = writeCommitAfterSuccess({
        source: 'delete',
        surface: 'record',
        entity: entity,
        recordIds: result.recordIds
      }).reloadDecision;
    }
    return result;
  });
}

/**
 * Thân cửa xóa, chạy bên trong khóa: biết mã nào còn → hỏi người gác → chia nhóm → xóa mềm → xóa hẳn. Đọc, quyết và ghi nằm trong cùng một lần cầm khóa.
 * Lần tra mã của xóa mềm và xóa hẳn dùng cùng cột mã đã đọc ở bước đầu, nên mã còn ở bước đầu mà vắng ở bước sau là trái hợp đồng tầng 3: ném lỗi chứ không đoán.
 */
function deleteGateRun(entity, ids, batDau) {
  var context = entityReadContext(entity);
  var found = entityPresentIds(context, ids);
  var reasons = deleteGateAskHook(entity, found.present);
  var split = deleteGateSplit(ids, found.gone, reasons);

  var soft = { fields: context.names, rows: [] };
  if (split.soft.length) {
    var fields = { recordStatus: DATA_SCHEMA[entity].recordStatus };
    var applied = writeGateApply(entity, context, fields, split.soft.map(function (id) { return { id: id, values: { recordStatus: 'deleted' }, moi: false }; }));
    if (applied.gone.length) { throw new Error('Mã ' + applied.gone.join(', ') + ' vừa còn trên sheet "' + context.sheetName + '" đã không còn lúc xóa mềm, trong cùng một lần khóa. Không xóa gì thêm; bấm Nạp lại rồi thử lại.'); }
    soft.rows = applied.rows;
  }

  var removed = entityDeleteRecords(context, split.hard);
  if (removed.gone.length) { throw new Error('Mã ' + removed.gone.join(', ') + ' vừa còn trên sheet "' + context.sheetName + '" đã không còn lúc xóa hẳn, trong cùng một lần khóa. Bấm Nạp lại để thấy đúng dữ liệu.'); }

  var ms = Date.now() - batDau;
  logEvent({
    source: DELETE_GATE_SOURCE, action: 'deleteGateRemove', outcome: LOG_OK, entity: entity,
    recordId: ids.join(' '),
    reason: 'Xóa hẳn ' + removed.deleted.length + ', xóa mềm ' + split.soft.length + (split.gone.length ? ', không thấy trên sheet ' + split.gone.length : ''),
    detail: { xoaHan: removed.deleted, xoaMem: split.soft, vang: split.gone, ms: ms }
  });

  return {
    ok: true,
    entity: entity,
    hard: removed.deleted,
    soft: soft,
    gone: split.gone,
    recordIds: removed.deleted.concat(split.soft),
    reasons: reasons,
    ms: ms
  };
}
