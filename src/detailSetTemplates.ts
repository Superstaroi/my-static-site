import { CommercialTone, DetailSetPlatform, GenerationMode, ImageType, SceneStrictness } from './types';
import { ProductFingerprint } from './types/product';

export interface DetailSetPlanItem {
  id: string;
  slot: number;
  title: string;
  description: string;
  aspectRatio: string;
  imageType: ImageType;
  mode: GenerationMode;
  commercialTone: CommercialTone;
  sceneStrictness: SceneStrictness;
  productTitle: string;
  copyText: string;
  customPrompt: string;
}

type DetailSetHumanAllowance = 'none' | 'hands' | 'partial';

interface DetailSetSlotBlueprint {
  purpose: string;
  mustHave: string[];
  mustNotHave: string[];
  composition: string;
  allowedHuman: DetailSetHumanAllowance;
  allowedAnimals: boolean;
  allowedFood: boolean;
}

export const DETAIL_SET_PLATFORM_OPTIONS: { label: string; value: DetailSetPlatform }[] = [
  { label: '亚马逊', value: 'amazon' },
  { label: '沃尔玛', value: 'walmart' },
  { label: '其他平台', value: 'other' },
];

const getProductName = (fingerprint?: ProductFingerprint | null): string => {
  return fingerprint?.productSummary || fingerprint?.category || 'the uploaded product';
};

const getCategory = (fingerprint?: ProductFingerprint | null): string => {
  return fingerprint?.category || 'product';
};

const getKeyParts = (fingerprint?: ProductFingerprint | null): string => {
  const parts = fingerprint?.structure?.keyParts?.filter(Boolean) || [];
  return parts.slice(0, 4).join(', ') || 'its core structure and visible details';
};

const getDistinctiveFeatures = (fingerprint?: ProductFingerprint | null): string => {
  const features = fingerprint?.structure?.distinctiveFeatures?.filter(Boolean) || [];
  return features.slice(0, 4).join(', ') || 'its distinctive physical features';
};

const getColorSummary = (fingerprint?: ProductFingerprint | null): string => {
  const colors = fingerprint?.colors?.filter(Boolean) || [];
  return colors.slice(0, 4).map(color => `${color.name} (${color.area})`).join(', ') || 'the original product color palette';
};

const getMaterialSummary = (fingerprint?: ProductFingerprint | null): string => {
  const materials = fingerprint?.materials?.filter(Boolean) || [];
  return materials.slice(0, 4).map(material => `${material.name} on ${material.location}`).join(', ') || 'the original material mix and finish';
};

const getAccessorySummary = (fingerprint?: ProductFingerprint | null): string => {
  const accessories = fingerprint?.accessories?.filter(Boolean) || [];
  return accessories.slice(0, 3).map(accessory => `${accessory.count}x ${accessory.name} at ${accessory.position}`).join(', ') || 'no unrelated extra accessories';
};

const getStructureSummary = (fingerprint?: ProductFingerprint | null): string => {
  const overallShape = fingerprint?.structure?.overallShape || 'the original overall silhouette';
  const keyParts = fingerprint?.structure?.keyParts?.slice(0, 4).join(', ');
  return keyParts ? `${overallShape} with ${keyParts}` : overallShape;
};

const getSceneSearchText = (fingerprint?: ProductFingerprint | null) =>
  `${fingerprint?.productSummary || ''} ${fingerprint?.category || ''}`.toLowerCase();

const getSceneProfile = (fingerprint?: ProductFingerprint | null) => {
  const searchText = getSceneSearchText(fingerprint);

  if (/(projector|beamer|home theater|home cinema)/.test(searchText)) {
    return {
      heroEnvironment: 'a premium living-room or home-theater corner with projection glow softly visible in the background',
      usageEnvironment: 'a believable movie-night setup in a bedroom, lounge, or family media room',
      bannerEnvironment: 'a cinematic entertainment interior with visible depth, ambient lighting, and a polished media-space feel',
      lightingStyle: 'layered practical lighting, soft ambient spill, believable shadow falloff, and tasteful highlights on the lens and body',
      propStyling: 'restrained home-entertainment props such as a sofa, side table, remote, throw blanket, or popcorn kept secondary to the product',
      detailStyling: 'Let the lens glass, vent texture, seams, buttons, and ports catch controlled highlights with a premium macro feel',
      comparisonStyling: 'show one full hero angle plus one supporting close-up of the lens, side texture, or control area',
    };
  }

  if (/(lamp|light|lantern|lighting|night light|desk light|ceiling light)/.test(searchText)) {
    return {
      heroEnvironment: 'a refined interior corner where the lighting effect can visibly shape the surrounding space',
      usageEnvironment: 'a believable home setup such as a bedside table, reading nook, vanity, or dining area',
      bannerEnvironment: 'a layered interior scene where the product light creates atmosphere across foreground and background surfaces',
      lightingStyle: 'soft directional light, visible light bloom where appropriate, gentle shadows, and premium tonal separation',
      propStyling: 'small decor accents such as books, ceramics, linens, or framed art that support the lighting story without clutter',
      detailStyling: 'Emphasize glow quality, surface finish, edge transitions, and craftsmanship while keeping the product shape exact',
      comparisonStyling: 'show one lit context shot plus one closer angle of the lighting effect or product finish',
    };
  }

  if (/(coffee|espresso|kettle|blender|air fryer|toaster|cooker|kitchen|appliance)/.test(searchText)) {
    return {
      heroEnvironment: 'a premium kitchen or countertop scene with clear styling hierarchy and natural lived-in realism',
      usageEnvironment: 'an active but tidy food-prep or serving moment in a modern kitchen environment',
      bannerEnvironment: 'a wide kitchen composition with layered surfaces, premium materials, and a clear lifestyle story',
      lightingStyle: 'bright but dimensional daylight or studio-natural hybrid light with controlled reflections and clean shadows',
      propStyling: 'tasteful food ingredients, cups, utensils, boards, or linens that feel useful and category-relevant without stealing focus',
      detailStyling: 'Highlight knobs, lids, handles, spouts, texture, finishes, and join lines with tactile, high-clarity detail',
      comparisonStyling: 'show one main countertop view plus one supporting close-up of the key functional area',
    };
  }

  if (/(bedding|duvet|comforter|quilt|pillow|sheet|bed linen|linen set|blanket|throw blanket|mattress topper|bedspread|bed skirt|bedroom textile|床上用品|四件套|被子|被套|床单|枕头|枕套|毛毯|床笠|床垫)/.test(searchText)) {
    return {
      heroEnvironment: 'a premium bedroom setting with layered bedding, believable styling, and tactile textile depth',
      usageEnvironment: 'a lived-in bedroom or lounge resting moment that naturally demonstrates comfort, touch, and softness',
      bannerEnvironment: 'a wide editorial bedroom scene with layered linens, premium furniture, and a comforting lifestyle story',
      lightingStyle: 'soft daylight or premium window light with gentle shadows, visible textile volume, and clean tonal separation',
      propStyling: 'restrained bedroom accessories such as books, trays, robes, cups, or bedside decor kept secondary to the bedding product',
      detailStyling: 'Highlight quilting, stitching, folds, edge finishing, surface texture, and fabric loft with tactile realism',
      comparisonStyling: 'show one full styled bed view plus one supporting close-up of fabric, stitching, or layered texture',
    };
  }

  if (/(speaker|headphone|earbud|keyboard|mouse|monitor|router|camera|microphone|tech|electronic|device|gadget)/.test(searchText)) {
    return {
      heroEnvironment: 'a modern desk, studio, or lifestyle-tech environment with layered depth and subtle atmospheric polish',
      usageEnvironment: 'a believable work, gaming, music, or creator setup that matches the category',
      bannerEnvironment: 'a wide, premium tech scene with distinct foreground, subject, and background separation',
      lightingStyle: 'crisp directional key light, tasteful rim highlights, controlled reflections, and premium contrast without looking synthetic',
      propStyling: 'supporting tech or desk accessories such as notebooks, screens, cables, plants, or furniture used sparingly',
      detailStyling: 'Emphasize buttons, grills, finishes, edges, interfaces, ports, and precision manufacturing details',
      comparisonStyling: 'show one hero setup angle plus one close-up that makes the product engineering clearer',
    };
  }

  if (/(artificial plant|faux plant|fake plant|silk plant|artificial flower|faux flower|fake flower|仿真植物|仿真花|假花|人造植物|人造花)/.test(searchText)) {
    return {
      heroEnvironment: 'a premium interior styling corner with tasteful furniture, layered decor, and clear product placement',
      usageEnvironment: 'a believable home decor placement such as a console, shelf, dining table, or living-room corner',
      bannerEnvironment: 'a wide interior decor scene with styled surfaces, layered depth, and elegant botanical placement',
      lightingStyle: 'soft natural interior light with believable shadow falloff, subtle highlights, and refined tonal separation',
      propStyling: 'restrained home decor props such as books, candles, ceramics, frames, or trays that support a styled-placement story',
      detailStyling: 'Highlight leaf texture, petal layering, pot finish, arrangement density, and crafted botanical realism',
      comparisonStyling: 'show one full decor placement view plus one supporting close-up of foliage, petals, or pot craftsmanship',
    };
  }

  if (/(sofa|chair|table|shelf|cabinet|storage|furniture|home decor|decor)/.test(searchText)) {
    return {
      heroEnvironment: 'a thoughtfully styled interior that feels aspirational but still believable for daily living',
      usageEnvironment: 'a real home scenario where the product naturally supports organization, comfort, or decor',
      bannerEnvironment: 'a wide editorial home scene with foreground styling, clear depth, and layered interiors',
      lightingStyle: 'soft natural daylight or premium interior light with realistic shadow shaping and gentle contrast',
      propStyling: 'books, textiles, trays, ceramics, or small home accessories used in a restrained styling language',
      detailStyling: 'Highlight texture, stitching, seams, edge quality, grain, surfaces, and structural finish with tactile realism',
      comparisonStyling: 'show one styled room view plus one closer crop that demonstrates surface or structural quality',
    };
  }

  return {
    heroEnvironment: 'a premium, category-appropriate real-life environment with visible depth and richer set design',
    usageEnvironment: 'a believable real-world usage setting tailored to the product category',
    bannerEnvironment: 'a wide premium scene with layered foreground, subject, and background separation',
    lightingStyle: 'directional light, believable shadow gradients, subtle highlight control, and a polished commercial finish',
    propStyling: 'restrained category-relevant props that add context without clutter or distraction',
    detailStyling: 'Highlight texture, surface transitions, craftsmanship, and key product structures with a tactile close-up feel',
    comparisonStyling: 'show one wider faithful product view plus one supporting close-up that clarifies benefits',
  };
};

