# Ghi chú tạm — Module thông báo dùng chung

Tài liệu nháp để xử lý sau khi nghiệm thu xong phiên đồng bộ FBM. Chưa phải hợp đồng kiến trúc chính thức.

## Mục tiêu

- Cho phép mọi module của ShinCRM phát thông báo qua một service dùng chung.
- FBM, Scheduler, Bot và các module sau này không tự gọi trực tiếp Zalo/Telegram hay kênh cụ thể.
- Lỗi gửi thông báo không được làm hỏng nghiệp vụ chính.

## Kiến trúc dự kiến

```text
Module nghiệp vụ
      |
      v
NotificationService
      |
      +--> NotificationOutbox
      |
      v
NotificationPort
      |
  +---+---+
  |       |
Null   Adapter kênh thật
Adapter  (ví dụ Zalo Bot)
```

## Hợp đồng sơ bộ

Caller truyền một object gồm:

- `type`
- `level`
- `title`
- `message`
- `channel`
- `recipient`
- `dedupeKey`

`NotificationService` không để lỗi adapter ném ngược vào caller. Khi chưa có kênh hoặc chưa có cấu hình, service trả trạng thái không gửi được nhưng luồng nghiệp vụ vẫn tiếp tục.

## Outbox dự kiến

Chỉ lưu các thông báo cần theo dõi hoặc thử lại. Trường tối thiểu:

`notificationId`, `type`, `level`, `channel`, `recipient`, `message`, `dedupeKey`, `status`, `attempts`, `lastError`, `createdAt`, `nextAttemptAt`.

Thông báo `info` có thể bỏ qua khi chưa có kênh. Thông báo `warn`/`error` có thể ghi Log hoặc đưa vào hàng chờ giới hạn. Không retry vô hạn.

## Ranh giới

- Log là bằng chứng việc đã xảy ra; Notification là yêu cầu gửi thông tin.
- UI notification, Log và thông báo ra kênh ngoài là ba cơ chế riêng.
- Không gọi NotificationService ngược từ lỗi của chính NotificationService.
- Không ghi bí mật, cookie, mật khẩu hoặc payload nhạy cảm vào thông báo.

## Việc cần làm sau phiên FBM

- Chuyển nội dung này thành `11. Thông báo và kênh nhận.md` và `11A. Hợp đồng thông báo và kênh nhận.md` trong bộ tài liệu kiến trúc.
- Cập nhật bản đồ tài liệu và lộ trình chung.
- Viết `NotificationService` cùng `NullNotificationAdapter`.
- Viết test khi chưa có kênh nhận và khi adapter ném lỗi.
- Chọn kênh thật rồi mới viết adapter tương ứng.

## Việc refactor Tài liệu 09 — Đồng bộ FBM

Tài liệu hiện tại dài và đang chứa nhiều loại nội dung trong cùng một file. Sau khi nghiệm thu FBM, tách thành folder nhưng giữ nguyên các quyết định nghiệp vụ trước; đây là refactor cấu trúc, không tự ý đổi hợp đồng.

Folder dự kiến:

```text
0_Documentation/Opus 4.8 tư vấn/09. Đồng bộ FBM/
├── 00. Mục lục và luật bất biến.md
├── 01. Tab FBM và phiên đăng nhập.md
├── 02. Kiến trúc GAS Extension Sidebar.md
├── 03. Scheduler và các pipeline.md
├── 04. Schema và Category.md
├── 05. Hash baseline và conflict.md
├── 06. Pull Customer.md
├── 07. Pull Activity.md
├── 08. Push Customer.md
├── 09. Push Activity.md
├── 10. Xóa vắng mặt và tombstone.md
├── 11. Log cấu hình và bảo mật.md
├── 12. Runbook vận hành và nghiệm thu.md
├── 13. Câu hỏi chưa kiểm chứng.md
└── Phụ lục/
```

File `09. Đồng bộ FBM.md` hiện tại sẽ trở thành mục lục/bản đồ quyết định hoặc được chuyển đổi có lưu vết Git. Mục lục phải có bảng tóm tắt toàn bộ pipeline và sơ đồ ASCII xử lý tab FBM:

```text
Sidebar hoặc Scheduler
        -> GAS tạo request
        -> Extension kiểm tra relay config
        -> tìm tab FBM
             -> không có tab: dừng, không gọi FBM
             -> có tab: ping/nạp executor
        -> fetch trong tab FBM
             -> Login.aspx/401/403: báo hết phiên, không push
             -> response hợp lệ: trả thô về GAS
        -> GAS tiếp cursor hoặc kết thúc/log
```

