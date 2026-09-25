export const REGIONS = ['เหนือ', 'อีสาน', 'กลาง', 'ตะวันออก', 'ตะวันตก', 'ใต้'] as const;
export type Region = (typeof REGIONS)[number];
export const FOREIGN = 'ต่างประเทศ';

// Geographic six-region grouping of the Royal Society, with Bueng Kan in Isan.
const provinceByRegion = {
  เหนือ: [
    'เชียงราย', 'น่าน', 'พะเยา', 'เชียงใหม่', 'แม่ฮ่องสอน', 'แพร่',
    'ลำปาง', 'ลำพูน', 'อุตรดิตถ์',
  ],
  อีสาน: [
    'หนองคาย', 'นครพนม', 'สกลนคร', 'อุดรธานี', 'หนองบัวลำภู', 'เลย',
    'มุกดาหาร', 'กาฬสินธุ์', 'ขอนแก่น', 'อำนาจเจริญ', 'ยโสธร', 'ร้อยเอ็ด',
    'มหาสารคาม', 'ชัยภูมิ', 'นครราชสีมา', 'บุรีรัมย์', 'สุรินทร์',
    'ศรีสะเกษ', 'อุบลราชธานี', 'บึงกาฬ',
  ],
  กลาง: [
    'กรุงเทพมหานคร', 'พิษณุโลก', 'สุโขทัย', 'เพชรบูรณ์', 'พิจิตร',
    'กำแพงเพชร', 'นครสวรรค์', 'ลพบุรี', 'ชัยนาท', 'อุทัยธานี', 'สิงห์บุรี',
    'อ่างทอง', 'สระบุรี', 'พระนครศรีอยุธยา', 'สุพรรณบุรี', 'นครนายก',
    'ปทุมธานี', 'นนทบุรี', 'นครปฐม', 'สมุทรปราการ', 'สมุทรสาคร', 'สมุทรสงคราม',
  ],
  ตะวันออก: [
    'สระแก้ว', 'ปราจีนบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด',
  ],
  ตะวันตก: [
    'ตาก', 'กาญจนบุรี', 'ราชบุรี', 'เพชรบุรี', 'ประจวบคีรีขันธ์',
  ],
  ใต้: [
    'ชุมพร', 'ระนอง', 'สุราษฎร์ธานี', 'นครศรีธรรมราช', 'กระบี่', 'พังงา',
    'ภูเก็ต', 'พัทลุง', 'ตรัง', 'ปัตตานี', 'สงขลา', 'สตูล', 'นราธิวาส', 'ยะลา',
  ],
} as const satisfies Record<Region, readonly string[]>;

export const PROVINCES: readonly { name: string; region: Region }[] = REGIONS.flatMap(
  (region) => provinceByRegion[region].map((name) => ({ name, region })),
);

export const PROVINCE_NAMES = [
  ...provinceByRegion.เหนือ,
  ...provinceByRegion.อีสาน,
  ...provinceByRegion.กลาง,
  ...provinceByRegion.ตะวันออก,
  ...provinceByRegion.ตะวันตก,
  ...provinceByRegion.ใต้,
  FOREIGN,
] as const;

const provinceNameSet = new Set<string>(PROVINCE_NAMES);

export function isProvince(v: string): boolean {
  return provinceNameSet.has(v);
}
