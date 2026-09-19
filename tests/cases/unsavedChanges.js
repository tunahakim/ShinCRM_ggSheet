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
  napClient(hop, 'client/ui/uiBuilder.html', 'client/ui/renderEngine.html', 'client/ui/unsavedChanges.html', 'client/save/formCollect.html', 'client/save/saveFlow.html', 'client/sync/fbmSyncConfigEditor.html');
  const dialog = dom.document.createElement('div'); dialog.id = 'shin-unsaved-dialog'; dialog.hidden = true;
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
  check(so, 'modal cảnh báo được dựng bằng component dùng lại, không phải HTML hardcode', [
    !!bo.dialog.querySelector('.shin-unsaved-panel'),
    !!bo.dialog.querySelector('#shin-unsaved-title'),
    !!bo.dialog.querySelector('[data-unsaved-choice="save"]'),
    !!bo.dialog.querySelector('[data-unsaved-choice="discard"]'),
    !!bo.dialog.querySelector('[data-unsaved-choice="continue"]')
  ], [true, true, true, true, true]);
  check(so, 'modal dùng đúng ba nhãn hành động và lớp phủ component', [
    bo.dialog.querySelector('[data-unsaved-choice="save"]').textContent,
    bo.dialog.querySelector('[data-unsaved-choice="discard"]').textContent,
    bo.dialog.querySelector('.shin-unsaved-continue').textContent,
    !!bo.dialog.querySelector('.shin-unsaved-backdrop')
  ], ['Lưu thay đổi', 'Hủy bỏ thay đổi', 'Tiếp tục sửa', true]);
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

  let staleDirty = true, staleDiscardCalls = 0, stalePendingCalls = 0;
  const staleProvider = {
    read: () => ({ dirty: staleDirty, fieldIds: ['field-a'] }),
    discard: () => { staleDiscardCalls += 1; return { ok: true }; }
  };
  hop.unsavedChangesReadProvider = () => staleProvider;
  hop.unsavedChangesGuard('core', () => { stalePendingCalls += 1; });
  hop.unsavedChangesResolve('discard');
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'discard thành công vẫn chạy action dù provider còn đọc thấy dirty cũ', [staleDiscardCalls, stalePendingCalls, hop.UNSAVED_CHANGES.provider], [1, 1, null]);
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
  hop.unsavedChangesClose();
  hop.UNSAVED_CHANGES.dialogOpen = false;
  hop.UNSAVED_CHANGES.pending = null;
  hop.UNSAVED_CHANGES.provider = null;
  let coreDirty = true, coreEditing = true;
  hop.saveFlowUnsavedProvider = () => ({
    read: () => ({ editing: coreEditing, dirty: coreDirty, fieldIds: [] }),
    canRun: (intent, state) => String(intent && intent.action || '') === 'saveForm' || (String(intent && intent.action || '') === 'cancelForm' && !state.dirty)
  });
  hop.screenStateTop = () => ({ entity: 'customer' });
  const coreActions = ['cancelForm', 'openActivityForm', 'changeCustomer', 'backView', 'reloadData', 'openSync'];
  check(so, 'form lõi chặn mọi action ngoài khi đang sửa và cho saveForm đi thẳng', [coreActions.map((action) => hop.unsavedChangesGuardCore(action, () => {})), hop.unsavedChangesGuardCore('saveForm', () => {})], [[true, true, true, true, true, true], false]);
  hop.UNSAVED_CHANGES.dialogOpen = false;
  hop.UNSAVED_CHANGES.pending = null;
  hop.UNSAVED_CHANGES.provider = null;
  coreDirty = false;
  const cleanCoreOutsideBlocked = hop.unsavedChangesGuardCore('openActivityForm', () => {});
  check(so, 'form lõi đang sửa nhưng chưa đổi vẫn chặn ngoài và mở modal, còn Hủy đi thẳng', [cleanCoreOutsideBlocked, hop.UNSAVED_CHANGES.dialogOpen, hop.unsavedChangesGuardCore('cancelForm', () => {})], [true, true, false]);
  hop.unsavedChangesResolve('continue');
  coreEditing = false;

  hop.FBM_SYNC_CLIENT = { configEdits: {}, syncSettings: {}, loginStatus: { public: { usernameHint: 'old-login' } }, identityStatus: { binding: {} }, identityDraft: {} };
  hop.FBM_SYNC_UI_SCHEMA = { config: { actionIdPrefix: 'config-', actionCancel: 'cancel', actionSave: 'save', actionEdit: 'edit', tooltips: {} } };
  hop.fbmSyncConfigBeginEdit('connection', { identity: { username: 'old' }, loginUsername: 'old-login' });
  const state = hop.fbmSyncConfigState('connection');
  const username = bo.dom.document.createElement('input'); username.id = 'fbm-identity-username'; username.value = 'new'; bo.dom.root.appendChild(username);
  const password = bo.dom.document.createElement('input'); password.id = 'fbm-login-password'; password.value = 'secret'; bo.dom.root.appendChild(password);
  const provider = hop.fbmSyncConfigUnsavedProvider(), passwordState = provider.read();
  const passwordSnapshot = hop.fbmSyncConfigState('connection').snapshot;
  const loginDirtyState = provider.read();
  const card = bo.dom.document.createElement('div'); card.id = 'fbm-sync-connection-card-region'; bo.dom.root.appendChild(card);
  const cancel = bo.dom.document.createElement('button'); cancel.setAttribute('data-sync-config-action', 'cancel'); cancel.setAttribute('data-sync-config-key', 'connection'); card.appendChild(cancel);
  const save = bo.dom.document.createElement('button'); save.setAttribute('data-sync-config-action', 'save'); save.setAttribute('data-sync-config-key', 'connection'); card.appendChild(save);
  check(so, 'FBM connection dirty theo từng path và không đưa password vào snapshot', [passwordState.dirty, passwordState.keys, passwordSnapshot.password, passwordState.fields], [true, ['connection'], undefined, ['connection.identity.username', 'connection.password']]);
  check(so, 'FBM chặn nút Hủy và action ngoài card nhưng cho nút Lưu cùng card', [provider.canRunTarget(cancel, loginDirtyState), provider.canRunTarget(save, loginDirtyState), provider.canRunTarget(bo.dom.document.createElement('button'), loginDirtyState)], [false, true, false]);

  hop.fbmSyncConfigFinishEdit('connection');
  hop.FBM_SYNC_ACCOUNT_SCHEMA = { login: { password: { id: 'fbm-login-password' } } };
  hop.FBM_SYNC_CLIENT.identityDraft = { spreadsheetId: 'sheet', userId: 'user', username: 'old', accountName: 'account' };
  password.value = '';
  const outside = bo.dom.document.createElement('button');
  const loginStarted = hop.fbmSyncConfigStartEdit('connection');
  const cleanOutsideBlocked = hop.unsavedChangesGuardFbmTarget(outside, () => {});
  check(so, 'Đang sửa dù chưa đổi giá trị vẫn chặn action ngoài card và mở modal', [loginStarted, cleanOutsideBlocked, hop.UNSAVED_CHANGES.dialogOpen], [true, true, true]);
  hop.unsavedChangesResolve('continue');
  check(so, 'Không mở đồng thời khối thứ hai khi khối hiện tại còn đang sửa', [hop.fbmSyncConfigStartEdit('accountSettings'), hop.fbmSyncConfigEditingKey(), hop.fbmSyncConfigState('connection').editing], [false, 'connection', true]);
  hop.fbmSyncConfigFinishEdit('connection');
  username.value = 'old';
  check(so, 'Mở connection lại chỉ thành công sau khi khối cũ đã kết thúc', [hop.fbmSyncConfigStartEdit('identity'), hop.fbmSyncConfigEditingKey(), hop.fbmSyncConfigState('connection').editing], [true, 'connection', true]);
  username.value = 'changed-again';
  let fbmPendingCalls = 0;
  const outsideDirtyPending = () => { fbmPendingCalls += 1; };
  const outsideDirtyBlocked = hop.unsavedChangesGuardFbmTarget(outside, outsideDirtyPending);
  check(so, 'FBM dirty chặn action ngoài và mở đúng modal dùng chung', [outsideDirtyBlocked, hop.UNSAVED_CHANGES.dialogOpen], [true, true]);
  hop.unsavedChangesResolve('continue');
  const dirtyCancelBlocked = hop.unsavedChangesGuardFbmTarget(cancel, () => {});
  check(so, 'Chỉ Hủy cùng card mới mở cảnh báo khi card đã dirty', [dirtyCancelBlocked, hop.UNSAVED_CHANGES.dialogOpen], [true, true]);
  hop.unsavedChangesResolve('continue');
  const dirtyCancelAgain = hop.unsavedChangesGuardFbmTarget(cancel, () => { fbmPendingCalls += 1; });
  hop.unsavedChangesResolve('discard');
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'Bỏ thay đổi và tiếp tục FBM thoát edit rồi chạy action đang chờ', [dirtyCancelAgain, fbmPendingCalls, hop.fbmSyncConfigState('connection').editing, hop.UNSAVED_CHANGES.provider], [true, 1, false, null]);
  const blockedStart = hop.fbmSyncConfigStartEdit('login');
  check(so, 'Alias login mở connection thành công sau khi surface cũ đã bỏ thay đổi', [blockedStart, hop.fbmSyncConfigEditingKey(), hop.fbmSyncConfigState('connection').editing], [true, 'connection', true]);
}

