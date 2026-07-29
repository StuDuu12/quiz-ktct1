# Đặc tả ba portal vai trò và độ tin cậy chức năng

Ngày: 2026-07-30  
Trạng thái: Chờ người dùng duyệt đặc tả  
Hướng được duyệt: B — ba portal biệt lập trên cùng hệ thống

## 1. Mục tiêu

Hệ thống phải cung cấp ba trải nghiệm tách biệt theo vai trò:

- Sinh viên: học theo chương, thi thử, xem tiến độ và lịch sử.
- Giảng viên: quản lý nội dung và báo cáo trong phạm vi khóa học được phân công.
- Admin: điều hành toàn hệ thống, quản lý người dùng, vai trò, nội dung và nhật ký.

Ba portal dùng chung Supabase Auth, dữ liệu nghiệp vụ và design token, nhưng có route, layout, menu và quyền server riêng. Việc ẩn nút ở giao diện không thay thế kiểm tra quyền tại server, RPC và RLS.

Ngoài phân tách vai trò, đợt triển khai phải sửa các lỗi production đã xác định:

1. Admin đăng nhập bị đưa vào giao diện sinh viên và không có điểm vào quản trị.
2. Nút “Luyện tập” bị rơi khỏi hàng chương do cấu trúc grid sai.
3. Mở trang luyện tập tạo hàng loạt attempt trong GET/RSC render nhưng không vào phiên làm.
4. Attempt đang làm không có đường tiếp tục.
5. Thi thử không hoạt động vì production thiếu `exam_configs`.
6. Typography tiếng Việt quá nhỏ, weight/tracking thiếu ổn định và bố cục quiz chưa phù hợp tablet/mobile.

## 2. Phương án kiến trúc

### 2.1 Route và layout

| Vai trò | Route mặc định sau đăng nhập | Phạm vi chính |
|---|---|---|
| `student` | `/dashboard` | `/dashboard`, `/practice`, `/exam`, `/results`, `/history` |
| `instructor` | `/instructor` | `/instructor/**` và tài nguyên khóa học được phân công |
| `admin` | `/admin` | `/admin/**`; được phép chủ động mở chế độ xem học viên |

Mỗi portal có layout và navigation riêng:

- `StudentShell`: Tổng quan, Luyện tập, Thi thử, Lịch sử, tài khoản/đăng xuất.
- `InstructorShell`: Tổng quan giảng dạy, Học phần, Ngân hàng câu hỏi, Báo cáo, tài khoản/đăng xuất.
- `AdminShell`: Điều hành, Người dùng, Nội dung, Nhập dữ liệu, Báo cáo/Nhật ký, tài khoản/đăng xuất.

Admin có liên kết “Xem như học viên” từ `AdminShell`. Khi admin đang ở student portal, `StudentShell` hiển thị liên kết “Trang quản trị”. Hai navigation không bị trộn.

`/admin` chỉ cho `admin`; `/instructor` chỉ cho `instructor`. `student` luôn bị từ chối ở hai portal quản trị. Admin kiểm tra nội dung từ các trang quản trị tương ứng trong `/admin`, không đi qua Instructor portal. Quyền giảng viên tiếp tục bị giới hạn theo khóa học được phân công ở RPC/RLS.

### 2.2 Điều hướng sau đăng nhập

API đăng nhập cùng origin phải:

1. Xác thực bằng Supabase Auth.
2. Đọc `public.profiles.role` và `is_active` bằng phiên vừa tạo.
3. Từ chối tài khoản không hoạt động.
4. Trả về `role` và `destination` do server xác định.
5. Client dùng `router.replace(destination)` và refresh dữ liệu server.

Không lấy role từ dữ liệu form hoặc `user_metadata`. Cơ chế tự phục hồi orphan JWT hiện có vẫn được giữ.

## 3. Portal Sinh viên và luồng làm bài

### 3.1 Dashboard

Hàng chương dùng năm vùng rõ ràng:

1. Số chương.
2. Tiêu đề và số câu.
3. Độ chính xác.
4. Lần gần nhất.
5. CTA luyện tập/tiếp tục.

Không dùng `display: contents` theo cách làm phát sinh năm grid item trên bốn track. Trên mobile, dữ liệu phụ xếp dưới nội dung nhưng CTA vẫn có nhãn chữ; không dùng `font-size: 0`.

Dashboard phân biệt:

