export async function initProductPage({ loginUrl }) {

const { escapeAttribute, escapeHtml, recordRecentView, resolveBase, fetchNearbyPrices, fetchProductPricesPage, fetchStoresPage, formatDistance, formatYen, geolocate } = await import(window.__APriceConfig?.browserJsUrl || (window.__APriceConfig?.baseUrl || '/') + 'browser.js');
const { fetchFavorites, fetchPersonalLogs, formatDataError, getCurrentUser, indexLatestPersonalPricesByStore, submitStorePrice, toggleFavorite } = await import(window.__APriceConfig?.browserAuthJsUrl || (window.__APriceConfig?.baseUrl || '/') + 'browser-auth.js');
const { getPrivatePageStatusCopy, redirectToLogin, syncPrivatePageGate } = await import(window.__APriceConfig?.privatePageAuthJsUrl || (window.__APriceConfig?.baseUrl || '/') + 'private-page-auth.js');
const { validateOptionalHttpUrl, validatePositiveYen } = await import(window.__APriceConfig?.formValidationJsUrl || (window.__APriceConfig?.baseUrl || '/') + 'form-validation.js');

const page = document.querySelector('#product-page');
const productId = page?.dataset.productId || '';
const productName = page?.dataset.productName || '';
const productBrand = page?.dataset.productBrand || '';
const productPack = page?.dataset.productPack || '';
const productBarcode = page?.dataset.productBarcode || '';
const productTone = page?.dataset.productTone || 'sunset';

recordRecentView({
  id: productId,
  name: productName,
  brand: productBrand,
  pack: productPack,
  barcode: productBarcode,
  tone: productTone,
});

const storeSearch = document.querySelector('#personal-store-search');
const storeSearchClear = document.querySelector('#personal-store-search-clear');
const storeStatus = document.querySelector('#personal-store-status');
const storeList = document.querySelector('#personal-store-list');
const storeLoadMore = document.querySelector('#personal-store-load-more');
const form = document.querySelector('#personal-log-form');
const store = document.querySelector('#personal-store');
const price = document.querySelector('#personal-price');
const note = document.querySelector('#personal-note');
const evidenceUrl = document.querySelector('#personal-evidence-url');
const sharePublic = document.querySelector('#personal-share-public');
const status = document.querySelector('#personal-status');
const selectedStoreLabel = document.querySelector('#personal-selected-store-label');
const personalSubmitButton = form?.querySelector('button[type="submit"]');
const favoriteButton = document.querySelector('#favorite-product-button');
const favoriteStoreButton = document.querySelector('#favorite-store-button');
const authGate = document.querySelector('#product-auth-gate');
const authGateLink = document.querySelector('#product-login-link');
const heroGeoButton = document.querySelector('#hero-geo-sort');
const geoButton = document.querySelector('#geo-sort');
const geoStatus = document.querySelector('#geo-status');
const nearbyStatus = document.querySelector('#nearby-status');
const priceList = document.querySelector('#price-list');
const priceFlowMinPrice = document.querySelector('#price-flow-min-price');
const priceFlowStore = document.querySelector('#price-flow-store');
const priceFlowGapPill = document.querySelector('#price-flow-gap-pill');
const priceFlowGapNote = document.querySelector('#price-flow-gap-note');
const nearbyStoreList = document.querySelector('#nearby-store-list');
const insightPills = document.querySelector('#insight-pills');
const summaryMinPrice = document.querySelector('#summary-min-price');
const summaryStoreCount = document.querySelector('#summary-store-count');
const summaryLatestStore = document.querySelector('#summary-latest-store');
const summaryTrendLabel = document.querySelector('#summary-trend-label');
const summaryGainLabel = document.querySelector('#summary-gain-label');
const trendList = document.querySelector('#trend-list');
const trendLoadMoreButton = document.querySelector('#trend-load-more');

const STORE_PAGE_SIZE = 10;
let storeRows = [];
let storeSearchTerm = '';
let storeOffset = 0;
let storeHasMore = false;
let storeLoading = false;
let storeLoadError = '';
let storeRequestToken = 0;
let selectedStoreId = '';
let selectedStoreSnapshot = null;
let personalPriceLogs = [];
let personalPriceIndex = new Map();
let storeLocation = null;
let activeStoreId = '';
let favoriteProductIds = new Set();
let favoriteStoreIds = new Set();
let loadedPriceRows = [];
let priceNextCursor = null;
let pricePageLoading = false;

async function syncAuthGate() {
  const user = await getCurrentUser();
  syncPrivatePageGate({ gateEl: authGate, loginLinkEl: authGateLink, loginUrl, visible: !user });
  return user;
}

function toTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const r = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function storeDistance(storeItem) {
  if (!storeLocation || typeof storeItem?.lat !== 'number' || typeof storeItem?.lng !== 'number') {
    return null;
  }
  return distanceKm(storeLocation.lat, storeLocation.lng, storeItem.lat, storeItem.lng);
}

function compareStores(a, b) {
  const aDistance = storeDistance(a);
  const bDistance = storeDistance(b);
  const aHasDistance = Number.isFinite(aDistance);
  const bHasDistance = Number.isFinite(bDistance);

  if (aHasDistance && bHasDistance) {
    return aDistance - bDistance || String(a.name || '').localeCompare(String(b.name || ''), 'ja-JP');
  }
  if (aHasDistance) return -1;
  if (bHasDistance) return 1;
  return String(a.name || '').localeCompare(String(b.name || ''), 'ja-JP');
}

function getStorePersonalPrice(storeId) {
  return personalPriceIndex.get(String(storeId || '')) || null;
}

function getSelectedStore() {
  return storeRows.find((item) => item.id === selectedStoreId) || selectedStoreSnapshot || null;
}

function syncPersonalLogFormState({ focus = false } = {}) {
  const selectedStore = selectedStoreId ? getSelectedStore() : null;
  if (selectedStoreLabel) {
    selectedStoreLabel.textContent = selectedStore?.name || '未选择门店';
  }
  if (personalSubmitButton instanceof HTMLButtonElement) {
    personalSubmitButton.disabled = !selectedStoreId;
  }
  if (focus && price instanceof HTMLInputElement) {
    price.focus({ preventScroll: true });
  }
}

function syncStoreLoadMoreButton() {
  if (!(storeLoadMore instanceof HTMLButtonElement)) return;
  storeLoadMore.hidden = !storeHasMore && !storeLoading;
  storeLoadMore.disabled = storeLoading;
  storeLoadMore.textContent = storeLoading ? '加载中...' : '加载更多';
}

function renderStoreSelectionStatus(filteredCount) {
  if (!storeStatus) return;
  const total = storeRows.length;
  const selectedStore = getSelectedStore();
  const selectedPersonalPrice = selectedStore ? getStorePersonalPrice(selectedStore.id) : null;
  const queryActive = Boolean(storeSearchTerm);

  if (storeLoadError) {
    storeStatus.textContent = storeLoadError;
    return;
  }

  if (storeLoading && !total) {
    storeStatus.textContent = '正在加载门店...';
    return;
  }

  if (queryActive) {
    const selectedMatchesSearch = selectedStore ? storeRows.some((item) => item.id === selectedStore.id) : false;
    if (filteredCount) {
      storeStatus.textContent = selectedStore && !selectedMatchesSearch
        ? `已加载 ${filteredCount} 家匹配门店，当前选择已保留在顶部。${storeHasMore ? '继续加载可查看更多。' : ''}${selectedPersonalPrice ? ` 你的最新价是 ¥${selectedPersonalPrice.price_yen}。` : ''}`
        : `已加载 ${filteredCount} 家匹配门店。${storeHasMore ? '继续加载可查看更多。' : ''}${selectedPersonalPrice ? ` 你的最新价是 ¥${selectedPersonalPrice.price_yen}。` : ''}`;
    } else {
      storeStatus.textContent = selectedStore
        ? `没有匹配到搜索词，当前选择 ${selectedStore.name} 仍保留在顶部。`
        : '没有匹配到门店，换个关键词试试。';
    }
    return;
  }

  if (selectedStore) {
    storeStatus.textContent = selectedPersonalPrice
      ? `已选中 ${selectedStore.name}，你的最新价是 ¥${selectedPersonalPrice.price_yen}。`
      : `已选中 ${selectedStore.name}，输入后可保存你的第一笔价格。`;
    return;
  }

  storeStatus.textContent = storeLocation
    ? `门店已按当前位置优先排序，点击门店即可回填你的最新价。`
    : `门店已按名称排序，点击门店即可回填你的最新价。`;
}

function applySelectedStorePrice(storeId, { focus = false } = {}) {
  const personalPrice = getStorePersonalPrice(storeId);
  if (store) store.value = String(storeId || '');
  selectedStoreId = String(storeId || '');
  activeStoreId = selectedStoreId;
  selectedStoreSnapshot = storeRows.find((item) => item.id === selectedStoreId) || selectedStoreSnapshot;
  if (personalPrice && price) {
    price.value = String(personalPrice.price_yen);
  } else if (price) {
    price.value = '';
  }
  syncPersonalLogFormState({ focus });
  renderStorePicker();
  renderStoreSelectionStatus(storeRows.length);
  syncFavoriteButtons();
  if (status) {
    status.textContent = personalPrice
      ? `已回填你在该店的最新价 ¥${personalPrice.price_yen}，可直接修改后保存。`
      : '这家门店还没有你的个人价，输入后就能保存。';
  }
}

function renderStorePicker() {
  if (!storeList) return;
  if (storeLoading && !storeRows.length) {
    storeList.innerHTML = `
      <div class="notice notice--compact">
        <strong>正在加载门店</strong>
        <small>请稍候，正在读取第一页结果。</small>
      </div>
    `;
    renderStoreSelectionStatus(0);
    syncPersonalLogFormState();
    syncStoreLoadMoreButton();
    return;
  }

  const selectedStore = selectedStoreId ? getSelectedStore() : null;
  const visibleStores = selectedStore && !storeRows.some((item) => item.id === selectedStore.id)
    ? [selectedStore, ...storeRows]
    : storeRows;
  const uniqueStores = Array.from(new Map(visibleStores.map((item) => [item.id, item])).values()).slice();
  uniqueStores.sort((a, b) => {
    if (a.id === selectedStoreId && b.id !== selectedStoreId) return -1;
    if (b.id === selectedStoreId && a.id !== selectedStoreId) return 1;
    return compareStores(a, b);
  });

  if (!uniqueStores.length) {
    storeList.innerHTML = `
      <div class="notice notice--compact">
        <strong>没有匹配到门店</strong>
        <small>试试店名、连锁名、都道府县，或者清空搜索词。</small>
      </div>
    `;
    renderStoreSelectionStatus(0);
    syncPersonalLogFormState();
    syncStoreLoadMoreButton();
    return;
  }

  storeList.innerHTML = uniqueStores.map((item) => {
    const personalPrice = getStorePersonalPrice(item.id);
    const selected = item.id === selectedStoreId;
    const distance = storeDistance(item);
    const metaBits = [];
    if (item.chain_name) metaBits.push(item.chain_name);
    if (item.city || item.pref) metaBits.push([item.pref, item.city].filter(Boolean).join(' · '));
    if (Number.isFinite(distance)) metaBits.push(formatDistance(distance));
    if (personalPrice) metaBits.push(`我的价 ¥${personalPrice.price_yen}`);
    if (item.hours) metaBits.push(item.hours);
    return `
      <button
        class="feed__item store-picker__item${selected ? ' is-active' : ''}"
        type="button"
        data-store-id="${escapeAttribute(item.id)}"
        aria-pressed="${selected ? 'true' : 'false'}"
      >
        <div class="feed__copy">
          <strong>${escapeHtml(item.name || 'Unknown store')}</strong>
          <small>${escapeHtml(metaBits.filter(Boolean).join(' · '))}</small>
        </div>
        <div class="feed__meta">
          <span class="pill">${selected ? '已选中' : personalPrice ? '可回填' : '选择'}</span>
          <small>${personalPrice ? `¥${personalPrice.price_yen}` : '暂无我的价'}</small>
        </div>
      </button>
    `;
  }).join('');

  renderStoreSelectionStatus(storeRows.length);
  syncPersonalLogFormState();
  syncStoreLoadMoreButton();
}

async function refreshPersonalPriceState({ preserveSelection = true } = {}) {
  const user = await getCurrentUser();
  if (!user) {
    personalPriceLogs = [];
    personalPriceIndex = new Map();
    if (!preserveSelection) {
      selectedStoreId = '';
      selectedStoreSnapshot = null;
      if (store) store.value = '';
      activeStoreId = '';
    }
    renderStorePicker();
    syncPersonalLogFormState();
    if (status) status.textContent = productLogPrompt;
    return null;
  }

  personalPriceLogs = await fetchPersonalLogs(user.id);
  personalPriceIndex = indexLatestPersonalPricesByStore(personalPriceLogs, productId);
  renderStorePicker();

  if (selectedStoreId) {
    applySelectedStorePrice(selectedStoreId);
  } else if (status) {
    status.textContent = personalPriceLogs.length
      ? `已同步 ${personalPriceLogs.length} 条个人价格记录，点击门店即可回填最新价。`
      : '还没有这件商品的个人价格，选中门店后记第一笔。';
  }

  return user;
}

async function syncStoreLocation({ announce = false } = {}) {
  try {
    const location = await geolocate();
    storeLocation = location;
    renderStorePicker();
    if (announce && geoStatus) {
      geoStatus.textContent = `门店已按当前位置排序，定位点：${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}。`;
    }
    return location;
  } catch {
    storeLocation = null;
    renderStorePicker();
    renderStoreSelectionStatus(storeRows.length);
    if (announce && geoStatus) geoStatus.textContent = '定位失败，门店已按名称排序。';
    return null;
  }
}

function trendMeta(delta) {
  if (delta === null) return { label: '最新', tone: 'trend--flat', arrow: '→' };
  if (delta === 0) return { label: '持平', tone: 'trend--flat', arrow: '→' };
  if (delta > 0) return { label: `上涨 ${formatYen(delta)}`, tone: 'trend--up', arrow: '↑' };
  return { label: `下跌 ${formatYen(Math.abs(delta))}`, tone: 'trend--down', arrow: '↓' };
}

function syncFavoriteButton(button, isActive, { activeLabel, inactiveLabel, disabled = false } = {}) {
  if (!button) return;
  button.disabled = disabled;
  button.textContent = isActive ? activeLabel : inactiveLabel;
}

function syncFavoriteButtons() {
  syncFavoriteButton(favoriteButton, favoriteProductIds.has(productId), {
    activeLabel: '取消商品收藏',
    inactiveLabel: '添加商品收藏',
  });
  const favoriteStoreId = selectedStoreId || activeStoreId;
  syncFavoriteButton(favoriteStoreButton, favoriteStoreId && favoriteStoreIds.has(favoriteStoreId), {
    activeLabel: '取消门店收藏',
    inactiveLabel: '添加门店收藏',
    disabled: !favoriteStoreId,
  });
}

function syncNearbyFavoriteButtons() {
  nearbyStoreList?.querySelectorAll('[data-favorite-store]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const storeId = button.dataset.favoriteStore || '';
    button.textContent = storeId && favoriteStoreIds.has(storeId) ? '取消收藏门店' : '收藏门店';
  });
}

