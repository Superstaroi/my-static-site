import type { ProductFingerprint } from '../types/domain';
import { env } from '../config/env';
import { HttpError } from '../utils/http';
import { assertImagePayload, assertOptionalImageArray } from '../utils/imagePayload';
import { extractOpenAiJsonObject, extractOpenAiResponseText, postOpenAiResponses } from '../utils/openai';
import { generateStructuredJsonWithGemini } from './geminiService';

const normalizeString = (value: unknown) => String(value || '').trim();

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) {
      return normalized;
    }
  }

  return '';
};

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(item => normalizeString(item)).filter(Boolean);
};

const normalizeBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'true') return true;
    if (value.trim().toLowerCase() === 'false') return false;
  }
  return fallback;
};

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const uniqueStrings = (values: unknown[]) => {
  const seen = new Set<string>();
  const next: string[] = [];

  values.forEach(value => {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    next.push(normalized);
  });

  return next;
};

const normalizeProductFingerprint = (value: any, displayZh?: any): ProductFingerprint => {
  const normalized: ProductFingerprint = {
    category: firstNonEmptyString(value?.category, value?.productType, value?.type, displayZh?.category),
    productSummary: firstNonEmptyString(value?.productSummary, value?.summary, displayZh?.productSummary),
    colors: Array.isArray(value?.colors)
      ? value.colors
          .map((item: any) => ({
            name: normalizeString(item?.name),
            hex: normalizeString(item?.hex) || undefined,
            area: item?.area === 'secondary' || item?.area === 'accent' ? item.area : 'primary',
            mustPreserve: normalizeBoolean(item?.mustPreserve, true),
          }))
          .filter((item: any) => item.name)
      : [],
    materials: Array.isArray(value?.materials)
      ? value.materials
          .map((item: any) => ({
            name: normalizeString(item?.name),
            location: normalizeString(item?.location),
            finish: normalizeString(item?.finish) || undefined,
            mustPreserve: normalizeBoolean(item?.mustPreserve, true),
          }))
          .filter((item: any) => item.name && item.location)
      : [],
    structure: {
      overallShape: normalizeString(value?.structure?.overallShape),
      keyParts: normalizeStringArray(value?.structure?.keyParts),
      proportions: normalizeString(value?.structure?.proportions) || undefined,
      visibleControls: normalizeStringArray(value?.structure?.visibleControls),
      openings: normalizeStringArray(value?.structure?.openings),
      distinctiveFeatures: normalizeStringArray(value?.structure?.distinctiveFeatures),
    },
    accessories: Array.isArray(value?.accessories)
      ? value.accessories
          .map((item: any) => ({
            name: normalizeString(item?.name),
            count: Math.max(0, normalizeNumber(item?.count, 1)),
            position: normalizeString(item?.position),
            attached: normalizeBoolean(item?.attached, true),
            mustPreserve: normalizeBoolean(item?.mustPreserve, true),
          }))
          .filter((item: any) => item.name && item.position)
      : [],
    logo: {
      hasLogo: normalizeBoolean(value?.logo?.hasLogo, false),
      text: normalizeString(value?.logo?.text) || undefined,
      position: normalizeString(value?.logo?.position) || undefined,
      color: normalizeString(value?.logo?.color) || undefined,
      shape: normalizeString(value?.logo?.shape) || undefined,
      mustPreserve: normalizeBoolean(value?.logo?.mustPreserve, false),
    },
    forbiddenChanges: normalizeStringArray(value?.forbiddenChanges),
    verifierChecklist: normalizeStringArray(value?.verifierChecklist),
    confidence: Math.max(0, Math.min(100, normalizeNumber(value?.confidence, 0))),
  };

  const fallbackKeyParts = uniqueStrings([
    ...normalized.structure.keyParts,
    ...(normalized.structure.visibleControls || []),
    ...(normalized.structure.openings || []),
    ...normalized.structure.distinctiveFeatures,
    ...normalized.accessories.map(item => item.name),
    normalized.logo.text,
    normalized.category,
  ]).slice(0, 8);

  if (!normalized.structure.keyParts.length) {
    normalized.structure.keyParts = fallbackKeyParts.length > 0 ? fallbackKeyParts : ['main product body'];
  }

  if (!normalized.structure.overallShape) {
    normalized.structure.overallShape =
      firstNonEmptyString(
        value?.structure?.shape,
        value?.structure?.form,
        displayZh?.structure?.overallShape,
        normalized.structure.keyParts[0],
        normalized.category,
        'main product body',
      );
  }

  if (!normalized.productSummary) {
    normalized.productSummary = firstNonEmptyString(
      displayZh?.productSummary,
      [normalized.category, normalized.structure.overallShape].filter(Boolean).join(', '),
      'Uploaded product',
    );
  }

  if (!normalized.category) {
    normalized.category = firstNonEmptyString(displayZh?.category, normalized.structure.keyParts[0], 'product');
  }

  if (!normalized.forbiddenChanges.length) {
    normalized.forbiddenChanges = [
      'change the product body structure',
      'replace the uploaded product with a different product',
    ];
  }

  if (!normalized.verifierChecklist.length) {
    normalized.verifierChecklist = uniqueStrings([
      `Match category: ${normalized.category}`,
      `Keep overall shape: ${normalized.structure.overallShape}`,
      `Keep key parts: ${normalized.structure.keyParts.slice(0, 4).join(', ')}`,
    ]).filter(Boolean);
  }

  if (normalized.confidence <= 0) {
    normalized.confidence = 60;
  }

  return normalized;
};

