/**
 * ケーススタディ1 & 2 の検証スクリプト
 * 記事の期待結果と実装ロジックを突合する
 */

// === 実装ロジック（index.htmlと同一） ===
const RANK_POINTS = { 1: 55, 2: 10, 3: -20, 4: -45 };
const INDIVIDUAL_EV = { none: 0, top: 0.4, rentai: 0.7, avoid4: 1.0, always: 1.0 };
const GROUPED_EV = { top_2: 0.6, rentai_2: 1.1, top_3: 1.5, rentai_3: 1.6 };
const PROB_TABLE = [
  [-1.5, 0.95], [-1.0, 0.85], [-0.5, 0.75],
  [0, 0.55], [0.5, 0.40], [1.0, 0.25], [1.5, 0.10]
];

function classifyCondition(overtakeRanks, availableRanks) {
  if (overtakeRanks.length === 0) return 'none';
  if (overtakeRanks.length === availableRanks.length) return 'always';
  const maxRank = Math.max(...overtakeRanks);
  if (maxRank === 1) return 'top';
  if (maxRank === 2) return 'rentai';
  if (maxRank === 3) return 'avoid4';
  return 'always';
}

function calcGroupEV(conditions) {
  const valid = conditions.filter(c => c !== 'none');
  if (valid.length === 0) return 0;
  if (valid.length === 1) return INDIVIDUAL_EV[valid[0]];
  const topCount = valid.filter(c => c === 'top').length;
  const rentaiCount = valid.filter(c => c === 'rentai').length;
  if (topCount === valid.length && GROUPED_EV[`top_${valid.length}`]) return GROUPED_EV[`top_${valid.length}`];
  if (rentaiCount === valid.length && GROUPED_EV[`rentai_${valid.length}`]) return GROUPED_EV[`rentai_${valid.length}`];
  return valid.reduce((sum, c) => sum + INDIVIDUAL_EV[c], 0);
}

function lookupProb(diff) {
  if (diff <= PROB_TABLE[0][0]) return PROB_TABLE[0][1];
  if (diff >= PROB_TABLE[PROB_TABLE.length - 1][0]) return PROB_TABLE[PROB_TABLE.length - 1][1];
  for (let i = 0; i < PROB_TABLE.length - 1; i++) {
    if (diff >= PROB_TABLE[i][0] && diff <= PROB_TABLE[i + 1][0]) {
      const t = (diff - PROB_TABLE[i][0]) / (PROB_TABLE[i + 1][0] - PROB_TABLE[i][0]);
      return PROB_TABLE[i][1] + t * (PROB_TABLE[i + 1][1] - PROB_TABLE[i][1]);
    }
  }
  return 0.55;
}

function calculate(entries) {
  const selfEntry = entries.find(e => e.isSelf);
  const borderEntry = entries.find(e => e.isBorder);
  const sorted = [...entries].sort((a, b) => b.pts - a.pts);
  const borderIdx = sorted.findIndex(e => e.id === borderEntry.id) + 1;
  const others = entries.filter(e => !e.isSelf);

  const results = {};

  for (let selfRank = 1; selfRank <= 4; selfRank++) {
    const selfChange = RANK_POINTS[selfRank];
    const selfTable = selfEntry.table;
    const personConditions = [];

    others.forEach(person => {
      const sameTable = person.table === selfTable;
      const availableRanks = sameTable
        ? [1, 2, 3, 4].filter(r => r !== selfRank)
        : [1, 2, 3, 4];
      const overtakeRanks = availableRanks.filter(r =>
        person.pts + RANK_POINTS[r] > selfEntry.pts + selfChange
      );
      const cond = classifyCondition(overtakeRanks, availableRanks);
      personConditions.push({ name: person.name, cond, sameTable, table: person.table });
    });

    const sameTablePeople = personConditions.filter(pc => pc.sameTable);
    const diffTablePeople = personConditions.filter(pc => !pc.sameTable);

    let sameTableCertainOvertakes = 0;
    const sameTableUncertain = [];
    sameTablePeople.forEach(pc => {
      if (pc.cond === 'always' || pc.cond === 'avoid4') {
        sameTableCertainOvertakes++;
      } else if (pc.cond !== 'none') {
        sameTableUncertain.push(pc);
      }
    });

    const diffTableThreshold = borderIdx - sameTableCertainOvertakes - sameTableUncertain.length;

    const tableGroups = {};
    diffTablePeople.forEach(pc => {
      if (pc.cond === 'none') return;
      if (!tableGroups[pc.table]) tableGroups[pc.table] = [];
      tableGroups[pc.table].push(pc.cond);
    });

    let evTotal = 0;
    const evDetails = [];
    Object.entries(tableGroups).forEach(([tbl, conds]) => {
      const ev = calcGroupEV(conds);
      evTotal += ev;
      evDetails.push({ table: tbl, conditions: conds, ev });
    });

    const allDiffConds = diffTablePeople.map(pc => pc.cond).filter(c => c !== 'none');
    const hasTop = allDiffConds.includes('top');
    const hasAvoid4 = allDiffConds.includes('avoid4');
    const condPeopleCount = allDiffConds.length;

    let correction = 0;
    if (hasTop && hasAvoid4 && condPeopleCount >= 4) correction -= 0.10;

    const diff = diffTableThreshold - evTotal;
    let failProb = lookupProb(diff) + correction;
    failProb = Math.max(0, Math.min(1, failProb));
    const successProb = 1 - failProb;
    const successPct = Math.round(successProb * 100);

    results[selfRank] = {
      conditions: personConditions.map(pc => `${pc.name}(${pc.sameTable ? '同卓' : '卓' + pc.table}): ${pc.cond}`),
      sameTableCertain: sameTableCertainOvertakes,
      sameTableUncertain: sameTableUncertain.map(pc => pc.name),
      threshold: diffTableThreshold,
      evDetails,
      evTotal: +evTotal.toFixed(1),
      diff: +diff.toFixed(1),
      correction,
      failPct: Math.round(failProb * 100),
      successPct
    };
  }
  return { borderIdx, results };
}

