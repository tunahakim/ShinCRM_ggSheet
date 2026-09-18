/** Kiểm thử offline cổng cảnh báo thay đổi chưa lưu của Sidebar. */
const fs = require('fs');
const path = require('path');
const { napClient, taoHopCat } = require('../lib/load-gas');
const { domGia } = require('../lib/dom-gia');
const { section, check } = require('../lib/assert');

const ROOT = path.join(__dirname, '..', '..');
function docClient(relative) { return fs.readFileSync(path.join(ROOT, '1_ShinCRM_GAS', 'client', relative), 'utf8'); }

function taoBoTest() {
  const dom = domGia();
  const calls = [];
  const hop = taoHopCat({
    document: dom.document,
    window: { addEventListener: (name, fn) => { calls.push({ name, fn }); } },
    alert: (message) => { calls.push({ name: 'alert', message }); }
  });
  napClient(hop, 'client/ui/unsavedChanges.html', 'client/sync/fbmSyncConfigEditor.html');
  const dialog = dom.document.createElement('div'); dialog.id = 'shin-unsaved-dialog'; dialog.hidden = true;
  const stay = dom.document.createElement('button'); stay.setAttribute('data-unsaved-choice', 'continue'); dialog.appendChild(stay);
  const save = dom.document.createElement('button'); save.setAttribute('data-unsaved-choice', 'save'); dialog.appendChild(save);
  const discard = dom.document.createElement('button'); discard.setAttribute('data-unsaved-choice', 'discard'); dialog.appendChild(discard);
  dom.root.appendChild(dialog);
  const wrapper = dom.document.createElement('div'); wrapper.className = 'shin-form-field';
  const input = dom.document.createElement('input'); input.id = 'field-a'; wrapper.appendChild(input); dom.root.appendChild(wrapper);
  const wrapperB = dom.document.createElement('div'); wrapperB.className = 'shin-form-field';
  const inputB = dom.document.createElement('input'); inputB.id = 'field-b'; wrapperB.appendChild(inputB); dom.root.appendChild(wrapperB);
  hop.unsavedChangesInstall();
  return { hop, dom, calls, dialog, input, wrapper, wrapperB };
}

async function testSoSanhVaLazy(so) {
  const { hop, calls } = taoBoTest();
  check(so, 'chuẩn hóa dirty coi text, số, boolean tương đương đúng nghĩa', [
    hop.unsavedChangesEqual('  12 ', 12), hop.unsavedChangesEqual(true, 'true'), hop.unsavedChangesEqual('', null), hop.unsavedChangesEqual('01', 1)
  ], [true, true, true, false]);

  let reads = 0;
  let dirty = false;
  const provider = { read: () => { reads += 1; return { dirty, fieldIds: [] }; } };
  hop.unsavedChangesReadProvider = () => provider;
  check(so, 'dirty guard không đọc lại sau mỗi phím gõ, chỉ đọc lúc guard được gọi', reads, 0);
  hop.unsavedChangesGuard('core', () => {});
  check(so, 'dirty guard đọc provider đúng lúc action có nguy cơ mất dữ liệu', reads, 1);
  dirty = true;
  const beforeUnload = calls.filter((item) => item.name === 'beforeunload')[0];
  const unloadEvent = { preventDefault() { this.prevented = true; }, returnValue: undefined };
  beforeUnload.fn(unloadEvent);
  check(so, 'đóng tab dùng cảnh báo mặc định của trình duyệt khi đang dirty', [unloadEvent.prevented, unloadEvent.returnValue], [true, '']);
}

