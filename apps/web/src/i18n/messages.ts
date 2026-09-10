import type { Locale } from './types.js';

export type MessageKey =
  | 'brand'
  | 'tagline'
  | 'newProfile'
  | 'pawTribute'
  | 'petName'
  | 'species'
  | 'breed'
  | 'birthDate'
  | 'passingDate'
  | 'tributeWords'
  | 'submitTribute'
  | 'miningTribute'
  | 'powHint'
  | 'tributeSuccess'
  | 'recentTributes'
  | 'trendingPets'
  | 'searchPlaceholder'
  | 'noProfilesFound'
  | 'moments'
  | 'shareMoment'
  | 'noMomentsYet'
  | 'loadMore'
  | 'uploadingPhotos'
  | 'creatingPost'
  | 'verifyingPost'
  | 'postSuccess'
  | 'postPendingHint'
  | 'postVerifiedHint'
  | 'burnTxid'
  | 'done'
  | 'choosePet'
  | 'createProfileFirst'
  | 'photo'
  | 'caption'
  | 'captionPlaceholder'
  | 'postPowHint'
  | 'cancel'
  | 'posting'
  | 'postSubmit'
  | 'voteUp'
  | 'votingStart'
  | 'votingRefreshing'
  | 'remove'
  | 'comments'
  | 'noCommentsYet'
  | 'commentPlaceholder'
  | 'sendComment';

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en: {
    brand: 'Onest',
    tagline: 'Every paw print, a story of love.',
    newProfile: 'Create Animal Profile',
    pawTribute: 'Stamp a Paw',
    petName: 'Pet Name',
    species: 'Species (Dog, Cat, etc.)',
    breed: 'Breed / Description',
    birthDate: 'Birth / Adoption Date',
    passingDate: 'Passing Date (Optional for living)',
    tributeWords: 'Words of Love & Remembrance',
    submitTribute: 'Stamp a Paw',
    miningTribute: 'Mining PoW & Stamping Paw...',
    powHint: 'Your device will do a short proof-of-work (PoW) to stamp this paw.',
    tributeSuccess: 'Paw print stamped with love!',
    recentTributes: 'Recent Paw Prints',
    trendingPets: 'Trending Memories',
    searchPlaceholder: 'Search by pet name...',
    noProfilesFound: 'No animal memories found yet.',
    moments: 'Moments',
    shareMoment: 'Share a Moment',
    noMomentsYet: 'No moments shared yet. Be the first to share a loving memory.',
    loadMore: 'Load more',
    uploadingPhotos: 'Uploading photos...',
    creatingPost: 'Saving your moment...',
    verifyingPost: 'Confirming the on-chain stamp...',
    postSuccess: 'Moment stamped with love!',
    postPendingHint: 'Your stamp is confirming on-chain — it will appear in the feed shortly.',
    postVerifiedHint: 'Your loving moment is now preserved forever.',
    burnTxid: 'Transaction',
    done: 'Done',
    choosePet: 'For which animal?',
    createProfileFirst: 'Create an animal profile first, then share a moment.',
    photo: 'Photo',
    caption: 'Caption',
    captionPlaceholder: 'A loving memory...',
    postPowHint:
      'Your device will do a short proof-of-work and burn 1 PAW to stamp this moment on-chain. Please keep the app open.',
    cancel: 'Cancel',
    posting: 'Stamping...',
    postSubmit: 'Share moment',
    voteUp: 'Vote',
    votingStart: 'Preparing your vote...',
    votingRefreshing: 'Updating score...',
    remove: 'Remove',
    comments: 'Comments',
    noCommentsYet: 'No comments yet.',
    commentPlaceholder: 'Leave a kind word...',
    sendComment: 'Send',
  },
  vi: {
    brand: 'Onest',
    tagline: 'Theo dấu chân thương.',
    newProfile: 'Tạo hồ sơ thú cưng',
    pawTribute: 'In dấu chân',
    petName: 'Tên thú cưng',
    species: 'Loài (Chó, Mèo, v.v.)',
    breed: 'Giống / Mô tả',
    birthDate: 'Ngày sinh / Nhận nuôi',
    passingDate: 'Ngày mất (Để trống nếu còn sống)',
    tributeWords: 'Lời nhắn gửi & Kỷ niệm',
    submitTribute: 'In dấu chân',
    miningTribute: 'Đang khai thác PoW & in dấu chân...',
    powHint: 'Máy bạn sẽ khai thác PoW trong giây lát để in dấu chân.',
    tributeSuccess: 'Dấu chân thương đã được ghi lại vĩnh cửu!',
    recentTributes: 'Dấu chân gần đây',
    trendingPets: 'Ký ức nổi bật',
    searchPlaceholder: 'Tìm kiếm theo tên thú cưng...',
    noProfilesFound: 'Chưa có ký ức thú cưng nào.',
    moments: 'Khoảnh khắc',
    shareMoment: 'Chia sẻ khoảnh khắc',
    noMomentsYet: 'Chưa có khoảnh khắc nào. Hãy là người đầu tiên chia sẻ kỷ niệm thương yêu.',
    loadMore: 'Tải thêm',
    uploadingPhotos: 'Đang tải ảnh lên...',
    creatingPost: 'Đang lưu khoảnh khắc...',
    verifyingPost: 'Đang xác nhận dấu trên chuỗi...',
    postSuccess: 'Khoảnh khắc đã được ghi dấu thương yêu!',
    postPendingHint: 'Dấu đang được xác nhận trên chuỗi — sẽ xuất hiện trong bảng tin ngay sau đây.',
    postVerifiedHint: 'Khoảnh khắc thương yêu đã được lưu giữ mãi mãi.',
    burnTxid: 'Giao dịch',
    done: 'Xong',
    choosePet: 'Dành cho bé nào?',
    createProfileFirst: 'Hãy tạo hồ sơ thú cưng trước, rồi chia sẻ khoảnh khắc.',
    photo: 'Ảnh',
    caption: 'Chú thích',
    captionPlaceholder: 'Một kỷ niệm thương yêu...',
    postPowHint:
      'Máy bạn sẽ khai thác PoW trong giây lát và đốt 1 PAW để ghi khoảnh khắc lên chuỗi. Vui lòng giữ ứng dụng mở.',
    cancel: 'Huỷ',
    posting: 'Đang in dấu...',
    postSubmit: 'Chia sẻ khoảnh khắc',
    voteUp: 'Bình chọn',
    votingStart: 'Đang chuẩn bị bình chọn...',
    votingRefreshing: 'Đang cập nhật điểm...',
    remove: 'Xoá',
    comments: 'Bình luận',
    noCommentsYet: 'Chưa có bình luận nào.',
    commentPlaceholder: 'Gửi lời nhắn yêu thương...',
    sendComment: 'Gửi',
  },
  zh: {
    brand: 'Onest',
    tagline: '每一枚爪印，都是爱的故事。',
    newProfile: '创建宠物回忆档案',
    pawTribute: '印下爪印',
    petName: '宠物名字',
    species: '物种（猫、狗等）',
    breed: '品种 / 描述',
    birthDate: '出生 / 领养日期',
    passingDate: '离世日期（健在可留空）',
    tributeWords: '怀念与思念之语',
    submitTribute: '印下爪印',
    miningTribute: '正在计算 PoW 并印下爪印...',
    powHint: '设备将进行短暂的算力证明（PoW），然后印下爪印。',
    tributeSuccess: '爪印已印下，爱意长存！',
    recentTributes: '最新爪印记忆',
    trendingPets: '热门宠物记忆',
    searchPlaceholder: '搜索宠物名字...',
    noProfilesFound: '暂无宠物记忆档案。',
    moments: '回忆瞬间',
    shareMoment: '分享回忆瞬间',
    noMomentsYet: '还没有回忆瞬间，来第一个分享爱的记忆吧。',
    loadMore: '加载更多',
    uploadingPhotos: '正在上传照片...',
    creatingPost: '正在保存瞬间...',
    verifyingPost: '正在确认链上印记...',
    postSuccess: '爱的瞬间已印下！',
    postPendingHint: '印记正在链上确认，稍后将出现在动态中。',
    postVerifiedHint: '这份爱的瞬间已被永久珍藏。',
    burnTxid: '交易',
    done: '完成',
    choosePet: '为哪只宠物分享？',
    createProfileFirst: '请先创建宠物回忆档案，再分享瞬间。',
    photo: '照片',
    caption: '文字',
    captionPlaceholder: '留下爱的记忆...',
    postPowHint: '设备将进行短暂的算力证明并销毁 1 PAW，将此刻印在链上。请保持应用开启。',
    cancel: '取消',
    posting: '正在印下...',
    postSubmit: '分享瞬间',
    voteUp: '点赞',
    votingStart: '正在准备投票...',
    votingRefreshing: '正在更新分数...',
    remove: '删除',
    comments: '评论',
    noCommentsYet: '还没有评论。',
    commentPlaceholder: '留下温暖的话语...',
    sendComment: '发送',
  },
};

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
