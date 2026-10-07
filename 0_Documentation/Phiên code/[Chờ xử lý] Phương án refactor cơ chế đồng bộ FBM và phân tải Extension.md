# [Chờ xử lý] Phương án refactor cơ chế đồng bộ FBM và phân tải Extension

> Trạng thái: tài liệu thảo luận, chưa phải hợp đồng chính thức.
>
> Mục đích: lưu lại đầy đủ phương án đã trao đổi để sau khi các lỗi vận hành nhỏ của pipeline hiện tại được xử lý xong, có thể mở một phiên refactor riêng mà không phải suy lại từ đầu.
>
> Quy tắc quan trọng: tệp này không thay thế Tài liệu 09, không được dùng làm căn cứ sửa code ngay trong phiên hiện tại. Khi bắt đầu refactor, phải đối chiếu và cập nhật các tài liệu chính thức trước, sau đó mới triển khai theo hợp đồng mới.

## 1. Phạm vi và lý do tạo tài liệu

Module đồng bộ FBM hiện tại đã có phần lớn pipeline và cổng phiên. Các lỗi còn lại đang được xử lý theo checklist vận hành trước khi chạy thật. Việc thay đổi sâu vai trò của Extension, cách truyền bulk response, DSL và state không nên làm chen vào phiên sửa lỗi nhỏ, vì có thể làm lẫn hai loại công việc:

- sửa lỗi của hợp đồng hiện tại để pipeline đang có chạy đúng;
- thiết kế lại hợp đồng tương lai để GAS và Extension phân tải khác đi.

Tài liệu này ghi nhận phương án tương lai. Khi refactor, phải coi đây là đầu vào thiết kế cần duyệt lại, không coi mọi câu trong đây đã tự động trở thành quyết định nghiệp vụ.

Nguồn hiện hành cần đối chiếu khi triển khai:

- `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/00. Mục lục và phạm vi.md`;
- các chuyên đề 09.01–09.08 liên quan đến kiến trúc, pipeline, trường, fingerprint, xóa/vắng mặt, bảo mật, log và UI;
- `0_Documentation/Phiên code/Checklist rà soát đồng bộ FBM trước vận hành thật.md`;
- code và test hiện tại trong `1_ShinCRM_GAS/fbm_sync/`, `2_ShinCRM_Extension/` và `tests/cases/fbmSync/`.

## 2. Tóm tắt phương án đang nghiêng về

Phương án tổng thể:

```text
GAS:
  bộ não nghiệp vụ và nguồn sự thật
  đọc Sheet, tính hSHIN, giữ hBASE
  tạo plan cho Extension
  phân loại kết quả
  sở hữu cursor, conflict, baseline
  ghi Sheet và Log qua các cổng hiện có
  quyết định session/login có được tiếp tục hay không

Extension:
  công nhân kỹ thuật chạy trong tab FBM
  gọi FBM bằng request do GAS cấp
  đọc HTML/JSON theo plan
  lọc, chiếu, ghép, normalize và hash theo contract
  giữ bulk tạm trong RAM của lượt hiện tại
  trả observation/chunk đã làm sạch
  không quyết định nghiệp vụ và không ghi Sheet/Log

DocumentProperties:
  chỉ giữ state điều khiển nhỏ
  không chứa full response, Rows lớn, preview dài hay record ứng viên
```

Điểm cốt lõi là: **GAS không nhận full response của các lượt đọc bulk nghiệp vụ. GAS nhận dữ liệu đã chiếu/rút gọn và tự quyết định kết quả nghiệp vụ.**

Điều này không có nghĩa Extension được tự quyết định. Extension chỉ thực thi các thao tác kỹ thuật được mô tả trong plan JSON do GAS cấp. GAS vẫn là nơi diễn giải kết quả thành `unchanged`, `pull`, `push`, `conflict`, `missing`, `fbm-only`, trạng thái lỗi hoặc quyết định dừng phiên.

## 2A. Điều chỉnh sau rà soát 2026-10-07 (chủ dự án đồng ý)

Các điểm dưới đây thay cho câu tương ứng ở các mục sau; mục nào đã sửa theo đây thì ghi rõ.

1. **Bắt tay phiên bản là việc đầu tiên của refactor.** GAS và Extension cài ở hai nơi (GAS trên Google, Extension trên máy chủ dự án), nên có thể lệch bản cài: push GAS mà chưa tải lại Extension, hoặc hai máy hai bản. Mỗi lượt quét GAS gửi mã phiên bản hợp đồng; Extension trả mã của nó; khác nhau thì GAS từ chối chạy, báo ở Sidebar và ghi Log "Extension trên máy này đang dùng bản cũ, hãy tải lại Extension", không ghi gì xuống Sheet. Mã phiên bản lấy từ nội dung tệp hợp đồng, test fail nếu sửa hợp đồng mà quên đổi mã. Áp cho mọi giao tiếp GAS–Extension, không riêng hash.
2. **Hash: giai đoạn đầu GAS tự tính cả hai phía.** Extension chỉ lọc (bỏ bản ghi không thuộc khách của mình) và chiếu (bỏ cột không dùng), rồi chia gói gửi về. Lý do: Extension tính hFBM thì có hai bản code chuẩn hóa/hash, mà mục 11 đã bắt GAS tự tính hFBM khi đọc lại sau push; lệch một chi tiết (NFC/NFD tiếng Việt, khoảng trắng, định dạng ngày/số) là mọi bản ghi thành "đã đổi" hoặc "xung đột" mà không lỗi nào nổ. Ưu điểm của phương án cũ (gói về GAS nhỏ hơn 5–10 lần vì bản ghi không đổi chỉ gửi id + hash) là có thật nhưng chỉ đáng giá khi đo thấy GAS chậm hoặc gói quá nhiều.
3. **Nếu đo thấy cần chuyển hash sang Extension:** một tệp JavaScript duy nhất chứa chuẩn hóa và hash, không gọi API riêng của Google hay Chrome; dùng y nguyên ở GAS và Extension, có test bắt hai bản giống từng byte; kèm bắt tay phiên bản (điểm 1) và mẫu thử chạy trước mỗi lượt bulk (mục 9.2).
4. **Không dựng DSL/trình thông dịch primitive tổng quát.** Extension có vài loại việc cố định, đặt tên rõ (quét Customer, quét Activity, sau này đăng nhập); GAS truyền tham số: danh sách trường lấy từ `SYNC_SCHEMA`, danh sách mã khách cần lọc, ngân sách gói. Danh sách trường vẫn chỉ định nghĩa một chỗ ở GAS.
5. **Chỉ kết luận vắng mặt khi đã nhận đủ mọi gói của cùng một lượt quét.** GAS giữ dấu "lượt quét hoàn tất"; mất tab giữa chừng thì không đánh cờ vắng mặt.
6. **Mất tab thì chạy lại cả lượt, không tiếp từ gói số N**, vì thứ tự bulk có thể khác giữa hai lần tải; dựa vào cửa ghi idempotent.
7. **Ngân sách gói phải đo**, gồm cả trần dung lượng đường Extension → GAS lẫn thời gian GAS xử lý một gói; đường này dễ chạm trần thời gian trước trần dung lượng.
8. **Đăng nhập để sau cùng hoặc bỏ khỏi đợt này**: đăng nhập hiện chạy được và không liên quan dữ liệu lớn.
9. **Lỗi cursor phình theo số khách đã sửa ngoài refactor** (commit 71a792d, bf89e77): quét toàn bộ đọc Customer theo trang 50, cursor Activity chỉ mang khách của trang đang quét. Đúng hướng state V2 ở mục 15 nên refactor giữ nguyên.

