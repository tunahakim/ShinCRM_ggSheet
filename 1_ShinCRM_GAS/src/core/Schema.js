/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: Schema.gs
 * TITLE: Hiến pháp Dữ liệu (Master Schema)
 * ROLE: Nguồn sự thật duy nhất (Single Source of Truth) cho toàn bộ hệ thống.
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ KIẾN TRÚC:
 * 1. Mọi cột dữ liệu (@) trong hệ thống đều phải được khai báo tại đây[cite: 4, 5].
 * 2. Cấu trúc chia làm 2 tầng logic (Áp dụng cho các Sheet có giao diện nhập liệu):
 * - Tầng Data (Bản chất): label (nhãn mặc định), type (kiểu dữ liệu), required (bắt buộc hay không).
 * - Tầng UI (Hiển thị): control (kiểu thẻ HTML), source (mã cột chứa danh sách thả xuống).
 * 3. Tuyệt đối KHÔNG chứa giá trị ngầm định (Default Value) ở đây để đảm bảo tính thuần khiết.
 * 4. Thuộc tính 'source' trỏ trực tiếp đến Mã cột vật lý (Ví dụ: '@DM_NHOM_KH') để đảm bảo tính tường minh.
 * -------------------------------------------------------------------------
 */

const MASTER_SCHEMA = {
  
  // =========================================================================
  // PHẦN I: CÁC BẢNG DỮ LIỆU CHÍNH (Có giao diện nhập liệu trên Sidebar)
  // =========================================================================

  // --- 1. BẢNG KHÁCH HÀNG (Sheet: ListKH) --- [cite: 9-11]
  "ListKH": {
    // Số thứ tự: Ẩn trên UI, hệ thống tự động tính toán (Max + 1)
    "@KH_STT": { 
      label: "STT", type: "Number", required: true, 
      ui: { control: "Hidden", source: null } 
    },
    
    // Khóa chính: Mã định danh duy nhất của khách hàng
    "@KH_MA_KH": { 
      label: "Mã KH", type: "String", required: true, 
      ui: { control: "Text", source: null } 
    },
    
    // Tên công ty / Tên khách hàng
    "@KH_TEN_CTY": { 
      label: "Tên công ty", type: "String", required: true, 
      ui: { control: "Text", source: null } 
    },
    
    // Mã số thuế
    "@KH_MST": { 
      label: "Mã số thuế", type: "String", required: true, 
      ui: { control: "Text", source: null } 
    },
    
    // Người đại diện liên hệ
    "@KH_NGUOI_LIEN_HE": { 
      label: "Người liên hệ", type: "String", required: true, 
      ui: { control: "Text", source: null } 
    },
    
    // Số điện thoại liên hệ
    "@KH_PHONE": { 
      label: "Điện thoại", type: "String", required: true, 
      ui: { control: "Text", source: null } 
    },
    
    // Địa chỉ Email (Không bắt buộc)
    "@KH_EMAIL": { 
      label: "Email", type: "String", required: false, 
      ui: { control: "Text", source: null } 
    },
    
    // Địa chỉ trụ sở / Nơi làm việc
    "@KH_DIA_CHI": { 
      label: "Địa chỉ", type: "String", required: true, 
      ui: { control: "Text", source: null } 
    },
    
    // Website của khách hàng (Không bắt buộc)
    "@KH_WEBSITE": { 
      label: "Website", type: "String", required: false, 
      ui: { control: "Text", source: null } 
    },
    
    // Công ty mẹ: Cho phép chọn từ danh sách tên công ty hiện có (Nguồn động)
    "@KH_CONG_TY_ME": { 
      label: "Công ty mẹ", type: "String", required: false, 
      ui: { control: "Lookup", source: "@KH_TEN_CTY" } 
    },
    
    // Phân loại tệp khách hàng
    "@KH_NHOM_KH": { 
      label: "Nhóm KH", type: "String", required: true, 
      ui: { control: "Select", source: "@DM_NHOM_KH" } 
    },
    
    // Sản phẩm dịch vụ khách hàng quan tâm
    "@KH_SAN_PHAM": { 
      label: "Sản phẩm", type: "String", required: true, 
      ui: { control: "Select", source: "@DM_SAN_PHAM" } 
    },
    
    // Ngày dự kiến chốt hợp đồng (Không bắt buộc)
    "@KH_NGAY_DONG_THAU": { 
      label: "Ngày đóng thầu", type: "Date", required: false, 
      ui: { control: "Datepicker", source: null } 
    },
    
    // Ghi chú bổ sung
    "@KH_GHI_CHU": { 
      label: "Ghi chú", type: "String", required: false, 
      ui: { control: "Textarea", source: null } 
    },
    
    // Trạng thái kiểm tra thông tin khách hàng
    "@KH_XAC_THUC": { 
      label: "Xác thực", type: "String", required: true, 
      ui: { control: "Select", source: "@DM_XAC_THUC" } 
    },
    
    // Ngày tạo record trên hệ thống (Hệ thống tự cấp)
    "@KH_NGAY_NHAP_LIEU": { 
      label: "Ngày nhập liệu", type: "Date", required: true, 
      ui: { control: "Readonly", source: null } 
    },
    
    // Nguồn mang khách hàng về (Facebook, Web, Zalo...)
    "@KH_NGUON_KH": { 
      label: "Nguồn khách", type: "String", required: true, 
      ui: { control: "Select", source: "@DM_NGUON_KH" } 
    },
    
    // Trạng thái đồng bộ với hệ thống phần mềm FBM
    "@KH_FBM_STATUS": { 
      label: "Nhập vào FBM", type: "String", required: true, 
      ui: { control: "Select", source: "@DM_FBM_STATUS" } 
    }
  },

  // --- 2. BẢNG GIAO DỊCH (Sheet: Act) --- [cite: 12-14]
  "Act": {
    // Số thứ tự giao dịch (tính trên tổng hệ thống)
    "@ACT_STT": { 
      label: "STT", type: "Number", required: true, 
      ui: { control: "Hidden", source: null } 
    },
    
    // Khóa ngoại: Liên kết với khách hàng (Tự động lấy ID đang mở)
    "@ACT_MA_KH": { 
      label: "Mã KH", type: "String", required: true, 
      ui: { control: "Readonly", source: null } 
    },
    
    // Thời điểm tương tác với khách
    "@ACT_NGAY_LAM_VIEC": { 
      label: "Ngày làm việc", type: "Date", required: true, 
      ui: { control: "Datepicker", source: null } 
    },
    
    // Hình thức tương tác (Gọi điện, Gặp mặt, Báo giá...)
    "@ACT_CONG_VIEC": { 
      label: "Công việc", type: "String", required: true, 
      ui: { control: "Select", source: "@DM_CONG_VIEC" } 
    },
    
    // Chi tiết nội dung trao đổi
    "@ACT_NOI_DUNG_CONG_VIEC": { 
      label: "Nội dung", type: "String", required: true, 
      ui: { control: "Textarea", source: null } 
    },
    
    // Tài khoản/Nhân sự thực hiện giao dịch này
    "@ACT_NGUOI_NHAP_LIEU": { 
      label: "Người nhập", type: "String", required: true, 
      ui: { control: "Select", source: "@DM_NGUOI_NHAP_LIEU" } 
    },
    
    // Mức độ ưu tiên để ghim lên đầu lịch sử
    "@ACT_GHIM": { 
      label: "Ghim", type: "String", required: true, 
      ui: { control: "Select", source: "@DM_GHIM" } 
    },
    
    // Sản phẩm liên quan đến giao dịch này
    "@ACT_SAN_PHAM": { 
      label: "Sản phẩm", type: "String", required: true, 
      ui: { control: "Select", source: "@DM_SAN_PHAM" } 
    },
    
    // Số tiền chốt đơn (nếu có)
    "@ACT_GIA_TRI_HOP_DONG": { 
      label: "Giá trị HĐ", type: "Number", required: false, 
      ui: { control: "Text", source: null } 
    },
    
    // Dấu thời gian hệ thống tự ghi nhận
    "@ACT_NGAY_NHAP_LIEU": { 
      label: "Ngày nhập liệu", type: "Date", required: true, 
      ui: { control: "Readonly", source: null } 
    },
    
    // Trạng thái đã cập nhật lên FBM chưa
    "@ACT_FBM_STATUS": { 
      label: "Nhập vào FBM", type: "String", required: true, 
      ui: { control: "Select", source: "@DM_FBM_STATUS" } 
    }
  },

  // =========================================================================
  // PHẦN II: CÁC BẢNG CẤU HÌNH & HỆ THỐNG (Không có đối tượng 'ui')
  // MỤC ĐÍCH: Chỉ dùng cho Server (Engine.gs) xử lý logic Join, Filter, Sort.
  // =========================================================================

  // --- 3. BẢNG CẤU HÌNH DANH MỤC (Sheet: Help) --- [cite: 6-8]
  // Chứa các cột cung cấp data cho Dropdown Menu trên toàn hệ thống
  "Help": {
    "@DM_XAC_THUC": { label: "DS Xác thực", type: "String", required: false },
    "@DM_CONG_VIEC": { label: "DS Công việc", type: "String", required: false },
    "@DM_SAN_PHAM": { label: "DS Sản phẩm", type: "String", required: false },
    "@DM_NHOM_KH": { label: "DS Nhóm KH", type: "String", required: false },
    "@DM_FBM_STATUS": { label: "DS FBM Status", type: "String", required: false },
    "@DM_NGUON_KH": { label: "DS Nguồn KH", type: "String", required: false },
    "@DM_NGUOI_NHAP_LIEU": { label: "DS Người nhập", type: "String", required: false },
    "@DM_GHIM": { label: "DS Ghim", type: "String", required: false },
    
    // Nơi khai báo các giá trị ngầm định (Sẽ được Load lúc init)
    "@DM_NGAM_DINH_MA_COT": { label: "Mã cột Default", type: "String", required: false },
    "@DM_NGAM_DINH_GIA_TRI": { label: "Giá trị Default", type: "String", required: false }
  },

  // --- 4. CẤU HÌNH SẮP XẾP TOÀN CỤC (Sheet: QL_System) --- [cite: 17-19]
  "QL_System": {
    "@SYS_SORT": { label: "Cột sắp xếp mặc định", type: "String", required: false },
    "@SYS_SORT_LEVEL": { label: "Chiều sắp xếp (A<->Z)", type: "String", required: false }
  },

  // --- 5. SIÊU CẤU TRÚC CHO SHEET QUẢN LÝ (Sheet bắt đầu bằng '!') --- [cite: 20-22]
  // Định nghĩa các "Vùng đặc quyền" trên sheet ! để Engine thực thi thuật toán
  "ManagementSheet": {
    "@QL_SORT": { label: "Cột sắp xếp cục bộ (Thường ở Cột A)", type: "String", required: false },
    "@QL_SORT_LEVEL": { label: "Chiều sắp xếp cục bộ (Thường ở Cột B)", type: "String", required: false },
    "FILTER_ROW": { label: "Hàng điều kiện lọc", row_index: 3, type: "System" },
    "DATA_START_ROW": { label: "Hàng bắt đầu in dữ liệu", row_index: 4, type: "System" }
  }
};