const getOpenAiFingerprintModels = () =>
  [env.openAiAnalysisModel, env.openAiIdentityFallbackModel]
    .map(model => model.trim())
    .filter((model, index, models) => Boolean(model) && models.indexOf(model) === index);

export const analyzeProductFingerprintWithOpenAi = async (
  mainImageBase64: { data: string; mimeType: string },
  supplementalImagesBase64: { data: string; mimeType: string }[] = [],
  signal?: AbortSignal,
): Promise<{ canonicalEn: ProductFingerprint; displayZh: any }> => {
  const safeMainImage = assertImagePayload(mainImageBase64, '主产品图');
  const safeSupplementalImages = assertOptionalImageArray(supplementalImagesBase64, '补充产品图');

  if (!env.openAiApiKey) {
    throw new HttpError(503, 'OPENAI_NOT_CONFIGURED', '产品特征提取服务尚未在服务器端配置。');
  }

  const images = [safeMainImage, ...safeSupplementalImages];
  const prompt = `
    You are a high-precision product fingerprint extraction system for e-commerce image generation.
    The first image is the main uploaded product image. Any following images are supplemental views of the exact same physical product.

    Return JSON only with this top-level shape:
    {
      "canonicalEn": { ...english fingerprint... },
      "displayZh": { ...same meaning in Chinese... }
    }

    Required canonicalEn fields:
    category, productSummary, colors, materials, structure, accessories, logo, forbiddenChanges, verifierChecklist, confidence

    Rules:
    - canonicalEn must use English values.
    - displayZh must preserve the same structure and meaning in Chinese.
    - Focus on real uploaded product identity, not a generic category template.
    - Do not hallucinate unseen details.
  `;

  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: prompt },
    ...images.map(image => ({
      type: 'input_image',
      image_url: `data:${image.mimeType};base64,${image.data}`,
    })),
  ];

  let lastError: unknown;
  for (const model of getOpenAiFingerprintModels()) {
    try {
      const responseJson = await postOpenAiResponses({
        model,
        input: [
          {
            role: 'user',
            content,
          },
        ],
        maxOutputTokens: 3200,
        timeoutMs: 60000,
        signal,
        actionLabel: '产品特征提取',
      });
      const outputText = extractOpenAiResponseText(responseJson);
      if (!outputText) {
        throw new Error('产品特征提取返回为空，请稍后重试。');
      }

      const parsed = extractOpenAiJsonObject(outputText);
      const canonicalSource =
        parsed?.canonicalEn && typeof parsed.canonicalEn === 'object'
          ? parsed.canonicalEn
          : parsed;

      return {
        canonicalEn: normalizeProductFingerprint(canonicalSource, parsed?.displayZh),
        displayZh: parsed?.displayZh,
      };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      lastError = error;
    }
  }

  throw new HttpError(
    502,
    'OPENAI_FINGERPRINT_FAILED',
    lastError instanceof Error ? lastError.message : '产品特征提取失败，请稍后重试。',
  );
};

export const updateFingerprintFromTextDraft = async (
  draftText: string,
  currentFingerprint: ProductFingerprint,
  signal?: AbortSignal,
) => {
  const normalizedDraft = draftText.trim();
  if (!normalizedDraft) {
    throw new HttpError(400, 'INVALID_FINGERPRINT_DRAFT', '特征草稿不能为空。');
  }

  const schema = {
    type: 'object',
    properties: {
      canonicalEn: { type: 'object' },
      displayZh: { type: 'object' },
    },
    required: ['canonicalEn'],
  };

  const prompt = `
    You are editing an existing product fingerprint based on a user's text draft.
    Keep the same semantic schema and return strict JSON only.

    Current fingerprint JSON:
    ${JSON.stringify(currentFingerprint, null, 2)}

    User draft:
    ${normalizedDraft}

    Output:
    {
      "canonicalEn": { ...updated fingerprint in English... },
      "displayZh": { ...optional Chinese display version... }
    }
  `;

  const rawResult = await generateStructuredJsonWithGemini(
    prompt,
    [],
    schema,
    false,
    env.geminiStructuredModel,
    signal,
  ) as {
    canonicalEn?: unknown;
    displayZh?: unknown;
  };

  return {
    canonicalEn: normalizeProductFingerprint(rawResult?.canonicalEn, rawResult?.displayZh),
    displayZh: rawResult?.displayZh,
  };
};