async function syncFavoriteStates() {
  const user = await getCurrentUser();
  if (!user) {
    favoriteProductIds = new Set();
    favoriteStoreIds = new Set();
    syncFavoriteButtons();
    syncNearbyFavoriteButtons();
    return;
  }

  try {
    const list = await fetchFavorites(user.id);
    favoriteProductIds = new Set(list.filter((item) => item.entity_type === 'product').map((item) => String(item.entity_id)));
    favoriteStoreIds = new Set(list.filter((item) => item.entity_type === 'store').map((item) => String(item.entity_id)));
    syncFavoriteButtons();
    syncNearbyFavoriteButtons();
  } catch (error) {
    favoriteProductIds = new Set();
    favoriteStoreIds = new Set();
    syncFavoriteButtons();
    syncNearbyFavoriteButtons();
    if (status) status.textContent = getPrivatePageStatusCopy('product', 'favoriteFailure', { message: error.message });
  }
}

function renderPrices(rows) {
  if (!priceList) return;
  if (!rows.length) {
    if (priceFlowMinPrice) priceFlowMinPrice.textContent = '暂无';
    if (priceFlowStore) priceFlowStore.textContent = '当前还没有价格记录。';
    if (priceFlowGapPill) priceFlowGapPill.textContent = '暂无差距';
    if (priceFlowGapNote) priceFlowGapNote.textContent = '补充第一条价格后，这里会自动显示最低价摘要。';
    priceList.innerHTML = `
      <div class="feed__item">
        <div>
          <strong>暂无价格</strong>
          <small>这件商品还没有价格记录。</small>
        </div>
        <span class="price">暂无</span>
      </div>
    `;
    return;
  }

  const minPrice = Math.min(...rows.map((row) => row.price_yen));
  const lowestRow = rows[0] || null;
  const nextLowestRow = rows[1] || null;
  const nextLowestGap = nextLowestRow ? nextLowestRow.price_yen - minPrice : null;
  const nextLowestGapLabel = nextLowestGap === null
    ? '暂无次低价'
    : nextLowestGap === 0
      ? '与次低价持平'
      : `比次低价低 ${formatYen(nextLowestGap)}`;
  const lowestStoreLabel = lowestRow
      ? `${lowestRow.stores?.name || 'Unknown store'}${lowestRow.stores?.city ? ` · ${lowestRow.stores.city}` : ''}${lowestRow.stores?.hours ? ` · ${lowestRow.stores.hours}` : ''}`
    : '等待价格数据';
  if (priceFlowMinPrice) priceFlowMinPrice.textContent = `¥${minPrice}`;
  if (priceFlowStore) priceFlowStore.textContent = lowestStoreLabel;
  if (priceFlowGapPill) priceFlowGapPill.textContent = nextLowestGap === null ? '单条价格' : nextLowestGap === 0 ? '最低价持平' : `次低价差 ${formatYen(nextLowestGap)}`;
  if (priceFlowGapNote) priceFlowGapNote.textContent = nextLowestGap === null
    ? `当前共有 ${rows.length} 条价格，最低价已置顶。`
    : `当前共有 ${rows.length} 条价格，${nextLowestGapLabel}。`;

  priceList.innerHTML = rows.map((row, index) => {
    const gap = row.price_yen - minPrice;
    const gapPercent = minPrice > 0 ? Math.round((gap / minPrice) * 100) : 0;
    const gapTier = gap === 0
      ? { tone: 'trend--flat', label: '最低价', percent: '0%', bar: 'gap--best', ratio: 1 }
      : gap <= 150
        ? { tone: 'trend--up', label: `高 ${formatYen(gap)}`, percent: `+${gapPercent}%`, bar: 'gap--near', ratio: 0.72 }
        : gap <= 400
          ? { tone: 'trend--down', label: `高 ${formatYen(gap)}`, percent: `+${gapPercent}%`, bar: 'gap--mid', ratio: 0.45 }
          : { tone: 'trend--down', label: `高 ${formatYen(gap)}`, percent: `+${gapPercent}%`, bar: 'gap--far', ratio: 0.22 };
    const priceHref = resolveBase(`product/${productId}/`);
    const distanceLabel = row.distance_km !== null && row.distance_km !== undefined ? ` · ${formatDistance(row.distance_km)}` : '';
    const barWidth = Math.max(12, Math.round(gapTier.ratio * 100));
    return index === 0 ? `
      <a class="feed__item feed__item--featured" href="${escapeAttribute(priceHref)}">
        <div class="feed__copy">
          <div class="feed__kicker">最低价 · ${row.is_member_price ? '会员价' : '公开价'}</div>
          <strong>${escapeHtml(row.stores?.name || 'Unknown store')}</strong>
          <small>${escapeHtml(row.stores?.city || '')}${distanceLabel}${row.stores?.hours ? ` · ${escapeHtml(row.stores.hours)}` : ''}</small>
        </div>
        <div class="feed__meta">
          <div class="price">¥${row.price_yen}</div>
          <span class="pill ${gapTier.tone}">${gapTier.label} · ${gapTier.percent}</span>
          <div class="price-gap">
            <span class="price-gap__label ${gapTier.bar}">${gapTier.label}</span>
            <span class="price-gap__percent ${gapTier.tone}">${gapPercent}%</span>
            <span class="price-gap__track"><span class="price-gap__fill ${gapTier.bar}" data-bar-width="${barWidth}"></span></span>
          </div>
        </div>
      </a>
    ` : `
      <a class="feed__item" href="${escapeAttribute(priceHref)}">
        <div>
          <strong>${escapeHtml(row.stores?.name || 'Unknown store')}</strong>
          <small>${escapeHtml(row.stores?.city || '')}${distanceLabel}${row.is_member_price ? ' · 会员价' : ' · 公开价'}${row.stores?.hours ? ` · ${escapeHtml(row.stores.hours)}` : ''}</small>
        </div>
        <div class="feed__meta">
          <span class="price">¥${row.price_yen}</span>
          <span class="pill ${gapTier.tone}">${gapTier.label} · ${gapTier.percent}</span>
          <div class="price-gap">
            <span class="price-gap__track"><span class="price-gap__fill ${gapTier.bar}" data-bar-width="${barWidth}"></span></span>
          </div>
        </div>
      </a>
    `;
  }).join('');

  priceList.querySelectorAll('[data-bar-width]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const width = el.dataset.barWidth;
    if (width) el.style.setProperty('--bar-width', `${width}%`);
  });
}