Phần đăng nhập phải tách rõ ba trạng thái: tab đã mở và đăng nhập, tab mở nhưng hết phiên, và chưa mở tab. Tự động đăng nhập là tùy chọn riêng, không được mô tả như điều kiện bắt buộc nếu chưa triển khai.

## Cơ chế an toàn chống đẩy nhầm lên FBM

Mục tiêu là nếu người dùng xóa/sửa nhầm cột hoặc làm thay đổi hàng loạt dữ liệu thì chiều push phải dừng an toàn.

Thứ tự đề xuất:

1. **Schema guard:** kiểm tra thiếu/trùng/sửa mã cột bắt buộc trước mỗi kỳ; sai thì chỉ cho đọc và báo `PUSH_PAUSED_SCHEMA_CHANGED` hoặc mã cụ thể hơn.
2. **Mass-change circuit breaker:** phát hiện một cột bị xóa trắng hoặc quá nhiều bản ghi đổi trong một kỳ; tạm dừng toàn bộ chiều push.
3. **Preview và xác nhận một lần:** hiển thị số bản ghi và các trường sắp đẩy; chỉ phát request ghi sau khi người dùng xác nhận. Vẫn giữ cả hai khóa `Ghi thật` và `Cho phép ghi thật lên FBM`. Cần chốt 1 con số làm ngưỡng an toàn, nếu trong ngưỡng thì vẫn tự chạy. vượt ngưỡng thì phải để người dùng duyệt.
4. **Snapshot phục hồi:** cân nhắc lưu giá trị cũ của các bản ghi sắp push vào vùng backup riêng; hash hiện tại chỉ phát hiện lệch, không tự khôi phục được nội dung cũ.   --> ý kiến người dùng: bỏ qua backup.

GAS phải thực hiện các cổng an toàn này. Extension chỉ relay/fetch, không tự phán đoán thay đổi là đúng hay nhầm.

## Thứ tự xử lý sau nghiệm thu FBM

1. Chốt và refactor Tài liệu 09 thành folder.
2. Cập nhật bản đồ tài liệu và lộ trình chung.
3. Viết test schema guard và mass-change breaker.
4. Implement các cổng an toàn trong GAS.
5. Thêm preview/xác nhận push ở Sidebar.
6. Sau đó mới triển khai Module thông báo dùng chung.

===

Về phần tiến trình khi đồng bộ FBM, mình nghĩ nên hiển thị như sau: hiện hết tất cả các bước khi đồng bộ, chia theo nhóm, ví dụ: kiểm tra, hay đang chờ gas, đang đẩy request lên FBM - ghi rõ là đang làm gì.

1. Công việc 1
2. Công việc 2
...
7. Công việc 7
..
10. Công việc 10.

--> Cái nào thực hiện xong thì màu xanh dương, cái nào đang chạy thì in đậm màu đen, cáo nào lỗi thì màu đỏ, cái nào chưa chạy thì màu xám nhạt...

Kiểu như vậy. Nó có nhiều giai đoạn lớn nhé, Ví dụ khi mới chạy đồng bộ là kiểm tra danh mục hay gì đó 1 lượt, xong thì báo xong. Bắt đầu vào phần đồng bộ khách hàng, Đồng bộ xong thì đến đồng bộ giao dịch,...

Về việc đồng bộ từng khách hàng, nếu xong thì xóa log cũ hiện tiến trình với khách đang chạy.

Đưa có vào component nào có chế độ mở rộng ý, kiểu chạy các bước đồng bộ khách hàng (nếu có) xong thì thu gọn lại để hiển thị các bước đồng bộ giao dịch (nếu có). Cái nào xong đang chạy thì hiện chi tiết, cái nào xong rồi thì thu gọn lại trừ khi người dùng chủ động mở ra -->

Bạn nghĩ có nên thế không, hay là nó quá phức tạp và mình đang over engineering?

===

Phần `ĐIỀU KHIỂN PHIÊN` trong màn hình Đồng bộ ở sidebar mình nghĩ nên để lên đầu thay vì để ở cuối như hiện tại.

Cần thiết thì làm nó gọn lại và ghim lên đầu cũng được. Phần cho phép đồng bộ FBM tự động hay không mình nghĩ nên làm thành công tắc bên trong màn hình đồng bộ, ấn vào biểu tượng menu đồng bộ thì tự động vào màn hình đồng bộ luôn chứ không hiển thị 2 tùy chọn như bây giờ nữa.

