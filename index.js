const { Schema } = require('koishi')

const DEFAULT_URL = 'https://www.dd373.com/s-d5gqt8-0-0-0-0-0-0-0-0-0-0-0-1-0-5-0.html'

const FORWARD_RE = /1元\s*=\s*(\d+\.?\d*)神石/g
const REVERSE_RE = /1神石\s*=\s*(\d+\.?\d*)元/g

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

  const forwardMatches = [...html.matchAll(FORWARD_RE)]
  if (forwardMatches.length < 2) {
    throw new Error('无法解析页面汇率数据，页面结构可能已变更')
  }

  // match[0] = 平台极速收货回收价(跳过), match[1] = 比例最佳排序第一条=最低卖家挂单价
  const forward = parseFloat(forwardMatches[1][1])

  const reverseMatches = [...html.matchAll(REVERSE_RE)]
  if (reverseMatches.length < 2) {
    throw new Error('无法解析页面反向汇率数据')
  }

  const reverse = parseFloat(reverseMatches[1][1])

  if (forward < 100 || forward > 200 || reverse < 0.001 || reverse > 0.02) {
    throw new Error(`解析的汇率超出合理范围: forward=${forward}, reverse=${reverse}`)
  }

  return { forward, reverse }
}

function formatMessage(forward, reverse, timestamp) {
  const time = new Date(timestamp).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
  })
  return [
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