function renderNearbyStores(rows) {
  if (!nearbyStoreList) return;
  activeStoreId = selectedStoreId;
  syncFavoriteButtons();
  nearbyStoreList.innerHTML = rows.length
    ? rows.map((row, index) => index === 0 ? `
      <div class="feed__item feed__item--featured">
        <div class="feed__copy">
          <div class="feed__kicker">最近门店</div>
          <strong>${escapeHtml(row.stores?.name || 'Unknown store')}</strong>
          <small>${escapeHtml(row.stores?.city || '')}${row.stores?.pref ? ` · ${escapeHtml(row.stores.pref)}` : ''}${row.stores?.hours ? ` · ${escapeHtml(row.stores.hours)}` : ''}</small>
        </div>
        <div class="feed__meta">
          <div class="price">¥${row.price_yen}</div>
          <span class="pill">${row.is_member_price ? '会员价' : '公开价'}</span>
          <button class="button button--ghost product-nearby__favorite" type="button" data-favorite-store="${escapeAttribute(row.store_id)}">收藏</button>
        </div>
      </div>
    ` : `
      <div class="feed__item">
        <div>
          <strong>${escapeHtml(row.stores?.name || 'Unknown store')}</strong>
          <small>${escapeHtml(row.stores?.city || '')}${row.stores?.pref ? ` · ${escapeHtml(row.stores.pref)}` : ''}${row.stores?.hours ? ` · ${escapeHtml(row.stores.hours)}` : ''}</small>
        </div>
        <div class="feed__meta">
          <span class="price">¥${row.price_yen}</span>
          <span class="pill">${row.is_member_price ? '会员价' : '公开价'}</span>
          <button class="button button--ghost product-nearby__favorite" type="button" data-favorite-store="${escapeAttribute(row.store_id)}">收藏</button>
        </div>
      </div>
    `).join('')
    : `
      <div class="feed__item">
        <div>
          <strong>没有附近数据</strong>
          <small>请补充门店坐标和价格。</small>
        </div>
        <span class="price">暂无</span>
      </div>
    `;
  syncNearbyFavoriteButtons();
}