export const buildLockedFeatureSummary = (fingerprint: ProductFingerprint): string => {
  const lines: string[] = [];

  if (fingerprint.category) {
    lines.push(`Category: ${fingerprint.category}`);
  }
  if (fingerprint.productSummary) {
    lines.push(`Summary: ${fingerprint.productSummary}`);
  }

  const lockedColors = fingerprint.colors
    .filter(color => color.mustPreserve)
    .map(color => `${color.area}: ${color.name}${color.hex ? ` (${color.hex})` : ''}`);
  if (lockedColors.length > 0) {
    lines.push(`Colors: ${lockedColors.join(', ')}`);
  }

  const lockedMaterials = fingerprint.materials
    .filter(material => material.mustPreserve)
    .map(material => `${material.name} at ${material.location}${material.finish ? ` (${material.finish})` : ''}`);
  if (lockedMaterials.length > 0) {
    lines.push(`Materials: ${lockedMaterials.join(', ')}`);
  }

  const structureLines = [
    fingerprint.structure.overallShape ? `Overall shape: ${fingerprint.structure.overallShape}` : '',
    fingerprint.structure.keyParts.length ? `Key parts: ${fingerprint.structure.keyParts.join(', ')}` : '',
    fingerprint.structure.proportions ? `Proportions: ${fingerprint.structure.proportions}` : '',
    fingerprint.structure.visibleControls?.length ? `Visible controls: ${fingerprint.structure.visibleControls.join(', ')}` : '',
    fingerprint.structure.openings?.length ? `Openings: ${fingerprint.structure.openings.join(', ')}` : '',
    fingerprint.structure.distinctiveFeatures.length ? `Distinctive features: ${fingerprint.structure.distinctiveFeatures.join(', ')}` : '',
  ].filter(Boolean);
  if (structureLines.length > 0) {
    lines.push(...structureLines);
  }

  const accessories = fingerprint.accessories
    .filter(accessory => accessory.mustPreserve)
    .map(accessory => `${accessory.count}x ${accessory.name} at ${accessory.position}`);
  if (accessories.length > 0) {
    lines.push(`Accessories: ${accessories.join(', ')}`);
  }

  if (fingerprint.logo?.hasLogo) {
    const logoParts = [
      fingerprint.logo.text ? `text: ${fingerprint.logo.text}` : '',
      fingerprint.logo.position ? `position: ${fingerprint.logo.position}` : '',
      fingerprint.logo.color ? `color: ${fingerprint.logo.color}` : '',
      fingerprint.logo.shape ? `shape: ${fingerprint.logo.shape}` : '',
    ].filter(Boolean);

    if (logoParts.length > 0) {
      lines.push(`Logo: ${logoParts.join(', ')}`);
    }
  }

  if (fingerprint.forbiddenChanges.length > 0) {
    lines.push(`Forbidden changes: ${fingerprint.forbiddenChanges.join('; ')}`);
  }

  return lines.join('\n');
};

type DetailSetPromptPlatform = 'amazon' | 'walmart' | 'other';

const getDetailSetPlatformLabel = (platform: DetailSetPromptPlatform) => {
  switch (platform) {
    case 'amazon':
      return '亚马逊';
    case 'walmart':
      return '沃尔玛';
    case 'other':
    default:
      return '其他平台';
  }
};

const getDetailSetPlatformGuidance = (platform: DetailSetPromptPlatform) => {
  switch (platform) {
    case 'amazon':
      return '强调电商详情图逻辑，适合主图场景、细节特写、使用场景和 A+ 宽图，画面要干净、转化导向强、留白合理。';
    case 'walmart':
      return '强调大众零售友好、明亮清晰、可信赖、实用，不要过度奢华，也不要过度概念化。';
    case 'other':
    default:
      return '强调通用电商详情页适配性，既要有产品质感，也要兼顾多平台和独立站的可复用性。';
  }
};

const getDetailSetPromptSearchText = (fingerprint: ProductFingerprint) =>
  `${fingerprint.productSummary || ''} ${fingerprint.category || ''}`.toLowerCase();

const getDetailSetHumanSceneGuidance = (fingerprint: ProductFingerprint) => {
  const searchText = getDetailSetPromptSearchText(fingerprint);

  if (/(artificial plant|faux plant|fake plant|silk plant|artificial flower|faux flower|fake flower|仿真植物|仿真花|假花|人造植物|人造花)/.test(searchText)) {
    return {
      promptInstruction: 'For faux plants or artificial floral decor, explicitly avoid people, hands, and body parts. Keep the guidance focused on styled placement scenes, interior atmosphere, and decor layering only.',
      fallbackText: '以家居陈列场景为主，不加入人物、手部或人体局部，重点突出摆放层次、空间氛围和装饰感。',
    };
  }

  if (/(bedding|duvet|comforter|quilt|pillow|sheet|bed linen|linen set|blanket|throw blanket|mattress topper|bedspread|bed skirt|bedroom textile|床上用品|四件套|被子|被套|床单|枕头|枕套|毛毯|床笠|床垫)/.test(searchText)) {
    return {
      promptInstruction: 'For bedding products, explicitly encourage believable human-use scenes in some shots, such as a reclining person, seated user, bed-making action, or natural hand interaction with the fabric. Do not make every frame a product-only scene.',
      fallbackText: '建议加入真实人物或手部使用场景，例如躺卧、整理床品、触摸面料等，让画面更有生活化代入感，不要整组都做成单品静物。',
    };
  }

  if (/(coffee|espresso|kettle|blender|air fryer|toaster|cooker|kitchen|appliance|speaker|headphone|earbud|keyboard|mouse|monitor|router|camera|microphone|tech|electronic|device|gadget|小家电|厨房电器|咖啡机|电热水壶|烧水壶|空气炸锅|搅拌机|榨汁机|数码|3c|电子|音箱|耳机|键盘|鼠标|显示器|路由器|相机|麦克风)/.test(searchText)) {
    return {
      promptInstruction: 'For small appliances and 3C products, explicitly encourage believable hands-on or human-use scenes in some shots. Prefer visible hands or partial people operating, holding, wearing, or interacting with the product instead of making every frame a static hero packshot.',
      fallbackText: '建议至少安排一到两张真实人物或手部互动场景，例如操作、持握、佩戴、使用中的瞬间，避免整组都变成只有产品摆拍的单品图。',
    };
  }

  return {
    promptInstruction: 'Only add people when it is clearly category-appropriate. Do not force human presence for decorative or placement-led products.',
    fallbackText: '',
  };
};

