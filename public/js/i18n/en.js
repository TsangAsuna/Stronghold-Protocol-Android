// English UI strings for the keys of zh.js (same key set; a key added only to zh.js falls back to its
// zh value until translated — public/js/i18n.js t()). Game texts (operators, skills …) are localized
// separately, through the data-en overlay (tools/build-data-en.mjs → public/js/data.js), not here.

export const en = {
  // ready buttons (hud / briefing / room)
  ready: 'Ready',
  readyUp: 'Ready up',
  readyCancel: 'Unready',
  readyDone: 'Ready',
  spectating: 'Spectating',
  roomWaitReady: 'Waiting for every Doctor to ready up',
  roomStartHint: 'Once everyone is ready, the creator can start the simulation',
  roomNotAllReady: 'Some Doctors are not ready yet',

  // prep phase capsule (ui/hud.js → gameLogic prepCapsuleLabel)
  capsulePrep: 'Take a break',
  capsuleSpDraft: 'Adaptation',
  capsuleRoundStart: 'Round start',
  capsuleBattleCheck: 'Protocol launch',
  capsuleSettle: 'Round results',

  // shop bar (ui/shopBar.js)
  upgrade: 'Upgrade',
  confirmUpgrade: 'Confirm upgrade',
  maxLevel: 'Max level',
  freeze: 'Freeze',
  unfreeze: 'Unfreeze',
  refresh: 'Refresh',
  collapse: 'Hide',
  confirmBuy: 'Buy',
  confirmChoice: 'Confirm',
  cannotBuy: "Can't buy",
  tapAgain: 'Tap again',
  remainingUnits: 'Operators left: ',

  // field / match chrome
  emote: 'Emote',
  retreat: 'Retreat',
  retreatKey: 'Retreat[Q]',
  retreatTip: 'Retreat to the bench',
  retreatTipKey: 'Retreat to the bench (Q)',
  sell: 'Sell',
  returnSelf: 'Back to me',

  // toasts: why an action is refused (ui/gameLogic.js shopBlockReason / dropFailureReason / canPlace)
  notReadyYet: 'Not ready yet',
  eliminated: 'You are out',
  tempNotEmpty: 'The temporary bench is not empty — deal with the overflow first',
  rewardLocked: 'Not selectable right now',
  readyUndoFirst: 'You are ready — unready first to make changes',
  phaseLocked: 'Not possible in this phase',
  soldOut: 'Sold out',
  picked: 'Chosen',
  noFunds: 'Not enough funds',
  benchFull: 'Bench is full',
  shopMaxLevel: 'Dispatch Center is already at max level',
  tempUnitsOnly: 'Units cannot be placed on the temporary bench',
  badDeployTile: 'Cannot deploy here',
  badPlaceTile: 'Cannot place it here',
  meleeGroundOnly: 'Melee units can only be deployed on the ground',
  targetMissing: 'Unit not found',
  positionUnchanged: 'Position unchanged',
  magicNeedsField: 'This item must be used on the field',
  equipChessOnly: 'Items can only be equipped by operators',
  swapBreaksDeploy: 'The swapped unit could not stay deployed',
  equipNeedsUnit: 'Drag the item onto an operator',
  summonRangeOnly: 'Can only be deployed within the summoner\'s range',
  summonerNotDeployed: 'The summoner is not deployed',
  tileOccupied: 'The tile is occupied',
  boardFull: 'Deployment limit reached',
};
