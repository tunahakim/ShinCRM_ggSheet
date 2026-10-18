/**
 * Cửa bản ghi: cửa duy nhất để mọi tiến trình thay đổi dòng Customer/Activity. Tài liệu 06 Phần 1.
 *
 * Bên gọi đưa **hàm quyết**, không đưa bản đọc: cửa cầm khóa tài liệu rồi mới đọc, nên thứ hàm quyết thấy là dữ liệu mới nhất và không ai chen vào giữa lúc đọc, lúc quyết và lúc ghi. Bản đọc mang ra ngoài khóa rồi đưa vào ghi là đường ghi đè dữ liệu người khác vừa lưu; cửa không nhận bản đọc nên đường đó không có.
 * Thứ tự trong một lần khóa: đọc sổ bận → hàm quyết (đọc bản ghi qua `gate.read`, hỏi sổ qua `gate.busy`) → tính sổ mới (giữ/nhả sai chủ ném lỗi trước khi ghi gì) → kiểm sổ trên mọi mã sắp ghi/xóa → ghi qua cửa ghi, xóa qua cửa xóa → ghi sổ.
 * Hàm quyết trả mã đang bị chủ khác giữ là trái hợp đồng: ném lỗi, không ghi gì. Hàm quyết phải tự bỏ mã bận (đồng bộ để lượt sau) hoặc trả `value` báo bận (Sidebar mở popup).
 * Một lần ghi không đạt (trường không đạt, giá trị cũ đã đổi, mã đã vắng) thì dừng ở đó, không ghi phần sau và không đổi sổ: giữ/nhả chỉ có nghĩa khi mọi lần ghi của phiên đã thành công.
 */

/**
 * Chạy một phiên thay đổi bản ghi. `req = { by, run, decide }`: `by` là chủ (tiến trình), `run` là lượt (để biết chỗ giữ thuộc lượt nào), `decide(gate)` trả
 * `{ save: [{ entity, records, source, old, schemas }], remove: [{ entity, ids }], hold: [{ entity, ids, reason }], release: [{ entity, ids }], value }`.
 * Trả `{ ok, saves, removes, value }`; `saves`/`removes` là kết quả của cửa ghi/cửa xóa theo thứ tự, phần tử cuối là lần không đạt khi `ok` là `false`.
 */
function recordGateRun(req) {
  var by = String(req && req.by || '').trim();
  if (!by) { throw new Error('Cửa bản ghi cần `by` (tiến trình nào đang thay đổi bản ghi).'); }
  if (typeof (req && req.decide) !== 'function') { throw new Error('Cửa bản ghi cần `decide`: hàm quyết chạy trong khóa trên bản đọc mới.'); }

  return documentLockRun(function () {
    var holds = recordHoldsRead();
    var gate = {
      read: function (entity, schemas) { return entityBlockRecords(entityReadAllCombined(entity, schemas)); },
      readById: function (entity, schemas, id) { return entityBlockRecords(entityReadRecordById(entity, schemas, id))[0] || null; },
      busy: function (entity, ids) { return recordHoldsBusy(holds, by, entity, ids); }
    };
    var plan = req.decide(gate) || {};
    var saves = recordGateList(plan.save, 'save'), removes = recordGateList(plan.remove, 'remove');
    var next = recordHoldsApply(holds, by, req.run, recordGateList(plan.hold, 'hold'), recordGateList(plan.release, 'release'), new Date().toISOString());
    recordGateAssertFree(holds, by, saves, removes);

    var result = { ok: true, saves: [], removes: [], value: plan.value };
    for (var i = 0; i < saves.length; i += 1) {
      var item = saves[i];
      var saved = writeGateSave({ entity: item.entity, records: item.records, source: item.source, old: item.old, schemas: item.schemas });
      result.saves.push(saved);
      if (!saved || !saved.ok) { result.ok = false; return result; }
    }
    for (var k = 0; k < removes.length; k += 1) {
      var removed = deleteGateRemove({ entity: removes[k].entity, ids: removes[k].ids });
      result.removes.push(removed);
      if (!removed || !removed.ok) { result.ok = false; return result; }
    }
    recordHoldsWrite(holds, next);
    return result;
  });
}

/**
 * Nhả mọi bản ghi chủ `by` đang giữ, trừ `keep` (`["entity:mã"]`): đường thu hồi khi lượt mới bắt đầu, khi hủy lượt hoặc khi lượt cũ chết. Sổ không có mục nào của chủ đó thì không lấy khóa (xem `recordHoldsPeekOwner` về điều kiện đúng).
 */
function recordGateReleaseOwner(by, keep) {
  if (!recordHoldsPeekOwner(by)) { return false; }
  return documentLockRun(function () {
    var holds = recordHoldsRead();
    return recordHoldsWrite(holds, recordHoldsWithoutOwner(holds, by, keep));
  });
}

function recordGateList(list, name) {
  if (list === undefined || list === null) { return []; }
  if (!Array.isArray(list)) { throw new Error('Hàm quyết trả `' + name + '` không phải mảng.'); }
  list.forEach(function (item) {
    if (!item || !item.entity) { throw new Error('Hàm quyết trả một mục `' + name + '` thiếu `entity`.'); }
  });
  return list;
}

function recordGateAssertFree(holds, by, saves, removes) {
  var busy = [];
  saves.forEach(function (item) {
    var ids = (Array.isArray(item.records) ? item.records : []).map(function (record) { return record && record.id; }).filter(function (id) { return String(id || '').trim(); });
    Object.keys(recordHoldsBusy(holds, by, item.entity, ids)).forEach(function (id) { busy.push(item.entity + ':' + id); });
  });
  removes.forEach(function (item) {
    Object.keys(recordHoldsBusy(holds, by, item.entity, Array.isArray(item.ids) ? item.ids : [])).forEach(function (id) { busy.push(item.entity + ':' + id); });
  });
  if (busy.length) { throw new Error('Hàm quyết của "' + by + '" định thay đổi bản ghi đang bị tiến trình khác giữ: ' + busy.join(', ') + '. Không ghi gì.'); }
}
