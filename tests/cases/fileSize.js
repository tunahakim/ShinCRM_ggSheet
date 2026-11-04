/**
 * Cỡ tệp toàn repo: tệp vượt ngưỡng là dấu hiệu lẫn nhiều việc, nên phải có tên trong danh sách ngoại lệ kèm nhóm sẽ xử lý và lý do. Ngưỡng chỉ là dấu hiệu; tệp nhỏ mà vẫn lẫn hai việc thì chỉ người duyệt thấy.
 *
 * Mỗi ngoại lệ ghi số dòng và byte đo lúc ghi làm trần. Đỏ khi: tệp vượt ngưỡng mà không có tên; tệp có tên đã về dưới ngưỡng (xóa dòng); tệp có tên lớn hơn trần (tách ra, hoặc nâng trần kèm lý do để người duyệt thấy). Tệp nhóm `dev` cũng có trần: hàm dò mới vào tệp đúng chủ đề chứ không dồn vào tệp đang mở.
 *
 * Đo trên nội dung đã đổi CRLF thành LF, để cùng một tệp cho cùng số đo dù Git trả về kiểu xuống dòng nào.
 */

const fs = require('fs');
const path = require('path');
const { section, check } = require('../lib/assert');
const { lietTrong } = require('../lib/quet/liet-tep');

const NGUONG = { dong: 200, byte: 20 * 1024 };
const PHAM_VI = ['1_ShinCRM_GAS', '2_ShinCRM_Extension', 'tests'];
const LA_MA = (ten) => /\.(?:js|html|css)$/.test(ten);
const GOC = path.join(__dirname, '..', '..');