const includesAnyDetailSetKeyword = (searchText: string, keywords: string[]) =>
  keywords.some(keyword => searchText.includes(keyword));

const DETAIL_SET_PROMPT_CATEGORY_KEYWORDS = {
  smallAppliance: ['coffee maker', 'espresso', 'kettle', 'blender', 'air fryer', 'toaster', 'rice cooker', 'pressure cooker', 'slow cooker', 'juicer', 'mixer', 'food processor', 'steamer', 'bread maker', 'humidifier', 'air purifier', 'fan', 'space heater', 'dehumidifier', 'vacuum sealer', 'kitchen appliance', 'small appliance', 'appliance', '咖啡机', '浓缩咖啡机', '电热水壶', '烧水壶', '搅拌机', '榨汁机', '空气炸锅', '烤面包机', '电饭煲', '高压锅', '慢炖锅', '料理机', '蒸锅', '面包机', '加湿器', '空气净化器', '风扇', '取暖器', '除湿机', '小家电', '厨房电器'],
  kitchenware: ['cookware', 'frying pan', 'skillet', 'saucepan', 'pot set', 'bakeware', 'baking tray', 'dinnerware', 'tableware', 'cutlery', 'knife set', 'cutting board', 'food storage', 'lunch box', 'water bottle', 'tumbler', 'mug', 'kitchen tool', 'bento', '锅具', '平底锅', '煎锅', '奶锅', '刀具', '餐具', '碗盘', '烘焙', '烤盘', '切菜板', '饭盒', '保鲜盒', '水杯', '保温杯', '马克杯', '厨房用具'],
  bedding: ['bedding', 'duvet', 'comforter', 'quilt', 'pillow', 'sheet', 'bed linen', 'linen set', 'blanket', 'throw blanket', 'mattress topper', 'bedspread', 'bed skirt', 'bedroom textile', '床上用品', '四件套', '被子', '被套', '床单', '枕头', '枕套', '毛毯', '床笠', '床垫'],
  tech: ['speaker', 'headphone', 'earbud', 'keyboard', 'mouse', 'monitor', 'router', 'camera', 'microphone', 'webcam', 'charger', 'power bank', 'smart watch', 'smartwatch', 'tablet stand', 'laptop stand', 'phone stand', 'computer accessory', 'gaming', 'tech', 'electronic', 'device', 'gadget', '数码', '3c', '电子', '音箱', '耳机', '键盘', '鼠标', '显示器', '路由器', '相机', '麦克风', '摄像头', '充电器', '充电宝', '支架'],
  beauty: ['beauty', 'skincare', 'makeup', 'cosmetic', 'facial', 'hair dryer', 'hair curler', 'straightener', 'trimmer', 'shaver', 'massager', 'facial brush', 'nail', 'manicure', 'pedicure', 'oral care', 'toothbrush', '美容', '美妆', '护肤', '化妆', '吹风机', '卷发棒', '直发器', '剃须刀', '修剪器', '按摩仪', '洁面仪', '美甲', '理容', '口腔护理', '牙刷'],
  wearable: ['backpack', 'handbag', 'tote', 'crossbody', 'wallet', 'luggage', 'suitcase', 'jewelry', 'necklace', 'bracelet', 'earring', 'hat', 'scarf', 'glove', 'belt', 'shoe', 'sneaker', 'slipper', 'boot', 'sock', 'apparel', 'clothing', 'shirt', 'hoodie', 'jacket', 'dress', 'leggings', 'sunglasses', 'watch band', '服饰', '服装', '鞋', '鞋子', '拖鞋', '靴子', '袜子', '帽子', '围巾', '手套', '皮带', '背包', '手提包', '旅行箱', '行李箱', '珠宝', '首饰', '项链', '手链', '戒指', '耳环'],
  fitnessOutdoor: ['dumbbell', 'yoga mat', 'resistance band', 'treadmill', 'exercise bike', 'sports', 'fitness', 'workout', 'camping', 'hiking', 'outdoor', 'tent', 'sleeping bag', 'backpacking', 'bicycle accessory', '健身', '运动', '哑铃', '瑜伽垫', '阻力带', '跑步机', '动感单车', '露营', '徒步', '帐篷', '睡袋', '户外'],
  toolsAutomotive: ['tool', 'drill', 'screwdriver', 'wrench', 'socket set', 'toolbox', 'automotive', 'car accessory', 'jump starter', 'tire inflator', 'garage', 'workshop', 'home improvement', 'hardware', '工具', '电钻', '螺丝刀', '扳手', '工具箱', '汽车用品', '车载', '充气泵', '搭电宝', '五金'],
  cleaningOrganization: ['vacuum', 'vacuum cleaner', 'stick vacuum', 'cordless vacuum', 'handheld vacuum', 'robot vacuum', 'wet dry vacuum', 'floor washer', 'mop', 'broom', 'steam mop', 'lint roller', 'laundry basket', 'laundry hamper', 'organizer', 'storage bin', 'storage box', 'cleaning', 'household', '吸尘器', '无线吸尘器', '手持吸尘器', '洗地机', '拖把', '扫把', '清洁', '家清', '洗衣篮', '收纳箱', '整理箱', '储物盒'],
  officeCraft: ['desk organizer', 'office', 'school supplies', 'stationery', 'printer', 'label maker', 'craft', 'sewing', 'planner', 'notebook', '办公', '文具', '学校用品', '打印机', '标签机', '手工', '缝纫', '笔记本'],
  babyKids: ['baby', 'toddler', 'kids', 'children', 'nursery', 'stroller', 'high chair', 'baby carrier', 'bottle', 'pacifier', 'teether', 'crib', 'toy', 'doll', 'building blocks', '儿童', '婴儿', '宝宝', '幼儿', '婴童', '婴儿车', '餐椅', '背带', '奶瓶', '安抚奶嘴', '玩具', '积木'],
  pet: ['pet', 'dog', 'cat', 'puppy', 'kitten', 'pet bed', 'pet toy', 'scratcher', 'cat tree', 'litter box', 'leash', 'harness', 'feeder', 'water fountain', '宠物', '狗', '猫', '犬', '猫抓板', '猫爬架', '猫砂盆', '牵引绳', '宠物床', '喂食器', '饮水机'],
  decorPlacement: ['artificial plant', 'faux plant', 'fake plant', 'silk plant', 'artificial flower', 'faux flower', 'fake flower', 'artificial tree', 'faux tree', 'fake tree', 'artificial olive tree', 'faux olive tree', 'olive tree', 'potted plant', 'potted tree', 'house plant', 'indoor plant', 'greenery', 'botanical', 'vase', 'wreath', 'garland', 'figurine', 'sculpture', 'statue', 'ornament', 'candle holder', 'wall art', 'wall decor', 'photo frame', 'mirror', 'clock', '盆栽', '绿植', '仿真树', '假树', '仿真绿植', '仿真植物', '仿真花', '假花', '人造植物', '人造花', '花瓶', '花环', '摆件', '雕塑', '烛台', '挂画', '装饰画', '相框', '镜子', '装饰钟'],
};

