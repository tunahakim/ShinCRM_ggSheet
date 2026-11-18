/** Màn Chạy đồng bộ của Sidebar: vẽ đúng theo status GAS dựng sẵn (nút theo `actions`, khóa ô chọn theo `busy`, pipeline luôn hiện, tiến độ, băng phạm vi, nút đặt lại, hủy phiên cũ, chấp thuận). */
const { taoSidebarDongBo: taoBoGoc } = require('../../lib/sidebar/bo-dong-bo');
const { section, check, ghiLoiNap } = require('../../lib/assert');
const { statusGas, stateDangChay, hangGas } = require('../../lib/fbm/status-gas');

/** Vẽ một màn bằng status đã cho vào vùng thân, bắt đầu từ chỉ mục trống. */
function ve(hop, content, fn, status) {
  content.textContent = '';
  hop.RENDER_INDEX = { nodes: {}, menus: {}, ctx: null, dem: 0 };
  fn(content, status);
  return content;
}

function coNut(node, id) { return node.id === id || (node.children || []).some((con) => coNut(con, id)); }

function testNutChay(so) {
  const { hop } = taoBoGoc();
  const nut = (status) => { const khoi = hop.fbmSyncRunActionBlock(status); return [khoi.id, khoi.label, khoi.disabled]; };
  const nhan = hop.FBM_SYNC_RUN_SCHEMA.action.labels;
  check(so, 'nút chạy theo `actions.run` của GAS: rảnh là Bắt đầu, lượt tay đang chạy là Dừng',
    [nut(statusGas({ phase: 'idle' })), nut(statusGas(stateDangChay()))],
    [['fbm-sync-start', nhan.start, false], ['fbm-sync-cancel', nhan.cancel, false]]);
  const co = { runId: 'r-1', verdict: 'cancelled' };
  check(so, 'đã bấm dừng: nút khóa và báo Đang dừng, cả lượt tay lẫn lượt nền',
    [nut(statusGas(stateDangChay(), { stopFlag: co })), nut(statusGas(stateDangChay({ origin: 'background' }), { stopFlag: co }))],
    [['fbm-sync-cancel', nhan.stopping, true], ['fbm-sync-cancel', nhan.stoppingBackground, true]]);
  check(so, 'lượt nền đang chạy vẫn là nút Bắt đầu không khóa (bấm thì GAS trả mã để Sidebar hỏi dừng nền)',
    nut(statusGas(stateDangChay({ origin: 'background' }))),
    ['fbm-sync-start', nhan.start, false]);
  check(so, 'công tắc tổng tắt: nút Bắt đầu khóa theo `runDisabled`',
    nut(statusGas({ phase: 'idle' }, { enabled: false })),
    ['fbm-sync-start', nhan.start, true]);
}

