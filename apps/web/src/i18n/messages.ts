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
  | 'tributeSuccess'
  | 'recentTributes'
  | 'trendingPets'
  | 'searchPlaceholder'
  | 'noProfilesFound';

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en: {
    brand: 'Onest',
    tagline: 'Eternal animal memorials & paw-print tributes on eCash',
    newProfile: 'Create Animal Profile',
    pawTribute: 'Leave Paw Print',
    petName: 'Pet Name',
    species: 'Species (Dog, Cat, etc.)',
    breed: 'Breed / Description',
    birthDate: 'Birth / Adoption Date',
    passingDate: 'Passing Date (Optional for living)',
    tributeWords: 'Words of Love & Remembrance',
    submitTribute: 'Dedicate Paw Print (PoW Mine)',
    miningTribute: 'Mining PoW & Dedicating Paw Print...',
    tributeSuccess: 'Paw print dedicated forever on eCash!',
    recentTributes: 'Recent Paw Prints',
    trendingPets: 'Trending Memorials',
    searchPlaceholder: 'Search by pet name...',
    noProfilesFound: 'No animal memorials found yet.',
  },
  vi: {
    brand: 'Onest',
    tagline: 'Ký ức vĩnh cửu & dấu chân tưởng nhớ thú cưng trên eCash',
    newProfile: 'Tạo hồ sơ thú cưng',
    pawTribute: 'Để lại dấu chân',
    petName: 'Tên thú cưng',
    species: 'Loài (Chó, Mèo, v.v.)',
    breed: 'Giống / Mô tả',
    birthDate: 'Ngày sinh / Nhận nuôi',
    passingDate: 'Ngày mất (Để trống nếu còn sống)',
    tributeWords: 'Lời nhắn gửi & Kỷ niệm',
    submitTribute: 'Dâng dấu chân (Khai thác PoW)',
    miningTribute: 'Đang khai thác PoW & Dâng dấu chân...',
    tributeSuccess: 'Dấu chân đã được ghi mãi trên chuỗi eCash!',
    recentTributes: 'Dấu chân gần đây',
    trendingPets: 'Hồ sơ nổi bật',
    searchPlaceholder: 'Tìm kiếm theo tên thú cưng...',
    noProfilesFound: 'Chưa có hồ sơ thú cưng nào.',
  },
  zh: {
    brand: 'Onest',
    tagline: '在 eCash 上镌刻跨越彩虹桥的爪印纪念',
    newProfile: '创建宠物纪念档案',
    pawTribute: '献上永恒爪印',
    petName: '宠物名字',
    species: '物种（猫、狗等）',
    breed: '品种 / 描述',
    birthDate: '出生 / 领养日期',
    passingDate: '离世日期（健在可留空）',
    tributeWords: '怀念与思念之语',
    submitTribute: '献上爪印（PoW 算力铸造）',
    miningTribute: '正在计算 PoW 并镌刻爪印...',
    tributeSuccess: '爪印已永远铭记于 eCash 链上！',
    recentTributes: '最新纪念爪印',
    trendingPets: '热门纪念档案',
    searchPlaceholder: '搜索宠物名字...',
    noProfilesFound: '暂无宠物纪念档案。',
  },
};

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