## 2B. Hiện trạng và số đo trước refactor (2026-10-07, Sheet DEV, 1.312 khách thật)

Số đo dưới đây lấy từ lượt "Đọc toàn bộ" thật với chế độ thử tắt, sau khi đã sửa cursor phình (2A điểm 9) và preflight đọc Sheet một lần (commit 906370b). Hàm đo DEV chỉ đọc: `fbmProbePreflightTiming`, `fbmProbeActivityStepTiming`, `fbmProbeCursorPosition`, `fbmProbeStateMetadataSizes` (trong `server/dev/FbmSyncStateProbe.js`); trace từng request đọc bằng `fbmGetSyncTrace`.

### 2B.1. Kết luận chính

**Nút thắt không phải FBM, cũng không phải số bước nghiệp vụ, mà là chi phí của mỗi lần gọi GAS.** Một khách Activity tốn khoảng 23 giây, trong đó Extension gọi FBM chỉ 0,1 giây. Quét Activity theo kiểu một khách một lần gọi GAS thì 1.312 khách mất khoảng 8–9 giờ; lượt thật đo được 47 khách trong khoảng 22 phút.

| Đoạn của một khách Activity | Thời gian đo |
|---|---|
| Extension gọi FBM lấy grid Activity của một khách | 0,1 giây |
| Sidebar gọi GAS (`google.script.run`) đến lúc GAS bắt đầu chạy | khoảng 2,6 giây |
| GAS xử lý response một khách (từ `fbm_response_received` đến `response_built`) | khoảng 20 giây |
| Tổng một vòng | 15–30 giây |

Đầu phiên chậm vì cùng lý do: preflight 6 giây (trước khi sửa là 20–34 giây, làm `fbmStartSync` vượt hạn chờ 30 giây của Sidebar), kiểm tra phiên khoảng 22 giây, nạp Category khoảng 23 giây; mỗi bước chỉ vài request FBM nhưng mỗi request là một lần gọi GAS đắt.

### 2B.2. GAS đang làm gì trong mỗi lần xử lý một khách Activity

Theo code hiện tại (`PullFlow.js` nhánh `activity_grid`, `FbmSync.pullRecords`, `FbmSync.pullWrite`):

1. Ghi trace vào DocumentProperties nhiều lần mỗi lượt gọi (khóa `FBM_SYNC_TRACE_V1`, khoảng 6 KB, đọc rồi ghi lại cả khóa mỗi lần).
2. Đọc và ghi state khoảng 9 KB 4–5 lần (đọc một lần khoảng 300 ms; ghi tương tự).
3. Đọc lại toàn bộ Sheet Customer để nối giao dịch với khách: **3,5 giây với 1.312 dòng**, dù cursor đã biết đang quét khách nào.
4. Đọc lại toàn bộ Sheet Activity: 0,4 giây với 93 dòng, tăng theo số giao dịch.
5. Đánh dấu "đã thấy" vào DocumentProperties (`FBM_SYNC_SEEN_*`).
6. Ghi Sheet qua `writeGateSave`: khoảng 0,6–1,5 giây.
7. Ghi Log, cộng số liệu bước, ghi state lần cuối.

Các phần đã đo cộng lại khoảng 8–10 giây; **khoảng 10 giây còn lại chưa đo được** vì không gắn được mốc thời gian khi phiên thật đang chạy. Việc đầu tiên của phần tối ưu là gắn mốc thời gian theo từng bước trong một lần gọi GAS (ghi vào trace, không ghi Log từng bản ghi) rồi chạy một trang 50 khách.

### 2B.3. State đang sát trần một khóa DocumentProperties

Khi đang quét Activity, `FBM_SYNC_STATE_V1` là **8.901/9.000 byte**: cursor 3.025 byte (50 khách × `{sttRec, maKh}` cộng envelope trang Customer kế), `metadata.preview` 2.000 byte, `metadata.businessSteps` 1.417 byte, `metadata.preflight` 447 byte, `customerFields` 291 byte, `session` 416 byte. Test `bf89e77` chỉ chốt cursor dưới nửa trần, không chốt cả state.

