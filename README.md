# SendIt

Dịch vụ chia sẻ file kiểu WeTransfer, chạy trên máy của bạn. Trình duyệt upload và download **trực tiếp** với MinIO qua URL có chữ ký (pre-signed URL); API không chuyển tiếp dữ liệu file.

## Cấu trúc

```
apps/api         NestJS API (kèm dọn dẹp file hết hạn)
apps/web         Next.js + Tailwind
packages/shared  Hằng số / schema dùng chung
infra/           Docker Compose cho Postgres và MinIO
```

Chỉ có 4 thành phần:

| Thành phần     | Vai trò                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| **Web**        | Giao diện (Next.js)                                                                    |
| **API**        | Tạo link, kiểm tra mật khẩu, đếm lượt tải, ký URL upload/download, tự xóa file hết hạn |
| **PostgreSQL** | Lưu thông tin từng lần gửi (chạy trong Docker)                                         |
| **MinIO**      | Lưu nội dung file (chạy trong Docker), nói chuyện bằng giao thức S3                    |

Hiện chỉ chạy được trên máy này: link chia sẻ có dạng `http://localhost:3000/d/...`, nên máy khác không mở được.

## Yêu cầu

- Node.js ≥ 22.12 (khuyến nghị 24, xem `.nvmrc`)
- pnpm 9
- Docker Desktop

## Chạy dự án

**Lần đầu** (mở Docker Desktop trước):

```bash
pnpm install   # cài thư viện, tạo file .env từ .env.example, build phần dùng chung
pnpm start     # bật Postgres + MinIO, cập nhật database, chạy API + web
```

**Những lần sau** chỉ cần `pnpm start`. Mở http://localhost:3000.

**Tắt:** `pnpm stop` (chạy được từ bất kỳ cửa sổ terminal nào) dừng API, web, Postgres và MinIO. Dữ liệu vẫn được giữ lại. Hoặc bấm `Ctrl+C` ở cửa sổ đang chạy `pnpm start` để chỉ dừng API và web.

| Service       | Địa chỉ                                        |
| ------------- | ---------------------------------------------- |
| Web           | http://localhost:3000                          |
| API           | http://localhost:4000/api/health               |
| MinIO         | http://localhost:9000                          |
| MinIO console | http://localhost:9001 (tài khoản trong `.env`) |
| Postgres      | localhost:5433                                 |

Lưu ý:

- **MinIO được build từ source** (`infra/minio/Dockerfile`), vì MinIO không còn phát hành Docker image công khai. Lần `pnpm start` đầu tiên mất vài phút để build.
- **Postgres dùng cổng 5433** để tránh xung đột với Postgres cài sẵn trên máy, hoặc với dải cổng mà Windows giữ chỗ.

## Tất cả các lệnh

| Lệnh                       | Làm gì                                                                    |
| -------------------------- | ------------------------------------------------------------------------- |
| `pnpm start`               | Bật mọi thứ: Docker (Postgres + MinIO), cập nhật database, API + web      |
| `pnpm stop`                | Dừng hết: API, web, Postgres + MinIO (dữ liệu vẫn còn)                    |
| `pnpm dev`                 | Chỉ chạy API + web, khi Docker đã bật sẵn. Tự tải lại khi sửa code        |
| `pnpm dev:stop`            | Chỉ dừng API + web, giữ Postgres + MinIO chạy                             |
| `pnpm docker:up`           | Chỉ bật Postgres + MinIO                                                  |
| `pnpm docker:down`         | Chỉ tắt Postgres + MinIO                                                  |
| `pnpm docker:logs`         | Xem log của Postgres + MinIO                                              |
| `pnpm db:migrate`          | Áp dụng migration mới vào database                                        |
| `pnpm db:new --name <tên>` | Sau khi sửa `apps/api/prisma/schema.prisma`: tạo migration mới và áp dụng |
| `pnpm check`               | Kiểm tra tất cả: format, lint, kiểu TypeScript, unit test                 |
| `pnpm test`                | Chỉ chạy unit test                                                        |
| `pnpm test:integration`    | Test với Postgres + MinIO thật (cần Docker bật; dùng DB và bucket riêng)  |
| `pnpm format`              | Tự định dạng lại code                                                     |
| `pnpm build`               | Build tất cả, để kiểm tra code biên dịch được                             |

