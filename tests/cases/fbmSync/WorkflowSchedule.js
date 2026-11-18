/**
 * Cài đặt lịch nền chỉ có một nơi lưu và một đường đọc: công tắc, chu kỳ, chiều, số khách mỗi phiên, kiểm ô, hỏi lại khi chu kỳ quá thấp, cách tính đến hạn từ giờ chạy xong.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas, trongLat } = require('../../lib/fbm/hop-dong-bo');
const { datNen, datPhan, docPhan, datLichNen, docLichNen, vaSoNen } = require('../../lib/fbm/cai-dat-thu');
const { datState } = require('../../lib/fbm/dat-state');

async function chay(so) {
  section('FBM sync — cài đặt lịch nền và nhịp Extension');
  const scheduleFlow = workflowGas();
  const SH = scheduleFlow.hop, SF = SH.FbmSync, NEN = SF.SETTING_SECTIONS.background;
  check(so, 'cau hinh Extension mac dinh mot nhip 5 phut va startup bat',
    [docPhan(SH, 'extension').pollMinutes, docPhan(SH, 'extension').runOnStartup],
    [5, true]);
  const scheduleDefaults = docLichNen(SH);
  check(so, 'Lịch nền mặc định theo bảng tiến trình: Giữ phiên 5 phút, Quét nhanh 60 phút bật, Lấy toàn bộ giao dịch 8 giờ tắt, Vòng xoay 30 phút 30 khách tắt',
    [scheduleDefaults.heartbeat.minutes, scheduleDefaults.customerFull.enabled, scheduleDefaults.customerFull.minutes, scheduleDefaults.activityFull.enabled, scheduleDefaults.activityFull.minutes, scheduleDefaults.detail.enabled, scheduleDefaults.detail.minutes, scheduleDefaults.detail.customersPerRun],
    [5, true, 60, false, 480, false, 30, 30]);
  const savedExtension = datPhan(SH, 'extension', { pollMinutes: 15, runOnStartup: false });
  check(so, 'cau hinh Extension cho phep doi nhip nhung khong doi lich nghiep vu',
    [savedExtension.pollMinutes, savedExtension.runOnStartup, docLichNen(SH).heartbeat.minutes],
    [15, false, 5]);
  const savedSchedule = datLichNen(SH, { heartbeat: { enabled: false, minutes: 10 }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: false, minutes: 30 } });
  check(so, 'GAS luu cong tac va chu ky tung tien trinh nen',
    [savedSchedule.heartbeat.enabled, savedSchedule.heartbeat.minutes, savedSchedule.activityFull.enabled],
    [false, 10, false]);
  // Công tắc lịch nền chỉ có một nơi lưu (phần cài đặt lịch nền): tắt thì card thấy tắt và lịch nền không cấp việc, bật lại thì mọi nơi đọc cùng thấy bật.
  const switchOff = datNen(SH, false);
  const offCard = docLichNen(SH).enabled;
  const offPick = SF.heartbeatRun({ trigger: 'alarm', machineId: 'may-A' });
  datNen(SH, true);
  check(so, 'công tắc lịch nền chỉ một nơi lưu, tắt thì card và lịch nền cùng tắt',
    [switchOff.enabled, offCard, offPick.code, docPhan(SH, 'background').enabled, scheduleFlow.documentProperties.getProperty('FBM_SYNC_BACKGROUND_ENABLED')],
    [false, false, 'BACKGROUND_OFF', true, null]);
  const directionSchedule = datLichNen(SH, {
    enabled: true, direction: 'write',
    heartbeat: { enabled: true, minutes: 5 },
    customerFull: { enabled: true, minutes: 480 },
    activityFull: { enabled: false, minutes: 1440 },
    detail: { enabled: true, minutes: 60, customersPerRun: 50 }
  });
  check(so, 'Lịch nền lưu chiều hai chiều và số khách mỗi phiên',
    [directionSchedule.direction, directionSchedule.detail.enabled, directionSchedule.detail.customersPerRun, docPhan(SH, 'background').enabled],
    ['write', true, 50, true]);
  const cursorTruoc = scheduleFlow.hop.FbmSync.detailCursorRead();
  const XF = scheduleFlow.hop.FbmSync;
  XF.processBookWrite(XF.processBookMarks(XF.processBookRead(), { rotationCursor: 42 }));
  check(so, 'Cursor Vòng xoay là số CUS trong sổ tiến trình: chưa có thì là -1 (bắt đầu từ CUS nhỏ nhất), ghi 42 đọc lại 42',
    [cursorTruoc, XF.detailCursorRead()],
    [-1, 42]);
  const nhieuKhach = datLichNen(SH, { detail: { enabled: true, minutes: 60, customersPerRun: 300 } });
  const loiSoKhach = SH.settingsSave({ [NEN]: { detailCustomersPerRun: 0 } });
  check(so, 'Số khách mỗi phiên Vòng xoay không còn trần 50: lưu 300 đọc lại 300; 0 bị từ chối và không đổi số đã lưu',
    [nhieuKhach.detail.customersPerRun, docLichNen(SH).detail.customersPerRun, loiSoKhach.ok],
    [300, 300, false]);
  {
    const H = workflowGas().hop, F = H.FbmSync, truoc = JSON.stringify(docPhan(H, 'background'));
    const trong = F.settingsSaveCommand({ patches: { [NEN]: { heartbeatMinutes: 'abc', customerFullMinutes: -3, detailCustomersPerRun: 0 } } });
    check(so, 'Lịch nền: ô không phải số nguyên hoặc ngoài khoảng cho phép thì trả đủ từng ô sai để Sidebar tô đỏ và không lưu gì',
      [trong.code, trong.problems.map((p) => p.field).sort(), JSON.stringify(docPhan(H, 'background')) === truoc],
      ['SETTINGS_INVALID', ['customerFullMinutes', 'detailCustomersPerRun', 'heartbeatMinutes'], true]);
    const thap = F.settingsSaveCommand({ patches: { [NEN]: { heartbeatEnabled: true, heartbeatMinutes: '0', customerFullEnabled: true, customerFullMinutes: '5', activityFullEnabled: false, activityFullMinutes: '1' } } });
    check(so, 'Lịch nền: tiến trình khác Giữ phiên đang bật mà chu kỳ dưới 30 phút thì hỏi lại, chưa lưu; Giữ phiên 0 và tiến trình tắt không bị hỏi',
      [thap.code, /Quét nhanh 5 phút/.test(thap.message), /Giữ phiên|Lấy toàn bộ/.test(thap.message), JSON.stringify(docPhan(H, 'background')) === truoc],
      ['SCHEDULE_LOW_CONFIRM', true, false, true]);
    const dongY = F.settingsSaveCommand({ patches: { [NEN]: { heartbeatEnabled: true, heartbeatMinutes: '0', customerFullEnabled: true, customerFullMinutes: '5' } }, confirmLow: true });
    check(so, 'Lịch nền: người dùng xác nhận thì lưu, chu kỳ 0 được giữ là 0 khi đọc lại',
      [dongY.ok, docLichNen(H).heartbeat.minutes, docLichNen(H).customerFull.minutes], [true, 0, 5]);
    const now = Date.UTC(2026, 9, 16, 8, 0);
    F.processBookWrite(F.processBookMark(F.processBookRead(), 'heartbeat', 'done', now).book);
    {
      const hop = workflowGas().hop, vet = [];
      hop.logTrace = (entry) => vet.push(entry);
      datLichNen(hop, { heartbeat: { enabled: true, minutes: '5' }, customerFull: { enabled: true, minutes: '60' }, activityFull: { enabled: false }, detail: { enabled: false } });
      vaSoNen(hop.FbmSync, { heartbeat: { doneAt: Date.now() }, customerFull: { doneAt: Date.now() } });
      const hoi = hop.FbmSync.runSlice(() => hop.FbmSync.backgroundNext({ now: Date.now() + 60000, pollAt: Date.now() + 60000, book: hop.FbmSync.processBookRead() }));
      check(so, 'LOG_TRACE: lần Extension hỏi mà chưa có việc ghi một dòng vết nói tiến trình nào sớm nhất và còn bao lâu',
        [hoi, vet.map((v) => [v.source, v.action, v.reason])], [null, [['fbm_sync', 'schedule_idle', 'Extension hỏi lịch nền: chưa có tiến trình đến hạn; sớm nhất là Giữ phiên FBM, còn 4 phút.']]]);
    }
    {
      const GH = workflowGas().hop, G = GH.FbmSync, T = Date.UTC(2026, 9, 16, 9, 0), PHUT = 60000;
      datLichNen(GH, { heartbeat: { enabled: false }, customerFull: { enabled: true, minutes: '30' }, activityFull: { enabled: false }, detail: { enabled: false } });
      const chuaTungChay = G.processDue(T, docLichNen(GH), G.processBookRead(), 0);
      G.processBookWrite(G.processBookMark(G.processBookRead(), 'customerFull', 'done', T).book);
      check(so, 'Lịch nền: chưa từng chạy xong thì đến hạn ngay; chu kỳ tính từ giờ chạy xong, 29 phút sau chưa đến hạn, 30 phút sau đến hạn',
        [chuaTungChay, G.processDue(T + 29 * PHUT, docLichNen(GH), G.processBookRead(), 0), G.processDue(T + 30 * PHUT, docLichNen(GH), G.processBookRead(), 0)], [['customerFull'], [], ['customerFull']]);
      datLichNen(GH, { customerFull: { enabled: true, minutes: '60' } });
      const sau60 = [G.processBookRead().customerFull.doneAt, G.processDue(T + 30 * PHUT, docLichNen(GH), G.processBookRead(), 0)];
      datLichNen(GH, { customerFull: { enabled: true, minutes: '10' } });
      check(so, 'Lịch nền: lưu cài đặt không đụng giờ chạy xong; đổi chu kỳ có hiệu lực ngay tính từ lần chạy xong cũ',
        [sau60, G.processDue(T + 10 * PHUT, docLichNen(GH), G.processBookRead(), 0)], [[T, []], ['customerFull']]);
      datState(G, { runId: 'conflict-run', origin: 'background', phase: 'pull_customer', cursor: { kind: 'customer_grid' }, process: 'customerFull', pollAt: Date.now() });
      vaSoNen(G, { customerFull: { doneAt: 1 } });
      G.stateWrite(G.runClose(G.stateRead(), 'conflict', { message: 'Có xung đột cần người dùng xử lý.' }));
      trongLat(G, () => G.backgroundTail({ ok: true, request: null }));
      check(so, 'Lịch nền: lượt nền dừng ở xung đột vẫn tính là chạy xong (không chạy lại mỗi lần hỏi), chuỗi dừng chờ người dùng',
        [G.processBookRead().customerFull.doneAt > 1, G.stateRead().runId, G.stateRead().phase], [true, 'conflict-run', 'conflict']);
    }
    check(so, 'Chu kỳ 0: ghi giờ chạy xong, lần hỏi kế tiếp đến hạn ngay',
      [F.processBookRead().heartbeat.doneAt, F.processDue(now + 1, docLichNen(H), F.processBookRead(), 0).indexOf('heartbeat') >= 0], [now, true]);
  }
}

module.exports = { chay };
