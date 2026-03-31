import { ProductFingerprint } from '../types/product';
import { v4 as uuidv4 } from 'uuid';

const keyMapZhToEn = {
  '类目': 'category',
  '产品总结': 'productSummary',
  '颜色': 'colors',
  '材质': 'materials',
  '结构': 'structure',
  '配件': 'accessories',
  '标志': 'logo',
  '禁止变化项': 'forbiddenChanges',
  '验证清单': 'verifierChecklist',
  '置信度': 'confidence',
  
  '名称': 'name',
  '十六进制代码': 'hex',
  '区域': 'area',
  '覆盖范围': 'area',
  '必须保留': 'mustPreserve',
  '表面处理': 'finish',
  '位置': 'location',
  '整体形状': 'overallShape',
  '比例': 'proportions',
  '关键部件': 'keyParts',
  '可见控件': 'visibleControls',
  '开口': 'openings',
  '显著特征': 'distinctiveFeatures',
  '数量': 'count',
  '已连接': 'attached',
  '有标志': 'hasLogo',
  '文本': 'text',
  '颜色_logo': 'color', // '颜色' is already mapped to 'colors', but inside 'logo' it's 'color'. We can handle this in the recursive function.
  '形状': 'shape'
};

const valueMapZhToEn: Record<string, Record<string, string>> = {
  'area': {
    '主要': 'primary',
    '次要': 'secondary',
    '点缀': 'accent'
  },
  'category': {
    '电子产品': 'Electronics',
    '家用电器': 'Home Appliances',
    '家具': 'Furniture',
    '玩具': 'Toys',
    '运动户外': 'Sports & Outdoors',
    '美妆个护': 'Beauty & Personal Care',
    '服饰鞋包': 'Apparel & Accessories',
    '母婴用品': 'Baby Products',
    '汽车用品': 'Automotive',
    '办公用品': 'Office Supplies',
    '数码配件': 'Digital Accessories',
    '厨房用具': 'Kitchenware',
    '工具': 'Tools'
  },
  'colors': {
    '黑色': 'black',
    '白色': 'white',
    '灰色': 'gray',
    '红色': 'red',
    '蓝色': 'blue',
    '绿色': 'green',
    '黄色': 'yellow',
    '橙色': 'orange',
    '紫色': 'purple',
    '粉色': 'pink',
    '棕色': 'brown',
    '咖啡色': 'coffee',
    '金色': 'gold',
    '银色': 'silver',
    '透明': 'transparent',
    '深': 'dark',
    '浅': 'light',
    '亮': 'bright',
    '暗': 'dim',
    '哑': 'matte',
    '磨砂': 'frosted',
    '金属': 'metallic',
    '调': 'tone',
    '蓝调': 'blue tone',
    '深灰': 'dark gray',
    '浅灰': 'light gray',
    '银灰': 'silver gray',
    '碳灰': 'charcoal gray',
    '米色': 'beige',
    '奶油色': 'cream',
    '象牙白': 'ivory',
    '哑光黑': 'matte black',
    '亮光': 'glossy',
    '高光': 'high-gloss',
    '点缀': 'accent',
    '带': 'with',
    '的': '',
    '和': 'and',
    '与': 'and',
    '青色': 'cyan',
    '青': 'cyan',
    '藏青': 'navy blue',
    '宝蓝': 'royal blue',
    '天蓝': 'sky blue',
    '墨绿': 'dark green',
    '草绿': 'grass green',
    '浅绿': 'light green',
    '亮绿': 'bright green',
    '酒红': 'wine red',
    '大红': 'bright red',
    '橘红': 'orange red',
    '橘黄': 'orange yellow',
    '土黄': 'earthy yellow',
    '卡其': 'khaki',
    '驼色': 'camel',
    '咖啡': 'coffee',
    '巧克力': 'chocolate',
    '玫瑰金': 'rose gold',
    '香槟金': 'champagne gold',
    '钛金': 'titanium',
    '枪灰': 'gunmetal gray',
    '渐变': 'gradient',
    '彩虹': 'rainbow',
    '炫彩': 'iridescent',
    '珠光': 'pearlescent',
    '荧光': 'fluorescent'
  },
  'materials': {
    '塑料': 'plastic',
    '金属': 'metal',
    '玻璃': 'glass',
    '木材': 'wood',
    '皮革': 'leather',
    '织物': 'fabric',
    '橡胶': 'rubber',
    '陶瓷': 'ceramic',
    '铝': 'aluminum',
    '铝合金': 'aluminum alloy',
    '不锈钢': 'stainless steel',
    '碳纤维': 'carbon fiber',
    '工程塑料': 'engineering plastic',
    '合成材料': 'synthetic material',
    '复合材料': 'composite material',
    '硅胶': 'silicone',
    '哑光': 'matte',
    '透明': 'transparent',
    '拉丝': 'brushed',
    '磨砂': 'frosted',
    '纹理': 'textured',
    '外壳': 'outer shell',
    '件': 'part',
    '带': 'with',
    '的': '',
    '钢化玻璃': 'tempered glass',
    '有机玻璃': 'plexiglass',
    '亚克力': 'acrylic',
    '树脂': 'resin',
    '大理石': 'marble',
    '花岗岩': 'granite',
    '实木': 'solid wood',
    '胡桃木': 'walnut',
    '橡木': 'oak',
    '松木': 'pine',
    '竹': 'bamboo',
    '真皮': 'genuine leather',
    '人造革': 'synthetic leather',
    'PU皮': 'PU leather',
    '尼龙': 'nylon',
    '涤纶': 'polyester',
    '棉': 'cotton',
    '麻': 'linen',
    '丝绸': 'silk',
    '绒布': 'velvet',
    '碳钢': 'carbon steel',
    '钛合金': 'titanium alloy',
    '镁合金': 'magnesium alloy',
    '镀铬': 'chrome plated',
    '镀金': 'gold plated',
    '喷漆': 'painted',
    '阳极氧化': 'anodized'
  },
  'positions': {
    '正面': 'front',
    '背面': 'back',
    '顶部': 'top',
    '底部': 'bottom',
    '左侧': 'left side',
    '右侧': 'right side',
    '中部': 'center',
    '上部': 'upper',
    '下部': 'lower',
    '侧面': 'side',
    '中上部': 'upper-middle',
    '中下部': 'lower-middle',
    '左上': 'top-left',
    '右上': 'top-right',
    '左下': 'bottom-left',
    '右下': 'bottom-right',
    '左上角': 'top-left corner',
    '右上角': 'top-right corner',
    '左下角': 'bottom-left corner',
    '右下角': 'bottom-right corner',
    '中央': 'center',
    '偏左': 'left',
    '偏右': 'right',
    '前方': 'front',
    '后方': 'rear',
    '内部': 'internal',
    '外部': 'external',
    '边缘': 'edge',
    '角落': 'corner',
    '四周': 'around',
    '环绕': 'surrounding',
    '交界处': 'junction',
    '连接处': 'connection point',
    '表面': 'surface',
    '夹层': 'interlayer'
  },
  'overallShape': {
    '圆形': 'circular',
    '方形': 'square',
    '长方形': 'rectangular',
    '椭圆形': 'oval',
    '圆柱形': 'cylindrical',
    '球形': 'spherical',
    '三角形': 'triangular',
    '不规则': 'irregular',
    '细长': 'elongated',
    '扁平': 'flat',
    '流线型': 'streamlined',
    '梯形': 'trapezoidal',
    '六角形': 'hexagonal',
    '八角形': 'octagonal',
    '菱形': 'diamond-shaped',
    '心形': 'heart-shaped',
    '星形': 'star-shaped',
    '弧形': 'curved',
    '拱形': 'arched',
    '锥形': 'conical',
    '立方体': 'cubic',
    '长方体': 'cuboid'
  }
};

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

