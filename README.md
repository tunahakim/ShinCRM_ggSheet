# ARCHITECTURE.md — ShinCRM (Target Architecture)

## 0) Mục tiêu refactor
- Thêm 1 field / chỉnh 1 nghiệp vụ ⇒ sửa **tối đa 1–2 chỗ** (schema + render nhỏ), không sửa rải rác.
- Di chuyển ô/click ô ở sheet quản lý `!` ⇒ **không gọi server** (GAS), chỉ lookup RAM.
- Load/Reload đúng rule (không polling), chunk Act “đúng nghĩa”.
- Chừa khe cắm cho FBM/Telegram/Bot/Crawl theo kiểu **Adapter**, không làm bẩn core.

---

## 1) Các lớp (Layers) và trách nhiệm

### 1.1 UI Layer (Sidebar)
**Chỉ làm:**
- Render UI (màn hình chính, form KH, form Act, form ghi chú).
- Bắt event người dùng (click, search, save, reload).
- Gọi `CRMService` (GAS) qua Services.
- Nhận message từ Extension (sheet/cell change) và **lookup RAM** để render.

**Không làm:**
- Không chứa logic lọc/sort/phân loại nghiệp vụ “nặng” kiểu engine.
- Không gọi GAS khi cell change trong sheet `!`.

---

### 1.2 Client Store (RAM DB) — chạy trong Sidebar
**Chỉ làm:**
- Giữ dữ liệu đã load:
  - customers (ListKH)
  - acts (Act)
  - help/options
  - ql_system + per-sheet settings
  - mapsBySheet: sheet `!` → rowIndex → maKH
- Index để lookup nhanh:
  - customersById (maKH)
  - actsByCustomer (maKH → list acts)
  - latestActByCustomer (maKH → act gần nhất)
- Version/dirty flags để orchestrate reload.

---

### 1.3 Domain/Core (Logic nghiệp vụ dùng chung)
**Chỉ làm:**
- parse date theo `dd-mm-yyyy` (bất chấp locale US).
- filter engine hàng 3 (contains / <> / "" / > < / range a-b, không phân biệt hoa thường).
- sort engine theo SYS_SORT + QL_SORT (tối đa 3 level).
- “latest act per customer” (ưu tiên ngày làm việc, tie-break STT).
- validate payload (required/type).
- apply defaults từ Help (ngầm định theo mã cột).

> Domain/Core phải viết theo kiểu “pure function” (đầu vào → đầu ra), để reuse cho Telegram/Bot/Crawl/FBM.

---

### 1.4 Data Layer (GAS)
**Chỉ làm:**
- Đọc/ghi Google Sheet theo mã cột `@...` (dynamic mapping).
- Chunk loader cho Act (đọc đúng range chunk, không đọc full sheet rồi cắt).
- Render sheet quản lý `!` theo filter/sort.
- Trả dữ liệu dạng JSON cho Sidebar.

---

### 1.5 Adapters / Integrations (cắm thêm sau)
- FBM Sync Adapter (Extension): pull/push thủ công khi bấm nút.
- Telegram Notify Adapter (GAS trigger): 8h + 13h.
- Telegram Bot Adapter (GAS doPost webhook).
- Crawl Adapter (Extension/local): crawl → chuẩn hoá → import.

Adapters **không** đụng UI core; gọi `CRMService` (GAS) qua interface chuẩn.

---

## 2) Thành phần & luồng dữ liệu (Data Flow)

### 2.1 Luồng “Mở sidebar → load dữ liệu”
Sidebar UI
  → Services.loadInitial()
    → GAS.CRMService.getInitialData()
      → trả: Help, QL_System, ListKH, danh sách sheet `!`, maps cơ bản, warning overload...
  → Services.loadActChunks()
    → GAS.CRMService.getActChunk(startRow, chunkSize) (lặp theo chunk)
  → Store.buildIndexes()
  → UI.render()

**Nguyên tắc:** Act load chunk “từ dưới lên” (data mới ở dưới), nhưng trả về cho store theo thứ tự phù hợp để build latestAct nhanh.

---

### 2.2 Luồng “Click/di chuyển ô trong sheet `!`”
Spreadsheet (user click cell)
  → Extension Detector (poll + dedupe)
    → postMessage: CRM_TRIGGER {sheetName,row,col,a1,ts}
      → Sidebar Bridge (dedupe + rule check)
        → Store.lookup mapsBySheet[sheetName][row-4] => maKH
        → Store.customersById[maKH] + Store.actsByCustomer[maKH]
        → UI.renderCustomerDetail()
**TUYỆT ĐỐI:** không gọi GAS trong luồng này.

---

### 2.3 Luồng “Save KH / Save Act”
UI Form Save
  → Services.saveCustomer(payload)
    → GAS.CRMService.saveCustomer(payload)
      → return {ok, row, patchedRecord, serverVersion}
  → Store.patchCustomer(patchedRecord)
  → UI.rerender()
  → Services.reloadManagementSheetsAll() (theo rule)

Tương tự cho Act:
- append cuối bảng
- STT = max+1
- Store.patchAct + rebuild latestActByCustomer cho đúng.

---

## 3) Nguồn dữ liệu (Sheets) và quy ước
- Help: dropdown + defaults (ngầm định theo mã cột).
- QL_System: SYS_SORT, SYS_SORT_LEVEL (tối đa 3 level).
- ListKH: data khách hàng.
- Act: data giao dịch.
- Sheet quản lý: tên bắt đầu `!`
  - Row 1: mã cột `@...`
  - Row 2: tên cột
  - Row 3: lọc (sheet `!`)
  - Row >= 4: data

---

## 4) Các “Luật sắt” (Non-negotiable Rules)
1) Cell change trong sheet `!` ⇒ **no server call**.
2) Không polling (trừ detector extension, phải dedupe).
3) Column mapping theo `@CODE` (dynamic).
4) Date parse theo `dd-mm-yyyy`.
5) Act chunk load đúng range.
6) Bật sidebar: check overload used cells, quá lớn thì dừng và show warning.

---

## 5) Định nghĩa “Hoàn thành Phase 1”
- Có `ARCHITECTURE.md` và `CONTRACTS.md` trong repo.
- Tất cả phase sau chỉ được code theo đúng boundaries trong doc này.
- B có thể chỉ vào 1 đoạn code và phân loại được: UI / Store / Domain / Data / Adapter.