function testCoreDiscardRestoresDom(so) {
  const bo = taoBoTest(), hop = bo.hop;
  hop.Schema = { customer: { name: {} } };
  const control = bo.dom.document.createElement('input');
  control.id = 'shin-f-customer-name';
  control.setAttribute('data-field', 'customer.name');
  control.value = 'đã sửa';
  bo.dom.root.appendChild(control);
  const top = { entity: 'customer', record: { name: 'bản gốc' }, draft: { name: 'đã sửa' } };
  hop.screenStateTop = () => top;
  hop.screenStateSetDraft = (draft) => { top.draft = draft; return top; };
  const provider = hop.saveFlowUnsavedProvider();
  const result = provider.discard();
  check(so, 'Core discard xóa draft và khôi phục control trước pending action', [result.ok, top.draft, control.value], [true, {}, 'bản gốc']);
}

function testSurfaceAdapterContract(so) {
  const bo = taoBoTest(), hop = bo.hop;
  let pendingCalls = 0;
  hop.unsavedChangesRegisterSurface('future.settings', () => ({
    read: () => ({ editing: true, dirty: true, fieldIds: [] }),
    canRun: () => false,
    save: () => ({ ok: true }),
    discard: () => ({ ok: true })
  }));
  const target = bo.dom.document.createElement('button');
  const blocked = hop.unsavedChangesGuardTransition({ source: 'future', target }, () => { pendingCalls += 1; });
  check(so, 'Màn hình tương lai đăng ký adapter thì tự được ActionCoordinator bảo vệ', [blocked, hop.UNSAVED_CHANGES.dialogOpen, pendingCalls], [true, true, 0]);

  const invalid = taoBoTest(), invalidHop = invalid.hop;
  invalidHop.unsavedChangesRegisterSurface('invalid', () => ({ read: () => ({ editing: true, dirty: false, fieldIds: [] }) }));
  const invalidBlocked = invalidHop.unsavedChangesGuardTransition({ source: 'invalid', target: invalid.dom.document.createElement('button') }, () => {});
  check(so, 'Adapter thiếu canRun bị chặn fail-closed thay vì chạy tắt', [invalidBlocked, invalid.calls.filter((item) => item.name === 'alert').length], [true, 1]);
}

