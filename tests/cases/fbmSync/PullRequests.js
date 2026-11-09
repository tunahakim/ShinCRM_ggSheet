/** Dựng request FBM của chặng kéo và sửa: lệnh sửa Customer giữ trường FBM, grid Customer theo phạm vi, grid giao dịch, bộ lọc ngày, bảng danh mục. */
const { section, check } = require('../../lib/assert');
const { hopKeoVe, congDanhMucThu } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — Dựng request FBM của chặng kéo và sửa');
  const builders = hopKeoVe();
  const gate = congDanhMucThu();
  builders.FbmSync.readCategoryGate = () => gate;
  builders.FbmSync.stateRead = () => ({ session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' } });
  const edit = builders.FbmSync.customerEditRequest({ fbmId: 'A1', companyName: 'Đổi tên' }, { stt_rec_kh: 'A1', ma_kh: 'ALT00010', ten_kh: 'Cũ', dien_thoai: '0123' }, gate, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead()));
  check(so, 'Customer sửa giữ OldValue field không đụng tới',
    edit.body.memvars.filter((item) => item.Name === 'dien_thoai')[0].NewValue,
    '0123');
  const editWithShinId = builders.FbmSync.customerEditRequest({ id: 'CUS-020059', fbmId: 'A1', website: 'Mới' }, { stt_rec_kh: 'A1', ma_kh: 'ALT00010', id: 0 }, gate, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead())).body.memvars.filter((item) => item.Name === 'id')[0];
  check(so, 'FBM-046: Customer sửa không gửi mã CUS-* của Sheet vào memvar id của FBM',
    [editWithShinId.OldValue, editWithShinId.NewValue],
    [0, 0]);
  const editNote = builders.FbmSync.customerEditRequest({ fbmId: 'A1', note: 'nội bộ ShinCRM' }, { stt_rec_kh: 'A1', ghi_chu: 'Ghi chú FBM' }, gate, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead())).body.memvars.filter((item) => item.Name === 'ghi_chu')[0];
  const editGrids = builders.FbmSync.customerEditRequest({ fbmId: 'A1' }, { stt_rec_kh: 'A1' }, gate, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead())).body.memvars.filter((item) => Array.isArray(item.Items)).map((item) => [item.Name, item.Modified, item.Items.length]);
  check(so, 'FBM-046: Customer lưu form kèm hai bảng con rỗng, không đổi',
    editGrids,
    [['chiasekh', false, 0], ['crlhkh', false, 0]]);
  const editProduct = builders.FbmSync.customerEditRequest({ fbmId: 'A1', product: 'Sản phẩm ShinCRM' }, { stt_rec_kh: 'A1', ma_sp: 'F1' }, gate, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead())).body.memvars.filter((item) => item.Name === 'ma_sp')[0];
  check(so, 'FBM-051: sản phẩm Customer không đồng bộ, lệnh sửa gửi lại đúng ma_sp FBM đang có, không lấy sản phẩm ShinCRM',
    editProduct.NewValue,
    'F1');
  check(so, 'FBM-046: Customer sửa giữ nguyên ghi chú FBM, không gửi ghi chú ShinCRM',
    [editNote.OldValue, editNote.NewValue],
    ['Ghi chú FBM', 'Ghi chú FBM']);
  const emptyDate = builders.FbmSync.customerEditRequest({ fbmId: 'A1' }, { stt_rec_kh: 'A1', ngay_tl: '' }, gate, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead())).body.memvars.filter((item) => item.Name === 'ngay_tl')[0];
  check(so, 'FBM-046: field ngày trống gửi null như form FBM, không gửi chuỗi rỗng',
    [emptyDate.OldValue, emptyDate.NewValue],
    [null, null]);
  check(so, 'fixture session giữ cookie và userId',
    [builders.FbmSync.stateRead().session.cookie, builders.FbmSync.stateRead().session.userId],
    ['461020379855cFHN_CRM_App', '2037']);
  check(so, 'Customer grid gắn điều kiện phân quyền theo userId trong payload cookie',
    builders.FbmSync.customerGridRequest({ type: 0, scope: null }, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead())).body.externalKey[0].Name,
    "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('2037')) and 1");
  builders.FbmSync.scope = () => ({ fbm: ['ALT00010', 'ALT00011'], shin: ['CUS-020061'] });
  const customerGridKeys = builders.FbmSync.customerGridRequest({ type: 0, scope: builders.FbmSync.scope() }, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead())).body.externalKey;
  check(so, 'Phạm vi giới hạn: chiều lấy lọc grid Customer theo các mã FBM GAS đã đổi ra, không đưa mã ShinCRM vào điều kiện grid',
    [customerGridKeys.length, customerGridKeys[1] && customerGridKeys[1].Name, customerGridKeys[1] && customerGridKeys[1].Value],
    [2, "ma_kh in ('ALT00010','ALT00011') and 1", 1]);
  builders.FbmSync.scope = () => ({ fbm: [], shin: ['CUS-020061'] });
  const emptyScopeKeys = builders.FbmSync.customerGridRequest({ type: 0, scope: builders.FbmSync.scope() }, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead())).body.externalKey;
  check(so, 'Phạm vi giới hạn mà không có mã FBM nào: grid Customer lọc ra không khách nào, không rơi thành quét toàn bộ',
    [emptyScopeKeys.length, emptyScopeKeys[1] && emptyScopeKeys[1].Name],
    [2, "ma_kh in ('') and 1"]);
  builders.FbmSync.scope = () => null;
  check(so, 'Không giới hạn phạm vi: grid Customer chỉ còn điều kiện phân quyền',
    builders.FbmSync.customerGridRequest({ type: 0, scope: builders.FbmSync.scope() }, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead())).body.externalKey.length,
    1);
  builders.FbmSync.scope = () => ({ fbm: ['ALT00010'], shin: [] });

  const bulkActivity = builders.FbmSync.activityBulkRequest({ type: 0 }, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead()));
  check(so, 'Request giao dịch mọi khách không gắn mốc thời gian vào externalKey hay Customer đơn lẻ',
    [bulkActivity.body.controller, bulkActivity.body.externalKey.some((item) => item.Name === 'end_date' && item.Opr === '>='), bulkActivity.body.externalKey.some((item) => item.Name === 'stt_rec')],
    ['zccrAccountTask', false, false]);
  const activityCustomer = builders.FbmSync.activityGridRequest('CUS-FBM-1', { type: 0 }, builders.FbmSync.scriptSettings(builders.FbmSync.stateRead()));
  check(so, 'Request giao dịch mọi khách và từng khách không gắn bộ lọc ngày',
    [bulkActivity.body.filter, activityCustomer.body.filter, activityCustomer.body.externalKey[0].Name],
    [[], [], 'stt_rec']);
  check(so, 'Đổi ngày cửa sổ sang filter FBM: ngày hợp lệ ra DD/MM/YYYY, ngày không hợp lệ ra rỗng',
    [builders.FbmSync.fbmFilterDate('2024-10-07'), builders.FbmSync.fbmFilterDate('2024-02-31')],
    ['07/10/2024', '']);
  const tracked = (records) => records.filter(builders.FbmSync.activityBulkTracker()).map((record) => record.id);
  check(so, 'Lấy toàn bộ giao dịch chỉ theo dõi giao dịch có FBM ID còn hiệu lực: bỏ tombstone, dòng tạm, dòng chưa có FBM ID',
    tracked([{ id: 'A-1', fbmId: 'F-1', recordStatus: 'active' }, { id: 'A-2', fbmId: 'F-2', recordStatus: 'deleted' }, { id: 'TMP-3', fbmId: 'F-3', recordStatus: 'active' }, { id: 'A-4', fbmId: 'F-4', recordStatus: 'active' }, { id: 'A-5', fbmId: 'TMP-F-5', recordStatus: 'active' }, { id: 'A-6', fbmId: '', recordStatus: 'active' }]),
    ['A-1', 'A-4']);
  const lookupState = { session: { lookups: { '@CAT_TINH_THANH': [['HNI', 'Hà Nội']], '@CAT_NGUON_KH': [['HNI', 'Nguồn khác']], '@CAT_CONG_VIEC': [['HNI', 'Công việc khác']], '@CAT_SAN_PHAM': [['HNI', 'Sản phẩm khác']] } } };
  const lookupGate = { namesBySource: { '@CAT_TINH_THANH': { HNI: 'Hà Nội' }, '@CAT_NGUON_KH': { HNI: 'Nguồn khác' }, '@CAT_CONG_VIEC': { HNI: 'Công việc khác' }, '@CAT_SAN_PHAM': { HNI: 'Sản phẩm khác' } } };
  check(so, 'lookup danh mục không lẫn mã trùng giữa các nguồn',
    builders.FbmSync.validateLookupGate(lookupState, lookupGate).length,
    0);

  return so;
}

module.exports = { chay };