function renderInsights(rows) {
  if (!insightPills || !summaryMinPrice || !summaryStoreCount || !summaryLatestStore || !summaryTrendLabel || !summaryGainLabel) return;
  if (!rows.length) {
    summaryMinPrice.textContent = '暂无';
    summaryStoreCount.textContent = '0 家';
    summaryLatestStore.textContent = '暂无';
    summaryTrendLabel.textContent = '暂无';
    summaryGainLabel.textContent = '补一条价格后再看趋势';
    insightPills.innerHTML = '<span class="pill">暂无价格数据</span>';
    if (trendList) {
      trendList.innerHTML = `
        <div class="feed__item">
          <div>
            <strong>暂无趋势</strong>
            <small>插入几条价格记录后就会出现。</small>
          </div>
          <span class="price">暂无</span>
        </div>
      `;
    }
    return;
  }

  const latest = rows[0];
  const minPrice = Math.min(...rows.map((row) => row.price_yen));
  const storeCount = new Set(rows.map((row) => row.store_id)).size;
  const older = rows[1];
  const latestTime = toTime(latest?.collected_at);
  const sevenDaysAgo = latestTime ? latestTime - 7 * 24 * 60 * 60 * 1000 : 0;
  const windowRows = latestTime
    ? rows.filter((row) => toTime(row.collected_at) >= sevenDaysAgo)
    : rows.slice(0, 1);
  const windowFirst = windowRows[windowRows.length - 1];
  const windowLast = windowRows[0];
  const windowDelta = windowFirst && windowLast ? windowLast.price_yen - windowFirst.price_yen : null;
  const windowLabel = windowDelta === null
    ? '近7天暂无趋势'
    : windowDelta === 0
      ? '近7天持平'
      : windowDelta > 0
        ? `近7天上涨 ${formatYen(windowDelta)}`
        : `近7天下降 ${formatYen(Math.abs(windowDelta))}`;
  const priceDelta = older ? latest.price_yen - older.price_yen : null;
  const priceTrend = trendMeta(priceDelta);
  const summaryTrend = trendMeta(windowDelta);
  const change = priceDelta === null
    ? '暂无上次采样'
    : priceDelta === 0
      ? '较上次采样持平'
      : priceDelta > 0
        ? `较上次采样涨 ${formatYen(priceDelta)}`
        : `较上次采样降 ${formatYen(Math.abs(priceDelta))}`;

  summaryMinPrice.textContent = `¥${minPrice}`;
  summaryStoreCount.textContent = `${storeCount} 家`;
  summaryLatestStore.textContent = latest?.stores?.name || '未知门店';
  summaryTrendLabel.textContent = windowLabel;
  summaryGainLabel.textContent = change;

  insightPills.innerHTML = `
    <span class="pill">最低价 ¥${minPrice}</span>
    <span class="pill">${storeCount} 家门店</span>
    <span class="pill ${summaryTrend.tone}">${summaryTrend.arrow} ${windowLabel}</span>
    <span class="pill ${priceTrend.tone}">${priceTrend.arrow} ${change}</span>
    <span class="pill">最新采样：${escapeHtml(latest?.stores?.name || 'unknown')}</span>
  `;

  if (trendList) {
    trendList.innerHTML = rows.slice(0, 3).map((row, index) => {
      const nextRow = rows[index + 1];
      const delta = nextRow ? row.price_yen - nextRow.price_yen : null;
      const deltaLabel = delta === null
        ? '最新'
        : delta === 0
          ? '持平'
          : delta > 0
            ? `+${formatYen(delta)}`
            : `-${formatYen(Math.abs(delta))}`;
      const dateLabel = row.collected_at ? new Date(row.collected_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '未知时间';
      return index === 0 ? `
        <div class="feed__item feed__item--featured">
          <div class="feed__copy">
            <div class="feed__kicker ${summaryTrend.tone}">${summaryTrend.arrow} ${windowLabel}</div>
            <strong>${escapeHtml(row.stores?.name || 'Unknown store')}</strong>
            <small>${dateLabel} · ${row.is_member_price ? '会员价' : '公开价'}</small>
          </div>
          <div class="feed__meta">
            <div class="price">${formatYen(row.price_yen)}</div>
            <small class="trend__delta">${deltaLabel}</small>
          </div>
        </div>
      ` : `
        <div class="feed__item">
          <div>
            <strong>${escapeHtml(row.stores?.name || 'Unknown store')}</strong>
            <small>${dateLabel} · ${row.is_member_price ? '会员价' : '公开价'}</small>
          </div>
          <div class="feed__meta">
            <span class="price">${formatYen(row.price_yen)}</span>
            <small class="trend__delta">${deltaLabel}</small>
          </div>
        </div>
      `;
    }).join('');
  }
}

function syncTrendLoadMoreButton() {
  if (!(trendLoadMoreButton instanceof HTMLButtonElement)) return;
  trendLoadMoreButton.hidden = !priceNextCursor && !pricePageLoading;
  trendLoadMoreButton.disabled = pricePageLoading;
  trendLoadMoreButton.textContent = pricePageLoading ? '加载中...' : '加载更多历史';
}

async function loadPrices() {
  try {
    const page = await fetchProductPricesPage(productId, { limit: 90, sinceDays: 60 });
    loadedPriceRows = page.items || [];
    priceNextCursor = page.nextCursor || null;
    renderPrices(loadedPriceRows);
    renderNearbyStores(loadedPriceRows);
    renderInsights(loadedPriceRows);
    syncTrendLoadMoreButton();
    if (geoStatus) geoStatus.textContent = loadedPriceRows.length ? `已加载 ${loadedPriceRows.length} 条价格记录。` : `当前还没有 ${productName} 的价格记录。`;
    if (nearbyStatus) nearbyStatus.textContent = loadedPriceRows.length ? `已显示 ${loadedPriceRows.length} 条门店价格。` : '补第一条价格再看门店流。';
  } catch (error) {
    loadedPriceRows = [];
    priceNextCursor = null;
    renderPrices([]);
    renderNearbyStores([]);
    renderInsights([]);
    syncTrendLoadMoreButton();
    if (geoStatus) geoStatus.textContent = `价格加载失败：${error.message}`;
    if (nearbyStatus) nearbyStatus.textContent = '价格加载失败后仍可选择门店记录个人价格。';
  }
}

async function loadMoreTrendRows() {
  if (!priceNextCursor || pricePageLoading) return;
  pricePageLoading = true;
  syncTrendLoadMoreButton();
  try {
    const page = await fetchProductPricesPage(productId, {
      limit: 90,
      sinceDays: 60,
      cursor: priceNextCursor,
    });
    const deduped = new Map(loadedPriceRows.map((row) => [row.id, row]));
    for (const row of page.items || []) {
      deduped.set(row.id, row);
    }
    loadedPriceRows = Array.from(deduped.values()).sort((a, b) => {
      const at = toTime(a?.collected_at);
      const bt = toTime(b?.collected_at);
      if (bt !== at) return bt - at;
      return String(b?.id || '').localeCompare(String(a?.id || ''));
    });
    priceNextCursor = page.nextCursor || null;
    renderInsights(loadedPriceRows);
  } finally {
    pricePageLoading = false;
    syncTrendLoadMoreButton();
  }
}

async function loadStores({ reset = false } = {}) {
  const requestToken = ++storeRequestToken;
  storeLoading = true;
  syncStoreLoadMoreButton();
  if (reset) {
    storeRows = [];
    storeOffset = 0;
    storeHasMore = false;
    renderStorePicker();
  }
  try {
    const page = await fetchStoresPage({
      term: storeSearchTerm,
      limit: STORE_PAGE_SIZE,
      offset: storeOffset,
    });
    if (requestToken !== storeRequestToken) return;
    const nextRows = reset ? page.rows : [...storeRows, ...page.rows];
    storeRows = Array.from(new Map(nextRows.map((item) => [item.id, item])).values());
    storeOffset = page.nextOffset;
    storeHasMore = page.hasMore;
    storeLoadError = '';
    renderStorePicker();
  } catch (error) {
    if (requestToken !== storeRequestToken) return;
    storeLoadError = `门店加载失败：${error.message}`;
    if (storeStatus) storeStatus.textContent = storeLoadError;
  } finally {
    if (requestToken !== storeRequestToken) return;
    storeLoading = false;
    renderStorePicker();
  }
}

storeSearch?.addEventListener('input', () => {
  storeSearchTerm = storeSearch.value || '';
  if (storeSearchClear) storeSearchClear.hidden = !storeSearchTerm;
  void loadStores({ reset: true });
});
storeSearchClear?.addEventListener('click', () => {
  if (storeSearch) storeSearch.value = '';
  storeSearchTerm = '';
  storeSearchClear.hidden = true;
  void loadStores({ reset: true });
  storeSearch?.focus();
});

storeLoadMore?.addEventListener('click', () => {
  void loadStores();
});

storeList?.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement ? event.target.closest('[data-store-id]') : null;
  if (!(target instanceof HTMLElement)) return;
  const storeId = target.dataset.storeId;
  if (!storeId) return;
  applySelectedStorePrice(storeId, { focus: true });
});

