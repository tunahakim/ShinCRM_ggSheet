const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check, ghiLoiNap } = require('../lib/assert');

const WATCHER_FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'model', 'bind_watcher.js');

/** XHR giả: `responseText` lớn dần như kênh đẩy thật; `day()` bơm thêm khung rồi bắn `progress`. */
function napWatcher() {
  const posted = [];
  const facts = [];
  function FakeXHR() { this.listeners = {}; this.responseText = ''; this.readyState = 0; this.sent = false; }
  FakeXHR.prototype.open = function () { this.opened = true; };
  FakeXHR.prototype.send = function () { this.sent = true; };
  FakeXHR.prototype.addEventListener = function (name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); };
  FakeXHR.prototype.fire = function (name) { (this.listeners[name] || []).forEach((fn) => fn()); };
  FakeXHR.prototype.day = function (frame) { this.responseText += frame; this.readyState = 3; this.fire('progress'); };
  const hop = {
    location: { origin: 'https://docs.google.com' },
    window: null
  };
  hop.window = { XMLHttpRequest: FakeXHR, postMessage: (data, origin) => { posted.push({ kind: data.kind, source: data.source, action: data.action, origin }); facts.push({ kind: data.kind, sameSession: data.sameSession, firstChunk: data.firstChunk, hasChange: data.hasChange }); } };
  vm.createContext(hop);
  vm.runInContext(fs.readFileSync(WATCHER_FILE, 'utf8'), hop, { filename: WATCHER_FILE });
  return { FakeXHR, posted, facts, hop };
}

function moKenh(w, method, url) {
  const xhr = new w.FakeXHR();
  xhr.open(method || 'GET', url || '/spreadsheets/d/abc/bind?VER=8&RID=rpc&TYPE=xmlhttp');
  xhr.send();
  return xhr;
}

async function chay(so) {
  section('Extension nghe kênh /bind của Google Sheets');
  let w;
  try { w = napWatcher(); } catch (err) { return ghiLoiNap(so, 'nạp bind_watcher.js', err); }

  const xhr = moKenh(w);
  check(so, 'mở kênh GET /bind báo open đúng nguồn, gửi về chính origin trang',
    w.posted, [{ kind: 'open', source: 'SHINCRM_EXTENSION', action: 'CRM_BIND_EVENT', origin: 'https://docs.google.com' }]);
  check(so, 'vẫn gọi send gốc', xhr.sent, true);

  const ca = (frame) => { w.posted.length = 0; xhr.day(frame); return w.posted.map((item) => item.kind); };
  check(so, 'khung noop là nhịp sống', ca('12\n[[5,["noop"]]]\n'), ['alive']);
  check(so, 'loại 10 (con trỏ người khác) là nhịp sống', ca('40\n[[6,[[10,1760000000000,"abc",[1,2]]]]]\n'), ['alive']);
  check(so, 'loại 14 (hiện diện) là nhịp sống', ca('40\n[[7,[[14,1760000000001,"abc",{}]]]]\n'), ['alive']);
  check(so, 'loại 0 mang khóa "c" (nội dung ô) là tín hiệu', ca('60\n[[8,[[0,1760000000002,{"c":[["A1","x"]]}]]]]\n'), ['signal']);
  check(so, 'khóa "c" (nội dung ô) thắng mọi loại: khung loại 10 mang "c" vẫn là tín hiệu', ca('60\n[[16,[[10,1760000000011,{"c":[["A1","x"]]}]]]]\n'), ['signal']);
  check(so, 'loại 1 là tín hiệu', ca('40\n[[9,[[1,1760000000003,"abc"]]]]\n'), ['signal']);
  check(so, 'loại lạ 99 là tín hiệu', ca('40\n[[10,[[99,1760000000004,"abc"]]]]\n'), ['signal']);
  check(so, 'khung nhiễu lẫn khung loại lạ trong cùng gói là tín hiệu', ca('[[11,[[10,1760000000005,"a"]]],[12,[[1,1760000000006,"b"]]]]'), ['signal']);
  check(so, 'khung cắt dở không nhận dạng được là tín hiệu', ca('35\n[[13,[[0,17600'), ['signal']);
  check(so, 'khung tiếng Việt nhiều byte vẫn nhận đúng loại, không lệch con trỏ',
    [ca('80\n[[14,[[0,1760000000007,{"c":[["B2","Công ty Thép Việt Nhật — Hà Nội"]]}]]]]\n'), ca('12\n[[15,["noop"]]]\n')], [['signal'], ['alive']]);

  w.posted.length = 0;
  xhr.readyState = 3; xhr.fire('readystatechange'); xhr.fire('progress'); xhr.fire('load');
  check(so, 'con trỏ đã đọc: sự kiện lặp không có dữ liệu mới thì không báo lại', w.posted.length, 0);

  w.posted.length = 0;
  const post = moKenh(w, 'POST', '/spreadsheets/d/abc/bind?VER=8&RID=1');
  post.day('[[0,[[1,1760000000008,"x"]]]]');
  const khac = moKenh(w, 'GET', '/spreadsheets/d/abc/edit?gid=0');
  khac.day('[[0,[[1,1760000000009,"x"]]]]');
  const binder = moKenh(w, 'GET', '/spreadsheets/d/abc/binder');
  binder.day('[[0,[[1,1760000000010,"x"]]]]');
  check(so, 'POST /bind (gửi lên) và URL khác đều bị bỏ qua', w.posted.length, 0);

  const n = napWatcher();
  const dau = moKenh(n, 'GET', '/spreadsheets/d/abc/bind?VER=8&SID=AAA&RID=rpc&TYPE=xmlhttp');
  dau.day('12\n[[1,["noop"]]]\n');
  dau.day('60\n[[2,[[0,1760000000002,{"c":[["A1","x"]]}]]]]\n');
  check(so, 'kênh đầu tiên: sameSession false; khung đầu và khung mang "c" có đánh dấu firstChunk/hasChange đúng',
    n.facts, [{ kind: 'open', sameSession: false, firstChunk: undefined, hasChange: undefined }, { kind: 'alive', sameSession: undefined, firstChunk: true, hasChange: false }, { kind: 'signal', sameSession: undefined, firstChunk: false, hasChange: true }]);
  n.facts.length = 0;
  const noiLai = moKenh(n, 'GET', '/spreadsheets/d/abc/bind?VER=8&SID=AAA&RID=rpc&TYPE=xmlhttp');
  noiLai.day('40\n[[3,[[1,1760000000003,"abc"]]]]\n');
  check(so, 'kênh mới cùng SID dù kênh cũ chưa kết thúc: báo sameSession true; khung đầu loại 1 là tín hiệu mang firstChunk, không mang thay đổi',
    n.facts, [{ kind: 'open', sameSession: true, firstChunk: undefined, hasChange: undefined }, { kind: 'signal', sameSession: undefined, firstChunk: true, hasChange: false }]);
  n.facts.length = 0;
  moKenh(n, 'GET', '/spreadsheets/d/abc/bind?VER=8&SID=BBB&RID=rpc&TYPE=xmlhttp');
  moKenh(n);
  check(so, 'SID khác hoặc không có SID thì sameSession false', n.facts.map((f) => f.sameSession), [false, false]);

  const lai = w.FakeXHR.prototype.send;
  vm.runInContext(fs.readFileSync(WATCHER_FILE, 'utf8'), w.hop, { filename: WATCHER_FILE });
  check(so, 'nạp lại tệp không vá chồng lần hai', w.FakeXHR.prototype.send === lai, true);
}

module.exports = { chay };
