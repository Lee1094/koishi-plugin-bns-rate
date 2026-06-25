const { Schema } = require('koishi')

const DEFAULT_URL = 'https://www.dd373.com/s-d5gqt8-0-0-0-0-0-0-0-0-0-0-0-1-0-5-0.html'

const FORWARD_RE = /1元\s*=\s*(\d+\.?\d*)神石/g


const Config = Schema.object({
  url: Schema.string()
    .default(DEFAULT_URL)
    .description('dd373 page URL for the target game server'),
  cacheSeconds: Schema.number()
    .default(60)
    .min(10)
    .max(300)
    .description('Cache TTL in seconds'),
})

async function fetchRate(ctx, url) {
  const response = await ctx.http.get(url, {
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  })

  const html = typeof response === 'string' ? response : response.data

  // 找到所有 "1元=XXX神石" 匹配
  // 回收价格式: "1元=162.4神石 0.0062元/神石" (没有"1神石=")
  // 卖家挂单格式: "1元=145.9873神石 1神石=0.0068元" (有"1神石=")
  const forwardMatches = [...html.matchAll(FORWARD_RE)]
  let bestSeller = null
  for (const m of forwardMatches) {
    const ctx = html.substring(Math.max(0, m.index - 50), m.index + 100)
    if (ctx.includes('1神石=')) {
      bestSeller = parseFloat(m[1])
      break
    }
  }

  if (bestSeller === null) {
    throw new Error('无法解析页面汇率数据，页面结构可能已变更')
  }

  // 反向汇率直接用正向算，更准: 1神石 = 1/forward 元
  const bestReverse = Math.round((1 / bestSeller) * 10000) / 10000

  if (bestSeller < 100 || bestSeller > 200) {
    throw new Error(`解析的汇率超出合理范围: forward=${bestSeller}`)
  }

  return { forward: bestSeller, reverse: bestReverse }
}

function formatMessage(forward, reverse, timestamp) {
  const time = new Date(timestamp).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
  })
  return [
    'DD373当前时段神石比例如下：',
    `1元 = ${forward}神石`,
    `1神石 = ${reverse}元`,
    `查询时间: ${time}`,
  ].join('\n')
}

function apply(ctx, config) {
  let cache = null

  ctx.command('bnsrate', '查询剑灵怀旧服神石汇率')
    .alias('神石')
    .alias('shenshi')
    .action(async () => {
      const ttl = config.cacheSeconds * 1000

      if (cache && Date.now() - cache.timestamp < ttl) {
        return formatMessage(cache.forwardRate, cache.reverseRate, cache.timestamp)
      }

      try {
        const { forward, reverse } = await fetchRate(ctx, config.url)
        cache = { forwardRate: forward, reverseRate: reverse, timestamp: Date.now() }
        return formatMessage(forward, reverse, cache.timestamp)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)

        if (cache) {
          return formatMessage(cache.forwardRate, cache.reverseRate, cache.timestamp)
            + '\n[警告] 汇率数据已过期，刷新失败: ' + message
        }

        return '获取汇率失败: ' + message
      }
    })
}

module.exports = { Config, apply }