Hệ quả: nhánh lỗi ghi thêm `lastError` (Supervisor ghi khoảng 90 ký tự) là vượt trần, `FBM_DOCUMENT_PROPERTIES_QUOTA` che mất lỗi thật. Phải sửa trước hoặc ngay đầu refactor: cursor giữ cặp `[sttRec, maKh]` thay vì object, đưa `preview` ra khỏi state (hoặc thu nhỏ), bỏ `metadata.preflight` đầy đủ khỏi state; test chốt **cả state** của một trang đầy cộng `lastError` dài nhất vẫn dưới khoảng 70% trần.

### 2B.4. Tiến trình hiển thị sai

`counts.total = max(total, completed)` (`PullFlow.js`, `FbmSync.pullRecords`), mà `total` ban đầu bằng 0, nên Sidebar luôn hiện `N/N (100%)` và cả hai số cùng tăng. Chủ dự án chốt: mẫu số là **số khách cần xử lý trong lượt** (toàn bộ: số khách FBM trả theo bộ lọc của lượt, lấy từ `TotalRowCount` grid Customer; chế độ thử: số mã thử; quét nền chi tiết: giới hạn khách mỗi lượt), tử số là số khách đã quét Activity; số giao dịch nhận/ghi vẫn ở dòng đếm riêng.

### 2B.5. Phương án tối ưu đề xuất (đưa vào lộ trình mục 18)

1. **Nhiều khách trong một lần gọi GAS** (thay đổi lớn nhất). Extension lấy Activity của cả trang 50 khách (khoảng 50 × 0,1 giây), gửi về GAS một gói; GAS đọc mỗi Sheet một lần, ghi Sheet một lần, ghi state một lần cho cả gói. Ước tính dưới 1 giây mỗi khách, 1.312 khách khoảng 20–30 phút thay vì 8–9 giờ. Đây là bước trung gian của Activity bulk (mục 7, mục 18 bước 5): cùng hợp đồng "Extension gom, GAS xử lý theo gói", khác ở chỗ Extension gọi FBM theo từng khách thay vì một request bulk. Ngân sách gói phải đo (2A điểm 7); trần thời gian một lần gọi GAS là 6 phút.
2. Không đọc lại Sheet Customer mỗi lần xử lý Activity; ánh xạ khách lấy từ cursor hoặc đọc một lần cho cả gói.
3. Mỗi lần gọi GAS chỉ ghi state một lần và ghi trace một lần (gom trong bộ nhớ, ghi ở cuối).
4. Preflight ở chế độ chỉ đọc bỏ quét ứng viên đẩy (`pushCandidates`, khoảng 4 giây) vì chỉ chiều ghi cần.
5. Thu gọn state (2B.3) và sửa mẫu số tiến trình (2B.4).
6. **Bỏ phân trang Customer bên FBM (chủ dự án đồng ý 2026-10-07).** FBM cho lấy toàn bộ khách bằng một request; trang 50 khách chỉ là cách né trần state khi cursor phải mang danh sách mã khách (G14 mục 1). Phân trang keyset đã gây lỗi thật: con trỏ trang thiếu `stt_rec_kh` làm trang 2 về rỗng, lượt quét tưởng xong và đánh nhầm 1.262 khách "không thấy bên FBM" (G14 mục 4, đã vá tạm bằng con trỏ 4 giá trị và chốt chặn so với `TotalRowCount`). Phương án: một request lấy toàn bộ Customer, ghi Sheet Customer; hàng chờ lấy Activity đọc mã FBM từ Sheet Customer, state chỉ giữ vị trí (số thứ tự khách đang xử lý), không giữ danh sách mã. Lấy Activity từng khách chỉ cần `stt_rec_kh`. "Không thấy bên FBM" dựa trên một lần trả về đầy đủ nên không còn trường hợp nhận thiếu mà tưởng đủ. Cần đo dung lượng gói toàn bộ Customer qua đường Extension → Sidebar → GAS (mục 5.2, mục 6) trước khi chốt có chia gói về GAS hay không; chia gói về GAS khác với phân trang bên FBM.

Về giới hạn 6 phút: mỗi khách hiện là một lần gọi GAS riêng (khoảng 20 giây), vòng lặp nằm ở Sidebar, cursor lưu trong state nên phiên 9 giờ không lần gọi nào chạm 6 phút; đóng Sidebar thì phiên ngừng gửi request, Supervisor đánh lỗi sau `STALE_RUN_MS` (2 phút). Khi gom gói (điểm 1), mỗi lần gọi dài hơn nên ngân sách gói phải tính cả trần 6 phút và hạn chờ của Sidebar.

## 3. Ranh giới GAS – Extension – Sidebar

### 3.1. GAS sở hữu

GAS tiếp tục sở hữu duy nhất:

- `DATA_SCHEMA`, `SYNC_SCHEMA` và các quy tắc trường tham gia đồng bộ;
- mapping Category và điều kiện được phép ghi;
- quy tắc chuẩn hóa/fingerprint ở cấp hợp đồng;
- tính `hSHIN` từ dữ liệu hiện tại của ShinCRM;
- đọc `hBASE` đã lưu;
- phân loại ba chiều và quyết định ghi;
- cursor, tiến độ, lock, conflict và baseline;
- quy tắc auto-login, probe, retry, session blocked và identity;
- cửa ghi Sheet, cửa ghi state và Log;
- DTO trả Sidebar.

Extension không được tự thay thế bất kỳ quyết định nào ở trên.

### 3.2. Extension sở hữu

Extension thực hiện những việc thuần kỹ thuật gần nguồn FBM:

- gọi request trong tab FBM với cookie và Referer của tab;
- đọc response HTML/JSON;
- trích xuất trường kỹ thuật mà plan yêu cầu;
- projection/filter/limit dữ liệu;
- tạo map theo khóa;
- normalize và tính `hFBM` chỉ khi đã chuyển hash sang Extension theo mục 2A điểm 3;
- chỉ trả các observation và record cần thiết;
- chia output thành chunk theo ngân sách byte.

Extension không được:

