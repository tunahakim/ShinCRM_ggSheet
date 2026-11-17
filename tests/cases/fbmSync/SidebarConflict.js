/** Màn xung đột của Sidebar: gom lựa chọn từng trường thành một quyết định gửi GAS, các nhánh GAS trả về (Sheet đổi, bản ghi bận, mở lại, không thấy) và bản ghi cần xem lại. GAS quyết kết quả; Sidebar chỉ gửi lựa chọn, hỏi người dùng khi GAS yêu cầu và vẽ lại. */
const { taoSidebarDongBo, dongBao } = require('../../lib/sidebar/bo-dong-bo');
const { section, check, ghiLoiNap } = require('../../lib/assert');
const { statusGas, stateDangChay } = require('../../lib/fbm/status-gas');

/** Sidebar có status đầu tiên và kho dòng báo thật; popup chung của bản ghi do ca kiểm tự trả lời. */
function taoBo() {
  const bo = taoSidebarDongBo();
  const { hop } = bo;
  hop.fbmSyncPaint = () => undefined;
  return bo;
}

const banGhi = () => ({
  entity: 'customer', id: 'CUS-1', snapshot: { old: { phone: '0901' } },
  fields: [
    { field: 'phone', localField: 'phone', left: '0901', right: '0902', editable: true },
    { field: 'name', localField: 'name', left: 'An', right: 'Ân', editable: false }
  ]
});

function datBanGhi(hop, choices, draft) {
  Object.assign(hop.FBM_SYNC_CLIENT, { conflict: banGhi(), conflictChoices: choices || {}, conflictDraft: draft || {}, conflictInvalid: {}, conflictSheetChanged: {} });
}


async function testQuyetDinh(so) {
  const { hop } = taoBo();
  const item = banGhi();
  const quyet = (choices, draft) => { datBanGhi(hop, choices, draft); return hop.fbmSyncConflictDecision(item); };
  const fbmCa = quyet({ phone: 'fbm', name: 'fbm' }), shinCa = quyet({ phone: 'shin', name: 'shin' }), tron = quyet({ phone: 'shin', name: 'fbm' }), thieu = quyet({ phone: 'fbm' });
  const sua = quyet({ phone: 'shin', name: 'shin' }, { phone: { shin: '0999' } });
  check(so, 'chọn FBM cả bản ghi là phương án FBM nguyên vẹn, không đẩy gì lên FBM',
    [fbmCa.choice, fbmCa.merged, fbmCa.pushes, fbmCa.missing],
    ['fbm', null, false, []]);
  check(so, 'chọn ShinCRM cả bản ghi là phương án ShinCRM và báo sẽ đẩy lên FBM',
    [shinCa.choice, shinCa.merged, shinCa.pushes],
    ['shin', null, true]);
  check(so, 'chọn lẫn hai phía là phương án trộn mang lựa chọn từng trường',
    [tron.choice, tron.merged, tron.pushes],
    ['manual', { phone: { choice: 'shin' }, name: { choice: 'fbm' } }, true]);
  check(so, 'trường chưa chọn được liệt kê, không đoán thay người dùng', thieu.missing, ['name']);
  check(so, 'trường đã sửa tay gửi kèm giá trị tự nhập và đổi cả bản ghi thành phương án trộn',
    [sua.choice, sua.merged.phone, sua.merged.name],
    ['manual', { choice: 'manual', value: '0999' }, { choice: 'shin' }]);
}