async function testModalVaActionCho(so) {
  const bo = taoBoTest(), hop = bo.hop;
  let dirty = true, saveCalls = 0, discardCalls = 0, pendingCalls = 0;
  const provider = {
    read: () => ({ dirty, fieldIds: dirty ? ['field-a', 'field-b'] : [] }),
    save: () => { saveCalls += 1; dirty = false; return Promise.resolve({ ok: true }); },
    discard: () => { discardCalls += 1; dirty = false; return { ok: true }; }
  };
  hop.unsavedChangesReadProvider = () => provider;
  check(so, 'action bị giữ lại và modal tô đúng nhiều trường thay đổi', [hop.unsavedChangesGuard('core', () => { pendingCalls += 1; }), hop.UNSAVED_CHANGES.dialogOpen, bo.wrapper.classList.contains('shin-field-changed'), bo.wrapperB.classList.contains('shin-field-changed')], [true, true, true, true]);
  hop.unsavedChangesResolve('continue');
  check(so, 'Tiếp tục sửa đóng modal nhưng giữ màu và không chạy action', [hop.UNSAVED_CHANGES.dialogOpen, bo.wrapper.classList.contains('shin-field-changed'), bo.wrapperB.classList.contains('shin-field-changed'), pendingCalls], [false, true, true, 0]);

  dirty = false;
  hop.unsavedChangesGuard('core', () => { pendingCalls += 1; });
  check(so, 'đưa mọi trường về baseline thì lần guard kế tiếp xóa màu và không cảnh báo', [bo.wrapper.classList.contains('shin-field-changed'), bo.wrapperB.classList.contains('shin-field-changed'), hop.UNSAVED_CHANGES.dialogOpen], [false, false, false]);
  dirty = true;
  hop.unsavedChangesGuard('core', () => { pendingCalls += 1; });
  hop.unsavedChangesResolve('save');
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'Lưu thành công gọi provider một lần, xóa màu và chạy action chờ', [saveCalls, discardCalls, pendingCalls, hop.UNSAVED_CHANGES.provider, bo.wrapper.classList.contains('shin-field-changed')], [1, 0, 1, null, false]);

  dirty = true;
  hop.unsavedChangesGuard('core', () => { pendingCalls += 1; });
  hop.unsavedChangesResolve('discard');
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'Bỏ thay đổi gọi provider một lần và chạy action sau khi bỏ cục bộ', [discardCalls, pendingCalls, hop.UNSAVED_CHANGES.provider], [1, 2, null]);
}

async function testLoiVaKhoa(so) {
  const bo = taoBoTest(), hop = bo.hop;
  let rejectSave, saveCalls = 0, pendingCalls = 0, dirty = true;
  const provider = {
    read: () => ({ dirty, fieldIds: ['field-a'] }),
    save: () => { saveCalls += 1; return new Promise((resolve, reject) => { rejectSave = reject; }); },
    discard: () => ({ ok: true })
  };
  hop.unsavedChangesReadProvider = () => provider;
  hop.unsavedChangesGuard('core', () => { pendingCalls += 1; });
  hop.unsavedChangesResolve('save');
  hop.unsavedChangesResolve('discard');
  check(so, 'đang lưu async thì lựa chọn thứ hai bị khóa, không chạy trùng', [saveCalls, hop.UNSAVED_CHANGES.busy, pendingCalls], [1, true, 0]);
  rejectSave(new Error('lỗi ghi thử'));
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'save lỗi giữ bản nháp, màu và action chờ, đồng thời báo lỗi', [bo.wrapper.classList.contains('shin-field-changed'), pendingCalls, hop.UNSAVED_CHANGES.pending !== null, bo.calls.filter((item) => item.name === 'alert').length], [true, 0, true, 1]);
  provider.save = () => { throw new Error('lỗi đồng bộ thử'); };
  hop.unsavedChangesGuard('core', () => { pendingCalls += 1; });
  hop.unsavedChangesResolve('save');
  check(so, 'save ném lỗi đồng bộ không để khóa busy treo', [hop.UNSAVED_CHANGES.busy, hop.UNSAVED_CHANGES.pending !== null, bo.calls.filter((item) => item.name === 'alert').length], [false, true, 2]);
}

