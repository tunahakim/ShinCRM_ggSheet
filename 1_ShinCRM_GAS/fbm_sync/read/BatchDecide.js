/**
 * Hàm quyết thuần của lô đọc chi tiết (thiết kế 5.6.4): nhận response lô và đầu vào chặng đã đọc sẵn, trả dữ liệu cho người điều phối ghi. Không đọc kho, không ghi, không sửa đầu vào.
 * Đối chiếu vắng mặt chạy trên bản chụp Sheet đọc trước khi ghi lô: ghi xong thì giao dịch đổi khách đã nằm dưới khách mới, không còn thấy là vắng.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Bản sao hàng chờ đọc dở (mã khách → id giao dịch); hàm quyết sửa bản sao, không sửa bản đầu vào. */
FbmSync.readWaitCopy = function (waits) {
  var copy = {};
  Object.keys(waits || {}).forEach(function (key) { copy[key] = (waits[key] || []).slice(); });
  return copy;
};

/**
 * Ghép response lô thành bản ghi khách, bản ghi giao dịch, lỗi từng khách và trang kế của khách đọc nhiều trang.
 * `input`: `categoryGate`, `isFresh` (giao dịch nào mới hoặc khác dấu vân so với Sheet trước khi ghi).
 */
FbmSync.batchRecordsOf = function (checks, cursor, input) {
  var customers = cursor.customers || [], gate = input.categoryGate, count = Number(cursor.count || FbmSync.BUDGET.activityCustomerRows), customerCheck = checks[0], pages = cursor.pages || {};
  var batch = { customerRecords: [], activityRecords: [], returned: {}, readOk: {}, failed: [], outcomes: [], nextPages: {}, pagedNew: [], customerFields: null, activityFields: null };
  if (!customerCheck.check.ok) {
    // Cả lô dùng chung một yêu cầu đọc khách: hỏng là sự cố của FBM hoặc phiên, không phải của từng khách. Dừng cả lô (không ghi, vị trí vòng xoay không tiến) để lượt sau đọc lại đúng các khách này.
    var check = customerCheck.check, status = Number(check.status || 0);
    throw FbmSync.activityBatchError('FBM trả lỗi khi đọc thông tin ' + customers.length + ' khách của lô' + (status ? ' (HTTP ' + status + ')' : '') + '; chưa ghi gì, lượt sau đọc lại đúng các khách này.', String(check.code || 'FBM_ERROR'), { status: status, fbmMessage: String(check.bug && (check.bug.Message || check.bug.message) || '') });
  }
  try {
    var customerGrid = FbmSync.rowsToRecords('customer', FbmSync.protocol.parse(customerCheck.item));
    if (customerGrid.sourceFields) { batch.customerFields = customerGrid.sourceFields; }
    customerGrid.rows.forEach(function (row) {
      var sttRec = String(row.stt_rec_kh || '').trim();
      if (customers.indexOf(sttRec) >= 0 && !FbmSync.isTemporaryRecord('customer', row)) { batch.returned[sttRec] = row; }
    });
    customers.forEach(function (sttRec, position) {
      var row = batch.returned[sttRec], entry = checks[position + 1];
      if (!row) { return; }
      batch.customerRecords.push(FbmSync.customerRecord(row, gate));
      if (!entry.check.ok) {
        batch.failed.push({ customer: String(row.ma_kh || sttRec), code: String(entry.check.code || 'FBM_ERROR'), status: Number(entry.check.status || 0), reason: String(entry.check.bug && (entry.check.bug.Message || entry.check.bug.message) || 'FBM trả lỗi khi đọc giao dịch của khách') });
        batch.outcomes.push({ sttRec: sttRec, fresh: null });
        return;
      }
      var grid = FbmSync.rowsToRecords('activity', FbmSync.protocol.parse(entry.item));
      if (grid.sourceFields) { batch.activityFields = grid.sourceFields; }
      var records = grid.rows.filter(function (item) { return !FbmSync.isTemporaryRecord('activity', item); }).map(function (item) { return FbmSync.activityRecord(item, gate, { sttRec: sttRec, maKh: row.ma_kh }); });
      var page = pages[sttRec], fresh = !!(page && page.fresh) || input.isFresh(records);
      batch.activityRecords = batch.activityRecords.concat(records);
      if (grid.rows.length >= count) {
        // Khách chạm trần một lần đọc: ghi phần đã đọc, lô sau xin trang kế của riêng khách; chưa vào tập "đã đọc" và chưa xét vắng tới khi hết trang.
        var next = FbmSync.activityPageNext(page, grid.rows, grid.total);
        if (!next) { batch.failed.push({ customer: String(row.ma_kh || sttRec), code: 'FBM_ACTIVITY_PAGE_STUCK', status: 0, reason: 'FBM trả lại đúng trang giao dịch đã đọc khi xin trang kế; đã ghi phần đã đọc, phần còn lại chưa đọc và giao dịch của khách không bị kết luận vắng.' }); batch.outcomes.push({ sttRec: sttRec, fresh: null }); return; }
        next.fresh = fresh;
        batch.nextPages[sttRec] = next;
        records.forEach(function (record) { batch.pagedNew.push(sttRec + ':' + String(record.fbmId || '').trim()); });
        return;
      }
      batch.readOk[sttRec] = { complete: true };
      batch.outcomes.push({ sttRec: sttRec, fresh: fresh, complete: true });
    });
  } catch (shapeError) {
    // Khối này chỉ ghép dòng theo tiêu đề cột: lỗi ở đây là FBM trả lệch cấu trúc (thiếu, trùng, đổi số cột), dừng cả lô chứ không đoán.
    throw FbmSync.activityBatchError(String(shapeError && shapeError.message || shapeError), shapeError && shapeError.code || 'FBM_BATCH_ITEM_MISMATCH');
  }
  return batch;
};