function testCoordinatorUseCaseMatrix(so) {
  const bo = taoBoTest(), hop = bo.hop, target = bo.dom.document.createElement('button');
  bo.dom.root.appendChild(target);
  let editing = false, dirty = false, pendingCalls = 0, allow = false;
  const provider = {
    read: () => ({ editing, dirty, fieldIds: dirty ? ['field-a'] : [] }),
    canRun: () => allow,
    save: () => ({ ok: true }),
    discard: () => ({ ok: true })
  };
  hop.unsavedChangesRegisterSurface('matrix', () => provider);
  check(so, 'surface không sửa thì action đi thẳng và không mở modal', [hop.unsavedChangesGuardTransition({ source: 'matrix', target }, () => { pendingCalls += 1; }), hop.UNSAVED_CHANGES.dialogOpen, pendingCalls], [false, false, 0]);

  editing = true;
  target.focus();
  const cleanBlocked = hop.unsavedChangesGuardTransition({ source: 'matrix', target }, () => { pendingCalls += 1; });
  check(so, 'surface đang sửa nhưng sạch vẫn chặn action ngoài và mở modal', [cleanBlocked, hop.UNSAVED_CHANGES.dialogOpen, hop.UNSAVED_CHANGES.highlighted, pendingCalls], [true, true, false, 0]);
  const continueButton = bo.dialog.querySelector('[data-unsaved-choice="continue"]');
  const backdrop = bo.dialog.querySelector('.shin-unsaved-backdrop');
  let prevented = false;
  bo.dom.document.listeners.click({ target: backdrop, preventDefault: () => { prevented = true; } });
  check(so, 'bấm backdrop là Tiếp tục sửa, giữ focus và bỏ action đang chờ', [prevented, hop.UNSAVED_CHANGES.dialogOpen, bo.dom.document.activeElement === target, hop.UNSAVED_CHANGES.pending, pendingCalls], [true, false, true, null, 0]);

  dirty = true;
  const dirtyBlocked = hop.unsavedChangesGuardTransition({ source: 'matrix', target }, () => { pendingCalls += 1; });
  check(so, 'surface dirty mở modal và tô đúng trường thay đổi', [dirtyBlocked, hop.UNSAVED_CHANGES.dialogOpen, bo.wrapper.classList.contains('shin-field-changed')], [true, true, true]);
  bo.dom.document.listeners.keydown({ key: 'Escape', preventDefault: () => { prevented = true; } });
  check(so, 'Escape đóng modal như Tiếp tục sửa nhưng không chạy action', [hop.UNSAVED_CHANGES.dialogOpen, hop.UNSAVED_CHANGES.pending, pendingCalls, bo.wrapper.classList.contains('shin-field-changed')], [false, null, 0, true]);

  allow = true;
  check(so, 'action nội bộ được adapter cho phép đi thẳng dù surface đang sửa', [hop.unsavedChangesGuardTransition({ source: 'matrix', target }, () => { pendingCalls += 1; }), hop.UNSAVED_CHANGES.dialogOpen, pendingCalls], [false, false, 0]);
  check(so, 'sau Continue không giữ provider/pending cũ làm giao dịch ma', [hop.UNSAVED_CHANGES.provider, hop.UNSAVED_CHANGES.pending], [null, null]);
  void continueButton;
}