## Loại file được nhận

Mỗi transfer chứa **đúng một file**, thuộc **bất kỳ loại nào**, tối đa 2 GB. Muốn gửi nhiều file thì nén chúng thành một file trước.

- Không kiểm tra loại file và không quét virus. File dùng được ngay khi upload xong (trạng thái `READY`).
- Vì nhận mọi loại file, server không tin `Content-Type` do trình duyệt báo. File luôn được lưu với kiểu `application/octet-stream` và tải về dưới dạng `attachment`, nên trình duyệt không bao giờ mở hay chạy file (ví dụ `.html`, `.svg`) ngay trên địa chỉ của MinIO.
- Trang tải nhắc người nhận rằng file không được quét virus.

## Dọn dẹp tự động

API tự chạy việc dọn dẹp 10 phút một lần (`CLEANUP_INTERVAL_SECONDS`), và chạy ngay một lần khi khởi động:

- Xóa file hết hạn.
- Xóa file đã hết lượt tải, sau khi URL tải cuối cùng đã hết hiệu lực.
- Xóa upload bỏ dở quá 24 giờ.

Chạy nhiều bản API cùng lúc vẫn an toàn: mỗi lần xóa đều có điều kiện, nên một file không bị xử lý hai lần.

Chủ transfer có thể gỡ file bất cứ lúc nào bằng `DELETE /api/transfers/:id`, kèm manage token.

## API upload

Tất cả endpoint nằm dưới `/api`. Các endpoint quản lý cần header `Authorization: Bearer <manageToken>`.

1. `POST /api/transfers` với `{ file: { name, size }, expiresInDays?, maxDownloads?, password?, title?, message? }`.
   - File nhỏ (dưới 100 MB): server trả URL `PUT` kèm các header bắt buộc.
   - File lớn: server trả `partSize` và `partCount`.
2. File lớn: `POST /api/transfers/:id/parts` với `{ partNumbers }` để lấy URL cho từng part, tối đa 100 URL mỗi lần.
3. Trình duyệt `PUT` dữ liệu thẳng lên MinIO. Chữ ký của URL gồm cả `Content-Length` (và `Content-Type` với file nhỏ), nên MinIO từ chối nếu dữ liệu khác với kích thước đã khai báo.
4. `POST /api/transfers/:id/complete`, kèm `{ parts: [{ partNumber, etag }] }` với file multipart. Server kiểm tra dung lượng thật trên MinIO rồi chuyển transfer sang `READY`. Nếu dung lượng không khớp, file bị xóa và transfer bị gán `REJECTED`.

## API download

Các endpoint công khai cho người nhận link `/d/<token>`:

1. `GET /api/d/:token`: xem thông tin file.
   - Link có mật khẩu chỉ trả `{ requiresPassword: true }` cho tới khi người nhận mở khóa.
   - Link không tồn tại, hết hạn, hết lượt tải, đã xóa hoặc chưa upload xong đều trả cùng một lỗi 404.
2. `POST /api/d/:token/unlock` với `{ password }`: trả `accessToken`, có hiệu lực 30 phút và chỉ dùng được cho đúng link đó.
   - Sai 5 lần thì link bị khóa 15 phút (trả 429, kèm header `Retry-After`).
3. `POST /api/d/:token/url`: trừ một lượt tải rồi trả URL `GET` có hiệu lực 60 giây.
   - MinIO trả file dưới dạng `attachment` với kiểu `application/octet-stream`.

## Bảo mật