const getHumanSceneDirectives = (fingerprint?: ProductFingerprint | null) => {
  const searchText = getSceneSearchText(fingerprint);

  if (/(artificial plant|faux plant|fake plant|silk plant|artificial flower|faux flower|fake flower|仿真植物|仿真花|假花|人造植物|人造花)/.test(searchText)) {
    return {
      hero: 'Do not include people, hands, body parts, pets, animals, dogs, cats, or birds. Tell the lifestyle story through interior placement, decor styling, and spatial atmosphere only.',
      usage: 'Keep this as a styled placement scene only. Do not show people, hands, pets, animals, or human interaction with the product.',
      banner: 'Do not introduce people, hands, body parts, pets, animals, dogs, cats, or birds. Keep the banner focused on elegant placement and decor storytelling only.',
    };
  }

  if (/(bedding|duvet|comforter|quilt|pillow|sheet|bed linen|linen set|blanket|throw blanket|mattress topper|bedspread|bed skirt|bedroom textile|床上用品|四件套|被子|被套|床单|枕头|枕套|毛毯|床笠|床垫)/.test(searchText)) {
    return {
      hero: 'Prefer a believable bedroom lifestyle scene with visible human presence such as a reclining person, seated user, or natural hand interaction, while keeping the bedding fully readable.',
      usage: 'Show a real human-use moment with a person or partial body naturally using, touching, arranging, or resting with the bedding product. Avoid a sterile product-only setup.',
      banner: 'Use a wider bedroom lifestyle story with visible human presence or hand interaction so the frame feels like real use instead of a static showroom bed.',
    };
  }

  if (/(coffee|espresso|kettle|blender|air fryer|toaster|cooker|kitchen|appliance|speaker|headphone|earbud|keyboard|mouse|monitor|router|camera|microphone|tech|electronic|device|gadget|小家电|厨房电器|咖啡机|电热水壶|烧水壶|空气炸锅|搅拌机|榨汁机|数码|3c|电子|音箱|耳机|键盘|鼠标|显示器|路由器|相机|麦克风)/.test(searchText)) {
    return {
      hero: 'Prefer a believable human-use setup with hands or a partial person naturally interacting with the product, while keeping the product dominant and fully recognizable.',
      usage: 'Explicitly show a real usage moment with visible hands or a partial person using, holding, operating, or interacting with the product. Avoid turning this into a product-only still life.',
      banner: 'Use a wider lifestyle story with human interaction, such as hands in use or a partial person in frame, so the banner feels like real life instead of a static product display.',
    };
  }

  return {
    hero: '',
    usage: '',
    banner: '',
  };
};

const includesAnyCategoryKeyword = (searchText: string, keywords: string[]) =>
  keywords.some(keyword => searchText.includes(keyword));

const DETAIL_SET_CATEGORY_KEYWORDS = {
  projector: ['projector', 'beamer', 'home theater', 'home theatre', 'home cinema', 'mini projector', '投影仪', '投影机'],
  lighting: ['lamp', 'lighting', 'lantern', 'night light', 'desk light', 'table lamp', 'floor lamp', 'ceiling light', 'pendant light', 'wall sconce', 'led light', '灯', '台灯', '落地灯', '壁灯', '夜灯', '氛围灯', '吊灯'],
  smallAppliance: ['coffee maker', 'espresso', 'kettle', 'blender', 'air fryer', 'toaster', 'rice cooker', 'pressure cooker', 'slow cooker', 'juicer', 'mixer', 'food processor', 'steamer', 'bread maker', 'humidifier', 'air purifier', 'fan', 'space heater', 'dehumidifier', 'vacuum sealer', 'kitchen appliance', 'small appliance', 'appliance', '咖啡机', '浓缩咖啡机', '电热水壶', '烧水壶', '搅拌机', '榨汁机', '空气炸锅', '烤面包机', '电饭煲', '高压锅', '慢炖锅', '料理机', '蒸锅', '面包机', '加湿器', '空气净化器', '风扇', '取暖器', '除湿机', '小家电', '厨房电器'],
  kitchenware: ['cookware', 'frying pan', 'skillet', 'saucepan', 'pot set', 'bakeware', 'baking tray', 'dinnerware', 'tableware', 'cutlery', 'knife set', 'cutting board', 'food storage', 'lunch box', 'water bottle', 'tumbler', 'mug', 'kitchen tool', 'bento', '锅具', '平底锅', '煎锅', '奶锅', '刀具', '餐具', '碗盘', '烘焙', '烤盘', '切菜板', '饭盒', '保鲜盒', '水杯', '保温杯', '马克杯', '厨房用具'],
  bedding: ['bedding', 'duvet', 'comforter', 'quilt', 'pillow', 'sheet', 'bed linen', 'linen set', 'blanket', 'throw blanket', 'mattress topper', 'bedspread', 'bed skirt', 'bedroom textile', '床上用品', '四件套', '被子', '被套', '床单', '枕头', '枕套', '毛毯', '床笠', '床垫'],
  tech: ['speaker', 'headphone', 'earbud', 'keyboard', 'mouse', 'monitor', 'router', 'camera', 'microphone', 'webcam', 'charger', 'power bank', 'smart watch', 'smartwatch', 'tablet stand', 'laptop stand', 'phone stand', 'computer accessory', 'gaming', 'tech', 'electronic', 'device', 'gadget', '数码', '3c', '电子', '音箱', '耳机', '键盘', '鼠标', '显示器', '路由器', '相机', '麦克风', '摄像头', '充电器', '充电宝', '支架'],
  beauty: ['beauty', 'skincare', 'makeup', 'cosmetic', 'facial', 'hair dryer', 'hair curler', 'straightener', 'trimmer', 'shaver', 'massager', 'facial brush', 'nail', 'manicure', 'pedicure', 'oral care', 'toothbrush', '美容', '美妆', '护肤', '化妆', '吹风机', '卷发棒', '直发器', '剃须刀', '修剪器', '按摩仪', '洁面仪', '美甲', '理容', '口腔护理', '牙刷'],
  wearable: ['backpack', 'handbag', 'tote', 'crossbody', 'wallet', 'luggage', 'suitcase', 'jewelry', 'necklace', 'bracelet', 'earring', 'hat', 'scarf', 'glove', 'belt', 'shoe', 'sneaker', 'slipper', 'boot', 'sock', 'apparel', 'clothing', 'shirt', 'hoodie', 'jacket', 'dress', 'leggings', 'sunglasses', 'watch band', '服饰', '服装', '鞋', '鞋子', '拖鞋', '靴子', '袜子', '帽子', '围巾', '手套', '皮带', '背包', '手提包', '旅行箱', '行李箱', '珠宝', '首饰', '项链', '手链', '戒指', '耳环'],
  fitnessOutdoor: ['dumbbell', 'yoga mat', 'resistance band', 'treadmill', 'exercise bike', 'sports', 'fitness', 'workout', 'camping', 'hiking', 'outdoor', 'tent', 'sleeping bag', 'backpacking', 'bicycle accessory', '健身', '运动', '哑铃', '瑜伽垫', '阻力带', '跑步机', '动感单车', '露营', '徒步', '帐篷', '睡袋', '户外'],
  toolsAutomotive: ['tool', 'drill', 'screwdriver', 'wrench', 'socket set', 'toolbox', 'automotive', 'car accessory', 'jump starter', 'tire inflator', 'garage', 'workshop', 'home improvement', 'hardware', '工具', '电钻', '螺丝刀', '扳手', '工具箱', '汽车用品', '车载', '充气泵', '搭电宝', '五金'],
  cleaningOrganization: ['vacuum cleaner', 'mop', 'broom', 'steam mop', 'lint roller', 'laundry basket', 'laundry hamper', 'organizer', 'storage bin', 'storage box', 'cleaning', 'household', '拖把', '扫把', '清洁', '家清', '洗衣篮', '收纳箱', '整理箱', '储物盒'],
  officeCraft: ['desk organizer', 'office', 'school supplies', 'stationery', 'printer', 'label maker', 'craft', 'sewing', 'planner', 'notebook', '办公', '文具', '学校用品', '打印机', '标签机', '手工', '缝纫', '笔记本'],
  babyKids: ['baby', 'toddler', 'kids', 'children', 'nursery', 'stroller', 'high chair', 'baby carrier', 'bottle', 'pacifier', 'teether', 'crib', 'toy', 'doll', 'building blocks', '儿童', '婴儿', '宝宝', '幼儿', '婴童', '婴儿车', '餐椅', '背带', '奶瓶', '安抚奶嘴', '玩具', '积木'],
  pet: ['pet', 'dog', 'cat', 'puppy', 'kitten', 'pet bed', 'pet toy', 'scratcher', 'cat tree', 'litter box', 'leash', 'harness', 'feeder', 'water fountain', '宠物', '狗', '猫', '犬', '猫抓板', '猫爬架', '猫砂盆', '牵引绳', '宠物床', '喂食器', '饮水机'],
  decorPlacement: ['artificial plant', 'faux plant', 'fake plant', 'silk plant', 'artificial flower', 'faux flower', 'fake flower', 'vase', 'wreath', 'garland', 'figurine', 'sculpture', 'statue', 'ornament', 'candle holder', 'wall art', 'wall decor', 'photo frame', 'mirror', 'clock', '仿真植物', '仿真花', '假花', '人造植物', '人造花', '花瓶', '花环', '摆件', '雕塑', '烛台', '挂画', '装饰画', '相框', '镜子', '装饰钟'],
  furnitureStorage: ['sofa', 'chair', 'table', 'shelf', 'cabinet', 'dresser', 'nightstand', 'ottoman', 'bench', 'bookcase', 'tv stand', 'furniture', 'home decor', 'decor', 'storage rack', 'shoe rack', 'coat rack', '沙发', '椅子', '桌子', '边几', '书架', '柜子', '斗柜', '床头柜', '换鞋凳', '电视柜', '家具', '家居'],
};