===

Hiện tại mình đang làm việc với bạn về phiên đồng bộ FBM, nhưng mình đang muốn refactor 1 số thứ, và muốn phát triển đồng thời vài module tương đối độc lập khác. Bạn đọc và tư vấn lộ trình các bước hợp lý giúp mình nhé.

# 1. Tách phạm vi phát triển và làm việc đồng thời

**Yêu cầu của người dùng**

ShinCRM có nhiều module tương đối độc lập:

- Đồng bộ FBM.
- Truy vấn và nhập liệu nhanh qua bot.
- Gửi thông báo và nhắc việc qua bot.

Người dùng chỉ có một máy tính nhưng muốn mở ba phiên Codex/VSCode đồng thời. Branch hiện tại đang chứa lẫn ShinCRM độc lập, FBM và tài liệu bot.

**AI tư vấn**

Không cần tách thành ba repository. Dùng:

```text
1 repository
3 Git worktree
3 feature branch
1 integration branch
```

Đề xuất:

```text
main
integration
feature/fbm-sync
feature/bot-zalo
feature/reminder
```

Mỗi worktree mở bằng một cửa sổ VSCode riêng. Không cần tách lại toàn bộ lịch sử cũ nếu các commit đã bị trộn; chỉ cần giữ branch hiện tại làm bản lưu, tạo `integration` từ trạng thái ổn định hiện tại và giữ lịch sử phát triển mới sạch từ đó.

Các thay đổi ảnh hưởng schema hoặc service dùng chung phải được đưa vào `integration` trước. Không để ba phiên tự sửa cùng một hợp đồng chung.

# 2. Môi trường DEV và deployment

**Yêu cầu của người dùng**

Các module phải deploy mới kiểm thử được vì cần kết nối GAS, FBM hoặc Zalo. Người dùng chỉ có một máy và không muốn các phiên ghi đè lẫn nhau.

**AI tư vấn**

Branch không tự cô lập GAS. `clasp push` vào cùng một GAS project sẽ ghi đè code của phiên khác.

Nên có:

```text
DEV-FBM
DEV-BOT
DEV-REMINDER
DEV-INTEGRATION
PRODUCTION
```

Mỗi môi trường cần GAS project/deployment và Sheet riêng. Chỉ `integration` được dùng để kiểm thử kết hợp; chỉ `main` được đưa lên production.

Với Extension, nên dùng Chrome profile riêng cho môi trường FBM DEV và production để tránh nhầm tab hoặc cookie FBM.

# 3. ShinCRM độc lập và mapping tùy chọn

**Yêu cầu của người dùng**

ShinCRM độc lập phải hoạt động bình thường ngay cả khi mapping FBM chưa có dữ liệu hoặc chưa được cấu hình.

**AI tư vấn**

Cần giữ ranh giới:

```text
CATEGORY_SCHEMA
  thuộc lõi ShinCRM

FBM_CATEGORY_MAPPING_SCHEMA
  thuộc module fbm_sync
```

`CATEGORY_SCHEMA` chỉ mô tả danh mục mà ShinCRM cần cho dropdown và nhập liệu.

`FBM_CATEGORY_MAPPING_SCHEMA` mô tả quan hệ như:

```text
@CAT_TINH_THANH -> @CAT_TINH_THANH_FBM
```

Nếu mapping chưa có:

- ShinCRM vẫn nạp dữ liệu và lưu Customer/Activity;
- FBM preflight báo chưa cấu hình mapping;
- FBM push/pull bị chặn đúng chỗ;
- không được làm hỏng `sidebarBoot`, `categoryReadAll()` hoặc `saveRecord()`.

Hiện code `CategoryGate.js` đã có runtime map, nhưng còn tự suy ra companion bằng hậu tố `_FBM`. Nên dần chuyển sang schema ánh xạ riêng để FBM tự biết quan hệ mà không bắt lõi phải biết FBM.

# 4. Kiến trúc Zalo

**Yêu cầu của người dùng**

Zalo không chỉ gửi thông báo mà còn nhận lệnh truy vấn và nhập liệu nhanh. Sau này có thể thay bằng Telegram hoặc email.

**AI tư vấn**

Nên giữ port-adapter nhưng tách port theo mục đích:

```text
NotificationPort      gửi thông báo chủ động
CommandChannelPort    nhận lệnh từ bot
ReplyPort             trả kết quả hội thoại
```

`ZaloBotAdapter` có thể triển khai nhiều port, nhưng module nghiệp vụ không được gọi trực tiếp API Zalo.