- **Rate limit theo IP**, bộ đếm lưu trong bộ nhớ của API. Cấu hình nằm ở `apps/api/src/security/rate-limits.ts`.

  | Endpoint                | Giới hạn                                 |
  | ----------------------- | ---------------------------------------- |
  | Mặc định (mọi endpoint) | 120 request/phút                         |
  | Tạo transfer            | 20/giờ                                   |
  | Nhập mật khẩu           | 20 lần/15 phút, vượt thì bị chặn 15 phút |
  | Lấy URL tải             | 30/phút                                  |
  | `/api/health`           | Không giới hạn                           |
  - Bộ đếm mất khi API khởi động lại, và mỗi bản API đếm riêng. Việc dò mật khẩu vẫn luôn bị chặn nhờ cơ chế khóa link (sai 5 lần), vốn lưu trong Postgres.

- **HTTP:**
  - Header bảo mật do helmet thêm vào; không còn header `X-Powered-By`.
  - CORS chỉ cho phép `WEB_ORIGIN`.
  - Body JSON tối đa 1 MB. Body quá lớn hoặc sai cú pháp trả 413/400 thay vì 500.
- **Cấu hình:** API từ chối khởi động với `NODE_ENV=production` nếu `APP_SECRET` vẫn là giá trị mẫu trong `.env.example`.
- **Log:**
  - Với `NODE_ENV=production`, log ghi dạng JSON, mỗi request một dòng.
  - Token trong đường dẫn được thay bằng `/d/:token`, và query string bị bỏ, nên log không bao giờ chứa link chia sẻ.

## Giao diện web

| Trang                          | Chức năng                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                            | Kéo thả hoặc chọn **một** file bất kỳ, đặt thời hạn, giới hạn lượt tải, mật khẩu, tiêu đề, lời nhắn. Dung lượng file được kiểm tra ngay trên trình duyệt.                                                                                                                                                                                                          |
| `/d/<token>`                   | Trang của người nhận: nhập mật khẩu (nếu có), xem thông tin file, tải xuống.                                                                                                                                                                                                                                                                                       |
| `/history`                     | Danh sách file đã gửi **từ trình duyệt này**, lưu trong localStorage, không cần đăng nhập. Trạng thái và số lượt tải được lấy trực tiếp từ server. Có nút sao chép link, mở trang quản lý, bỏ một file khỏi lịch sử hoặc xóa toàn bộ lịch sử. Tối đa 50 file gần nhất. Mở một link quản lý ở trình duyệt khác cũng sẽ thêm file đó vào lịch sử của trình duyệt ấy. |
| `/t/<id>/manage#key=…&share=…` | Trang của người gửi: xem trạng thái, số lượt tải, lấy lại link chia sẻ, xóa file. Hai token nằm sau dấu `#` nên không bao giờ được gửi lên server.                                                                                                                                                                                                                 |

- **Upload thẳng lên MinIO bằng XHR** (để có tiến độ, tốc độ và thời gian còn lại).
  - File lớn được chia part, upload 4 part song song.
  - Mỗi part tự thử lại tối đa 3 lần với URL mới.
  - Một part lỗi hẳn thì các part khác dừng lại và transfer dở dang bị xóa.
  - Logic nằm ở `apps/web/lib/upload/uploader.ts` và có unit test.
- **Header bảo mật:**
  - `Referrer-Policy: no-referrer`, vì token nằm trong URL.
  - CSP chỉ cho phép kết nối tới API (`NEXT_PUBLIC_API_URL`) và MinIO (`S3_ENDPOINT`).
  - Không cho nhúng trang vào iframe.
- **Chuỗi giao diện** nằm trong `apps/web/lib/i18n.ts`. Thêm ngôn ngữ mới chỉ cần thêm một từ điển cùng cấu trúc.

## Nếu sau này muốn đưa lên Internet

Cần thêm: một server (VPS) hoặc Cloudflare Tunnel, một tên miền, HTTPS (ví dụ Caddy), và Dockerfile cho API và web. Phần lưu file có thể giữ MinIO, hoặc chuyển sang dịch vụ tương thích S3 (AWS S3, Cloudflare R2) chỉ bằng cách đổi các biến `S3_*`. Code upload/download không phải sửa.
