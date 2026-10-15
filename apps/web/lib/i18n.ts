import { LIMITS, type TransferStatus } from '@sendit/shared';
import { formatBytes, formatDuration } from './format';

/**
 * All user-facing text. Adding a language means adding another object with the same shape and
 * choosing between them; components only ever read from `t`.
 */
const vi = {
  appName: 'SendIt',
  tagline: 'Gửi file nhanh, tự xóa khi hết hạn',
  footer: 'File tự động xóa khi hết hạn hoặc hết lượt tải.',

  upload: {
    title: 'Gửi một file',
    subtitle: `Mọi loại file, tối đa ${formatBytes(LIMITS.maxFileBytes)}`,
    dropHere: 'Kéo thả file vào đây',
    orBrowse: 'hoặc bấm để chọn file',
    dropActive: 'Thả file để chọn',
    accepted: `Một file bất kỳ, tối đa ${formatBytes(LIMITS.maxFileBytes)}`,
    remove: 'Bỏ chọn',
    tooLarge: `File vượt quá ${formatBytes(LIMITS.maxFileBytes)}.`,
    empty: 'File rỗng.',
    oneFileOnly: 'Mỗi lần chỉ gửi được một file. Muốn gửi nhiều file, hãy nén chúng lại trước.',
    options: 'Tùy chọn',
    expiry: 'Hết hạn sau',
    days: (n: number) => `${n} ngày`,
    maxDownloads: 'Giới hạn lượt tải',
    unlimited: 'Không giới hạn',
    password: 'Mật khẩu',
    passwordPlaceholder: 'Không bắt buộc',
    passwordTooShort: `Mật khẩu cần ít nhất ${LIMITS.minPasswordLength} ký tự.`,
    showPassword: 'Hiện mật khẩu',
    hidePassword: 'Ẩn mật khẩu',
    titleLabel: 'Tiêu đề',
    messageLabel: 'Lời nhắn',
    optional: 'Không bắt buộc',
    submit: 'Tải lên và tạo link',
    uploading: 'Đang tải lên…',
    cancel: 'Hủy',
    remaining: (seconds: number) => `còn khoảng ${formatDuration(seconds)}`,
    speed: (bytesPerSecond: number) => `${formatBytes(bytesPerSecond)}/s`,
    failed: 'Tải lên thất bại',
    cancelled: 'Đã hủy tải lên.',
    tryAgain: 'Thử lại',
    leaveWarning: 'File đang được tải lên. Rời trang sẽ hủy việc tải lên.',
    rateLimited: (seconds?: number) =>
      seconds
        ? `Bạn thao tác quá nhanh. Thử lại sau ${formatDuration(seconds)}.`
        : 'Bạn thao tác quá nhanh. Thử lại sau ít phút.',
  },

  result: {
    title: 'Đã tải lên',
    shareLink: 'Link chia sẻ',
    shareHint: 'Gửi link này cho người nhận.',
    manageLink: 'Link quản lý',
    manageHint:
      'Lưu lại link này: đây là cách duy nhất để xem trạng thái hoặc xóa file. Đừng gửi nó cho người khác.',
    expiresAt: 'Hết hạn',
    another: 'Gửi file khác',
  },

  status: {
    labels: {
      UPLOADING: 'Chưa tải lên xong',
      READY: 'Sẵn sàng tải',
      REJECTED: 'Bị từ chối',
      EXPIRED: 'Đã hết hạn',
      DELETED: 'Đã xóa',
    } satisfies Record<TransferStatus, string>,
    uploading: 'File chưa được tải lên hết. Link sẽ dùng được ngay khi tải lên xong.',
    ready: 'Người nhận có thể tải ngay.',
    rejected: 'Dung lượng file nhận được không khớp với file đã chọn, nên file đã bị xóa.',
    expired: 'File đã hết hạn hoặc hết lượt tải và đã bị xóa.',
    deleted: 'File đã bị xóa.',
  },

  download: {
    loading: 'Đang tải thông tin…',
    unavailableTitle: 'Link không khả dụng',
    unavailable: 'Link không tồn tại, đã hết hạn, đã hết lượt tải hoặc file đã bị xóa.',
    lockedTitle: 'File được bảo vệ bằng mật khẩu',
    passwordLabel: 'Mật khẩu',
    unlock: 'Mở khóa',
    wrongPassword: 'Sai mật khẩu.',
    lockedOut: (seconds: number) =>
      `Nhập sai quá nhiều lần. Thử lại sau ${formatDuration(seconds)}.`,
    expires: 'Hết hạn',
    downloadsLeft: (n: number | null) =>
      n === null ? 'Không giới hạn lượt tải' : `Còn ${n} lượt tải`,
    download: 'Tải xuống',
    starting: 'Đang bắt đầu tải xuống…',
    started: 'Đã bắt đầu tải xuống. Kiểm tra thư mục tải về của trình duyệt.',
    failed: 'Không tải được file. Thử lại sau.',
    notScanned: 'File không được quét virus. Chỉ mở nếu bạn tin người gửi.',
  },

  manage: {
    title: 'Quản lý file',
    invalidLink: 'Link quản lý không hợp lệ. Hãy dùng đúng link được cấp sau khi tải lên.',
    notFound: 'Không tìm thấy file. Link quản lý có thể sai hoặc file đã bị xóa.',
    downloads: 'Lượt tải',
    downloadsValue: (count: number, max: number | null) =>
      max === null ? `${count}` : `${count} / ${max}`,
    created: 'Tải lên lúc',
    delete: 'Xóa file',
    confirmDelete: 'Bấm lần nữa để xóa vĩnh viễn',
    deleting: 'Đang xóa…',
    deleteFailed: 'Không xóa được file. Thử lại sau.',
  },

  nav: {
    send: 'Gửi file',
    history: 'Lịch sử',
  },

  history: {
    title: 'File đã gửi',
    subtitle: 'Chỉ lưu trên trình duyệt này. Xóa dữ liệu trình duyệt sẽ mất lịch sử.',
    empty: 'Bạn chưa gửi file nào từ trình duyệt này.',
    sendFirst: 'Gửi file đầu tiên',
    sentAt: (when: string) => `Gửi lúc ${when}`,
    expiresAt: (when: string) => `Hết hạn ${when}`,
    downloads: (count: number, max: number | null) =>
      max === null ? `${count} lượt tải` : `${count}/${max} lượt tải`,
    notFound: 'Không còn trên máy chủ',
    loadFailed: 'Không lấy được trạng thái',
    copyLink: 'Sao chép link',
    manage: 'Quản lý',
    remove: 'Bỏ khỏi lịch sử',
    clear: 'Xóa toàn bộ lịch sử',
    confirmClear: 'Bấm lần nữa để xóa lịch sử',
    clearHint:
      'Lịch sử chứa link quản lý của từng file. Nếu dùng máy chung, hãy xóa lịch sử khi xong. Việc này không xóa file trên máy chủ.',
    saved: 'Đã lưu vào lịch sử trên trình duyệt này.',
  },

  common: {
    copy: 'Sao chép',
    copied: 'Đã sao chép',
    size: 'Dung lượng',
    error: 'Có lỗi xảy ra. Thử lại sau.',
    networkError: 'Không kết nối được tới máy chủ.',
  },
};

export const t = vi;
