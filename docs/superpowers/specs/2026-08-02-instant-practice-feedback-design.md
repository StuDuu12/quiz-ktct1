# Thiết kế phản hồi tức thời và thứ tự cố định cho luyện tập

Ngày: 2026-08-02  
Phạm vi: chế độ luyện tập theo chương của học phần Kinh tế chính trị Mác – Lênin

## Mục tiêu

- Ngay khi người dùng chọn một phương án, giao diện phải hiển thị đáp án đã chọn, trạng thái đúng hoặc sai, đáp án chuẩn và lời giải mà không chờ yêu cầu lưu hoàn tất.
- Việc lưu câu trả lời vẫn diễn ra trên Supabase và không làm mất lịch sử hoặc khả năng tiếp tục phiên.
- Câu hỏi luyện tập xuất hiện theo đúng thứ tự trong nguồn Markdown, không xáo trộn giữa các lượt làm.
- Thi thử 40 câu tiếp tục xáo trộn theo cấu hình hiện tại.

## Kết quả rà soát Markdown

Nguồn chạy production là sáu file trong `content/ktct`. Sáu file tương ứng trong thư mục `../markdown` có SHA-256 giống hệt từng cặp, vì vậy không có hai phiên bản nội dung khác nhau.

Trình phân tích hiện đọc được 497 câu: 49, 87, 111, 60, 90 và 100 câu tương ứng chương 1 đến 6. Tất cả 497 câu đều có bốn phương án hợp lệ, đáp án đúng và lời giải không rỗng. Bộ 21 kiểm thử của trình phân tích Markdown đang đạt.

Có hai điểm cần xử lý khi xác định thứ tự:

- Chương 3 không có nội dung câu 7 nhưng bảng đáp án cuối file vẫn có dòng câu 7. Trình phân tích bỏ dòng đáp án mồ côi này và giữ 111 câu có nội dung theo thứ tự xuất hiện.
- Chương 6 gồm hai chủ đề, mỗi chủ đề đánh số lại từ 1 đến 50. Vì vậy `source_number` không thể tự nó biểu diễn đúng thứ tự 100 câu của file.

Do đó, thứ tự luyện tập phải lấy từ vị trí xuất hiện thực tế trong Markdown, không chỉ sắp theo `source_number`.

## Thiết kế dữ liệu

Mỗi câu hỏi có thêm một thứ tự luyện tập ổn định trong chương, gọi là `practice_position`. Giá trị này bắt đầu từ 1 và được tạo theo thứ tự câu mà trình phân tích đọc từ file Markdown.

- Dữ liệu KTCT hiện tại được backfill từ cùng bộ Markdown đã xác thực, nên chương 6 nhận thứ tự 1–100 dù số câu hiển thị trong hai chủ đề bị lặp.
- Câu tạo mới qua quản trị được đặt sau các câu hiện có của chương; khi cần, quản trị viên có thể chỉnh thứ tự bằng quy trình quản lý câu hỏi sau này. Việc xây dựng giao diện kéo-thả không thuộc phạm vi thay đổi này.
- Hàm tạo lượt luyện tập sắp theo `practice_position`, rồi theo `created_at` và `id` làm khóa phụ để kết quả luôn xác định.
- Nhánh tạo đề thi thử giữ nguyên thuật toán phân bổ và xáo trộn hiện tại.

## Luồng phản hồi tức thời

Hàm `load_practice_attempt_questions` hiện đã trả về `correct_option_id` và `explanation` cho lượt luyện tập thuộc về người dùng. Ứng dụng sẽ sử dụng dữ liệu sẵn có này thay vì đợi `verify_practice_answer` mới tô đúng hoặc sai.

Khi chọn đáp án:

1. Client kiểm tra phương án thuộc câu hiện tại.
2. Client cập nhật state ngay: khóa câu, ghi phương án, tính `isCorrect`, gắn đáp án chuẩn và lời giải.
3. React hiển thị màu đúng/sai, đáp án chuẩn và lời giải trong cùng lượt render.
4. Client gọi lưu đáp án ở nền.
5. Phản hồi máy chủ được dùng để xác nhận hoặc hòa giải nếu một tab khác đã lưu câu đó trước.

Không thêm request mới vào thời điểm bấm. Payload đáp án chuẩn đã nằm trong dữ liệu tải đầu phiên luyện tập; đây là đánh đổi được chấp nhận vì chế độ này phục vụ học tập, không phải thi có giám sát.

## Lỗi mạng và nhiều tab

- Nếu lưu thất bại, phản hồi học tập vẫn giữ nguyên trên màn hình và trạng thái lưu chuyển sang lỗi.
- Giao diện hiển thị nút “Thử lưu lại”; thao tác kết thúc bài tiếp tục gửi toàn bộ đáp án hiện có để tránh mất dữ liệu.
- Nếu máy chủ trả về đáp án đã khóa bởi tab khác, client thay state bằng dữ liệu máy chủ và hiển thị kết quả đã lưu chính thức.
- Mỗi câu chỉ nhận lần chọn đầu tiên trong một tab, giống quy tắc khóa câu hiện tại.

## Thay đổi thành phần

- `practice/engine`: nhận đáp án chuẩn và lời giải từ câu hỏi để tạo feedback cục bộ trong phép cập nhật state thuần túy.
- `PracticeSession`: render feedback ngay, gọi lưu nền và chỉ dùng kết quả RPC để xác nhận/hòa giải.
- Migration Supabase: thêm và backfill `practice_position`; cập nhật `start_attempt` để chỉ nhánh luyện tập dùng thứ tự này.
- Pipeline Markdown/seed: sinh `practice_position` theo chỉ số câu trong từng chương và kiểm tra tính duy nhất, liên tục.
- Kiểu dữ liệu Supabase và các fixture kiểm thử được cập nhật tương ứng.

## Kiểm thử chấp nhận

- Với Promise lưu chưa hoàn tất, click đáp án vẫn lập tức đánh dấu radio, tô đúng/sai, hiện đáp án chuẩn và lời giải.
- Lưu thành công không làm thay đổi feedback đã hiển thị.
- Lưu thất bại giữ feedback, báo lỗi và cho phép thử lại.
- Phản hồi hòa giải từ tab khác thay phương án cục bộ bằng phương án chính thức.
- Lượt luyện tập mới của từng chương có thứ tự `practice_position` tăng dần và giống nhau qua nhiều lượt.
- Chương 6 có đúng 100 vị trí liên tục dù `source_number` lặp 1–50.
- Thi thử vẫn tạo 40 câu theo cơ chế ngẫu nhiên hiện tại.
- Parser xác nhận đủ 497 câu, không thiếu đáp án đúng hoặc lời giải; cảnh báo đáp án mồ côi của chương 3 vẫn được ghi nhận rõ ràng.

## Ngoài phạm vi

- Không thay đổi nội dung học thuật hoặc tự tạo câu 7 đang thiếu ở chương 3.
- Không đánh số lại văn bản hai chủ đề của chương 6.
- Không thay đổi thuật toán thi thử, thời gian thi hoặc cách chấm điểm.
- Không xây dựng giao diện quản trị kéo-thả thứ tự câu hỏi trong lần thay đổi này.