const DETAIL_SET_GUIDANCE_GLOBAL_HEADER = '[GLOBAL RULES]';
const getDetailSetGuidanceSlotHeader = (slot: number) => `[SLOT ${slot}]`;

const DETAIL_SET_EXTRA_KEYWORDS = {
  vacuum: ['vacuum', 'vacuum cleaner', 'stick vacuum', 'cordless vacuum', 'handheld vacuum', 'robot vacuum', 'wet dry vacuum', 'floor washer', '吸尘器', '无线吸尘器', '手持吸尘器', '洗地机'],
  pillow: ['pillow', 'bed pillow', 'sleep pillow', 'memory foam pillow', 'neck pillow', 'throw pillow', '枕头', '记忆枕', '靠枕', '睡枕'],
  decorPlant: ['artificial plant', 'faux plant', 'fake plant', 'artificial tree', 'faux tree', 'fake tree', 'artificial olive tree', 'faux olive tree', 'olive tree', 'potted plant', 'potted tree', 'house plant', 'indoor plant', 'greenery', 'botanical', '盆栽', '绿植', '仿真树', '假树', '仿真绿植', '仿真植物', '人造植物', '橄榄树'],
  projector: ['projector', 'portable projector', 'mini projector', 'beamer', '投影仪', '投影机'],
  homeAppliance: ['small appliance', 'kitchen appliance', 'coffee maker', 'espresso', 'kettle', 'blender', 'air fryer', 'toaster', 'rice cooker', 'pressure cooker', 'slow cooker', 'juicer', 'mixer', 'food processor', 'steamer', 'bread maker', 'humidifier', 'air purifier', 'fan', 'space heater', 'dehumidifier', 'appliance', '小家电', '厨房电器', '咖啡机', '电热水壶', '空气炸锅', '搅拌机', '榨汁机', '加湿器', '空气净化器', '风扇', '取暖器', '除湿机'],
};

type DetailSetStoryboardFamily = keyof typeof DETAIL_SET_EXTRA_KEYWORDS | 'generic';

const getSceneSearchTextV2 = (fingerprint?: ProductFingerprint | null) =>
  `${fingerprint?.productSummary || ''} ${fingerprint?.category || ''}`.toLowerCase();

const textIncludesAny = (text: string, keywords: string[]) =>
  keywords.some(keyword => text.includes(keyword));

const getDetailSetStoryboardFamily = (
  fingerprint?: ProductFingerprint | null,
): DetailSetStoryboardFamily => {
  const searchText = getSceneSearchTextV2(fingerprint);

  if (textIncludesAny(searchText, DETAIL_SET_EXTRA_KEYWORDS.vacuum)) {
    return 'vacuum';
  }

  if (textIncludesAny(searchText, DETAIL_SET_EXTRA_KEYWORDS.pillow)) {
    return 'pillow';
  }

  if (textIncludesAny(searchText, DETAIL_SET_EXTRA_KEYWORDS.decorPlant)) {
    return 'decorPlant';
  }

  if (textIncludesAny(searchText, DETAIL_SET_EXTRA_KEYWORDS.projector)) {
    return 'projector';
  }

  if (textIncludesAny(searchText, DETAIL_SET_EXTRA_KEYWORDS.homeAppliance)) {
    return 'homeAppliance';
  }

  return 'generic';
};

const firstNonEmptyString = (...values: Array<string | undefined | null>) =>
  values.map(value => String(value || '').trim()).find(Boolean) || '';

const getDetailSetStructuredSections = (guidance?: string | null) => {
  const normalized = String(guidance || '').trim();
  const sections = new Map<string, string>();
  if (!normalized) {
    return sections;
  }

  const matcher = /\[(GLOBAL RULES|SLOT [1-6])\]\s*([\s\S]*?)(?=\n\[(?:GLOBAL RULES|SLOT [1-6])\]|\s*$)/g;
  for (const match of normalized.matchAll(matcher)) {
    const sectionKey = String(match[1] || '').trim();
    const sectionBody = String(match[2] || '').trim();
    if (sectionKey && sectionBody) {
      sections.set(sectionKey, sectionBody);
    }
  }

  return sections;
};

export const resolveDetailSetGuidanceForSlot = (guidance: string | undefined, slot: number) => {
  const normalized = String(guidance || '').trim();
  if (!normalized) {
    return '';
  }

  const sections = getDetailSetStructuredSections(normalized);
  if (sections.size === 0) {
    return normalized;
  }

  return [
    sections.get(DETAIL_SET_GUIDANCE_GLOBAL_HEADER.slice(1, -1)),
    sections.get(getDetailSetGuidanceSlotHeader(slot).slice(1, -1)),
  ]
    .filter(Boolean)
    .join('\n');
};

const DETAIL_SET_ALLOWANCE_KEYWORDS = {
  people: ['person', 'people', 'human', 'adult', 'model', '人物', '人物出镜', '成人', '用户', '模特'],
  hands: ['hand', 'hands', 'holding', 'in hand', '手部', '手持', '持握', '拿着', '操作中'],
  animals: ['pet', 'pets', 'animal', 'animals', 'dog', 'dogs', 'cat', 'cats', '宠物', '动物', '狗', '猫'],
  food: ['food', 'foods', 'drink', 'drinks', 'beverage', 'coffee', 'tea', 'meal', 'ingredient', 'ingredients', '食物', '饮品', '咖啡', '茶饮', '食材', '菜品'],
};

const getDetailSetTextAllowances = (text: string) => ({
  people: textIncludesAny(text, DETAIL_SET_ALLOWANCE_KEYWORDS.people),
  hands: textIncludesAny(text, DETAIL_SET_ALLOWANCE_KEYWORDS.hands),
  animals: textIncludesAny(text, DETAIL_SET_ALLOWANCE_KEYWORDS.animals),
  food: textIncludesAny(text, DETAIL_SET_ALLOWANCE_KEYWORDS.food),
});

const createDetailSetSlotBlueprint = (
  purpose: string,
  {
    mustHave = [],
    mustNotHave = [],
    composition,
    allowedHuman = 'none',
    allowedAnimals = false,
    allowedFood = false,
  }: Partial<DetailSetSlotBlueprint> & Pick<DetailSetSlotBlueprint, 'composition'>,
): DetailSetSlotBlueprint => ({
  purpose,
  mustHave,
  mustNotHave,
  composition,
  allowedHuman,
  allowedAnimals,
  allowedFood,
});

