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
  ['1_ShinCRM_GAS/client/sync/fbmSync.html', 1704, 132602, 'B12', '~12 trách nhiệm: áp trạng thái, cầu nối relay, giữ nháp, vẽ, lắp sự kiện, RPC Extension, xung đột, danh tính, lưu cấu hình, kết nối, lệnh vận hành; thêm nhịp hỏi GAS khi máy không chở lượt (phần máy nền đã tách sang fbmSyncMachine.html)'],
  ['1_ShinCRM_GAS/client/sync/fbmSyncConfigEditor.html', 455, 25700, 'B12', 'trình soạn cấu hình + so username + báo chưa lưu + gom ô thành phần cài đặt gửi GAS; bảng ô của tiến trình nền dựng từ danh sách GAS'],
  ['1_ShinCRM_GAS/client/sync/screens/settings.html', 251, 31073, 'B12', 'một màn; dài vì dòng dày (TB 136 ký tự/dòng); thêm lỗi khóa hỏng kèm nút đặt về mặc định, khối máy chạy nền'],
  ['1_ShinCRM_GAS/client/ui/actions.html', 239, 11740, 'giữ', 'bảng hành động; thêm hai nút của thông báo chờ chấp thuận đẩy'],
  ['1_ShinCRM_GAS/client/ui/combo.html', 201, 9219, 'giữ', 'ô gõ-để-lọc'],
  ['1_ShinCRM_GAS/client/ui/popupList.html', 317, 13073, 'giữ', 'popup nổi'],
  ['1_ShinCRM_GAS/client/ui/renderEngine.html', 656, 40224, 'UI', 'tự chia 4 việc: thoát ký tự, spatial, dựng chuỗi, gắn DOM'],
  ['1_ShinCRM_GAS/client/ui/screenBuild.html', 207, 9920, 'giữ', 'dựng màn'],
  ['1_ShinCRM_GAS/client/ui/uiBuilder.html', 264, 15919, 'giữ', 'bộ dựng Block'],
  ['1_ShinCRM_GAS/client/ui/unsavedChanges.html', 355, 17450, 'UI', 'cảnh báo chưa lưu + hộp quyết định dùng chung'],
  ['1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js', 397, 33902, 'B11', 'cấu hình đăng nhập + chính sách + luồng cursor'],
  ['1_ShinCRM_GAS/fbm_sync/control/ControlPort.js', 239, 18191, 'B4', 'một việc: cổng lệnh'],
  ['1_ShinCRM_GAS/fbm_sync/diagnostic/Trace.js', 283, 19580, 'B4', 'vết kỹ thuật + bước nghiệp vụ; thêm cổng gửi dòng Log thường cho cửa lệnh ghi (`callLogAdd`)'],
  ['1_ShinCRM_GAS/fbm_sync/read/ActivityLayers.js', 291, 23207, 'B8', 'các lớp quét giao dịch'],
  ['1_ShinCRM_GAS/fbm_sync/read/GridRead.js', 319, 27386, 'B8', 'đọc lưới FBM; thêm lệnh cắt cột meta.keep và một cửa đọc lưới đã cắt (gridKeep, gridPicked); cài đặt dựng request đã tách sang RequestSettings.js'],
  ['1_ShinCRM_GAS/fbm_sync/write/PushCandidates.js', 209, 16262, 'B9', 'một việc: chọn ứng viên đẩy và các phép quyết thuần của cổng chặng đẩy (bỏ chặng, ngưỡng chấp thuận, dấu tập)'],
  ['1_ShinCRM_GAS/fbm_sync/reconcile/Conflict.js', 243, 22027, 'B9', 'một việc'],
  ['1_ShinCRM_GAS/fbm_sync/reconcile/Identity.js', 305, 25395, 'B11', 'liên kết tài khoản, kiểm danh tính, dựng record; hai hàm dựng tự tính dấu vân một lần trên bản ghi'],
  ['1_ShinCRM_GAS/fbm_sync/reconcile/Pull.js', 270, 23806, 'B8', 'một cửa ghi kéo về pullPageApply, nhận ngữ cảnh lời gọi qua tham số; dòng đăng ký người gác xóa hẳn phải nằm cùng tệp với hàm gác'],
  ['1_ShinCRM_GAS/fbm_sync/report/Report.js', 236, 22255, 'B12', 'nhãn, statusView, ghi issue, preview, bản xem máy chạy nền'],
  ['1_ShinCRM_GAS/fbm_sync/state/State.js', 426, 36369, 'B4', 'ô lượt, sổ đã thấy, kho đẩy, vòng đời lượt; thêm trường activeRequestReplay vào ô lượt mặc định; cổng chặng đẩy thay dấu sạch, danh sách đẩy mang dấu vân; B9: thêm conflictCountShift, công cụ duy nhất dời số xung đột trên ô lượt'],
  ['1_ShinCRM_GAS/fbm_sync/transport/ActivityBatch.js', 286, 23447, 'B8', 'một việc (lô giao dịch); chặng theo hợp đồng chung trả dòng Log thay vì tự ghi'],
  ['1_ShinCRM_GAS/fbm_sync/transport/PullFlow.js', 621, 48202, 'B4/B8', 'mở lượt, quét khách, continueStep'],
  ['1_ShinCRM_GAS/fbm_sync/transport/PushFlow.js', 462, 41878, 'B9', 'các bước của một ứng viên đẩy (mở form, lưu, tra lại MST, đọc xác nhận, dọn dấu) và hai pha áp kết quả; một chuỗi thao tác của một lệnh ghi, tách tiếp khi gộp bộ dựng request vào PushRequests'],
  ['1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js', 594, 47831, 'B4/B8', 'cờ, cổng phiên, phát phong bì; bảng khai REQUEST_REPLAY nằm cạnh cổng phát requestIssue vì chỉ cổng đó và bảng lỗi đường truyền dùng nó; B9: hàm dựng request nhận cfg qua tham số, lô tra mã nhận phần mã đã đọc'],
  ['1_ShinCRM_GAS/server/Triggers.js', 228, 12605, 'giữ', 'trigger Sheet'],
  ['1_ShinCRM_GAS/fbm_sync/transport/PushStage.js', 257, 21372, 'B9', 'người điều phối chặng đẩy theo hợp đồng chung: nhận response, quét lại và cổng chấp thuận, xét từng mã của danh sách, chốt lượt; một việc, tách tiếp nếu thêm kiểu dấu mới'],
  ['1_ShinCRM_GAS/fbm_sync/state/Slice.js', 235, 17792, 'B8', 'một việc: khung lát (lát, bảng cursor, cửa nhận response, khung chạy chặng theo hợp đồng chung); thêm dòng bảng cho chặng đọc lô giao dịch và quét giao dịch, `stageCall` dùng chung cho chặng và đường cứu việc quét; nhánh dừng khi lượt chạm trần phát lại request; B9: hàm dựng request nhận cfg qua tham số, lô tra mã nhận phần mã đã đọc; B9: hai dòng bảng cho kiểu dấu của chặng đẩy; B9: dòng bảng chặng mở xung đột theo hợp đồng chung'],
  ['1_ShinCRM_GAS/server/dev/FbmPerfProbe.js', 235, 18000, 'dev', 'một việc: bộ bọc đo thời gian đồng bộ (bọc, gộp số, báo cáo); thêm tên bọc lần hỏi nền và cất riêng lần gọi chậm'],
  ['1_ShinCRM_GAS/server/dev/FbmSyncFixture.js', 205, 17329, 'dev', 'một việc: dựng dữ liệu thử đồng bộ trên Sheet DEV qua cửa bản ghi'],
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
  ['2_ShinCRM_Extension/background/service_worker.js', 862, 61950, 'B4/B6/B11', 'điều khiển tab, kho credential, gọi relay, vòng relay, đăng ký sự kiện, lệnh chuông GAS'],
  ['2_ShinCRM_Extension/content_scripts/bridge/iframe_bridge.js', 236, 12858, 'giữ', 'cầu postMessage'],
  ['2_ShinCRM_Extension/content_scripts/fbm_sync/executor.js', 400, 33063, 'B11', 'md5, đăng nhập, đọc/cắt response, executor; cắt cột theo lệnh keep của GAS cho mọi lưới'],
  ['2_ShinCRM_Extension/content_scripts/model/live_model_reader.js', 485, 23041, 'giữ', 'một người điều phối đọc model Sheets'],
  ['2_ShinCRM_Extension/content_scripts/scout/sheet_scout.js', 228, 9099, 'giữ', 'trinh sát Sheet'],
  ['tests/cases/actions.js', 289, 15986, 'giữ', 'một module'],
  ['tests/cases/domUi.js', 257, 13792, 'giữ', 'một module'],
  ['tests/cases/extensionBridge.js', 1016, 106939, 'B4', 'kiểm bridge, scout, service worker, executor + quét chữ GAS/Sidebar'],
  ['tests/cases/fbmSync/AutoLogin.js', 493, 74891, 'B11/B4', 'gần một module; dài vì check dài (TB 155 ký tự/dòng); thêm dòng dựng chính sách qua cổng cài đặt'],
  ['tests/cases/fbmSync/Components.js', 243, 15773, 'B12', 'quét component Sidebar đồng bộ'],
  ['tests/cases/fbmSync/Orchestration.js', 234, 22566, 'B8', 'nâng trần khi bỏ recordHoldsPeekOwner (đọc sổ bận qua kho thử); đã tách liên kết, cổng Web App, bộ đệm kho; phần còn lại kiểm khung lượt qua chặng đọc/đẩy cũ (thử lại lát, trace, giữ bản ghi), tách khi viết lại chặng ở B8, B9; nạp thêm tệp tách khỏi CategoryGate, PushCandidates, Preflight; nạp tệp chặng quét khách; ô lượt tiếp tục mang tên cột gốc của lượt; B9: hàm dựng request nhận cfg qua tham số, lô tra mã nhận phần mã đã đọc'],
  ['tests/cases/fbmSync/Preflight.js', 234, 22489, 'B9', 'một module; chỉ dài vì check dài, đã xuống dòng check theo nhãn, giá trị nhận, giá trị mong đợi; B9: hàm dựng request nhận cfg qua tham số, lô tra mã nhận phần mã đã đọc'],
  ['tests/cases/fbmSync/ProductionMatrix.js', 717, 70120, 'B4/B8/B9', 'ma trận FBM-0xx: cursor, lỗi kéo/đẩy, xung đột, hash; nạp công cụ dựng cài đặt thử; nạp thêm tệp tách khỏi CategoryGate, PushCandidates, Preflight; nạp tệp chặng quét khách; lưới thử đi qua executor thật để cắt cột; B9: hàm dựng request nhận cfg qua tham số, lô tra mã nhận phần mã đã đọc'],
  ['tests/cases/fbmSync/Push.js', 359, 46468, 'B9', 'một hộp chặng đẩy dùng chung trạng thái tuần tự từ đầu tới cuối (phát request, áp hai pha, lỗi, form Activity, dọn #SC, cứu lệnh tạo); B9: đã tách mở lượt sang RunStartProbe.js, danh sách ứng viên sang PushCandidateList.js, cấu hình chặn sang PushConfig.js; tách tiếp cần dựng hộp đẩy dùng chung ở tests/lib'],
  ['tests/cases/fbmSync/ScanJob.js', 312, 27080, 'B8', 'một module; dài vì dựng hộp; giao máy nền trong hộp; lỗi chặng đi đường lỗi chung; B9: hàm dựng request nhận cfg qua tham số, lô tra mã nhận phần mã đã đọc'],
  ['tests/cases/fbmSync/Sidebar.js', 993, 105470, 'B12', 'kiểm 7 màn đồng bộ'],
  ['tests/cases/fbmSync/StaticRules.js', 359, 23289, 'giữ', 'một việc: luật tĩnh của đồng bộ FBM, mỗi luật một danh sách ngoại lệ'],
  ['tests/cases/fbmSync/UserJourneys.js', 390, 34921, 'B12', 'hành trình Sidebar; thêm hành trình lưu ô sai, khóa hỏng và đặt về mặc định'],
  ['tests/cases/fbmSync/Workflow.js', 1366, 132752, 'B4/B8/B9', 'kiểm ~10 module GAS + executor + service worker; khung dựng hộp dùng chéo; ca đường truyền đứt một lần rồi gửi lại lô đọc; B9: hàm dựng request nhận cfg qua tham số, lô tra mã nhận phần mã đã đọc'],
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
  ['tests/cases/sheetReadCopy.js', 262, 15614, 'giữ', 'một module; nạp thêm tệp tách khỏi CategoryGate, PushCandidates, Preflight; decide đọc qua cửa trước khi ghi vì cửa bản ghi buộc nguồn máy đọc trong khóa'],
  ['tests/cases/sheetTiers.js', 277, 17782, 'giữ', 'một module; nâng trần khi thêm ca sổ người gác xóa hẳn: sai hình dạng, không phải hàm, hai người gác, sổ trống'],
  ['tests/cases/triggers.js', 292, 16427, 'giữ', 'một module'],
  ['tests/cases/uiBuilder.js', 205, 15382, 'giữ', 'hai module gần nhau, nhỏ'],
  ['tests/cases/uiSchema.js', 222, 12817, 'giữ', 'một module'],
  ['tests/cases/unsavedChanges.js', 831, 52800, 'UI', 'một chủ đề, nhiều module phụ (adapter FBM, saveFlow, hộp quyết định)'],
  ['tests/cases/view/viewSheetRenderer.js', 236, 17275, 'giữ', 'một module ViewSheetRenderer'],
  ['tests/lib/dom-gia.js', 203, 9215, 'giữ', 'DOM giả'],
  ['tests/lib/fake-sheet.js', 464, 22724, 'giữ', 'một việc: Sheet giả'],
  ['tests/preview.js', 258, 17700, 'giữ', 'công cụ xem Sidebar, một việc; chèn dữ liệu GAS như trang thật'],
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