function normalizeByDictionary(text: string, dictionary: Record<string, string>, fallback: string): string {
  if (!text) return fallback;
  if (!containsChinese(text)) return text;
  
  const sortedKeys = Object.keys(dictionary).sort((a, b) => b.length - a.length);
  let remaining = text;
  let parts: { val: string, index: number }[] = [];
  
  for (const key of sortedKeys) {
    let index = remaining.indexOf(key);
    while (index !== -1) {
      parts.push({ val: dictionary[key], index });
      let placeholder = '_'.repeat(key.length);
      remaining = remaining.substring(0, index) + placeholder + remaining.substring(index + key.length);
      index = remaining.indexOf(key);
    }
  }
  
  parts.sort((a, b) => a.index - b.index);
  
  if (parts.length > 0) {
    return parts.map(p => p.val).filter(v => v !== '').join(' ').replace(/\s+/g, ' ').trim();
  }
  
  // Final fallback: remove all Chinese characters if no mapping found
  const cleaned = text.replace(/[\u4e00-\u9fa5]/g, '').trim();
  return cleaned || fallback;
}

// Field-specific normalizers
function normalizeColorZhToEn(text: string): string {
  return normalizeByDictionary(text, valueMapZhToEn['colors'], 'custom color');
}

function normalizeMaterialZhToEn(text: string): string {
  return normalizeByDictionary(text, valueMapZhToEn['materials'], 'custom material');
}