- tự kết luận phiên còn sống hay đã chết;
- tự quyết định login lại;
- tự chọn FBM hay ShinCRM khi conflict;
- tự cập nhật baseline;
- tự ghi Sheet hoặc Log;
- lưu state nghiệp vụ lâu dài trong `chrome.storage`.

### 3.3. Sidebar

Sidebar chỉ điều phối thao tác người dùng và hiển thị DTO. Sidebar không được tự tính hash, tự phân loại conflict, tự dựng request FBM hoặc tự quyết định reload.

## 4. Đăng nhập và session theo phương án mới

Ý “đưa việc đăng nhập sang Extension” được hiểu là Extension làm phần kỹ thuật, không phải Extension làm chủ chính sách đăng nhập.

### 4.1. Việc Extension làm

Phần này làm sau cùng hoặc bỏ khỏi đợt refactor (mục 2A điểm 8). Theo `LoginPlan` do GAS cấp, Extension có thể:

- gửi request đăng nhập trong tab FBM;
- đọc HTML/JSON phản hồi;
- lấy salt, marker hoặc trường kỹ thuật cần cho bước tiếp theo;
- nhận diện dạng body: JSON, HTML, không decode được;
- lấy các trường identity đã được phép trả;
- làm sạch kết quả và loại password, cookie, envelope, payload dài;
- trả `LoginObservation` về GAS.

Extension không trả kết luận kiểu `sessionAlive: true` và không tự chuyển sang request nghiệp vụ.

### 4.2. Việc GAS làm

GAS nhận observation và tự quyết định:

```text
httpStatus = 200
jsonValid = true
hasD = true
identity khớp binding
  -> cho phép tiếp tục
```

Các trường hợp khác được phân loại tại GAS:

- phiên sống;
- bị chặn do FBM còn phiên khác;
- sai thông tin hoặc identity không khớp;
- lỗi transport;
- response không đúng shape;
- cần dừng và báo người dùng.

### 4.3. Không gửi full response login/probe

Phương án mới không bắt GAS nhận full body trong mọi trường hợp. Extension có thể trả các dữ kiện kỹ thuật đã làm sạch:

```json
{
  "httpStatus": 200,
  "bodyKind": "json",
  "jsonValid": true,
  "hasD": true,
  "loginMarker": "success",
  "identity": {
    "userId": "...",
  },
  "extractorVersion": "login-v1"
}
```

Tên trường thật và mức độ chi tiết phải chốt trong contract; ví dụ trên không phải schema cuối.

Nếu Extension không nhận diện được body, nó trả observation lỗi đã làm sạch, không trả nguyên HTML lỗi hoặc payload nhạy cảm. GAS vẫn là nơi quyết định fail-closed.

Đây là thay đổi so với một số câu trong Tài liệu 09 hiện tại đang yêu cầu Extension chuyển body probe nguyên trạng. Khi refactor, phải cập nhật hợp đồng để phân biệt:

```text
Extension parse/trích xuất dữ kiện kỹ thuật
GAS diễn giải và quyết định session
```

## 5. Hai loại ngân sách dữ liệu, không được nhầm lẫn

### 5.1. `19.918 byte` trong Log

Log vận hành có dạng:

```text
key: FBM_SYNC_STATE_V1
bytes: 19918
context: state
phase: checking_session
cursor: lookup index: 3
```

`19.918 byte` là kích thước chuỗi JSON của **một state GAS đang cố ghi vào `DocumentProperties`**. Nó không phải kích thước response FBM và không phải kích thước relay chunk.

State này tồn tại lâu dài để lát sau đọc lại và tiếp tục. Vì vậy nó chịu trần nhỏ của `DocumentProperties`. Kích thước khoảng 17–20 KB vượt xa ngân sách an toàn, nên các lần chạy lặp lại tiếp tục lỗi.

Vị trí `lookup index: 3` cho thấy state đã phình trong giai đoạn lookup, chưa cần có hàng nghìn Customer mới xảy ra. Các nguồn đã được nghi ngờ/xác định trong quá trình rà trước gồm:

- giữ nguyên `Rows` của lookup;
- giữ `categoryGate` lớn hoặc trùng ở nhiều nhánh;
- giữ preview Activity dài;
- giữ candidate là toàn bộ record;
- giữ dữ liệu phụ không cần để tiếp tục cursor.

### 5.2. `256–512 KB` và ngân sách relay

Đây là ngân sách cho một JSON tạm thời Extension gửi về GAS qua relay. Nó chỉ sống trong lượt xử lý hiện tại, sau khi GAS ghi xong thì không phải state chính.

Để “thoải mái” nhưng không sát trần relay khoảng 1 MB, phương án tạm đề xuất:

```text
Mục tiêu chunk: 512 KiB
Giới hạn cứng: 768 KiB
```

Đo trên JSON đã serialize, gồm cả envelope, metadata, `records`, `jobId` và `chunkIndex`.

Quy tắc:

- thêm record khi vẫn dưới mục tiêu;
- dừng trước khi vượt mục tiêu nếu record kế tiếp làm gói quá lớn;
- tuyệt đối không vượt giới hạn cứng;
- record riêng lẻ quá lớn phải projection hoặc đọc chi tiết riêng.

Hai ngân sách được hiểu như sau:

```text
DocumentProperties:
  state lâu dài, mục tiêu vài KB

Relay:
  dữ liệu tạm của lượt hiện tại, tối đa 768 KiB theo đề xuất ban đầu
```

Các con số này chưa phải hợp đồng cuối. Khi refactor phải đo bằng test và gom thành một policy dùng chung, không khai riêng cho Customer, Activity và `fbmOnly`.

## 6. Customer: một request tới FBM, nhiều chunk về GAS

### 6.1. Quyết định đang chọn

Nếu endpoint FBM tiếp tục cho phép lấy toàn bộ Customer an toàn, Extension gọi **một request tới FBM** để lấy toàn bộ dữ liệu cần quét.

Không được nhầm với việc gửi toàn bộ response đó về GAS.

### 6.2. Luồng đề xuất