type DetailSetStoryboardFamily = 'vacuum' | 'pillow' | 'decorPlant' | 'projector' | 'homeAppliance' | 'generic';

const DETAIL_SET_STORYBOARD_HEADERS = {
  global: '[GLOBAL RULES]',
  slot: (slot: number) => `[SLOT ${slot}]`,
};

const getDetailSetStoryboardFamily = (fingerprint: ProductFingerprint): DetailSetStoryboardFamily => {
  const searchText = getDetailSetPromptSearchText(fingerprint);

  if (includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.cleaningOrganization)) {
    return 'vacuum';
  }

  if (includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.bedding)) {
    return 'pillow';
  }

  if (includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.decorPlacement)) {
    return 'decorPlant';
  }

  if (searchText.includes('projector') || searchText.includes('投影仪') || searchText.includes('投影机')) {
    return 'projector';
  }

  if (
    includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.smallAppliance) ||
    includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.kitchenware)
  ) {
    return 'homeAppliance';
  }

  return 'generic';
};

const buildStructuredDetailSetSlotPlan = (family: DetailSetStoryboardFamily) => {
  switch (family) {
    case 'vacuum':
      return [
        '用途：整机主卖点图。必须有：同一台上传吸尘器完整主体、原始颜色、刷头和杆体结构。禁止：宠物、动物、第二台机器、拼图。',
        '用途：结构和刷头细节图。必须有：同一台吸尘器的一个锚点近景，例如尘杯/刷头/握把中的一个连续区域。禁止：人物、宠物、双主体、抽象叠加、断开的漂浮部件。',
        '用途：真实清洁使用场景。必须有：同一台吸尘器处于真实清洁动作中。允许：一位成人局部出镜或手部。禁止：宠物、儿童、第二台机器。',
        '用途：功能点展示图。必须有：同一台吸尘器的核心清洁能力或边角/地面适配表现，并保持原始材质和灯效逻辑。禁止：宠物、动物、双主体、拼贴、材质重绘。',
        '用途：宽幅生活横图。必须有：同一台吸尘器、明确空间层次。禁止：宠物、第二台机器、拼图、多宫格。',
        '用途：补充角度或收纳状态图。必须有：同一台吸尘器的可信补充角度或真实收纳状态。禁止：人物、宠物、第二台机器、接触表式拼贴、额外底座/挂架/充电座的脑补添加。',
      ];
    case 'pillow':
      return [
        '用途：床面主展示图。必须有：同一只上传枕头、真实面料颜色、完整轮廓。禁止：宠物、动物、无关多枕头抢主体。',
        '用途：蓬松度和侧面轮廓细节图。必须有：同一只枕头的厚度、包边或缝线细节。禁止：人物、宠物、拼图。',
        '用途：舒适使用场景图。必须有：同一只枕头处于真实使用状态。允许：一位成人局部出镜。禁止：宠物、儿童、多人场景。',
        '用途：面料和做工细节图。必须有：同一只枕头的面料、车线、边缘或填充细节。禁止：人物、宠物、拼贴。',
        '用途：支撑或姿势说明图。必须有：同一只枕头的支撑感表达。允许：一位成人局部出镜。禁止：宠物、多人、多宫格。',
        '用途：补充卧室氛围图。必须有：同一只枕头和可信房间氛围。禁止：宠物、动物、重复多个主体。',
      ];
    case 'decorPlant':
      return [
        '用途：主陈列图。必须有：同一株上传绿植或仿真树、真实花盆和枝叶结构。禁止：人物、手部、宠物、动物、拼图。',
        '用途：枝叶/花盆细节图。必须有：同一株植物的叶片、枝干、花盆细节，并保持真实枝叶密度与盆器比例。禁止：人物、宠物、第二主体。',
        '用途：客厅或角落摆放图。必须有：同一株植物的真实家居摆放关系。禁止：人物、宠物、动物、拼贴。',
        '用途：材质和做工细节图。必须有：同一株植物的叶片层次、枝干、花盆质感，并保持原始树形轮廓。禁止：人物、宠物、双主体。',
        '用途：宽幅陈列横图。必须有：同一株植物和清晰空间层次。禁止：人物、宠物、动物、拼图。',
        '用途：补充角度图。必须有：同一株植物的补充角度或比例感。禁止：人物、宠物、动物、第二主体。',
      ];
    case 'projector':
      return [
        '用途：设备主展示图。必须有：同一台上传投影仪、真实机身颜色、镜头和散热结构。禁止：人物、宠物、第二台设备。',
        '用途：镜头和接口细节图。必须有：同一台投影仪的一个锚点近景，例如镜头、按键或接口中的一个连续区域。禁止：人物、宠物、双主体、断开的漂浮部件。',
        '用途：投影环境图。必须有：同一台投影仪处于可信投影环境中。禁止：人物、宠物、第二台设备。',
        '用途：机身做工特写图。必须有：同一台投影仪的表面、边缘、按键或材质细节，并保持原始材质分区。禁止：人物、宠物、抽象叠加、材质重绘。',
        '用途：宽幅家庭影院横图。必须有：同一台投影仪和明确投影氛围。禁止：人物、宠物、第二台设备、拼图。',
        '用途：补充角度图。必须有：同一台投影仪的可信补充角度。禁止：人物、宠物、第二台设备、额外遥控器/支架/挂架的脑补添加。',
      ];
    case 'homeAppliance':
      return [
        '用途：台面主卖点图。必须有：同一台上传家电、真实颜色、控制区和轮廓。禁止：宠物、动物、第二台设备。',
        '用途：操控区或结构细节图。必须有：同一台家电的一个锚点细节，例如按键、旋钮、壶嘴、开合或功能结构中的一个连续区域。禁止：人物、宠物、双主体、断开的漂浮部件。',
        '用途：真实使用场景图。必须有：同一台家电处于可信使用状态。允许：一位成人手部。禁止：宠物、儿童、第二台设备。',
        '用途：功能结果或材质表现图。必须有：同一台家电的核心功能价值，并保持原始材质与颜色分区。仅当类目强相关时允许食物/饮品。禁止：宠物、双主体、材质重绘。',
        '用途：宽幅家居横图。必须有：同一台家电和清晰环境层次。禁止：宠物、第二台设备、拼图。',
        '用途：补充角度或支持细节图。必须有：同一台家电的可信补充角度。禁止：人物、宠物、第二台设备、额外支架/底座/容器的脑补添加。',
      ];
    default:
      return [
        '用途：主卖点图。必须有：同一件上传产品、真实颜色和主体结构。禁止：宠物、动物、第二主体、拼图。',
        '用途：关键结构细节图。必须有：同一件产品的一个锚点结构或做工细节。禁止：人物、宠物、双主体、断开的漂浮部件。',
        '用途：可信使用场景图。必须有：同一件产品的真实使用语境。默认禁止人物，除非当前类目确有必要。',
        '用途：核心卖点图。必须有：同一件产品的核心优势或功能重点，并保持原始材质和颜色逻辑。禁止：宠物、双主体、抽象拼贴、材质重绘。',
        '用途：宽幅氛围横图。必须有：同一件产品和明确空间层次。禁止：拼图、多宫格、第二主体。',
        '用途：补充角度图。必须有：同一件产品的可信补充角度。禁止：宠物、第二主体、拼贴、额外附件脑补添加。',
      ];
  }
};

