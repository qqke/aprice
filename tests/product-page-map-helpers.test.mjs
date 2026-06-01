import assert from 'node:assert/strict';

import { buildExternalMapUrl, buildGoogleMapEmbedUrl, buildStoreMapModel } from '../src/lib/product-page-runtime.js';

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const clusteredModel = buildStoreMapModel([
  { id: 'a', name: 'Store A', lat: 35.648, lng: 139.722 },
  { id: 'b', name: 'Store B', lat: 35.661, lng: 139.698 },
  { id: 'c', name: 'Store C' },
], {
  selectedStoreId: 'b',
  featuredStoreIds: ['a'],
  highlightedStoreId: 'a',
});

assert.equal(clusteredModel.points.length, 2);
assert.equal(clusteredModel.missingCount, 1);
assert.equal(clusteredModel.points.find((point) => point.id === 'b')?.isSelected, true);
assert.equal(clusteredModel.points.find((point) => point.id === 'a')?.isFeatured, true);
assert.equal(clusteredModel.points.find((point) => point.id === 'a')?.isHighlighted, true);
for (const point of clusteredModel.points) {
  assert.ok(point.x >= 0 && point.x <= 100, `x out of range for ${point.id}: ${point.x}`);
  assert.ok(point.y >= 0 && point.y <= 100, `y out of range for ${point.id}: ${point.y}`);
}

const singlePointModel = buildStoreMapModel([
  { id: 'solo', name: 'Solo Store', lat: 35.65, lng: 139.7 },
]);
assert.equal(singlePointModel.singlePoint, true);
assert.equal(singlePointModel.points.length, 1);

const overlappingModel = buildStoreMapModel([
  { id: 'same-1', name: 'Same 1', lat: 35.65, lng: 139.7 },
  { id: 'same-2', name: 'Same 2', lat: 35.65, lng: 139.7 },
]);
assert.equal(overlappingModel.allSameSpot, true);
assert.equal(overlappingModel.points.length, 2);
assert.ok(
  pointDistance(overlappingModel.points[0], overlappingModel.points[1]) >= 9,
  'overlapping store markers should be visually separated',
);

const nearOverlapModel = buildStoreMapModel([
  { id: 'near-1', name: 'Near 1', lat: 35.6500, lng: 139.7000 },
  { id: 'near-2', name: 'Near 2', lat: 35.6501, lng: 139.7001 },
  { id: 'near-3', name: 'Near 3', lat: 35.6502, lng: 139.7002 },
]);
for (let i = 0; i < nearOverlapModel.points.length; i += 1) {
  for (let j = i + 1; j < nearOverlapModel.points.length; j += 1) {
    assert.ok(
      pointDistance(nearOverlapModel.points[i], nearOverlapModel.points[j]) >= 9,
      `nearby markers ${i} and ${j} should not sit on top of each other`,
    );
  }
}

const emptyModel = buildStoreMapModel([
  { id: 'missing-only', name: 'Missing Only' },
]);
assert.equal(emptyModel.points.length, 0);
assert.equal(emptyModel.missingCount, 1);

assert.match(
  buildExternalMapUrl({ id: 'coord-store', name: 'Coord Store', lat: 35.648, lng: 139.722 }),
  /google\.com\/maps\/search/,
);
assert.match(
  buildGoogleMapEmbedUrl({ id: 'coord-store', name: 'Coord Store', lat: 35.648, lng: 139.722 }),
  /maps\.google\.com\/maps/,
);
assert.match(
  buildExternalMapUrl({ id: 'fallback-store', name: 'Fallback Store', address: 'Tokyo, Shibuya' }),
  /google\.com\/maps\/search/,
);
