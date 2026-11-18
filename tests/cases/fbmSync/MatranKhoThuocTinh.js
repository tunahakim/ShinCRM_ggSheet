/** Ma trận kho DocumentProperties (FBM-025/026/028): JSON hỏng hoặc dịch vụ lỗi phải ném lỗi có mã, không coi như "chưa có" rồi ghi đè, và thông báo không lộ bí mật. */
const { section, check } = require('../../lib/assert');
const { datCongTac } = require('../../lib/fbm/cai-dat-thu');
const { napServer } = require('../../lib/load-gas');
const { makeSync } = require('../../lib/fbm/hang-day');

async function chay(so) {
  section('FBM sync — ma trận kho thuộc tính hỏng hoặc lỗi');
  const thrownCode = (work) => { try { work(); return 'không ném'; } catch (error) { return String(error && error.code || ''); } };
  const dp = makeSync(), DP = dp.hop.FbmSync, dpData = dp.documentProperties.data;
  napServer(dp.hop, 'fbm_sync/auth/LoginStores.js', 'fbm_sync/auth/LoginTools.js', 'fbm_sync/auth/AutoLogin.js', 'fbm_sync/auth/LoginRun.js');
  const dpStart = DP.runOpen({ phase: 'pull_customer' }); dpStart.cursor = { pageIndex: 7 }; DP.stateWrite(dpStart);
  dpData.FBM_SYNC_STATE_V1 = '{"runId":"r1","cursor":{"pageIndex":7'; // JSON đứt giữa chừng
  const corruptStateRaw = dpData.FBM_SYNC_STATE_V1;
  dp.logs.length = 0;
  const corruptSliceCode = thrownCode(() => DP.runSlice(() => DP.stateRead()));
  const corruptLog = dp.logs.find((event) => event.action === 'state_fail_run');
  check(so, 'FBM-025: state đồng bộ JSON hỏng thì lát ném DOCUMENT_PROPERTY_CORRUPT, Log có dòng lỗi và state hỏng giữ nguyên để khôi phục, không bị đè bằng state rỗng',
    [corruptSliceCode, !!corruptLog && /DocumentProperties/.test(String(corruptLog.reason)), dpData.FBM_SYNC_STATE_V1 === corruptStateRaw],
    ['DOCUMENT_PROPERTY_CORRUPT', true, true]);

  const dpPending = makeSync(), PP = dpPending.hop.FbmSync, ppData = dpPending.documentProperties.data;
  const ppStart = PP.runOpen({ phase: 'push' }); ppStart.mode = 'write'; PP.stateWrite(ppStart);
  ppData.FBM_SYNC_PUSH_FAILURES_V1 = '["không phải object"]';
  const pendingSliceCode = thrownCode(() => PP.runSlice(() => PP.pushFailureAdd('customer:CUS-000001', 'mới', { code: 'FBM_ERROR', reason: 'x' })));
  const ppState = PP.stateRead();
  check(so, 'FBM-026: sổ lỗi đẩy hỏng thì không ghi đè bằng bản chỉ có một mục mới; phiên chuyển lỗi có mã để Sidebar hiện',
    [pendingSliceCode, ppData.FBM_SYNC_PUSH_FAILURES_V1, ppState.phase, ppState.lastFailureCode, /bản ghi đẩy lỗi/.test(ppState.lastError)],
    ['DOCUMENT_PROPERTY_CORRUPT', '["không phải object"]', 'error', 'DOCUMENT_PROPERTY_CORRUPT', true]);

  const dpDown = makeSync(), DD = dpDown.hop.FbmSync, ddProps = dpDown.documentProperties, ddGet = ddProps.getProperty;
  napServer(dpDown.hop, 'fbm_sync/auth/LoginStores.js', 'fbm_sync/auth/LoginTools.js', 'fbm_sync/auth/AutoLogin.js', 'fbm_sync/auth/LoginRun.js');
  ddProps.getProperty = () => { throw new Error('Service invoked too many times: properties'); };
  check(so, 'FBM-025/026/028: dịch vụ DocumentProperties lỗi thì state, sổ lỗi đẩy, cấu hình đăng nhập và công tắc tổng đều ném DOCUMENT_PROPERTIES_READ_FAILED, công tắc không mở theo mặc định',
    [thrownCode(() => DD.stateRead()), thrownCode(() => DD.pushFailuresRead()), thrownCode(() => Object.assign({}, DD.credentialRead(), DD.loginAttemptRead())), thrownCode(() => dpDown.hop.settingsValue(DD.SETTING_SECTIONS.master, 'enabled'))],
    ['DOCUMENT_PROPERTIES_READ_FAILED', 'DOCUMENT_PROPERTIES_READ_FAILED', 'DOCUMENT_PROPERTIES_READ_FAILED', 'DOCUMENT_PROPERTIES_READ_FAILED']);
  ddProps.getProperty = ddGet;
  check(so, 'FBM-028: Spreadsheet chưa có công tắc tổng vẫn coi là bật; chỉ "false" rõ ràng mới khóa',
    [dpDown.hop.settingsValue(DD.SETTING_SECTIONS.master, 'enabled'), (datCongTac(dpDown.hop, false), dpDown.hop.settingsValue(DD.SETTING_SECTIONS.master, 'enabled'))],
    [true, false]);

  const secretEnvelope = '{"ciphertext":"BI-MAT-ENVELOPE","password":"mat-khau-that"';
  dpData.FBM_CREDENTIAL_V1 = secretEnvelope;
  let loginError = null;
  try { Object.assign({}, DP.credentialRead(), DP.loginAttemptRead()); } catch (error) { loginError = error; }
  check(so, 'FBM-028: cấu hình đăng nhập JSON hỏng thì ném lỗi có mã, thông báo không chứa envelope hay mật khẩu, không ghi đè cấu hình',
    [loginError && loginError.code, /BI-MAT|mat-khau/.test(String(loginError && loginError.message)), dpData.FBM_CREDENTIAL_V1 === secretEnvelope],
    ['DOCUMENT_PROPERTY_CORRUPT', false, true]);
}

module.exports = { chay };
