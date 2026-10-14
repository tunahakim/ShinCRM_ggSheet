/** Sidebar lấy lại xác nhận relay khi Extension được tải lại trong lúc Sidebar đang mở. */
const { taoBoTest } = require('./Sidebar');
const { section, check } = require('../../lib/assert');

const cho = () => new Promise((resolve) => setTimeout(resolve, 0));

function taoKenh(ackOk) {
  const { hop } = taoBoTest();
  const listeners = [], posts = [], gasCalls = [], notices = [];
  hop.window.addEventListener = (type, fn) => { if (type === 'message') { listeners.push(fn); } };
  hop.window.top = {
    postMessage: (msg) => {
      posts.push(msg);
      setTimeout(() => listeners.forEach((fn) => fn({ origin: hop.SHEET_LINK_ORIGIN, data: { action: 'CRM_FBM_CONFIG_ACK', nonce: hop.SHEET_LINK_NONCE, sessionId: msg.sessionId, id: msg.id, ok: ackOk(posts.length), error: 'Extension từ chối' } })), 0);
    }
  };
  hop.setTimeout = setTimeout; hop.clearTimeout = clearTimeout;
  hop.SHEET_LINK_NONCE = 'nonce-relay';
  hop.sheetLinkExtensionAlive = () => true;
  hop.FBM_SYNC_CLIENT.relayOpenId = 0;
  hop.callServer = (name) => { gasCalls.push(name); return Promise.resolve({ url: 'https://script.example/exec', key: 'khoa-relay', spreadsheetId: 'sheet-dev' }); };
  hop.fbmSyncSetSettingsNotice = (key, kind, message) => { notices.push({ key, kind, message }); };
  return { hop, posts, gasCalls, notices };
}

async function chay(so) {
  section(so, 'fbmSync — gửi lại cấu hình relay khi Extension đổi phiên');

  const ok = taoKenh(() => true);
  ok.hop.SHEET_LINK_EXTENSION_SESSION = 'phien-1';
  ok.hop.fbmSyncNotifyBridgeReady();
  await ok.hop.fbmSyncPrepareRelayForSidebarOpen();
  check(so, 'Bắt tay đầu tiên chỉ gửi cấu hình một lần và có xác nhận', [ok.posts.length, ok.hop.FBM_SYNC_CLIENT.relayConfigured], [1, true]);

  ok.hop.SHEET_LINK_EXTENSION_SESSION = 'phien-2';
  ok.hop.fbmSyncNotifyBridgeReady();
  const haXuong = ok.hop.FBM_SYNC_CLIENT.relayConfigured;
  await cho(); await cho(); await cho();
  check(so, 'Tải lại Extension: Sidebar gửi lại đúng cấu hình đang giữ sang phiên mới, không gọi GAS thêm, có xác nhận lại',
    [haXuong, ok.posts.length, ok.posts[1] && ok.posts[1].sessionId, ok.posts[1] && ok.posts[1].config.key, ok.gasCalls.filter((name) => name === 'fbmGetRelayConfig').length, ok.hop.FBM_SYNC_CLIENT.relayConfigured],
    [false, 2, 'phien-2', 'khoa-relay', 1, true]);

  ok.hop.fbmSyncNotifyBridgeReady();
  await cho();
  check(so, 'Ping lại cùng phiên không gửi lại cấu hình', ok.posts.length, 2);

  const tuChoi = taoKenh((lan) => lan === 1);
  tuChoi.hop.SHEET_LINK_EXTENSION_SESSION = 'phien-1';
  tuChoi.hop.fbmSyncNotifyBridgeReady();
  await tuChoi.hop.fbmSyncPrepareRelayForSidebarOpen();
  tuChoi.hop.SHEET_LINK_EXTENSION_SESSION = 'phien-2';
  tuChoi.hop.fbmSyncNotifyBridgeReady();
  await cho(); await cho(); await cho();
  check(so, 'Extension mới từ chối cấu hình: Sidebar giữ trạng thái chưa xác nhận và báo lỗi ở Cài đặt',
    [tuChoi.hop.FBM_SYNC_CLIENT.relayConfigured, tuChoi.notices.some((item) => item.key === 'relay' && item.kind === 'error' && item.message.indexOf('Extension từ chối') >= 0), tuChoi.notices.some((item) => item.message.indexOf('khoa-relay') >= 0)],
    [false, true, false]);
}

module.exports = { chay };