/**
 * Đối chiếu vắng mặt của lô trên bản chụp Sheet: mã cần tra (`c:` khách vắng, `a:` giao dịch vắng), khách cha cũ của giao dịch đổi khách, cờ không cần tra và hàng chờ nối (09/05 Phần 9).
 * `input`: `local` (chỉ mục Sheet), `waits` (hàng chờ đọc dở), `pagedSeen` (giao dịch đã thấy ở trang trước). Chế độ không ghi Sheet thì không xét vắng.
 */
FbmSync.absentFind = function (batch, customers, input, write) {
  var found = { lookups: [], moved: [], flags: { customer: [], activity: [] }, waits: FbmSync.readWaitCopy(input.waits), logs: [] };
  if (!write) { return found; }
  var local = input.local, inBatch = {};
  batch.activityRecords.forEach(function (record) { inBatch[String(record.fbmId || '').trim()] = String(record.customerFbmId || ''); });
  // Giao dịch thấy ở trang trước của khách đọc nhiều trang cũng là đã thấy trong lần đọc khách đó.
  (input.pagedSeen || []).forEach(function (entry) { var at = entry.indexOf(':'), id = entry.slice(at + 1); if (inBatch[id] === undefined) { inBatch[id] = entry.slice(0, at); } });
  customers.forEach(function (sttRec) { if (!batch.returned[sttRec] && local.byStt[sttRec]) { found.lookups.push('c:' + sttRec); } });
  Object.keys(local.activitiesOf).forEach(function (cus) {
    var parent = local.byCus[cus], owner = String(parent && parent.fbmId || '').trim();
    local.activitiesOf[cus].forEach(function (activity) {
      var fbmId = String(activity.fbmId).trim(), holder = inBatch[fbmId];
      // Giao dịch thấy dưới khách khác của lô: cửa ghi nối sang khách đó, khách cha cũ vào danh sách đọc.
      if (holder !== undefined) { if (holder !== owner) { found.moved.push(owner); } return; }
      if (batch.readOk[owner] && batch.readOk[owner].complete && FbmSync.ACTIVITY_ID_PATTERN.test(fbmId)) { found.lookups.push('a:' + fbmId); }
    });
  });
  customers.forEach(function (sttRec) {
    var waiting = found.waits[sttRec];
    if (!waiting) { return; }
    delete found.waits[sttRec];
    waiting.forEach(function (fbmId) {
      var activity = local.activityById[fbmId];
      if (!activity || inBatch[fbmId] !== undefined) { return; }
      if (!batch.returned[sttRec]) { found.flags.activity.push({ record: activity, status: FbmSync.SYNC_STATUS.transferred, reason: 'FBM báo giao dịch thuộc khách ' + sttRec + ' nhưng khách đó không còn trong quyền của tài khoản; giữ dưới khách cũ.' }); return; }
      if (batch.readOk[sttRec] && batch.readOk[sttRec].complete) { found.logs.push(FbmSync.gateOwnerMismatch(activity, sttRec, 'FBM báo khách ' + sttRec + ' đang giữ giao dịch nhưng lần đọc khách đó không có giao dịch này.')); }
    });
  });
  return found;
};