async function testChonVaLuu(so) {
  const { hop } = taoBo();
  const goi = [];
  hop.callServer = (name) => { goi.push(name); return Promise.resolve({ ok: true }); };
  datBanGhi(hop, { phone: 'fbm' });
  const nut = { disabled: false };
  hop.fbmSyncSaveConflict(nut);
  check(so, 'Lưu khi còn trường chưa chọn: tô đỏ đúng trường thiếu, không gọi GAS, nút không bị khóa',
    [Object.keys(hop.FBM_SYNC_CLIENT.conflictInvalid), goi, nut.disabled],
    [['name'], [], false]);
  const mucTieu = { id: '', getAttribute: (attr) => ({ 'data-fbm-conflict-pick': 'name', 'data-fbm-conflict-side': 'shin' })[attr] };
  hop.fbmSyncConflictPick(mucTieu);
  check(so, 'chọn một phía của trường thì trường đó hết đỏ và lựa chọn được giữ trong RAM',
    [hop.FBM_SYNC_CLIENT.conflictChoices.name, hop.FBM_SYNC_CLIENT.conflictInvalid.name],
    ['shin', undefined]);
  const oSua = { value: '0777', getAttribute: (attr) => ({ 'data-fbm-conflict-value': 'phone', 'data-fbm-conflict-side': 'fbm' })[attr] };
  hop.fbmSyncConflictEdit(oSua);
  check(so, 'gõ vào ô đang chọn giữ bản sửa theo từng phía, không đổi bản gốc',
    [hop.FBM_SYNC_CLIENT.conflictDraft.phone.fbm, hop.FBM_SYNC_CLIENT.conflict.fields[0].right],
    ['0777', '0902']);
}

async function testGasTraVe(so) {
  const chay = async (result, tuyChon) => {
    const { hop } = taoBo();
    const ghi = { goi: [], mo: 0, status: 0, hoi: [] };
    datBanGhi(hop, { phone: 'shin', name: 'shin' });
    hop.callServer = (name, args) => { ghi.goi.push(name); if (name === 'fbmConfirmConflict') { ghi.args = args; const lan = ghi.goi.filter((n) => n === 'fbmConfirmConflict').length; return Promise.resolve(lan > 1 ? { ok: true, remaining: 0, status: statusGas({ phase: 'idle' }) } : result); } return Promise.resolve({ ok: true }); };
    hop.fbmSyncOpenConflict = () => { ghi.mo += 1; return Promise.resolve(null); };
    hop.fbmSyncStatusOnce = () => { ghi.status += 1; return Promise.resolve(null); };
    hop.recordConflictChoose = (conflicts) => { ghi.hoi.push(['conflict', conflicts.length]); return Promise.resolve((tuyChon && tuyChon.pick) || 'back'); };
    hop.recordBusyChoose = (entity, busy) => { ghi.hoi.push(['busy', entity]); return Promise.resolve((tuyChon && tuyChon.pick) || 'wait'); };
    ghi.loi = await hop.fbmSyncResolveConflict('customer', 'CUS-1', 'shin', null).then(() => null, (error) => error.message);
    ghi.hop = hop;
    return ghi;
  };
  const ok = await chay({ ok: true, remaining: 0, status: statusGas({ phase: 'idle' }) });
  check(so, 'GAS chốt xong và hết xung đột: gửi đủ giá trị FBM, giá trị ShinCRM và ảnh chụp; bỏ bản ghi khỏi màn, không mở thêm',
    [ok.args, ok.mo, ok.hop.FBM_SYNC_CLIENT.conflict, ok.loi],
    [['customer', 'CUS-1', 'shin', null, { phone: '0902', name: 'Ân' }, { phone: '0901', name: 'An' }, { old: { phone: '0901' } }], 0, null, null]);
  const con = await chay({ ok: true, remaining: 2, status: statusGas({ phase: 'idle' }) });
  check(so, 'còn xung đột: mở bản ghi kế tiếp đúng một lần', [con.mo, con.loi], [1, null]);
  const mo = await chay({ ok: false, code: 'CONFLICT_REOPEN', message: 'FBM vừa đổi, mở lại', status: statusGas({ phase: 'idle' }) });
  check(so, 'CONFLICT_REOPEN: bỏ bản ghi cũ, hiện chữ GAS ở dòng báo, mở lại bản ghi (FBM được đọc mới)',
    [mo.mo, dongBao(mo.hop), mo.hop.FBM_SYNC_CLIENT.conflict],
    [1, ['fbmClient:FBM vừa đổi, mở lại'], null]);
  const khong = await chay({ ok: false, code: 'CONFLICT_NOT_FOUND', message: 'Không còn xung đột', status: statusGas({ phase: 'idle' }) });
  check(so, 'CONFLICT_NOT_FOUND đi cùng đường mở lại như CONFLICT_REOPEN',
    [khong.mo, dongBao(khong.hop)],
    [1, ['fbmClient:Không còn xung đột']]);
  const bat = await chay({ ok: false, code: 'CONFLICT_RECORD_BUSY', busy: [{ id: 'CUS-1' }] }, { pick: 'retry' });
  check(so, 'bản ghi bận mà người dùng chọn thử lại: hỏi bằng popup bận chung rồi gọi GAS lần hai cùng lựa chọn',
    [bat.hoi, bat.goi.filter((n) => n === 'fbmConfirmConflict').length > 1],
    [[['busy', 'customer']], true]);
  const hoanBat = await chay({ ok: false, code: 'CONFLICT_RECORD_BUSY', busy: [{ id: 'CUS-1' }] }, { pick: 'wait' });
  check(so, 'bản ghi bận mà người dùng không thử lại: không gọi lại GAS, lựa chọn trên màn còn nguyên',
    [hoanBat.goi.filter((n) => n === 'fbmConfirmConflict').length, hoanBat.hop.FBM_SYNC_CLIENT.conflictChoices],
    [1, { phone: 'shin', name: 'shin' }]);
  const loi = await chay({ ok: false, code: 'CONFLICT_X', message: 'GAS từ chối' });
  check(so, 'GAS từ chối: đọc lại status GAS cho màn khớp nguồn sự thật rồi ném lỗi về nút bấm',
    [loi.status, loi.loi],
    [1, 'GAS từ chối']);
}

