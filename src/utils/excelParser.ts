import * as XLSX from 'xlsx';
import { CommercialTone, ExcelRow, GenerationMode, ImageType, Language, SceneStrictness } from '../types';

const EMPTY_CELL_MARKERS = new Set(['/', '\uff0f', '-', '--', '\u2014', 'n/a', 'na', 'none', 'null', '\u65e0', '\u7a7a']);
const URL_TRAILING_PUNCTUATION_PATTERN = /[),.;:!?，。；：！？、）】》"'”’]+$/;

const normalizeCell = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }

  return EMPTY_CELL_MARKERS.has(normalized.toLowerCase()) ? '' : normalized;
};

const getColumnValue = (row: Record<string, unknown>, possibleNames: readonly string[]) => {
  for (const name of possibleNames) {
    const value = normalizeCell(row[name]);
    if (value) {
      return value;
    }
  }
  return '';
};

const normalizeExtractedUrl = (value: unknown) => {
  const normalized = normalizeCell(value).replace(URL_TRAILING_PUNCTUATION_PATTERN, '');
  return /^https?:\/\//i.test(normalized) ? normalized : '';
};

const getParsedColumnValue = <T>(
  row: Record<string, unknown>,
  possibleNames: readonly string[],
  parser: (value: string) => T | undefined,
  fallbackColumnKey?: string
): T | undefined => {
  const rawValue = getColumnValue(row, possibleNames) || normalizeCell(fallbackColumnKey ? row[fallbackColumnKey] : '');
  return rawValue ? parser(rawValue) : undefined;
};

const parseMode = (value: string): GenerationMode | undefined => {
  const normalized = value.toLowerCase();
  if (normalized.includes('background') || normalized.includes('\u80cc\u666f')) return 'background_transfer';
  if (normalized.includes('style') || normalized.includes('\u98ce\u683c')) return 'style_inspiration';
  if (normalized.includes('strict') || normalized.includes('layout') || normalized.includes('\u4e25\u683c') || normalized.includes('\u6784\u56fe')) return 'strict_layout_match';
  if (normalized.includes('lifestyle') || normalized.includes('\u573a\u666f') || normalized.includes('\u751f\u6d3b')) return 'lifestyle_listing';
  if (normalized.includes('infographic') || normalized.includes('detail') || normalized.includes('\u7ec6\u8282') || normalized.includes('\u767d\u5e95')) return 'infographic_listing';
  return undefined;
};

const parseImageType = (value: string): ImageType | undefined => {
  const normalized = value.toLowerCase();
  if (normalized.includes('main') || normalized.includes('\u4e3b\u56fe')) return 'main';
  if (normalized.includes('lifestyle') || normalized.includes('\u573a\u666f')) return 'lifestyle';
  if (normalized.includes('detail') || normalized.includes('\u7ec6\u8282')) return 'detail';
  if (normalized.includes('comparison') || normalized.includes('\u5bf9\u6bd4')) return 'comparison';
  if (normalized.includes('banner') || normalized.includes('\u6a2a\u5e45') || normalized.includes('\u6d77\u62a5')) return 'banner';
  return undefined;
};

const parseLanguage = (value: string): Language | undefined => {
  const normalized = value.toLowerCase();
  if (normalized.includes('en') || normalized.includes('english') || normalized.includes('\u82f1\u6587')) return 'en';
  if (normalized.includes('zh') || normalized.includes('chinese') || normalized.includes('\u4e2d\u6587')) return 'zh';
  if (normalized.includes('multi') || normalized.includes('\u591a\u8bed\u8a00')) return 'multi';
  if (normalized.includes('auto') || normalized.includes('\u81ea\u52a8')) return 'auto';
  return undefined;
};

