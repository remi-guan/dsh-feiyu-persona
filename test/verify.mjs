/**
 * 这个包里能单测的只有纯函数：正文/语气的归一与截断、文档外壳的剥离、
 * 库文件的读写。提示词段落和 HTTP 路由要靠宿主，放在 dsh 里手测。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  MAX_PERSONA_CHARS,
  MAX_SUFFIX_CHARS,
  normalizeStore,
  normalizeText,
  parseBundledPersona,
  parseBundledSuffix,
  readStore,
  writeStore,
} from '../lib/index.js'

const tests = []
const test = (title, fn) => tests.push({ title, fn })

test('normalizeText 去首尾空白、统一换行、按上限截断', () => {
  assert.equal(normalizeText('  a\r\nb  ', 100), 'a\nb')
  assert.equal(normalizeText(null, 100), '')
  assert.equal(normalizeText('x'.repeat(10), 4), 'xxxx')
})

test('normalizeStore 永远吐出四个字段，缺的不许当 undefined', () => {
  const s = normalizeStore({ persona: ' 她 ' })
  assert.deepEqual(Object.keys(s).sort(), ['enabled', 'persona', 'suffix', 'updatedAt'])
  assert.equal(s.persona, '她')
  assert.equal(s.suffix, '')
  assert.equal(s.enabled, true)
  assert.equal(normalizeStore({ enabled: false }).enabled, false)
  // 读坏了也不能抛：形状不对就当没读到
  assert.equal(normalizeStore('nope').persona, '')
})

test('读写一轮：写下去的能原样读回来', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feiyu-persona-'))
  const file = path.join(dir, 'persona.json')
  assert.equal(readStore(file), null)
  writeStore({ persona: '正文', suffix: '规矩', enabled: true, updatedAt: '2026-11-01T00:00:00Z' }, file)
  const back = readStore(file)
  assert.equal(back.persona, '正文')
  assert.equal(back.suffix, '规矩')
  assert.equal(back.updatedAt, '2026-11-01T00:00:00Z')
  // 写坏的文件要当没读到，而不是抛
  fs.writeFileSync(file, '{ 半个 json')
  assert.equal(readStore(file), null)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('persona.md 剥掉一级标题，剩下的就是正文', () => {
  const text = parseBundledPersona('# 小鱼（v6）\n\n第一段\n\n第二段\n')
  assert.equal(text, '第一段\n\n第二段')
})

test('suffix.md 只取代码块里的那几行', () => {
  const text = parseBundledSuffix('# 规矩\n\n说明文字。\n\n```\n称呼：主人\n收尾就停。\n```\n')
  assert.equal(text, '称呼：主人\n收尾就停。')
  // 没有围栏时整篇当正文
  assert.equal(parseBundledSuffix('只有一行'), '只有一行')
})

test('打包的正文与语气都在上限以内', () => {
  const persona = parseBundledPersona(fs.readFileSync(new URL('../persona.md', import.meta.url), 'utf8'))
  const suffix = parseBundledSuffix(fs.readFileSync(new URL('../suffix.md', import.meta.url), 'utf8'))
  assert.ok(persona.length > 100, '正文太短，多半剥错了')
  assert.ok(persona.length <= MAX_PERSONA_CHARS)
  assert.ok(suffix.split('\n').length >= 3, '语气规矩太短')
  assert.ok(suffix.length <= MAX_SUFFIX_CHARS)
})

let failed = 0
for (const { title, fn } of tests) {
  try {
    await fn()
    console.log(`ok   ${title}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${title}\n     ${error && error.message}`)
  }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