/** [đường dẫn, trần dòng, trần byte, nhóm sẽ xử lý, lý do]. Chỉ được hạ trần hoặc xóa dòng; nâng trần thì lý do phải nói vì sao. */
const NGOAI_LE = [
  ['1_ShinCRM_GAS/client/link/selectionPoll.html', 254, 11066, 'giữ', 'bộ thăm dò chọn'],
  ['1_ShinCRM_GAS/client/link/sheetLink.html', 693, 38369, 'UI', 'cầu nối Extension, read plan, điều phối reload, áp ngữ cảnh'],
  ['1_ShinCRM_GAS/client/ram/bootstrap.html', 253, 13850, 'UI', 'khởi động Sidebar'],
  ['1_ShinCRM_GAS/client/ram/refresh.html', 226, 11347, 'giữ', 'áp reload vào RAM'],
  ['1_ShinCRM_GAS/client/ram/store.html', 300, 16906, 'giữ', 'kho RAM'],
  ['1_ShinCRM_GAS/client/save/saveFlow.html', 262, 14231, 'UI', 'luồng lưu form'],
  ['1_ShinCRM_GAS/client/schema/schemaCheck.html', 225, 11390, 'giữ', 'kiểm schema'],
  ['1_ShinCRM_GAS/client/style/components.html', 649, 34604, 'UI', 'CSS 5 nhóm component'],
  ['1_ShinCRM_GAS/client/style/frame.html', 225, 9802, 'giữ', 'CSS khung'],
  ['1_ShinCRM_GAS/client/sync/fbmSync.html', 1681, 132602, 'B12', '~12 trách nhiệm: áp trạng thái, cầu nối relay, giữ nháp, vẽ, lắp sự kiện, RPC Extension, xung đột, danh tính, lưu cấu hình, kết nối, lệnh vận hành'],
  ['1_ShinCRM_GAS/client/sync/fbmSyncConfigEditor.html', 455, 25206, 'B12', 'trình soạn cấu hình + so username + báo chưa lưu + gom ô thành phần cài đặt gửi GAS'],
  ['1_ShinCRM_GAS/client/sync/screens/settings.html', 214, 28074, 'B12', 'một màn; dài vì dòng dày (TB 136 ký tự/dòng); thêm lỗi khóa hỏng kèm nút đặt về mặc định'],
  ['1_ShinCRM_GAS/client/ui/actions.html', 237, 11500, 'giữ', 'bảng hành động'],
  ['1_ShinCRM_GAS/client/ui/combo.html', 201, 9219, 'giữ', 'ô gõ-để-lọc'],
  ['1_ShinCRM_GAS/client/ui/popupList.html', 317, 13073, 'giữ', 'popup nổi'],
  ['1_ShinCRM_GAS/client/ui/renderEngine.html', 656, 40224, 'UI', 'tự chia 4 việc: thoát ký tự, spatial, dựng chuỗi, gắn DOM'],
  ['1_ShinCRM_GAS/client/ui/screenBuild.html', 207, 9920, 'giữ', 'dựng màn'],
  ['1_ShinCRM_GAS/client/ui/uiBuilder.html', 264, 15919, 'giữ', 'bộ dựng Block'],
  ['1_ShinCRM_GAS/client/ui/unsavedChanges.html', 355, 17450, 'UI', 'cảnh báo chưa lưu + hộp quyết định dùng chung'],
  ['1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js', 397, 33902, 'B11', 'cấu hình đăng nhập + chính sách + luồng cursor'],
  ['1_ShinCRM_GAS/fbm_sync/control/ControlPort.js', 239, 18191, 'B4', 'một việc: cổng lệnh'],
  ['1_ShinCRM_GAS/fbm_sync/diagnostic/Trace.js', 271, 18614, 'B4', 'vết kỹ thuật + bước nghiệp vụ'],
  ['1_ShinCRM_GAS/fbm_sync/read/ActivityLayers.js', 322, 25353, 'B8', 'các lớp quét giao dịch'],
  ['1_ShinCRM_GAS/fbm_sync/read/GridRead.js', 305, 23437, 'B8', 'đọc lưới FBM'],
  ['1_ShinCRM_GAS/fbm_sync/reconcile/CategoryGate.js', 233, 15360, 'B7', 'một việc'],
  ['1_ShinCRM_GAS/fbm_sync/reconcile/Conflict.js', 243, 22027, 'B9', 'một việc'],
  ['1_ShinCRM_GAS/fbm_sync/reconcile/Identity.js', 307, 25278, 'B7/B11', 'liên kết tài khoản, kiểm danh tính, dựng record'],
  ['1_ShinCRM_GAS/fbm_sync/reconcile/Pull.js', 262, 22554, 'B8', 'một người điều phối pullWrite'],
  ['1_ShinCRM_GAS/fbm_sync/report/Report.js', 234, 22006, 'B12', 'nhãn, statusView, ghi issue, preview'],
  ['1_ShinCRM_GAS/fbm_sync/state/Scheduler.js', 450, 37753, 'B6', 'lịch nền, chọn việc đến hạn, chuỗi + heartbeat'],
  ['1_ShinCRM_GAS/fbm_sync/state/State.js', 420, 35202, 'B4', 'ô lượt, sổ đã thấy, kho đẩy, vòng đời lượt'],
  ['1_ShinCRM_GAS/fbm_sync/transport/ActivityBatch.js', 322, 27593, 'B8', 'một việc (lô giao dịch)'],
  ['1_ShinCRM_GAS/fbm_sync/transport/PullFlow.js', 617, 47514, 'B4/B8', 'mở lượt, quét khách, continueStep'],
  ['1_ShinCRM_GAS/fbm_sync/transport/PushFlow.js', 603, 52848, 'B9', 'xác minh sau ghi, lỗi đẩy, điều phối chặng đẩy'],
  ['1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js', 574, 44060, 'B4', 'cờ, cổng phiên, phát phong bì'],
  ['1_ShinCRM_GAS/fbm_sync/write/PushCandidates.js', 220, 16485, 'B7/B9', 'ứng viên đẩy'],
  ['1_ShinCRM_GAS/server/Triggers.js', 228, 12605, 'giữ', 'trigger Sheet'],
  ['1_ShinCRM_GAS/server/dev/FbmPerfProbe.js', 219, 16490, 'dev', 'một việc: bộ bọc đo thời gian đồng bộ (bọc, gộp số, báo cáo)'],
  ['1_ShinCRM_GAS/server/dev/FbmSyncFixture.js', 205, 17225, 'dev', 'một việc: dựng dữ liệu thử đồng bộ trên Sheet DEV qua cửa bản ghi'],
  ['1_ShinCRM_GAS/server/dev/SeedFake.js', 239, 12511, 'dev', 'một việc: dữ liệu giả; hàm còn dùng'],
  ['1_ShinCRM_GAS/server/dev/reload/ReloadMatrixProbe.js', 322, 19303, 'dev', 'một ma trận reload; mỗi ca ghi, kiểm rồi trả lại ô nên dài'],
  ['1_ShinCRM_GAS/server/gate/WriteGate.js', 519, 33964, 'B8', 'một cửa ghi; công cụ kiểm nằm chung người điều phối'],
  ['1_ShinCRM_GAS/server/log/LogGate.js', 283, 16840, 'giữ', 'bộ đệm và định dạng dòng Log, flushLog điều phối; che bí mật và thao tác sheet Log đã tách'],
  ['1_ShinCRM_GAS/server/service/LoadService.js', 410, 21685, 'giữ', 'một việc: nạp dữ liệu cho Sidebar'],
  ['1_ShinCRM_GAS/server/service/SelectionService.js', 316, 15689, 'giữ', 'dò chọn + read plan'],
  ['1_ShinCRM_GAS/server/sheet/EntityRead.js', 277, 16336, 'giữ', 'đọc thực thể'],
  ['1_ShinCRM_GAS/server/sheet/SheetReadCopy.js', 243, 13698, 'giữ', 'cổng đọc Sheet có đệm'],
  ['1_ShinCRM_GAS/server/state/DirtyState.js', 202, 12799, 'giữ', 'state dirty'],
  ['1_ShinCRM_GAS/server/state/DocumentStore.js', 252, 15622, 'B10', 'khóa + đệm DocumentProperties'],
  ['1_ShinCRM_GAS/server/state/ReloadDecision.js', 237, 12272, 'giữ', 'quyết định reload'],
  ['1_ShinCRM_GAS/server/view/ViewSheetRenderer.js', 395, 21473, 'giữ', 'một việc: vẽ sheet quản trị'],
  ['2_ShinCRM_Extension/background/service_worker.js', 838, 59214, 'B4/B6/B11', 'điều khiển tab, kho credential, gọi relay, vòng relay, đăng ký sự kiện'],
  ['2_ShinCRM_Extension/content_scripts/bridge/iframe_bridge.js', 235, 12814, 'giữ', 'cầu postMessage'],
  ['2_ShinCRM_Extension/content_scripts/fbm_sync/executor.js', 394, 31851, 'B11', 'md5, đăng nhập, đọc/cắt response, executor'],
  ['2_ShinCRM_Extension/content_scripts/model/live_model_reader.js', 485, 23041, 'giữ', 'một người điều phối đọc model Sheets'],
  ['2_ShinCRM_Extension/content_scripts/scout/sheet_scout.js', 228, 9099, 'giữ', 'trinh sát Sheet'],
  ['tests/cases/actions.js', 289, 15986, 'giữ', 'một module'],
  ['tests/cases/domUi.js', 257, 13792, 'giữ', 'một module'],
  ['tests/cases/extensionBridge.js', 998, 103863, 'B4', 'kiểm bridge, scout, service worker, executor + quét chữ GAS/Sidebar'],
  ['tests/cases/fbmSync/AutoLogin.js', 490, 74551, 'B11/B4', 'gần một module; dài vì check dài (TB 155 ký tự/dòng); thêm dòng dựng chính sách qua cổng cài đặt'],
  ['tests/cases/fbmSync/Components.js', 243, 15773, 'B12', 'quét component Sidebar đồng bộ'],
  ['tests/cases/fbmSync/Orchestration.js', 526, 74448, 'B4/B6', 'nhiều module: heartbeat, scheduler, status, PropertyBuffer; check dài; thêm dòng dựng công tắc và phạm vi qua cổng cài đặt'],
  ['tests/cases/fbmSync/Preflight.js', 184, 22842, 'B7/B9', 'một module; chỉ dài vì check dài'],
  ['tests/cases/fbmSync/ProductionMatrix.js', 709, 69071, 'B4/B8/B9', 'ma trận FBM-0xx: cursor, lỗi kéo/đẩy, xung đột, hash; nạp công cụ dựng cài đặt thử'],
  ['tests/cases/fbmSync/Pull.js', 527, 65915, 'B8', 'nhiều khía cạnh kéo; check dài'],
  ['tests/cases/fbmSync/Push.js', 529, 66436, 'B9', 'một tiến trình đẩy; check dài; thêm dòng dựng phạm vi qua cổng cài đặt'],
  ['tests/cases/fbmSync/RelayLoop.js', 284, 24631, 'B4/B6', '3 module Extension'],
  ['tests/cases/fbmSync/ScanJob.js', 341, 30210, 'B8', 'một module; dài vì dựng hộp'],
  ['tests/cases/fbmSync/Sidebar.js', 1053, 109417, 'B12', 'kiểm 7 màn đồng bộ; khung taoBoTest dùng chéo'],
  ['tests/cases/fbmSync/StaticRules.js', 359, 23289, 'giữ', 'một việc: luật tĩnh của đồng bộ FBM, mỗi luật một danh sách ngoại lệ'],
  ['tests/cases/fbmSync/UserJourneys.js', 390, 34775, 'B12', 'hành trình Sidebar; thêm hành trình lưu ô sai, khóa hỏng và đặt về mặc định'],
  ['tests/cases/fbmSync/Workflow.js', 1333, 128339, 'B4/B8/B9', 'kiểm ~10 module GAS + executor + service worker; khung dựng hộp dùng chéo'],
  ['tests/cases/formScreen.js', 217, 13914, 'giữ', 'một module'],
  ['tests/cases/link/selectionPoll.js', 452, 36269, 'giữ', 'một module (dự phòng chọn ô, nạp lại, debounce, safety poll); nhiều ca theo đồng hồ giả'],
  ['tests/cases/listPicker.js', 201, 8913, 'giữ', 'một module; qua 200 dòng vì xuống dòng lệnh check'],
  ['tests/cases/liveModelReader.js', 299, 17380, 'giữ', 'một module'],
  ['tests/cases/loadService.js', 284, 18325, 'giữ', 'một module'],
  ['tests/cases/logGate.js', 235, 17638, 'giữ', 'kiểm cửa Log'],
  ['tests/cases/ramStore.js', 241, 14839, 'giữ', 'một module'],
  ['tests/cases/renderEngine.js', 411, 29616, 'UI', 'renderEngine + combo/picker + quét innerHTML'],
  ['tests/cases/schemaCheck.js', 215, 13887, 'giữ', 'một module'],
  ['tests/cases/selectionService.js', 354, 22556, 'giữ', 'một module'],
  ['tests/cases/sheetReadCopy.js', 262, 15464, 'giữ', 'một module'],
  ['tests/cases/sheetTiers.js', 251, 15467, 'giữ', 'một module'],
  ['tests/cases/triggers.js', 292, 16427, 'giữ', 'một module'],
  ['tests/cases/uiBuilder.js', 205, 15382, 'giữ', 'hai module gần nhau, nhỏ'],
  ['tests/cases/uiSchema.js', 222, 12817, 'giữ', 'một module'],
  ['tests/cases/unsavedChanges.js', 831, 52800, 'UI', 'một chủ đề, nhiều module phụ (adapter FBM, saveFlow, hộp quyết định)'],
  ['tests/cases/view/viewSheetRenderer.js', 236, 17275, 'giữ', 'một module ViewSheetRenderer'],
  ['tests/lib/dom-gia.js', 203, 9215, 'giữ', 'DOM giả'],
  ['tests/lib/fake-sheet.js', 464, 22724, 'giữ', 'một việc: Sheet giả'],
  ['tests/preview.js', 254, 17278, 'giữ', 'công cụ xem Sidebar, một việc'],
];

