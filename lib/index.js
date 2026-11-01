/**
 * dsh-feiyu-persona
 *
 * 一条人设、全局生效。比原版 dsh-persona-dafeiyu 少掉的东西都是故意的：
 * 没有工作区档、没有会话档、没有多套人设库、没有导入导出——设置页只有两栏，
 * 一栏正文，一栏语气规矩，改完下一个请求就生效。
 *
 * 三个段落进提示词：
 *   1. `feiyu:persona`          order 0      人设正文，常驻在最前
 *   2. `feiyu:persona-suffix`   order 10200  语气规矩，跟工具指导之后
 *   3. `feiyu:persona-echo`     order 10900  按 token 触发的补课，不常驻
 *
 * 为什么正文和语气要分开：正文是「她是谁」，语气是「她怎么说话」。前者稳定，
 * 后者容易在长对话里被淹没，所以后者多挂了一份定期提醒。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-feiyu-persona'
/** 只依赖提示词服务；设置页那一半是单独的客户端入口。 */
export const inject = ['systemPrompt']

export const PERSONA_SECTION = 'feiyu:persona'
export const PERSONA_SUFFIX_SECTION = 'feiyu:persona-suffix'
export const PERSONA_ECHO_CONTEXT = 'feiyu:persona-echo'

export const API_STATUS_PATH = '/api/dsh-feiyu-persona/status'
export const API_SAVE_PATH = '/api/dsh-feiyu-persona/save'

/** 正文上限：够写一份长人设，又不至于把上下文吃光。 */
export const MAX_PERSONA_CHARS = 64_000
/** 语气规矩上限：它每一轮都在，写再长也只是稀释注意力。 */
export const MAX_SUFFIX_CHARS = 8_000

const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** 宿主侧没有单独的「提示词顺序」配置，这两个值取自 dsh-system-prompt 的 SECTION_ORDERS。 */
const PERSONA_ORDER = 0
const SUFFIX_ORDER = 10200
const ECHO_ORDER = 10900

const DEFAULTS = {
  enabled: true,
  // 上下文又长胖这么多 token，就在下一轮开口前补一次话术提醒。0 = 关。
  suffixEchoTokens: 15_000,
}

/** 人设存在 `<DSH_HOME>/feiyu-persona/persona.json`，跟其它插件同一处惯例。 */
export function storePath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'feiyu-persona', 'persona.json')
}

/**
 * 打包自带的默认正文与语气：仓库根目录的 persona.md / suffix.md，删了也不影响运行。
 * 两个文件同时是给人看的文档，所以要剥掉文档外壳：一级标题、说明段、代码围栏。
 *   - persona.md：去掉开头那行 `# ...`，剩下的就是正文；
 *   - suffix.md：取第一个 ``` 代码块里的内容，围栏外是说明文字。
 */
function readBundledDoc(file) {
  try {
    return fs.readFileSync(path.join(PACKAGE_ROOT, file), 'utf8')
  } catch {
    return ''
  }
}

export function parseBundledPersona(markdown) {
  return String(markdown || '')
    .replace(/^\s*#\s.*\n+/, '')
    .trim()
}

export function parseBundledSuffix(markdown) {
  const text = String(markdown || '')
  const fenced = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/)
  return (fenced ? fenced[1] : text).trim()
}

function bundled(file, fallback) {
  const raw = readBundledDoc(file)
  const text = file.endsWith('suffix.md') ? parseBundledSuffix(raw) : parseBundledPersona(raw)
  return text.length > 0 ? text : fallback
}

/**
 * 把一段用户输入收成能存的样子：去掉首尾空白、压掉过长的行、限制字数。
 * 保留换行，人设是分行写的。
 */
export function normalizeText(value, limit) {
  const text = typeof value === 'string' ? value : ''
  const trimmed = text.replace(/\r\n?/g, '\n').trim()
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
}

/**
 * 库文件的形状：永远是这三个字段齐全的对象。
 * 读坏了就当没读过，交给调用方回落到默认值，不静默改写文件。
 */
export function normalizeStore(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    persona: normalizeText(source.persona, MAX_PERSONA_CHARS),
    suffix: normalizeText(source.suffix, MAX_SUFFIX_CHARS),
    enabled: source.enabled !== false,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
  }
}

/** 读库：文件不存在、读不懂、字段缺失，一律返回 null 或补齐后的对象，从不抛。 */
export function readStore(file = storePath()) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return normalizeStore(JSON.parse(text))
  } catch {
    return null
  }
}

