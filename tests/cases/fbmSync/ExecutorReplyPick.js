/** Kiểm `replyPick` của executor trong tab FBM: chỉ trả cột GAS cần theo lệnh `keep`, trên response FBM mẫu thật có và không có tiêu đề. */
const fs = require('fs');
const path = require('path');
const { section, check } = require('../../lib/assert');
const { executorNap } = require('../../lib/fbm/tab-nap');

const MAU = path.join(__dirname, '..', '..', '..', '0_Documentation', 'Nghiên cứu FBM', 'RequestFBM');

function mau(ten) {
  const raw = fs.readFileSync(path.join(MAU, ten), 'utf8');
  // Hai tệp mẫu ghi dòng ngăn khác nhau một dấu =; lấy phần sau dòng ngăn có chữ response.
  const text = raw.slice(raw.search(/=+ response =+/)).replace(/^=+ response =+/, '').trim();
  return { text, data: JSON.parse(text).d };
}

async function catCot(so) {
  const coTieuDe = mau('Lấy trang khách hàng có cả tiêu đề.txt'), khongTieuDe = mau('Lấy trang khách hàng không có tiêu đề.txt');
  const names = coTieuDe.data.ViewPage.Fields.map((field) => field.AliasName), ex = executorNap();
  const gui = async (text, keep, ok) => { ex.state.response = { ok: ok !== false, status: ok === false ? 500 : 200, text }; return ex.send(keep === undefined ? {} : { keep }); };

  const theoTen = await gui(coTieuDe.text, { fields: [names[3], names[0], names[1]] }), a = JSON.parse(theoTen.result.body).d;
  check(so, 'Trang có tiêu đề (mẫu thật ~80 KB), cắt theo tên: dòng chỉ còn cột GAS liệt kê theo thứ tự GAS, kèm tên cột gốc; bỏ mô tả cột, bố cục, script; thân nhỏ hẳn và vết ghi reply_picked', [
    Object.keys(a).sort(), JSON.stringify(a.Rows) === JSON.stringify(coTieuDe.data.Rows.map((row) => [row[3], row[0], row[1]])), a.SourceFields, a.TotalRowCount, theoTen.result.body.length < coTieuDe.text.length / 10, theoTen.result.transport.trace.some((item) => item.stage === 'reply_picked')
  ], [['Authorized', 'Rows', 'SourceFields', 'TotalRowCount'], true, names, coTieuDe.data.TotalRowCount, true, true]);

  const thieu = JSON.parse((await gui(coTieuDe.text, { fields: [names[0], 'CotKhongCo'] })).result.body).d;
  check(so, 'Tiêu đề FBM không có cột GAS cần: không trả dòng nào, báo MissingFields đúng tên thiếu để GAS dừng', [thieu.Rows, thieu.MissingFields, thieu.SourceFields], [[], ['CotKhongCo'], names]);

  const theoViTri = JSON.parse((await gui(khongTieuDe.text, { positions: [3, 0, 1], width: names.length })).result.body).d;
  check(so, 'Trang không tiêu đề (mẫu thật), cắt theo vị trí GAS tính: dòng chỉ còn ba cột theo thứ tự, không có SourceFields', [
    Object.keys(theoViTri).sort(), JSON.stringify(theoViTri.Rows) === JSON.stringify(khongTieuDe.data.Rows.map((row) => [row[3], row[0], row[1]]))
  ], [['Authorized', 'Rows', 'TotalRowCount'], true]);

  const lech = JSON.parse((await gui(khongTieuDe.text, { positions: [3, 0, 1], width: names.length + 1 })).result.body).d;
  const theoTenKhongTieuDe = JSON.parse((await gui(khongTieuDe.text, { fields: [names[0]] })).result.body).d;
  check(so, 'Dòng lệch số cột gốc GAS gửi thì không trả dòng mà báo ShapeMismatch; cắt theo tên mà FBM không trả tiêu đề thì báo thiếu cột, không đoán vị trí', [lech.Rows, lech.ShapeMismatch, theoTenKhongTieuDe.Rows, theoTenKhongTieuDe.MissingFields], [[], { width: names.length + 1 }, [], [names[0]]]);

  const tong = JSON.parse((await gui(khongTieuDe.text, { fields: [] })).result.body).d;
  check(so, 'Không cần cột nào (đếm khách): chỉ còn tổng, mỗi dòng rỗng, không đòi tiêu đề', [tong.TotalRowCount, tong.Rows.every((row) => row.length === 0), tong.MissingFields], [khongTieuDe.data.TotalRowCount, true, undefined]);

  const chuaDangNhap = JSON.parse((await gui('{"d":{"Authorized":false,"Rows":[],"TotalRowCount":0}}', { fields: [names[0]] })).result.body).d;
  check(so, 'FBM báo chưa đăng nhập (Authorized:false, lưới rỗng): vẫn giữ Authorized:false và Rows rỗng để cổng phiên của GAS nhận ra', [chuaDangNhap.Authorized, chuaDangNhap.Rows], [false, []]);

  const login = '<html><body><form action="Login.aspx"><input name="txtUser"></form></body></html>', vo = '{"d":{"Rows":"khong-phai-mang","Authorized":false}}';
  ex.state.response = { ok: true, status: 200, text: login, contentType: 'text/html' };
  const loginReply = await ex.send({ keep: { fields: [names[0]] } });
  check(so, 'Không phải lưới thì đi nguyên về GAS: trang đăng nhập, lưới mang HTTP 500, request không có keep, JSON không có mảng Rows', [
    loginReply.result.body === login, loginReply.result.transport.trace.some((item) => item.stage === 'reply_picked'),
    (await gui(coTieuDe.text, { fields: [names[0]] }, false)).result.body === coTieuDe.text, (await gui(coTieuDe.text)).result.body === coTieuDe.text, (await gui(vo, { fields: [names[0]] })).result.body === vo
  ], [true, false, true, true, true]);
}

async function chay(so) {
  section('FBM sync — executor cắt cột trả về');
  await catCot(so);
}

module.exports = { chay };