const getDetailSetHumanSceneGuidanceV2 = (fingerprint: ProductFingerprint) => {
  const searchText = getDetailSetPromptSearchText(fingerprint);
  const family = getDetailSetStoryboardFamily(fingerprint);

  if (family === 'vacuum') {
    return {
      promptInstruction: 'For vacuums and floor-cleaning products, keep most slots product-led. Only the explicit use-scene slot may allow one partial adult user or hands. Pets, children, and extra machines should be forbidden.',
      fallbackText: '吸尘器类大多数分镜以产品主体为主，只有明确使用场景位才允许一位成人局部出镜；宠物、儿童、第二台机器都禁止。',
    };
  }

  if (family === 'pillow') {
    return {
      promptInstruction: 'For pillows and bedding, keep hero/detail slots product-led. Only explicit comfort-use or posture slots may allow one partial adult user. Pets and children should stay forbidden unless explicitly required.',
      fallbackText: '枕头和床品类主图/细节图以产品为主，只有明确舒适使用位才允许一位成人局部出镜；宠物和儿童默认禁止。',
    };
  }

  if (family === 'projector') {
    return {
      promptInstruction: 'For projectors, tell the story through device realism, room setup, and projection atmosphere. Do not add people, pets, or body parts unless a slot explicitly requires a hand-held control action.',
      fallbackText: '投影仪类重点通过设备本体、房间布置和投影氛围讲故事；除非某一张明确要求，否则人物、宠物和手部默认禁止。',
    };
  }

  if (family === 'homeAppliance') {
    return {
      promptInstruction: 'For home appliances, keep hero/detail/banner slots product-led. Only explicit use slots may allow one adult hand or forearm. Pets and extra people should be forbidden by default.',
      fallbackText: '家电类主图/细节图/横图都以产品为主，只有明确使用位才允许一只手或成人前臂；宠物和多余人物默认禁止。',
    };
  }

  if (includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.decorPlacement)) {
    return {
      promptInstruction: 'For decor, faux botanicals, tabletop styling, and placement-led products, explicitly avoid people, hands, body parts, pets, dogs, cats, birds, and other animals. Keep the guidance focused on styled placement scenes, interior atmosphere, decor layering, and clean single-scene compositions only.',
      fallbackText: '以家居陈列场景为主，不加入人物、手部、宠物或其他动物，重点突出摆放层次、空间氛围和装饰感，并避免拼图式多画面构图。',
    };
  }

  if (includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.pet)) {
    return {
      promptInstruction: 'For pet products, prefer believable pet-use scenes with dogs or cats naturally interacting with the product. Human presence should stay secondary unless it helps explain use.',
      fallbackText: '建议优先加入宠物真实使用场景，让猫狗与产品自然互动；人物如出现，只作为辅助，不要喧宾夺主。',
    };
  }

  if (includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.babyKids)) {
    return {
      promptInstruction: 'For baby, kids, and nursery products, encourage warm family-safe scenes with a baby, child, or caregiver naturally interacting with the product in some shots.',
      fallbackText: '建议加入婴童或照护者真实互动场景，强调安全、温和、生活化，不要整组都做成静态摆拍。',
    };
  }

  if (includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.bedding)) {
    return getDetailSetHumanSceneGuidance(fingerprint);
  }

  if (includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.wearable)) {
    return {
      promptInstruction: 'For apparel, bags, shoes, jewelry, and wearable accessories, encourage on-body or in-hand lifestyle scenes in some shots so the product feels worn, carried, or styled in real life.',
      fallbackText: '建议安排上身、佩戴、持拿、通勤或穿搭场景，让产品呈现真实使用状态，不要整组都平铺或单独摆放。',
    };
  }

  if (includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.beauty)) {
    return {
      promptInstruction: 'For beauty and personal-care products, explicitly encourage believable self-care routine scenes with visible hands, face, or partial body using the product in some shots.',
      fallbackText: '建议加入真实护理、化妆、理容、吹整或持握使用的瞬间，让画面更像日常使用场景，而不是单纯台面摆拍。',
    };
  }

  if (includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.fitnessOutdoor)) {
    return {
      promptInstruction: 'For fitness, sports, and outdoor products, explicitly encourage active-use scenes with a person wearing, holding, training with, or preparing to use the product in some shots.',
      fallbackText: '建议安排运动、训练、户外携带或实际使用场景，让产品处于真实动作或准备使用的状态，避免全是静态展示。',
    };
  }

  if (
    includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.smallAppliance) ||
    includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.kitchenware) ||
    includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.tech) ||
    includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.toolsAutomotive) ||
    includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.cleaningOrganization) ||
    includesAnyDetailSetKeyword(searchText, DETAIL_SET_PROMPT_CATEGORY_KEYWORDS.officeCraft)
  ) {
    return {
      promptInstruction: 'For functional household, kitchen, tech, tools, office, and practical-use products, explicitly encourage believable hands-on or human-use scenes in some shots. Prefer visible hands or partial people operating, holding, using, or interacting with the product.',
      fallbackText: '建议至少安排一到两张真实手部或人物互动场景，例如操作、使用、整理、清洁、办公或功能演示，避免整组都变成单品静物。',
    };
  }

  return getDetailSetHumanSceneGuidance(fingerprint);
};