const getDetailSetSlotBlueprint = (
  item: Pick<DetailSetPlanItem, 'slot' | 'imageType' | 'title' | 'description'>,
  fingerprint?: ProductFingerprint | null,
): DetailSetSlotBlueprint => {
  const family = getDetailSetStoryboardFamily(fingerprint);

  if (family === 'vacuum') {
    switch (item.slot) {
      case 1:
        return createDetailSetSlotBlueprint('Hero vacuum showcase', {
          mustHave: ['one complete uploaded vacuum cleaner', 'clear silhouette', 'faithful original color and brush-head shape'],
          mustNotHave: ['pets', 'animals', 'second vacuum', 'split layout'],
          composition: 'single full scene with one dominant product subject in a clean home interior',
        });
      case 2:
        return createDetailSetSlotBlueprint('Structure and brush-head detail', {
          mustHave: ['one faithful close-up of the same vacuum', 'one anchor detail such as dust bin, brush head, or handle'],
          mustNotHave: ['people', 'pets', 'second machine', 'collage', 'floating detached parts'],
          composition: 'tight detail shot with one continuous product region only',
        });
      case 3:
        return createDetailSetSlotBlueprint('Real floor-cleaning use scene', {
          mustHave: ['the same uploaded vacuum in active floor-cleaning use'],
          mustNotHave: ['pets', 'animals', 'second vacuum', 'stacked machines'],
          composition: 'one realistic use scene with the product still fully readable',
          allowedHuman: 'partial',
        });
      case 4:
        return createDetailSetSlotBlueprint('Functional cleaning feature shot', {
          mustHave: ['one same-product feature demonstration', 'clear floor or edge-cleaning context'],
          mustNotHave: ['pets', 'animals', 'second vacuum', 'abstract overlap', 'material reinterpretation'],
          composition: 'single feature scene without collage or duplicate products',
        });
      case 5:
        return createDetailSetSlotBlueprint('Wide lifestyle hero banner', {
          mustHave: ['one same uploaded vacuum', 'clear spatial depth'],
          mustNotHave: ['pets', 'animals', 'second vacuum', 'picture-in-picture'],
          composition: 'single wide scene with one complete product subject',
        });
      default:
        return createDetailSetSlotBlueprint('Supplementary angle or storage-context shot', {
          mustHave: ['one same uploaded vacuum', 'faithful alternate angle'],
          mustNotHave: ['pets', 'animals', 'second vacuum', 'contact-sheet layout', 'unexpected dock or wall mount'],
          composition: 'one support image with one product subject only',
        });
    }
  }

  if (family === 'pillow') {
    switch (item.slot) {
      case 1:
        return createDetailSetSlotBlueprint('Styled hero bedding scene', {
          mustHave: ['the same uploaded pillow', 'faithful fabric color and edge profile'],
          mustNotHave: ['pets', 'animals', 'extra pillows that change the hero product identity'],
          composition: 'one styled bed scene centered on the uploaded pillow',
        });
      case 2:
        return createDetailSetSlotBlueprint('Loft and side-profile detail', {
          mustHave: ['the same pillow close-up', 'side profile, loft, seam, or edge detail'],
          mustNotHave: ['people', 'pets', 'collage'],
          composition: 'one tight textile detail frame',
        });
      case 3:
        return createDetailSetSlotBlueprint('Comfort use scene', {
          mustHave: ['the same pillow in a believable comfort-use setup'],
          mustNotHave: ['pets', 'animals', 'multiple users'],
          composition: 'one realistic usage frame with the pillow clearly visible',
          allowedHuman: 'partial',
        });
      case 4:
        return createDetailSetSlotBlueprint('Material and stitching detail', {
          mustHave: ['the same pillow fabric, stitching, edge, or fill detail'],
          mustNotHave: ['people', 'pets', 'collage'],
          composition: 'one close-up craftsmanship frame',
        });
      case 5:
        return createDetailSetSlotBlueprint('Support or posture explanation scene', {
          mustHave: ['the same pillow support logic'],
          mustNotHave: ['pets', 'animals', 'multi-panel layout'],
          composition: 'one clear support-focused frame',
          allowedHuman: 'partial',
        });
      default:
        return createDetailSetSlotBlueprint('Supplementary room-context scene', {
          mustHave: ['the same uploaded pillow', 'faithful room context'],
          mustNotHave: ['pets', 'animals', 'duplicate hero products'],
          composition: 'one clean supplementary bedding scene',
        });
    }
  }

  if (family === 'decorPlant') {
    return createDetailSetSlotBlueprint('Styled decor placement scene', {
      mustHave: ['the same uploaded plant or tree', 'faithful pot, foliage, and branch structure'],
      mustNotHave: ['people', 'hands', 'pets', 'animals', 'extra decorative creatures', 'split layout'],
      composition: item.slot === 2 || item.slot === 4
        ? 'one close-up decor detail frame that still preserves the real branch and canopy relationship'
        : 'one elegant interior placement scene with one product subject only',
    });
  }

  if (family === 'projector') {
    switch (item.slot) {
      case 1:
        return createDetailSetSlotBlueprint('Projector hero scene', {
          mustHave: ['one same uploaded projector', 'faithful body color, lens, vents, and button layout'],
          mustNotHave: ['people', 'pets', 'second projector'],
          composition: 'one premium living-room hero scene with the device clearly readable',
        });
      case 2:
        return createDetailSetSlotBlueprint('Lens and port detail shot', {
          mustHave: ['the same projector close-up', 'one anchor detail such as lens or interface'],
          mustNotHave: ['people', 'pets', 'duplicate devices', 'floating detached parts'],
          composition: 'one engineering-focused close-up frame with one continuous device region',
        });
      case 3:
        return createDetailSetSlotBlueprint('Projection environment scene', {
          mustHave: ['the same projector in a believable projection environment'],
          mustNotHave: ['pets', 'animals', 'second projector'],
          composition: 'one living-space projection scene without crowding the product',
        });
      case 4:
        return createDetailSetSlotBlueprint('Build-quality and finish shot', {
          mustHave: ['the same projector body finish and structure detail'],
          mustNotHave: ['people', 'pets', 'duplicate devices', 'material reinterpretation'],
          composition: 'one premium device-detail frame',
        });
      case 5:
        return createDetailSetSlotBlueprint('Wide cinematic setup', {
          mustHave: ['one same uploaded projector', 'projection atmosphere or screen glow'],
          mustNotHave: ['people', 'pets', 'second projector', 'collage'],
          composition: 'one wide cinematic room scene',
        });
      default:
        return createDetailSetSlotBlueprint('Supplementary projector angle', {
          mustHave: ['one same uploaded projector', 'faithful alternate angle'],
          mustNotHave: ['people', 'pets', 'duplicate devices'],
          composition: 'one support frame with one projector only',
        });
    }
  }

  if (family === 'homeAppliance') {
    switch (item.slot) {
      case 1:
        return createDetailSetSlotBlueprint('Hero appliance countertop scene', {
          mustHave: ['the same uploaded appliance', 'faithful body color, controls, and silhouette'],
          mustNotHave: ['pets', 'animals', 'second appliance'],
          composition: 'one clean countertop or home-use hero scene',
        });
      case 2:
        return createDetailSetSlotBlueprint('Control-area detail shot', {
          mustHave: ['the same appliance close-up', 'one anchor detail such as controls, lid, spout, or functional area'],
          mustNotHave: ['people', 'pets', 'duplicate appliances', 'floating detached parts'],
          composition: 'one functional close-up frame with one continuous product region',
        });
      case 3:
        return createDetailSetSlotBlueprint('Real appliance usage scene', {
          mustHave: ['the same uploaded appliance in believable use'],
          mustNotHave: ['pets', 'animals', 'second appliance', 'multiple unrelated props'],
          composition: 'one realistic usage frame with the product still dominant',
          allowedHuman: 'hands',
        });
      case 4:
        return createDetailSetSlotBlueprint('Primary functional result or material detail', {
          mustHave: ['the same appliance and its core functional value'],
          mustNotHave: ['pets', 'animals', 'second appliance', 'abstract props', 'material reinterpretation'],
          composition: 'one product-focused feature frame',
          allowedFood: true,
        });
      case 5:
        return createDetailSetSlotBlueprint('Wide lifestyle appliance banner', {
          mustHave: ['one same uploaded appliance', 'clear environmental depth'],
          mustNotHave: ['pets', 'animals', 'second appliance', 'picture-in-picture'],
          composition: 'one wide kitchen or home banner scene',
        });
      default:
        return createDetailSetSlotBlueprint('Supplementary angle or support detail', {
          mustHave: ['one same uploaded appliance', 'faithful alternate angle or support detail'],
          mustNotHave: ['pets', 'animals', 'duplicate appliances', 'unexpected dock or stand'],
          composition: 'one support frame with one product subject only',
        });
    }
  }

  return createDetailSetSlotBlueprint(
    firstNonEmptyString(item.title, item.description, 'Detail scene'),
    {
      mustHave: ['one same uploaded product', 'faithful color, structure, and material identity'],
      mustNotHave: ['pets', 'animals', 'second product', 'collage'],
      composition: item.imageType === 'detail'
        ? 'one clean close-up frame'
        : 'one coherent commercial scene with one product subject only',
      allowedHuman: item.imageType === 'lifestyle' ? 'hands' : 'none',
    },
  );
};

const formatDetailSetRuleList = (label: string, values: string[]) =>
  values.length > 0 ? `${label}: ${values.join('; ')}` : '';

const buildDetailSetHumanGuardrail = (allowedHuman: DetailSetHumanAllowance) => {
  if (allowedHuman === 'hands') {
    return 'If any human presence appears, restrict it to one adult hand or forearm only. Do not show faces, children, full bodies, or extra bystanders.';
  }

  if (allowedHuman === 'partial') {
    return 'If any human presence appears, allow only one partial adult person and keep the uploaded product fully readable. Do not show children, extra bystanders, or crowd scenes.';
  }

  return 'Do not include people, hands, body parts, or human interaction unless the current slot instructions explicitly require them.';
};

const buildDetailSetFoodGuardrail = (allowedFood: boolean, textAllowances: ReturnType<typeof getDetailSetTextAllowances>) => {
  if (allowedFood || textAllowances.food) {
    return 'Only include food, beverages, or ingredients when they are directly required by the current slot instructions. Keep them secondary to the product.';
  }

  return 'Do not add food, beverages, ingredients, dishes, or decorative drinks unless the current slot instructions explicitly require them.';
};

const buildDetailSetProductIdentityGuardrails = (
  item: Pick<DetailSetPlanItem, 'slot' | 'imageType' | 'title' | 'description'>,
  fingerprint?: ProductFingerprint | null,
) => {
  if (!fingerprint) {
    return [];
  }

  const family = getDetailSetStoryboardFamily(fingerprint);
  const lines = [
    `Preserve exact visible colors: ${getColorSummary(fingerprint)}.`,
    `Preserve exact material and finish zones: ${getMaterialSummary(fingerprint)}.`,
    `Preserve exact structural identity: ${getStructureSummary(fingerprint)}.`,
    `Only show accessories or support hardware that are visible in the uploaded product images or explicitly required by the current slot instructions: ${getAccessorySummary(fingerprint)}.`,
    'Do not redesign, simplify, stylize, upscale, shrink, or reinterpret the uploaded product itself.',
    'Do not detach, float, split, mirror, stack, duplicate, or recombine major product assemblies into a synthetic product view.',
    'Do not invent docks, wall mounts, charging stands, baskets, planters, trays, screens, packaging inserts, or optional accessories unless they are visible in the uploaded product images or explicitly required by the current slot instructions.',
  ];

  if (item.imageType === 'detail') {
    lines.push(
      'For a detail-focused image, choose one anchor region or one continuous product area only. Do not merge multiple distant parts or multiple viewpoints into one synthetic close-up.',
      'Keep the original part-to-part connection logic intact even in close-up crops.',
    );
  }

  switch (family) {
    case 'vacuum':
      lines.push(
        'Keep the motor unit, handle, wand, dust bin, and floor head connected in the original relationship unless the uploaded product images clearly show an authentic detachable state.',
        'Preserve the original floor-light or beam logic exactly. Do not multiply, recolor, or reinterpret the floor illumination effect.',
      );
      break;
    case 'projector':
      lines.push(
        'Keep the lens, vents, control layout, and body panels in their original positions. Do not invent screens, remotes, ceiling mounts, or wall hardware unless they are visible in the uploaded product images or explicitly required.',
      );
      break;
    case 'decorPlant':
      lines.push(
        'Keep trunk height, branch spread, canopy density, leaf scale, and pot-to-plant proportion faithful to the uploaded product.',
      );
      break;
    case 'pillow':
      lines.push(
        'Keep the loft, seam placement, edge profile, and textile volume faithful to the uploaded product. Do not reshape it into a different firmness or silhouette.',
      );
      break;
    case 'homeAppliance':
      lines.push(
        'Keep lids, handles, spouts, buttons, vents, bins, and body panels in their original relationship and finish. Do not turn plastic finishes into brushed metal or vice versa.',
      );
      break;
    default:
      break;
  }

  return Array.from(new Set(lines.filter(Boolean)));
};

export const buildDetailSetSlotConstraintText = (
  item: Pick<DetailSetPlanItem, 'slot' | 'imageType' | 'title' | 'description'>,
  fingerprint?: ProductFingerprint | null,
  globalGuidance?: string,
  extraPrompt?: string,
) => {
  const blueprint = getDetailSetSlotBlueprint(item, fingerprint);
  const slotGuidance = resolveDetailSetGuidanceForSlot(globalGuidance, item.slot);
  const combinedText = `${slotGuidance}\n${String(extraPrompt || '').trim()}`.toLowerCase();
  const textAllowances = getDetailSetTextAllowances(combinedText);

  const lines = [
    `Slot purpose: ${blueprint.purpose}.`,
    formatDetailSetRuleList('Must have', blueprint.mustHave),
    formatDetailSetRuleList('Must not have', blueprint.mustNotHave),
    `Composition: ${blueprint.composition}.`,
    ...buildDetailSetProductIdentityGuardrails(item, fingerprint),
    buildDetailSetHumanGuardrail(
      textAllowances.people ? 'partial' : textAllowances.hands ? 'hands' : blueprint.allowedHuman,
    ),
    blueprint.allowedAnimals || textAllowances.animals
      ? 'Only include animals when the current slot instructions explicitly require them, and never let them overpower the product.'
      : 'Do not include pets, animals, dogs, cats, birds, or other creatures unless the current slot instructions explicitly require them.',
    buildDetailSetFoodGuardrail(blueprint.allowedFood, textAllowances),
    'Do not add a second product, second device, alternate colorway, extra lookalike subject, or duplicate copy of the uploaded product.',
  ];

  return lines.filter(Boolean).join('\n');
};

