import { HttpError } from './http';

export interface ImagePayload {
  data: string;
  mimeType: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const isImagePayload = (value: unknown): value is ImagePayload =>
  Boolean(
    value
      && typeof value === 'object'
      && isNonEmptyString((value as { data?: unknown }).data)
      && isNonEmptyString((value as { mimeType?: unknown }).mimeType),
  );

export const assertImagePayload = (value: unknown, fieldLabel: string): ImagePayload => {
  if (!value || typeof value !== 'object') {
    throw new HttpError(400, 'INVALID_IMAGE_INPUT', `${fieldLabel}不能为空。`);
  }

  const data = typeof (value as { data?: unknown }).data === 'string'
    ? (value as { data: string }).data.trim()
    : '';
  const mimeType = typeof (value as { mimeType?: unknown }).mimeType === 'string'
    ? (value as { mimeType: string }).mimeType.trim()
    : '';

  if (!data) {
    throw new HttpError(400, 'INVALID_IMAGE_INPUT', `${fieldLabel}缺少图片数据。`);
  }

  if (!mimeType) {
    throw new HttpError(400, 'INVALID_IMAGE_INPUT', `${fieldLabel}缺少图片类型。`);
  }

  if (!mimeType.toLowerCase().startsWith('image/')) {
    throw new HttpError(400, 'INVALID_IMAGE_INPUT', `${fieldLabel}必须是有效的图片格式。`);
  }

  return { data, mimeType };
};

export const assertOptionalImageArray = (value: unknown, fieldLabel: string): ImagePayload[] => {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_IMAGE_INPUT', `${fieldLabel}必须是图片数组。`);
  }

  return value.map((item, index) => assertImagePayload(item, `${fieldLabel}第 ${index + 1} 张`));
};