function testCoordinatorFailureMatrix(so) {
  const two = taoBoTest(), twoHop = two.hop, target = two.dom.document.createElement('button');
  twoHop.unsavedChangesRegisterSurface('one', () => ({ read: () => ({ editing: true, dirty: false, fieldIds: [] }), canRun: () => false }));
  twoHop.unsavedChangesRegisterSurface('two', () => ({ read: () => ({ editing: true, dirty: false, fieldIds: [] }), canRun: () => false }));
  check(so, 'hai surface cùng sửa bị chặn fail-closed và báo lỗi thay vì đoán surface', [twoHop.unsavedChangesGuardTransition({ source: 'two', target }, () => {}), twoHop.UNSAVED_CHANGES.dialogOpen, two.calls.filter((item) => item.name === 'alert').length], [true, false, 1]);

  const readError = taoBoTest(), readHop = readError.hop;
  readHop.unsavedChangesRegisterSurface('broken.read', () => ({ read: () => { throw new Error('READ_FAIL'); } }));
  check(so, 'provider read lỗi bị chặn và báo lỗi rõ', [readHop.unsavedChangesGuardTransition({ source: 'broken.read', target }, () => {}), readError.calls.filter((item) => item.name === 'alert').length], [true, 1]);

  const canRunError = taoBoTest(), canRunHop = canRunError.hop;
  canRunHop.unsavedChangesRegisterSurface('broken.canRun', () => ({ read: () => ({ editing: true, dirty: false, fieldIds: [] }), canRun: () => { throw new Error('CANRUN_FAIL'); } }));
  check(so, 'adapter canRun lỗi bị chặn và báo lỗi rõ', [canRunHop.unsavedChangesGuardTransition({ source: 'broken.canRun', target }, () => {}), canRunError.calls.filter((item) => item.name === 'alert').length], [true, 1]);
}