const buildDetailSetPromptFallback = (
  platform: DetailSetPromptPlatform,
  fingerprint: ProductFingerprint,
) => {
  const family = getDetailSetStoryboardFamily(fingerprint);
  const category = firstNonEmptyString(fingerprint.category, '产品');
  const summary = firstNonEmptyString(fingerprint.productSummary, category);
  const keyParts = fingerprint.structure.keyParts.slice(0, 4).join('、') || '主体结构';
  const distinctiveFeatures = fingerprint.structure.distinctiveFeatures.slice(0, 4).join('、') || '关键细节';
  const colors = fingerprint.colors.slice(0, 3).map(item => item.name).join('、') || '原始配色';
  const humanSceneGuidance = getDetailSetHumanSceneGuidanceV2(fingerprint);
  const slotPlans = buildStructuredDetailSetSlotPlan(family);

  const globalRules = [
    `平台：${getDetailSetPlatformLabel(platform)}。${getDetailSetPlatformGuidance(platform)}`,
    `产品：${summary}。必须保持主体真实一致，重点保留${keyParts}、${distinctiveFeatures}和${colors}。`,
    '除当前分镜明确要求外，人物、手部、宠物、动物、食物、饮品、额外产品、第二主体、拼图、多宫格、分栏、小窗插图都不允许出现。',
    '每张图都必须是单场景单画面，且只能围绕同一个上传产品展开，不能改颜色、改结构、改材质、改部件数量。',
    '细节特写位只能选择一个锚点结构区域，不能把多个远距离部件拼成一个合成特写，也不能把主体拆成多个漂浮部件。',
    '除非上传图里明确可见或当前分镜明确要求，不允许新增底座、支架、挂架、充电座、篮筐、花盆、托盘、屏幕、遥控器或其他附件。',
    humanSceneGuidance.fallbackText,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    DETAIL_SET_STORYBOARD_HEADERS.global,
    globalRules,
    ...slotPlans.flatMap((slotPlan, index) => [DETAIL_SET_STORYBOARD_HEADERS.slot(index + 1), slotPlan]),
  ].join('\n');
};

