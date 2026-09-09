/**
 * Cửa xóa: một hành động Xóa của người dùng, hai kết cục do hệ thống quyết. Tài liệu 06 Phần 5.
 *
 * **Xóa hẳn** là xóa dòng khỏi sheet, không để lại dấu vết. **Xóa mềm** là đặt `recordStatus` thành `deleted` và giữ dòng lại. Chọn đường nào thì hỏi đúng một điểm cắm là `beforeHardDelete(entity, id)`; vắng điểm cắm thì luôn xóa hẳn. Lõi không bao giờ biết tầng bên kia là cái gì, nó chỉ nhận `allowed` và `reason` rồi đưa `reason` cho người dùng đọc `[RÀNG BUỘC CỨNG]`.
 *
 * Hai luật của tệp này:
 *
 * **Một — xóa hẳn nhiều dòng thì xóa từ dưới lên.** Xóa dòng 5 làm dòng 9 thành dòng 8; xóa từ dưới lên thì số hàng của những dòng chưa xử lý không xê dịch giữa chừng. Đây là loại lỗi chỉ hiện ra khi xóa từ hai dòng trở lên, nên nó sống rất lâu trong một hệ mà người ta luôn xóa một dòng.
 *
 * **Hai — đọc lại bản ghi mềm sau khi xóa hẳn.** Xóa hẳn làm mọi dòng bên dưới xê dịch, nên dữ liệu trả về phải được đọc lại theo mã sau khi thao tác hoàn tất.
 *
 * Cửa này **không xóa lan** sang giao dịch của khách bị xóa. Không có đường nào trên sidebar xóa một khách, nên phép xóa lan hôm nay là code không ai gọi; và một phép xóa lan chạm hai sheet trong một lần khóa thì phải được chốt bằng tay chứ không phải sinh ra như một hệ quả phụ.
 */

/** Nguồn ghi log của cửa xóa. Giống cửa ghi: đây là tầng lõi, không phải tầng sidebar. */
var DELETE_GATE_SOURCE = 'core';

/**
 * Hỏi điểm cắm xem có được xóa hẳn không. Vắng điểm cắm thì cho.
 *
 * Điểm cắm ném lỗi thì **coi như bị cản**, không coi như được phép. Một module đồng bộ hỏng phải dẫn tới giữ dòng lại, chứ không dẫn tới xóa mất dòng: giữ lại thì sửa được, xóa rồi thì không.
 */
function deleteGateAllowHard(entity, id) {
  if (typeof beforeHardDelete !== 'function') { return { allowed: true, reason: '' }; }

  try {
    var ra = beforeHardDelete(entity, id);
    if (ra && ra.allowed === false) {
      return { allowed: false, reason: String(ra.reason || 'Một tầng khác đang cần bản ghi này.') };
    }
    return { allowed: true, reason: '' };
  } catch (loi) {
    return { allowed: false, reason: 'Không hỏi được tầng đồng bộ nên giữ lại bản ghi: ' + loi.message };
  }
}

/**
 * Xóa một hoặc nhiều bản ghi. Nhận `{ entity, ids }`, trả về `{ ok, entity, hard, soft, reasons, ms }`.
 *
 * `hard` là mảng mã đã xóa hẳn — bộ nhớ phải **bỏ** chúng đi. `soft` là `{ fields, rows }` của những dòng chỉ bị xóa mềm, đúng hình dạng đường nạp, để bộ nhớ ghi đè lại chúng qua `Store.upsertRecord`. `reasons` nói vì sao từng mã ấy không xóa hẳn được, để hiện cho người dùng đọc.
 *
 * Mã không có trên sheet thì **bỏ qua trong im lặng**, khác hẳn cửa ghi. Lý do là kết cục mong muốn đã đạt: người dùng muốn bản ghi đó không còn, và nó đã không còn. Ném lỗi ở đây chỉ tạo ra một hộp thoại đỏ cho một việc đã xong — thường là vì cùng một lệnh xóa được gửi hai lần.
 */
