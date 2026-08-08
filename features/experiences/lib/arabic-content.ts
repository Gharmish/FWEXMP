// Both "Asir…" and "Aseer…" keys are deliberate: rows seeded before the
// 2026-07-08 "Aseer" spelling migration still carry the old English
// strings, and a missing key silently falls back to English.
const ARABIC_TEXT: Readonly<Record<string, string>> = {
  'Abdulaziz Alasmari': 'عبدالعزيز الأسمري',
  // Retired 2026-08-08: the host formerly seeded as "Faisal Al Qahtani"
  // is the row above. Kept per this file's convention — a dev database
  // seeded before the rename still carries the old English string, and a
  // missing key silently falls back to Latin text on the Arabic page.
  'Faisal Al Qahtani': 'فيصل القحطاني',
  'Asir Adventures Co.': 'شركة مغامرات عسير',
  'Jabal Sawda': 'جبل السودة',
  Habala: 'الحبلة',
  'Old Abha': 'أبها القديمة',
  'Wadi Mahala': 'وادي محالة',
  Soudah: 'السودة',
  'Rijal Almaa': 'رجال ألمع',
  Abha: 'أبها',
  Asir: 'عسير',
  Aseer: 'عسير',
  'Before dawn': 'قبل الفجر',
  Sunrise: 'الشروق',
  'Late afternoon': 'آخر العصر',
  Evening: 'المساء',
  Night: 'الليل',
  Midday: 'منتصف النهار',
  Afternoon: 'بعد الظهر',
  Morning: 'الصباح',
  'Late morning': 'أواخر الصباح',
  'Local guide': 'مرشد محلي',
  'Asiri breakfast': 'فطور عسيري',
  'Aseeri breakfast': 'فطور عسيري',
  'Hot qahwa': 'قهوة ساخنة',
  'Warm layer': 'ملابس دافئة',
  'Walking shoes': 'حذاء مناسب للمشي',
  'Traditional dinner': 'عشاء تقليدي',
  'Live Asiri music': 'موسيقى عسيرية حية',
  'Live Aseeri music': 'موسيقى عسيرية حية',
  'Tea and qahwa': 'شاي وقهوة',
  Appetite: 'شهية مفتوحة',
  'A light jacket for the evening': 'سترة خفيفة للمساء',
  'Coffee workshop': 'ورشة قهوة',
  'Saleeg lunch': 'غداء سليق',
  'Recipe card': 'بطاقة وصفة',
  'Guided session': 'جلسة موجهة',
  Mat: 'بساط',
  'Herbal tea': 'شاي أعشاب',
  'Comfortable clothing': 'ملابس مريحة',
  'Certified guide': 'مرشد معتمد',
  'Harness and helmet': 'حزام وخوذة',
  Insurance: 'تأمين',
  'Closed shoes': 'حذاء مغلق',
  Water: 'ماء',
  'All materials': 'كل المواد',
  'Artist instruction': 'إرشاد من الفنانة',
  'Panel to take home': 'لوحة تأخذها معك',
  'Clothes that can get paint on them': 'ملابس لا تمانع اتساخها بالطلاء',
};

export function toArabicText(text: string): string {
  return ARABIC_TEXT[text] ?? text;
}