/**
 * =========================================================================
 * HÀM: getMasterSchema()
 * =========================================================================
 * MỤC ĐÍCH: 
 * Hàm này hoạt động như một "Trạm phát sóng". Nó sẽ chuyển đổi toàn bộ 
 * kiến trúc MASTER_SCHEMA từ Object sang dạng Chuỗi (String JSON).
 * * Ý NGHĨA KỸ THUẬT:
 * Nhờ việc ép kiểu sang JSON, file Init.gs có thể sử dụng cơ chế 
 * Scriptlet Injection (<?!= ... ?>) để "nhúng thẳng" bản gen này vào file HTML 
 * của Sidebar trước khi nó được gửi tới trình duyệt người dùng [cite: 69, 101-103]. 
 * Việc này giúp Sidebar không cần tốn thời gian gọi API lên Server để hỏi cấu trúc, 
 * đạt được tốc độ hiển thị Zero-Latency (<50ms)[cite: 108].
 * * @returns {String} Chuỗi JSON đại diện cho MASTER_SCHEMA
 */
function getMasterSchema() {
  return JSON.stringify(MASTER_SCHEMA);
}


/*
function test_getMasterSchema() {
  const result = getMasterSchema();
  Logger.log("--- KẾT QUẢ JSON TRẢ VỀ ---");
  Logger.log(result);
}
*/