```text
1. GAS đọc một nhóm ID/hash ShinCRM vừa phải.
2. GAS gửi plan và danh sách đó cho Extension.
3. Extension gọi FBM một lần.
4. Extension lọc và chiếu các trường GAS yêu cầu.
5. Extension trả kết quả theo output chunk (giai đoạn đầu chưa tính hFBM, mục 2A điểm 2).
6. GAS tính hFBM, hSHIN và đọc hBASE.
7. GAS phân loại và ghi từng chunk qua cửa ghi.
8. GAS chỉ tăng cursor sau khi ghi và state thành công.
```

### 6.3. Nội dung observation

Giai đoạn đầu mỗi bản ghi mang các trường đã chiếu để GAS tự hash. Dạng dưới đây chỉ áp dụng khi đã chuyển hash sang Extension (mục 2A điểm 3). Không đổi thì chỉ cần:

```json
{
  "id": "CUS-001",
  "hFBM": "...",
  "status": "unchanged"
}
```

Bản ghi thay đổi mới mang các trường đã projection để GAS ghi:

```json
{
  "id": "CUS-002",
  "hFBM": "...",
  "status": "changed",
  "record": {
    "companyName": "...",
    "phone": "..."
  }
}
```

Không trả toàn bộ cột FBM nếu GAS không dùng.

### 6.4. Envelope chunk

Mỗi chunk cần có tối thiểu:

```json
{
  "runId": "run-123",
  "jobId": "customer-scan-1",
  "chunkIndex": 0,
  "inputFingerprint": "...",
  "hasMore": true,
  "records": []
}
```

`inputFingerprint` dùng để phát hiện GAS và Extension đang xử lý cùng một plan/dataset logic, không phải để thay thế baseline.

## 7. Activity quy mô lớn

FBM đã từng trả khoảng 171.771 Activity, 35,5 MB trong khoảng 19 giây. Điều này chứng minh Extension có thể giữ bulk lớn trong RAM của lượt xử lý, nhưng không chứng minh rằng dữ liệu đó nên đi qua GAS hoặc được lưu lâu dài.

### 7.1. Tầng bulk

Khi response và thời gian còn trong ngân sách:

```text
FBM → Extension:
  bulk lớn

Extension:
  lọc theo mã khách, chiếu cột

Extension → GAS:
  bản ghi đã chiếu theo chunk; GAS hash và phân loại changed, missing, fbmOnly
```

### 7.2. Tầng dự phòng

Không coi kích thước hiện tại là giới hạn vĩnh viễn. Nếu bulk vượt ngân sách, timeout hoặc xử lý không kịp, GAS chuyển sang cửa sổ ngày hoặc phân trang:

```text
2024-01-01 → 2024-03-31
2024-04-01 → 2024-06-30
...
```

Chính sách chọn `bulk` hay `windowed` phải do một module/policy duy nhất sở hữu.

`activitySince` chỉ giới hạn phạm vi ngày; nó không chứng minh mọi Activity cũ không bị sửa vì FBM không có timestamp sửa cuối đáng tin cậy. Vì vậy vẫn cần một full reconcile định kỳ nếu muốn phát hiện sửa ở bản ghi cũ.

### 7.3. Không giữ queue bulk lâu dài

Không lưu hàng trăm nghìn Activity trong `chrome.storage`, Sheet staging hoặc `DocumentProperties`. Nếu Extension mất tab, GAS phải có thể khởi động lại từ cursor và cửa ghi phải idempotent.

Nếu cần chia output thành nhiều chunk, phải ưu tiên cơ chế có thể đọc lại hoặc lấy chi tiết theo ID thay vì biến RAM Extension thành nguồn sự thật lâu dài.

## 8. DSL/plan mới và việc dọn sạch DSL cũ

Đã điều chỉnh theo mục 2A điểm 4: không dựng trình thông dịch primitive tổng quát; các mục 8.2–8.3 dưới đây chỉ giữ làm tham khảo khi đặt tên tham số của từng loại việc cố định.

### 8.1. Quyết định

Không nuôi song song DSL mới với các trường cũ:

```text
jsonPaths
arrayFilters
arrayProjections
```

Các trường cũ chỉ được dùng để rà inventory và chuyển đổi. Khi refactor hoàn tất, parser, field và test cũ phải được loại bỏ nếu không còn contract nào dùng.

### 8.2. Plan mới

Nên có một schema plan có phiên bản, nhưng phân tách rõ hai nhóm trách nhiệm:

```text
TransportPlan:
  request đã soạn
  path cần giữ
  projection/filter
  giới hạn output

BulkPlan:
  khóa ghép
  trường hash
  chuẩn hóa
  cách emit changed/missing/fbmOnly
  chính sách chunk
```

Tên schema cuối phải kiểm tra với các module hiện có trước khi tạo mới.

### 8.3. Primitive allowlist

Bộ máy Extension chỉ cho một tập lệnh kỹ thuật cố định, dự kiến:

```text
selectPath
extractText
projectRows
filterRows
matchByKey
normalizeForHash
hashRows
emitObservations
chunkOutput
```

Không có `eval`, `new Function`, JavaScript tùy ý, thao tác ghi Sheet, thao tác đổi state GAS hoặc quyết định conflict.

### 8.4. Một nơi định nghĩa

`SYNC_SCHEMA` và hợp đồng fingerprint là nguồn định nghĩa duy nhất cho:

- trường tham gia;
- mapping tên/mã;
- chuẩn hóa;
- khóa ghép;
- thuật toán hash.

GAS tạo plan từ nguồn đó. Extension chỉ chạy plan đã biên dịch. Không khai lại danh sách trường ở từng flow.

## 9. Hash và đối soát ba chiều

### 9.1. Ba giá trị

```text
hBASE:
  baseline đã được xác nhận ở lần trước

hSHIN:
  GAS đọc Sheet hiện tại và tự tính

hFBM:
  GAS tính từ dữ liệu FBM đã chiếu (giai đoạn đầu);
  Extension tính chỉ khi chuyển theo mục 2A điểm 3
```