favoriteButton?.addEventListener('click', async () => {
  const user = await getCurrentUser();
  if (!user) {
    syncPrivatePageGate({ gateEl: authGate, loginLinkEl: authGateLink, loginUrl, visible: true });
    redirectToLogin(loginUrl, authGate);
    return;
  }

  try {
    const result = await toggleFavorite('product', productId);
    if (result?.action === 'added') favoriteProductIds.add(productId);
    if (result?.action === 'removed') favoriteProductIds.delete(productId);
    syncFavoriteButtons();
  } catch (error) {
    if (status) status.textContent = getPrivatePageStatusCopy('product', 'favoriteFailure', { message: error.message });
  }
});

favoriteStoreButton?.addEventListener('click', async () => {
  const user = await getCurrentUser();
  if (!user) {
    syncPrivatePageGate({ gateEl: authGate, loginLinkEl: authGateLink, loginUrl, visible: true });
    redirectToLogin(loginUrl, authGate);
    return;
  }

  const favoriteStoreId = selectedStoreId || activeStoreId;
  if (!favoriteStoreId) {
    return;
  }

  try {
    const result = await toggleFavorite('store', favoriteStoreId);
    if (result?.action === 'added') favoriteStoreIds.add(favoriteStoreId);
    if (result?.action === 'removed') favoriteStoreIds.delete(favoriteStoreId);
    syncFavoriteButtons();
    syncNearbyFavoriteButtons();
  } catch (error) {
    if (status) status.textContent = getPrivatePageStatusCopy('product', 'favoriteFailure', { message: error.message });
  }
});