function testPipelineVaTienDo(so) {
  const { hop, content } = taoBoGoc();
  const pipeline = (status) => { const dom = ve(hop, content, hop.fbmSyncRenderRun, status); const goc = dom.querySelector('.shin-sync-pipeline'); return goc ? [dom.querySelector('.shin-sync-pipeline-title').textContent, Array.from(dom.querySelectorAll('.shin-sync-pipeline-marker')).map((node) => node.textContent).join('')] : null; };
  const m = hop.FBM_SYNC_RUN_SCHEMA.pipeline.marker;
  check(so, 'pipeline luôn có trên màn Chạy kể cả khi rảnh (GAS dựng `pipeline.visible`), mọi chặng chờ',
    pipeline(statusGas({ phase: 'idle' })),
    ['Pipeline sẽ chạy', m.pending.repeat(6)]);
  check(so, 'đang chạy: tiêu đề đang chạy, chặng đầu là hiện tại',
    pipeline(statusGas(stateDangChay({ phase: 'checking_session' }))),
    ['Pipeline đang chạy', m.current + m.pending.repeat(5)]);
  check(so, 'preflight thất bại: pipeline giữ lại để thấy chặng dừng',
    pipeline(statusGas({ phase: 'error', runId: 'r2', lastFailureCode: 'SYNC_PREFLIGHT_FAILED' }))[0],
    'Pipeline dừng vì lỗi');
  check(so, 'lỗi sau request: pipeline giữ lại để chẩn đoán',
    pipeline(statusGas({ phase: 'error', runId: 'r3', mode: 'push', cursor: { kind: 'push_wait' }, lastFailureCode: 'FBM_VERIFY_FAILED' }))[0],
    'Pipeline dừng vì lỗi');
  check(so, 'phiên tạm dừng giữ pipeline và lý do GAS',
    [pipeline(statusGas({ phase: 'paused', runId: 'r4', message: 'Cầu nối FBM không phản hồi.' }))[0], ve(hop, content, hop.fbmSyncRenderRun, statusGas({ phase: 'paused', runId: 'r4', message: 'Cầu nối FBM không phản hồi.' })).textContent.indexOf('Cầu nối FBM không phản hồi.') >= 0],
    ['Pipeline đã tạm dừng', true]);
  check(so, 'lỗi do Sidebar phát hiện nhưng đã được GAS ghi vào status hiện ra màn Chạy',
    ve(hop, content, hop.fbmSyncRenderRun, statusGas({ phase: 'error', message: 'Máy chủ không phản hồi hàm fbmStartSync sau 30000 ms.' })).textContent.indexOf('không phản hồi hàm fbmStartSync') >= 0, true);

  const roi = statusGas({ phase: 'idle' });
  const khoiTienDo = hop.fbmSyncProgressBlocks(roi, {}).elements[1];
  check(so, 'tiến độ rảnh rỗng hoàn toàn: không tô fill giả, track ẩn nhưng giữ node',
    [hop.fbmSyncProgressData(roi).active, khoiTienDo.elements[0].spatialConfig.width, khoiTienDo.elements[0].className, khoiTienDo.className],
    [false, '0%', 'shin-loading-fill', 'shin-loading-track is-idle']);
  check(so, 'lượt chưa có tổng: thanh không xác định, nhãn đang xử lý',
    [hop.fbmSyncProgressData(statusGas(stateDangChay())).determinate, hop.fbmSyncProgressData(statusGas(stateDangChay())).label],
    [false, 'Tiến trình: đang xử lý…']);
  check(so, 'lượt có tổng: nhãn đếm và phần trăm, chờ phản hồi thì có thêm chữ chờ',
    [hop.fbmSyncProgressData(statusGas(stateDangChay({ progress: { total: 10, done: 2 } }))).label, hop.fbmSyncProgressData(statusGas(stateDangChay({ progress: { total: 10, done: 7 }, cursor: { kind: 'push_wait' } }))).label],
    ['Tiến trình: 2/10 (20%)', 'Tiến trình: 7/10 (70%) · đang chờ phản hồi']);
}


function testKhoaOChon(so) {
  const { hop, content } = taoBoGoc();
  const oChon = (node) => ['fbm-sync-mode', 'fbm-sync-pack'].map((id) => { const el = node.querySelector('#' + id); return !!el && el.disabled === true; });
  const rai = statusGas({ phase: 'idle' }), tay = statusGas(stateDangChay()), nen = statusGas(stateDangChay({ origin: 'background' }));
  hop.FBM_SYNC_CLIENT.mode = 'read';
  check(so, 'lượt tay đang chạy theo `actions.busy`: khóa cả Loại đồng bộ và Mức quét',
    oChon(ve(hop, content, hop.fbmSyncRenderRun, tay)),
    [true, true]);
  hop.fbmSyncPatchRun(content, rai);
  check(so, 'GAS báo đã dừng thì vẽ lại một phần mở cả hai ô chọn, không cần cờ nào ở Sidebar',
    oChon(content),
    [false, false]);
  check(so, 'vẽ cả màn theo status rảnh cũng mở cả hai ô chọn',
    oChon(ve(hop, content, hop.fbmSyncRenderRun, rai)),
    [false, false]);
  check(so, 'lượt nền đang chạy không khóa ô chọn', oChon(ve(hop, content, hop.fbmSyncRenderRun, nen)), [false, false]);
  const co = { runId: 'r-1', verdict: 'cancelled' };
  check(so, 'đã bấm dừng mà lượt chưa đóng vẫn khóa ô chọn theo `busy`',
    oChon(ve(hop, content, hop.fbmSyncRenderRun, statusGas(stateDangChay(), { stopFlag: co }))),
    [true, true]);
}