export const buildDetailSetVerificationRequirements = (
  item: Pick<DetailSetPlanItem, 'slot' | 'imageType' | 'title' | 'description'>,
  fingerprint?: ProductFingerprint | null,
  globalGuidance?: string,
  extraPrompt?: string,
) => {
  const blueprint = getDetailSetSlotBlueprint(item, fingerprint);
  const family = getDetailSetStoryboardFamily(fingerprint);
  const slotGuidance = resolveDetailSetGuidanceForSlot(globalGuidance, item.slot);
  const combinedText = `${slotGuidance}\n${String(extraPrompt || '').trim()}`.toLowerCase();
  const textAllowances = getDetailSetTextAllowances(combinedText);
  const mustContain = [...blueprint.mustHave];

  const mustNotContain = [...blueprint.mustNotHave];
  if (!(blueprint.allowedHuman !== 'none' || textAllowances.people || textAllowances.hands)) {
    mustNotContain.push('people', 'hands', 'body parts');
  }
  if (!(blueprint.allowedAnimals || textAllowances.animals)) {
    mustNotContain.push('pets', 'animals', 'dogs', 'cats', 'birds');
  }
  if (!(blueprint.allowedFood || textAllowances.food)) {
    mustNotContain.push('food', 'beverages', 'ingredients');
  }

  mustNotContain.push(
    'duplicate product',
    'extra lookalike subject',
    'split-screen layout',
    'multi-panel collage',
    'picture-in-picture inset',
    'unexpected support hardware',
    'invented accessories not visible in the uploaded product images',
  );

  if (fingerprint) {
    mustContain.push(
      `the original overall shape and proportions: ${fingerprint.structure.overallShape || 'original silhouette'}`,
      `the original visible color palette: ${getColorSummary(fingerprint)}`,
      `the original material finish: ${getMaterialSummary(fingerprint)}`,
    );
  }

  if (item.imageType === 'detail') {
    mustContain.push('one continuous anchor region from the same original product');
    mustNotContain.push('floating detached parts', 'synthetic merged close-up of multiple distant parts');
  }

  switch (family) {
    case 'vacuum':
      mustNotContain.push('unexpected dock station', 'wall mount', 'split wand segments', 'extra brush head', 'multiple green light beams');
      break;
    case 'projector':
      mustNotContain.push('unexpected remote control', 'ceiling mount', 'wall mount', 'second projector');
      break;
    case 'decorPlant':
      mustNotContain.push('changed plant scale relative to pot', 'sparse canopy that changes product identity');
      break;
    case 'pillow':
      mustNotContain.push('different pillow loft', 'different seam placement', 'different textile silhouette');
      break;
    case 'homeAppliance':
      mustNotContain.push('different lid or handle geometry', 'unexpected extra container', 'invented serving accessory');
      break;
    default:
      break;
  }

  return {
    mustContain: Array.from(new Set(mustContain.filter(Boolean))).slice(0, 6),
    mustNotContain: Array.from(new Set(mustNotContain.filter(Boolean))),
  };
};

export const getDetailSetSupplementalReferenceLimit = (
  item: Pick<DetailSetPlanItem, 'imageType' | 'aspectRatio'>,
  fingerprint?: ProductFingerprint | null,
  attempt: number = 0,
) => {
  const isWideBannerItem = item.imageType === 'banner' || item.aspectRatio === '1464x600';
  if (isWideBannerItem) {
    return 0;
  }

  if (item.imageType === 'comparison') {
    return attempt > 0 ? 0 : 1;
  }

  if (item.imageType === 'detail') {
    const family = getDetailSetStoryboardFamily(fingerprint);
    if (attempt > 0) {
      return 0;
    }
    if (family === 'vacuum' || family === 'projector' || family === 'homeAppliance') {
      return 0;
    }
    return 1;
  }

  return attempt > 0 ? 1 : 2;
};