nearbyStoreList?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const storeId = target.dataset.favoriteStore;
  if (!storeId) return;

  const user = await getCurrentUser();
  if (!user) {
    syncPrivatePageGate({ gateEl: authGate, loginLinkEl: authGateLink, loginUrl, visible: true });
    redirectToLogin(loginUrl, authGate);
    return;
  }

  try {
    const result = await toggleFavorite('store', storeId);
    if (result?.action === 'added') favoriteStoreIds.add(storeId);
    if (result?.action === 'removed') favoriteStoreIds.delete(storeId);
    syncFavoriteButtons();
    syncNearbyFavoriteButtons();
  } catch (error) {
    if (status) status.textContent = getPrivatePageStatusCopy('product', 'favoriteFailure', { message: error.message });
  }
});

geoButton?.addEventListener('click', async () => {
  if (!geoStatus) return;
  geoStatus.textContent = '获取位置...';
  try {
    const location = await syncStoreLocation({ announce: true });
    if (!location) return;
    const rows = await fetchNearbyPrices({ productId, lat: location.lat, lng: location.lng, radiusKm: 20, limit: 220, sinceDays: 60 });
    renderPrices(rows);
    renderNearbyStores(rows);
    renderInsights(rows);
    geoStatus.textContent = `已按当前位置排序，定位点：${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}。`;
    renderStoreSelectionStatus(storeRows.length);
    if (nearbyStatus) nearbyStatus.textContent = rows.length ? `已按当前位置筛出 ${rows.length} 条门店价格。` : '当前位置附近暂无可比价格。';
  } catch (error) {
    geoStatus.textContent = `定位失败：${error.message}`;
  }
});