function normalizePositionZhToEn(text: string): string {
  if (!containsChinese(text)) return text;
  const posMap = valueMapZhToEn['positions'];
  const sortedKeys = Object.keys(posMap).sort((a, b) => b.length - a.length);
  
  let remaining = text;
  let parts: { val: string, index: number }[] = [];
  
  for (const key of sortedKeys) {
    let index = remaining.indexOf(key);
    while (index !== -1) {
      parts.push({ val: posMap[key], index });
      let placeholder = '_'.repeat(key.length);
      remaining = remaining.substring(0, index) + placeholder + remaining.substring(index + key.length);
      index = remaining.indexOf(key);
    }
  }
  
  parts.sort((a, b) => a.index - b.index);
  
  if (parts.length > 0) {
    const verticalTerms = ['upper', 'lower', 'upper-middle', 'lower-middle', 'top', 'bottom'];
    const horizontalTerms = ['left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'left side', 'right side', 'top-left corner', 'top-right corner', 'bottom-left corner', 'bottom-right corner'];
    const surfaceTerms = ['front', 'back', 'side', 'rear', 'internal', 'external'];
    
    let vertical = parts.find(p => verticalTerms.includes(p.val))?.val || '';
    let horizontal = parts.find(p => horizontalTerms.includes(p.val))?.val || '';
    let surface = parts.find(p => surfaceTerms.includes(p.val))?.val || '';
    let other = parts.filter(p => !verticalTerms.includes(p.val) && !horizontalTerms.includes(p.val) && !surfaceTerms.includes(p.val)).map(p => p.val).join(' ');
    
    let result = [vertical, horizontal, surface, other].filter(v => v !== '').join(' ');
    if (result) return result;
    
    return parts.map(p => p.val).join(' ');
  }
  
  return 'specified position';
}

function normalizeStructureZhToEn(text: string): string {
  const structureTerms: Record<string, string> = {
    '整体': 'overall',
    '形状': 'shape',
    '比例': 'proportions',
    '流线型': 'streamlined',
    '圆润': 'rounded',
    '方正': 'square-shaped',
    '紧凑': 'compact',
    '对称': 'symmetrical',
    '非对称': 'asymmetrical',
    '一体化': 'integrated',
    '分体式': 'split-type',
    '模块化': 'modular',
    '极简': 'minimalist',
    '工业风': 'industrial style',
    '复古': 'retro',
    '现代': 'modern',
    '符合人体工程学': 'ergonomic'
  };

  const allTerms = {
    ...structureTerms,
    ...valueMapZhToEn['overallShape'],
    ...valueMapZhToEn['materials']
  };

  return normalizeByDictionary(text, allTerms, 'custom structure');
}

function normalizeFeatureZhToEn(text: string, fieldKey: string): string {
  if (!containsChinese(text)) return text;
  
  // Common structural and feature terms
  const featureTerms: Record<string, string> = {
    '按钮': 'button',
    '仓体': 'chamber',
    '刷头': 'brush head',
    '机身': 'body',
    '屏幕': 'screen',
    '接口': 'port',
    '盖子': 'lid',
    '手柄': 'handle',
    '指示灯': 'indicator light',
    '显示屏': 'display screen',
    '开关': 'switch',
    '调节钮': 'adjustment knob',
    '透明': 'transparent',
    '圆形': 'circular',
    '内凹': 'concave',
    '凸起': 'protruding',
    '略微': 'slightly',
    '轻微': 'slight',
    '一个': 'one',
    '两个': 'two',
    '连接': 'attached at',
    '细长': 'elongated',
    '有': 'has',
    '在': 'at',
    '带': 'with',
    '的': '',
    '和': 'and',
    '与': 'and',
    '及': 'and',
    '外壳': 'outer shell',
    '表面': 'surface',
    '纹理': 'texture',
    '标志': 'logo',
    '文字': 'text',
    '图案': 'pattern',
    '开口': 'opening',
    '槽': 'slot',
    '孔': 'hole',
    '网格': 'mesh',
    '支架': 'stand',
    '底座': 'base',
    '装饰': 'decorative',
    '线条': 'lines',
    '边框': 'border',
    '倒角': 'chamfer',
    '圆角': 'rounded corner'
  };

  const allTerms = {
    ...featureTerms,
    ...valueMapZhToEn['colors'],
    ...valueMapZhToEn['materials'],
    ...valueMapZhToEn['positions'],
    ...valueMapZhToEn['overallShape']
  };

  return normalizeByDictionary(text, allTerms, `custom ${fieldKey.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
}

function normalizeAccessoryZhToEn(text: string): string {
  const accessoryTerms: Record<string, string> = {
    '充电器': 'charger',
    '电缆': 'cable',
    '数据线': 'data cable',
    '保护壳': 'protective case',
    '挂绳': 'lanyard',
    '支架': 'stand',
    '说明书': 'manual',
    '包装': 'packaging',
    '底座': 'base',
    '电池': 'battery',
    '遥控器': 'remote control',
    '替换装': 'refill',
    '刷头': 'brush head',
    '滤网': 'filter'
  };
  
  const allTerms = {
    ...accessoryTerms,
    ...valueMapZhToEn['colors'],
    ...valueMapZhToEn['positions']
  };
  
  return normalizeByDictionary(text, allTerms, 'custom accessory');
}

function normalizeForbiddenChangeZhToEn(text: string): string {
  const forbiddenTerms: Record<string, string> = {
    '不要': 'do not',
    '禁止': 'prohibit',
    '严禁': 'strictly prohibit',
    '改变': 'change',
    '变动': 'alter',
    '去掉': 'remove',
    '删除': 'delete',
    '增加': 'add',
    '额外': 'extra',
    '配件': 'accessories',
    '位置': 'position',
    '形状': 'shape',
    '比例': 'proportions',
    '颜色': 'color',
    '材质': 'material',
    '标志': 'logo',
    '透明件': 'transparent part',
    '保持': 'keep',
    '原有': 'original',
    '固定': 'fixed',
    '不可': 'cannot'
  };

  const allTerms = {
    ...forbiddenTerms,
    ...valueMapZhToEn['positions']
  };

  return normalizeByDictionary(text, allTerms, 'user-defined constraint');
}

function normalizeToEn(text: string, fieldKey: string, parentKey?: string): string {
  if (!text || typeof text !== 'string') return text;
  if (!containsChinese(text)) return text;

  // Route to field-specific normalizers
  if (fieldKey === 'name' && (parentKey === '颜色' || parentKey === 'colors')) {
    return normalizeColorZhToEn(text);
  }
  if (fieldKey === 'name' && (parentKey === '材质' || parentKey === 'materials')) {
    return normalizeMaterialZhToEn(text);
  }
  if (fieldKey === 'location' || fieldKey === 'position') {
    return normalizePositionZhToEn(text);
  }
  if (fieldKey === 'finish') {
    return normalizeMaterialZhToEn(text);
  }
  if (fieldKey === 'structure') {
    return normalizeStructureZhToEn(text);
  }
  if (['forbiddenChanges', 'verifierChecklist'].includes(fieldKey)) {
    return normalizeForbiddenChangeZhToEn(text);
  }
  if (fieldKey === 'accessories' || (fieldKey === 'name' && parentKey === 'accessories')) {
    return normalizeAccessoryZhToEn(text);
  }
  if (['visibleControls', 'openings', 'distinctiveFeatures', 'keyParts'].includes(fieldKey)) {
    return normalizeFeatureZhToEn(text, fieldKey);
  }
  
  return normalizeFeatureZhToEn(text, fieldKey);
}

export function addIdsToArrays(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (item !== null && typeof item === 'object') {
        const newItem = addIdsToArrays(item);
        if (!newItem._id) {
          newItem._id = uuidv4();
        }
        return newItem;
      }
      return item;
    });
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      newObj[key] = addIdsToArrays(obj[key]);
    }
    return newObj;
  }
  return obj;
}

export function translateKeysZhToEn(obj: any, parentKey?: string): any {
  if (Array.isArray(obj)) {
    return obj.map(item => translateKeysZhToEn(item, parentKey));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (key === '_id') {
        newObj[key] = obj[key];
        continue;
      }
      let enKey = keyMapZhToEn[key as keyof typeof keyMapZhToEn] || key;
      
      // Special case for '颜色' inside 'logo' vs root '颜色'
      if (key === '颜色' && parentKey === '标志') {
        enKey = 'color';
      }
      // Special case for '位置' inside 'accessories'/'logo' vs 'materials'
      if (key === '位置') {
        if (parentKey === '标志' || parentKey === '配件') {
          enKey = 'position';
        } else {
          enKey = 'location';
        }
      }

      let val = obj[key];
      if (typeof val === 'string') {
        val = normalizeToEn(val, enKey, key);
      }

      newObj[enKey] = translateKeysZhToEn(val, key);
    }
    return newObj;
  }
  return obj;
}

export function mergeEdits(editedMapped: any, originalMapped: any, originalEn: any): any {
  if (editedMapped === undefined) return undefined;
  
  if (Array.isArray(editedMapped)) {
    const origMapArr = Array.isArray(originalMapped) ? originalMapped : [];
    const origEnArr = Array.isArray(originalEn) ? originalEn : [];
    
    return editedMapped.map((item, index) => {
      if (item !== null && typeof item === 'object' && item._id) {
        // Find matching item by _id
        const origMapItem = origMapArr.find((o: any) => o && o._id === item._id);
        const origEnItem = origEnArr.find((o: any) => o && o._id === item._id);
        
        if (origMapItem && origEnItem) {
          return mergeEdits(item, origMapItem, origEnItem);
        } else {
          return item; // New item added by user, or ID not found
        }
      } else {
        // Primitive array or no _id
        const origIndex = origMapArr.indexOf(item);
        if (origIndex !== -1) {
          // If the value is the same as original Chinese, use original English
          if (item === origMapArr[origIndex]) {
            return origEnArr[origIndex] !== undefined ? origEnArr[origIndex] : item;
          }
        }
        return item;
      }
    });
  } else if (editedMapped !== null && typeof editedMapped === 'object') {
    const origMapObj = (originalMapped !== null && typeof originalMapped === 'object') ? originalMapped : {};
    const origEnObj = (originalEn !== null && typeof originalEn === 'object') ? originalEn : {};
    
    const result: any = {};
    for (const key in editedMapped) {
      if (key === '_id') {
        result[key] = editedMapped[key];
        continue;
      }
      result[key] = mergeEdits(editedMapped[key], origMapObj[key], origEnObj[key]);
    }
    return result;
  } else {
    // Primitive value
    if (editedMapped !== originalMapped) {
      // User changed it, use the new (normalized) value
      return editedMapped;
    } else {
      // Untouched, use the original (English) value
      return originalEn !== undefined ? originalEn : editedMapped;
    }
  }
}

export function applyLocalEdits(
  editedZh: any,
  originalZh: any,
  originalEn: ProductFingerprint
): ProductFingerprint {
  const editedMapped = translateKeysZhToEn(editedZh);
  const originalMapped = translateKeysZhToEn(originalZh);
  
  return mergeEdits(editedMapped, originalMapped, originalEn) as ProductFingerprint;
}