- Chưa từng làm: “Bắt đầu luyện tập”.
- Có attempt `in_progress`: “Tiếp tục” và trỏ đúng attempt.
- Đã nộp: hiển thị kết quả gần nhất và cho phép bắt đầu lượt mới.

### 3.2 Không mutation trong GET

GET/RSC render của route luyện tập chỉ được đọc dữ liệu. Nó không gọi `start_attempt`.

Việc bắt đầu bài phải đi qua server action/POST rõ ràng:

1. Người dùng bấm “Bắt đầu”.
2. Nút chuyển sang loading và bị vô hiệu hóa để chống bấm lặp.
3. Server action gọi RPC tạo hoặc tiếp tục attempt.
4. Server redirect một lần tới URL có `?attempt=<uuid>`.

RPC hoặc lớp server phải bảo đảm một yêu cầu logic không tạo nhiều attempt do retry/prefetch. Reload URL có attempt chỉ tải lại phiên hiện tại.

Các attempt production đã tạo trước đây không bị xóa tự động. Hệ thống chọn attempt đang làm hợp lệ mới nhất để tiếp tục và không làm mất lịch sử.

### 3.3 Thi thử

Provision production phải upsert đúng một cấu hình thi thử hoạt động cho học phần:

- `kind = mock_exam`
- `question_count = 40`
- `duration_seconds = 3600`
- `is_active = true`

Script verify phải thất bại nếu cấu hình thiếu hoặc sai. Dashboard chỉ hiển thị CTA hoạt động khi config sẵn sàng; nếu thiếu, hiển thị trạng thái “Chưa cấu hình” và hướng xử lý cho admin thay vì dẫn tới 404.

## 4. Portal Giảng viên

Giảng viên có dashboard riêng tại `/instructor`, không dùng `AdminShell` chung với admin.

Chức năng phải được kiểm tra:

- Xem các khóa học/chương được phân công.
- Tạo và sửa câu hỏi trong phạm vi được giao.
- Nhập và rà soát câu hỏi.
- Đưa câu hỏi và nội dung của khóa học được phân công qua các trạng thái nháp, xuất bản và lưu trữ.
- Xem báo cáo của khóa học được giao.
- Không quản lý người dùng, không cấp role, không cấu hình hệ thống.
- Truy cập course ngoài phân công phải bị từ chối tại server/RPC.

Các trang quản trị nội dung dùng component dùng chung, nhưng menu, route guard và tập dữ liệu đầu vào thuộc Instructor portal.

## 5. Portal Admin

Admin đăng nhập đi thẳng `/admin`. Portal phải kiểm tra:

- Tổng quan hệ thống.
- Quản lý người dùng và trạng thái hoạt động.
- Chuyển vai trò giữa `student`, `instructor`, `admin` bằng RPC được bảo vệ.
- Không cho khóa hoặc hạ quyền admin hoạt động cuối cùng.
- Không cho admin tự khóa tài khoản hiện tại nếu việc đó làm mất đường quản trị.
- Phân công khóa học cho giảng viên.
- Quản lý khóa học, chương, câu hỏi, import và trạng thái xuất bản.
- Xem báo cáo và audit log.

Thao tác thay đổi role/status phải ghi audit và hiển thị phản hồi thành công/thất bại rõ ràng. Không chỉnh trực tiếp `profiles` từ client.

## 6. Design system và responsive

### 6.1 Typography

Font chính: `Be Vietnam Pro`, tải qua cơ chế font của Next.js với `display: swap` và subset tiếng Việt. Fallback: `"Noto Sans", system-ui, sans-serif`.

Token chữ:

- Metadata: `12px`, chỉ dùng cho thông tin phụ.
- Nhãn/phụ đề: `14px`.
- Body, input, đáp án và CTA mobile: tối thiểu `16px`.
- Tiêu đề nội dung: `18–24px`.
- Tiêu đề trang responsive bằng `clamp()`.

Line-height body/đáp án: `1.5–1.65`. Chỉ dùng weight chuẩn `400/500/600/700/800`. Letter-spacing âm của tiêu đề tiếng Việt không vượt quá khoảng `-0.02em`.

### 6.2 Breakpoint

- `<480px`: điện thoại nhỏ, gutter 16px.
- `480–767px`: điện thoại lớn.
- `768–1023px`: tablet, gutter 24px.
- `≥1024px`: desktop, gutter 32px.
- `≥1280px`: container giới hạn độ dài dòng.

