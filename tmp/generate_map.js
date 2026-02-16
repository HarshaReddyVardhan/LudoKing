const fs = require('fs');

const COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
const OFFSETS = { RED: 0, BLUE: 13, GREEN: 26, YELLOW: 39 };

let output = `import { PlayerColor } from './types';

const GLOBAL_MAP: Record<PlayerColor, readonly number[]> = {\n`;

COLORS.forEach(color => {
    output += `    ${color}: [`;
    const offset = OFFSETS[color];
    const sequence = [];
    for (let i = 0; i <= 57; i++) {
        if (i <= 51) { // 0..51 are 52 steps.
            sequence.push((offset + i) % 52);
        } else {
            sequence.push(-1);
        }
    }
    output += sequence.join(', ') + '],\n';
});

output += `};\n\nexport function toGlobalPosition(step: number, color: PlayerColor): number {\n    return GLOBAL_MAP[color][step] ?? -1;\n}\n`;

fs.writeFileSync('generated_map.ts', output);