heroGeoButton?.addEventListener('click', () => {
  document.querySelector('#product-price-flow')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  geoButton?.click();
});

trendLoadMoreButton?.addEventListener('click', () => {
  void loadMoreTrendRows();
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = await getCurrentUser();
  if (!user) {
    syncPrivatePageGate({ gateEl: authGate, loginLinkEl: authGateLink, loginUrl, visible: true });
    status.textContent = getPrivatePageStatusCopy('product', 'logRequired');
    redirectToLogin(loginUrl, authGate);
    return;
  }

  try {
    if (!selectedStoreId && !store?.value) {
      status.textContent = '请选择门店后记录价格。';
      return;
    }
    const priceValidation = validatePositiveYen(price.value);
    if (!priceValidation.ok) {
      status.textContent = priceValidation.message;
      return;
    }
    const evidenceValidation = validateOptionalHttpUrl(evidenceUrl?.value?.trim?.() || '');
    if (!evidenceValidation.ok) {
      status.textContent = evidenceValidation.message;
      return;
    }
    const shouldShare = sharePublic instanceof HTMLInputElement ? sharePublic.checked : false;
    await submitStorePrice({
      product_id: productId,
      store_id: store?.value || selectedStoreId || null,
      price_yen: priceValidation.value,
      note: note.value.trim(),
      evidence_url: evidenceValidation.value,
      share_to_public: shouldShare,
      purchased_at: new Date().toISOString().slice(0, 10),
    });
    price.value = '';
    note.value = '';
    if (evidenceUrl) evidenceUrl.value = '';
    await refreshPersonalPriceState({ preserveSelection: true });
    status.textContent = shouldShare
      ? `已提交 ${formatYen(priceValidation.value)}，审核后会进入公共比价。`
      : getPrivatePageStatusCopy('product', 'logSuccess', { price: formatYen(priceValidation.value) });
  } catch (error) {
    status.textContent = getPrivatePageStatusCopy('product', 'logFailure', { message: formatDataError(error) });
  }
});

await syncAuthGate();
await syncFavoriteStates();
await Promise.all([loadStores({ reset: true }), loadPrices(), refreshPersonalPriceState()]);
void syncStoreLocation();
  }