async function testFormVaFbm(so) {
  const bo = taoBoTest(), hop = bo.hop;
  let coreDirty = true;
  hop.saveFlowUnsavedProvider = () => ({ read: () => ({ dirty: coreDirty, fieldIds: [] }) });
  hop.screenStateTop = () => ({ entity: 'customer' });
  const coreActions = ['cancelForm', 'openActivityForm', 'changeCustomer', 'backView', 'reloadData', 'openSync'];
  check(so, 'form lõi chặn mọi action rời khối khi dirty nhưng cho saveForm đi thẳng', [coreActions.map((action) => hop.unsavedChangesGuardCore(action, () => {})), hop.unsavedChangesGuardCore('saveForm', () => {})], [[true, true, true, true, true, true], false]);

  hop.FBM_SYNC_CLIENT = { configEdits: {} };
  hop.FBM_SYNC_UI_SCHEMA = { config: { actionIdPrefix: 'config-', actionCancel: 'cancel', actionSave: 'save', actionEdit: 'edit', tooltips: {} } };
  hop.fbmSyncConfigBeginEdit('identity', { username: 'old' });
  const state = hop.fbmSyncConfigState('identity');
  const username = bo.dom.document.createElement('input'); username.id = 'fbm-identity-username'; username.value = 'new'; bo.dom.root.appendChild(username);
  const card = bo.dom.document.createElement('div'); card.id = 'fbm-sync-identity-card-region'; bo.dom.root.appendChild(card);
  const cancel = bo.dom.document.createElement('button'); cancel.setAttribute('data-sync-config-action', 'cancel'); cancel.setAttribute('data-sync-config-key', 'identity'); card.appendChild(cancel);
  const save = bo.dom.document.createElement('button'); save.setAttribute('data-sync-config-action', 'save'); save.setAttribute('data-sync-config-key', 'identity'); card.appendChild(save);
  hop.fbmSyncConfigBeginEdit('login', { username: 'old-login' });
  const password = bo.dom.document.createElement('input'); password.id = 'fbm-login-password'; password.value = 'secret'; bo.dom.root.appendChild(password);
  const provider = hop.fbmSyncConfigUnsavedProvider(), passwordState = provider.read();
  const passwordSnapshot = hop.fbmSyncConfigState('login').snapshot;
  hop.fbmSyncConfigState('login').editing = false;
  const dirtyState = provider.read();
  check(so, 'FBM dirty theo key và không đưa password vào snapshot', [passwordState.dirty, passwordState.keys, passwordSnapshot.password, passwordState.fields, dirtyState.keys], [true, ['identity', 'login'], undefined, ['identity.username', 'login.password'], ['identity']]);
  check(so, 'FBM chặn nút Hủy và action ngoài card nhưng cho nút Lưu cùng card', [provider.canRunTarget(cancel, dirtyState), provider.canRunTarget(save, dirtyState), provider.canRunTarget(bo.dom.document.createElement('button'), dirtyState)], [false, true, false]);
}

function testHopDongTichHop(so) {
  const sidebar = docClient('Sidebar.html');
  const dispatch = docClient('ui/dispatch.html');
  const guard = docClient('ui/unsavedChanges.html');
  const fbm = docClient('sync/fbmSync.html');
  const editor = docClient('sync/fbmSyncConfigEditor.html');
  const styles = docClient('style/components.html');
  check(so, 'Sidebar giữ host tĩnh, nạp module dirty guard và cài listener lúc boot', [
    sidebar.indexOf('id="shin-unsaved-dialog"') >= 0,
    sidebar.indexOf("include('client/ui/unsavedChanges')") >= 0,
    sidebar.indexOf('unsavedChangesInstall();') >= 0
  ], [true, true, true]);
  check(so, 'dispatcher form lõi luôn đi qua guard và vẫn chừa saveForm cho cửa lưu', [
    dispatch.indexOf('function dispatchRunNow(') >= 0,
    dispatch.indexOf('unsavedChangesGuardCore') >= 0,
    guard.indexOf("String(action || '') === 'saveForm'") >= 0
  ], [true, true, true]);
  check(so, 'dispatcher FBM giữ action chờ trong guard trước khi chạy target', [
    fbm.indexOf('unsavedChangesGuardFbmTarget') >= 0,
    fbm.indexOf('function fbmSyncDispatchClickTarget(') >= 0,
    fbm.indexOf('document.addEventListener(\'change\'') > fbm.indexOf('function fbmSyncDispatchClickTarget(')
  ], [true, true, true]);
  check(so, 'editor có mapping dirty cho đủ tám key và giữ password ngoài snapshot', [
    ['identity:', 'login:', 'accountSettings:', 'module:', 'relay:', 'extension:', 'background:', 'loginPolicy:'].every((key) => editor.indexOf(key) >= 0),
    editor.indexOf("path === 'password'") >= 0,
    editor.indexOf('state.snapshot = fbmSyncConfigClone(draft)') >= 0
  ], [true, true, true]);
  check(so, 'CSS changed tập trung ở components và bao phủ input, menu, toggle', [
    styles.indexOf('shin-field-changed') >= 0,
    styles.indexOf('shin-choice-trigger') >= 0,
    styles.indexOf('shin-toggle-control') >= 0
  ], [true, true, true]);
}

async function chay(so) {
  section('Dirty guard Sidebar - compare, modal va scope');
  await testSoSanhVaLazy(so);
  await testModalVaActionCho(so);
  await testLoiVaKhoa(so);
  await testFormVaFbm(so);
  testHopDongTichHop(so);
}

module.exports = { chay };
