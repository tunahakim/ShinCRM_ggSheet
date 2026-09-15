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
    trigger: 'Tự động điền - Kiểm tra',
    expect: ['GAS cấp grid User', 'Extension chỉ chuyển envelope', 'GAS trả draft chưa lưu', 'Sidebar hiển thị kết quả']
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

module.exports = { WORKFLOWS };