Không lưu `hSHIN` thành cột riêng.

### 9.2. Hợp đồng hash

Plan phải mang phiên bản contract, danh sách field, normalization và thuật toán. Extension không được tự chọn field hoặc tự quyết định quy tắc.

Chỉ áp dụng khi hash đã chuyển sang Extension. Hai môi trường dùng một tệp hash chung (mục 2A điểm 3) và cần test vector chung. Nếu GAS và Extension không cho ra cùng kết quả từ cùng input, phải dừng trước bulk.

Việc Extension thực thi primitive `hashRows` không có nghĩa Extension sở hữu nghiệp vụ. Nó chỉ thực hiện công thức do GAS cấp; GAS vẫn là nơi phân loại và ghi.

## 10. Quy tắc conflict

### 10.1. Không tự động cho FBM thắng

Khi hai bên cùng thay đổi, tự động lấy FBM sẽ có nguy cơ ghi đè thay đổi có chủ ý trên ShinCRM. Log chỉ truy vết được, không khôi phục quyết định đã bị mất.

Phương án chủ dự án chốt ngày 2026-10-06 (thay cho bản "chỉ lấy FBM" trước đó; đã ghi vào `09/04` mục "Chế độ xử lý xung đột riêng"):

```text
Conflict:
  máy phát hiện và đóng băng, không bao giờ tự quyết
  người dùng xem các trường đang khác
  chọn một trong ba phương án:
    PA1 lấy FBM
    PA2 lấy ShinCRM (kỳ sau đẩy lên FBM)
    PA3 tùy chỉnh: từng trường chọn FBM, ShinCRM hoặc tự nhập giá trị mới; kết quả ghi vào ShinCRM và kỳ sau đẩy lên FBM
```

Lý do giữ đủ ba phương án: mọi quyết định đều do người bấm nên không có ghi đè vô tình; rủi ro còn lại chỉ là độ phức tạp của code, phải chặn bằng test. Có thể có nút “Để xử lý sau”; nó chỉ giữ conflict nguyên trạng.

### 10.2. Luồng xác nhận

```text
1. GAS phát hiện conflict, ghi trạng thái "xung đột chờ quyết" lên Sheet (dòng Sheet chính là hàng đợi).
2. Người dùng mở chế độ xung đột; GAS đọc FBM, tính diff và trả DTO một bản ghi.
3. Người dùng chọn PA1, PA2 hoặc PA3.
4. GAS đọc lại FBM hiện tại.
5. Nếu FBM đã đổi từ lúc mở, trả DTO mới để xem lại.
6. Nếu không đổi, ghi kết quả vào ShinCRM qua cửa ghi.
7. Cập nhật baseline bằng hFBM hiện tại.
8. PA2/PA3 để trạng thái chờ đối soát; kỳ sau đi đường đẩy bình thường.
9. Ghi Log quyết định.
```

### 10.3. Định danh và khóa ghép

Phải phân biệt:

```text
stt_rec_kh của Customer
activity id
  → khóa kỹ thuật để ghép bản ghi

ma_kh và mọi trường đồng bộ khác
  → nếu lệch theo luật đối soát thì đi vào conflict
```

Nếu khóa kỹ thuật không tìm thấy, đó là `missing` hoặc liên kết không chắc chắn, không phải máy tự chọn bên thắng.

Đặc biệt, không còn ngoại lệ “`ma_kh` lệch thì FBM thắng tự động”. Tài liệu 09 hiện có đoạn quy định ngược lại; khi refactor phải cập nhật đoạn đó trước khi sửa code.

## 11. Baseline và cửa ghi

Baseline tiếp tục nằm trên Sheet:

```text
@CUS_HASH_FBM
@ACT_HASH_FBM
```

### Pull

Khi `hFBM == hSHIN`, GAS ghi dữ liệu và baseline trong đúng một lần qua cửa ghi. Không ghi baseline nếu còn conflict, thiếu dữ liệu hoặc kết quả chưa xác nhận.

### Push

Response ghi thành công chưa đủ. GAS phải đọc lại đúng bản ghi FBM, tính/kiểm tra hash thực tế, chỉ khi khớp `hPUSH` mới cập nhật baseline.

`hPUSH` chỉ là metadata tạm của lượt đang chờ xác nhận, không phải bản sao record.

## 12. Missing, deleted và dữ liệu vắng mặt

Không suy ra:

```text
missing = deleted
```

Customer có thể vắng do chuyển giao hoặc phân quyền. Activity có thể bị hard-delete nhưng cơ chế hiện tại chưa có bằng chứng đủ chắc cho mọi trường hợp.

Luật an toàn:

- đánh cờ bản ghi không thấy;
- đóng băng khi cần;
- không tự xóa mềm;
- không tự gửi lệnh xóa lên FBM;
- không tạo Drive/database index mới để cố đoán.

## 13. Không dùng Drive/database index

Đã loại khỏi phương án.

Không dùng:

- Drive làm kho danh sách Activity;
- database ngoài làm nguồn index;
- `chrome.storage` làm state nghiệp vụ;
- Sheet staging chứa toàn bộ bulk.

Extension chỉ giữ dữ liệu tạm của lượt hiện tại trong RAM. GAS chỉ giữ cursor, thống kê, số đếm xung đột cùng một bản ghi xung đột đang mở, và lỗi.

## 14. Idempotency khi mất tab hoặc mất response

Không thể đảm bảo exactly-once trong trình duyệt. Thiết kế theo at-least-once nhưng kết quả ghi phải idempotent.

Mỗi job/chunk cần có:

```text
runId
jobId
chunkIndex
inputFingerprint
```

GAS chỉ tăng cursor sau khi ghi Sheet, Log và state thành công.

Nếu Extension mất tab trước khi GAS nhận kết quả:

```text
cursor không tăng
Extension chạy lại
cửa ghi nhận ra bản ghi đã có
ghi lặp trở thành no-op hoặc cập nhật có kiểm soát
```

