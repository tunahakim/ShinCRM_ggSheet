/** Kiểm `replyPick` của executor trong tab FBM: chỉ giữ cột request cần, trên response FBM mẫu thật. */
const fs = require('fs');
const path = require('path');
const { section, check } = require('../../lib/assert');
const { executorNap } = require('../../lib/fbm/tab-nap');

const SAMPLE_FILE = path.join(__dirname, '..', '..', '..', '0_Documentation', 'Nghiên cứu FBM', 'RequestFBM', 'Lấy trang khách hàng có cả tiêu đề.txt');

async function chonCot(so) {
  const raw = fs.readFileSync(SAMPLE_FILE, 'utf8');
  const sampleText = raw.slice(raw.indexOf('====== response ========') + '====== response ========'.length).trim();
  const sample = JSON.parse(sampleText).d;
  const names = sample.ViewPage.Fields.map((field) => field.AliasName);
  const keep = { fields: [names[3], names[0], 'CotKhongCo', names[1]] };
  const ex = executorNap();
  ex.state.response = { ok: true, status: 200, text: sampleText };
  const reply = await ex.send({ keep });
  const picked = JSON.parse(reply.result.body).d;
  const mong = sample.Rows.map((row) => [row[3], row[0], row[1]]);
  check(so, 'replyPick trên mẫu lưới khách hàng thật (~80 KB): giữ đúng cột GAS liệt kê theo thứ tự GAS, bỏ cột FBM không có, đủ mọi dòng, giữ TotalRowCount, thân nhỏ hẳn và vết ghi reply_picked', [
    picked.ViewPage.Fields.map((field) => field.AliasName), picked.Rows.length === sample.Rows.length, JSON.stringify(picked.Rows) === JSON.stringify(mong), picked.TotalRowCount, Object.keys(picked).sort(), reply.result.body.length < sampleText.length / 3, reply.result.transport.trace.some((item) => item.stage === 'reply_picked')
  ], [[names[3], names[0], names[1]], true, true, sample.TotalRowCount, ['Rows', 'TotalRowCount', 'ViewPage'], true, true]);

  const login = '<html><body><form action="Login.aspx"><input name="txtUser"></form></body></html>';
  ex.state.response = { ok: true, status: 200, text: login, contentType: 'text/html' };
  const loginReply = await ex.send({ keep });
  ex.state.response = { ok: false, status: 500, text: sampleText };
  const loiReply = await ex.send({ keep });
  ex.state.response = { ok: true, status: 200, text: sampleText };
  const khongKeep = await ex.send({});
  const vo = '{"d":{"Rows":"khong-phai-mang","ViewPage":{}}}';
  ex.state.response = { ok: true, status: 200, text: vo };
  const voReply = await ex.send({ keep });
  check(so, 'Không phải lưới thì đi nguyên về GAS: trang đăng nhập, lưới mang HTTP 500, request không có keep, JSON lưới hỏng dạng', [
    loginReply.result.body === login, loginReply.result.transport.trace.some((item) => item.stage === 'reply_picked'), loiReply.result.body === sampleText, khongKeep.result.body === sampleText, voReply.result.body === vo
  ], [true, false, true, true, true]);
}

async function chay(so) {
  section('FBM sync — executor chọn cột trả về');
  await chonCot(so);
}

module.exports = { chay };
