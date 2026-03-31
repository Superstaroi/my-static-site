import * as XLSX from 'xlsx';
import { ExcelRow, GenerationMode, ImageType, Language, CommercialTone, SceneStrictness } from '../types';

const getColumnValue = (row: any, possibleNames: string[]) => {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== '') return String(row[name]);
  }
  return '';
};

const getParsedColumnValue = <T>(
  row: any,
  possibleNames: string[],
  parser: (value: string) => T | undefined,
  fallbackColumnKey?: string
): T | undefined => {
  const rawValue = getColumnValue(row, possibleNames).trim() || (fallbackColumnKey ? String(row[fallbackColumnKey] || '').trim() : '');
  return rawValue ? parser(rawValue) : undefined;
};

const parseMode = (val: string): GenerationMode | undefined => {
  const v = val.toLowerCase();
  if (v.includes('background') || v.includes('背景')) return 'background_transfer';
  if (v.includes('style') || v.includes('风格')) return 'style_inspiration';
  if (v.includes('strict') || v.includes('严格') || v.includes('layout') || v.includes('排版')) return 'strict_layout_match';
  if (v.includes('lifestyle') || v.includes('生活') || v.includes('场景')) return 'lifestyle_listing';
  if (v.includes('infographic') || v.includes('detail') || v.includes('细节') || v.includes('白底')) return 'infographic_listing';
  return undefined;
};

const parseImageType = (val: string): ImageType | undefined => {
  const v = val.toLowerCase();
  if (v.includes('main') || v.includes('主图')) return 'main';
  if (v.includes('lifestyle') || v.includes('场景')) return 'lifestyle';
  if (v.includes('detail') || v.includes('细节')) return 'detail';
  if (v.includes('comparison') || v.includes('对比')) return 'comparison';
  if (v.includes('banner') || v.includes('海报') || v.includes('横幅')) return 'banner';
  return undefined;
};

const parseLanguage = (val: string): Language | undefined => {
  const v = val.toLowerCase();
  if (v.includes('en') || v.includes('english') || v.includes('英')) return 'en';
  if (v.includes('zh') || v.includes('chinese') || v.includes('中')) return 'zh';
  if (v.includes('multi') || v.includes('多语言')) return 'multi';
  if (v.includes('auto') || v.includes('自动')) return 'auto';
  return undefined;
};

const parseBoolean = (val: string): boolean | undefined => {
  const v = val.toLowerCase();
  if (v === 'true' || v === 'yes' || v === 'y' || v === '是' || v === '1') return true;
  if (v === 'false' || v === 'no' || v === 'n' || v === '否' || v === '0') return false;
  return undefined;
};

const parseCommercialTone = (val: string): CommercialTone | undefined => {
  const v = val.toLowerCase();
  if (v.includes('clean') || v.includes('干净') || v.includes('极简')) return 'clean';
  if (v.includes('premium') || v.includes('高级') || v.includes('质感')) return 'premium';
  if (v.includes('luxury') || v.includes('奢华') || v.includes('奢侈')) return 'luxury';
  if (v.includes('tech') || v.includes('科技') || v.includes('现代')) return 'tech';
  if (v.includes('natural') || v.includes('自然') || v.includes('清新')) return 'natural';
  return undefined;
};

const parseSceneStrictness = (val: string): SceneStrictness | undefined => {
  const v = val.toLowerCase();
  if (v.includes('strict') || v.includes('严格') || v.includes('强')) return 'strict';
  if (v.includes('loose') || v.includes('宽松') || v.includes('弱') || v.includes('自由')) return 'loose';
  return undefined;
};

