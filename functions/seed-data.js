/**
 * D1 表结构 + 演示数据（自动建表 + 首次访问自动灌库）
 * 目的：让 Cloudflare Pages 部署后无需手动跑 seed，
 *       只要先 `wrangler d1 create` 建好数据库并绑定 DB，
 *       首个请求就会自动 CREATE TABLE IF NOT EXISTS 并灌入演示数据。
 * 若已手动用 schema.sql/seed.sql 灌过，这里会检测到非空而跳过。
 */
import * as db from './db.js';
import crypto from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  desc_zh TEXT DEFAULT '',
  desc_en TEXT DEFAULT '',
  icon TEXT DEFAULT 'leaf',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  category_id INTEGER,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  pinyin TEXT DEFAULT '',
  latin_name TEXT DEFAULT '',
  origin_zh TEXT DEFAULT '',
  origin_en TEXT DEFAULT '',
  part_zh TEXT DEFAULT '',
  part_en TEXT DEFAULT '',
  grade_zh TEXT DEFAULT '',
  grade_en TEXT DEFAULT '',
  spec_zh TEXT DEFAULT '',
  spec_en TEXT DEFAULT '',
  moisture TEXT DEFAULT '',
  ash TEXT DEFAULT '',
  package_zh TEXT DEFAULT '',
  package_en TEXT DEFAULT '',
  moq TEXT DEFAULT '',
  price_min REAL DEFAULT 0,
  price_max REAL DEFAULT 0,
  unit TEXT DEFAULT 'kg',
  shelf_life TEXT DEFAULT '',
  storage_zh TEXT DEFAULT '',
  storage_en TEXT DEFAULT '',
  desc_zh TEXT DEFAULT '',
  desc_en TEXT DEFAULT '',
  usage_zh TEXT DEFAULT '',
  usage_en TEXT DEFAULT '',
  certs TEXT DEFAULT '',
  image TEXT DEFAULT '',
  featured INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  product_name TEXT DEFAULT '',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  company TEXT DEFAULT '',
  country TEXT DEFAULT '',
  quantity TEXT DEFAULT '',
  message TEXT DEFAULT '',
  status TEXT DEFAULT 'new',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS company (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name_zh TEXT DEFAULT '', name_en TEXT DEFAULT '',
  intro_zh TEXT DEFAULT '', intro_en TEXT DEFAULT '',
  address_zh TEXT DEFAULT '', address_en TEXT DEFAULT '',
  phone TEXT DEFAULT '', whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '', website TEXT DEFAULT '',
  worktime_zh TEXT DEFAULT '', worktime_en TEXT DEFAULT '',
  year_founded TEXT DEFAULT '', employees TEXT DEFAULT '',
  factory_area TEXT DEFAULT '', main_market TEXT DEFAULT '',
  annual_output TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_zh TEXT NOT NULL, name_en TEXT NOT NULL,
  issuer_zh TEXT DEFAULT '', issuer_en TEXT DEFAULT '',
  image TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_zh TEXT DEFAULT '', title_en TEXT DEFAULT '',
  subtitle_zh TEXT DEFAULT '', subtitle_en TEXT DEFAULT '',
  image TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS i18n (
  key TEXT PRIMARY KEY,
  value_zh TEXT DEFAULT '',
  value_en TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
`;

let schemaPromise = null;
export function ensureSchema(env) {
  if (!schemaPromise) schemaPromise = db.exec(env, SCHEMA);
  return schemaPromise;
}

/* ---------------- 演示数据 ---------------- */
const CATEGORIES = [
  ['roots-rhizomes', '根及根茎类', 'Roots & Rhizomes', '以根或根茎入药，是中药材出口量最大的品类，多用于滋补、活血、清热。', 'Roots and rhizomes are the largest exported TCM category, widely used for tonifying, blood activation and heat clearing.', 'root'],
  ['flowers', '花类', 'Flowers', '以花蕾或花序入药，多含挥发油与黄酮，用于清热解表、疏肝理气。', 'Flower buds and inflorescences rich in volatile oils & flavonoids, used to release exterior and regulate qi.', 'flower'],
  ['fruits-seeds', '果实种子类', 'Fruits & Seeds', '以成熟果实或种子入药，常用于消食、润肠、安神。', 'Mature fruits and seeds used for digestion, moistening intestines and calming the mind.', 'fruit'],
  ['barks', '皮类', 'Barks', '以树皮或根皮入药，多在春秋采收，用于燥湿、温阳、止泻。', 'Tree or root bark harvested in spring/autumn, used to dry dampness, warm yang and stop diarrhea.', 'bark'],
  ['whole-herbs', '全草类', 'Whole Herbs', '以全草或地上部分入药，富含挥发油，多用于解表化湿。', 'Whole aerial parts rich in volatile oil, mainly for releasing exterior and resolving dampness.', 'herb'],
  ['leaves', '叶类', 'Leaves', '以叶片入药，多在花期前采收，用于疏散风热、清肺止咳。', 'Leaves collected before flowering, used to disperse wind-heat and clear the lung.', 'leaf'],
  ['fungi-others', '菌类及其他', 'Fungi & Others', '真菌类及其他特殊来源药材，多用于扶正固本、利水渗湿。', 'Fungal and other special-source materials for strengthening resistance and draining dampness.', 'fungi'],
];

const DEF = {
  grade_zh: '一级 / 选货', grade_en: 'Grade A / Selected',
  spec_zh: '整枝 / 切片 / 粉末', spec_en: 'Whole / Sliced / Powder',
  moisture: '≤ 13%', ash: '≤ 7%',
  package_zh: '25kg/袋（编织袋或纸箱，可定制）', package_en: '25kg/bag (woven bag or carton, customizable)',
  moq: '200 kg', unit: 'kg', shelf_life: '24 个月 / 24 months',
  storage_zh: '置阴凉干燥处，密封，防蛀防潮', storage_en: 'Store in a cool dry place, sealed, protect from moisture & insects',
  certs: 'GMP, ISO9001, HACCP, COA, Phytosanitary Certificate',
  status: 'active',
};
const P = (o) => Object.assign({}, DEF, o, {
  latin_name: o.latin_name || o.latin || '',
  slug: o.slug || o.name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
});

const PRODUCTS = [
  P({ cat: 'roots-rhizomes', name_zh: '当归', name_en: 'Angelica Sinensis Root', pinyin: 'Dang Gui', latin: 'Radix Angelicae Sinensis', origin_zh: '甘肃岷县', origin_en: 'Minxian, Gansu', part_zh: '根', part_en: 'Root', price_min: 9.8, price_max: 16.5, featured: 1, sort_order: 1, desc_zh: '伞形科当归的干燥根，主根粗长、支根少，断面黄白色，油润，香气浓郁。岷县当归挥发油与阿魏酸含量高，为公认道地产区。', desc_en: 'Dried root of Angelica sinensis (Oliv.) Diels. Thick taproot with few branches, yellowish-white oily fracture and strong aroma. Minxian origin guarantees high volatile oil and ferulic acid content.', usage_zh: '补血活血、调经止痛、润肠通便。用于血虚萎黄、月经不调、虚寒腹痛、肠燥便秘。', usage_en: 'Tonifies blood, activates circulation, regulates menstruation and relieves pain. Used for blood deficiency, irregular menstruation, abdominal pain and constipation.' }),
  P({ cat: 'roots-rhizomes', name_zh: '黄芪', name_en: 'Astragalus Root', pinyin: 'Huang Qi', latin: 'Radix Astragali', origin_zh: '甘肃陇西 / 山西浑源', origin_en: 'Longxi Gansu / Hunyuan Shanxi', part_zh: '根', part_en: 'Root', price_min: 6.2, price_max: 11.8, featured: 1, sort_order: 2, desc_zh: '豆科蒙古黄芪或膜荚黄芪的干燥根。条粗直、质硬而韧、断面纤维性强且显粉性，味微甜，嚼之有豆腥味。', desc_en: 'Dried root of Astragalus membranaceus (Fisch.) Bge. or A. membranaceus var. mongholicus. Straight thick root, tough texture, fibrous powdery fracture, mildly sweet with beany note.', usage_zh: '补气升阳、固表止汗、利水消肿、生津养血。用于气虚乏力、食少便溏、表虚自汗。', usage_en: 'Tonifies qi and raises yang, consolidates the exterior, promotes diuresis. Used for qi deficiency fatigue, poor appetite and spontaneous sweating.' }),
  P({ cat: 'roots-rhizomes', name_zh: '人参（生晒参）', name_en: 'Ginseng Root (White Ginseng)', pinyin: 'Ren Shen', latin: 'Radix et Rhizoma Ginseng', origin_zh: '吉林抚松', origin_en: 'Fusong, Jilin', part_zh: '根及根茎', part_en: 'Root & Rhizome', price_min: 42, price_max: 95, grade_zh: '4~6 年生 / 特等', grade_en: '4–6 Years / Premium', featured: 1, sort_order: 3, desc_zh: '五加科人参的干燥根及根茎，主根呈纺锤形，表面黄白色，具疏浅断续的粗横纹及明显的纵皱，质较硬，断面粉性。', desc_en: 'Dried root and rhizome of Panax ginseng C.A.Mey. Spindle-shaped main root, yellowish-white surface with transverse wrinkles, hard texture and farinaceous fracture.', usage_zh: '大补元气、复脉固脱、补脾益肺、生津安神。用于体虚欲脱、脾虚食少、肺虚喘咳、津伤口渴。', usage_en: 'Powerfully tonifies primordial qi, benefits spleen and lung, generates fluid and calms the mind. For collapse from severe deficiency, fatigue and dyspnea.' }),
  P({ cat: 'roots-rhizomes', name_zh: '三七', name_en: 'Panax Notoginseng Root', pinyin: 'San Qi', latin: 'Radix et Rhizoma Notoginseng', origin_zh: '云南文山', origin_en: 'Wenshan, Yunnan', part_zh: '根及根茎', part_en: 'Root & Rhizome', price_min: 48, price_max: 125, grade_zh: '20~120 头', grade_en: '20–120 heads/500g', featured: 1, sort_order: 4, desc_zh: '五加科三七的干燥根及根茎。主根呈类圆锥形或圆柱形，表面灰褐色或灰黄色，有断续的纵皱纹及支根痕，体重质坚实，断面灰绿色或黄绿色。', desc_en: 'Dried root and rhizome of Panax notoginseng (Burk.) F.H.Chen. Conical or cylindrical, grey-brown surface, hard and heavy, greyish-green fracture.', usage_zh: '散瘀止血、消肿定痛。用于咯血、吐血、衄血、便血、崩漏、外伤出血、胸腹刺痛、跌扑肿痛。', usage_en: 'Stops bleeding while dispersing blood stasis, reduces swelling and pain. For various bleeding syndromes and traumatic injuries.' }),
  P({ cat: 'roots-rhizomes', name_zh: '甘草', name_en: 'Licorice Root', pinyin: 'Gan Cao', latin: 'Radix et Rhizoma Glycyrrhizae', origin_zh: '内蒙古 / 甘肃', origin_en: 'Inner Mongolia / Gansu', part_zh: '根及根茎', part_en: 'Root & Rhizome', price_min: 4.2, price_max: 8.6, sort_order: 5, desc_zh: '豆科甘草、胀果甘草或光果甘草的干燥根及根茎。外皮松紧不一，表面红棕色或灰棕色，质坚实，断面略显纤维性，黄白色，粉性，味甜而特殊。', desc_en: 'Dried root and rhizome of Glycyrrhiza uralensis / inflata / glabra. Reddish-brown surface, firm texture, fibrous farinaceous fracture, distinctly sweet taste.', usage_zh: '补脾益气、清热解毒、祛痰止咳、缓急止痛、调和诸药。用于脾胃虚弱、倦怠乏力、咳嗽痰多、痈肿疮毒。', usage_en: 'Tonifies spleen qi, clears heat and detoxifies, relieves cough, moderates spasm and harmonizes formulas.' }),
  P({ cat: 'roots-rhizomes', name_zh: '党参', name_en: 'Codonopsis Root', pinyin: 'Dang Shen', latin: 'Radix Codonopsis', origin_zh: '山西长治 / 甘肃', origin_en: 'Changzhi Shanxi / Gansu', part_zh: '根', part_en: 'Root', price_min: 12.5, price_max: 22, sort_order: 6, desc_zh: '桔梗科党参、素花党参或川党参的干燥根。呈长圆柱形，稍弯曲，表面黄棕色至灰棕色，根头部有多数疣状突起的茎痕及芽，习称"狮子盘头"。', desc_en: 'Dried root of Codonopsis pilosula. Long cylindrical, slightly curved, yellowish-brown surface with characteristic "lion head" crown of stem scars.', usage_zh: '健脾益肺、养血生津。用于脾肺气虚、食少倦怠、咳嗽虚喘、气血不足、面色萎黄。', usage_en: 'Tonifies spleen and lung qi, nourishes blood and generates fluid. For qi deficiency, fatigue, poor appetite and chronic cough.' }),
  P({ cat: 'roots-rhizomes', name_zh: '丹参', name_en: 'Danshen / Salvia Root', pinyin: 'Dan Shen', latin: 'Radix et Rhizoma Salviae Miltiorrhizae', origin_zh: '山东 / 四川中江', origin_en: 'Shandong / Zhongjiang Sichuan', part_zh: '根及根茎', part_en: 'Root & Rhizome', price_min: 5.4, price_max: 9.8, sort_order: 7, desc_zh: '唇形科丹参的干燥根及根茎。根茎短粗，顶端有时残留茎基；根数条，长圆柱形，略弯曲，表面棕红色或暗棕红色，粗糙，具纵皱纹。', desc_en: 'Dried root and rhizome of Salvia miltiorrhiza Bge. Short thick rhizome, several long cylindrical roots, dark reddish-brown wrinkled surface.', usage_zh: '活血祛瘀、通经止痛、清心除烦、凉血消痈。用于胸痹心痛、月经不调、经闭痛经、疮疡肿痛。', usage_en: 'Activates blood and dispels stasis, regulates menstruation, relieves pain and calms the heart. For chest pain, amenorrhea and dysmenorrhea.' }),
  P({ cat: 'roots-rhizomes', name_zh: '天麻', name_en: 'Gastrodia Rhizome', pinyin: 'Tian Ma', latin: 'Rhizoma Gastrodiae', origin_zh: '云南昭通 / 贵州', origin_en: 'Zhaotong Yunnan / Guizhou', part_zh: '块茎', part_en: 'Tuber', price_min: 32, price_max: 68, sort_order: 8, desc_zh: '兰科天麻的干燥块茎。呈椭圆形或长条形，略扁，皱缩而稍弯曲，表面黄白色至黄棕色，有纵皱纹及由潜伏芽排列而成的多轮横环纹，习称"芝麻点"。', desc_en: 'Dried tuber of Gastrodia elata Bl. Elliptical or elongated, slightly flattened, yellowish-brown with transverse rings.', usage_zh: '息风止痉、平抑肝阳、祛风通络。用于小儿惊风、癫痫抽搐、破伤风、头痛眩晕、手足不遂、风湿痹痛。', usage_en: 'Extinguishes wind and stops spasm, suppresses liver yang, unblocks collaterals. For convulsions, headache, dizziness and numbness.' }),
  P({ cat: 'roots-rhizomes', name_zh: '麦冬', name_en: 'Ophiopogon Tuber', pinyin: 'Mai Dong', latin: 'Radix Ophiopogonis', origin_zh: '四川绵阳 / 浙江慈溪', origin_en: 'Mianyang Sichuan / Cixi Zhejiang', part_zh: '块根', part_en: 'Root Tuber', price_min: 15, price_max: 29, sort_order: 9, desc_zh: '百合科麦冬的干燥块根。呈纺锤形，两端略尖，表面黄白色或淡黄色，有细纵纹，质柔韧，断面黄白色，半透明，中柱细小。', desc_en: 'Dried root tuber of Ophiopogon japonicus. Spindle-shaped with pointed ends, pale yellow flexible texture, translucent fracture.', usage_zh: '养阴生津、润肺清心。用于肺燥干咳、阴虚痨嗽、喉痹咽痛、津伤口渴、内热消渴、心烦失眠。', usage_en: 'Nourishes yin, generates fluid, moistens lung and clears heart. For dry cough, thirst and insomnia.' }),
  P({ cat: 'roots-rhizomes', name_zh: '黄连', name_en: 'Coptis Rhizome', pinyin: 'Huang Lian', latin: 'Rhizoma Coptidis', origin_zh: '重庆石柱 / 四川', origin_en: 'Shizhu Chongqing / Sichuan', part_zh: '根茎', part_en: 'Rhizome', price_min: 65, price_max: 118, sort_order: 10, desc_zh: '毛茛科黄连、三角叶黄连或云连的干燥根茎，习称"味连""雅连""云连"。多集聚成簇，常弯曲，形如鸡爪，表面灰黄色或黄褐色，粗糙，有不规则结节状隆起。', desc_en: 'Dried rhizome of Coptis chinensis Franch. Clustered and curved like chicken feet, grey-yellow rough surface with nodular swellings. Very bitter.', usage_zh: '清热燥湿、泻火解毒。用于湿热痞满、呕吐吞酸、泻痢、黄疸、高热神昏、心烦不寐、血热吐衄、目赤、牙痛、痈肿疔疮。', usage_en: 'Clears heat, dries dampness, purges fire and detoxifies. For damp-heat diarrhea, jaundice, high fever and skin infections.' }),
  P({ cat: 'roots-rhizomes', name_zh: '白术', name_en: 'Atractylodes Macrocephala Rhizome', pinyin: 'Bai Zhu', latin: 'Rhizoma Atractylodis Macrocephalae', origin_zh: '浙江磐安 / 安徽', origin_en: "Pan'an Zhejiang / Anhui", part_zh: '根茎', part_en: 'Rhizome', price_min: 10.5, price_max: 18.5, sort_order: 11, desc_zh: '菊科白术的干燥根茎。为不规则的肥厚团块，表面灰黄色或灰棕色，有瘤状突起及断续的纵皱和沟纹，质坚硬不易折断，断面不平坦，黄白色至淡棕色。', desc_en: 'Dried rhizome of Atractylodes macrocephala Koidz. Irregular thickened mass, greyish-yellow surface with nodular protrusions, hard texture.', usage_zh: '健脾益气、燥湿利水、止汗、安胎。用于脾虚食少、腹胀泄泻、痰饮眩悸、水肿、自汗、胎动不安。', usage_en: 'Tonifies spleen qi, dries dampness and promotes diuresis, stops sweating and calms the fetus.' }),
  P({ cat: 'roots-rhizomes', name_zh: '川芎', name_en: 'Szechuan Lovage Rhizome', pinyin: 'Chuan Xiong', latin: 'Rhizoma Chuanxiong', origin_zh: '四川都江堰', origin_en: 'Dujiangyan, Sichuan', part_zh: '根茎', part_en: 'Rhizome', price_min: 7.2, price_max: 13.5, sort_order: 12, desc_zh: '伞形科川芎的干燥根茎。为不规则结节状拳形团块，表面黄褐色，粗糙皱缩，有多数平行隆起的轮节，质坚实，断面黄白色或灰黄色，散有黄棕色油室。', desc_en: 'Dried rhizome of Ligusticum chuanxiong Hort. Irregular nodular fist-like mass, yellowish-brown rough surface with parallel rings.', usage_zh: '活血行气、祛风止痛。用于胸胁刺痛、胸痹心痛、月经不调、经闭痛经、头痛、风湿痹痛。', usage_en: 'Activates blood and moves qi, dispels wind and relieves pain. For chest pain, menstrual disorders and headache.' }),
  P({ cat: 'roots-rhizomes', name_zh: '白芍', name_en: 'White Peony Root', pinyin: 'Bai Shao', latin: 'Radix Paeoniae Alba', origin_zh: '安徽亳州 / 浙江', origin_en: 'Bozhou Anhui / Zhejiang', part_zh: '根', part_en: 'Root', price_min: 6.0, price_max: 10.8, sort_order: 13, desc_zh: '毛茛科芍药的干燥根，经水煮去皮或去皮后再煮、晒干而成。呈圆柱形，平直或稍弯曲，表面类白色或淡棕红色，光洁或有纵皱纹，质坚实，断面较平坦，类白色或微带棕红色。', desc_en: 'Dried boiled & peeled root of Paeonia lactiflora Pall. Cylindrical, whitish or pale reddish-brown, hard and heavy with starchy fracture.', usage_zh: '养血调经、敛阴止汗、柔肝止痛、平抑肝阳。用于血虚萎黄、月经不调、自汗盗汗、胁痛、腹痛、四肢挛痛、头痛眩晕。', usage_en: 'Nourishes blood and regulates menstruation, astringes yin, softens liver and relieves pain.' }),
  P({ cat: 'roots-rhizomes', name_zh: '山药', name_en: 'Chinese Yam', pinyin: 'Shan Yao', latin: 'Rhizoma Dioscoreae', origin_zh: '河南焦作（怀山药）', origin_en: 'Jiaozuo, Henan', part_zh: '根茎', part_en: 'Rhizome', price_min: 4.5, price_max: 8.8, spec_zh: '毛山药 / 光山药 / 山药片', spec_en: 'Raw / Peeled / Slices', sort_order: 14, desc_zh: '薯蓣科薯蓣的干燥根茎，怀山药为四大怀药之一，粉性足、口感绵密，药食两用。', desc_en: 'Dried rhizome of Dioscorea opposita Thunb. "Huai山药" is one of the Four Famous Huai Medicines — starchy and mild, both food and medicine.', usage_zh: '补脾养胃、生津益肺、补肾涩精。用于脾虚食少、久泻不止、肺虚喘咳、肾虚遗精、带下、尿频、虚热消渴。', usage_en: 'Tonifies spleen and stomach, benefits lung and kidney. For chronic diarrhea, cough and frequent urination.' }),
  P({ cat: 'roots-rhizomes', name_zh: '桔梗', name_en: 'Platycodon Root', pinyin: 'Jie Geng', latin: 'Radix Platycodonis', origin_zh: '安徽太和 / 山东', origin_en: 'Taihe Anhui / Shandong', part_zh: '根', part_en: 'Root', price_min: 11, price_max: 19, sort_order: 15, desc_zh: '桔梗科桔梗的干燥根。呈圆柱形或略呈纺锤形，下部渐细，表面白色或淡黄白色，不去外皮者表面黄棕色至灰棕色，质脆，断面不平坦，形成层环棕色。', desc_en: 'Dried root of Platycodon grandiflorum (Jacq.) A.DC. Cylindrical or slightly spindle-shaped, whitish surface, brittle texture.', usage_zh: '宣肺、利咽、祛痰、排脓。用于咳嗽痰多、胸闷不畅、咽痛音哑、肺痈吐脓。', usage_en: 'Opens up the lung, benefits the throat, expels phlegm and discharges pus. For cough with copious sputum and sore throat.' }),
  P({ cat: 'roots-rhizomes', name_zh: '半夏（法半夏）', name_en: 'Pinellia Rhizome (Processed)', pinyin: 'Ban Xia', latin: 'Rhizoma Pinelliae Preparatum', origin_zh: '四川 / 湖北', origin_en: 'Sichuan / Hubei', part_zh: '块茎', part_en: 'Tuber', price_min: 26, price_max: 46, spec_zh: '法半夏 / 姜半夏 / 清半夏', spec_en: 'Fa Banxia / Jiang Banxia / Qing Banxia', sort_order: 16, desc_zh: '天南星科半夏的干燥块茎，经甘草石灰水或生姜白矾炮制以降低刺激性。呈类球形，表面白色或浅黄色，顶端有凹陷的茎痕，质坚实，断面洁白，富粉性。', desc_en: 'Dried tuber of Pinellia ternata (Thunb.) Breit., processed with lime/ginger/alum to reduce irritancy. Spherical, white and starchy.', usage_zh: '燥湿化痰、降逆止呕、消痞散结。用于湿痰寒痰、咳喘痰多、痰饮眩悸、风痰眩晕、呕吐反胃、胸脘痞闷。', usage_en: 'Dries dampness and resolves phlegm, directs rebellious qi downward to stop vomiting, dissipates nodules.' }),
  P({ cat: 'roots-rhizomes', name_zh: '玄参', name_en: 'Scrophularia Root', pinyin: 'Xuan Shen', latin: 'Radix Scrophulariae', origin_zh: '浙江磐安', origin_en: "Pan'an, Zhejiang", part_zh: '根', part_en: 'Root', price_min: 5.2, price_max: 9.5, sort_order: 17, desc_zh: '玄参科玄参的干燥根。呈类圆柱形，中间略粗或上粗下细，表面灰黄色或灰褐色，有不规则的纵沟、横向皮孔样突起和稀疏的横裂纹；断面黑色，微有光泽。', desc_en: 'Dried root of Scrophularia ningpoensis Hemsl. Cylindrical, greyish-brown surface, black shiny fracture.', usage_zh: '清热凉血、滋阴降火、解毒散结。用于热入营血、温毒发斑、热病伤阴、津伤便秘、骨蒸劳嗽、目赤、咽痛、瘰疬、痈肿疮毒。', usage_en: 'Clears heat and cools blood, nourishes yin and descends fire, detoxifies and dissipates nodules.' }),
  P({ cat: 'roots-rhizomes', name_zh: '何首乌（制）', name_en: 'Fo-Ti Root (Processed)', pinyin: 'Zhi He Shou Wu', latin: 'Radix Polygoni Multiflori Preparata', origin_zh: '河南 / 广东', origin_en: 'Henan / Guangdong', part_zh: '块根', part_en: 'Root Tuber', price_min: 5.8, price_max: 9.9, sort_order: 18, desc_zh: '蓼科何首乌的干燥块根，经黑豆汁拌蒸炮制而成。呈不规则皱缩状的块片，表面黑褐色或棕褐色，凹凸不平，质坚硬，断面角质样，棕褐色或黑色。', desc_en: 'Dried root tuber of Polygonum multiflorum Thunb., steamed with black bean juice. Irregular dark brown pieces with horny fracture.', usage_zh: '补肝肾、益精血、乌须发、强筋骨、化浊降脂。用于血虚萎黄、眩晕耳鸣、须发早白、腰膝酸软、高脂血症。', usage_en: 'Tonifies liver and kidney, nourishes essence and blood, darkens hair and strengthens tendons. Also used for hyperlipidemia.' }),
  P({ cat: 'flowers', name_zh: '金银花', name_en: 'Honeysuckle Flower', pinyin: 'Jin Yin Hua', latin: 'Flos Lonicerae Japonicae', origin_zh: '河南封丘 / 山东平邑', origin_en: 'Fengqiu Henan / Pingyi Shandong', part_zh: '花蕾', part_en: 'Flower Bud', price_min: 21, price_max: 38, featured: 1, sort_order: 1, desc_zh: '忍冬科忍冬的干燥花蕾或带初开的花。呈棒状，上粗下细，略弯曲，表面黄白色或绿白色，贮久色渐深，密被短柔毛，气清香，味淡微苦。', desc_en: 'Dried flower bud of Lonicera japonica Thunb. Rod-shaped, yellowish-white to greenish-white, densely pubescent, fragrant and slightly bitter.', usage_zh: '清热解毒、疏散风热。用于痈肿疔疮、喉痹、丹毒、热毒血痢、风热感冒、温病发热。', usage_en: 'Clears heat and detoxifies, disperses wind-heat. For sore throat, boils, dysentery and wind-heat common cold.' }),
  P({ cat: 'flowers', name_zh: '菊花（杭白菊）', name_en: 'Chrysanthemum Flower', pinyin: 'Ju Hua', latin: 'Flos Chrysanthemi', origin_zh: '浙江桐乡 / 安徽黄山', origin_en: 'Tongxiang Zhejiang / Huangshan Anhui', part_zh: '头状花序', part_en: 'Capitulum', price_min: 12, price_max: 26, sort_order: 2, desc_zh: '菊科菊的干燥头状花序，按产地和加工方法分为亳菊、滁菊、贡菊、杭菊。杭白菊花瓣洁白、花心金黄，气清香，味甘微苦，是出口量最大的花茶类药材。', desc_en: 'Dried capitulum of Chrysanthemum morifolium Ramat. White petals with golden center, fragrant and slightly bitter. Most exported herbal tea flower.', usage_zh: '散风清热、平肝明目、清热解毒。用于风热感冒、头痛眩晕、目赤肿痛、眼目昏花、疮痈肿毒。', usage_en: 'Disperses wind and clears heat, calms the liver and improves vision. For headache, red eyes and blurred vision.' }),
  P({ cat: 'flowers', name_zh: '红花', name_en: 'Safflower', pinyin: 'Hong Hua', latin: 'Flos Carthami', origin_zh: '新疆 / 云南', origin_en: 'Xinjiang / Yunnan', part_zh: '花', part_en: 'Flower', price_min: 32, price_max: 58, sort_order: 3, desc_zh: '菊科红花的干燥花。为不带子房的管状花，长 1~2cm，表面红黄色或红色，花冠筒细长，先端 5 裂，质柔软，气微香，味微苦。', desc_en: 'Dried tubular flower of Carthamus tinctorius L. Red or red-yellow, slender corolla tube with 5 lobes, soft texture.', usage_zh: '活血通经、散瘀止痛。用于经闭、痛经、恶露不行、癥瘕痞块、胸痹心痛、瘀滞腹痛、跌打损伤、疮疡肿痛。', usage_en: 'Activates blood and regulates menstruation, dispels stasis and relieves pain. For amenorrhea, dysmenorrhea and traumatic injuries.' }),
  P({ cat: 'flowers', name_zh: '辛夷', name_en: 'Magnolia Flower Bud', pinyin: 'Xin Yi', latin: 'Flos Magnoliae', origin_zh: '河南南召 / 四川', origin_en: 'Nanzhao Henan / Sichuan', part_zh: '花蕾', part_en: 'Flower Bud', price_min: 13, price_max: 22, sort_order: 4, desc_zh: '木兰科望春花、玉兰或武当玉兰的干燥花蕾。呈长卵形，似毛笔头，基部常具短梗，苞片外表面密被灰白色或灰绿色茸毛，气芳香，味辛凉而稍苦。', desc_en: 'Dried flower bud of Magnolia biondii / denudata / sprengeri. Brush-pen shaped, densely greyish-white tomentose, aromatic and pungent.', usage_zh: '散风寒、通鼻窍。用于风寒头痛、鼻塞流涕、鼻鼽、鼻渊。', usage_en: 'Disperses wind-cold and unblocks the nasal passages. For nasal congestion, sinusitis and cold-induced headache.' }),
  P({ cat: 'fruits-seeds', name_zh: '枸杞子', name_en: 'Goji Berry / Wolfberry', pinyin: 'Gou Qi Zi', latin: 'Fructus Lycii', origin_zh: '宁夏中宁', origin_en: 'Zhongning, Ningxia', part_zh: '果实', part_en: 'Fruit', price_min: 8.5, price_max: 16.0, grade_zh: '180/220/280/380 粒/50g', grade_en: '180/220/280/380 pcs per 50g', featured: 1, sort_order: 1, desc_zh: '茄科宁夏枸杞的干燥成熟果实。呈类纺锤形或椭圆形，表面红色或暗红色，顶端有小凸起状的花柱痕，果皮柔韧皱缩，果肉肉质柔润，种子 20~50 粒，味甜微酸。', desc_en: 'Dried ripe fruit of Lycium barbarum L. Spindle-shaped red berries with wrinkled tender pericarp and sweet juicy pulp. Zhongning Ningxia is the authentic origin.', usage_zh: '滋补肝肾、益精明目。用于虚劳精亏、腰膝酸痛、眩晕耳鸣、阳痿遗精、内热消渴、血虚萎黄、目昏不明。', usage_en: 'Nourishes liver and kidney, benefits essence and improves vision. Widely used as a superfruit in food & beverage.' }),
  P({ cat: 'fruits-seeds', name_zh: '五味子', name_en: 'Schisandra Berry', pinyin: 'Wu Wei Zi', latin: 'Fructus Schisandrae Chinensis', origin_zh: '辽宁 / 吉林', origin_en: 'Liaoning / Jilin', part_zh: '果实', part_en: 'Fruit', price_min: 16, price_max: 30, sort_order: 2, desc_zh: '木兰科五味子的干燥成熟果实，习称"北五味子"。呈不规则的球形或扁球形，表面红色、紫红色或暗红色，皱缩，显油润，果肉柔软，味酸；种子肾形，有光泽。', desc_en: 'Dried ripe fruit of Schisandra chinensis (Turcz.) Baill. Irregular red to dark-red wrinkled berries, sour taste, shiny kidney-shaped seeds.', usage_zh: '收敛固涩、益气生津、补肾宁心。用于久嗽虚喘、梦遗滑精、遗尿尿频、久泻不止、自汗盗汗、津伤口渴、内热消渴、心悸失眠。', usage_en: 'Astringes and consolidates, tonifies qi and generates fluid, calms the heart. For chronic cough, night sweats and insomnia.' }),
  P({ cat: 'fruits-seeds', name_zh: '山楂', name_en: 'Hawthorn Fruit', pinyin: 'Shan Zha', latin: 'Fructus Crataegi', origin_zh: '山东 / 河北承德', origin_en: 'Shandong / Chengde Hebei', part_zh: '果实', part_en: 'Fruit', price_min: 4.0, price_max: 7.8, spec_zh: '山楂片 / 去核 / 整果', spec_en: 'Slices / Pitted / Whole', sort_order: 3, desc_zh: '蔷薇科山里红或山楂的干燥成熟果实。为圆形片，皱缩不平，外皮红色，具皱纹，有灰白色小斑点，果肉深黄色至浅棕色，气微清香，味酸微甜。', desc_en: 'Dried ripe fruit of Crataegus pinnatifida Bge. Red wrinkled slices with pale spots, sour and slightly sweet taste.', usage_zh: '消食健胃、行气散瘀、化浊降脂。用于肉食积滞、胃脘胀满、泻痢腹痛、瘀血经闭、产后瘀阻、心腹刺痛、高脂血症。', usage_en: 'Promotes digestion, moves qi and dispels blood stasis, lowers lipids. For food retention and hyperlipidemia.' }),
  P({ cat: 'fruits-seeds', name_zh: '决明子', name_en: 'Cassia Seed', pinyin: 'Jue Ming Zi', latin: 'Semen Cassiae', origin_zh: '安徽 / 广西', origin_en: 'Anhui / Guangxi', part_zh: '种子', part_en: 'Seed', price_min: 3.2, price_max: 6.0, sort_order: 4, desc_zh: '豆科决明或小决明的干燥成熟种子。略呈菱方形或短圆柱形，两端平行倾斜，表面绿棕色或暗棕色，平滑有光泽，质坚硬，不易破碎，气微，味微苦。', desc_en: 'Dried ripe seed of Cassia obtusifolia L. or C. tora L. Rhomboid to short cylindrical, glossy greenish-brown, very hard.', usage_zh: '清热明目、润肠通便。用于目赤涩痛、羞明多泪、头痛眩晕、目暗不明、大便秘结。', usage_en: 'Clears heat and brightens the eyes, moistens intestines to relieve constipation. Popular in slimming teas.' }),
  P({ cat: 'fruits-seeds', name_zh: '薏苡仁', name_en: 'Coix Seed (Job\'s Tears)', pinyin: 'Yi Yi Ren', latin: 'Semen Coicis', origin_zh: '贵州兴仁 / 福建', origin_en: 'Xingren Guizhou / Fujian', part_zh: '种仁', part_en: 'Kernel', price_min: 3.0, price_max: 5.8, sort_order: 5, desc_zh: '禾本科薏苡的干燥成熟种仁。呈宽卵形或长椭圆形，表面乳白色，光滑，偶有残存的黄褐色种皮，一端钝圆，另端较宽而微凹，质坚实，断面白色，粉性。', desc_en: 'Dried ripe kernel of Coix lacryma-jobi var. ma-yuen. Milky-white smooth oval kernels, firm and starchy. Both food and medicine.', usage_zh: '利水渗湿、健脾止泻、除痹、排脓、解毒散结。用于水肿、脚气、小便不利、脾虚泄泻、湿痹拘挛、肺痈、肠痈。', usage_en: 'Promotes diuresis and drains dampness, strengthens spleen to stop diarrhea, discharges pus and dissipates nodules.' }),
  P({ cat: 'fruits-seeds', name_zh: '大枣（红枣）', name_en: 'Red Jujube / Chinese Date', pinyin: 'Da Zao', latin: 'Fructus Jujubae', origin_zh: '新疆若羌 / 河北沧州', origin_en: 'Ruoqiang Xinjiang / Cangzhou Hebei', part_zh: '果实', part_en: 'Fruit', price_min: 3.5, price_max: 7.5, spec_zh: '特级 / 一级 / 去核 / 枣片', spec_en: 'Super / Grade A / Pitted / Slices', sort_order: 6, desc_zh: '鼠李科枣的干燥成熟果实。呈椭圆形或球形，表面暗红色，略带光泽，有不规则皱纹，基部凹陷，有短果梗，外果皮薄，中果皮棕黄色或淡褐色，肉质柔软，富糖性而油润。', desc_en: 'Dried ripe fruit of Ziziphus jujuba Mill. Dark red wrinkled berries with soft sugary pulp. Ruoqiang Xinjiang grade is the premium export origin.', usage_zh: '补中益气、养血安神。用于脾虚食少、乏力便溏、妇人脏躁、失眠。', usage_en: 'Tonifies the middle and benefits qi, nourishes blood and calms the mind. For fatigue, loose stools and insomnia.' }),
  P({ cat: 'fruits-seeds', name_zh: '龙眼肉（桂圆肉）', name_en: 'Longan Aril', pinyin: 'Long Yan Rou', latin: 'Arillus Longan', origin_zh: '广西 / 福建莆田', origin_en: 'Guangxi / Putian Fujian', part_zh: '假种皮', part_en: 'Aril', price_min: 10.5, price_max: 19, sort_order: 7, desc_zh: '无患子科龙眼的假种皮，去核去壳后干燥而成。呈纵向破裂的不规则薄片，常数片粘结，棕褐色，半透明，质柔润，气微香，味甜。', desc_en: 'Dried aril of Dimocarpus longan Lour. Irregular brown translucent sticky slices, very sweet and aromatic.', usage_zh: '补益心脾、养血安神。用于气血不足、心悸怔忡、健忘失眠、血虚萎黄。', usage_en: 'Tonifies heart and spleen, nourishes blood and calms the mind. For palpitations, forgetfulness and insomnia.' }),
  P({ cat: 'fruits-seeds', name_zh: '罗汉果', name_en: 'Monk Fruit / Luo Han Guo', pinyin: 'Luo Han Guo', latin: 'Fructus Siraitiae', origin_zh: '广西桂林永福', origin_en: 'Yongfu, Guilin, Guangxi', part_zh: '果实', part_en: 'Fruit', price_min: 26, price_max: 48, spec_zh: '大果 / 中果 / 小果', spec_en: 'Large / Medium / Small', sort_order: 8, desc_zh: '葫芦科罗汉果的干燥果实。呈卵形、椭圆形或球形，表面褐色、黄褐色或绿褐色，有深色斑块及黄色柔毛，体轻，质脆，果皮薄，易破，味极甜。罗汉果甜苷是天然零热量甜味剂。', desc_en: 'Dried fruit of Siraitia grosvenorii. Oval brownish fruits with yellow pubescence, extremely sweet. Mogroside is a natural zero-calorie sweetener.', usage_zh: '清热润肺、利咽开音、滑肠通便。用于肺热燥咳、咽痛失音、肠燥便秘。', usage_en: 'Clears heat and moistens the lung, benefits the throat and relieves constipation. Widely used in natural sweetener industry.' }),
  P({ cat: 'fruits-seeds', name_zh: '陈皮', name_en: 'Dried Tangerine Peel', pinyin: 'Chen Pi', latin: 'Pericarpium Citri Reticulatae', origin_zh: '广东新会', origin_en: 'Xinhui, Guangdong', part_zh: '果皮', part_en: 'Peel', price_min: 7.0, price_max: 14.5, grade_zh: '三年陈 / 五年陈 / 十年陈', grade_en: 'Aged 3 / 5 / 10 Years', sort_order: 9, desc_zh: '芸香科橘及其栽培变种的干燥成熟果皮，采摘成熟果实，剥取果皮，晒干或低温干燥，陈久者良。新会陈皮为广陈皮上品，油室饱满，香气醇厚。', desc_en: 'Dried ripe pericarp of Citrus reticulata Blanco, aged for better quality. Xinhui Guangdong is the premium origin with rich oil glands and mellow aroma.', usage_zh: '理气健脾、燥湿化痰。用于脘腹胀满、食少吐泻、咳嗽痰多。', usage_en: 'Regulates qi and strengthens the spleen, dries dampness and resolves phlegm. For abdominal distension and productive cough.' }),
  P({ cat: 'fruits-seeds', name_zh: '砂仁', name_en: 'Amomum Fruit', pinyin: 'Sha Ren', latin: 'Fructus Amomi', origin_zh: '广东阳春 / 云南', origin_en: 'Yangchun Guangdong / Yunnan', part_zh: '果实', part_en: 'Fruit', price_min: 46, price_max: 82, sort_order: 10, desc_zh: '姜科阳春砂、绿壳砂或海南砂的干燥成熟果实。呈椭圆形或卵圆形，有不明显的三棱，表面棕褐色，密生刺状突起，果皮薄而软，种子集结成团，气芳香而浓烈，味辛凉微苦。', desc_en: 'Dried ripe fruit of Amomum villosum Lour. Oval with three vague ridges, densely spiny brown surface, strongly aromatic.', usage_zh: '化湿开胃、温脾止泻、理气安胎。用于湿浊中阻、脘痞不饥、脾胃虚寒、呕吐泄泻、妊娠恶阻、胎动不安。', usage_en: 'Transforms dampness and improves appetite, warms the spleen to stop diarrhea, calms the fetus.' }),
  P({ cat: 'fruits-seeds', name_zh: '八角茴香', name_en: 'Star Anise', pinyin: 'Ba Jiao Hui Xiang', latin: 'Fructus Anisi Stellati', origin_zh: '广西梧州 / 云南', origin_en: 'Wuzhou Guangxi / Yunnan', part_zh: '果实', part_en: 'Fruit', price_min: 8.5, price_max: 15.5, sort_order: 11, desc_zh: '木兰科八角茴香的干燥成熟聚合果。为聚合果，多由 8 个蓇葖果组成，放射状排列于中轴上，外表面红棕色，有不规则皱纹，内表面淡棕色，平滑有光泽，气芳香，味辛甜。', desc_en: 'Dried ripe fruit of Illicium verum Hook.f. Star-shaped aggregate of usually 8 follicles, reddish-brown, strongly aromatic and sweet-pungent.', usage_zh: '温阳散寒、理气止痛。用于寒疝腹痛、肾虚腰痛、胃寒呕吐、脘腹冷痛。也是莽草酸（抗流感药物原料）的重要来源。', usage_en: 'Warms yang and dispels cold, regulates qi and relieves pain. Also a key industrial source of shikimic acid.' }),
  P({ cat: 'barks', name_zh: '肉桂', name_en: 'Cinnamon Bark', pinyin: 'Rou Gui', latin: 'Cortex Cinnamomi', origin_zh: '广西 / 广东', origin_en: 'Guangxi / Guangdong', part_zh: '树皮', part_en: 'Bark', price_min: 5.5, price_max: 10.5, spec_zh: '桂皮 / 桂通 / 板桂', spec_en: 'Quill / Tube / Slab', sort_order: 1, desc_zh: '樟科肉桂的干燥树皮。呈槽状或卷筒状，外表面灰棕色，稍粗糙，有不规则的细皱纹及横向突起的皮孔，内表面红棕色，略平坦，有细纵纹，划之显油痕，气香浓烈，味甜辣。', desc_en: 'Dried bark of Cinnamomum cassia Presl. Channeled or quilled, grey-brown outside and reddish-brown inside, strongly aromatic, sweet and pungent.', usage_zh: '补火助阳、引火归元、散寒止痛、温通经脉。用于阳痿宫冷、腰膝冷痛、肾虚作喘、虚阳上浮、眩晕目赤、心腹冷痛、虚寒吐泻、寒疝腹痛、痛经经闭。', usage_en: 'Warms and supplements fire-yang, dispels cold and relieves pain, unblocks the meridians.' }),
  P({ cat: 'barks', name_zh: '杜仲', name_en: 'Eucommia Bark', pinyin: 'Du Zhong', latin: 'Cortex Eucommiae', origin_zh: '贵州遵义 / 四川', origin_en: 'Zunyi Guizhou / Sichuan', part_zh: '树皮', part_en: 'Bark', price_min: 7.0, price_max: 13.0, sort_order: 2, desc_zh: '杜仲科杜仲的干燥树皮。呈板片状或两边稍向内卷，外表面淡棕色或灰褐色，有明显的皱纹或纵裂槽纹，内表面暗紫色，光滑，质脆易折断，断面有细密银白色富弹性的橡胶丝相连。', desc_en: 'Dried bark of Eucommia ulmoides Oliv. Flat slabs, grey-brown outside, dark purple inside; breaking reveals silvery elastic rubber threads.', usage_zh: '补肝肾、强筋骨、安胎。用于肝肾不足、腰膝酸痛、筋骨无力、头晕目眩、妊娠漏血、胎动不安。', usage_en: 'Tonifies liver and kidney, strengthens tendons and bones, calms the fetus. For lower back pain and weakness.' }),
  P({ cat: 'barks', name_zh: '厚朴', name_en: 'Magnolia Bark', pinyin: 'Hou Po', latin: 'Cortex Magnoliae Officinalis', origin_zh: '四川 / 湖北恩施', origin_en: 'Sichuan / Enshi Hubei', part_zh: '干皮 / 根皮 / 枝皮', part_en: 'Trunk / Root / Branch Bark', price_min: 9.0, price_max: 16.5, sort_order: 3, desc_zh: '木兰科厚朴或凹叶厚朴的干燥干皮、根皮及枝皮。干皮呈卷筒状或双卷筒状，外表面灰棕色或灰褐色，粗糙，有时呈鳞片状，较易剥落，内表面紫棕色或深紫褐色，较平滑，具细密纵纹，划之显油痕。', desc_en: 'Dried bark of Magnolia officinalis Rehd. et Wils. Quilled, grey-brown rough outside, purple-brown smooth inside. Contains honokiol & magnolol.', usage_zh: '燥湿消痰、下气除满。用于湿滞伤中、脘痞吐泻、食积气滞、腹胀便秘、痰饮喘咳。', usage_en: 'Dries dampness and dissolves phlegm, descends qi and relieves fullness. Contains magnolol & honokiol, widely researched.' }),
  P({ cat: 'barks', name_zh: '黄柏', name_en: 'Phellodendron Bark', pinyin: 'Huang Bai', latin: 'Cortex Phellodendri Chinensis', origin_zh: '四川 / 吉林', origin_en: 'Sichuan / Jilin', part_zh: '树皮', part_en: 'Bark', price_min: 11, price_max: 19, sort_order: 4, desc_zh: '芸香科黄檗（关黄柏）或黄皮树（川黄柏）的干燥树皮。呈板片状或浅槽状，外表面黄褐色或黄棕色，平坦或具纵沟纹，内表面暗黄色或淡棕色，具细密的纵棱纹，体轻，质硬，断面纤维性，呈裂片状分层，深黄色，味极苦。', desc_en: 'Dried bark of Phellodendron chinense Schneid. or P. amurense Rupr. Yellow bitter bark, fibrous layered fracture. Rich in berberine.', usage_zh: '清热燥湿、泻火除蒸、解毒疗疮。用于湿热泻痢、黄疸尿赤、带下阴痒、热淋涩痛、脚气痿躄、骨蒸劳热、盗汗、遗精、疮疡肿毒、湿疹湿疮。', usage_en: 'Clears heat and dries dampness, purges fire and relieves steaming bone fever, detoxifies sores. Source of berberine.' }),
  P({ cat: 'whole-herbs', name_zh: '薄荷', name_en: 'Peppermint / Field Mint', pinyin: 'Bo He', latin: 'Herba Menthae', origin_zh: '江苏南通 / 安徽', origin_en: 'Nantong Jiangsu / Anhui', part_zh: '地上部分', part_en: 'Aerial Part', price_min: 5.2, price_max: 9.5, sort_order: 1, desc_zh: '唇形科薄荷的干燥地上部分。茎呈方柱形，有对生分枝，表面紫棕色或淡绿色，棱角处具茸毛，质脆，断面白色，髓部中空；叶对生，多卷缩破碎，揉搓后有特殊清凉香气，味辛凉。', desc_en: 'Dried aerial part of Mentha haplocalyx Briq. Square stems, opposite leaves, strong cooling menthol aroma when crushed.', usage_zh: '疏散风热、清利头目、利咽、透疹、疏肝行气。用于风热感冒、风温初起、头痛、目赤、喉痹、口疮、风疹、麻疹、胸胁胀闷。', usage_en: 'Disperses wind-heat, clears head and eyes, benefits throat and releases rashes. Also soothes liver qi.' }),
  P({ cat: 'whole-herbs', name_zh: '鱼腥草', name_en: 'Houttuynia Herb', pinyin: 'Yu Xing Cao', latin: 'Herba Houttuyniae', origin_zh: '四川 / 贵州', origin_en: 'Sichuan / Guizhou', part_zh: '地上部分', part_en: 'Aerial Part', price_min: 4.2, price_max: 8.0, sort_order: 2, desc_zh: '三白草科蕺菜的新鲜全草或干燥地上部分。茎呈扁圆柱形，扭曲，表面棕黄色，具纵棱数条，质脆易折断；叶互生，叶片卷折皱缩，展平后呈心形，搓碎有鱼腥气，味微涩。', desc_en: 'Dried aerial part of Houttuynia cordata Thunb. Flattened twisted stems, heart-shaped leaves, characteristic fishy odor.', usage_zh: '清热解毒、消痈排脓、利尿通淋。用于肺痈吐脓、痰热喘咳、热痢、热淋、痈肿疮毒。', usage_en: 'Clears heat and detoxifies, discharges pus and promotes diuresis. For lung abscess, cough and urinary infection.' }),
  P({ cat: 'whole-herbs', name_zh: '广藿香', name_en: 'Patchouli Herb', pinyin: 'Guang Huo Xiang', latin: 'Herba Pogostemonis', origin_zh: '广东肇庆 / 海南', origin_en: 'Zhaoqing Guangdong / Hainan', part_zh: '地上部分', part_en: 'Aerial Part', price_min: 6.5, price_max: 12.0, sort_order: 3, desc_zh: '唇形科广藿香的干燥地上部分。茎略呈方柱形，多分枝，枝条稍曲折，表面被柔毛，质脆易折断，断面中部有髓；叶对生，皱缩成团，展平后叶片呈卵形或椭圆形，两面均被灰白色茸毛，气香特异，味微苦。', desc_en: 'Dried aerial part of Pogostemon cablin (Blanco) Benth. Square branched stems, tomentose oval leaves, distinctive earthy aroma.', usage_zh: '芳香化浊、和中止呕、发表解暑。用于湿浊中阻、脘痞呕吐、暑湿表证、湿温初起、发热倦怠、胸闷不舒、腹痛吐泻。', usage_en: 'Aromatically transforms turbid dampness, harmonizes the middle to stop vomiting, releases summer-heat. Also source of patchouli oil.' }),
  P({ cat: 'whole-herbs', name_zh: '益母草', name_en: 'Motherwort Herb', pinyin: 'Yi Mu Cao', latin: 'Herba Leonuri', origin_zh: '河南 / 安徽', origin_en: 'Henan / Anhui', part_zh: '地上部分', part_en: 'Aerial Part', price_min: 3.8, price_max: 7.2, sort_order: 4, desc_zh: '唇形科益母草的新鲜或干燥地上部分。茎呈方柱形，四面凹下成纵沟，表面灰绿色或黄绿色，体轻质韧，断面中部有白色髓；叶交互对生，多皱缩破碎，完整者下部叶掌状 3 裂，上部叶羽状深裂或浅裂成 3 片。', desc_en: 'Dried aerial part of Leonurus japonicus Houtt. Square grooved stems, palmately lobed leaves, used worldwide in women\'s health.', usage_zh: '活血调经、利尿消肿、清热解毒。用于月经不调、痛经经闭、恶露不尽、水肿尿少、疮疡肿毒。', usage_en: 'Activates blood and regulates menstruation, promotes diuresis, clears heat and detoxifies.' }),
  P({ cat: 'leaves', name_zh: '艾叶', name_en: 'Mugwort / Ai Ye', pinyin: 'Ai Ye', latin: 'Folium Artemisiae Argyi', origin_zh: '湖北蕲春 / 河南南阳', origin_en: 'Qichun Hubei / Nanyang Henan', part_zh: '叶', part_en: 'Leaf', price_min: 4.5, price_max: 8.5, spec_zh: '艾叶 / 艾绒 / 艾条', spec_en: 'Leaf / Moxa Wool / Moxa Stick', sort_order: 1, desc_zh: '菊科艾的干燥叶。多皱缩、破碎，有短柄；完整叶片展平后呈卵状椭圆形，羽状深裂，上表面灰绿色或深黄绿色，有稀疏的柔毛及腺点，下表面密生灰白色绒毛，质柔软，气清香，味苦。', desc_en: 'Dried leaf of Artemisia argyi Lev. et Vant. Pinnately lobed leaves, grey-white tomentose beneath, aromatic and bitter. Widely used for moxibustion.', usage_zh: '温经止血、散寒止痛、外用祛湿止痒。用于吐血、衄血、崩漏、月经过多、胎漏下血、少腹冷痛、经寒不调、宫冷不孕；外治皮肤瘙痒。', usage_en: 'Warms the meridians to stop bleeding, dispels cold and relieves pain; externally relieves itching. Main material for moxibustion.' }),
  P({ cat: 'leaves', name_zh: '桑叶', name_en: 'Mulberry Leaf', pinyin: 'Sang Ye', latin: 'Folium Mori', origin_zh: '浙江 / 四川', origin_en: 'Zhejiang / Sichuan', part_zh: '叶', part_en: 'Leaf', price_min: 4.0, price_max: 7.5, sort_order: 2, desc_zh: '桑科桑的干燥叶，初霜后采收者质佳，习称"霜桑叶"。多皱缩破碎，完整者有柄，叶片展平后呈卵形或宽卵形，上表面黄绿色或浅黄棕色，下表面颜色稍浅，叶脉突出，质脆，气微，味淡微苦涩。', desc_en: 'Dried leaf of Morus alba L., best harvested after first frost ("Shuang Sang Ye"). Oval brittle leaves with prominent veins.', usage_zh: '疏散风热、清肺润燥、清肝明目。用于风热感冒、肺热燥咳、头晕头痛、目赤昏花。', usage_en: 'Disperses wind-heat, clears and moistens the lung, clears liver and improves vision. Popular in herbal tea blends.' }),
  P({ cat: 'leaves', name_zh: '枇杷叶', name_en: 'Loquat Leaf', pinyin: 'Pi Pa Ye', latin: 'Folium Eriobotryae', origin_zh: '福建 / 浙江', origin_en: 'Fujian / Zhejiang', part_zh: '叶', part_en: 'Leaf', price_min: 5.0, price_max: 9.0, spec_zh: '净叶 / 蜜炙 / 去毛', spec_en: 'Raw / Honey-fried / Defuzzed', sort_order: 3, desc_zh: '蔷薇科枇杷的干燥叶。呈长圆形或倒卵形，先端尖，基部楔形，边缘有疏锯齿，近基部全缘，上表面灰绿色、黄棕色或红棕色，较光滑，下表面密被黄色绒毛，主脉显著突起，质脆，味微苦。', desc_en: 'Dried leaf of Eriobotrya japonica (Thunb.) Lindl. Oblong leaves with serrated margins, yellow tomentose underside.', usage_zh: '清肺止咳、降逆止呕。用于肺热咳嗽、气逆喘急、胃热呕逆、烦热口渴。', usage_en: 'Clears the lung and stops cough, directs rebellious qi downward to stop vomiting.' }),
  P({ cat: 'fungi-others', name_zh: '灵芝（赤芝）', name_en: 'Reishi / Lingzhi Mushroom', pinyin: 'Ling Zhi', latin: 'Ganoderma Lucidum', origin_zh: '浙江龙泉 / 福建武夷山', origin_en: 'Longquan Zhejiang / Wuyishan Fujian', part_zh: '子实体', part_en: 'Fruiting Body', price_min: 22, price_max: 48, spec_zh: '整芝 / 切片 / 孢子粉 / 提取物', spec_en: 'Whole / Sliced / Spore Powder / Extract', featured: 1, sort_order: 1, desc_zh: '多孔菌科真菌赤芝或紫芝的干燥子实体。菌盖木栓质，肾形、半圆形或近圆形，皮壳坚硬，黄褐色至红褐色，有光泽，具环状棱纹和辐射状皱纹，菌肉白色至淡棕色，味苦。', desc_en: 'Dried fruiting body of Ganoderma lucidum (Curtis) P.Karst. Kidney-shaped woody cap, reddish-brown and glossy with concentric rings.', usage_zh: '补气安神、止咳平喘。用于心神不宁、失眠心悸、肺虚咳喘、虚劳短气、不思饮食。', usage_en: 'Tonifies qi and calms the spirit, relieves cough and asthma. Popular worldwide as an adaptogen.' }),
  P({ cat: 'fungi-others', name_zh: '茯苓', name_en: 'Poria / Fu Ling', pinyin: 'Fu Ling', latin: 'Poria cocos', origin_zh: '云南 / 湖北罗田', origin_en: 'Yunnan / Luotian Hubei', part_zh: '菌核', part_en: 'Sclerotium', price_min: 6.5, price_max: 11.5, spec_zh: '白茯苓丁 / 茯苓块 / 茯苓皮 / 茯神', spec_en: 'White Cubes / Blocks / Peel / Fu Shen', sort_order: 2, desc_zh: '多孔菌科真菌茯苓的干燥菌核，多寄生于马尾松或赤松的根上。呈类球形、椭圆形、扁圆形或不规则团块，外皮薄而粗糙，棕褐色至黑褐色，有明显的皱缩纹理，体重质坚实，断面颗粒性，白色或淡红色，粘牙。', desc_en: 'Dried sclerotium of Poria cocos (Schw.) Wolf, parasitic on pine roots. Firm globular mass, brown rough outer skin, white granular fracture.', usage_zh: '利水渗湿、健脾、宁心。用于水肿尿少、痰饮眩悸、脾虚食少、便溏泄泻、心神不安、惊悸失眠。', usage_en: 'Promotes diuresis and drains dampness, strengthens the spleen and calms the mind.' }),
  P({ cat: 'fungi-others', name_zh: '冬虫夏草', name_en: 'Cordyceps Sinensis', pinyin: 'Dong Chong Xia Cao', latin: 'Cordyceps sinensis', origin_zh: '青海玉树 / 西藏那曲', origin_en: 'Yushu Qinghai / Nagqu Tibet', part_zh: '复合体', part_en: 'Complex (fungus + larva)', price_min: 18000, price_max: 32000, grade_zh: '2000/3000/4000 条/kg', grade_en: '2000/3000/4000 pcs per kg', moq: '100 g', unit: 'kg', sort_order: 3, desc_zh: '麦角菌科真菌冬虫夏草菌寄生在蝙蝠蛾科昆虫幼虫上的子座和幼虫尸体的干燥复合体。虫体似蚕，表面深黄色至黄棕色，有环纹 20~30 个，足 8 对；子座细长圆柱形，表面深棕色至棕褐色，气微腥，味微苦。需提供濒危物种进出口许可文件。', desc_en: 'Dried complex of the fungus Cordyceps sinensis and its host larva. Caterpillar-shaped body with a slender stem-like stroma. CITES documentation required for export.', usage_zh: '补肾益肺、止血化痰。用于肾虚精亏、阳痿遗精、腰膝酸痛、久咳虚喘、劳嗽痰血。', usage_en: 'Tonifies kidney and lung, stops bleeding and resolves phlegm. For impotence, chronic cough and lower back pain.' }),
];

const COMPANY = {
  name_zh: '华源堂中药材进出口有限公司',
  name_en: 'Huayuan Tang Chinese Herbs Import & Export Co., Ltd.',
  intro_zh: '公司始创于 1993 年，总部位于中国药都安徽亳州，是集种植基地、饮片加工、质量检测与国际贸易于一体的中药材专业供应商。我们在甘肃、云南、宁夏、四川、广西等道地产区建有 12 个合作种植基地与 3 个现代化加工车间，年加工能力逾 8,000 吨。产品远销欧盟、美国、日本、韩国、东南亚及中东等 40 多个国家和地区，长期为保健品、功能食品、草本茶、化妆品及制药企业提供稳定的原料供应与 OEM/ODM 服务。',
  intro_en: 'Founded in 1993 and headquartered in Bozhou (China\'s herb capital), we are a professional supplier integrating planting bases, decoction-piece processing, quality testing and international trade. We operate 12 partner farms and 3 modern processing workshops across authentic producing regions including Gansu, Yunnan, Ningxia, Sichuan and Guangxi, with over 8,000 tons annual capacity. Our products are exported to 40+ countries and regions in the EU, US, Japan, Korea, Southeast Asia and the Middle East, serving nutraceutical, functional food, herbal tea, cosmetic and pharmaceutical manufacturers with stable supply and OEM/ODM services.',
  address_zh: '安徽省亳州市谯城区药材交易中心 A 区 18 号',
  address_en: 'No.18, Block A, Herb Trading Center, Qiaocheng District, Bozhou, Anhui, China',
  phone: '+86-558-8888-6688',
  whatsapp: '+86-138-0567-8888',
  email: 'export@huayuantang-herb.com',
  website: 'www.huayuantang-herb.com',
  worktime_zh: '周一至周六 8:30–18:00（GMT+8）',
  worktime_en: 'Mon–Sat 8:30–18:00 (GMT+8)',
  year_founded: '1993',
  employees: '260+',
  factory_area: '32,000 m²',
  main_market: '欧盟 / 美国 / 日韩 / 东南亚 / 中东（40+ 国家）',
  annual_output: '8,000 吨 / 年',
};

const CERTIFICATES = [
  ['GMP 药品生产质量管理规范', 'GMP (Good Manufacturing Practice)', '国家药品监督管理局', 'NMPA'],
  ['ISO 9001 质量管理体系', 'ISO 9001 Quality Management System', 'SGS 通标标准技术服务', 'SGS'],
  ['HACCP 食品安全管理体系', 'HACCP Food Safety System', 'SGS 通标标准技术服务', 'SGS'],
  ['有机产品认证（EU / NOP）', 'Organic Certification (EU / NOP)', 'ECOCERT 国际有机认证中心', 'ECOCERT'],
  ['出口食品生产企业备案', 'Export Food Production Enterprise Registration', '中华人民共和国海关', 'China Customs'],
  ['原产地证明 / 植检证书', 'Certificate of Origin / Phytosanitary Certificate', '中国国际贸易促进委员会', 'CCPIT'],
];

const BANNERS = [
  ['道地药材 · 全球直供', 'Authentic Herbs · Global Supply', '12 个道地产区基地 · 8,000 吨年产能 · 40+ 国家长期供货', '12 origin bases · 8,000 t annual capacity · Exporting to 40+ countries'],
  ['每批次 COA 检测报告', 'COA for Every Batch', '水分 · 灰分 · 农残 · 重金属 · 黄曲霉毒素 全项检测', 'Moisture · Ash · Pesticide · Heavy metals · Aflatoxin — fully tested'],
  ['免费样品 · 7 天寄达', 'Free Samples · Shipped in 7 Days', '支持小批量试单，整柜拼柜均可，FOB / CIF / EXW 灵活条款', 'Small trial orders welcome, FCL & LCL, FOB / CIF / EXW terms'],
];

function hashPassword(pw, salt) {
  return crypto.scryptSync(String(pw || ''), salt, 64).toString('hex');
}

async function doSeed(env) {
  const catId = {};
  const insCat = 'INSERT INTO categories (slug,name_zh,name_en,desc_zh,desc_en,icon,sort_order) VALUES (?,?,?,?,?,?,?)';
  CATEGORIES.forEach((c, i) => {
    catId[c[0]] = db.run(env, insCat, [...c, i + 1]).lastInsertRowid;
  });

  const insProd = `INSERT INTO products (slug,category_id,name_zh,name_en,pinyin,latin_name,origin_zh,origin_en,part_zh,part_en,
    grade_zh,grade_en,spec_zh,spec_en,moisture,ash,package_zh,package_en,moq,price_min,price_max,unit,
    shelf_life,storage_zh,storage_en,desc_zh,desc_en,usage_zh,usage_en,certs,featured,status,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  for (const p of PRODUCTS) {
    const { cat, ...r } = p;
    db.run(env, insProd, [
      r.slug, catId[cat] || null, r.name_zh, r.name_en, r.pinyin, r.latin_name,
      r.origin_zh, r.origin_en, r.part_zh, r.part_en,
      r.grade_zh, r.grade_en, r.spec_zh, r.spec_en, r.moisture, r.ash,
      r.package_zh, r.package_en, r.moq, r.price_min, r.price_max, r.unit,
      r.shelf_life, r.storage_zh, r.storage_en, r.desc_zh, r.desc_en,
      r.usage_zh, r.usage_en, r.certs, r.featured || 0, r.status, r.sort_order,
    ]);
  }

  db.run(env, `INSERT INTO company (id,name_zh,name_en,intro_zh,intro_en,address_zh,address_en,phone,whatsapp,
    email,website,worktime_zh,worktime_en,year_founded,employees,factory_area,main_market,annual_output)
    VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    COMPANY.name_zh, COMPANY.name_en, COMPANY.intro_zh, COMPANY.intro_en,
    COMPANY.address_zh, COMPANY.address_en, COMPANY.phone, COMPANY.whatsapp,
    COMPANY.email, COMPANY.website, COMPANY.worktime_zh, COMPANY.worktime_en,
    COMPANY.year_founded, COMPANY.employees, COMPANY.factory_area,
    COMPANY.main_market, COMPANY.annual_output,
  ]);

  const insCert = 'INSERT INTO certificates (name_zh,name_en,issuer_zh,issuer_en,sort_order) VALUES (?,?,?,?,?)';
  CERTIFICATES.forEach((c, i) => db.run(env, insCert, [...c, i + 1]));

  const insBan = 'INSERT INTO banners (title_zh,title_en,subtitle_zh,subtitle_en,sort_order) VALUES (?,?,?,?,?)';
  BANNERS.forEach((b, i) => db.run(env, insBan, [...b, i + 1]));

  const salt = crypto.randomBytes(16).toString('hex');
  db.run('INSERT INTO admins (username,password_hash,salt) VALUES (?,?,?)', ['admin', hashPassword('admin123', salt), salt]);
}

let seedPromise = null;
export async function maybeSeed(env) {
  await ensureSchema(env);
  const cnt = await db.get(env, 'SELECT COUNT(*) n FROM products');
  if (cnt && cnt.n > 0) return;
  if (!seedPromise) {
    try { seedPromise = doSeed(env); await seedPromise; }
    catch (e) { seedPromise = null; throw e; }
  }
  return seedPromise;
}

export function ensureReady(env) {
  return maybeSeed(env);
}
