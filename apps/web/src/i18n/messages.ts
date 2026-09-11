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
  | 'postFeeHint'
  | 'postNeedXec'
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
  | 'sendComment'
  | 'shareMomentPlaceholder'
  | 'search'
  | 'searchResults'
  | 'belovedPages'
  | 'postsTab'
  | 'tributesTab'
  | 'noPetPosts'
  | 'backToHome'
  | 'copyLink'
  | 'linkCopied'
  | 'userProfile'
  | 'createUserProfile'
  | 'restoreUserProfile'
  | 'userProfileIntro'
  | 'userProfileRequired'
  | 'pin'
  | 'confirmPin'
  | 'pinHint'
  | 'pinMismatch'
  | 'pinCooldown'
  | 'tabHome'
  | 'tabMyPets'
  | 'myPetsTitle'
  | 'myPetsEmpty'
  | 'myPetsLocked'
  | 'invalidSeed'
  | 'seedPhrase'
  | 'seedWarning'
  | 'iveSavedIt'
  | 'copyWords'
  | 'downloadWords'
  | 'walletAddress'
  | 'refreshBalances'
  | 'removeWallet'
  | 'walletReady'
  | 'walletReadyHint'
  | 'loadingWallet'
  | 'backupHint'
  | 'lockWallet'
  | 'unlockWallet'
  | 'backupSeed'
  | 'profileFeeHint'
  | 'needPawForProfile'
  | 'needXecForProfile'
  | 'payToCreate'
  | 'payToCreateWithXec'
  | 'payNeedXec'
  | 'creatingProfileWallet'
  | 'loading'
  | 'noPagesYet'
  | 'themeAppearance'
  | 'themeLight'
  | 'themeDark'
  | 'openUserProfile'
  | 'copyAddress'
  | 'depositHint'
  | 'back';

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
    postFeeHint:
      'Posting stamps instantly on-chain: the desk burns 1 PAW for a small XEC fee — no mining wait.',
    postNeedXec: 'You need a little more XEC to post.',
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
    shareMomentPlaceholder: 'Share a moment with your beloved animal...',
    search: 'Search',
    searchResults: 'Search results',
    belovedPages: 'Beloved Pages',
    postsTab: 'Moments',
    tributesTab: 'Paw tributes',
    noPetPosts: 'No moments shared for this page yet.',
    backToHome: 'Home',
    copyLink: 'Copy link',
    linkCopied: 'Link copied!',
    userProfile: 'Account',
    createUserProfile: 'Create account',
    restoreUserProfile: 'Restore from seed phrase',
    userProfileIntro:
      'Your user profile is a self-custodial XEC + PAW wallet. Create animal profiles from it — no server holds your keys.',
    userProfileRequired:
      'A user profile is required to create animal profiles. Your wallet burns 1 PAW and pays the desk listing fee.',
    pin: 'PIN',
    confirmPin: 'Confirm PIN',
    pinHint: '4–12 digits',
    pinMismatch: 'PINs do not match',
    pinCooldown: 'Too many attempts — try again in {seconds}s',
    tabHome: 'Home',
    tabMyPets: 'My pets',
    myPetsTitle: 'My pets',
    myPetsEmpty: 'No pet profiles yet. Create one from your wallet to start.',
    myPetsLocked: 'Unlock your user profile to see your pets.',
    invalidSeed: 'Invalid seed phrase',
    seedPhrase: 'Seed phrase',
    seedWarning:
      'Write these 12 words down and keep them offline. Anyone with them controls your wallet. We cannot recover them.',
    iveSavedIt: 'I saved my seed phrase safely',
    copyWords: 'Copy words',
    downloadWords: 'Download backup',
    walletAddress: 'Wallet address',
    refreshBalances: 'Refresh balances',
    removeWallet: 'Remove wallet from this device',
    walletReady: 'User profile ready!',
    walletReadyHint: 'Your wallet is unlocked. You can now create animal profiles.',
    loadingWallet: 'Opening your wallet...',
    backupHint: 'Enter your PIN to reveal your seed phrase.',
    lockWallet: 'Lock',
    unlockWallet: 'Unlock',
    backupSeed: 'Backup seed',
    profileFeeHint:
      'Creating an animal profile burns 1 PAW and pays a {atoms}-atom listing fee from your wallet — or pay a flat XEC fee if you have no PAW.',
    needPawForProfile: 'Your wallet needs at least {atoms} PAW (1 burn + listing fee).',
    needXecForProfile: 'Your wallet needs a little XEC for network fees.',
    payToCreate: 'Pay XEC to create profile',
    payToCreateWithXec: 'Pay {xec} XEC to create profile',
    payNeedXec: 'You need a little more XEC to pay the profile fee.',
    creatingProfileWallet: 'Creating your animal profile from your wallet...',
    loading: 'Loading...',
    noPagesYet: 'No pet pages yet. Create the first animal profile to start sharing moments.',
    themeAppearance: 'Appearance',
    themeLight: 'Light',
    themeDark: 'Dark',
    openUserProfile: 'Open account',
    copyAddress: 'Copy address',
    depositHint:
      'Send XEC (for network fees) and PAW (1 burn + 6-atom listing fee) to this address before creating an animal profile.',
    back: 'Back',
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
    postFeeHint:
      'Đăng bài được ghi lên chuỗi ngay: bàn đốt 1 PAW với một khoản phí XEC nhỏ — không cần chờ đào.',
    postNeedXec: 'Bạn cần thêm một ít XEC để đăng bài.',
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
    shareMomentPlaceholder: 'Chia sẻ khoảnh khắc cùng những dấu chân yêu thương...',
    search: 'Tìm',
    searchResults: 'Kết quả tìm kiếm',
    belovedPages: 'Trang thú cưng',
    postsTab: 'Khoảnh khắc',
    tributesTab: 'Dấu chân tri ân',
    noPetPosts: 'Trang này chưa có khoảnh khắc nào.',
    backToHome: 'Trang chủ',
    copyLink: 'Sao chép liên kết',
    linkCopied: 'Đã sao chép!',
    userProfile: 'Tài khoản',
    createUserProfile: 'Tạo tài khoản',
    restoreUserProfile: 'Khôi phục từ cụm từ hạt giống',
    userProfileIntro:
      'Hồ sơ người dùng là ví XEC + PAW tự quản. Tạo hồ sơ thú cưng từ ví này — không máy chủ nào giữ khoá của bạn.',
    userProfileRequired:
      'Cần có hồ sơ người dùng để tạo hồ sơ thú cưng. Ví sẽ đốt 1 PAW và trả phí niêm yết cho bàn.',
    pin: 'Mã PIN',
    confirmPin: 'Nhập lại mã PIN',
    pinHint: '4–12 chữ số',
    pinMismatch: 'Mã PIN không khớp',
    pinCooldown: 'Sai quá nhiều lần — thử lại sau {seconds} giây',
    tabHome: 'Trang chủ',
    tabMyPets: 'Thú cưng',
    myPetsTitle: 'Thú cưng của tôi',
    myPetsEmpty: 'Chưa có hồ sơ thú cưng. Hãy tạo từ ví của bạn.',
    myPetsLocked: 'Mở khoá hồ sơ người dùng để xem thú cưng.',
    invalidSeed: 'Cụm từ hạt giống không hợp lệ',
    seedPhrase: 'Cụm từ hạt giống',
    seedWarning:
      'Hãy ghi lại 12 từ này và cất giữ ngoại tuyến. Ai có chúng sẽ kiểm soát ví của bạn. Chúng tôi không thể khôi phục.',
    iveSavedIt: 'Tôi đã lưu cụm từ hạt giống an toàn',
    copyWords: 'Sao chép',
    downloadWords: 'Tải bản sao lưu',
    walletAddress: 'Địa chỉ ví',
    refreshBalances: 'Cập nhật số dư',
    removeWallet: 'Xoá ví khỏi thiết bị này',
    walletReady: 'Hồ sơ người dùng đã sẵn sàng!',
    walletReadyHint: 'Ví đã mở khoá. Bạn có thể tạo hồ sơ thú cưng.',
    loadingWallet: 'Đang mở ví...',
    backupHint: 'Nhập mã PIN để xem cụm từ hạt giống.',
    lockWallet: 'Khoá',
    unlockWallet: 'Mở khoá',
    backupSeed: 'Sao lưu hạt giống',
    profileFeeHint:
      'Tạo hồ sơ thú cưng sẽ đốt 1 PAW và trả phí niêm yết {atoms} atom từ ví của bạn — hoặc trả một khoản XEC cố định nếu bạn chưa có PAW.',
    needPawForProfile: 'Ví cần ít nhất {atoms} PAW (1 đốt + phí niêm yết).',
    needXecForProfile: 'Ví cần một ít XEC cho phí mạng.',
    payToCreate: 'Trả XEC để tạo hồ sơ',
    payToCreateWithXec: 'Trả {xec} XEC để tạo hồ sơ',
    payNeedXec: 'Bạn cần thêm một ít XEC để trả phí tạo hồ sơ.',
    creatingProfileWallet: 'Đang tạo hồ sơ thú cưng từ ví...',
    loading: 'Đang tải...',
    noPagesYet: 'Chưa có trang thú cưng nào. Hãy tạo hồ sơ đầu tiên để bắt đầu chia sẻ khoảnh khắc.',
    themeAppearance: 'Giao diện',
    themeLight: 'Sáng',
    themeDark: 'Tối',
    openUserProfile: 'Mở tài khoản',
    copyAddress: 'Sao chép địa chỉ',
    depositHint:
      'Hãy gửi XEC (phí mạng) và PAW (1 đốt + phí niêm yết 6 atom) vào địa chỉ này trước khi tạo hồ sơ thú cưng.',
    back: 'Quay lại',
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
    postFeeHint: '发布将立即上链：服务台销毁 1 PAW，只需少量 XEC 费用——无需等待挖矿。',
    postNeedXec: '需要更多 XEC 才能发布。',
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
    shareMomentPlaceholder: '与心爱的宠物分享此刻...',
    search: '搜索',
    searchResults: '搜索结果',
    belovedPages: '心爱的主页',
    postsTab: '回忆瞬间',
    tributesTab: '爪印致敬',
    noPetPosts: '这个主页还没有分享的瞬间。',
    backToHome: '首页',
    copyLink: '复制链接',
    linkCopied: '已复制！',
    userProfile: '账户',
    createUserProfile: '创建账户',
    restoreUserProfile: '从助记词恢复',
    userProfileIntro:
      '用户资料是自托管的 XEC + PAW 钱包。用它创建宠物档案——服务器不会保管你的私钥。',
    userProfileRequired: '创建宠物档案需要用户资料。钱包将销毁 1 PAW 并支付上架费。',
    pin: 'PIN 码',
    confirmPin: '确认 PIN 码',
    pinHint: '4–12 位数字',
    pinMismatch: '两次 PIN 不一致',
    pinCooldown: '尝试次数过多——请在 {seconds} 秒后重试',
    tabHome: '首页',
    tabMyPets: '我的宠物',
    myPetsTitle: '我的宠物',
    myPetsEmpty: '还没有宠物档案，请用钱包创建。',
    myPetsLocked: '解锁用户资料后即可查看你的宠物。',
    invalidSeed: '助记词无效',
    seedPhrase: '助记词',
    seedWarning: '请将这 12 个单词抄写并离线保存。任何拿到它的人都能控制你的钱包。我们无法恢复。',
    iveSavedIt: '我已安全保存助记词',
    copyWords: '复制',
    downloadWords: '下载备份',
    walletAddress: '钱包地址',
    refreshBalances: '刷新余额',
    removeWallet: '从此设备移除钱包',
    walletReady: '用户资料已就绪！',
    walletReadyHint: '钱包已解锁，现在可以创建宠物档案。',
    loadingWallet: '正在打开钱包...',
    backupHint: '输入 PIN 码以显示助记词。',
    lockWallet: '锁定',
    unlockWallet: '解锁',
    backupSeed: '备份助记词',
    profileFeeHint: '创建宠物档案将从钱包销毁 1 PAW 并支付 {atoms} atom 上架费——如果没有 PAW，也可以支付固定 XEC 费用。',
    needPawForProfile: '钱包至少需要 {atoms} PAW（1 销毁 + 上架费）。',
    needXecForProfile: '钱包需要少量 XEC 支付网络费。',
    payToCreate: '用 XEC 支付创建档案',
    payToCreateWithXec: '支付 {xec} XEC 创建档案',
    payNeedXec: '需要更多 XEC 来支付档案费用。',
    creatingProfileWallet: '正在用钱包创建宠物档案...',
    loading: '加载中...',
    noPagesYet: '还没有宠物主页。创建第一个宠物档案，开始分享回忆吧。',
    themeAppearance: '外观',
    themeLight: '浅色',
    themeDark: '深色',
    openUserProfile: '打开账户',
    copyAddress: '复制地址',
    depositHint: '创建宠物档案前，请先向此地址发送 XEC（网络费）和 PAW（1 销毁 + 6 atom 上架费）。',
    back: '返回',
  },
};

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