async function testSheetDoi(so) {
  const doi = [{ field: 'phone', current: '0555' }];
  const chay = async (pick) => {
    const { hop } = taoBo();
    const ghi = { goi: 0 };
    datBanGhi(hop, { name: 'fbm' });
    hop.callServer = (name) => { if (name === 'fbmConfirmConflict') { ghi.goi += 1; return Promise.resolve(ghi.goi === 1 ? { ok: false, code: 'CONFLICT_SHEET_CHANGED', conflicts: doi } : { ok: true, remaining: 0, status: statusGas({ phase: 'idle' }) }); } return Promise.resolve({ ok: true }); };
    hop.recordConflictChoose = () => Promise.resolve(pick);
    hop.fbmSyncStatusOnce = () => Promise.resolve(null);
    await hop.fbmSyncResolveConflict('customer', 'CUS-1', 'manual', {});
    ghi.hop = hop;
    return ghi;
  };
  const sheet = await chay('sheet'), quayLai = await chay('back'), cuaToi = await chay('mine');
  const f = sheet.hop.FBM_SYNC_CLIENT;
  check(so, 'Sheet đổi và người dùng nhận giá trị trên Sheet: đưa vào phía ShinCRM của ô đổi và chọn nó, ô khác giữ lựa chọn, màn vẫn mở, chỉ một lần gọi GAS',
    [f.conflict.fields[0].left, f.conflictChoices, f.conflict.snapshot.old.phone, sheet.goi], ['0555', { name: 'fbm', phone: 'shin' }, '0555', 1]);
  const g = quayLai.hop.FBM_SYNC_CLIENT;
  check(so, 'Sheet đổi và người dùng quay lại: tô đỏ đúng ô Sheet vừa đổi, không gọi GAS lần hai, mốc vẫn dời',
    [g.conflictSheetChanged, quayLai.goi, g.conflict.snapshot.old.phone],
    [{ phone: true }, 1, '0555']);
  check(so, 'Sheet đổi mà người dùng giữ bản của mình: gửi lại cùng lựa chọn lần hai và bỏ bản ghi khỏi màn',
    [cuaToi.goi, cuaToi.hop.FBM_SYNC_CLIENT.conflict],
    [2, null]);
}