Sau này thêm Telegram hoặc email chỉ cần thêm adapter, không sửa logic FBM hoặc nhắc việc.

# 5. Module thông báo

**Yêu cầu của người dùng**

Có một module thông báo độc lập. Bất kỳ module nào, chẳng hạn FBM, cũng có thể gửi nội dung tới kênh nhận thông báo.

**AI tư vấn**

Notification không hoàn toàn giống Log:

- Log ghi lại việc đã xảy ra.
- Notification tạo yêu cầu gửi thông tin.

Nên có:

```text
NotificationService
  -> NotificationPort
      -> ZaloBotAdapter
```

Caller truyền loại, mức độ, nội dung, kênh, người nhận và khóa chống trùng.

Thông báo lỗi không được làm hỏng đồng bộ FBM. Nên có `NotificationOutbox` hoặc cấu trúc tương đương để lưu:

- mã thông báo;
- nội dung;
- kênh;
- trạng thái gửi;
- số lần thử;
- lỗi cuối cùng;
- `dedupeKey`.

Có thể dùng chung Sheet Log về mặt vật lý, nhưng service và hợp đồng phải tách riêng.

# 6. Nhắc việc

**Yêu cầu của người dùng**

Hiện mỗi giao dịch có thời gian và nội dung nhắc việc, nhưng màn hình quản trị chỉ hiện giao dịch gần nhất. Người dùng nghiêng về PA1:

- mỗi khách hàng chỉ có một nhắc việc hiệu lực;
- lấy từ giao dịch gần nhất;
- để trống thì không nhắc.

Người dùng không muốn hiển thị trạng thái “đã nhắc/chưa nhắc”.

**AI tư vấn**

Chọn PA1 ở giai đoạn hiện tại.

Cần chốt rõ:

- giao dịch mới nhất có nhắc việc thì thay nhắc việc cũ;
- giao dịch mới nhất để trống thì hủy hiệu lực nhắc việc cũ;
- chỉ nhập thời gian hoặc chỉ nhập nội dung thì báo lỗi;
- cả hai cùng trống thì hợp lệ và nghĩa là không nhắc.

Không cần hiển thị trạng thái gửi cho người dùng, nhưng máy vẫn cần trạng thái nội bộ hoặc `dedupeKey`. Nếu không, trigger sẽ gửi lặp cùng một nhắc việc.

Không nên tạo một trigger cho mỗi giao dịch. Nên dùng một trigger định kỳ 5 hoặc 15 phút, quét các nhắc việc đến hạn và gửi một lần.

Realtime tuyệt đối không đáng tin cậy với Google Sheet. Có thể kiểm tra thêm khi mở Sidebar, nhưng trigger định kỳ vẫn là cơ chế chính.

# 7. Config

**Yêu cầu của người dùng**

Config trên Sheet khó hiểu và dễ bị sửa nhầm. Người dùng muốn chỉnh trong Sidebar. Config nên lưu an toàn, không nhất thiết nằm trên Sheet.

**AI tư vấn**

Nên refactor dần sang:

```text
Sidebar
  -> GAS kiểm tra
  -> ConfigService
  -> PropertiesService
```

Tạo `CONFIG_SCHEMA` mô tả:

- khóa;
- kiểu dữ liệu;
- mặc định;
- quyền sửa;
- phạm vi;
- phép kiểm tra;
- phiên bản schema.

Nếu script gắn với Sheet, ưu tiên `DocumentProperties`. Nếu script độc lập, dùng `ScriptProperties` với khóa có namespace theo `spreadsheetId`.

Không chuyển toàn bộ Config trong một lượt. Trước hết tạo `ConfigRepository`, cho phép đọc Config cũ rồi di chuyển dần từng nhóm. Bộ đếm cấp mã nên chuyển sau cùng vì có yêu cầu đồng thời cao.

Token Zalo phải nằm trong Properties, không nằm trong Sheet hoặc Log.

# 8. Cửa ghi Config và Category

**Yêu cầu của người dùng**

Sidebar không được làm hỏng dữ liệu và không được ghi trực tiếp vào Sheet.

**AI tư vấn**

Code hiện tại xác nhận:

- `saveRecord()` chỉ dành cho Customer/Activity;
- `writeGateSave()` chỉ nhận entity có trong `DATA_SCHEMA`;
- Category có dạng cột danh sách;
- Config có nhiều khối key/value khác nhau.

Do đó cần thêm:

```text
ConfigWriteGate
CategoryWriteGate
```