export const generateDetailSetGlobalPromptWithOpenAi = async (
  platform: DetailSetPromptPlatform,
  fingerprint: ProductFingerprint,
  signal?: AbortSignal,
): Promise<{ prompt: string }> => {
  const fallbackPrompt = buildDetailSetPromptFallback(platform, fingerprint);

  if (!env.openAiApiKey) {
    return { prompt: fallbackPrompt };
  }

  const prompt = [
    'You are an expert e-commerce visual prompt writer.',
    'Write a Chinese six-slot storyboard plan for a product detail-image set.',
    'The final text will be pasted directly into a field called "global guidance" and later parsed per slot.',
    'Do not return JSON or markdown.',
    'Return only plain text using exactly these headers in this exact order:',
    '[GLOBAL RULES]',
    '[SLOT 1]',
    '[SLOT 2]',
    '[SLOT 3]',
    '[SLOT 4]',
    '[SLOT 5]',
    '[SLOT 6]',
    'Under [GLOBAL RULES], write 3 to 5 short Chinese lines covering platform fit, product fidelity, default forbidden elements, and single-scene rules.',
    'Under each slot header, write 1 to 3 short Chinese lines describing: purpose, must-have elements, and forbidden elements for that specific image.',
    'If a slot does not explicitly require people, hands, animals, pets, food, drinks, screens, or extra props, then forbid them by default.',
    'Unless a slot is explicitly comparison-oriented, every slot must stay as one coherent single-scene composition rather than collage, multi-panel, tiled, split-screen, or picture-in-picture composition.',
    'For detail-focused slots, choose one anchor detail region only and keep it part of the same continuous product body. Never merge distant product parts or multiple viewpoints into one synthetic close-up.',
    'Do not invent optional accessories, docks, stands, mounts, baskets, planters, trays, remotes, chargers, or storage hardware unless they are visible in the uploaded product images or explicitly required by the slot.',
    `Target platform: ${getDetailSetPlatformLabel(platform)}.`,
    `Platform guidance: ${getDetailSetPlatformGuidance(platform)}`,
    `Category-specific human-scene guidance: ${getDetailSetHumanSceneGuidanceV2(fingerprint).promptInstruction}`,
    'The text must respect the uploaded product identity represented by this fingerprint and avoid asking for unrelated product changes.',
    'Product fidelity is the highest priority: preserve exact body color, structure, materials, key parts, logo, and accessory logic.',
    'Product fingerprint summary:',
    buildLockedFeatureSummary(fingerprint),
    'Reference fallback format:',
    fallbackPrompt,
  ].join('\n');

  let lastError: unknown;
  for (const model of getOpenAiFingerprintModels()) {
    try {
      const responseJson = await postOpenAiResponses({
        model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
            ],
          },
        ],
        maxOutputTokens: 900,
        timeoutMs: 30000,
        signal,
        actionLabel: '详情图提示词生成',
      });

      const outputText = extractOpenAiResponseText(responseJson).trim();
      if (!outputText) {
        throw new Error('详情图提示词生成返回为空，请稍后重试。');
      }

      return {
        prompt: outputText.trim(),
      };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      lastError = error;
    }
  }

  if (lastError) {
    return { prompt: fallbackPrompt };
  }

  return { prompt: fallbackPrompt };
};