const parseBoolean = (value: string): boolean | undefined => {
  const normalized = value.toLowerCase();
  if (['true', 'yes', 'y', '1', '\u662f'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', '\u5426'].includes(normalized)) return false;
  return undefined;
};

const parseCommercialTone = (value: string): CommercialTone | undefined => {
  const normalized = value.toLowerCase();
  if (normalized.includes('clean') || normalized.includes('\u5e72\u51c0') || normalized.includes('\u6781\u7b80')) return 'clean';
  if (normalized.includes('premium') || normalized.includes('\u9ad8\u7ea7') || normalized.includes('\u8d28\u611f')) return 'premium';
  if (normalized.includes('luxury') || normalized.includes('\u5962\u534e')) return 'luxury';
  if (normalized.includes('tech') || normalized.includes('\u79d1\u6280') || normalized.includes('\u73b0\u4ee3')) return 'tech';
  if (normalized.includes('natural') || normalized.includes('\u81ea\u7136') || normalized.includes('\u6e05\u65b0')) return 'natural';
  return undefined;
};

const parseSceneStrictness = (value: string): SceneStrictness | undefined => {
  const normalized = value.toLowerCase();
  if (normalized.includes('strict') || normalized.includes('\u4e25\u683c')) return 'strict';
  if (normalized.includes('loose') || normalized.includes('\u5bbd\u677e') || normalized.includes('\u81ea\u7531')) return 'loose';
  return undefined;
};

const HEADER_ALIASES = {
  size: ['\u56fe\u7247\u5c3a\u5bf8', '\u5c3a\u5bf8', '\u56fe\u7247\u5927\u5c0f', 'Image Size', 'Size', 'size', '\u5bbd\u9ad8\u6bd4', '\u6bd4\u4f8b'],
  productTitle: ['\u5c55\u793a\u5356\u70b9\u8bf4\u660e', '\u4ea7\u54c1\u5356\u70b9\u8bf4\u660e', '\u5356\u70b9\u8bf4\u660e', '\u5c55\u793a\u8bf4\u660e', 'Selling Points', 'Product Title', 'Title', '\u6807\u9898', 'productTitle', 'product_title'],
  copyText: ['\u56fe\u7247\u4e0a\u7684\u6587\u6848\uff08\u5356\u70b9\u805a\u7126\uff09', '\u56fe\u7247\u4e0a\u7684\u6587\u6848', '\u6587\u6848\uff08\u5356\u70b9\u805a\u7126\uff09', '\u56fe\u7247\u6587\u6848', '\u6587\u6848', 'Copy Text', 'Text', 'copyText', 'copy_text', '\u6587\u672c'],
  refUrl: ['\u53c2\u8003\u56fe\u7247\u7684URL', '\u53c2\u8003\u56fe\u7247URL', '\u53c2\u8003\u56feURL', '\u53c2\u8003\u56fe\u94fe\u63a5', '\u56fe\u7247URL', 'Reference URL', 'Image URL', 'URL', 'Reference Image', 'Reference', 'refUrl', 'ref_url', '\u94fe\u63a5'],
  customPrompt: ['\u573a\u666f\u63d0\u793a\u8bcd\u6216\u5176\u4ed6\u5907\u6ce8\uff08\u5f71\u54cd\u751f\u56fe\u7684\u573a\u666f\uff09', '\u573a\u666f\u63d0\u793a\u8bcd\u6216\u5176\u4ed6\u5907\u6ce8', '\u573a\u666f\u63d0\u793a\u8bcd', '\u5176\u4ed6\u5907\u6ce8', '\u5907\u6ce8', '\u8865\u5145\u8bf4\u660e', 'Prompt', 'Remarks', 'Notes', 'customPrompt'],
  mode: ['\u6a21\u5f0f', '\u51fa\u56fe\u6a21\u5f0f', '\u751f\u6210\u6a21\u5f0f', 'Mode', 'Generation Mode', 'mode'],
  imageType: ['\u56fe\u7247\u7c7b\u578b', '\u56fe\u50cf\u7c7b\u578b', 'Image Type', 'imageType', 'image_type'],
  language: ['\u8bed\u8a00', '\u8f93\u51fa\u8bed\u8a00', 'Language', 'language'],
  preserveProductText: ['\u4fdd\u7559\u4ea7\u54c1\u6587\u5b57', '\u4fdd\u7559\u5546\u54c1\u6587\u5b57', '\u4fdd\u7559\u4ea7\u54c1\u6587\u6848', 'Preserve Product Text', 'preserveProductText', 'preserve_product_text'],
  commercialTone: ['\u5546\u4e1a\u98ce\u683c', '\u5546\u4e1a\u8c03\u6027', '\u98ce\u683c\u8c03\u6027', 'Commercial Tone', 'commercialTone', 'commercial_tone'],
  sceneStrictness: ['\u573a\u666f\u4e25\u683c\u5ea6', '\u573a\u666f\u81ea\u7531\u5ea6', '\u573a\u666f\u9650\u5236', 'Scene Strictness', 'sceneStrictness', 'scene_strictness'],
} as const;

export const parseExcel = async (file: File): Promise<ExcelRow[]> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = event => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 'A', defval: '' }) as Record<string, unknown>[];

        if (rawRows.length < 2) {
          resolve([]);
          return;
        }

        const headersRow = rawRows[0];
        const parsedRows: ExcelRow[] = [];

        for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex += 1) {
          const row = rawRows[rowIndex];
          const hasData = Object.values(row).some(value => normalizeCell(value));
          if (!hasData) {
            continue;
          }

          const rowByName: Record<string, unknown> = {};
          Object.keys(headersRow).forEach(columnKey => {
            if (columnKey === 'D') {
              return;
            }

            const headerName = normalizeCell(headersRow[columnKey]);
            if (headerName) {
              rowByName[headerName] = row[columnKey];
            }
          });

          const optionalSource: Record<string, unknown> = { ...row, ...rowByName };

          let size = getColumnValue(rowByName, HEADER_ALIASES.size);
          let productTitle = getColumnValue(rowByName, HEADER_ALIASES.productTitle);
          let copyText = getColumnValue(rowByName, HEADER_ALIASES.copyText);
          let refUrl = getColumnValue(rowByName, HEADER_ALIASES.refUrl);
          let customPrompt = getColumnValue(rowByName, HEADER_ALIASES.customPrompt);

          const mode = getParsedColumnValue(optionalSource, HEADER_ALIASES.mode, parseMode, 'G');
          const imageType = getParsedColumnValue(optionalSource, HEADER_ALIASES.imageType, parseImageType, 'H');
          const language = getParsedColumnValue(optionalSource, HEADER_ALIASES.language, parseLanguage, 'J');
          const preserveProductText = getParsedColumnValue(optionalSource, HEADER_ALIASES.preserveProductText, parseBoolean, 'K');
          const commercialTone = getParsedColumnValue(optionalSource, HEADER_ALIASES.commercialTone, parseCommercialTone, 'L');
          const sceneStrictness = getParsedColumnValue(optionalSource, HEADER_ALIASES.sceneStrictness, parseSceneStrictness, 'M');

          if (!size) size = normalizeCell(row.A);
          if (!productTitle) productTitle = normalizeCell(row.B);
          if (!copyText) copyText = normalizeCell(row.C);
          if (!refUrl) refUrl = normalizeCell(row.E);
          if (!customPrompt) customPrompt = normalizeCell(row.F);

          refUrl = normalizeExtractedUrl(refUrl);

          if (!refUrl) {
            refUrl = '';
            const urlRegex = /(https?:\/\/[^\s\u4e00-\u9fa5]+)/i;
            for (const key of Object.keys(row)) {
              if (key === 'D' || key === 'F') {
                continue;
              }
              const value = normalizeCell(row[key]);
              const match = value.match(urlRegex);
              if (match?.[1]) {
                const normalizedUrl = normalizeExtractedUrl(match[1]);
                if (normalizedUrl) {
                  refUrl = normalizedUrl;
                  break;
                }
              }
            }
          }

          if (!refUrl) {
            for (let column = 0; column < 24; column += 1) {
              const cellRef = XLSX.utils.encode_cell({ c: column, r: rowIndex });
              const cell = worksheet[cellRef];
              const target = normalizeExtractedUrl(cell?.l?.Target);
              if (target) {
                refUrl = target;
                break;
              }
            }
          }

          parsedRows.push({
            id: `row-${rowIndex + 1}`,
            rowNumber: rowIndex + 1,
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
            sceneStrictness,
          });
        }

        resolve(parsedRows);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = error => reject(error);
    reader.readAsArrayBuffer(file);
  });
