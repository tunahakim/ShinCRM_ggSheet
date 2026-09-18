/**
 * Hợp đồng nghiệm thu offline cho các workflow FBM có thể chạy không cần tab
 * hay dữ liệu thật. Nguồn là Tài liệu 09.01, 09.02, 09.06, 09.08 và hợp đồng
 * log; không lấy tên hàm nội bộ làm tiêu chí đúng/sai.
 */
const WORKFLOWS = [
  {
    id: 'relay-sidebar-open',
    source: '09.01/09.06',
    trigger: 'Mở Sidebar',
    expect: ['Sidebar gửi đúng một cấu hình local', 'Extension không gọi /exec', 'Không gọi FBM']
  },
  {
    id: 'identity-autofill',
    source: '09.06/09.08',
    trigger: 'Tự động điền',
    expect: ['GAS cấp grid User', 'Extension chỉ chuyển envelope', 'GAS trả draft chưa lưu', 'Không quét Customer hoặc tự kiểm tra liên kết']
  },
  {
    id: 'identity-clear-binding',
    source: '09.06/09.08',
    trigger: 'Lưu bốn trường nhận diện rỗng',
    expect: ['Xóa binding', 'Giữ Sheet', 'Khóa đồng bộ thường']
  },
  {
    id: 'identity-login-test',
    source: '09.06/09.08',
    trigger: 'Đăng nhập thử',
    expect: ['Login mềm force:false', 'Đối chiếu identity đã lưu', 'Sidebar giữ kết quả tường minh']
  },
  {
    id: 'background-noop',
    source: '09.01/09.02/09.06',
    trigger: 'Alarm hỏi GAS và GAS trả request:null',
    expect: ['Không tìm tab FBM', 'Không fetch FBM', 'Chờ nhịp sau']
  },
  {
    id: 'background-transport-failure',
    source: '09.01/09.02',
    trigger: 'Alarm đã có envelope nhưng không tìm thấy tab FBM',
    expect: ['Nộp transport_failure kèm requestId', 'GAS thu hồi đúng reservation', 'Không retry write mù']
  },
  {
    id: 'manual-transport-failure',
    source: '09.01/09.08',
    trigger: 'Sidebar không nhận response từ Extension',
    expect: ['GAS nhận lỗi transport', 'UI hiện lỗi tường minh', 'Không suy ra lỗi nghiệp vụ FBM']
  },
  {
    id: 'master-off-in-flight',
    source: '09.02/09.08',
    trigger: 'Tắt công tắc khi request đã bay',
    expect: ['Nhận response để đóng lát', 'Không cấp request kế tiếp', 'Giữ state/cursor để chẩn đoán']
  },
  {
    id: 'read-vs-check-write-gate',
    source: '09.04/09.05/09.08',
    trigger: 'Chạy check hoặc read',
    expect: ['check không ghi Sheet/FBM', 'read chỉ ghi Sheet', 'Không tự gửi lệnh xóa FBM']
  },
  {
    id: 'push-write-safety',
    source: '09.01/09.04/09.05',
    trigger: 'Đẩy thay đổi',
    expect: ['Preflight và approval trước request ghi', 'Không retry write mù', 'Đọc xác nhận trước baseline']
  },
  {
    id: 'stale-response-and-cancel',
    source: '09.01/09.02',
    trigger: 'Response cũ hoặc người dùng dừng lượt',
    expect: ['Chỉ requestId đang active được tiếp tục', 'Response cũ không mở bước mới', 'Không mất ngữ cảnh request ghi đang bay']
  },
  {
    id: 'ui-status-and-log',
    source: '09.07/09.08/10',
    trigger: 'Phiên xong, lỗi hoặc tạm dừng',
    expect: ['Pipeline/progress không nhấp nháy', 'Thông báo tường minh', 'Không lộ cookie, Authorized hoặc payload']
  },
  {
    id: 'conflict-resolution',
    source: '09.04/09.08',
    trigger: 'Người dùng chốt conflict',
    expect: ['Đọc lại FBM', 'Kiểm response thuộc reservation', 'Chỉ sau đó mới ghi và nhả lock']
  },
  {
    id: 'full-pull-missing',
    source: '09.04/09.05',
    trigger: 'Kết thúc full scan',
    expect: ['Đánh dấu vắng mặt', 'Không tự suy ra xóa', 'Không gửi Delete FBM']
  }
];