const getSceneProfileV2 = (fingerprint?: ProductFingerprint | null) => {
  const searchText = getSceneSearchTextV2(fingerprint);

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.projector)) {
    return {
      heroEnvironment: 'a premium living-room or home-theater corner with projection glow softly visible in the background',
      usageEnvironment: 'a believable movie-night setup in a bedroom, lounge, or family media room',
      bannerEnvironment: 'a cinematic entertainment interior with visible depth, ambient lighting, and a polished media-space feel',
      lightingStyle: 'layered practical lighting, soft ambient spill, believable shadow falloff, and tasteful highlights on the lens and body',
      propStyling: 'restrained home-entertainment props such as a sofa, side table, remote, throw blanket, or popcorn kept secondary to the product',
      detailStyling: 'Let the lens glass, vent texture, seams, buttons, and ports catch controlled highlights with a premium macro feel',
      comparisonStyling: 'show one full hero angle plus one supporting close-up of the lens, side texture, or control area',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.lighting)) {
    return {
      heroEnvironment: 'a refined interior corner where the lighting effect can visibly shape the surrounding space',
      usageEnvironment: 'a believable home setup such as a bedside table, reading nook, vanity, or dining area',
      bannerEnvironment: 'a layered interior scene where the product light creates atmosphere across foreground and background surfaces',
      lightingStyle: 'soft directional light, visible light bloom where appropriate, gentle shadows, and premium tonal separation',
      propStyling: 'small decor accents such as books, ceramics, linens, or framed art that support the lighting story without clutter',
      detailStyling: 'Emphasize glow quality, surface finish, edge transitions, and craftsmanship while keeping the product shape exact',
      comparisonStyling: 'show one lit context shot plus one closer angle of the lighting effect or product finish',
    };
  }

  if (
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.smallAppliance) ||
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.kitchenware)
  ) {
    return {
      heroEnvironment: 'a premium kitchen or countertop scene with clear styling hierarchy and natural lived-in realism',
      usageEnvironment: 'an active but tidy food-prep or serving moment in a modern kitchen environment',
      bannerEnvironment: 'a wide kitchen composition with layered surfaces, premium materials, and a clear lifestyle story',
      lightingStyle: 'bright but dimensional daylight or studio-natural hybrid light with controlled reflections and clean shadows',
      propStyling: 'tasteful food ingredients, cups, utensils, boards, or linens that feel useful and category-relevant without stealing focus',
      detailStyling: 'Highlight knobs, lids, handles, spouts, texture, finishes, and join lines with tactile, high-clarity detail',
      comparisonStyling: 'show one main countertop view plus one supporting close-up of the key functional area',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.bedding)) {
    return getSceneProfile(fingerprint);
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.beauty)) {
    return {
      heroEnvironment: 'a premium vanity, bathroom, or personal-care setup with clean surfaces and believable routine context',
      usageEnvironment: 'a real beauty or grooming moment such as getting ready, skincare application, or tool-in-use routine',
      bannerEnvironment: 'a wide vanity or spa-like lifestyle scene with polished surfaces, routine cues, and premium self-care atmosphere',
      lightingStyle: 'soft flattering key light, controlled reflections, clean highlights, and refined skin-safe tonal separation',
      propStyling: 'restrained beauty props such as towels, trays, mirrors, cosmetics, or skincare bottles kept secondary to the product',
      detailStyling: 'Highlight applicators, bristles, metal edges, buttons, nozzles, finishes, and tactile grooming details with premium clarity',
      comparisonStyling: 'show one real routine context shot plus one close-up of the functional or crafted area',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.wearable)) {
    return {
      heroEnvironment: 'a premium lifestyle fashion or everyday-carry setting with clean styling and believable daily-life context',
      usageEnvironment: 'a believable on-body or in-use moment such as wearing, carrying, commuting, walking, or getting ready',
      bannerEnvironment: 'a wide editorial composition with wardrobe, travel, or daily-life context while keeping the product easy to read',
      lightingStyle: 'soft editorial daylight, natural skin-friendly contrast, clean shadow shaping, and controlled material highlights',
      propStyling: 'minimal apparel or travel props such as garments, luggage, chairs, mirrors, or entryway elements kept secondary',
      detailStyling: 'Highlight stitching, hardware, fabric, leather grain, trims, soles, fasteners, and wear details with tactile realism',
      comparisonStyling: 'show one lifestyle wearing or carrying angle plus one closer crop that clarifies craftsmanship or fit',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.tech)) {
    return {
      heroEnvironment: 'a modern desk, studio, or lifestyle-tech environment with layered depth and subtle atmospheric polish',
      usageEnvironment: 'a believable work, gaming, music, or creator setup that matches the category',
      bannerEnvironment: 'a wide, premium tech scene with distinct foreground, subject, and background separation',
      lightingStyle: 'crisp directional key light, tasteful rim highlights, controlled reflections, and premium contrast without looking synthetic',
      propStyling: 'supporting tech or desk accessories such as notebooks, screens, cables, plants, or furniture used sparingly',
      detailStyling: 'Emphasize buttons, grills, finishes, edges, interfaces, ports, and precision manufacturing details',
      comparisonStyling: 'show one hero setup angle plus one close-up that makes the product engineering clearer',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.fitnessOutdoor)) {
    return {
      heroEnvironment: 'a modern gym, home workout corner, trail, or outdoor lifestyle setting that clearly matches the category',
      usageEnvironment: 'a believable training, practice, commute, or outdoor-use moment with real energy and category fit',
      bannerEnvironment: 'a wide fitness or outdoor scene with motion cues, layered depth, and strong but believable lifestyle context',
      lightingStyle: 'clean natural or directional athletic lighting with defined edges, realistic contrast, and controlled highlights',
      propStyling: 'restrained supporting props such as towels, mats, shoes, bottles, benches, or outdoor gear used sparingly',
      detailStyling: 'Highlight grips, texture, seams, fasteners, cushioning, adjustment points, and performance materials with tactile clarity',
      comparisonStyling: 'show one active lifestyle angle plus one supporting close-up of the functional or material detail',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.pet)) {
    return {
      heroEnvironment: 'a warm home interior or pet-friendly lifestyle setting where the product clearly belongs',
      usageEnvironment: 'a believable daily moment with the pet naturally interacting with the product in a home environment',
      bannerEnvironment: 'a wide pet-lifestyle composition with cozy home context, layered depth, and a clear product story',
      lightingStyle: 'soft natural interior light, gentle shadow falloff, clean fur-friendly highlights, and practical tonal contrast',
      propStyling: 'minimal pet accessories such as bowls, blankets, toys, or furniture used sparingly and kept secondary to the product',
      detailStyling: 'Highlight fabric, stitching, structure, texture, closures, and durable surfaces with practical realism',
      comparisonStyling: 'show one full pet-use placement view plus one closer crop of the functional or material detail',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.babyKids)) {
    return {
      heroEnvironment: 'a bright nursery, family-safe play area, or caregiving space with clean styling and soft depth',
      usageEnvironment: 'a believable baby, child, or caregiver-use moment that feels safe, warm, and grounded in daily life',
      bannerEnvironment: 'a wide nursery or family-lifestyle frame with layered but calm context and clear product readability',
      lightingStyle: 'soft daylight, gentle shadow shaping, clean highlights, and warm but truthful color separation',
      propStyling: 'restrained nursery or play props such as blankets, books, toys, baskets, or furniture kept secondary to the product',
      detailStyling: 'Highlight padding, texture, closures, safety-related construction, finishes, and touch points with gentle realism',
      comparisonStyling: 'show one warm family-safe context shot plus one closer crop of the practical or tactile detail',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.toolsAutomotive)) {
    return {
      heroEnvironment: 'a clean garage, workshop, utility room, or DIY space with practical context and organized depth',
      usageEnvironment: 'a believable hands-on repair, installation, or maintenance moment appropriate to the product category',
      bannerEnvironment: 'a wide workshop or garage scene with layered tools, surfaces, and practical task storytelling',
      lightingStyle: 'directional utility lighting with crisp edges, realistic shadows, and controlled reflections on metal or plastic surfaces',
      propStyling: 'restrained workshop props such as benches, tool rolls, fasteners, hardware, or vehicle surfaces kept secondary',
      detailStyling: 'Highlight grips, bits, fasteners, gauges, nozzles, joints, switches, and durable materials with functional clarity',
      comparisonStyling: 'show one wider work-context angle plus one closer crop of the operational or crafted detail',
    };
  }

  if (
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.cleaningOrganization) ||
    textIncludesAny(searchText, DETAIL_SET_EXTRA_KEYWORDS.vacuum)
  ) {
    return {
      heroEnvironment: 'a clean home utility, laundry, kitchen, or entryway setup with natural household context',
      usageEnvironment: 'a believable everyday cleaning, laundry, or organization moment in a real home environment',
      bannerEnvironment: 'a bright practical household scene with layered context and clear product usefulness',
      lightingStyle: 'clean daylight with honest contrast, soft shadow gradients, and practical material rendering',
      propStyling: 'minimal household props such as towels, baskets, linens, containers, or cleaning supplies kept secondary',
      detailStyling: 'Highlight handles, bins, bristles, lids, compartments, seams, and functional surfaces with practical realism',
      comparisonStyling: 'show one full home-use view plus one closer crop of the functional area or storage detail',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.officeCraft)) {
    return {
      heroEnvironment: 'a clean desk, home office, study corner, or maker workspace with layered but controlled context',
      usageEnvironment: 'a believable work, study, planning, printing, or crafting moment that clearly fits the product',
      bannerEnvironment: 'a wide desk or workspace composition with depth, organized styling, and useful commercial clarity',
      lightingStyle: 'bright directional desk light or daylight with crisp edges, gentle contrast, and controlled reflections',
      propStyling: 'restrained desk or maker props such as notebooks, paper, tools, trays, or screens kept secondary to the product',
      detailStyling: 'Highlight surfaces, controls, edges, mechanisms, material finish, and practical touch points with precise clarity',
      comparisonStyling: 'show one wider workspace angle plus one closer crop that clarifies utility or construction',
    };
  }

  if (
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.decorPlacement) ||
    textIncludesAny(searchText, DETAIL_SET_EXTRA_KEYWORDS.decorPlant)
  ) {
    return {
      heroEnvironment: 'a premium interior styling corner with tasteful furniture, layered decor, and clear product placement',
      usageEnvironment: 'a believable home decor placement such as a console, shelf, dining table, or living-room corner',
      bannerEnvironment: 'a wide interior decor scene with styled surfaces, layered depth, and elegant botanical placement',
      lightingStyle: 'soft natural interior light with believable shadow falloff, subtle highlights, and refined tonal separation',
      propStyling: 'restrained home decor props such as books, candles, ceramics, frames, or trays that support a styled-placement story',
      detailStyling: 'Highlight leaf texture, petal layering, pot finish, arrangement density, and crafted botanical realism',
      comparisonStyling: 'show one full decor placement view plus one supporting close-up of foliage, petals, or pot craftsmanship',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.furnitureStorage)) {
    return {
      heroEnvironment: 'a thoughtfully styled interior that feels aspirational but still believable for daily living',
      usageEnvironment: 'a real home scenario where the product naturally supports organization, comfort, or decor',
      bannerEnvironment: 'a wide editorial home scene with foreground styling, clear depth, and layered interiors',
      lightingStyle: 'soft natural daylight or premium interior light with realistic shadow shaping and gentle contrast',
      propStyling: 'books, textiles, trays, ceramics, or small home accessories used in a restrained styling language',
      detailStyling: 'Highlight texture, stitching, seams, edge quality, grain, surfaces, and structural finish with tactile realism',
      comparisonStyling: 'show one styled room view plus one closer crop that demonstrates surface or structural quality',
    };
  }

  return getSceneProfile(fingerprint);
};

const getHumanSceneDirectivesV2 = (fingerprint?: ProductFingerprint | null) => {
  const searchText = getSceneSearchTextV2(fingerprint);
  const family = getDetailSetStoryboardFamily(fingerprint);

  if (family === 'vacuum') {
    return {
      hero: 'Do not add people, hands, pets, or body parts unless the current slot explicitly asks for active use.',
      usage: 'If human presence is needed, allow only one partial adult user or hands and keep the vacuum fully readable. Do not include pets or children.',
      banner: 'Do not introduce people, pets, or body parts unless the current slot explicitly asks for them.',
    };
  }

  if (family === 'pillow') {
    return {
      hero: 'Keep the hero frame product-led. Do not add people or pets unless the current slot explicitly asks for a comfort-use scene.',
      usage: 'If human presence is needed, allow only one partial adult user and keep the pillow shape, volume, and fabric clearly visible. Do not include pets or children.',
      banner: 'Keep the banner product-led and avoid extra people or pets unless the current slot explicitly requires them.',
    };
  }

  if (family === 'projector') {
    return {
      hero: 'Do not add people, hands, pets, or body parts. Tell the story through the room setup and projection atmosphere only.',
      usage: 'Do not add people or pets unless the current slot explicitly requires a hand-held accessory or control action.',
      banner: 'Do not add people, hands, pets, or body parts. Keep the banner focused on the device and projection environment.',
    };
  }

  if (family === 'homeAppliance') {
    return {
      hero: 'Keep the hero frame product-led. Do not add people, hands, pets, or body parts unless the current slot explicitly requires use action.',
      usage: 'If human presence is needed, restrict it to one adult hand or forearm only. Do not add pets, children, or extra people.',
      banner: 'Keep the banner product-led. Do not add people, hands, or pets unless the current slot explicitly requires them.',
    };
  }

  if (
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.decorPlacement) ||
    textIncludesAny(searchText, DETAIL_SET_EXTRA_KEYWORDS.decorPlant)
  ) {
    return {
      hero: 'Do not include people, hands, or body parts. Tell the lifestyle story through interior placement, decor styling, and spatial atmosphere only.',
      usage: 'Keep this as a styled placement scene only. Do not show people, hands, or human interaction with the product.',
      banner: 'Do not introduce people, hands, or body parts. Keep the banner focused on elegant placement and decor storytelling only.',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.pet)) {
    return {
      hero: 'Prefer a believable pet-lifestyle setup with the product naturally used by a dog or cat. Human presence should stay secondary if shown at all.',
      usage: 'Show a real pet using or interacting with the product. Prioritize the pet-product relationship over a product-only still life.',
      banner: 'Use a wider pet-lifestyle story with a believable pet interaction so the frame feels like real use instead of staged placement only.',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.babyKids)) {
    return {
      hero: 'Prefer a family-safe lifestyle scene with a baby, child, or caregiver naturally interacting with the product while keeping the product clearly readable.',
      usage: 'Show a believable child-use or caregiver-use moment, such as feeding, carrying, play, or nursery interaction. Avoid making every frame a product-only setup.',
      banner: 'Use a wider nursery or family-lifestyle scene with natural caregiver or child interaction so the frame feels warm and practical.',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.bedding)) {
    return getHumanSceneDirectives(fingerprint);
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.wearable)) {
    return {
      hero: 'Prefer an on-body or in-hand lifestyle setup so the product reads as worn, carried, or styled in real life rather than laid out as a flat still life.',
      usage: 'Explicitly show the product being worn, carried, opened, or handled by a person or partial body. Avoid making every frame a product-only display.',
      banner: 'Use a wider lifestyle story with visible wearing, carrying, or in-hand use so the frame feels editorial but still commerce-friendly.',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.beauty)) {
    return {
      hero: 'Prefer a believable beauty or personal-care routine with visible hands, face, or partial body naturally using the product while keeping the product dominant.',
      usage: 'Explicitly show a real self-care moment such as applying, grooming, drying, trimming, or holding the product. Avoid turning every frame into a static countertop still life.',
      banner: 'Use a wider self-care routine story with visible human interaction so the banner feels like real use instead of a product-only vanity shot.',
    };
  }

  if (includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.fitnessOutdoor)) {
    return {
      hero: 'Prefer a believable active-use setup with a person wearing, holding, training with, or preparing to use the product while keeping the product clearly readable.',
      usage: 'Show a real workout, sports, commute, or outdoor-use moment with visible human interaction. Avoid making every frame a static equipment display.',
      banner: 'Use a wider lifestyle story with real active use so the banner feels energetic and practical instead of purely staged.',
    };
  }

  if (
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.smallAppliance) ||
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.kitchenware) ||
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.tech) ||
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.toolsAutomotive) ||
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.cleaningOrganization) ||
    textIncludesAny(searchText, DETAIL_SET_EXTRA_KEYWORDS.vacuum) ||
    includesAnyCategoryKeyword(searchText, DETAIL_SET_CATEGORY_KEYWORDS.officeCraft)
  ) {
    return {
      hero: 'Prefer a believable human-use setup with hands or a partial person naturally interacting with the product, while keeping the product dominant and fully recognizable.',
      usage: 'Explicitly show a real usage moment with visible hands or a partial person using, holding, operating, or interacting with the product. Avoid turning this into a product-only still life.',
      banner: 'Use a wider lifestyle story with human interaction, such as hands in use or a partial person in frame, so the banner feels like real life instead of a static product display.',
    };
  }

  return getHumanSceneDirectives(fingerprint);
};