function testFbmAdapterUseCaseMatrix(so) {
  const bo = taoBoTest(), hop = bo.hop;
  hop.FBM_SYNC_CLIENT = { configEdits: {}, syncSettings: { account: {}, extension: {}, background: {} }, loginStatus: {}, identityStatus: { binding: {} }, lastStatus: {} };
  hop.FBM_SYNC_SETTINGS_SCHEMA = { defaults: { approvalThreshold: 100, pollMinutes: 5, retryMinutes: 30 } };
  hop.FBM_SYNC_UI_SCHEMA = { config: { actionIdPrefix: 'config-', actionCancel: 'cancel', actionSave: 'save', actionEdit: 'edit', tooltips: {} } };
  const keys = ['connection', 'accountSettings', 'module', 'relay', 'extension', 'background', 'loginPolicy'];
  const started = keys.map((key) => { const result = hop.fbmSyncConfigStartEdit(key); hop.fbmSyncConfigFinishEdit(key); return result; });
  check(so, 'mọi edit surface FBM đều có thể mở qua cùng một editor', started, keys.map(() => true));
  const connection = hop.fbmSyncConfigStartEdit('identity');
  const secondAliasBlocked = hop.fbmSyncConfigStartEdit('login');
  check(so, 'identity và login cũ cùng trỏ về connection, không tạo hai surface song song', [connection, secondAliasBlocked, hop.fbmSyncConfigEditingKey(), hop.fbmSyncConfigState('connection') === hop.fbmSyncConfigState('identity')], [true, false, 'connection', true]);

  const provider = hop.fbmSyncConfigUnsavedProvider(), state = { editing: true, editingKey: 'connection', dirty: false };
  const card = bo.dom.document.createElement('div'); card.id = 'fbm-sync-connection-card-region'; bo.dom.root.appendChild(card);
  const inside = bo.dom.document.createElement('button'); card.appendChild(inside);
  const save = bo.dom.document.createElement('button'); save.setAttribute('data-sync-config-action', 'save'); save.setAttribute('data-sync-config-key', 'connection'); card.appendChild(save);
  const cancel = bo.dom.document.createElement('button'); cancel.setAttribute('data-sync-config-action', 'cancel'); cancel.setAttribute('data-sync-config-key', 'connection'); card.appendChild(cancel);
  const outside = bo.dom.document.createElement('button'); bo.dom.root.appendChild(outside);
  const screen = bo.dom.document.createElement('button'); screen.setAttribute('data-sync-screen', 'settings');
  check(so, 'FBM adapter phân biệt nội bộ, cancel sạch, save, màn hình và target rỗng', [provider.canRunTarget(inside, state), provider.canRunTarget(cancel, state), provider.canRunTarget(save, state), provider.canRunTarget(outside, state), provider.canRunTarget(screen, state), provider.canRunTarget(null, state)], [true, true, true, false, false, false]);
  state.dirty = true;
  check(so, 'cancel cùng connection chỉ bị chặn khi thật sự dirty', [provider.canRunTarget(cancel, state), provider.canRunTarget(save, state)], [false, true]);
}

