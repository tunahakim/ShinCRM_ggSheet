# Kiểm đồng bộ FBM theo ba quy tắc cứng

Branch `feature/fbm-audit`. Chặng 3a chỉ đọc, lập bản đồ và trình phương án; không sửa code. Chặng 3b sửa sau khi chủ dự án chốt phương án.

## Bối cảnh và việc gộp vào (chuyển từ Todo mục 3)

- Bối cảnh (chủ dự án 2026-10-21): code `fbm_sync` do phiên AI cũ viết, nghi vi phạm nặng "một việc một công cụ", "người điều phối gọi công cụ, công cụ trao nhau bằng dữ liệu", "tiến trình lớn ghép từ tiến trình nhỏ". Nút "Đăng nhập thử" lẽ ra chỉ khởi chạy đúng tiến trình đăng nhập tự động, nghi đang có hai luồng.
- Bằng chứng gặp thật 2026-10-21 (Sheet DEV mới): đăng nhập thử thành công nhưng Sidebar báo "Đăng nhập thử không thành công: Preflight thất bại: Phạm vi đồng bộ ... còn trống". Log: lượt nền "Quét nhanh" chạy 21:56:37–40 xen giữa lượt đăng nhập thử (kết thúc 21:56:43). Gốc: đăng nhập thử và lượt đồng bộ dùng chung một ô state (`FbmSync.stateRead/stateWrite`); `FbmSync.loginTestRequest` chỉ kiểm "đang có lượt chạy" lúc bắt đầu, lượt nền vẫn vào được giữa chừng và ghi đè state, bước sau của đăng nhập thử (`FbmSync.continue`) đọc state của lượt nền nên trả lỗi preflight của lượt nền. Đăng nhập thử và tự đăng nhập dùng chung các bước (`loginAdapterContinue`, `loginAuthorizeContinue`, `loginIdentityContinue`) nhưng rẽ nhánh theo cờ `testOnly`/`purpose`/`manual` rải trong từng bước, tức quyết định của người điều phối nằm trong công cụ.
- Cách làm đề xuất: đọc trọn (không sửa) từng tiến trình của `fbm_sync` và phía Sidebar `client/sync/`, lập bản đồ tiến trình – công cụ – nơi sở hữu state, liệt kê vi phạm kèm mức nặng, rồi mới trình phương án sửa theo ba phần. Một ô state duy nhất cho mọi lượt là chỗ phải xét đầu tiên.
- Lý do sau mục 1 và 2 (chủ dự án chốt 2026-10-21): sửa đồng bộ FBM thì dùng luôn cổng thông báo và bảng khai cài đặt đã có, không phải tự viết hàm báo lỗi hay đọc cài đặt riêng rồi làm lại. Lý do trước mục 4: UI mới vẽ các màn đồng bộ FBM trên hợp đồng đã sạch. Lỗi đăng nhập thử bị lượt nền ghi đè chỉ gặp trên DEV nên chờ tới mục này.
- Gộp vào đây phần lõi của "một máy chạy đồng bộ nền" (V24). Chủ dự án chốt 2026-10-21: chốt cùng phiên FBM, vì đây là việc ai được chạy lượt nền, cùng gốc với một ô state cho mọi lượt; phần màn chọn máy làm ở mục 4.
  - Bối cảnh (2026-10-21, từ V24 của `[Đã xử lý] 2026.10.14 Vi phạm luật thao tác đắt.md`): mỗi máy có Extension và đã từng mở Sidebar đều tự hỏi GAS 5 phút một lần, kể cả khi công tắc tắt. Ba máy là ba dòng hỏi (khoảng 864 lần/ngày, phần lớn nhận "không có việc"). Dữ liệu không chạy trùng nhờ khóa và lịch đến hạn của GAS, nhưng GAS giao việc cho máy hỏi trước, có thể là máy không mở tab FBM hoặc không còn phiên đăng nhập (cookie FBM nằm trong trình duyệt từng máy). Cho Extension tự dừng khi công tắc tắt thì bật lại ở máy khác sẽ không tới được máy đó, đồng bộ nền âm thầm đứng im.
  - Thiết kế đề xuất (chủ dự án đồng ý hướng 2026-10-21, chưa chốt chi tiết):
    - Mỗi Extension tự tạo một mã máy ngẫu nhiên khi cài; GAS là nơi duy nhất ghi máy chạy nền (mã máy, tên máy, lúc giao, lần hỏi cuối).
    - Chủ dự án chọn máy, không để máy tự giành quyền (tự giành thì các máy khác vẫn phải hỏi để phát hiện máy chính tắt, và có thể giành về máy không mở FBM). Máy không được giao hỏi GAS thì nhận lệnh dừng nhịp; Extension chỉ làm theo lệnh GAS.
    - Công tắc tổng và công tắc nền không làm máy chạy nền ngừng hỏi, để bật lại từ máy nào cũng có hiệu lực ở nhịp kế tiếp.
    - Máy chạy nền im lặng quá số nhịp đặt trong cấu hình thì Sidebar mọi máy báo lỗi và ghi Log, không tự chuyển.
    - Gửi cấu hình liên quan Extension (chọn máy, bật nhịp) phải nhận được xác nhận của Extension; chưa xác nhận thì báo lỗi.