Với push, không gửi lại mù sau khi mất response. Phải đi qua read-back/recovery để xác định request đã tới FBM hay chưa.

## 15. Di chuyển state V1 sang V2

Không để hai owner song song đọc/ghi `V1` và `V2`.

Phương án ưu tiên:

1. Giữ `stateRead/stateWrite` làm owner duy nhất.
2. Thêm `schemaVersion` vào state.
3. Khi mở phiên, repository chuyển state cũ thành state nhỏ mới.
4. Kiểm tra state mới trước khi ghi.
5. Chỉ sau khi ghi thành công mới bỏ phần dữ liệu cũ không còn cần.
6. Nếu state đang ở giữa một request ghi nguy hiểm, không tự resume mù; chuyển qua recovery.

V2 chỉ giữ:

```json
{
  "schemaVersion": 2,
  "runId": "...",
  "phase": "...",
  "cursor": {},
  "counts": {},
  "lastError": "...",
  "conflictCount": 0,
  "conflictRefresh": null
}
```

Không giữ response FBM, lookup Rows đầy đủ, preview dài, candidate record hay danh sách hàng trăm nghìn ID.

Xung đột không có danh sách trong state (theo G7.2, FBM-024): hàng đợi xung đột chính là các dòng Sheet có trạng thái `xung đột chờ quyết`. State chỉ giữ số đếm `conflictCount` và đúng một bản ghi đang mở `conflictRefresh` (entity, id, hash FBM lúc mở); giá trị hai bên được đọc lại và tính diff khi người dùng mở bản ghi, nên state không phình theo số xung đột.

## 15A. Lỗi sau audit chuyển vào phiên refactor

Chủ dự án duyệt ngày 2026-10-06: các lỗi dưới đây nằm đúng phần "GAS gánh dữ liệu lớn và chuỗi thời gian chờ" mà refactor viết lại, nên không sửa trên kiến trúc hiện tại để tránh sửa hai lần. Mô tả đầy đủ ở bảng lỗi của `2026.10.07 Kế hoạch sửa lỗi FBM sau audit.md`. Refactor chỉ coi là xong khi từng lỗi có test chứng minh không còn đường xảy ra.

- FBM-005, FBM-016: thời gian chờ Sidebar, Extension và GAS không thống nhất (Sidebar báo lỗi trước khi Extension hết thời gian hợp lệ).
- FBM-030: trang Customer khoảng 2.000 dòng xử lý trong một lần gọi GAS. Trang quét toàn bộ đã giảm còn 50 (mục 2A điểm 9); kiểm lại thời gian một lát khi kéo toàn bộ thật rồi mới đóng.
- FBM-031: mốc "trần thời gian lát" thực ra là hạn khứ hồi request 120 giây, không phải chốt 6 phút của GAS.
- FBM-013: cuối pull ghi Customer và Activity bằng hai cửa ghi trong cùng một lần chạy GAS (đánh dấu vắng mặt); làm lại cùng luồng `missing`/`fbmOnly` mới.
- Kiểm chứng thật phần pull số lượng lớn (phần pull của Kịch bản L1–L3) chạy sau refactor.

## 16. Các phương án đã bị loại

### 16.1. GAS nhận full bulk response

Bị loại vì:

- response Activity có thể lên hàng chục MB;
- vượt trần doPost hoặc tốn thời gian parse;
- làm callback GAS nặng;
- dễ bị giữ nhầm vào state;
- không cần thiết vì phần lớn bản ghi không đổi.

### 16.2. Extension chạy JavaScript gửi từ GAS bằng `eval`

Bị loại vì:

- Manifest V3/CSP hạn chế `eval` và `new Function`;
- remote code khó kiểm soát và khó kiểm thử;
- tạo rủi ro chạy mã tùy ý trên Extension có quyền đọc tab FBM;
- phá nguyên tắc một bộ máy kỹ thuật cố định.

### 16.3. Extension tự ghi Sheet

Bị loại vì:

- tạo cửa ghi thứ hai;
- phải thêm OAuth/Sheets API vào Extension;
- dễ lệch với cửa ghi, validate và Log của GAS;
- làm Extension trở thành nơi sở hữu state nghiệp vụ.

### 16.4. Lưu bulk vào `DocumentProperties`

Bị loại vì lỗi 17–20 KB đã chứng minh state có thể vượt trần ngay ở lookup. `DocumentProperties` chỉ phù hợp với cursor và metadata nhỏ.

### 16.5. Lưu bulk vào `chrome.storage`

Bị loại vì dữ liệu gắn với từng máy, có thể mất khi xóa Extension/đổi máy, và biến Extension thành nguồn sự thật.

### 16.6. Sheet staging chứa toàn bộ Activity

Bị loại vì quy mô hàng trăm nghìn dòng làm staging thành kho dữ liệu thứ hai, tăng chi phí và tạo thêm đường ghi.

### 16.7. Drive/database làm index

Bị loại khỏi phương án hiện tại để không thêm quyền, chi phí, nguồn sự thật và cơ chế đồng bộ mới.

### 16.8. Tự động cho FBM thắng conflict

Bị loại vì conflict nghĩa là chưa biết thay đổi nào là quyết định cuối. Log không cứu được dữ liệu đã bị ghi đè.

### 16.9. Suy ra `missing` là deleted

Bị loại vì vắng Customer có thể do phân quyền/chuyển giao; Activity hard-delete chưa đủ bằng chứng để tự xóa an toàn.

### 16.10. Giữ DSL cũ và DSL mới song song lâu dài

Bị loại vì tạo hai hợp đồng, hai parser và nhiều nơi có thể khai cùng một hành vi. Khi refactor phải chuyển sang plan mới sạch rồi dọn tàn dư.

## 17. Nguyên tắc “một hành vi, một chỗ định nghĩa” khi refactor

Trước khi tạo module hoặc hàm mới, phải inventory các owner hiện có và tái sử dụng/mở rộng nếu đã có:

