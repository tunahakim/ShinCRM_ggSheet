/** Bộ dựng status cho Sidebar: mọi quyết định hiển thị (tone, nút, tiến độ, cảnh báo, câu kiểm liên kết, phạm vi, username) GAS dựng sẵn; Sidebar chỉ vẽ. */
const fs = require('fs');
const path = require('path');
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

const GOC = path.join(__dirname, '..', '..', '..', '1_ShinCRM_GAS');
const TRUONG = ['running', 'tone', 'actions', 'progress', 'pendingApproval', 'warnings', 'issues', 'pipeline', 'usernameDisplay', 'usernameMismatch', 'identityResult', 'scopeNotice'];

async function chay(so) {
  section('Bộ dựng status cho Sidebar');
  const { hop } = workflowGas();
  const F = hop.FbmSync;
  const goc = F.statusInputRead();
  const dung = (state, them) => F.statusViewBuild(Object.assign({}, goc, { enabled: true, state: Object.assign({}, goc.state, state) }, them || {}));
  const dangChay = { runId: 'r-1', phase: 'pull_customer', origin: 'manual', updatedAt: goc.now, activeRequestId: 'q-1', deadlineAt: goc.now + 60000, progress: { total: 4, done: 1 } };

  const nghi = dung({ phase: 'idle' });
  check(so, 'mọi status có đủ trường hợp đồng, pipeline luôn có và luôn hiện', [TRUONG.filter((k) => !(k in nghi)), nghi.pipeline.visible, nghi.tone, nghi.actions.run], [[], true, 'idle', 'start']);
  check(so, 'tắt công tắc tổng: tone off, nút chạy khóa', [dung({ phase: 'idle' }, { enabled: false }).tone, dung({ phase: 'idle' }, { enabled: false }).actions.runDisabled], ['off', true]);
  const tay = dung(dangChay);
  check(so, 'lượt tay đang chạy: nút Hủy, khóa nút khác, tiến độ có phần trăm',
    [tay.running, tay.tone, tay.actions.run, tay.actions.busy, tay.progress.active, tay.progress.percent], [true, 'running', 'cancel', true, true, 25]);
  const nen = dung(Object.assign({}, dangChay, { origin: 'background' }));
  check(so, 'lượt nền đang chạy: nút vẫn là Bắt đầu, không khóa sửa', [nen.running, nen.actions.run, nen.actions.busy], [true, 'start', false]);
  const co = { runId: 'r-1', verdict: 'cancelled' };
  check(so, 'đã bấm dừng: lượt tay thành Đang dừng, lượt nền thành Đang dừng nền, nút chạy khóa',
    [dung(dangChay, { stopFlag: co }).actions.run, dung(Object.assign({}, dangChay, { origin: 'background' }), { stopFlag: co }).actions.run, dung(dangChay, { stopFlag: co }).actions.runDisabled, dung(dangChay, { stopFlag: { runId: 'khac', verdict: 'cancelled' } }).actions.run],
    ['stopping', 'stoppingBackground', true, 'cancel']);
  check(so, 'lượt lỗi, tạm dừng và xung đột có tone riêng', [dung({ phase: 'error' }).tone, dung({ phase: 'paused' }).tone, dung({ phase: 'conflict' }).tone], ['error', 'paused', 'paused']);
  const cho = { status: 'pending', count: 3, fingerprint: 'dau-1' };
  check(so, 'tập đẩy chờ duyệt: nút Duyệt chỉ mở khi không có lượt chạy',
    [dung({ phase: 'paused' }, { gate: cho }).pendingApproval, dung({ phase: 'paused' }, { gate: cho }).actions.approve, dung(dangChay, { gate: cho }).actions.approve],
    [{ count: 3, fingerprint: 'dau-1' }, true, false]);
  check(so, 'nút đăng nhập ép chỉ mở khi GAS mời và không có lượt chạy', [dung({ phase: 'paused', loginForceOffered: true }).actions.forceLogin, dung(Object.assign({ loginForceOffered: true }, dangChay)).actions.forceLogin], [true, false]);
  const kiem = (state) => dung(Object.assign({ scan: 'identity_check' }, state)).identityResult;
  check(so, 'kiểm liên kết: câu chờ, câu thiếu, câu đủ, câu lỗi do GAS dựng; lượt khác không có câu',
    [kiem(dangChay).tone, kiem({ phase: 'done', metadata: { identityCheck: { total: 3, matched: 2, missing: 1 } } }).text, kiem({ phase: 'done', metadata: { identityCheck: { total: 2, matched: 2, missing: 0 } } }).tone, kiem({ phase: 'error', lastError: 'mất phiên' }).text, dung({ phase: 'done' }).identityResult],
    ['pending', 'Kiểm tra liên kết hoàn tất: 2/3 Customer hợp lệ; không tìm thấy: 1.', 'success', 'Kiểm tra liên kết không thành công: mất phiên', null]);
  const phamVi = (run) => dung({ phase: 'idle' }, { run }).scopeNotice;
  check(so, 'phạm vi giới hạn: câu có mã khách, danh sách trống thì câu chặn, không giới hạn thì không có',
    [phamVi({ scopeLimited: true, scopeCodes: ['ALT00010'] }).text.indexOf('ALT00010') > 0, phamVi({ scopeLimited: true, scopeCodes: [] }).text === F.SCOPE_NOTICE_TEXT.empty, phamVi({ scopeLimited: false, scopeCodes: ['ALT00010'] })],
    [true, true, null]);
  const ten = (hint, bound) => dung({ phase: 'idle' }, { login: { configured: true, public: { usernameHint: hint } }, binding: { username: bound } });
  check(so, 'username: lệch khi hai tên đọc được và khác nhau; tên che dấu thì báo không đọc được, không báo lệch',
    [ten('anhlt', 'khac').usernameMismatch, ten('anhlt', 'anhlt').usernameMismatch, ten('an***', 'khac').usernameMismatch, ten('an***', 'khac').usernameDisplay.unavailable, ten('anhlt', '').usernameDisplay],
    [true, false, false, true, { text: 'anhlt', unavailable: false }]);
  const chet = dung(Object.assign({}, dangChay, { activeRequestId: '', deadlineAt: 0, updatedAt: goc.now - F.STALE_RUN_MS - 1000 }));
  check(so, 'lượt chết: cảnh báo kèm mã và chữ hướng dẫn', [chet.warnings.length, chet.warnings[0].code, /Bấm Đồng bộ/.test(chet.warnings[0].text)], [1, 'SYNC_STALE_RUN', true]);
  check(so, 'lượt chết có tone lỗi (không còn ai chở lượt nên không có tin nào làm icon ⟳ thôi xoay); bản nhẹ lúc mở Sidebar quyết tone cùng một hàm',
    [chet.tone, F.toneOf(Object.assign({}, goc.state, dangChay, { activeRequestId: '', deadlineAt: 0, updatedAt: goc.now - F.STALE_RUN_MS - 1000 }), true, goc.now), F.toneOf(Object.assign({}, goc.state, dangChay), true, goc.now), F.toneOf(Object.assign({}, goc.state, dangChay), false, goc.now)],
    ['error', 'error', 'running', 'off']);
  check(so, 'khách bị chặn khi kéo về thành issue có chữ', dung({ phase: 'done', metadata: { identityBlocks: [{ fbmCustomerCode: 'ALT00010', reason: 'trùng mã' }] } }).issues,
    [{ code: 'IDENTITY_BLOCKED', level: 'warning', text: 'Khách FBM ALT00010 bị chặn khi kéo về: trùng mã' }]);
  const tongHop = F.statusMetadata({ identityCheck: { total: 3, matched: 2, missing: 1, missingSample: [{ fbmId: 'FBM-3' }] } }, { hashes: {}, details: {} });
  check(so, 'metadata Sidebar giữ tổng hợp kiểm tra liên kết n/N', [tongHop.identityCheck.total, tongHop.identityCheck.missingSample[0].fbmId], [3, 'FBM-3']);

  const lenh = (ten) => F.controlDispatch(ten, {}, 'sidebar');
  check(so, 'cửa lệnh gắn status đủ trường cho mọi lệnh thường, lệnh `view: false` không gắn',
    [['cancel', 'reset_state', 'retry_push_failures'].map((ten) => TRUONG.filter((k) => !(k in (lenh(ten).status || {})))), 'status' in lenh('trace_read'), Object.keys(F.COMMANDS).filter((ten) => F.COMMANDS[ten].view === false).sort()],
    [[[], [], []], false, ['relay_config', 'relay_rotate_key', 'relay_switch_log', 'status', 'trace_read']]);

  F.stateRead = () => { throw new Error('bộ dựng không được đọc kho'); };
  check(so, 'bộ dựng thuần: cùng đầu vào cho cùng kết quả, không đọc kho', JSON.stringify(dung(dangChay)) === JSON.stringify(tay), true);

  const nguon = (tep) => fs.readFileSync(path.join(GOC, tep), 'utf8');
  const goiStatus = ['fbm_sync', 'server'].flatMap((thuMuc) => fs.readdirSync(path.join(GOC, thuMuc), { recursive: true }).filter((tep) => /\.js$/.test(tep)).map((tep) => path.join(thuMuc, tep).replace(/\\/g, '/')))
    .filter((tep) => /FbmSync\.statusView\(/.test(nguon(tep)));
  check(so, 'chỉ cửa lệnh gọi statusView; công cụ không tự gắn status', goiStatus.sort(), ['fbm_sync/control/ControlPort.js']);
}

module.exports = { chay };
