/**
 * Test chốt K8: mật khẩu và mọi bản băm của nó chỉ rời Extension trong request gửi FBM. Chạy trọn lượt Đăng nhập thử và lượt tự đăng nhập khi phiên hết qua GAS thật, worker thật và executor thật; soi mọi câu GAS trả worker, mọi thân worker nộp GAS, mọi dòng Log, mọi giá trị DocumentProperties, `statusView` và kho `chrome.storage`.
 * Test không rỗng: FBM giả phải nhận đúng hash Login và tab phải có đúng khóa trang, nghĩa là đường mật khẩu đã chạy thật.
 */
const { section, check } = require('../../lib/assert');
const { chuoiDangNhap } = require('../../lib/fbm/chuoi-dang-nhap');

const MAT_KHAU = 'K8-mat-khau-gia-7f3a';

/** `kind` là loại lượt mở: `login_test` (Đăng nhập thử) hoặc `identity_probe` với FBM báo hết phiên ở lần hỏi đầu, buộc GAS tự đăng nhập. */
async function luotDangNhap(kind, loginReply) {
  const c = chuoiDangNhap({ password: MAT_KHAU, loginReply, hetPhien: kind === 'identity_probe' }), F = c.gas.hop.FbmSync;
  const ma = await c.sendWorker({ type: 'FBM_ENCRYPT_CREDENTIALS', credentials: { username: 'k8user', password: MAT_KHAU } });
  const luu = F.controlDispatch('save_credential', { binding: { spreadsheetId: c.SHEET, userId: '2037', username: 'k8user', accountName: 'K8 Demo' }, credential: { mode: 'save', credentialRef: ma.credentialRef, envelope: ma.envelope, public: ma.public } }, 'sidebar');
  const mo = F.controlDispatch('start', { kind, machineId: c.MAY }, 'sidebar');
  await c.chayLuot();
  return { c, F, ma, luu, mo };
}

/** Mọi chỗ ngoài request gửi FBM, dạng chữ để dò chuỗi bí mật. */
function choSoi(l) {
  const kho = l.c.gas.documentProperties.data;
  return {
    'câu GAS trả worker': JSON.stringify(l.c.gasReplies),
    'thân worker nộp GAS': JSON.stringify(l.c.worker.st.bodies),
    'Log': JSON.stringify(l.c.logs),
    'DocumentProperties': JSON.stringify(Object.keys(kho).map((k) => [k, kho[k]])),
    'statusView': JSON.stringify(l.F.statusView()),
    'chrome.storage': JSON.stringify(l.c.worker.st.storage),
    'kết quả lệnh lưu và mở lượt': JSON.stringify([l.luu, l.mo])
  };
}

function biMat(l) {
  const f = l.c.fbm, md5 = l.c.md5;
  return { 'mật khẩu': MAT_KHAU, 'md5(mật khẩu)': md5(MAT_KHAU), 'hash Login': f.loginHash, 'khóa trang': f.pageKey };
}

function lo(l) {
  const out = [], cho = choSoi(l), bi = biMat(l);
  Object.keys(cho).forEach((noi) => Object.keys(bi).forEach((ten) => { if (cho[noi].indexOf(bi[ten]) >= 0) { out.push(ten + ' lộ ở ' + noi); } }));
  return out;
}

async function chay(so) {
  section('FBM sync — K8: mật khẩu và bản băm chỉ có trong request gửi FBM');
  const ok = await luotDangNhap('login_test');
  const loginPost = ok.c.fbm.requests.find((r) => r.path === '/Main/Login.aspx/Login');
  const cuoi = ok.c.gasReplies[ok.c.gasReplies.length - 1] || {};
  check(so, 'đường mật khẩu đã chạy thật: FBM nhận đúng hash Login, tab FBM có đúng khóa trang, lượt kết thúc LOGIN_OK', [
    !!loginPost && JSON.parse(loginPost.body).password === ok.c.fbm.loginHash, ok.c.tab.localStore['k\u0000'] === ok.c.fbm.pageKey, cuoi.code
  ], [true, true, 'LOGIN_OK']);
  check(so, 'Đăng nhập thử thành công: không chỗ nào ngoài request gửi FBM chứa mật khẩu, md5 mật khẩu, hash Login hay khóa trang', lo(ok), []);
  const tu = await luotDangNhap('identity_probe'), cuoiTu = tu.c.gasReplies[tu.c.gasReplies.length - 1] || {};
  check(so, 'tự đăng nhập khi phiên hết: FBM nhận Login, lượt hỏi danh tính kết thúc đúng, không chỗ nào chứa mật khẩu hay bản băm', [
    tu.c.fbm.requests.filter((r) => r.path === '/Main/Login.aspx/Login').length, cuoiTu.ok, lo(tu)
  ], [1, true, []]);
  const sai = await luotDangNhap('login_test', '{"d":false}');
  check(so, 'FBM báo sai mật khẩu: GAS đóng lượt và vẫn không chỗ nào chứa mật khẩu hay bản băm', [
    sai.c.fbm.requests.some((r) => r.path === '/Main/Login.aspx/Login'), lo(sai)
  ], [true, []]);
}

module.exports = { chay };