/* Mọi pipeline của module. Đây là phạm vi bắt buộc của suite, không phải backlog
 * theo code: A-F bám theo audit đối chiếu với Tài liệu 09. */
const PIPELINE_CATALOG = [
  ['A1', 'Bắt tay relay', 'Mở Sidebar', 'Một cấu hình local và ACK; không /exec hoặc FBM'],
  ['A2', 'Từ chối cấu hình relay lỗi', 'Sidebar nhận ACK lỗi', 'Giữ cấu hình cũ; báo lỗi rõ, không gọi FBM'],
  ['A3', 'Tự điền nhận diện', 'Tự động điền', 'Grid User -> draft, không tự lưu'],
  ['A4', 'Kiểm tra liên kết', 'Kiểm tra thông tin đồng bộ', 'Chỉ Customer; trả n/N, không ghi'],
  ['A5', 'Lưu liên kết', 'Lưu thông tin', 'Đủ bốn định danh hoặc xóa binding rỗng'],
  ['A6', 'Lưu credential', 'Lưu mã hóa', 'Extension mã hóa, GAS không nhận password rõ'],
  ['A7', 'Đăng nhập thử', 'Đăng nhập thử', 'Login mềm, đối chiếu identity, báo kết quả'],
  ['A8', 'Auto-login', 'Session hết hạn', 'Throttle 30 phút, resume cursor an toàn'],
  ['B1', 'Kiểm tra an toàn', 'Chọn check', 'Đọc/preview, không ghi Sheet hay FBM'],
  ['B2', 'Lấy về', 'Chọn read', 'Pull ghi Sheet, không ghi FBM'],
  ['B3', 'Pull Customer', 'Full Customer', 'AliasName, cursor, vắng mặt không phải xóa'],
  ['B4', 'Pull Activity', 'Sau Customer', 'Activity theo Customer, nối parent'],
  ['B5', 'Nạp lần đầu', 'File trắng', 'Baseline chỉ khi đã xác nhận hai phía'],
  ['B6', 'Vắng mặt/tombstone', 'Kết thúc full scan', 'Đánh dấu vắng; không Delete FBM'],
  ['C1', 'Trigger GAS', 'Trigger theo lịch', 'Chỉ ghi lịch, không gọi FBM'],
  ['C2', 'Heartbeat', 'Alarm 5 phút', 'Hỏi GAS trước, request:null không chạm tab'],
  ['C3', 'Kỳ Customer nền', 'Đến hạn hoặc count đổi', 'GAS quyết định full Customer'],
  ['C4', 'Activity bulk', 'Đến hạn 8 giờ', 'Cursor bền, từng lát'],
  ['C5', 'Activity catch-up', 'Mốc ngay_gd', 'Chỉ Activity có FBM ID làm mốc'],
  ['C6', 'Activity rotation', 'Alarm 30 phút', '30 Customer theo cursor GAS'],
  ['C7', 'Nền sang thủ công', 'Bấm đồng bộ khi nền chạy', 'Dừng sau response hiện tại'],
  ['D1', 'Đẩy ShinCRM -> FBM', 'Chọn push', 'Preflight/gate trước envelope ghi'],
  ['D2', 'Hai chiều', 'Chọn write', 'Pull/đối soát trước push'],
  ['D3', 'Chấp thuận push lớn', 'Ứng viên vượt ngưỡng', 'Không request ghi trước approval'],
  ['D4', 'Customer create', 'Ứng viên Customer mới', 'Tạo, đọc xác nhận, rồi baseline'],
  ['D5', 'Customer edit', 'Ứng viên Customer sửa', 'Mở form, ghi, đọc xác nhận'],
  ['D6', 'Activity create', 'Ứng viên Activity mới', 'Owner/parent gate, marker, xác nhận'],
  ['D7', 'Activity edit', 'Ứng viên Activity sửa', 'Đọc OldValue, ghi, xác nhận'],
  ['D8', 'Xác nhận sau push', 'FBM đã trả success', 'Hash khớp mới đổi baseline'],
  ['D9', 'Khôi phục Customer create', 'Mất response ghi', 'Đọc MST exact; không gửi New lại'],
  ['D10', 'Mở lại lỗi push', 'Người dùng retry', 'Chỉ đặt pending; không gửi ngay'],
  ['E1', 'Ghi nhận conflict', 'So ba chiều conflict', 'Khóa record, không đổi baseline'],
  ['E2', 'Giải quyết conflict', 'Người dùng xác nhận', 'Đọc lại FBM + reservation trước ghi'],
  ['E3', 'Khóa form/sync', 'Sửa form đồng thời', 'Chỉ đúng owner nhả lock'],
  ['E4', 'Transport thủ công', 'Bridge/HTTP lỗi', 'Báo rõ, retry read giới hạn, không retry write'],
  ['E5', 'Transport nền', 'Tab/executor lỗi', 'Nộp failure đúng reservation'],
  ['E6', 'Response cũ/cancel/master', 'Dừng hoặc response cũ', 'Đóng lát, không cấp bước mới'],
  ['E7', 'Supervisor', 'Run quá hạn', 'Chuyển lỗi, không phát lại request'],
  ['E8', 'Công tắc', 'Tắt master/background', 'Chặn request mới, giữ state'],
  ['E9', 'Xoay relay key', 'Người dùng xác nhận', 'GAS đổi nguyên tử rồi Extension ACK'],
  ['F1', 'State/cursor', 'Qua nhiều lát', 'State bền, không giữ ở Extension'],
  ['F2', 'DTO Sidebar', 'Đọc trạng thái', 'Chỉ DTO giới hạn, không state/bí mật'],
  ['F3', 'Log', 'Kết thúc/lỗi', 'GAS ghi, che bí mật, recordId tổng hợp rỗng'],
  ['F4', 'UI orchestration', 'Chạy/lỗi/xong', 'UI vẽ DTO, báo lỗi, không nhấp nháy']
].map(function (item) {
  var group = item[0].charAt(0);
  var testModules = {
    A: ['tests/cases/fbmSync/Workflow.js', 'tests/cases/fbmSync/AutoLogin.js', 'tests/cases/fbmSync/Orchestration.js', 'tests/cases/fbmSync/Sidebar.js', 'tests/cases/fbmSync/UserJourneys.js', 'tests/cases/extensionBridge.js'],
    B: ['tests/cases/fbmSync/Workflow.js', 'tests/cases/fbmSync/UserJourneys.js', 'tests/cases/fbmSync/Pull.js', 'tests/cases/fbmSync/Reconcile.js'],
    C: ['tests/cases/fbmSync/Workflow.js', 'tests/cases/fbmSync/Orchestration.js', 'tests/cases/extensionBridge.js'],
    D: ['tests/cases/fbmSync/Workflow.js', 'tests/cases/fbmSync/UserJourneys.js', 'tests/cases/fbmSync/Push.js', 'tests/cases/fbmSync/Builders.js'],
    E: ['tests/cases/fbmSync/Workflow.js', 'tests/cases/fbmSync/UserJourneys.js', 'tests/cases/fbmSync/Orchestration.js', 'tests/cases/fbmSync/Push.js', 'tests/cases/fbmSync/Reconcile.js'],
    F: ['tests/cases/fbmSync/Workflow.js', 'tests/cases/fbmSync/UserJourneys.js', 'tests/cases/fbmSync/Sidebar.js', 'tests/cases/fbmSync/Audit.js']
  }[group] || [];
  return {
    id: item[0], name: item[1], trigger: item[2], expect: item[3], source: 'Tài liệu 09 và hợp đồng log', testModules: testModules,
    // Đây là hợp đồng quan sát, không gọi tên hàm sản phẩm: mỗi pipeline phải
    // chứng minh đường đi qua các lớp có liên quan trước khi được coi là xanh.
    offlineScenario: 'Kịch bản ' + item[0] + ': điều kiện đầu -> kích hoạt -> request được phép/cấm -> trạng thái -> hiển thị.',
    layers: { ui: 'DTO, control hoặc trigger đúng theo pipeline', gas: 'Quyết định/state/reservation đúng', extension: 'Chỉ chuyển tiếp hoặc dừng đúng lúc', log: 'GAS ghi tổng kết/lỗi không lộ bí mật' },
    requiredProof: ['offline', 'GAS DEV hoặc live khi kênh thật không mô phỏng được']
  };
});

module.exports = { WORKFLOWS, PIPELINE_CATALOG };