Quiz/practice chỉ dùng sidebar câu hỏi cố định từ `1024px`. Dưới mức này, danh sách câu hỏi mở bằng bottom sheet/drawer; nút mở có vùng chạm tối thiểu 44px và tôn trọng `env(safe-area-inset-bottom)`.

Không có cuộn ngang ở 375, 768, 1024 và desktop. Input không nhỏ hơn 16px trên mobile. Mọi nút/điều khiển chính có vùng chạm tối thiểu 44×44px, focus ring rõ và không phụ thuộc hover.

### 6.3 Ngôn ngữ hình ảnh

Giữ hướng mockup đã duyệt:

- Sinh viên: xanh ngọc ấm, tập trung tiến độ và hành động học.
- Giảng viên: xanh lam trầm, thiên về nội dung và báo cáo.
- Admin: tím than trung tính, thiên về điều hành và kiểm soát.

Ba portal dùng cùng spacing, radius, icon Phosphor và semantic color token để vẫn thuộc một sản phẩm.

## 7. Xử lý lỗi

- Route không có quyền: redirect tới portal đúng của vai trò kèm thông báo dễ hiểu; API/RPC trả lỗi quyền chuẩn.
- Start practice/exam thất bại: hiển thị lỗi cạnh CTA và cho retry, không chuyển thành 404 chung.
- Thiếu config: CTA bị vô hiệu hóa có giải thích; admin thấy cảnh báo cấu hình.
- Dữ liệu dashboard lỗi: trạng thái lỗi có nút thử lại.
- Client chưa hydrate: form đăng nhập và start action không được rơi về GET làm lộ password trên query string; dùng action an toàn hoặc ngăn submit cho đến khi handler sẵn sàng.

## 8. Kiểm thử và tiêu chí nghiệm thu

### 8.1 Test tự động

1. Auth/routing:
   - Mỗi role đăng nhập tới đúng portal.
   - Admin chuyển qua lại admin/student view.
   - Student bị từ chối `/admin` và `/instructor`.
   - Instructor bị từ chối chức năng quản lý user/admin-only.

2. Practice:
   - GET/prefetch tạo `0` attempt.
   - Một click tạo đúng `1` attempt.
   - Reload URL attempt không tạo bản ghi mới.
   - Attempt đang làm có link tiếp tục đúng ID.

3. Mock exam:
   - Seed tạo đúng một config 40 câu/3600 giây.
   - Verify thất bại khi config thiếu.
   - Start tạo một attempt có 40 snapshot câu hỏi.

4. Giao diện:
   - Kiểm tra hình học hàng chương ở 375/768/1024/1440.
   - Không item nào bị clip hoặc tràn ngang.
   - Quiz navigator chuyển đúng sidebar/drawer.
   - Font computed, cỡ input/body và touch target đạt yêu cầu.

5. Chức năng theo role:
   - Ma trận E2E cho các action chính của Student, Instructor và Admin.
   - Kiểm tra cả thành công và từ chối quyền.

### 8.2 Production smoke

Sau build và deploy:

- Đăng nhập bằng ba tài khoản test biệt lập.
- Xác minh destination, menu và route guard.
- Bắt đầu/tiếp tục một bài luyện tập bằng tài khoản tạm.
- Bắt đầu một bài thi thử 40 câu, xác minh timer và snapshot.
- Kiểm tra responsive bằng 375, 768, 1024 và desktop.
- Dọn tài khoản/attempt smoke tạm theo đúng phạm vi; không sửa lịch sử thật.

## 9. Triển khai dữ liệu và an toàn

- Migration/upsert config thi thử phải idempotent.
- Không xóa 13 attempt production đã phát sinh ngoài ý muốn trong đợt sửa này.
- Mọi thay đổi role dùng RPC/audit, không tắt trigger bảo vệ.
- Service-role chỉ tồn tại ở server/secret binding và không được đưa vào bundle.
- Deploy chỉ thực hiện sau khi test, typecheck, lint và build đều đạt.

## 10. Ngoài phạm vi

- Tách thành ba deployment hoặc ba Supabase project.
- Thay đổi toàn bộ nội dung ngân hàng câu hỏi.
- Xóa hoặc gộp lịch sử production hiện có.
- Thêm ứng dụng mobile native.
