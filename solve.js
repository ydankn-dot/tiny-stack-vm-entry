// Tiny stack VM, ISA v1 — a faithful, fast interpreter of make.fun's tiny stack ISA
// (kit: program/generator/subject/ISA.md; reference VM: vm.mjs). Written fresh here.
// run(program, input) -> { out: Uint8Array, code: number }: exactly the reference
// VM's bytes and exit code (0-255), traps included. Every check runs in ISA.md's
// order: step limit, pc range, unknown opcode, cut-off immediate, stack underflow
// and overflow, then the instruction's own traps and effect.
export function run(p, inp) {
  const n = p.length;
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, steps = 0;
  const done = (c) => ({ out: out.slice(0, ol), code: c });
  for (;;) {
    if (steps === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc];
    let imm = 0, pops = 0, push = 0;
    switch (op) {
      case 0x01: imm = 1; push = 1; break;
      case 0x02: imm = 4; push = 1; break;
      case 0x03: pops = 1; break;
      case 0x04: pops = 1; push = 2; break;
      case 0x05: pops = 2; push = 2; break;
      case 0x06: pops = 2; push = 3; break;
      case 0x07: pops = 3; push = 3; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
      case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
      case 0x1e: case 0x20: case 0x21: case 0x22:
        pops = 2; push = 1; break;
      case 0x17: case 0x1b: pops = 1; push = 1; break;
      case 0x31: case 0x32: imm = 2; pops = 1; break;
      case 0x30: case 0x33: imm = 2; break;
      case 0x40: pops = 1; push = 1; break;
      case 0x41: pops = 2; break;
      case 0x50: case 0x51: case 0x53: pops = 1; break;
      case 0x52: push = 1; break;
      case 0x00: case 0x34: break;
      default: return done(5);
    }
    if (pc + imm >= n) return done(9);
    steps++;
    const nx = pc + 1 + imm;
    if (sp < pops) return done(2);
    if (sp - pops + push > 256) return done(3);
    pc = nx;
    if (op === 0x00) return done(0);
    if (op === 0x01) { D[sp++] = (p[nx - 1] << 24) >> 24; continue; }
    if (op === 0x02) { D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); continue; }
    if (op === 0x03) { sp--; continue; }
    if (op === 0x04) { D[sp] = D[sp - 1]; sp++; continue; }
    if (op === 0x05) { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; continue; }
    if (op === 0x06) { D[sp] = D[sp - 2]; sp++; continue; }
    if (op === 0x07) { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; continue; }
    if (op === 0x17) { D[sp - 1] = -D[sp - 1] | 0; continue; }
    if (op === 0x1b) { D[sp - 1] = ~D[sp - 1]; continue; }
    if (op >= 0x10 && op <= 0x22) {
      const b = D[sp - 1], a = D[sp - 2];
      let r;
      switch (op) {
        case 0x10: r = (a + b) | 0; break;
        case 0x11: r = (a - b) | 0; break;
        case 0x12: r = Math.imul(a, b); break;
        case 0x13:
          if (b === 0) return done(4);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
          break;
        case 0x14:
          if (b === 0) return done(4);
          r = b === -1 ? 0 : (a % b) | 0;
          break;
        case 0x15:
          if (b === 0) return done(4);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
          break;
        case 0x16:
          if (b === 0) return done(4);
          r = ((a >>> 0) % (b >>> 0)) | 0;
          break;
        case 0x18: r = a & b; break;
        case 0x19: r = a | b; break;
        case 0x1a: r = a ^ b; break;
        case 0x1c: r = a << (b & 31); break;
        case 0x1d: r = a >> (b & 31); break;
        case 0x1e: r = (a >>> (b & 31)) | 0; break;
        case 0x20: r = a === b ? 1 : 0; break;
        case 0x21: r = a < b ? 1 : 0; break;
        default: r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      }
      sp -= 2;
      D[sp++] = r;
      continue;
    }
    if (op === 0x30 || op === 0x31 || op === 0x32) {
      const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
      let take = true;
      if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
      if (take) pc = nx + rel;
      continue;
    }
    if (op === 0x33) {
      if (cp === 64) return done(7);
      C[cp++] = nx;
      pc = p[nx - 2] | (p[nx - 1] << 8);
      continue;
    }
    if (op === 0x34) {
      if (cp === 0) return done(8);
      pc = C[--cp];
      continue;
    }
    if (op === 0x40) {
      const addr = D[sp - 1];
      if (addr < 0 || addr >= 256) return done(6);
      D[sp - 1] = M[addr];
      continue;
    }
    if (op === 0x41) {
      const addr = D[sp - 1], v = D[sp - 2];
      if (addr < 0 || addr >= 256) return done(6);
      sp -= 2;
      M[addr] = v;
      continue;
    }
    if (op === 0x50) {
      const s = String(D[sp - 1]);
      if (ol + s.length > 65536) return done(11);
      sp--;
      for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
      continue;
    }
    if (op === 0x51) {
      if (ol + 1 > 65536) return done(11);
      out[ol++] = D[--sp] & 255;
      continue;
    }
    if (op === 0x52) { D[sp++] = ip < inp.length ? inp[ip++] : -1; continue; }
    return done(D[--sp] & 255);
  }
}