function testMucQuet(so) {
  const { hop, content } = taoBoGoc();
  const rai = statusGas({ phase: 'idle' });
  const goi = hop.FBM_SYNC_RUN_SCHEMA.pack;
  const xem = (mode, pack) => {
    hop.FBM_SYNC_CLIENT.mode = mode; hop.FBM_SYNC_CLIENT.pack = pack;
    ve(hop, content, hop.fbmSyncRenderRun, rai);
    const hien = content.textContent.indexOf(goi.label) >= 0;
    return [hien, hien ? content.textContent.indexOf(goi.options.find((option) => option.value === (pack || 'quick')).hint) >= 0 : false];
  };
  check(so, 'Mức quét hiện ở Lấy và Hai chiều với dòng mô tả đúng gói đang chọn, ẩn ở Đẩy và Kiểm tra an toàn',
    [xem('read', 'quick'), xem('write', 'deep'), xem('read', 'all'), xem('push', 'deep')[0], xem('check', 'deep')[0]], [[true, true], [true, true], [true, true], false, false]);
  check(so, 'Mức quét có đúng ba gói theo thứ tự, mặc định Quét nhanh',
    [goi.options.map((option) => option.label), hop.fbmSyncRunPack('read').length > 0, goi.defaultValue],
    [['Quét nhanh', 'Quét kỹ', 'Quét toàn bộ'], true, 'quick']);
  hop.FBM_SYNC_CLIENT.pack = 'deep';
  check(so, 'gói gửi kèm lệnh chạy: Hai chiều gửi gói đã chọn, Đẩy gửi rỗng',
    [hop.fbmSyncRunPack('write'), hop.fbmSyncRunPack('push')],
    ['deep', '']);
}

function testBangPhamViVaNut(so) {
  const { hop, content } = taoBoGoc();
  const phamVi = statusGas({ phase: 'idle' }, { run: { scopeLimited: true, scopeCodes: ['ALT00010', 'CUS-020061'] } });
  const bang = JSON.stringify(hop.fbmSyncRunScopeBlocks(phamVi));
  check(so, 'Màn Chạy hiện băng cảnh báo phạm vi giới hạn kèm đúng danh sách khách chỉ định, chữ do GAS dựng',
    [bang.indexOf('warning') >= 0, bang.indexOf('ALT00010, CUS-020061') >= 0, hop.fbmSyncRunScopeBlocks(statusGas({ phase: 'idle' }, { run: { scopeLimited: false, scopeCodes: [] } }))],
    [true, true, []]);
  const kep = hangGas().stateStuckView(new Error('state hỏng'));
  const nutDatLai = ve(hop, content, hop.fbmSyncRenderRun, kep);
  const coDatLai = coNut(nutDatLai, 'fbm-sync-reset-state'), nhan = nutDatLai.querySelector('#fbm-sync-reset-state');
  check(so, 'FBM-044: status kẹt hiện lý do, nút Đặt lại phiên đồng bộ và pipeline ẩn theo GAS; lỗi thường không có nút',
    [coDatLai, nhan && nhan.textContent, nutDatLai.textContent.indexOf('state hỏng') >= 0, coNut(ve(hop, content, hop.fbmSyncRenderRun, statusGas({ phase: 'error', runId: 'r1', message: 'lỗi thường' })), 'fbm-sync-reset-state')],
    [true, 'Đặt lại phiên đồng bộ', true, false]);
  const mo = statusGas({ phase: 'paused', runId: 'r2', loginForceOffered: true, lastFailureCode: 'AUTO_LOGIN_FAILED', message: 'FBM từ chối đăng nhập' });
  check(so, 'FBM-057: nút Hủy phiên cũ và đăng nhập chỉ hiện khi GAS mở (`actions.forceLogin`)',
    [coNut(ve(hop, content, hop.fbmSyncRenderRun, mo), 'fbm-sync-force-login'), coNut(ve(hop, content, hop.fbmSyncRenderRun, statusGas({ phase: 'paused', runId: 'r2', message: 'FBM từ chối đăng nhập' })), 'fbm-sync-force-login')],
    [true, false]);
  const cho = { status: 'pending', count: 12, fingerprint: 'abcd1234-12' };
  const duyet = (status) => { const nut = ve(hop, content, hop.fbmSyncRenderRun, status).querySelector('#fbm-sync-approve'); return nut ? [nut.getAttribute('data-fingerprint'), nut.disabled === true] : null; };
  check(so, 'Chấp thuận: nút hiện khi GAS báo tập chờ duyệt, mang dấu tập, mở khi không có lượt chạy và khóa khi lượt đang chạy; không có tập thì không có nút',
    [duyet(statusGas({ phase: 'paused' }, { gate: cho })), duyet(statusGas(stateDangChay(), { gate: cho })), duyet(statusGas({ phase: 'paused' }))],
    [['abcd1234-12', false], ['abcd1234-12', true], null]);
}