async function testAllFbmSurfaceActionMatrix(so) {
  const bo = taoBoTest(), hop = bo.hop;
  hop.FBM_SYNC_CLIENT = {
    configEdits: {}, syncSettings: {
      account: {}, extension: {}, background: {
        heartbeat: {}, customerFull: {}, activityFull: {}, detail: {}
      }
    }, loginStatus: {}, identityStatus: { binding: {} }, lastStatus: {}
  };
  hop.FBM_SYNC_SETTINGS_SCHEMA = { defaults: { approvalThreshold: 100, pollMinutes: 5, retryMinutes: 30 } };
  hop.FBM_SYNC_UI_SCHEMA = { config: { actionIdPrefix: 'config-', actionCancel: 'cancel', actionSave: 'save', actionEdit: 'edit', tooltips: {} } };
  hop.FBM_SYNC_CONFIG_UNSAVED_PROVIDER = null;
  const keys = ['connection', 'accountSettings', 'module', 'relay', 'extension', 'background', 'loginPolicy'];
  const provider = hop.fbmSyncConfigUnsavedProvider();
  const outside = bo.dom.document.createElement('button'); bo.dom.root.appendChild(outside);
  const targets = [
    outside,
    Object.assign(bo.dom.document.createElement('button'), { id: 'fbm-sync-module-menu' }),
    Object.assign(bo.dom.document.createElement('button'), { id: 'fbm-sync-back' }),
    Object.assign(bo.dom.document.createElement('button'), { id: 'fbm-sync-open-login-policy' }),
    (() => { const node = bo.dom.document.createElement('button'); node.setAttribute('data-sync-screen', 'settings'); return node; })(),
    (() => { const node = bo.dom.document.createElement('button'); node.setAttribute('data-sync-results-tab', 'summary'); return node; })(),
    (() => { const node = bo.dom.document.createElement('button'); node.setAttribute('data-sync-page', 'log:1'); return node; })()
  ];
  const outsideAllowed = [];
  for (const key of keys) {
    hop.fbmSyncConfigStartEdit(key);
    const card = bo.dom.document.createElement('div'); card.id = hop.FBM_SYNC_CONFIG_UNSAVED_CARDS[key]; bo.dom.root.appendChild(card);
    const state = provider.read();
    outsideAllowed.push({ key, clean: !state.dirty, targets: targets.map((target) => provider.canRunTarget(target, state)) });
    check(so, 'surface ' + key + ' sạch vẫn khóa toàn bộ action ngoài card', [state.editingKey, state.dirty, outsideAllowed[outsideAllowed.length - 1].targets.some(Boolean)], [key, false, false]);
    const blocked = hop.unsavedChangesGuardTransition({ source: 'fbm', target: outside }, () => {});
    check(so, 'surface ' + key + ' sạch vẫn mở modal qua coordinator', [blocked, hop.UNSAVED_CHANGES.dialogOpen], [true, true]);
    hop.unsavedChangesResolve('continue');
    check(so, 'surface ' + key + ' Continue giữ nguyên trạng thái đang sửa', [hop.fbmSyncConfigIsEditing(key), hop.UNSAVED_CHANGES.dialogOpen], [true, false]);
    hop.fbmSyncConfigFinishEdit(key);
    card.remove();
  }
  check(so, 'ma trận action ngoài áp dụng đồng nhất cho đủ bảy surface', [outsideAllowed.length, outsideAllowed.every((item) => item.clean && item.targets.every((allowed) => allowed === false))], [7, true]);

  const dirtyKeys = keys.filter((key) => Object.keys(hop.FBM_SYNC_CONFIG_UNSAVED_FIELDS[key] || {}).length);
  const saveCalls = [];
  const saveFunctions = {
    connection: 'fbmSyncSaveConnection', accountSettings: 'fbmSyncSaveAccountSettings', module: 'fbmSyncSaveSyncSettings',
    relay: 'fbmSyncRotateRelay', extension: 'fbmSyncSaveExtensionSettings', background: 'fbmSyncSaveBackgroundSettings', loginPolicy: 'fbmSyncSaveLoginPolicy'
  };
  keys.forEach((key) => {
    hop[saveFunctions[key]] = () => { saveCalls.push(key); hop.fbmSyncConfigFinishEdit(key); return Promise.resolve({ ok: true }); };
  });
  for (const key of keys) {
    hop.fbmSyncConfigStartEdit(key);
    const map = hop.FBM_SYNC_CONFIG_UNSAVED_FIELDS[key] || {}, path = Object.keys(map)[0];
    if (path) {
      const field = bo.dom.document.createElement('input'); field.id = map[path]; field.value = 'save-value'; bo.dom.root.appendChild(field);
      const state = hop.fbmSyncConfigState(key); state.snapshot = {}; state.draft = {};
      const parts = path.split('.'); let snapshot = state.snapshot, draft = state.draft;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) { snapshot[part] = 'save-original'; draft[part] = 'save-value'; return; }
        snapshot[part] = {}; draft[part] = {}; snapshot = snapshot[part]; draft = draft[part];
      });
    }
    let pendingCalls = 0;
    const blocked = hop.unsavedChangesGuardTransition({ source: 'fbm', target: outside }, () => { pendingCalls += 1; });
    hop.unsavedChangesResolve('save');
    await new Promise((resolve) => setImmediate(resolve));
    check(so, 'surface ' + key + ' save thành công kết thúc edit và chạy action chờ', [blocked, pendingCalls, hop.fbmSyncConfigIsEditing(key), hop.UNSAVED_CHANGES.provider], [true, 1, false, null]);
    bo.dom.document.querySelectorAll('[data-unsaved-changed]').forEach((control) => control.remove());
  }
  check(so, 'coordinator gọi đúng cổng save cho toàn bộ surface', [saveCalls.length, keys.every((key) => saveCalls.indexOf(key) >= 0)], [7, true]);

  const dirtyResults = [];
  for (const key of dirtyKeys) {
    hop.fbmSyncConfigStartEdit(key);
    const path = Object.keys(hop.FBM_SYNC_CONFIG_UNSAVED_FIELDS[key])[0];
    const fieldId = hop.FBM_SYNC_CONFIG_UNSAVED_FIELDS[key][path];
    const field = bo.dom.document.createElement('input'); field.id = fieldId; field.value = 'changed'; bo.dom.root.appendChild(field);
    const state = hop.fbmSyncConfigState(key);
    state.snapshot = {}; state.draft = {};
    const parts = path.split('.'); let snapshot = state.snapshot, draft = state.draft;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) { snapshot[part] = 'original'; draft[part] = 'changed'; return; }
      snapshot[part] = {}; draft[part] = {}; snapshot = snapshot[part]; draft = draft[part];
    });
    const dirtyState = provider.read();
    const blocked = hop.unsavedChangesGuardTransition({ source: 'fbm', target: outside }, () => {});
    dirtyResults.push({ key, blocked, dirty: dirtyState.dirty, highlighted: field.getAttribute('data-unsaved-changed') === '1' && hop.UNSAVED_CHANGES.dialogOpen });
    hop.unsavedChangesResolve('continue');
    check(so, 'surface ' + key + ' dirty tô màu và giữ action ngoài', [blocked, dirtyState.dirty, field.classList.contains('shin-field-changed'), hop.fbmSyncConfigIsEditing(key)], [true, true, true, true]);
    const cancel = bo.dom.document.createElement('button'); cancel.setAttribute('data-sync-config-action', 'cancel'); cancel.setAttribute('data-sync-config-key', key); const cancelCard = bo.dom.document.createElement('div'); cancelCard.id = hop.FBM_SYNC_CONFIG_UNSAVED_CARDS[key]; cancelCard.appendChild(cancel); bo.dom.root.appendChild(cancelCard);
    const cancelBlocked = hop.unsavedChangesGuardTransition({ source: 'fbm', target: cancel }, () => {});
    hop.unsavedChangesResolve('discard');
    await new Promise((resolve) => setImmediate(resolve));
    check(so, 'surface ' + key + ' discard thoát edit và xóa màu', [cancelBlocked, hop.fbmSyncConfigIsEditing(key), field.classList.contains('shin-field-changed'), hop.UNSAVED_CHANGES.provider], [true, false, false, null]);
    field.remove(); cancelCard.remove();
  }
  check(so, 'mọi surface có field đều chạy đủ nhánh dirty/Continue/Discard', [dirtyResults.length, dirtyResults.every((item) => item.blocked && item.dirty && item.highlighted)], [6, true]);
}

