/** Dấu vân bản ghi, chuẩn hóa ngày, so ba dấu vân và cổng danh mục: một công cụ cho mỗi phép tính, mọi đường gọi cho cùng một giá trị. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');

/** Mốc đã lưu trên Sheet (`fbmHash`) và trong kho; đổi số này là mọi dòng đang khớp thành lệch, phải có kế hoạch chuyển mốc. */
const MOC = { customer: '1b2abd1c', activity: 'efbe2f0c' };

async function chay(so) {
  section('FBM sync — dấu vân và cổng danh mục');
  const hop = taoHopCat({ FbmSync: {} });
  napServer(hop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/Fingerprint.js');
  const F = hop.FbmSync;
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': '01', '@CAT_NGUON_KH\u001fWeb': 'WEB', '@CAT_CONG_VIEC\u001fGọi điện': 'GD' } };
  const khachShin = { companyName: ' Công ty A ', taxNumber: '0101', contactPerson: 'Anh B', phone: '0900', email: 'a@b.vn', website: 'a.vn', address: 'Số 1\r\nPhố 2', province: 'Hà Nội', leadSource: 'Web', note: 'nội bộ' };
  const khachFbm = { ten_kh: 'Công ty A', ma_so_thue: '0101', ong_ba: 'Anh B', dien_thoai: '0900', email: 'a@b.vn', website: 'a.vn', dc_lh: 'Số 1\nPhố 2', dc_lh_tinh: '01', nguon_dm: 'WEB', stt_rec_kh: 'A0001', ma_kh: 'ALT1' };
  const ngay = new Date(Date.UTC(2026, 8, 8, 17, 30));
  const gdShin = { fbmId: '174813', taskType: 'Gọi điện', content: 'Hẹn gặp #SC-ACT-1', workDate: ngay, customerId: 'CUS-1' };
  const gdFbm = { id: 174813, ma_cv: 'GD', details: 'Hẹn gặp', end_date: '/Date(' + ngay.getTime() + ')/', ma_kh: 'ALT1' };

  check(so, 'dấu vân Khách và Giao dịch giữ giá trị cố định (đổi là đổi mọi mốc đã lưu)',
    [F.hash(khachShin, 'customer', gate), F.hash(gdShin, 'activity', gate)],
    [MOC.customer, MOC.activity]);
  check(so, 'cùng một bản ghi băm theo tên ShinCRM (dòng Sheet) và theo tên FBM (bản ghi kéo về) ra cùng dấu vân',
    [F.hash(khachFbm, 'customer', gate), F.hash(gdFbm, 'activity', gate)],
    [MOC.customer, MOC.activity]);
  check(so, 'ngày Giao dịch dạng Date, `/Date(ms)/` và chữ không đệm số 0 cùng một khóa ngày giờ Việt Nam',
    [F.hash(Object.assign({}, gdShin, { workDate: '2026/9/9' }), 'activity', gate), F.hash(Object.assign({}, gdShin, { workDate: '2026-09-09 08:00' }), 'activity', gate)],
    [MOC.activity, MOC.activity]);
  check(so, 'trường ngoài dấu vân (ghi chú nội bộ, mã khách) và dấu #SC không đổi dấu vân',
    [F.hash(Object.assign({}, khachShin, { note: 'khác' }), 'customer', gate), F.hash(Object.assign({}, gdShin, { customerId: 'CUS-9', content: 'Hẹn gặp' }), 'activity', gate)],
    [MOC.customer, MOC.activity]);
  check(so, 'giá trị danh mục chưa có trong ánh xạ giữ nguyên chữ nên khác dấu vân của mã FBM',
    F.hash(khachShin, 'customer', { map: {} }) !== MOC.customer, true);
  const nem = (fn) => { try { fn(); return ''; } catch (error) { return error.message; } };
  check(so, 'thiếu cổng danh mục hoặc loại bản ghi lạ thì ném, không băm tên hiển thị thay mã',
    [/cổng danh mục/.test(nem(() => F.hash(khachShin, 'customer'))), /cổng danh mục/.test(nem(() => F.hash(khachShin, 'customer', {}))), /không hợp lệ/.test(nem(() => F.hash(khachShin, 'khach', gate)))],
    [true, true, true]);

  const d = (value) => F.dateNormalize(value);
  check(so, 'dateNormalize: Date, `/Date(ms)/`, chữ năm-tháng-ngày thành yyyy-MM-dd; ngày giả FBM, Date hỏng, rác thành rỗng',
    [d(ngay), d('/Date(' + ngay.getTime() + ')/'), d('2026-9-9'), d('2026/09/09T10:00'), d(new Date(Date.UTC(1999, 0, 1, 3))), d(new Date(Date.UTC(1900, 0, 1, 3))), d(new Date('x')), d('hôm qua'), d(''), d(null)],
    ['2026-09-09', '2026-09-09', '2026-09-09', '2026-09-09', '', '', '', '', '', '']);

  check(so, 'threeWay so ba dấu vân đã tính: mốc rỗng vẫn là mốc, hai bên đổi khác nhau là xung đột',
    [F.threeWay('a', 'a', 'a').unchanged, F.threeWay('a', 'b', 'a').shinChanged, F.threeWay('a', 'a', 'c').fbmChanged, F.threeWay('a', 'b', 'c').conflict, F.threeWay('a', 'b', 'b').conflict, F.threeWay('', 'b', 'c').conflict],
    [true, true, true, true, false, true]);
  check(so, 'threeWay không nhận bản ghi hay giá trị không phải chữ (không tự băm)',
    [/chỉ nhận/.test(nem(() => F.threeWay({ hBASE: 'a' }, khachShin, khachFbm))), /chỉ nhận/.test(nem(() => F.threeWay('a', undefined, 'a')))],
    [true, true]);

  // Cổng của phiên dựng lại mỗi lần gọi: bản nhớ trên object state từng giữ `blocked` cũ sau khi phiên ghi thêm mã bị chặn.
  let docCategory = 0;
  F.readCategoryGate = () => { docCategory += 1; return { map: gate.map, valid: null }; };
  const state = { metadata: { categoryBlocks: [] } };
  const truoc = F.stateCategoryGate(state);
  state.metadata.categoryBlocks.push({ source: '@CAT_CONG_VIEC', code: 'GD', reason: 'FBM đã đổi tên mã GD.' });
  const sau = F.stateCategoryGate(state);
  check(so, 'stateCategoryGate không nhớ trên state: mã bị chặn thêm giữa phiên có hiệu lực ngay, state không mang thuộc tính ẩn',
    [Object.keys(truoc.blocked).length, sau.blocked['@CAT_CONG_VIEC\u001fGD'], docCategory, Object.getOwnPropertyNames(state)],
    [0, 'FBM đã đổi tên mã GD.', 2, ['metadata']]);
  check(so, 'categoryGateCheck một phép cho cả chiều kéo (tên ShinCRM) và chiều đẩy (tên FBM dự phòng): mã bị chặn và giá trị chưa có mã đều trượt',
    [F.categoryGateCheck(gdShin, 'activity', sau).map((x) => [x.source, x.value, x.result.reason]), F.categoryGateCheck({ ma_cv: 'Gọi điện' }, 'activity', sau).length, F.categoryGateCheck({ taskType: 'Lạ' }, 'activity', truoc).length, F.categoryGateCheck({ taskType: '' }, 'activity', truoc).length],
    [[['@CAT_CONG_VIEC', 'Gọi điện', 'FBM đã đổi tên mã GD.']], 1, 1, 0]);
}

module.exports = { chay };