function testDongTrangThai(so) {
  const { hop } = taoBoGoc();
  const dem = { completed: 1445, succeeded: 3, pushed: 1, missingCustomer: 0, missingActivity: 2 };
  check(so, 'Thẻ Trạng thái phiên tách kết quả lượt thành từng dòng, số có dấu chấm nghìn, có số không thấy bên FBM; dòng đẩy chỉ ở chiều có đẩy; chưa có lượt thì không có dòng', [
    hop.fbmSyncStatusResultLines(statusGas({ phase: 'done', runId: 'r1', mode: 'write' }), dem),
    hop.fbmSyncStatusResultLines(statusGas({ phase: 'done', runId: 'r1', mode: 'read' }), { completed: 5 }).map((dong) => dong.split(':')[0]),
    hop.fbmSyncStatusResultLines(statusGas({ phase: 'idle', runId: '' }), { completed: 5 })
  ], [
    ['Đọc từ FBM: 1.445', 'Ghi vào Sheet: 3', 'Đẩy lên FBM: 1', 'Không thấy bên FBM: 0 khách, 2 giao dịch', 'Đã chuyển cho người khác: 0 khách, 0 giao dịch', 'Xung đột: 0', 'Lỗi: 0', 'Bỏ qua: 0'],
    ['Đọc từ FBM', 'Ghi vào Sheet', 'Không thấy bên FBM', 'Đã chuyển cho người khác', 'Xung đột', 'Lỗi', 'Bỏ qua'],
    []
  ]);
  const xong = hop.fbmSyncStatusInfoLines(statusGas({ phase: 'done', mode: 'write', scanPack: 'quick' }));
  const dang = hop.fbmSyncStatusInfoLines(statusGas(stateDangChay({ phase: 'pull_activity', entity: 'activity', current: 'CUS-000001' })));
  check(so, 'Thẻ Trạng thái phiên hiện chiều chạy và mức quét theo GAS; dòng Đang xử lý chỉ có khi lượt còn chạy',
    [xong.slice(0, 2), xong.some((dong) => dong.indexOf('Đang xử lý') === 0), dang[0], dang.filter((dong) => dong.indexOf('Đang xử lý') === 0)],
    [['Chiều chạy: Hai chiều', 'Mức quét: Quét nhanh'], false, 'Chiều chạy: FBM → ShinCRM', ['Đang xử lý: Giao dịch CUS-000001']]);
}

async function chay(so) {
  section('FBM sync — Sidebar: màn Chạy đồng bộ');
  try { taoBoGoc(); } catch (error) { return ghiLoiNap(so, 'nạp renderer Sidebar Đồng bộ FBM', error); }
  testNutChay(so);
  testPipelineVaTienDo(so);
  testKhoaOChon(so);
  testMucQuet(so);
  testBangPhamViVaNut(so);
  testDongTrangThai(so);
}

module.exports = { chay };