- Chuyển cài đặt FBM về cổng cài đặt dùng chung của mục 2 (chủ dự án đồng ý 2026-10-22): `FBM_SYNC_SETTINGS_V1`, `FBM_ACCOUNT_SETTINGS_V1`, cài đặt đăng nhập và Extension hiện có hàm đọc, kiểm, lưu viết riêng trong `fbm_sync/state/`; khai chúng thành các phần cài đặt của module FBM và bỏ các hàm riêng. Ngầm định khi kéo khách từ FBM (giá trị "Xác thực", giá trị mặc định của ô "Cho phép đồng bộ FBM" đang là cờ `pullDefault` trong `FBM_SYNC_PERMISSION_OPTIONS`) gom vào bảng ngầm định của phần cài đặt FBM, cùng kiểu với ngầm định khi nhập trên Sidebar.
- Lỗi gặp thật 2026-10-22 trên Sheet DEV mới, gộp vào chặng 3 (chủ dự án chốt 2026-10-22):
  - Extension gặp HTTP 404 từ Web App relay (Google chập chờn, trang "không thể mở tệp tại thời điểm này", tự hết sau vài phút) thì chỉ lưu `fbmRelayLastStatus` trong `chrome.storage`, dừng lượt, không thử lại, không ghi hộp đen (`2_ShinCRM_Extension/background/service_worker.js`, `postRelay` mã `RELAY_ENDPOINT_NOT_FOUND`, `fbmHeartbeatNow` dừng ở `blocked_gas_request`). GAS chỉ biết qua dòng "quá hạn chờ" 4–6 phút sau với hộp đen cũ 25 phút. Hướng đã bàn: ghi lỗi vào hộp đen qua `noteChainStep` để lần gọi được GAS kế tiếp mang lên Log, và thử lại có giãn cách trong người điều phối chuỗi.
  - Lượt ghi nền dừng ở `awaiting_approval` không bao giờ được thu hồi (`FbmSync.recoverStaleRun` chỉ thu hồi phase chạy) và không có thông báo nào, nên đồng bộ nền đứng im tới khi người dùng tự mở màn đồng bộ. Cần: thông báo qua cổng thông báo khi chờ chấp thuận (Sidebar hiện ở khung mới của mục 4), và quyết định lượt chờ duyệt quá hạn thì làm gì.
  - Ngưỡng chấp thuận DEV bị lưu là 0 do hàm chuyển Config cũ của `SyncSettings.js` đổi ô trống thành 0 (`Number('') === 0`); hàm đó đã xóa ở phiên lõi cài đặt và DEV đã đặt lại 10. Khi chuyển cài đặt FBM sang cổng chung thì kiểu `number` coi ô trống là chưa đặt. `FbmSync.approvalThreshold` (`fbm_sync/schema/FbmFields.js`) còn `catch (ignore)` che lỗi đọc cài đặt.
- Chia hai chặng: 3a chỉ đọc, lập bản đồ và trình phương án; 3b sửa sau khi chủ dự án chốt phương án.

## Checklist chặng 3a

- [ ] Đọc `Quy tắc theo loại phiên/Đồng bộ FBM.md`, mục lục 09, các chuyên đề 09 liên quan, `Câu hỏi đêm.md`.
- [ ] Đọc trọn các tiến trình GAS `fbm_sync` (người điều phối và công cụ nó gọi): đăng nhập thử, tự đăng nhập, lượt đồng bộ (quét, preflight, áp, đối soát), lượt nền, hủy/thu hồi.
- [ ] Đọc trọn phía Sidebar `client/sync/` và Extension phía FBM (`service_worker.js`, chuỗi nền, `postRelay`).
- [ ] Lập bản đồ tiến trình – công cụ – nơi sở hữu state (ghi vào mục "Bản đồ" của tệp này).
- [ ] Liệt kê vi phạm ba quy tắc cứng kèm mức nặng (ghi vào mục "Vi phạm").
- [ ] Trình phương án ba phần (a) gốc lỗi, (b) công cụ dùng lại, (c) bảng đối chiếu quy tắc cứng cho từng nhóm vi phạm, gồm cả bốn lỗi gặp thật 2026-10-22 và việc chuyển cài đặt FBM về cổng chung.

## Bản đồ

## Vi phạm
