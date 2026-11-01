/**
 * Hàm dò DEV: mọi tên trong `DEV_RUNNER_ALLOWED` phải có một dòng trong bảng tài liệu "Hàm dò DEV", và mọi dòng trong bảng phải trỏ tới một hàm có thật ở đúng tệp ghi trong cột Tệp. Thiếu một bên là hàm dò không ai biết để làm gì, hoặc tài liệu bảo chạy một hàm đã xóa.
 *
 * Kèm phép kiểm danh sách bọc của bộ đo thời gian `FbmPerfProbe.js`: tên trong danh sách mà code không còn thì phiên đo ném lỗi trên Google; bắt ở đây để biết trước khi đẩy.
 *
 * Đọc tĩnh: danh sách trắng và danh sách bọc lấy chuỗi trong khai báo mảng, không nạp GAS.
 */

const fs = require('fs');
const path = require('path');
const { stripComments } = require('../lib/strip-comments');
const { GAS_DIR } = require('../lib/load-gas');
const { section, check } = require('../lib/assert');
const { liet } = require('../lib/quet/liet-tep');
const { tenKhaiBao } = require('../lib/quet/khai-bao');
const { bangMd } = require('../lib/quet/bang-md');

const TAI_LIEU = path.join(__dirname, '..', '..', '0_Documentation', 'Phiên code', '2026.11.01 Hàm dò DEV.md');
const DEV_RUNNER = 'server/dev/DevRunner.js';
const FBM_PERF = 'server/dev/FbmPerfProbe.js';
const PROTOCOL = 'fbm_sync/protocol/Protocol.js';

function docGas(tep) { return fs.readFileSync(path.join(GAS_DIR, tep), 'utf8').replace(/\r\n/g, '\n'); }