async function testProviderSaveResultMatrix(so) {
  const bo = taoBoTest(), hop = bo.hop;
  hop.FBM_SYNC_CLIENT = { configEdits: { connection: { editing: true, snapshot: { identity: {}, loginUsername: '' }, draft: { identity: {}, loginUsername: '' } } }, syncSettings: {}, loginStatus: {}, identityStatus: { binding: {} } };
  hop.FBM_SYNC_CONFIG_UNSAVED_PROVIDER = null;
  hop.fbmSyncSaveConnection = () => Promise.resolve({ ok: false, message: 'CONNECTION_SAVE_FAIL' });
  const password = bo.dom.document.createElement('input'); password.id = 'fbm-login-password'; password.value = 'secret'; bo.dom.root.appendChild(password);
  const outside = bo.dom.document.createElement('button');
  let pendingCalls = 0;
  const blocked = hop.unsavedChangesGuardFbmTarget(outside, () => { pendingCalls += 1; });
  hop.unsavedChangesResolve('save');
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'FBM save trả ok:false không bị nuốt thành thành công', [blocked, pendingCalls, hop.UNSAVED_CHANGES.provider !== null, hop.UNSAVED_CHANGES.pending !== null, bo.calls.filter((item) => item.name === 'alert').length], [true, 0, true, true, 1]);
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
    sidebar.indexOf('unsavedChangesInstall();') >= 0,
    sidebar.indexOf('data-unsaved-choice') < 0,
    sidebar.indexOf('shin-unsaved-panel') < 0
  ], [true, true, true, true, true]);
  check(so, 'dispatcher form lõi luôn đi qua ActionCoordinator và provider giữ cửa saveForm', [
    dispatch.indexOf('function dispatchRunNow(') >= 0,
    dispatch.indexOf('unsavedChangesGuardTransition') >= 0,
    docClient('save/saveFlow.html').indexOf("action === 'saveForm'") >= 0,
    docClient('save/saveFlow.html').indexOf("action === 'cancelForm'") >= 0
  ], [true, true, true, true]);
  check(so, 'dispatcher FBM giữ action chờ trong ActionCoordinator trước khi chạy target', [
    fbm.indexOf('unsavedChangesGuardTransition') >= 0,
    fbm.indexOf('function fbmSyncDispatchClickTarget(') >= 0,
    fbm.indexOf('document.addEventListener(\'change\'') > fbm.indexOf('function fbmSyncDispatchClickTarget(')
  ], [true, true, true]);
  check(so, 'editor có mapping dirty cho đủ surface và giữ password ngoài snapshot', [
    ['connection:', 'accountSettings:', 'module:', 'relay:', 'extension:', 'background:', 'loginPolicy:'].every((key) => editor.indexOf(key) >= 0),
    editor.indexOf("path === 'password'") >= 0,
    editor.indexOf('state.snapshot = fbmSyncConfigClone(draft)') >= 0
  ], [true, true, true]);
  check(so, 'editor chỉ cho một khối ở chế độ sửa và nút sửa login đi qua cổng chung', [
    editor.indexOf('function fbmSyncConfigEditingKey()') >= 0,
    editor.indexOf('if (activeKey && activeKey !== key) { return false; }') >= 0,
    fbm.indexOf("if (fbmSyncConfigStartEdit('login'))") >= 0,
    !editor.includes('loginEditMode') && !fbm.includes('loginEditMode')
  ], [true, true, true, true]);
  check(so, 'mọi dispatch dùng một ActionCoordinator và provider có adapter canRun', [
    dispatch.indexOf('unsavedChangesGuardTransition') >= 0,
    !dispatch.includes('unsavedChangesGuardCore'),
    fbm.indexOf('unsavedChangesGuardTransition') >= 0,
    !fbm.includes('unsavedChangesGuardFbmTarget'),
    guard.indexOf('function unsavedChangesRegisterSurface') >= 0,
    guard.indexOf('function unsavedChangesGuardTransition') >= 0,
    !guard.includes('provider.needsDecision'),
    docClient('save/saveFlow.html').indexOf('canRun: function') >= 0,
    editor.indexOf('canRun: function') >= 0
  ], [true, true, true, true, true, true, true, true, true]);
  check(so, 'CSS changed tập trung ở components và bao phủ input, menu, toggle', [
    styles.indexOf('shin-field-changed') >= 0,
    styles.indexOf('shin-choice-trigger') >= 0,
    styles.indexOf('shin-toggle-control') >= 0
  ], [true, true, true]);
  check(so, 'lớp phủ modal không bị luật Box rỗng ẩn và nằm dưới panel', [
    styles.indexOf('.shin-box.shin-unsaved-backdrop') >= 0,
    styles.indexOf('.shin-box.shin-unsaved-backdrop') < styles.indexOf('.shin-box.shin-unsaved-panel'),
    styles.indexOf('z-index: 0') > styles.indexOf('.shin-box.shin-unsaved-backdrop'),
    styles.indexOf('z-index: 1;') > styles.indexOf('.shin-box.shin-unsaved-panel')
  ], [true, true, true, true]);
  check(so, 'action modal dùng Stack dọc, không thừa hưởng Row margin ngang', [
    docClient('ui/unsavedChanges.html').indexOf("Stack({ className: 'shin-unsaved-actions'") >= 0,
    styles.indexOf('.shin-unsaved-actions { display: grid') < 0,
    styles.indexOf('.shin-unsaved-actions > * + *') < 0
  ], [true, true, true]);
}

async function chay(so) {
  section('Dirty guard Sidebar - compare, modal va scope');
  await testSoSanhVaLazy(so);
  await testModalVaActionCho(so);
  await testLoiVaKhoa(so);
  await testFormVaFbm(so);
  testCoreDiscardRestoresDom(so);
  testSurfaceAdapterContract(so);
  testCoordinatorUseCaseMatrix(so);
  testCoordinatorFailureMatrix(so);
  testFbmAdapterUseCaseMatrix(so);
  await testAllFbmSurfaceActionMatrix(so);
  await testProviderSaveResultMatrix(so);
  testHopDongTichHop(so);
}

module.exports = { chay };
