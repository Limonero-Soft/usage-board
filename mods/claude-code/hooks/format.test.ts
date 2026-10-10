import { expect, test } from 'claude-code/testing'

import { bar, formatDuration, formatTokens, formatUsd, freePercent, topTools } from './format'

test('formatUsd muestra guion sin dato y 4 decimales bajo un centavo', () => {
  expect(formatUsd(null)).toBe('—')
  expect(formatUsd(0.0042)).toBe('$0.0042')
  expect(formatUsd(1.234)).toBe('$1.23')
})

test('formatDuration pasa de mm:ss a h:mm:ss', () => {
  expect(formatDuration(65_000)).toBe('01:05')
  expect(formatDuration(3_725_000)).toBe('1:02:05')
  expect(formatDuration(-5)).toBe('00:00')
})

test('formatTokens abrevia miles y millones', () => {
  expect(formatTokens(null)).toBe('—')
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(42_000)).toBe('42k')
  expect(formatTokens(1_000_000)).toBe('1.0M')
})

test('bar y freePercent se mantienen dentro de 0 a 100', () => {
  expect(bar(50, 10)).toBe('█████░░░░░')
  expect(bar(250, 4)).toBe('████')
  expect(freePercent(null)).toBe(null)
  expect(freePercent(37.4)).toBe(63)
  expect(freePercent(120)).toBe(0)
})

test('topTools ordena por uso y recorta', () => {
  expect(topTools({ Bash: 2, Read: 9, Edit: 5, Grep: 1 }, 2)).toEqual([
    ['Read', 9],
    ['Edit', 5],
  ])
})
