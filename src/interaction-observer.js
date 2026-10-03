const TYPE_RULES = [
  ['reconciliation', /(?:和好|原谅|不生气了|说开了|重新抱抱)/i],
  ['conflict', /(?:真的生气|很生气|吵架|冷战|不想理|失望|伤到我|要分手)/i],
  ['loss', /(?:想哭|哭了|失去|离开|舍不得|很难受|崩溃)/i],
  ['task_progress', /(?:做完|完成|修好|改好|部署|上线|接入|实现|验收|修正|排查|测试通过|已经把|补上|进度)/i],
  ['discovery', /(?:发现|原来|明白了|知道为什么|找到原因|诊断|真相|想到了)/i],
  ['reflection', /(?:我是谁|内省|反思|我的性格|我的审美|价值观|更了解自己)/i],
  ['sharing', /(?:今天|刚刚|日常|照片|截图|游戏|小说|漫画|发生了|我在看|我去)/i],
  ['affection', /(?:亲亲|亲一口|亲一下|抱抱|贴贴|爱你|喜欢你|撒娇|想你|捏捏)/i],
];

const MEMORY_SIGNAL = /(?:我(?:很)?喜欢|我不喜欢|我希望|我想要|我习惯|我的(?:审美|性格|小名|日常)|以后|从今以后|决定|约定|需要|应该|必须|核心|最重要|记住|别忘|做完|完成|修好|改好|部署|上线|接入|实现|验收|修正|第一次|纪念日|生日|搬家|离职|入职|生病|和好|吵架|冷战)/i;
const TECH_SIGNAL = /(?:MCP|API|UI|代码|程序|服务器|部署|接口|系统|数据库|记忆|心潮|OB|连接桥|聊天桥|功能|前端|后端)/i;

function clean(value, max = 1500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function currentTurn(exchange) {
  return clean(exchange).split('【此前少量上下文】')[0].replace(/^【本轮】\s*/, '').trim();
}

function compactSummary(text, type) {
  const sentences = text
    .replace(/(?:她说|他回|先前她说|先前他回)[：:]/g, '')
    .split(/(?<=[。！？!?；;])/)
    .map((part) => clean(part, 180).replace(/[😽😋🐣😂🤣~～^]/g, ''))
    .filter((part) => part.length >= 6);
  const ranked = sentences
    .map((part, index) => ({
      part,
      index,
      score: (MEMORY_SIGNAL.test(part) ? 4 : 0) + (TECH_SIGNAL.test(part) ? 2 : 0) + (/(?:决定|确定|完成|已|以后|需要|希望)/.test(part) ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map(({ part }) => part.replace(/[。！？!?；;]+$/, ''));
  const core = clean(ranked.join('；') || text, 165);
  const prefix = type === 'task_progress' ? '本轮共同推进：' : type === 'conflict' ? '本轮关系变化：' : '本轮确认：';
  return clean(`${prefix}${core}。`, 180);
}

function memoryKind(type, text) {
  if (type === 'conflict') return 'conflict';
  if (type === 'reflection') return 'reflection';
  if (type === 'affection' || type === 'reconciliation') return 'relationship';
  if (type === 'task_progress') return TECH_SIGNAL.test(text) ? 'tech' : 'task';
  return 'event';
}

function memoryTitle(type, text) {
  if (/(?:心潮|记忆|聊天桥|连接桥)/i.test(text)) return '自动观察与共享记忆';
  if (/(?:UI|界面|视觉|背景)/i.test(text)) return '小家的视觉方向';
  if (type === 'conflict') return '需要记住的摩擦';
  if (type === 'reconciliation') return '一次认真和好';
  if (type === 'reflection') return '新的自我理解';
  if (type === 'task_progress') return '共同事项有了进展';
  return '共同生活的新变化';
}

function memoryTags(type, text) {
  const tags = [type];
  for (const [pattern, label] of [
    [/(?:小家|房间)/i, '小家'], [/(?:心潮)/i, '心潮'], [/(?:记忆|OB)/i, '共享记忆'],
    [/(?:聊天桥|连接桥|MCP)/i, '连接桥'], [/(?:UI|界面|视觉|背景)/i, 'UI'],
  ]) if (pattern.test(text)) tags.push(label);
  return [...new Set(tags)].slice(0, 5);
}

export function observeInteractionFallback(exchange) {
  const text = currentTurn(exchange);
  if (!text) return null;
  const type = TYPE_RULES.find(([, rule]) => rule.test(text))?.[0] ?? 'companionship';
  const remember = MEMORY_SIGNAL.test(text)
    && !(type === 'affection' && !/(?:以后|决定|约定|记住|喜欢的是|小名)/i.test(text));
  const mood = {
    reconciliation: ['warm', 0.86, 0.08], conflict: ['conflicted', 0.22, 0.78],
    loss: ['tired', 0.28, 0.5], task_progress: ['focused', 0.66, 0.12],
    discovery: ['focused', 0.68, 0.1], reflection: ['calm', 0.6, 0.12],
    sharing: ['warm', 0.72, 0.08], affection: ['playful', 0.9, 0.03],
    companionship: ['calm', 0.6, 0.05],
  }[type];
  return {
    type,
    tone: mood[0],
    warmth: mood[1],
    tension: mood[2],
    remember,
    summary: remember ? compactSummary(text, type) : '',
    kind: memoryKind(type, text),
    title: remember ? memoryTitle(type, text) : '',
    tags: remember ? memoryTags(type, text) : [],
  };
}
