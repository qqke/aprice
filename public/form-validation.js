export function cleanJanCode(value = '') {
  return String(value || '').replace(/\D/g, '').trim();
}

export function validateJanCode(value) {
  const barcode = cleanJanCode(value);
  if (!/^\d{8}$|^\d{12,14}$/.test(barcode)) {
    return { ok: false, value: barcode, message: '请输入 8 位或 12-14 位 JAN 条码。' };
  }
  return { ok: true, value: barcode, message: '' };
}

export function validatePositiveYen(value) {
  const price = Number(value);
  if (!Number.isInteger(price) || price <= 0 || price > 9999999) {
    return { ok: false, value: price, message: '请输入有效的日元价格。' };
  }
  return { ok: true, value: price, message: '' };
}

export function validateOptionalHttpUrl(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { ok: true, value: '', message: '' };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, value: trimmed, message: '证据链接需要以 http 或 https 开头。' };
    }
    return { ok: true, value: url.toString(), message: '' };
  } catch {
    return { ok: false, value: trimmed, message: '请输入有效的证据链接。' };
  }
}

export function validateCoordinate(value, { label, min, max }) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    return { ok: false, value: number, message: `${label}需要在 ${min} 到 ${max} 之间。` };
  }
  return { ok: true, value: number, message: '' };
}

export function friendlyDataError(error) {
  const raw = String(error?.message || error || '').trim();
  if (!raw) return '请求失败，请稍后再试。';
  if (raw.includes('price_yen is required') || raw.includes('violates check constraint') || raw.includes('invalid input syntax')) {
    return '价格或数字格式不正确，请检查后再保存。';
  }
  if (raw.includes('jan_code is required') || raw.includes('barcode is required')) {
    return '请填写有效 JAN 条码。';
  }
  if (raw.includes('product already exists') || raw.includes('duplicate key')) {
    return '该商品已存在。';
  }
  if (raw.includes('admin privileges required')) {
    return '需要管理员权限。';
  }
  if (raw.includes('login required') || raw.includes('Please sign in first')) {
    return '请先登录后再操作。';
  }
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      return parsed.message || parsed.details || '请求失败，请检查输入内容。';
    } catch {
      return '请求失败，请检查输入内容。';
    }
  }
  return raw;
}
