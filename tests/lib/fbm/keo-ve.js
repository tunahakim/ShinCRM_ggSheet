/**
 * Gọi chặng kéo về như lớp xả đọc gọi: dựng ngữ cảnh (`categoryGate`, `accountName`, `now`) từ hộp, rồi xóa mục chờ xác nhận đã khớp như người điều phối làm. Ca kiểm cũ gọi thẳng cửa ghi dùng hai hàm này thay cho bản tự đọc ô lượt.
 */

function ngCanhKeo(F) {
  return { categoryGate: F.stateCategoryGate(F.stateRead()), accountName: typeof F.scriptSettings === 'function' ? F.scriptSettings(F.stateRead()).accountName : '', now: Date.now() };
}

/** Bản ghi ca kiểm tự dựng (không qua `customerRecord`/`activityRecord`) thì tính dấu vân như hai hàm dựng, vì cửa ghi chỉ nhận bản ghi có sẵn dấu vân. */
function coDauVan(F, entity, records, ctx) {
  return (records || []).map((record) => (record && record.fbmHash || typeof F.hash !== 'function' ? record : Object.assign({}, record, { fbmHash: String(F.hash(record, entity, ctx.categoryGate)) })));
}

/** Như `pullPageApply` cộng phần người điều phối xóa mục chờ xác nhận. */
function keoVe(F, entity, records) {
  const ctx = ngCanhKeo(F);
  const result = F.pullPageApply(entity, coDauVan(F, entity, records, ctx), Object.assign({ pending: typeof F.pendingPushesRead === 'function' ? F.pendingPushesRead() : {} }, ctx));
  if (typeof F.pendingPushClear === 'function') { result.pendingClears.forEach((item) => F.pendingPushClear(item.entity, item.id)); }
  return result;
}

/** Như lớp xả đọc áp một lô trên ô lượt trong kho: đọc, áp với `mode` của lần gọi, ghi lại. */
function keoLo(F, entity, records, mode) {
  const state = F.stateRead(), before = state.mode;
  state.mode = mode;
  const ctx = ngCanhKeo(F);
  const result = F.pullBatchApply(state, entity, coDauVan(F, entity, records, ctx), ctx);
  state.mode = before;
  F.stateWrite(state);
  return result;
}

module.exports = { ngCanhKeo, keoVe, keoLo };
