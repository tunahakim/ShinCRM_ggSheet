/** Kiểm tra protocol, fingerprint và đối soát ba chiều. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");

async function chay(so) {
  section("FBM sync — protocol và fingerprint");
  // Fixture chỉ chạy offline; không gửi request hoặc ghi dữ liệu FBM thật.
  section('FBM sync - protocol, fingerprint va ba chieu');
  const hop = taoHopCat({ FbmSync: {} });
  napServer(hop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Identity.js');

  const parsed = hop.FbmSync.protocol.parse('{"d":{"Bugs":{"FieldName":"x","Message":"bad"}}}');
  check(so, 'body Login.aspx voi HTTP 200 bi nhan la het phien', hop.FbmSync.protocol.isSessionExpired({ ok: true, status: 200, body: '<html><form action="Login.aspx"><input name="username"></form></html>' }), true);
  check(so, 'loi nghiep vu khong retry tu dong', hop.FbmSync.protocol.classifyFailure({ ok: true, status: 200, body: '{"d":{"Bugs":{"Message":"Sai du lieu"}}}' }).retryable, false);
  check(so, 'loi HTTP co the retry', hop.FbmSync.protocol.classifyFailure({ ok: false, status: 503, body: '' }).retryable, true);
  check(so, 'SYNC_STATUS co du 11 gia tri hop dong', Object.keys(hop.FbmSync.SYNC_STATUS).length, 11);
  check(so, 'parse response FBM va doc Bugs', parsed.d.Bugs.Message, 'bad');
  check(so, 'Bugs khong bi coi la thanh cong', hop.FbmSync.protocol.assertSuccess(parsed).ok, false);
  check(so, 'response hong JSON bi chan', hop.FbmSync.protocol.assertSuccess('{not-json}').ok, false);
  const httpError = hop.FbmSync.protocol.parse({ ok: false, status: 401, body: '', transport: { payloadCookie: 'cookie-1' } });
  check(so, 'HTTP error van giu transport cookie', httpError._transport.payloadCookie, 'cookie-1');
  const httpBug = hop.FbmSync.protocol.parse({ ok: false, status: 500, body: '{"d":{"Bugs":{"Message":"Sai tham so"}}}' });
  check(so, 'HTTP error giu chi tiet Bugs tu FBM', httpBug.Bugs.Message, 'HTTP 500: Sai tham so');

  const fbm = { stt_rec_kh: 'A1', ma_kh: 'ALT00010', ten_kh: 'Test', ma_so_thue: '001', ong_ba: 'A', dien_thoai: '0123', email: '', dc_lh: 'HN', dc_lh_tinh: 'HNI', nguon_dm: 'X', ghi_chu: 'a\r\nb' };
  const same = hop.FbmSync.customerRecord(fbm);
  const local = Object.assign({}, same, { id: 'CUS-1' });
  check(so, 'hash FBM va local dung cung khong gian', hop.FbmSync.hash(fbm, 'customer'), hop.FbmSync.hash(local, 'customer'));
  check(so, 'doi dinh danh FBM khong bi coi la doi noi dung Customer', hop.FbmSync.hash(Object.assign({}, fbm, { stt_rec_kh: 'A2', ma_kh: 'ALT00011' }), 'customer'), hop.FbmSync.hash(fbm, 'customer'));
  check(so, 'ba chieu khong doi', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, local, same, 'customer').unchanged, true);
  check(so, 'ba chieu bat conflict hai phia', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, Object.assign({}, local, { companyName: 'shin' }), Object.assign({}, same, { companyName: 'fbm' }), 'customer').conflict, true);
  check(so, 'chi Shin thay doi', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, Object.assign({}, local, { companyName: 'shin' }), same, 'customer').shinChanged, true);
  check(so, 'chi FBM thay doi', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, local, Object.assign({}, same, { companyName: 'fbm' }), 'customer').fbmChanged, true);
  check(so, 'parse malformed tra loi co cau truc', !!hop.FbmSync.protocol.parse('{').parseError, true);
}

module.exports = { chay };