export const parseExcel = async (file: File): Promise<ExcelRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Read with header: "A" to get exact column letters, and defval: "" to ensure all columns exist in the object
        const json = XLSX.utils.sheet_to_json(worksheet, { header: "A", defval: "" }) as any[];

        if (json.length < 2) {
          resolve([]);
          return;
        }

        const headersRow = json[0];
        const rows: ExcelRow[] = [];

        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          
          // Skip completely empty rows
          const hasData = Object.values(row).some(val => val !== "");
          if (!hasData) continue;

          // Map back to header names for the fallback logic
          const rowByName: any = {};
          for (const colKey of Object.keys(headersRow)) {
            // Skip column D as requested to be ignored
            if (colKey === 'D') continue;
            
            const headerName = headersRow[colKey];
            if (headerName) {
              rowByName[headerName] = row[colKey];
            }
          }
          const optionalSource = { ...row, ...rowByName };

          // 1. Try to extract by header names first (most reliable)
          // Fields: 1. 尺寸, 2. 展示卖点说明, 3. 文案（卖点聚焦）, 4. 图片URL, 5. 场景提示词 / 其他备注
          let productTitle = getColumnValue(rowByName, ['展示卖点说明', '产品卖点说明', 'Product Title', 'Selling Points', '卖点', 'productTitle', 'product_title', 'Title', '标题']).trim();
          let size = getColumnValue(rowByName, ['尺寸', '图片尺寸', 'Size', 'Image Size', 'size', '比例']).trim();
          let copyText = getColumnValue(rowByName, ['文案（卖点聚焦）', '卖点聚焦', '文案', 'Copy Text', 'Text', 'copyText', 'copy_text', '文本']).trim();
          let refUrl = getColumnValue(rowByName, ['图片URL', '参考图片', '参考链接', '参考图', 'Reference URL', 'Image URL', 'URL', 'refUrl', 'ref_url', 'Reference Image', 'Reference', '链接']).trim();
          let customPrompt = getColumnValue(rowByName, ['场景提示词 / 其他备注', '场景提示词', '其他备注', '备注', '补充说明', 'prompt', 'Prompt', 'Remarks', 'Notes', 'customPrompt']).trim();
          const mode = getParsedColumnValue(optionalSource, ['模式', '出图模式', '生成模式', 'Mode', 'Generation Mode', 'mode'], parseMode, 'G');
          const imageType = getParsedColumnValue(optionalSource, ['图片类型', '图像类型', 'Image Type', 'imageType', 'image_type'], parseImageType, 'H');
          const language = getParsedColumnValue(optionalSource, ['语言', '输出语言', 'Language', 'language'], parseLanguage, 'J');
          const preserveProductText = getParsedColumnValue(
            optionalSource,
            ['保留产品文字', '保留商品文字', '保留产品文案', 'Preserve Product Text', 'preserveProductText', 'preserve_product_text'],
            parseBoolean,
            'K'
          );
          const commercialTone = getParsedColumnValue(
            optionalSource,
            ['商业风格', '商业调性', '风格调性', 'Commercial Tone', 'commercialTone', 'commercial_tone'],
            parseCommercialTone,
            'L'
          );
          const sceneStrictness = getParsedColumnValue(
            optionalSource,
            ['场景严格度', '场景自由度', '场景限制', 'Scene Strictness', 'sceneStrictness', 'scene_strictness'],
            parseSceneStrictness,
            'M'
          );

          // 2. If header names didn't match, fallback to column indices (assuming a standard template)
          // CORRECT EXCEL COLUMN STRUCTURE:
          // A = Aspect ratio / size
          // B = Selling point description
          // C = Copy text
          // D = intentionally blank / ignored / only for my own viewing
          // E = Image URL
          // F = customPrompt / supplemental notes
          if (!size) size = row['A'] ? String(row['A']).trim() : '';
          if (!productTitle) productTitle = row['B'] ? String(row['B']).trim() : '';
          if (!copyText) copyText = row['C'] ? String(row['C']).trim() : '';
          // D is ignored as requested
          if (!refUrl) refUrl = row['E'] ? String(row['E']).trim() : '';
          if (!customPrompt) customPrompt = row['F'] ? String(row['F']).trim() : '';

          // 3. Ultimate fallback for URL: search any cell in this row for a URL pattern
          // But avoid F column if we know it's for prompts
          if (!refUrl || (!refUrl.startsWith('http') && !refUrl.includes('://'))) {
            refUrl = ''; 
            // Only accept explicitly validated image URL formats for fallback
            const urlRegex = /(https?:\/\/[^\s\u4e00-\u9fa5]+\.(?:png|jpg|jpeg|webp|gif))/i;
            
            for (const key of Object.keys(row)) {
              // Skip D and F columns for URL search to avoid contamination
              if (key === 'D' || key === 'F') continue; 
              
              const val = String(row[key]).trim();
              const match = val.match(urlRegex);
              if (match && match[1]) {
                refUrl = match[1];
                break;
              }
            }
          }

          // 4. Also check for actual hyperlink objects in the row (in case display text is not the URL)
          if (!refUrl) {
            for (let c = 0; c < 20; c++) { // Check first 20 columns
              const cellRef = XLSX.utils.encode_cell({ c, r: i });
              const cell = worksheet[cellRef];
              if (cell && cell.l && cell.l.Target) {
                const target = String(cell.l.Target).trim();
                if (target.startsWith('http://') || target.startsWith('https://')) {
                  refUrl = target;
                  break;
                }
              }
            }
          }

          rows.push({
            id: `row-${i + 1}`,
            rowNumber: i + 1,
            copyText,
            size,
            productTitle,
            refUrl,
            customPrompt,
            status: 'pending',
            mode,
            imageType,
            language,
            preserveProductText,
            commercialTone,
            sceneStrictness
          });
        }

        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};