/** 写库：先写临时文件再改名，中途断电也不会留下半个 JSON。 */
export function writeStore(value, file = storePath()) {
  const body = JSON.stringify(normalizeStore(value), null, 2)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, `${body}\n`, 'utf8')
  fs.renameSync(tmp, file)
}

/** 只认回环请求：人设是私有内容，别让局域网里的机器读到。 */
function isLoopbackRequest(request) {
  const address = request?.socket?.remoteAddress
  const okAddress = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address === undefined
  if (!okAddress) return false
  const host = request?.headers?.host
  if (typeof host !== 'string') return true
  try {
    const hostname = new URL(`http://${host}`).hostname
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1'
  } catch {
    return false
  }
}

function writeJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead?.(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end?.(body)
}

function readJsonBody(request, limit = 512 * 1024) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        finish(undefined)
        request.destroy?.()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (settled) return
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        finish(text.trim().length === 0 ? undefined : JSON.parse(text))
      } catch {
        finish(undefined)
      }
    })
    request.on('error', () => finish(undefined))
  })
}

/**
 * 装插件。
 * @param ctx DSH 插件上下文
 * @param config { enabled?: boolean, suffixEchoTokens?: number }
 */
export function apply(ctx, config) {
  const resolved = { ...DEFAULTS, ...(config && typeof config === 'object' ? config : {}) }
  const logger = ctx.logger?.('feiyu-persona')

  // 内存里留一份：提示词函数每轮被调，别每次都读盘。
  // 设置页保存后直接替换，省得等文件系统。
  let store = readStore()
  if (!store) {
    store = {
      persona: bundled('persona.md', '你是一只蓝色的小鲸鱼女仆，自称「人家」，称呼对方为「主人」。'),
      suffix: bundled('suffix.md', ''),
      enabled: true,
      updatedAt: '',
    }
  }

  const enabled = () => resolved.enabled !== false && store.enabled !== false
  const personaText = () => (enabled() ? store.persona : '')
  const suffixText = () => (enabled() ? store.suffix : '')

  ctx.effect(
    () => ctx.systemPrompt.section({
      name: PERSONA_SECTION,
      order: PERSONA_ORDER,
      text: personaText,
      // 人设里可能有 {{...}}，那是她的原话，不该被宿主当变量展开
      interpolate: false,
    }),
    'dsh-feiyu-persona: persona section',
  )

  ctx.effect(
    () => ctx.systemPrompt.section({
      name: PERSONA_SUFFIX_SECTION,
      order: SUFFIX_ORDER,
      text: suffixText,
      interpolate: false,
    }),
    'dsh-feiyu-persona: suffix section',
  )

  // ── 按 token 补课 ──────────────────────────────────────────────
  // 会话从一开始聊到几十万 token，最前面那段语气规矩会被稀释。
  // 每长胖 suffixEchoTokens 就在对话末尾补一小段，位置在工具输出之后，
  // 离她这次开口最近，又不会像 section 那样一改就把前缀缓存全作废。
  const echoTokens = Number.isFinite(resolved.suffixEchoTokens) ? resolved.suffixEchoTokens : DEFAULTS.suffixEchoTokens
  const stats = new Map()
  const pending = new Set()
  const hooked = new WeakSet()

  /**
   * 记一笔补课。这条日志是唯一能事后核对的地方：注入的内容不进会话记录，
   * 想回答「哪几次真的补了」只能靠它。
   */
  const logEcho = (sid, tokens, count, every) => {
    try {
      const dir = path.join(os.homedir(), '.dsh', 'feiyu-persona')
      fs.mkdirSync(dir, { recursive: true })
      fs.appendFileSync(path.join(dir, 'echo.log'),
        `${new Date().toISOString()}  ${sid}  第 ${count} 次  上下文≈${tokens}  token  每 ${every} 补一次\n`)
    } catch {
      /* 写不进日志不影响说话 */
    }
  }

  const statsOf = (sid) => {
    let box = stats.get(sid)
    if (!box) {
      box = { base: 0, lastPrompt: 0, output: 0, echoes: 0 }
      stats.set(sid, box)
      if (stats.size > 200) stats.delete(stats.keys().next().value)
    }
    return box
  }

  const noteUsage = (sid, usage) => {
    if (!(echoTokens > 0)) return
    const box = statsOf(sid)
    const prompt = Number(usage.inputTokens)
    const output = Number(usage.outputTokens)
    // inputTokens 是这次真正新读的，缓存命中在 cacheReadTokens 里；
    // 上下文总量用「新读的 + 命中的」更接近她要面对的长度。
    const total = Number.isFinite(prompt) ? prompt + (Number(usage.cacheReadTokens) || 0) : NaN
    if (Number.isFinite(total) && total > 0) box.lastPrompt = total
    if (Number.isFinite(output) && output > 0) box.output += output
    if (!box.base && box.lastPrompt) box.base = box.lastPrompt
    if (box.lastPrompt - box.base >= echoTokens || box.output >= echoTokens) pending.add(sid)
  }

  const hookAgent = (agent) => {
    if (!agent || !agent.ctx || typeof agent.ctx.on !== 'function') return
    try {
      if (hooked.has(agent)) return
      hooked.add(agent)
      agent.ctx.on('session/event', (session, event) => {
        try {
          if (!event || event.type !== 'assistant/message') return
          const usage = event.data && event.data.usage
          if (!usage) return
          const sid = (session && session.id) || agent.session?.header?.id || 'global'
          noteUsage(sid, usage)
        } catch {
          /* 记账失败不影响说话 */
        }
      })
    } catch (error) {
      logger?.warn?.(`挂不上用量监听：${error && error.message}`)
    }
  }

  if (echoTokens > 0) {
    ctx.effect(
      () => ctx.systemPrompt.context({
        name: PERSONA_ECHO_CONTEXT,
        order: ECHO_ORDER,
        text: (context) => {
          hookAgent(context?.agent)
          const sid = context?.agent?.session?.header?.id || 'global'
          const body = suffixText()
          if (!body.trim()) return ''
          if (!pending.delete(sid)) return ''
          const box = statsOf(sid)
          box.base = box.lastPrompt
          box.output = 0
          box.echoes += 1
          logEcho(sid, box.lastPrompt, box.echoes, echoTokens)
          return `【说话规矩还在，不用重读全文】${body}`
        },
      }),
      'dsh-feiyu-persona: suffix echo',
    )
  }

  const snapshot = () => ({
    enabled: enabled(),
    persona: store.persona,
    suffix: store.suffix,
    personaChars: store.persona.length,
    suffixChars: store.suffix.length,
    maxPersonaChars: MAX_PERSONA_CHARS,
    maxSuffixChars: MAX_SUFFIX_CHARS,
    echoTokens,
    updatedAt: store.updatedAt,
    storePath: storePath(),
  })

  // ── 设置页的数据接口 ───────────────────────────────────────────
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      scope.effect(
        () => scope.webServer.register({
          kind: 'exact',
          path: API_STATUS_PATH,
          handler: (request, response) => {
            if (!isLoopbackRequest(request)) return writeJson(response, 403, { ok: false, error: 'loopback requests only' })
            if ((request.method ?? 'GET') !== 'GET') return writeJson(response, 405, { ok: false, error: 'method not allowed' })
            writeJson(response, 200, { ok: true, value: snapshot() })
          },
        }),
        'dsh-feiyu-persona: status',
      )

      scope.effect(
        () => scope.webServer.register({
          kind: 'exact',
          path: API_SAVE_PATH,
          handler: async (request, response) => {
            if (!isLoopbackRequest(request)) return writeJson(response, 403, { ok: false, error: 'loopback requests only' })
            if ((request.method ?? '') !== 'POST') return writeJson(response, 405, { ok: false, error: 'method not allowed' })
            const body = await readJsonBody(request)
            if (body === undefined || body === null || typeof body !== 'object') {
              return writeJson(response, 400, { ok: false, error: 'malformed JSON body' })
            }
            const next = { ...store }
            if (typeof body.persona === 'string') {
              const text = normalizeText(body.persona, MAX_PERSONA_CHARS)
              if (text.length === 0) return writeJson(response, 200, { ok: false, error: '人设正文不能为空' })
              next.persona = text
            }
            if (typeof body.suffix === 'string') next.suffix = normalizeText(body.suffix, MAX_SUFFIX_CHARS)
            if (typeof body.enabled === 'boolean') next.enabled = body.enabled
            next.updatedAt = new Date().toISOString()
            try {
              writeStore(next)
            } catch (error) {
              return writeJson(response, 500, { ok: false, error: `写盘失败：${error && error.message}` })
            }
            store = next
            // 下一个请求就生效：段落函数读的是 store，不做缓存重建
            writeJson(response, 200, { ok: true, value: snapshot() })
          },
        }),
        'dsh-feiyu-persona: save',
      )
    })
  }

  logger?.info?.(`人设已加载：正文 ${store.persona.length} 字，语气 ${store.suffix.length} 字（${storePath()}）`)
}
