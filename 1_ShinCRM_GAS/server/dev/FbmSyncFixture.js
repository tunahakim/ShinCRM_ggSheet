/** Chuẩn bị Sheet DEV cho live test ALT00010; không xóa dữ liệu hay gửi request FBM. */
function fbmPrepareAltTest() {
  if (typeof fbmEnsureSyncColumns === 'function') { fbmEnsureSyncColumns(); }
  var cases = [
    'Đọc phiên Customer/Activity qua Extension; chỉ nhận ALT00010.',
    'Nhập bốn danh mục live vào Category và bỏ qua mã companion giả.',
    'Kéo Customer về Customer, giữ nguyên ghi chú nội bộ.',
    'Kéo Activity về Activity và nối đúng Customer.id nội bộ.',
    'Không đổi dữ liệu: hash ba chiều phải giữ trạng thái đã đồng bộ.',
    'Đổi một trường Customer được phép: đẩy sửa lên FBM, không gửi ghi chú nội bộ.',
    'Tạo một Activity mới thuộc ALT00010 và kiểm tra dấu #SC-.',
    'Đổi đồng thời hai phía: ghi conflict, không ghi đè im lặng.',
    'Đang sửa trên Sidebar: bản ghi bị hoãn, không ghi đè bản nháp.',
    'Lỗi HTTP/Bugs/Extension: giải phóng khóa và ghi lỗi vào Log.',
    'Xác nhận không phát sinh request xóa.'
  ];
  if (typeof logEvent === 'function' && typeof flushLog === 'function') {
    logEvent({ source: 'fbm_sync', action: 'prepare_test', outcome: LOG_OK, entity: 'customer', recordId: 'ALT00010', reason: 'Chuẩn bị live test; chỉ giới hạn mã ALT00010.', detail: { cases: cases } });
    flushLog();
  }
  return { ok: true, customerCode: 'ALT00010', deleted: false, writesToFbm: 0, cases: cases };
}