async function testMoBanGhi(so) {
  const chay = async (opened) => {
    const { hop } = taoBo();
    const ghi = { ve: 0, status: 0 };
    hop.fbmSyncPaint = () => { ghi.ve += 1; };
    hop.fbmSyncStatusOnce = () => { ghi.status += 1; return Promise.resolve(null); };
    hop.fbmSyncDrive = () => Promise.resolve(opened);
    ghi.loi = await hop.fbmSyncOpenConflict().then(() => null, (error) => error.message);
    ghi.hop = hop;
    return ghi;
  };
  const co = await chay({ ok: true, conflict: banGhi(), status: statusGas({ phase: 'idle' }) });
  check(so, 'mở được bản ghi: màn Kết quả tab Xung đột hiện bản ghi và vẽ bằng status GAS',
    [co.hop.FBM_SYNC_CLIENT.resultsTab, co.hop.FBM_SYNC_CLIENT.conflict.id, co.ve],
    ['conflict', 'CUS-1', 1]);
  const rong = await chay({ ok: true, empty: true });
  check(so, 'hết xung đột: về tab Tóm tắt và đọc lại status GAS một lần, không vẽ giả',
    [rong.hop.FBM_SYNC_CLIENT.resultsTab, rong.hop.FBM_SYNC_CLIENT.conflict, rong.status, rong.ve],
    ['summary', null, 1, 0]);
  const hong = await chay({ ok: true });
  check(so, 'GAS không trả bản ghi mà cũng không báo hết: lỗi hợp đồng, ghi chú ngay trên màn xung đột',
    [hong.loi !== null, hong.hop.FBM_SYNC_CLIENT.conflictNote.indexOf('Không mở được bản ghi xung đột') === 0],
    [true, true]);
  const tuChoi = await chay({ ok: false, code: 'FBM_TAB_NOT_FOUND', error: 'Không thấy tab FBM' });
  check(so, 'GAS từ chối mở: ném lỗi mang chữ GAS và ghi chú ở màn xung đột để người dùng thấy ngay chỗ đang xem',
    [tuChoi.loi, tuChoi.hop.FBM_SYNC_CLIENT.conflictNote],
    ['Không thấy tab FBM', 'Không mở được bản ghi xung đột: Không thấy tab FBM']);
}

async function testBanGhiLoi(so) {
  const { hop } = taoBo();
  const ve = [];
  hop.callServer = () => Promise.resolve({ ok: true, message: 'Đã mở lại 3 bản ghi lỗi.', status: statusGas({ phase: 'idle' }) });
  hop.fbmSyncPaint = (status) => { ve.push(status.phase); };
  await hop.fbmSyncRetryPushFailures();
  check(so, 'Mở lại bản ghi lỗi: hiện nguyên chữ GAS ở dòng báo và vẽ status GAS trả về',
    [dongBao(hop), ve],
    [['fbmClient:Đã mở lại 3 bản ghi lỗi.'], ['idle']]);
  hop.callServer = () => Promise.resolve({ ok: false, code: 'X', message: 'GAS bận' });
  const loi = await hop.fbmSyncRetryPushFailures().then(() => null, (error) => error.message);
  check(so, 'GAS từ chối mở lại: ném lỗi với chữ GAS cho nút bấm báo, không vẽ status',
    [loi, ve.length],
    ['GAS bận', 1]);
}

async function chay(so) {
  section('FBM sync — Sidebar: xung đột và bản ghi lỗi');
  try { taoSidebarDongBo(); } catch (error) { return ghiLoiNap(so, 'nạp renderer Sidebar Đồng bộ FBM', error); }
  await testQuyetDinh(so);
  await testChonVaLuu(so);
  await testGasTraVe(so);
  await testSheetDoi(so);
  await testMoBanGhi(so);
  await testBanGhiLoi(so);
}

module.exports = { chay };