// === ケーススタディ1: 冨本さん(6位) ===
// ポイントは記事に記載がないため、記事の条件を再現するように設定
console.log('='.repeat(60));
console.log('ケーススタディ1: 女流Cリーグ 冨本さん(6位)');
console.log('8位以内に入れば昇級 (=3人に抜かれなければ)');
console.log('='.repeat(60));

const cs1 = calculate([
  { id: '1', name: '速水(5位)', pts: 110, table: 'B', isSelf: false, isBorder: false },
  { id: '2', name: '冨本(6位)', pts: 100, table: 'A', isSelf: true, isBorder: false },
  { id: '3', name: '西園(7位)', pts: 90,  table: 'H', isSelf: false, isBorder: false },
  { id: '4', name: '山本(8位)', pts: 80,  table: 'C', isSelf: false, isBorder: true },  // ボーダー
  { id: '5', name: '張替(9位)', pts: 75,  table: 'G', isSelf: false, isBorder: false },
  { id: '6', name: '高島(10位)', pts: 55, table: 'C', isSelf: false, isBorder: false },
  { id: '7', name: '望月(11位)', pts: 45, table: 'F', isSelf: false, isBorder: false },
]);

console.log(`ボーダー位置(borderIdx): ${cs1.borderIdx}`);
console.log();

for (let rank = 1; rank <= 4; rank++) {
  const r = cs1.results[rank];
  console.log(`--- 冨本が${rank}着の場合 ---`);
  console.log('条件:');
  r.conditions.forEach(c => console.log(`  ${c}`));
  if (r.sameTableCertain > 0) console.log(`同卓確定: ${r.sameTableCertain}人`);
  if (r.sameTableUncertain.length > 0) console.log(`同卓不確定: ${r.sameTableUncertain.join(', ')}`);
  console.log(`人数(閾値): ${r.threshold}`);
  console.log(`EV詳細:`);
  r.evDetails.forEach(d => console.log(`  卓${d.table}: [${d.conditions.join(',')}] → ${d.ev}`));
  console.log(`EV合計: ${r.evTotal}`);
  console.log(`差(人数-EV): ${r.diff}`);
  console.log(`補正: ${r.correction}`);
  console.log(`失敗確率: ${r.failPct}% / 通過確率: ${r.successPct}%`);
  console.log();
}

// 期待結果との比較
console.log('【ケーススタディ1 検証結果】');
console.log(`1着: ${cs1.results[1].successPct}% (期待: ≒100% 考えるまでもなく通過)`);
console.log(`2着: ${cs1.results[2].successPct}% (期待: ≒100% 連対なら通過)`);
console.log(`3着: ${cs1.results[3].successPct}% (期待: 約58%)`);
console.log(`4着: ${cs1.results[4].successPct}% (期待: 極めて低い)`);

const cs1_3着_ok = cs1.results[3].successPct === 58;
const cs1_3着_ev = cs1.results[3].evTotal === 3.9;
const cs1_3着_threshold = cs1.results[3].threshold === 4;
console.log();
console.log(`3着 EV=3.9: ${cs1_3着_ev ? '✅ PASS' : '❌ FAIL'} (実際: ${cs1.results[3].evTotal})`);
console.log(`3着 人数=4: ${cs1_3着_threshold ? '✅ PASS' : '❌ FAIL'} (実際: ${cs1.results[3].threshold})`);
console.log(`3着 通過58%: ${cs1_3着_ok ? '✅ PASS' : '❌ FAIL'} (実際: ${cs1.results[3].successPct}%)`);

// === ケーススタディ2: 畠さん(3位) ===
console.log();
console.log('='.repeat(60));
console.log('ケーススタディ2: 雀竜C 畠さん(3位)');
console.log('5位以内に入れば昇級 (=3人に抜かれなければ)');
console.log('='.repeat(60));

