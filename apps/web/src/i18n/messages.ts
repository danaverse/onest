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
    tagline: 'Every paw print, a story of love.',
    newProfile: 'Create Animal Profile',
    pawTribute: 'Stamp a Paw',
    petName: 'Pet Name',
    species: 'Species (Dog, Cat, etc.)',
    breed: 'Breed / Description',
    birthDate: 'Birth / Adoption Date',
    passingDate: 'Passing Date (Optional for living)',
    tributeWords: 'Words of Love & Remembrance',
    submitTribute: 'Stamp a Paw (PoW Mine)',
    miningTribute: 'Mining PoW & Stamping Paw...',
    tributeSuccess: 'Paw print stamped with love!',
    recentTributes: 'Recent Paw Prints',
    trendingPets: 'Trending Memories',
    searchPlaceholder: 'Search by pet name...',
    noProfilesFound: 'No animal memories found yet.',
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
    submitTribute: 'In dấu chân (Khai thác PoW)',
    miningTribute: 'Đang khai thác PoW & In dấu chân...',
    tributeSuccess: 'Dấu chân thương đã được ghi lại vĩnh cửu!',
    recentTributes: 'Dấu chân gần đây',
    trendingPets: 'Ký ức nổi bật',
    searchPlaceholder: 'Tìm kiếm theo tên thú cưng...',
    noProfilesFound: 'Chưa có ký ức thú cưng nào.',
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
    submitTribute: '印下爪印（PoW 算力铸造）',
    miningTribute: '正在计算 PoW 并印下爪印...',
    tributeSuccess: '爪印已印下，爱意长存！',
    recentTributes: '最新爪印记忆',
    trendingPets: '热门宠物记忆',
    searchPlaceholder: '搜索宠物名字...',
    noProfilesFound: '暂无宠物记忆档案。',
  },
};

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