/** Các chuỗi trong khai báo mảng `var TÊN = [ ... ];` ở cột 0, bỏ chú thích; không có khai báo thì trả `null`. */
function bienMang(code, ten) {
  const khop = new RegExp('^var ' + ten + ' = \\[([\\s\\S]*?)\\];', 'm').exec(code);
  if (!khop) { return null; }
  return [...stripComments(khop[1]).matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

/** Dòng bảng `| Hàm | Tệp | ... |` → `{ ten, tep, dong }`; bỏ dấu `` ` `` quanh tên và tệp. */
function dongHamDo(vanBan) {
  const bo = (o) => o.replace(/^`|`$/g, '');
  const ra = [];
  bangMd(vanBan).filter((b) => b.tieuDe[0] === 'Hàm' && b.tieuDe[1] === 'Tệp').forEach((b) => {
    b.hang.forEach((h) => { ra.push({ ten: bo(h.o[0]), tep: bo(h.o[1]), dong: h.dong }); });
  });
  return ra;
}

/** Đối chiếu danh sách trắng với dòng bảng; `khaiTrong(tep)` trả tên khai báo cột 0 của tệp hoặc `null` khi tệp không có. Trả danh sách lỗi. */
function doiChieu(choPhep, dong, khaiTrong) {
  const loi = [];
  const daGhi = {};
  dong.forEach((d) => {
    if (daGhi[d.ten]) { loi.push(d.ten + ' có hai dòng (dòng ' + daGhi[d.ten] + ' và ' + d.dong + ')'); }
    daGhi[d.ten] = d.dong;
    if (choPhep.indexOf(d.ten) < 0) { loi.push(d.ten + ' (dòng ' + d.dong + ') không có trong DEV_RUNNER_ALLOWED'); }
    const khai = khaiTrong(d.tep);
    if (!khai) { loi.push(d.ten + ' (dòng ' + d.dong + ') trỏ tới tệp không có: ' + d.tep); } else if (khai.indexOf(d.ten) < 0) { loi.push(d.ten + ' (dòng ' + d.dong + ') không được khai báo ở cột 0 trong ' + d.tep); }
  });
  choPhep.forEach((ten) => { if (!daGhi[ten]) { loi.push(ten + ' có trong DEV_RUNNER_ALLOWED mà không có dòng trong bảng Hàm dò DEV'); } });
  return loi;
}

/** Tên trong danh sách bọc của bộ đo mà mã nguồn không còn định nghĩa. */
function tenBocMat(boc, dinhNghia) {
  const mat = [];
  boc.fbm.forEach((t) => { if (!dinhNghia.fbm[t]) { mat.push('FbmSync.' + t); } });
  boc.protocol.forEach((t) => { if (!dinhNghia.protocol[t]) { mat.push('FbmSync.protocol.' + t); } });
  boc.global.forEach((t) => { if (!dinhNghia.global[t]) { mat.push(t); } });
  return mat;
}

/** Định nghĩa có thật trong mã GAS: `FbmSync.X =` ở cột 0, khóa `X: function` của `FbmSync.protocol`, hàm và biến toàn cục. Bỏ tệp của bộ đo vì nó tự gán lại các tên nó bọc. */
function dinhNghiaGas() {
  const ra = { fbm: {}, protocol: {}, global: {} };
  liet('', '.js').filter((t) => t !== FBM_PERF).forEach((tep) => {
    const code = docGas(tep);
    tenKhaiBao(code).forEach((t) => { ra.global[t] = true; });
    code.replace(/^FbmSync\.([A-Za-z_$][\w$]*)\s*=/gm, (_, t) => { ra.fbm[t] = true; });
  });
  docGas(PROTOCOL).replace(/^ {2}([A-Za-z_$][\w$]*):\s*function\b/gm, (_, t) => { ra.protocol[t] = true; });
  return ra;
}

function chay(so) {
  section('Hàm dò DEV — bảng tài liệu khớp DEV_RUNNER_ALLOWED, danh sách bọc đo còn tên');

  const choPhep = bienMang(docGas(DEV_RUNNER), 'DEV_RUNNER_ALLOWED');
  check(so, 'đọc được DEV_RUNNER_ALLOWED', Array.isArray(choPhep) && choPhep.length > 0, true);
  const dong = dongHamDo(fs.readFileSync(TAI_LIEU, 'utf8'));
  check(so, 'bảng Hàm dò DEV có dòng', dong.length > 0, true);
  const khaiTrong = (tep) => (fs.existsSync(path.join(GAS_DIR, tep)) ? tenKhaiBao(docGas(tep)) : null);
  check(so, 'mỗi tên được phép chạy có đúng một dòng, mỗi dòng trỏ tới hàm có thật ở đúng tệp', doiChieu(choPhep || [], dong, khaiTrong), []);

  const thuDong = [{ ten: 'a', tep: 'x.js', dong: 3 }, { ten: 'b', tep: 'y.js', dong: 4 }, { ten: 'c', tep: 'z.js', dong: 5 }, { ten: 'a', tep: 'x.js', dong: 6 }];
  const thuKhai = { 'x.js': ['a'], 'y.js': ['khac'] };
  const loiThu = doiChieu(['a', 'b', 'd'], thuDong, (t) => thuKhai[t] || null).join(' | ');
  check(so, 'tự kiểm đối chiếu: bắt tên thiếu dòng, dòng không được phép, hàm không khai, tệp không có, dòng trùng', [
    /d có trong DEV_RUNNER_ALLOWED mà không có dòng/.test(loiThu), /c \(dòng 5\) không có trong/.test(loiThu), /b \(dòng 4\) không được khai báo/.test(loiThu), /trỏ tới tệp không có: z\.js/.test(loiThu), /a có hai dòng/.test(loiThu)
  ], [true, true, true, true, true]);

  const perf = docGas(FBM_PERF);
  const boc = { fbm: bienMang(perf, 'FBM_PERF_FBM_FUNCTIONS'), protocol: bienMang(perf, 'FBM_PERF_PROTOCOL_FUNCTIONS'), global: (bienMang(perf, 'FBM_PERF_GLOBAL_FUNCTIONS') || []).concat(['documentStoreReal']) };
  check(so, 'đọc được ba danh sách bọc của bộ đo', [Array.isArray(boc.fbm), Array.isArray(boc.protocol)], [true, true]);
  const dinhNghia = dinhNghiaGas();
  check(so, 'danh sách bọc của bộ đo chỉ chứa tên còn định nghĩa trong code', tenBocMat({ fbm: (boc.fbm || []).concat(['orchestrationLock']), protocol: boc.protocol || [], global: boc.global }, dinhNghia), []);
  check(so, 'tự kiểm tên bọc mất: bắt đủ ba loại', tenBocMat({ fbm: ['x'], protocol: ['y'], global: ['z'] }, { fbm: {}, protocol: {}, global: {} }), ['FbmSync.x', 'FbmSync.protocol.y', 'z']);
}

module.exports = { chay };