// 畠(3位)と千貫(4位)が同卓3、浅井(5位)が卓2、綱川(6位)と大川(7位)が同卓1
// ポイント調整: 記事の全着順の条件を同時に満たす値を設定
//   self=2着: 千貫=1着条件, 浅井=1着条件, 綱川=1着条件, 大川=1着条件
//   self=3着: 千貫=連対(抜かれる前提), 浅井=連対, 綱川=連対, 大川=連対 (同卓連対×2=1.1)
//   self=4着: 千貫=always, 浅井=4着回避, 綱川=4着回避, 大川=4着回避 (同卓4着回避×2)
const cs2 = calculate([
  { id: '1', name: '畠(3位)',   pts: 100, table: '3', isSelf: true, isBorder: false },
  { id: '2', name: '千貫(4位)', pts: 90,  table: '3', isSelf: false, isBorder: false },
  { id: '3', name: '浅井(5位)', pts: 80,  table: '2', isSelf: false, isBorder: true },  // ボーダー
  { id: '4', name: '綱川(6位)', pts: 78,  table: '1', isSelf: false, isBorder: false },
  { id: '5', name: '大川(7位)', pts: 76,  table: '1', isSelf: false, isBorder: false },
]);

console.log(`ボーダー位置(borderIdx): ${cs2.borderIdx}`);
console.log();

for (let rank = 1; rank <= 4; rank++) {
  const r = cs2.results[rank];
  console.log(`--- 畠が${rank}着の場合 ---`);
  console.log('条件:');
  r.conditions.forEach(c => console.log(`  ${c}`));
  if (r.sameTableCertain > 0) console.log(`同卓確定: ${r.sameTableCertain}人`);
  if (r.sameTableUncertain.length > 0) console.log(`同卓不確定: ${r.sameTableUncertain.join(', ')}`);
  console.log(`人数(閾値): ${r.threshold}`);
  console.log(`EV詳細:`);
  r.evDetails.forEach(d => console.log(`  卓${d.table}: [${d.conditions.join(',')}] → ${d.ev}`));
  console.log(`EV合計: ${r.evTotal}`);
  console.log(`差(人数-EV): ${r.diff}`);
  console.log(`補正: ${r.correction}`);
  console.log(`失敗確率: ${r.failPct}% / 通過確率: ${r.successPct}%`);
  console.log();
}

// 期待結果との比較
console.log('【ケーススタディ2 検証結果】');
console.log(`1着: ${cs2.results[1].successPct}% (期待: ≒100%)`);
console.log(`2着: ${cs2.results[2].successPct}% (期待: 約75%)`);
console.log(`3着: ${cs2.results[3].successPct}% (期待: 約55%)`);
console.log(`4着: ${cs2.results[4].successPct}% (期待: 約15%)`);

const cs2_2着_ok = cs2.results[2].successPct === 75;
const cs2_2着_threshold = cs2.results[2].threshold === 2;
const cs2_2着_ev = cs2.results[2].evTotal === 1.0;

const cs2_3着_ok = cs2.results[3].successPct >= 54 && cs2.results[3].successPct <= 56;
const cs2_3着_threshold = cs2.results[3].threshold === 2;
const cs2_3着_ev = cs2.results[3].evTotal === 1.7;

const cs2_4着_ok = cs2.results[4].successPct === 15;
const cs2_4着_threshold = cs2.results[4].threshold === 2;
const cs2_4着_ev = cs2.results[4].evTotal === 3.0;

console.log();
console.log(`2着 EV=1.0: ${cs2_2着_ev ? '✅ PASS' : '❌ FAIL'} (実際: ${cs2.results[2].evTotal})`);
console.log(`2着 人数=2: ${cs2_2着_threshold ? '✅ PASS' : '❌ FAIL'} (実際: ${cs2.results[2].threshold})`);
console.log(`2着 通過75%: ${cs2_2着_ok ? '✅ PASS' : '❌ FAIL'} (実際: ${cs2.results[2].successPct}%)`);
console.log();
console.log(`3着 EV=1.7: ${cs2_3着_ev ? '✅ PASS' : '❌ FAIL'} (実際: ${cs2.results[3].evTotal})`);
console.log(`3着 人数=2: ${cs2_3着_threshold ? '✅ PASS' : '❌ FAIL'} (実際: ${cs2.results[3].threshold})`);
console.log(`3着 通過≒55%: ${cs2_3着_ok ? '✅ PASS' : '❌ FAIL'} (実際: ${cs2.results[3].successPct}%)`);
console.log();
console.log(`4着 EV=3.0: ${cs2_4着_ev ? '✅ PASS' : '❌ FAIL'} (実際: ${cs2.results[4].evTotal})`);
console.log(`4着 人数=2: ${cs2_4着_threshold ? '✅ PASS' : '❌ FAIL'} (実際: ${cs2.results[4].threshold})`);
console.log(`4着 通過15%: ${cs2_4着_ok ? '✅ PASS' : '❌ FAIL'} (実際: ${cs2.results[4].successPct}%)`);