function deleteGateRemove(yeuCau) {
  var batDau = Date.now();
  var req = yeuCau || {};
  var entity = req.entity;
  var ids = req.ids;

  if (!Array.isArray(ids)) {
    throw new Error('Cửa xóa cần `ids` là một mảng mã. Nhận được: ' + (ids === undefined ? 'không có' : typeof ids) + '.');
  }
  if (!DATA_SCHEMA[entity]) {
    throw new Error('Không có thực thể "' + entity + '" trong DATA_SCHEMA. Chỉ có: ' + Object.keys(DATA_SCHEMA).join(', ') + '.');
  }
  if (!ids.length) {
    return { ok: true, entity: entity, hard: [], soft: { fields: entityReadFields(entity), rows: [] }, reasons: {}, ms: Date.now() - batDau };
  }

  var khoa = LockService.getDocumentLock();
  if (!khoa.tryLock(SETTINGS.LOCK_WAIT_MS)) {
    throw new Error('Hệ thống bận. Vui lòng thử lại!');
  }

  try {
    return deleteGateRun(entity, ids, batDau);
  } finally {
    try { SpreadsheetApp.flush(); } finally { khoa.releaseLock(); }
  }
}

/**
 * Thân cửa xóa, chạy bên trong khóa.
 *
 * Thứ tự bắt buộc: hỏi điểm cắm cho **mọi** mã trước, rồi xóa mềm, rồi mới xóa hẳn từ dưới lên, rồi mới đọc lại. Xóa mềm phải đứng trước xóa hẳn vì xóa hẳn làm số hàng xê dịch, và số hàng dùng cho lệnh xóa mềm được tính từ trước lúc đó.
 */
function deleteGateRun(entity, ids, batDau) {
  var context = entityReadContext(entity);
  var rowById = writeGateRowById(context);
  var specStatus = DATA_SCHEMA[entity].recordStatus;
  var cotStatus = columnIndex(context.columnMap, specStatus.code);

  var hard = [];
  var soft = [];
  var reasons = {};
  var vang = [];

  ids.forEach(function (raw) {
    var id = String(raw === null || raw === undefined ? '' : raw).trim();
    if (!id) { return; }

    if (!rowById[id]) { vang.push(id); return; }

    var phep = deleteGateAllowHard(entity, id);
    if (phep.allowed) {
      hard.push({ id: id, row: rowById[id] });
      return;
    }

    reasons[id] = phep.reason;
    soft.push({ id: id, row: rowById[id] });
  });

  soft.forEach(function (o) { context.sheet.getRange(o.row, cotStatus).setValue('deleted'); });

  // Xóa từ dưới lên, và mấy dòng liền nhau thì gộp thành một lệnh.
  writeGateRanges(hard.map(function (o) { return o.row; })).reverse().forEach(function (dai) {
    context.sheet.deleteRows(dai[0], dai.length);
  });

  SpreadsheetApp.flush();

  var doc = { fields: context.names, rows: [] };
  if (soft.length) {
    // Đọc lại **sau** khi xóa hẳn, và đọc theo mã chứ theo số hàng thì sai: dòng xóa mềm có thể đã xê dịch lên vì một dòng bên trên nó vừa bị xóa hẳn.
    var sauKhiXoa = entityReadContext(entity);
    var rowMoi = writeGateRowById(sauKhiXoa);
    writeGateRanges(soft.map(function (o) { return rowMoi[o.id]; }).filter(function (row) { return !!row; })).forEach(function (dai) {
      entityReadRange(sauKhiXoa, dai[0], dai.length).rows.forEach(function (row) { doc.rows.push(row); });
    });
  }

  var maHard = hard.map(function (o) { return o.id; });
  var ms = Date.now() - batDau;

  logEvent({
    source: DELETE_GATE_SOURCE, action: 'deleteGateRemove', outcome: LOG_OK, entity: entity,
    recordId: ids.join(' '),
    reason: 'Xóa hẳn ' + maHard.length + ', xóa mềm ' + soft.length + (vang.length ? ', không thấy trên sheet ' + vang.length : ''),
    detail: { xoaHan: maHard, xoaMem: Object.keys(reasons), vang: vang, ms: ms }
  });

  return {
    ok: true,
    entity: entity,
    hard: maHard,
    soft: doc,
    reasons: reasons,
    ms: ms
  };
}
