'use strict';
function entry(expression, total) {
    return { expression: expression, results: { total: total } };
}
var content = '&{template:atkdmg} {{r1=$[[0]]}} {{r2=$[[1]]}} {{dmg1=$[[2]]}} {{dmg1type=Piercing}} {{dmg2=$[[3]]}} {{dmg2type=}} {{crit1=$[[4]]}} {{crit2=$[[5]]}} {{globaldamage=$[[6]]}} {{globaldamagecrit=$[[7]]}} {{globaldamagetype=Sneak}}';
exports.sneak = {
    content: content,
    inlinerolls: [entry('1d20cs>20 +5[DEX] +3[MOD] +5[PROF]', 18),
        entry('0d20cs>20 +5[DEX] +3[MOD] +5[PROF]', 13),
        entry('1d4 +5[DEX] +3[MOD]', 12), entry('0', 0),
        entry('1d4[CRIT]', 2), entry('0[CRIT]', 0),
        entry('2d6[Sneak Attack]', 7), entry('2d6[Sneak Attack]', 8)]
};
exports.dueling = {
    content: content.replace('globaldamagetype=Sneak', 'globaldamagetype='),
    inlinerolls: [entry('1d20cs>20 +5[CHA] +5[PROF] +2[MAGIC]', 30),
        entry('0d20cs>20 +5[CHA] +5[PROF] +2[MAGIC]', 12),
        entry('1d6 +5[CHA] +2[MAGIC]', 8), entry('0', 0),
        entry('1d6[CRIT]', 5), entry('1d8[CRIT]', 1),
        { expression: '2[Dueling Style]', results: { resultType: 'M', total: 2, rolls: [{ type: 'M', expr: '2' }], }, signature: false },
        entry('0', 0)]
};
// Documented hldmg shape; not yet confirmed by a live spell capture.
exports.upcast = {
    content: '&{template:atkdmg} {{r1=$[[0]]}} {{dmg1=$[[1]]}} {{dmg1type=Fire}} {{hldmg=$[[2]]}}',
    inlinerolls: [entry('1d20+5', 18), entry('8d6', 28), entry('2d6', 7)]
};
