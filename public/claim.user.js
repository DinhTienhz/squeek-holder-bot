// ==UserScript==
// @name         Squeekchain Claim Console
// @namespace    https://squeek-holder-bot.chainn.workers.dev/
// @version      1.0.0
// @description  Connect a wallet and claim Squeekchain test NFTs from the official mint page, with a verified preview before every signature.
// @match        https://sepolia.squeekchain.com/mint*
// @match        https://sepolia.squeekchain.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const API = 'https://community.squeekchain.com/v1/community';
  const CHAIN_ID = 11155111;
  const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
  const DISPENSER = '0xe78b4420ce205b8864f2f326f3181f9dd5ea8b5f';
  const SESSION_KEY = 'squeek.community.session';

  const CLAIM_ABI = [{
    type: 'function', name: 'claim', stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'quantity', type: 'uint256' },
      { name: 'authorizationId', type: 'bytes32' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' }
    ], outputs: []
  }];
  const READ_ABI = [
    { type: 'function', name: 'claimsOpen', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
    { type: 'function', name: 'remaining', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'totalClaimed', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }
  ];

  const log = (...a) => console.log('[squeek-claim]', ...a);

  /* ---------------- tiny ABI encoder (only claim + two views) ------------- */

  const keccak = (() => {
    // compact keccak-256, enough for selectors
    const RC = [1n,0x8082n,0x800000000000808an,0x8000000080008000n,0x808bn,0x80000001n,
      0x8000000080008081n,0x8000000000008009n,0x8an,0x88n,0x80008009n,0x8000000an,
      0x8000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,
      0x8000000000008002n,0x8000000000000080n,0x800an,0x800000008000000an,
      0x8000000080008081n,0x8000000000008080n,0x80000001n,0x8000000080008008n];
    const rot = [[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]];
    const M = (1n << 64n) - 1n;
    const rol = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M;
    function f(A) {
      for (let round = 0; round < 24; round++) {
        const C = [0,1,2,3,4].map(x => A[x][0] ^ A[x][1] ^ A[x][2] ^ A[x][3] ^ A[x][4]);
        for (let x = 0; x < 5; x++) {
          const D = C[(x + 4) % 5] ^ rol(C[(x + 1) % 5], 1);
          for (let y = 0; y < 5; y++) A[x][y] ^= D;
        }
        const B = Array.from({length: 5}, () => Array(5).fill(0n));
        for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++)
          B[y][(2 * x + 3 * y) % 5] = rol(A[x][y], rot[x][y]);
        for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++)
          A[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y]) & B[(x + 2) % 5][y]);
        A[0][0] ^= RC[round];
      }
    }
    return (bytes) => {
      const rate = 136;
      const buf = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
      buf.set(bytes); buf[bytes.length] ^= 0x01; buf[buf.length - 1] ^= 0x80;
      const A = Array.from({length: 5}, () => Array(5).fill(0n));
      for (let off = 0; off < buf.length; off += rate) {
        for (let i = 0; i < rate / 8; i++) {
          let v = 0n;
          for (let b = 7; b >= 0; b--) v = (v << 8n) | BigInt(buf[off + i * 8 + b]);
          A[i % 5][Math.floor(i / 5)] ^= v;
        }
        f(A);
      }
      const out = new Uint8Array(32);
      for (let i = 0; i < 4; i++) {
        let v = A[i % 5][Math.floor(i / 5)];
        for (let b = 0; b < 8; b++) { out[i * 8 + b] = Number(v & 0xffn); v >>= 8n; }
      }
      return out;
    };
  })();

  const hex = (u8) => '0x' + Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
  const selector = (sig) => hex(keccak(new TextEncoder().encode(sig))).slice(0, 10);

  const CLAIM_SELECTOR = selector('claim(address,uint256,bytes32,uint256,bytes)');
  const CLAIMS_OPEN_SELECTOR = selector('claimsOpen()');
  const REMAINING_SELECTOR = selector('remaining()');

  const pad32 = (hexStr) => hexStr.replace(/^0x/, '').padStart(64, '0');
  const word = (v) => BigInt(v).toString(16).padStart(64, '0');
  const addrWord = (a) => pad32(a.toLowerCase());
  const bytes32Word = (h) => pad32(h);

  function encodeClaim({ recipient, quantity, authorizationId, deadline, signature }) {
    const sig = signature.replace(/^0x/, '');
    if (recipient.length !== 42) throw new Error('recipient không hợp lệ');
    if (authorizationId.length !== 66) throw new Error('authorizationId không hợp lệ');
    if (sig.length % 2 !== 0) throw new Error('signature hex lẻ');
    return CLAIM_SELECTOR
      + addrWord(recipient)
      + word(quantity)
      + bytes32Word(authorizationId)
      + word(deadline)
      + word(160)                       // offset to bytes
      + word(sig.length / 2)            // length of signature
      + sig.padEnd(Math.ceil(sig.length / 64) * 64, '0');
  }

  /* ------------------------------- RPC ------------------------------------ */

  async function rpc(method, params) {
    const r = await fetch(RPC, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'rpc error');
    return j.result;
  }

  async function readUint(data) {
    const r = await rpc('eth_call', [{ to: DISPENSER, data }, 'latest']);
    return r === '0x' ? 0n : BigInt(r);
  }

  async function readBool(data) {
    const r = await rpc('eth_call', [{ to: DISPENSER, data }, 'latest']);
    return BigInt(r) === 1n;
  }

  /* ---------------------------- wallet ------------------------------------ */

  const wallet = {
    async provider() {
      if (!window.ethereum) throw new Error('Không thấy ví. Cài MetaMask hoặc ví EVM hỗ trợ window.ethereum.');
      return window.ethereum;
    },
    async connect() {
      const p = await this.provider();
      const accounts = await p.request({ method: 'eth_requestAccounts' });
      const chain = await p.request({ method: 'eth_chainId' });
      if (parseInt(chain, 16) !== CHAIN_ID) {
        try {
          await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + CHAIN_ID.toString(16) }] });
        } catch (e) {
          throw new Error('Ví đang ở chain khác. Chuyển sang Sepolia rồi thử lại.');
        }
      }
      return accounts[0];
    },
    async send(tx) {
      const p = await this.provider();
      return p.request({ method: 'eth_sendTransaction', params: [tx] });
    }
  };

  /* ----------------------------- API -------------------------------------- */

  function session() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || typeof s.token !== 'string') return null;
      if (s.expiresAt && Date.parse(s.expiresAt) <= Date.now()) return null;
      return s;
    } catch { return null; }
  }

  async function api(path, { method = 'GET', body, token } = {}) {
    const s = token ? { token } : session();
    if (!s) throw new Error('Chưa đăng nhập trên trang này. Bấm "CONNECT WALLET" và ký SIWE một lần, rồi thử lại.');
    const r = await fetch(API + path, {
      method,
      headers: { accept: 'application/json', authorization: 'Bearer ' + s.token, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    if (!r.ok) {
      const code = data?.error || data?.code || r.status;
      const err = new Error(code);
      err.status = r.status; err.code = code;
      throw err;
    }
    return data;
  }

  /* ----------------------------- UI --------------------------------------- */

  const host = document.createElement('div');
  host.id = 'squeek-claim-console';
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .card { width: 320px; background:#0b0f14; color:#dfe8f2; border:1px solid #1e2b38;
        border-radius:14px; font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
        box-shadow:0 18px 50px rgba(0,0,0,.55); overflow:hidden; }
      header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px;
        background:linear-gradient(180deg,#111a23,#0b0f14); border-bottom:1px solid #1e2b38; }
      h1 { margin:0; font-size:12px; letter-spacing:.08em; color:#6fe9ff; font-weight:600; }
      button { font:inherit; cursor:pointer; border-radius:8px; border:1px solid #26384a;
        background:#13202c; color:#dfe8f2; padding:6px 10px; }
      button:hover { background:#1a2b3a; }
      button.primary { background:#0d3b46; border-color:#1d7f92; color:#8ff2ff; }
      button:disabled { opacity:.45; cursor:not-allowed; }
      .body { padding:10px 12px; display:grid; gap:8px; }
      .row { display:flex; justify-content:space-between; gap:8px; }
      .k { color:#7d93a8; }
      .v { text-align:right; word-break:break-all; }
      .ok { color:#6ef0a8; } .warn { color:#ffcf6f; } .bad { color:#ff8080; }
      .log { max-height:96px; overflow:auto; background:#070b0f; border:1px solid #16222c;
        border-radius:8px; padding:6px; color:#94a9bd; white-space:pre-wrap; }
      .actions { display:flex; gap:6px; }
      .actions button { flex:1; }
      .tiny { color:#5e7387; font-size:10px; }
      .hide { display:none; }
    </style>
    <div class="card">
      <header>
        <h1>SQUEEK CLAIM CONSOLE</h1>
        <button data-close title="Ẩn">×</button>
      </header>
      <div class="body">
        <div class="row"><span class="k">wallet</span><span class="v" data-wallet>chưa kết nối</span></div>
        <div class="row"><span class="k">session</span><span class="v" data-session>—</span></div>
        <div class="row"><span class="k">chain</span><span class="v" data-chain>—</span></div>
        <div class="row"><span class="k">claims</span><span class="v" data-open>—</span></div>
        <div class="row"><span class="k">remaining</span><span class="v" data-remaining>—</span></div>
        <div class="row"><span class="k">tier</span><span class="v" data-tier>—</span></div>
        <div class="row"><span class="k">allowance</span><span class="v" data-allowance>—</span></div>
        <div class="row"><span class="k">available</span><span class="v" data-available>—</span></div>
        <div class="log" data-log>sẵn sàng</div>
        <div class="actions">
          <button data-connect>Kết nối ví</button>
          <button data-refresh>Kiểm tra</button>
        </div>
        <button class="primary" data-claim disabled>Claim</button>
        <div class="tiny">Mọi giao dịch do ví của bạn ký. Script không giữ key, không tự gửi khi chưa xác nhận.</div>
      </div>
    </div>`;
  document.documentElement.appendChild(host);

  const $ = (sel) => root.querySelector(sel);
  const out = (msg, cls = '') => {
    const box = $('[data-log]');
    box.textContent = msg;
    box.className = 'log ' + cls;
  };
  const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';

  let state = { address: null, status: null, busy: false };

  function paint() {
    $('[data-wallet]').textContent = state.address ? short(state.address) : 'chưa kết nối';
    $('[data-wallet]').className = 'v ' + (state.address ? 'ok' : '');
    const s = session();
    $('[data-session]').textContent = s ? 'đã đăng nhập' : 'chưa đăng nhập';
    $('[data-session]').className = 'v ' + (s ? 'ok' : 'warn');
    const st = state.status;
    if (st) {
      $('[data-chain]').textContent = String(st.chainId ?? CHAIN_ID);
      $('[data-open]').textContent = st.claimsOpen ? 'mở' : 'đóng';
      $('[data-open]').className = 'v ' + (st.claimsOpen ? 'ok' : 'bad');
      $('[data-tier]').textContent = st.tier ?? '—';
      $('[data-allowance]').textContent = st.allowance ?? '—';
      $('[data-claimed]') && ($('[data-claimed]').textContent = st.claimed ?? '—');
      $('[data-available]').textContent = st.available ?? '—';
      $('[data-available]').className = 'v ' + (Number(st.available) > 0 ? 'ok' : 'warn');
      $('[data-claim]').disabled = state.busy || !Number(st.available);
    } else {
      $('[data-claim]').disabled = true;
    }
  }

  async function refreshChain() {
    const open = await readBool(CLAIMS_OPEN_SELECTOR);
    const left = await readUint(REMAINING_SELECTOR);
    $('[data-remaining]').textContent = left.toString();
    $('[data-remaining]').className = 'v ' + (left > 0n ? 'ok' : 'bad');
    return { open, left };
  }

  async function refreshStatus() {
    if (!state.address) return;
    const st = await api('/mint/status');
    state.status = st;
    log('mint/status', st);
    paint();
  }

  $('[data-connect]').addEventListener('click', async () => {
    try {
      state.address = await wallet.connect();
      out('đã kết nối ' + short(state.address), 'ok');
      paint();
      await refreshChain();
      try { await refreshStatus(); } catch (e) { out('kết nối ví OK, nhưng chưa đọc được mint/status: ' + e.message, 'warn'); }
    } catch (e) { out(e.message, 'bad'); }
  });

  $('[data-refresh]').addEventListener('click', async () => {
    try {
      await refreshChain();
      await refreshStatus();
      out('đã cập nhật', 'ok');
    } catch (e) { out(e.message, 'bad'); }
  });

  $('[data-close]').addEventListener('click', () => { host.style.display = 'none'; });

  $('[data-claim]').addEventListener('click', async () => {
    if (state.busy) return;
    state.busy = true; paint();
    try {
      if (!state.address) throw new Error('Kết nối ví trước.');
      const st = state.status || await api('/mint/status');
      if (!st.claimsOpen) throw new Error('Claims đang đóng.');
      const available = Number(st.available || 0);
      if (!available) throw new Error('Không còn NFT để claim cho ví này.');

      out('xin authorization…');
      const authRes = await api('/mint/authorization', { method: 'POST', body: {} });
      const auth = authRes.authorization || authRes;
      log('authorization', authRes);

      // ---- hard checks before anything is signed
      if (Number(auth.chainId) !== CHAIN_ID) throw new Error('Authorization sai chain: ' + auth.chainId);
      if (auth.authMinter.toLowerCase() !== DISPENSER) throw new Error('Authorization trỏ tới contract lạ: ' + auth.authMinter);
      if (auth.recipient.toLowerCase() !== state.address.toLowerCase()) throw new Error('Authorization cấp cho ví khác: ' + auth.recipient);
      if (BigInt(auth.deadline) <= BigInt(Math.floor(Date.now() / 1000))) throw new Error('Authorization đã hết hạn.');
      const qty = Number(auth.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error('Quantity ngoài khoảng: ' + auth.quantity);

      const data = encodeClaim({
        recipient: auth.recipient,
        quantity: qty,
        authorizationId: auth.authorizationId,
        deadline: auth.deadline,
        signature: auth.signature
      });
      if (data.slice(0, 10) !== CLAIM_SELECTOR) throw new Error('selector sai');

      // ---- simulate exactly the hop the wallet will sign
      out('mô phỏng eth_call…');
      try {
        await rpc('eth_call', [{ from: state.address, to: DISPENSER, data }, 'latest']);
      } catch (e) {
        throw new Error('Mô phỏng thất bại: ' + e.message);
      }

      let gas;
      try {
        const g = await rpc('eth_estimateGas', [{ from: state.address, to: DISPENSER, data }]);
        gas = (BigInt(g) * 125n / 100n).toString(16);
      } catch {
        gas = '0x30d40'; // 200k fallback, labelled in the preview
      }

      const preview = `claim ${qty} NFT\nrecipient ${auth.recipient}\ncontract ${DISPENSER}\ngas ${parseInt(gas, 16).toLocaleString()}${gas === '0x30d40' ? ' (ước tính)' : ' (đo +25%)'}`;
      if (!confirm(preview + '\n\nKý giao dịch này?')) { out('đã huỷ', 'warn'); return; }

      out('chờ ví ký…');
      const hash = await wallet.send({ from: state.address, to: DISPENSER, data, gas: '0x' + BigInt(gas).toString(16) });
      out('đã gửi ' + hash + '\nđang chờ receipt…', 'ok');

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const rc = await rpc('eth_getTransactionReceipt', [hash]);
        if (rc) {
          if (rc.status === '0x1') out('✅ claim xong\n' + hash + '\nhttps://sepolia.etherscan.io/tx/' + hash, 'ok');
          else out('❌ tx reverted\n' + hash, 'bad');
          break;
        }
      }
      await refreshStatus();
      await refreshChain();
    } catch (e) {
      out(e.message || String(e), 'bad');
      log(e);
    } finally {
      state.busy = false; paint();
    }
  });

  // detect an already-connected wallet without prompting
  (async () => {
    try {
      if (window.ethereum?.request) {
        const acc = await window.ethereum.request({ method: 'eth_accounts' });
        if (acc?.[0]) {
          state.address = acc[0];
          paint();
          await refreshChain();
          try { await refreshStatus(); } catch { /* not signed in yet */ }
        }
      }
    } catch { /* ignore */ }
    paint();
  })();

  log('ready', { CLAIM_SELECTOR, DISPENSER });
})();
