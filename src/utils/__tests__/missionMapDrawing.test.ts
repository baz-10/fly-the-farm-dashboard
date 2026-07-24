import { describe, expect, test } from 'vitest';

import { appendDraftVertex, canFinishDrawing, cancelDrawing, finishDrawing } from '../missionMapDrawing';

describe('mission map drawing state', () => {
  test('finishes points after one vertex, lines after two, and shapes after three', () => {
    const one = appendDraftVertex([], [153.1, -27.4]);
    expect(canFinishDrawing('point', one)).toBe(true);
    expect(canFinishDrawing('line', one)).toBe(false);
    const two = appendDraftVertex(one, [153.2, -27.4]);
    expect(canFinishDrawing('line', two)).toBe(true);
    expect(canFinishDrawing('shape', two)).toBe(false);
    expect(canFinishDrawing('shape', appendDraftVertex(two, [153.2, -27.5]))).toBe(true);
  });

  test('creates GeoJSON-compatible geometry and cancels without output', () => {
    expect(finishDrawing('line', [[153.1, -27.4], [153.2, -27.5]])).toEqual({ type: 'LineString', coordinates: [[153.1, -27.4], [153.2, -27.5]] });
    expect(finishDrawing('shape', [[153.1, -27.4], [153.2, -27.4], [153.2, -27.5]])).toEqual({ type: 'Polygon', coordinates: [[[153.1, -27.4], [153.2, -27.4], [153.2, -27.5], [153.1, -27.4]]] });
    expect(cancelDrawing()).toEqual([]);
  });
});