Hai cửa này dùng chung nguyên tắc với `WriteGate`:

- khóa tài liệu;
- kiểm tra toàn bộ trước khi ghi;
- không ghi nửa chừng;
- đọc lại sau khi ghi;
- ghi Log qua `runEntryPoint`.

Không mở rộng `writeGateSave()` thành cửa ghi mọi loại Sheet.

# 9. Category và ánh xạ FBM

**Yêu cầu của người dùng**

Category vẫn cần khả năng copy/paste hàng loạt. Ánh xạ FBM có thể dài, nhưng Sidebar trực quan và an toàn hơn.

**AI tư vấn**

Giữ Category Sheet làm storage. Sidebar là giao diện quản lý:

- tìm kiếm;
- lọc mục chưa ánh xạ;
- sửa một dòng;
- dán nhiều dòng;
- xem trước;
- kiểm tra trùng/thiếu;
- ghi một lần.

Không lưu danh mục lớn trong Properties.

Hiện `CategoryGate.js` đã hỗ trợ một giá trị ShinCRM ánh xạ nhiều mã FBM bằng dấu `|` và chọn mã chính bằng `#`. Logic này nên được gom thành codec/service dùng chung; Sidebar không tự ghép chuỗi companion.

# 10. Giá trị cho phép đồng bộ FBM

**Yêu cầu của người dùng**

Chỉ chính xác `"Cho phép đồng bộ"` mới cho phép. Mọi giá trị khác, kể cả `"Không đồng bộ"` hoặc `"Cấm đồng bộ"`, đều phải là deny.

**AI tư vấn**

Đây là luật fail-safe:

```text
allow chỉ khi trim(value) === "Cho phép đồng bộ"
mọi giá trị khác = deny
```

Giá trị lạ nên deny và đồng thời cảnh báo.

Code hiện tại vẫn đang dùng:

```text
FbmSync.PUSH_ALLOW_VALUE = "Cho phép"
FbmSync.PUSH_STOP_VALUE = "Ngừng đồng bộ"
```

Đây là điểm phiên FBM phải chốt và cập nhật đồng bộ với seed, test, dữ liệu DEV và thông báo lỗi.

# 11. Sidebar

**Yêu cầu của người dùng**

Muốn quản lý Config, Category, đồng bộ và sau này thông báo/nhắc việc trong Sidebar. Lo ngại số màn hình tăng làm code nặng.

**AI tư vấn**

UI hiện tại đã có khung chung, bộ phát `ACTIONS` và màn hình FBM riêng. Vì vậy thêm màn hình không phải rủi ro lớn.

Nên thêm từng màn hình độc lập:

```text
Làm việc chính
Đồng bộ FBM
Danh mục & ánh xạ
Cài đặt
Thông báo/nhắc việc
```

Không để mỗi màn hình tự ghi Sheet hoặc tự xử lý nghiệp vụ. Mỗi màn hình chỉ:

```text
hiển thị dữ liệu
gửi action
nhận kết quả từ GAS
vẽ lại trạng thái
```

Cần có quy tắc khi đang có bản nháp Customer/Activity mà người dùng chuyển sang màn hình quản trị: cảnh báo, đóng form hoặc giữ bản nháp an toàn.

# 12. Những điểm phiên FBM cần đánh giá và chốt

1. Mapping trống có làm ShinCRM độc lập tiếp tục chạy không?
2. `FBM_CATEGORY_MAPPING_SCHEMA` đặt trong `fbm_sync` có phù hợp không?
3. Có giữ companion columns trong core tạm thời hay tách hẳn sang FBM?
4. Chốt chuỗi cho phép chính xác là `"Cho phép đồng bộ"` hay vẫn giữ `"Cho phép"`?
5. `CategoryWriteGate` sẽ ghi mapping một dòng và bulk như thế nào?
6. FBM khi thiếu mapping sẽ báo lỗi ở preflight hay bỏ qua từng bản ghi?
7. NotificationService và `NotificationOutbox` sẽ được dùng chung cho FBM và nhắc việc ra sao?
8. Các thay đổi chung sẽ merge qua `integration` như thế nào để không phá branch FBM?

Kết luận kiến trúc hiện tại nên là:

```text
ShinCRM core chạy độc lập
Category là storage danh mục
FBM có mapping schema riêng
Zalo là adapter hai chiều
Notification là module dùng chung
Nhắc việc PA1
Config chỉnh qua Sidebar, lưu dần trong Properties
Mỗi module có worktree, branch và DEV deployment riêng
```