const isDetailSetDecorPlacementCategory = (fingerprint?: ProductFingerprint | null) =>
  includesAnyCategoryKeyword(getSceneSearchTextV2(fingerprint), DETAIL_SET_CATEGORY_KEYWORDS.decorPlacement)
  || textIncludesAny(getSceneSearchTextV2(fingerprint), DETAIL_SET_EXTRA_KEYWORDS.decorPlant);

export const buildDetailSetGenerationGuardrails = (
  item: DetailSetPlanItem,
  fingerprint?: ProductFingerprint | null,
  globalGuidance?: string,
  extraPrompt?: string,
) => {
  const isWideBannerItem = item.imageType === 'banner' || item.aspectRatio === '1464x600';
  const isComparisonItem = item.imageType === 'comparison';

  const guardrails = isComparisonItem
    ? [
        'This is the only slot in the detail set that may use a structured comparison-style layout.',
        'If you use multiple panels, every panel must show only the same uploaded product in faithful views.',
        'Do not create a moodboard, collage of unrelated rooms, tiled contact sheet, or multiple different products in the same output.',
      ]
    : [
        'Render one coherent full-frame scene only.',
        'Do not use collage, split-screen, diptych, triptych, multi-panel layout, tiled grid, storyboard, contact sheet, picture-in-picture, inset close-up, moodboard, or comparison layout.',
        'Do not place multiple separate framed scenes or multiple cropped mini-images inside the final image.',
      ];

  if (isWideBannerItem) {
    guardrails.push(
      'Exactly one complete product subject may appear in the final banner.',
      'Do not place multiple copies, multiple color variants, side-by-side products, or comparison layouts in the same frame.',
      'Use supplemental product images only to understand the same single product identity, never as additional visible subjects.',
    );
  } else if (!isComparisonItem) {
    guardrails.push(
      'Keep one faithful primary product subject focus in the frame.',
      'Do not duplicate the product into multiple separated copies, multiple rooms, or multiple mini-scenes.',
    );
  }

  if (isDetailSetDecorPlacementCategory(fingerprint)) {
    guardrails.push(
      'Do not include pets, animals, dogs, cats, birds, people, hands, or body parts anywhere in the frame.',
      'Keep the scene focused on elegant interior placement and decor storytelling only.',
    );
  }

  guardrails.push(buildDetailSetSlotConstraintText(item, fingerprint, globalGuidance, extraPrompt));

  return guardrails;
};

const getVisualIdentityNotes = (fingerprint?: ProductFingerprint | null): string => {
  const notes = [
    `Preserve the exact product structure: ${getStructureSummary(fingerprint)}.`,
    `Preserve the visible color palette: ${getColorSummary(fingerprint)}.`,
    `Preserve the material expression: ${getMaterialSummary(fingerprint)}.`,
    `Preserve accessory logic: ${getAccessorySummary(fingerprint)}.`,
  ];

  if (fingerprint?.logo?.hasLogo) {
    const logoText = fingerprint.logo.text ? `"${fingerprint.logo.text}"` : 'the original logo';
    const logoPosition = fingerprint.logo.position || 'its original position';
    notes.push(`Keep ${logoText} in ${logoPosition} with faithful scale, style, and placement.`);
  }

  return notes.join(' ');
};

const getSceneRichnessNotes = (sceneProfile: ReturnType<typeof getSceneProfile>): string => {
  return `Build clear foreground, subject, and background depth. Use ${sceneProfile.lightingStyle}. Add ${sceneProfile.propStyling}. Avoid flat, empty, or repetitive white-background outputs unless the shot is intentionally a close-up detail frame.`;
};

const appendGuidance = (basePrompt: string, globalGuidance?: string, slot?: number): string => {
  const guidance = slot
    ? resolveDetailSetGuidanceForSlot(globalGuidance, slot)
    : (globalGuidance || '').trim();
  if (!guidance) {
    return basePrompt;
  }

  return `${basePrompt}\nAdditional global guidance for this detail set: ${guidance}`;
};

const buildAmazonPlan = (
  fingerprint?: ProductFingerprint | null,
  globalGuidance?: string
): DetailSetPlanItem[] => {
  const productName = getProductName(fingerprint);
  const category = getCategory(fingerprint);
  const keyParts = getKeyParts(fingerprint);
  const distinctiveFeatures = getDistinctiveFeatures(fingerprint);
  const sceneProfile = getSceneProfileV2(fingerprint);
  const humanSceneDirectives = getHumanSceneDirectivesV2(fingerprint);
  const visualIdentityNotes = getVisualIdentityNotes(fingerprint);
  const sceneRichnessNotes = getSceneRichnessNotes(sceneProfile);

  return [
    {
      id: 'amazon-hero',
      slot: 1,
      title: 'Hero Lifestyle',
      description: 'Clean hero scene that quickly explains what the product is and where it belongs.',
      aspectRatio: '3:4',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'premium',
      sceneStrictness: 'strict',
      productTitle: `Hero lifestyle showcase for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a highly usable Amazon hero detail image for ${category}. Show ${productName} as the clear hero product in ${sceneProfile.heroEnvironment}. ${humanSceneDirectives.hero} Use a shopper-friendly three-quarter angle, premium set styling, and enough environmental storytelling to feel rich without becoming busy. ${sceneRichnessNotes} ${visualIdentityNotes} Make the product instantly understandable within one glance and keep the frame strongly conversion-oriented.`,
        globalGuidance,
        1
      ),
    },
    {
      id: 'amazon-detail',
      slot: 2,
      title: 'Structure Detail',
      description: 'Close-up view focused on product construction and signature physical details.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'tech',
      sceneStrictness: 'strict',
      productTitle: `Close-up structure detail for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a close-up Amazon commercial detail image focused on ${keyParts}. Choose one anchor detail only and keep it attached to the same physical product body. Use a tight but faithful crop, clean background treatment, and clarity that explains the real structure without inventing extra parts or merging distant viewpoints. ${sceneProfile.detailStyling}. ${visualIdentityNotes} Preserve exact materials, edges, buttons, openings, and all structural identity while keeping the image retail-ready.`,
        globalGuidance,
        2
      ),
    },
    {
      id: 'amazon-use-case',
      slot: 3,
      title: 'Use Scenario',
      description: 'Believable usage context tailored to the product category.',
      aspectRatio: '4:3',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'natural',
      sceneStrictness: 'loose',
      productTitle: `Real usage context for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Show ${productName} in ${sceneProfile.usageEnvironment} for a ${category}. ${humanSceneDirectives.usage} Make the scene feel believable, lived-in, and visually distinct from the hero shot with more context, deeper layering, and a stronger sense of real use. ${sceneRichnessNotes} ${visualIdentityNotes} The product must remain dominant and never be obscured by the environment.`,
        globalGuidance,
        3
      ),
    },
    {
      id: 'amazon-material',
      slot: 4,
      title: 'Feature Focus',
      description: 'High-clarity shot that highlights texture, finish, and build quality.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'premium',
      sceneStrictness: 'strict',
      productTitle: `Build quality highlight for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Highlight the product's finish, craftsmanship, and material quality. Emphasize ${distinctiveFeatures}. Use a premium but faithful angle, controlled surface contrast, and tactile detail without reinterpreting the original material, paint, or texture zones. ${sceneProfile.detailStyling}. ${visualIdentityNotes} Avoid abstract styling and keep the result dimensional, premium, and commercially useful without redesigning the product.`,
        globalGuidance,
        4
      ),
    },
    {
      id: 'amazon-banner',
      slot: 5,
      title: 'A+ Wide Banner',
      description: 'Wide-format detail image suited for Amazon A+ modules and header sections.',
      aspectRatio: '1464x600',
      imageType: 'banner',
      mode: 'lifestyle_listing',
      commercialTone: 'premium',
      sceneStrictness: 'loose',
      productTitle: `Wide e-commerce banner for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a wide Amazon-ready banner composition for ${productName} in ${sceneProfile.bannerEnvironment}. ${humanSceneDirectives.banner} Use cinematic width, clean negative space for future layout use, and richer environmental depth than a standard product card. ${sceneRichnessNotes} ${visualIdentityNotes} Keep the product visually dominant while avoiding an empty or lifeless composition.`,
        globalGuidance,
        5
      ),
    },
    {
      id: 'amazon-angle',
      slot: 6,
      title: 'Supplementary Angle',
      description: 'Supporting angle that completes a six-image Amazon gallery with more structure clarity.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'tech',
      sceneStrictness: 'strict',
      productTitle: `Supplementary angle view for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create an additional Amazon gallery image that shows ${productName} from a different but faithful angle. Emphasize product scale, silhouette clarity, and secondary details around ${keyParts}. Keep one complete product subject only. Do not use multi-view composition, split layout, accessory invention, or comparison-panel styling. ${visualIdentityNotes} This frame should feel like a useful sixth gallery image instead of a duplicate of the previous detail shots.`,
        globalGuidance,
        6
      ),
    },
  ];
};