/**
 * Kết quả vòng tra mã theo bảng 09/05 Phần 9 "Vắng mặt và chuyển quyền": cờ, khách cần đọc thêm, hàng chờ nối, lỗi tra. Lỗi tra thì không gắn cờ; hai lần đọc FBM nói khác nhau thì không ghi, chỉ Log `activity_owner_mismatch`.
 * `input`: `local`, `waits`, `isDone` (khách đã đọc trong lượt), `pullAllowed`, `scope`.
 */
FbmSync.lookupDecide = function (chunk, checks, input) {
  var local = input.local, sync = FbmSync.SYNC_STATUS, scope = input.scope;
  var decided = { flags: { customer: [], activity: [] }, adds: [], waits: FbmSync.readWaitCopy(input.waits), failed: [], logs: [] };
  chunk.forEach(function (entry, position) {
    var value = entry.slice(2), result = FbmSync.ownerLookupParse(checks[position].item);
    if (entry.charAt(0) === 'c') {
      var customer = local.byStt[value];
      if (!customer) { return; }
      if (!result.ok) { decided.failed.push({ customer: String(customer.fbmCustomerCode || value), code: result.code, status: result.status, reason: 'Không kiểm tra được khách vắng còn tồn tại trên FBM; khách chưa bị gắn cờ. ' + result.reason }); return; }
      if (result.sttRecs.length) { FbmSync.gateTransferCustomer(decided.flags, local, customer, 'Khách không còn trong quyền của tài khoản nhưng vẫn tồn tại trên FBM.'); }
      else { decided.flags.customer.push({ record: customer, status: sync.missing, reason: 'Không thấy khách bên FBM; không suy ra xóa.' }); }
      return;
    }
    var activity = local.activityById[value], parent = activity && local.byCus[String(activity.customerId || '').trim()], current = String(parent && parent.fbmId || '').trim();
    if (!activity) { return; }
    if (!result.ok) { decided.failed.push({ customer: 'giao dịch ' + value, code: result.code, status: result.status, reason: 'Không tra được khách đang giữ giao dịch vắng; giao dịch chưa bị gắn cờ. ' + result.reason }); return; }
    var owner = result.sttRecs[0] || '', next = local.byStt[owner];
    if (!owner) { decided.flags.activity.push({ record: activity, status: sync.missing, reason: 'Không thấy giao dịch bên FBM; không suy ra xóa.' }); return; }
    if (owner === current) { decided.logs.push(FbmSync.gateOwnerMismatch(activity, owner, 'FBM báo khách cũ vẫn giữ giao dịch nhưng lần đọc khách đó không có giao dịch này.')); return; }
    if (input.isDone(owner)) { decided.logs.push(FbmSync.gateOwnerMismatch(activity, owner, 'FBM báo khách ' + owner + ' đang giữ giao dịch nhưng lần đọc khách đó trong lượt không có giao dịch này.')); return; }
    if (next && (String(next.recordStatus || 'active') === 'deleted' || !input.pullAllowed(next))) {
      // Khách mới đã xóa mềm hoặc không cho lấy về: không đọc khách đó, chỉ đổi khách cha, giữ nội dung.
      decided.flags.activity.push({ record: activity, patch: { customerId: String(next.id || '').trim() } });
      decided.logs.push({ action: 'activity_parent_blocked', outcome: LOG_WARN, entity: 'activity', recordId: String(activity.id || ''), reason: 'Giao dịch ' + String(activity.id || '') + ' đã chuyển sang khách ' + String(next.id || '') + ' nhưng khách đó đã xóa hoặc không cho lấy về; chỉ đổi khách cha, giữ nội dung.', detail: { fbmId: value, from: String(activity.customerId || ''), to: String(next.id || '') } });
      return;
    }
    if (scope && !(next && FbmSync.inScope(next, scope))) { decided.flags.activity.push({ record: activity, status: sync.transferred, reason: 'Giao dịch đã chuyển sang khách ngoài phạm vi đồng bộ; giữ dưới khách cũ.' }); return; }
    decided.adds.push(owner);
    (decided.waits[owner] = decided.waits[owner] || []).push(value);
  });
  return decided;
};