```text
stateRead/stateWrite:
  owner state

write gate:
  owner ghi Sheet

SYNC_SCHEMA:
  owner trường và fingerprint contract

AutoLogin/session gate:
  owner chính sách phiên

projection/executor hiện có:
  nền để chuyển sang plan mới

seenStore/marker/read-back:
  nền idempotency và recovery
```

Không tạo một hàm normalize/hash thứ hai theo từng entity. Không tạo một bộ cursor mới trong Extension. Không tạo một cổng ghi riêng cho chunk bulk.

Nếu một hành vi thật sự cần chuyển owner, phải ghi rõ:

```text
owner cũ là gì
owner mới là gì
module nào bị loại bỏ
test nào chứng minh không còn hai đường thực thi
```

## 18. Thứ tự triển khai refactor sau này

Đây là lộ trình đề xuất, chưa phải checklist đã duyệt:

1. Đọc lại các chuyên đề 09 liên quan và đối chiếu toàn bộ owner hiện có.
2. Cập nhật tài liệu chính thức về ranh giới mới GAS–Extension và luật conflict (mục 10.1).
3. **Đo và lập kế hoạch, chưa refactor (chủ dự án yêu cầu 2026-10-07).** Gắn mốc thời gian (chỉ thêm đo, không đổi hành vi) cho mọi giai đoạn của một lượt: preflight, kiểm phiên đăng nhập, Category, Customer, Activity, đóng phiên; trong mỗi lần gọi GAS đo từng bước (đọc/ghi state, đọc Sheet, hash, cửa ghi, trace) để biết khoảng 10 giây chưa rõ (mục 2B.2). Tự chạy thử trên DEV bằng chế độ thử hoặc quét nền chi tiết giới hạn khách, lấy bảng thời gian từng giai đoạn và từng bước, xếp theo tổng thời gian và công sức. Từ đó phân tích, thảo luận với chủ dự án, lập kế hoạch refactor cụ thể; chỉ bắt đầu refactor khi chủ dự án chốt.
4. Thu gọn state, bỏ phân trang Customer bên FBM, sửa mẫu số tiến trình (mục 2B.3, 2B.4, 2B.5 điểm 6).
5. Bắt tay phiên bản GAS–Extension (mục 2A điểm 1), có test và thông báo Sidebar/Log khi lệch.
6. Đo ngân sách đường Extension → GAS: dung lượng và thời gian GAS xử lý một gói, tính cả trần 6 phút (mục 2A điểm 7).
7. Nhiều khách trong một lần gọi GAS (mục 2B.5 điểm 1–3), làm trước bulk vì giữ nguyên cách gọi FBM và cho số đo chắc chắn.
8. Activity bulk: Extension gọi FBM một lần (hoặc theo cửa sổ ngày), lọc theo mã khách GAS gửi, chiếu cột, chia gói; GAS hash và đối soát. Đây là phần giá trị nhất: thay khoảng một request mỗi khách bằng một request.
9. Luật vắng mặt theo lượt hoàn tất và chạy lại cả lượt khi mất tab (mục 2A điểm 5–6), có test mất tab, mất response, gói trùng.
10. Customer theo cùng khung.
11. Gọn state V2 và đóng các lỗi ở mục 15A.
12. Chỉ khi số đo cho thấy cần: chuyển hash sang Extension bằng tệp dùng chung (mục 2A điểm 3).
13. Đăng nhập qua Extension, nếu vẫn cần (mục 2A điểm 8).
14. Chạy `node tests/run.js`, push GAS/Extension DEV, chạy dữ liệu giả lập lớn, rồi mới kiểm chứng trên FBM thật với mã thử.

## 19. Những điều chưa nên tự coi là đã chốt

Các điểm sau vẫn cần duyệt lại khi bắt đầu phiên refactor:

- tên cuối của các plan và DTO;
- field cụ thể của `LoginObservation` để không lộ dữ liệu nhạy cảm;
- cách Extension lấy chi tiết khi một output chunk quá lớn;
- ngưỡng byte sau khi test thực tế;
- chiến lược fallback Activity giữa bulk và cửa sổ ngày;
- cách migration state đang có request dở;
- cách phát hiện và xử lý snapshot thay đổi giữa lúc Extension đọc bulk;
- phạm vi chính xác của các trường được coi là conflict ngoài khóa kỹ thuật.

Riêng các điểm sau đã được định hướng rõ trong cuộc thảo luận:

```text
GAS là bộ não và nguồn sự thật.
Extension làm phần kỹ thuật nặng: gọi FBM, lọc, chiếu, chia gói.
GAS tự tính hash ở giai đoạn đầu; chuyển sang Extension chỉ khi đo thấy cần, bằng một tệp dùng chung.
Bắt tay phiên bản GAS–Extension trước mọi lượt quét.
GAS không nhận full bulk response.
Customer ưu tiên một request lấy toàn bộ từ FBM, sau đó chunk về GAS.
State lâu dài phải nhỏ hơn rất nhiều so với relay payload.
V2 là phiên bản logic trong cùng owner state.
DSL cũ không được nuôi song song khi refactor.
Conflict không tự động cho FBM thắng.
Missing không tự động biến thành deleted.
Không dùng Drive/database index trong phương án này.
```

## 20. Trạng thái hiện tại

Đã điều chỉnh phương án ngày 2026-10-07 (mục 2A), sửa lỗi cursor phình và preflight đọc lặp ngoài refactor, ghi hiện trạng và số đo ở mục 2B. Refactor làm ở branch riêng tách từ `main` sau khi gộp `feature/fbm-sync`. Chưa có hành động nào sau đây:

- chưa sửa Tài liệu 09;
- chưa sửa code GAS;
- chưa sửa code Extension;
- chưa xóa DSL cũ;
- chưa migration state;
- chưa viết test refactor;
- chưa push GAS hoặc Extension.

Khi quay lại công việc, phải bắt đầu bằng việc đọc tệp này và checklist đang làm, sau đó xác nhận lại các điểm “chưa nên tự coi là đã chốt” trước khi sửa hợp đồng chính thức.