const buildOtherPlan = (
  fingerprint?: ProductFingerprint | null,
  globalGuidance?: string
): DetailSetPlanItem[] => {
  const productName = getProductName(fingerprint);
  const category = getCategory(fingerprint);
  const keyParts = getKeyParts(fingerprint);
  const distinctiveFeatures = getDistinctiveFeatures(fingerprint);
  const sceneProfile = getSceneProfileV2(fingerprint);
  const humanSceneDirectives = getHumanSceneDirectivesV2(fingerprint);
  const visualIdentityNotes = getVisualIdentityNotes(fingerprint);
  const sceneRichnessNotes = getSceneRichnessNotes(sceneProfile);

  return [
    {
      id: 'other-hero',
      slot: 1,
      title: 'Universal Hero',
      description: 'High-clarity hero shot for generic marketplace and standalone PDP usage.',
      aspectRatio: '3:4',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'premium',
      sceneStrictness: 'strict',
      productTitle: `Universal hero shot for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a clean, high-conversion hero image for ${productName}. The frame should work across multiple marketplaces or standalone PDP layouts. Place the product in ${sceneProfile.heroEnvironment}. ${humanSceneDirectives.hero} ${sceneRichnessNotes} ${visualIdentityNotes} Keep the image rich and dimensional, but easy to understand at a glance.`,
        globalGuidance,
        1
      ),
    },
    {
      id: 'other-detail',
      slot: 2,
      title: 'Feature Detail',
      description: 'Close-up detail frame for structure, finish, and craftsmanship.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'tech',
      sceneStrictness: 'strict',
      productTitle: `Feature detail for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a universal feature-detail image for ${productName}. Visually emphasize ${keyParts} through one anchor detail, controlled crop, and faithful lighting rather than relying on text. Do not merge multiple distant parts into one synthetic close-up. ${sceneProfile.detailStyling}. ${visualIdentityNotes} Make the frame crisp, premium, and useful for feature sections or gallery modules without redesigning the product.`,
        globalGuidance,
        2
      ),
    },
    {
      id: 'other-lifestyle',
      slot: 3,
      title: 'Lifestyle Scenario',
      description: 'Believable use-case frame that adds context without overwhelming the product.',
      aspectRatio: '4:3',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'natural',
      sceneStrictness: 'loose',
      productTitle: `Lifestyle scenario for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Place ${productName} in ${sceneProfile.usageEnvironment} appropriate for a ${category}. ${humanSceneDirectives.usage} The scene should feel believable, useful, and broadly applicable across generic e-commerce detail pages. ${sceneRichnessNotes} ${visualIdentityNotes}`,
        globalGuidance,
        3
      ),
    },
    {
      id: 'other-banner',
      slot: 4,
      title: 'Wide PDP Banner',
      description: 'Wide compositional frame for branded sections, A+ style areas, or PDP headers.',
      aspectRatio: '1464x600',
      imageType: 'banner',
      mode: 'lifestyle_listing',
      commercialTone: 'premium',
      sceneStrictness: 'loose',
      productTitle: `Wide PDP banner for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a wide, premium PDP banner for ${productName}. Use a richer, more brand-friendly composition that still feels grounded and usable across generic e-commerce modules. ${humanSceneDirectives.banner} Emphasize ${distinctiveFeatures}. ${sceneRichnessNotes} ${visualIdentityNotes} Keep the product dominant while leaving sensible breathing room for future layout usage.`,
        globalGuidance,
        4
      ),
    },
    {
      id: 'other-closeup',
      slot: 5,
      title: 'Craft Detail',
      description: 'Additional close-up frame for texture, craftsmanship, and signature product details.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'premium',
      sceneStrictness: 'strict',
      productTitle: `Craft detail for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create an additional close-up product detail image for ${productName}. Focus on ${distinctiveFeatures} and reveal premium tactile quality with refined but faithful lighting and clean background control. Stay close to the original material and finish zones, and avoid inventing accessories or detached product fragments. ${sceneProfile.detailStyling}. ${visualIdentityNotes} The frame should work as a flexible fifth gallery card across multiple platforms.`,
        globalGuidance,
        5
      ),
    },
    {
      id: 'other-angle',
      slot: 6,
      title: 'Support Angle',
      description: 'Alternate-angle support frame for completing a clean six-image product gallery.',
      aspectRatio: '3:4',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'clean',
      sceneStrictness: 'strict',
      productTitle: `Support angle for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a supplementary gallery image for ${productName} that uses a faithful alternate angle and a cleaner environment than the main hero shot. Keep one complete product subject, clearer silhouette readability, and enough context to feel commercial but not repetitive. ${sceneRichnessNotes} ${visualIdentityNotes}`,
        globalGuidance,
        6
      ),
    },
  ];
};

const buildWalmartPlan = (
  fingerprint?: ProductFingerprint | null,
  globalGuidance?: string
): DetailSetPlanItem[] => {
  const productName = getProductName(fingerprint);
  const category = getCategory(fingerprint);
  const keyParts = getKeyParts(fingerprint);
  const distinctiveFeatures = getDistinctiveFeatures(fingerprint);
  const sceneProfile = getSceneProfileV2(fingerprint);
  const humanSceneDirectives = getHumanSceneDirectivesV2(fingerprint);
  const visualIdentityNotes = getVisualIdentityNotes(fingerprint);
  const sceneRichnessNotes = getSceneRichnessNotes(sceneProfile);

  return [
    {
      id: 'walmart-hero',
      slot: 1,
      title: 'Trustworthy Hero',
      description: 'Clean, family-safe hero image focused on clarity and mainstream retail appeal.',
      aspectRatio: '3:4',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'clean',
      sceneStrictness: 'strict',
      productTitle: `Retail hero image for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a Walmart-friendly retail hero image for ${productName}. Keep the scene bright, clear, safe, and broadly appealing, but avoid a sterile or overly plain setup. Place the product in ${sceneProfile.heroEnvironment}. ${humanSceneDirectives.hero} ${sceneRichnessNotes} ${visualIdentityNotes} The product should feel dependable, practical, and easy to understand for everyday shoppers.`,
        globalGuidance,
        1
      ),
    },
    {
      id: 'walmart-detail',
      slot: 2,
      title: 'Value Detail',
      description: 'Close-up that highlights practical build quality and visible value.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'tech',
      sceneStrictness: 'strict',
      productTitle: `Practical detail highlight for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a practical Walmart detail image focused on ${keyParts}. Make the product feel sturdy, useful, and honest with a tactile close-up, visible material fidelity, and stronger dimensional lighting than a plain white-box shot. ${sceneProfile.detailStyling}. ${visualIdentityNotes} Avoid luxury styling or abstract framing.`,
        globalGuidance,
        2
      ),
    },
    {
      id: 'walmart-lifestyle',
      slot: 3,
      title: 'Everyday Use Scene',
      description: 'Helpful real-world scenario that demonstrates easy everyday use.',
      aspectRatio: '3:4',
      imageType: 'lifestyle',
      mode: 'lifestyle_listing',
      commercialTone: 'natural',
      sceneStrictness: 'strict',
      productTitle: `Everyday use context for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Show ${productName} in ${sceneProfile.usageEnvironment} for a ${category}. ${humanSceneDirectives.usage} The environment should feel useful and realistic with strong shopper clarity, but still include enough spatial depth and styling to avoid looking repetitive. ${sceneRichnessNotes} ${visualIdentityNotes}`,
        globalGuidance,
        3
      ),
    },
    {
      id: 'walmart-comparison',
      slot: 4,
      title: 'Comparison Panel',
      description: 'Structured value comparison layout using only faithful views of the same product.',
      aspectRatio: '3:4',
      imageType: 'comparison',
      mode: 'infographic_listing',
      commercialTone: 'tech',
      sceneStrictness: 'strict',
      productTitle: `Comparison panel for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a clear Walmart comparison-style panel using only the same uploaded product. ${sceneProfile.comparisonStyling}. Highlight practical benefits, visible function, and shopper value without introducing unrelated variants. ${visualIdentityNotes} Keep the layout trustworthy, useful, and visually well-structured.`,
        globalGuidance,
        4
      ),
    },
    {
      id: 'walmart-banner',
      slot: 5,
      title: 'Retail Wide Banner',
      description: 'Wide retail-ready frame for module headers, feature sections, or page highlights.',
      aspectRatio: '1464x600',
      imageType: 'banner',
      mode: 'lifestyle_listing',
      commercialTone: 'clean',
      sceneStrictness: 'loose',
      productTitle: `Retail banner for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a wide Walmart-friendly banner for ${productName}. Use a clear, practical, family-safe environment with enough depth and atmosphere to feel polished without becoming premium-luxury. ${humanSceneDirectives.banner} ${sceneRichnessNotes} ${visualIdentityNotes} Keep the product easy to read and suitable for broad retail modules.`,
        globalGuidance,
        5
      ),
    },
    {
      id: 'walmart-feature',
      slot: 6,
      title: 'Helpful Feature Close-up',
      description: 'Supplementary close-up that clearly reinforces materials, structure, and real value.',
      aspectRatio: '1:1',
      imageType: 'detail',
      mode: 'infographic_listing',
      commercialTone: 'clean',
      sceneStrictness: 'strict',
      productTitle: `Helpful close-up for ${productName}`,
      copyText: '',
      customPrompt: appendGuidance(
        `Create a helpful retail close-up for ${productName} that reinforces value, durability, and clarity. Emphasize ${distinctiveFeatures} and keep the framing simple, trustworthy, and shopper-friendly. ${sceneProfile.detailStyling}. ${visualIdentityNotes} This should feel like a useful sixth image in a mainstream retail gallery.`,
        globalGuidance,
        6
      ),
    },
  ];
};

export const createDetailSetPlan = ({
  platform,
  fingerprint,
  globalGuidance,
}: {
  platform: DetailSetPlatform;
  fingerprint?: ProductFingerprint | null;
  globalGuidance?: string;
}): DetailSetPlanItem[] => {
  switch (platform) {
    case 'walmart':
      return buildWalmartPlan(fingerprint, globalGuidance);
    case 'other':
      return buildOtherPlan(fingerprint, globalGuidance);
    case 'amazon':
    default:
      return buildAmazonPlan(fingerprint, globalGuidance);
  }
};
