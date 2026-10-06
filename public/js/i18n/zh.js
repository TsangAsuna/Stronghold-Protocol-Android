// 简体中文 UI 文案表（默认语言；the strings are the pre-i18n literals verbatim — the zh UI is unchanged).
// Keys are English snake_case labels of the high-visibility chrome only (buttons / toasts / banners);
// everything else (game texts, less prominent labels) still renders its literal zh string.
// en.js mirrors this table; a key missing there falls back to these values (public/js/i18n.js t()).

export const zh = {
  // ready buttons (hud / briefing / room)
  ready: '准备就绪',
  readyUp: '准备就绪',
  readyCancel: '取消准备',
  readyDone: '已就绪',
  spectating: '观战中',
  roomWaitReady: '等待所有博士准备就绪',
  roomStartHint: '准备就绪后，创建者即可开始模拟',
  roomNotAllReady: '仍有博士未准备就绪',

  // prep phase capsule (ui/hud.js → gameLogic prepCapsuleLabel)
  capsulePrep: '休息一下',
  capsuleSpDraft: '机变阶段',
  capsuleRoundStart: '回合开始',
  capsuleBattleCheck: '协议启动',
  capsuleSettle: '回合结算',

  // shop bar (ui/shopBar.js)
  upgrade: '升级',
  confirmUpgrade: '确认升级',
  maxLevel: '已满级',
  freeze: '冻结',
  unfreeze: '解冻',
  refresh: '刷新',
  collapse: '收起',
  confirmBuy: '确认购买',
  confirmChoice: '确认选择',
  cannotBuy: '无法购买',
  tapAgain: '再次点击',
  remainingUnits: '剩余可放置角色：',

  // field / match chrome
  emote: '交流',
  retreat: '撤退',
  retreatKey: '撤退[Q]',
  retreatTip: '撤退至整备区',
  retreatTipKey: '撤退至整备区（Q）',
  sell: '出售',
  returnSelf: '返回自己',

  // toasts: why an action is refused (ui/gameLogic.js shopBlockReason / dropFailureReason / canPlace)
  notReadyYet: '尚未就绪',
  eliminated: '你已被淘汰',
  tempNotEmpty: '临时整备区不为空，请先处理溢出的资源',
  rewardLocked: '当前无法选择',
  readyUndoFirst: '已准备就绪，取消准备后才能操作',
  phaseLocked: '当前阶段无法进行该操作',
  soldOut: '已售出',
  picked: '已选择',
  noFunds: '资金不足',
  benchFull: '整备区已满',
  shopMaxLevel: '调度中心已达最高等级',
  tempUnitsOnly: '临时整备区无法放入单位',
  badDeployTile: '无法部署在该位置',
  badPlaceTile: '无法放置在该位置',
  meleeGroundOnly: '近战单位只能部署在地面',
  targetMissing: '找不到该单位',
  positionUnchanged: '位置未变化',
  magicNeedsField: '该道具需要放置在战场上使用',
  equipChessOnly: '装备只能配发给干员',
  swapBreaksDeploy: '交换后的单位无法部署在原位置',
  equipNeedsUnit: '请将装备拖拽至干员身上',
  summonRangeOnly: '只能部署在召唤者攻击范围内',
  summonerNotDeployed: '召唤者尚未部署',
  tileOccupied: '该位置已有单位',
  boardFull: '已达到部署上限',
};