/** Số dòng và byte của một nội dung, sau khi đổi CRLF thành LF. */
function doCo(noiDung) {
  const s = noiDung.replace(/\r\n/g, '\n');
  const dong = s.length === 0 ? 0 : s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
  return { dong, byte: Buffer.byteLength(s, 'utf8') };
}

/** So số đo `{ tệp: { dong, byte } }` với danh sách ngoại lệ; trả danh sách thông báo lỗi (rỗng là đạt). */
function soTran(doDuoc, ngoaiLe, nguong) {
  const vuot = (co) => co.dong > nguong.dong || co.byte > nguong.byte;
  const ghi = {};
  const loi = [];
  ngoaiLe.forEach(([tep, dong, byte, nhom, lyDo]) => {
    if (ghi[tep]) { loi.push(tep + ' ghi hai lần'); }
    if (!nhom || !lyDo) { loi.push(tep + ' thiếu nhóm hoặc lý do'); }
    ghi[tep] = { dong, byte };
  });
  Object.keys(doDuoc).sort().forEach((tep) => {
    const co = doDuoc[tep];
    const tran = ghi[tep];
    if (!tran) {
      if (vuot(co)) { loi.push(tep + ' vượt ngưỡng (' + co.dong + ' dòng, ' + co.byte + ' byte) mà không có trong danh sách: tách theo trách nhiệm, hoặc thêm dòng kèm nhóm và lý do'); }
    } else if (!vuot(co)) {
      loi.push(tep + ' đã về dưới ngưỡng, xóa khỏi danh sách');
    } else if (co.dong > tran.dong || co.byte > tran.byte) {
      loi.push(tep + ' lớn hơn trần (' + co.dong + '/' + tran.dong + ' dòng, ' + co.byte + '/' + tran.byte + ' byte): tách ra, hoặc nâng trần kèm lý do');
    }
  });
  Object.keys(ghi).sort().forEach((tep) => { if (!doDuoc[tep]) { loi.push(tep + ' không còn, xóa khỏi danh sách'); } });
  return loi;
}

