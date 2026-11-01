/** Định sẵn ứng viên của chặng đẩy trong hộp thử: thay phép xét một dòng `pushReview` bằng danh sách cho trước, rồi trả lại phép xét thật. */

/**
 * Chặng đẩy chọn mã bằng phép xét một dòng (`pushReview`) trên dòng đọc lại theo mã. Hộp thử muốn định sẵn ứng viên thì thay phép xét: `danhSach(entity)` (mảng hoặc hàm) là các ứng viên, khớp theo mã và theo `entity` (thiếu là Khách); mã đã vào sổ lỗi đẩy thì không chọn lại. Dòng của ứng viên chưa có trong `readLocal` được thêm vào để lần quét và lần đọc theo mã thấy nó.
 */
function datUngVienDay(hopCat, danhSach) {
  const F = hopCat.FbmSync;
  if (!F.__pushReviewGoc) { F.__pushReviewGoc = F.pushReview; }
  const ds = (entity) => (typeof danhSach === 'function' ? danhSach(entity) : danhSach) || [];
  const hop = (entity) => ds(entity).filter((c) => (c.entity || 'customer') === entity);
  // Bản ghi đã vào sổ lỗi đẩy thì không chọn lại, như phép xét thật khi dữ liệu chưa đổi.
  F.pushReview = (entity, record, customer, context) => {
    if (context && context.pushFailures && context.pushFailures[entity + ':' + String(record && record.id)] !== undefined) { return null; }
    const found = hop(entity).find((c) => String(c.id) === String(record && record.id));
    return found ? Object.assign({ raw: record }, found, { entity }) : null;
  };
  const doc = F.readLocal;
  F.readLocal = (entity) => {
    const rows = (typeof doc === 'function' ? doc(entity) : []) || [], ids = rows.map((r) => String(r && r.id));
    return rows.concat(hop(entity).filter((c) => ids.indexOf(String(c.id)) < 0).map((c) => c.record || { id: c.id }));
  };
}

/** Trả phép xét thật sau `datUngVienDay`. */
function boUngVienDay(hopCat) {
  const F = hopCat.FbmSync;
  if (F.__pushReviewGoc) { F.pushReview = F.__pushReviewGoc; }
}

module.exports = { datUngVienDay, boUngVienDay };