function chay(so) {
  section('Cỡ tệp — vượt ngưỡng phải có tên, trần chỉ co lại');

  const doDuoc = {};
  PHAM_VI.forEach((thuMuc) => lietTrong(GOC, thuMuc, LA_MA).forEach((tep) => {
    doDuoc[tep] = doCo(fs.readFileSync(path.join(GOC, tep), 'utf8'));
  }));
  check(so, 'phạm vi đo có tệp của cả ba thư mục', PHAM_VI.map((thuMuc) => Object.keys(doDuoc).some((tep) => tep.indexOf(thuMuc + '/') === 0)), [true, true, true]);
  check(so, 'mọi tệp vượt ' + NGUONG.dong + ' dòng hoặc ' + NGUONG.byte + ' byte có tên, không lớn hơn trần', soTran(doDuoc, NGOAI_LE, NGUONG), []);

  // Chính phép so phải bắt đủ từng trường hợp, nếu không danh sách rỗng chỉ là phép kiểm không kiểm gì.
  const nho = { dong: 2, byte: 10 };
  const mau = {
    'moi.js': { dong: 3, byte: 5 },
    've.js': { dong: 1, byte: 5 },
    'phinh.js': { dong: 4, byte: 20 },
    'giu.js': { dong: 3, byte: 11 },
    'nho.js': { dong: 1, byte: 1 }
  };
  const ds = [['ve.js', 3, 20, 'giữ', 'x'], ['phinh.js', 3, 20, 'giữ', 'x'], ['giu.js', 3, 11, 'B4', 'x'], ['mat.js', 3, 20, 'dev', 'x'], ['giu.js', 3, 11, '', '']];
  check(so, 'phép so bắt: tệp mới vượt, tệp về dưới ngưỡng, tệp lớn hơn trần, tệp đã mất, dòng trùng, thiếu nhóm hay lý do', soTran(mau, ds, nho).map((loi) => loi.split(' ')[0]).sort(), ['giu.js', 'giu.js', 'mat.js', 'moi.js', 'phinh.js', 've.js']);
  check(so, 'đo theo LF: CRLF và LF cùng số đo, dòng cuối không xuống dòng vẫn đếm', [doCo('a\r\nb\r\n'), doCo('a\nb'), doCo('')], [{ dong: 2, byte: 4 }, { dong: 2, byte: 3 }, { dong: 0, byte: 0 }]);
}

module.exports = { chay };
