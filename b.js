import inquirer from "inquirer";
import { ethers } from "ethers";
import fs from "fs-extra";

/* ================= CONFIG ================= */
const STATE_FILE = "./wallet_state.json";

// RPC fallback (publik, paling stabil)
const RPCS = [
  "https://mainnet.base.org",
  "https://base.publicnode.com",
  "https://base.blockpi.network/v1/rpc/public"
];

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];

/* ================= GLOBAL ================= */
let mnemonic;
let rootNode;
let state = { wallets: [] };

/* ================= STATE ================= */
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    state = fs.readJsonSync(STATE_FILE);
  }
}

function saveState() {
  fs.writeJsonSync(STATE_FILE, state, { spaces: 2 });
}

/* ================= WALLET ================= */
function deriveWallet(index) {
  return rootNode.deriveChild(index).address;
}

/* ================= PHRASE ================= */
async function generatePhrase() {
  const wallet = ethers.Wallet.createRandom();
  mnemonic = wallet.mnemonic.phrase;

  rootNode = ethers.HDNodeWallet.fromPhrase(
    mnemonic,
    undefined,
    "m/44'/60'/0'/0"
  );

  state.wallets = [];
  const addr = deriveWallet(0);
  state.wallets.push(addr);
  saveState();

  console.log("\n✅ PHRASE DIBUAT (METAMASK)");
  console.log("Seed Phrase:\n", mnemonic);
  console.log("Akun 1:", addr);
}

async function importPhrase() {
  const { phrase } = await inquirer.prompt({
    type: "input",
    name: "phrase",
    message: "Masukkan seed phrase (12 / 24 kata):"
  });

  mnemonic = phrase.trim();

  rootNode = ethers.HDNodeWallet.fromPhrase(
    mnemonic,
    undefined,
    "m/44'/60'/0'/0"
  );

  loadState();

  console.log("\n🔍 Mendeteksi akun lama...");
  console.log(`ℹ️ Terdeteksi ${state.wallets.length} akun sebelumnya`);

  if (state.wallets.length === 0) {
    const addr = deriveWallet(0);
    state.wallets.push(addr);
    saveState();
    console.log("Akun 1:", addr);
  }
}

/* ================= ADD MASS ================= */
async function addWalletMass() {
  const { count } = await inquirer.prompt({
    type: "number",
    name: "count",
    message: "Tambah berapa akun?",
    default: 1
  });

  let start = state.wallets.length;

  for (let i = 0; i < count; i++) {
    const index = start + i;
    const addr = deriveWallet(index);
    state.wallets.push(addr);
    console.log(`Akun ${index + 1}: ${addr}`);
  }

  saveState();
  console.log(`✅ ${count} akun ditambahkan`);
  console.log(`Total akun: ${state.wallets.length}`);
}

/* ================= SCAN USDC (SUPER STABIL) ================= */
async function scanUSDC() {
  console.log("\n🔍 SCAN SALDO USDC (BASE)");
  let found = false;
  let rpcIndex = 0;

  let provider = new ethers.JsonRpcProvider(RPCS[rpcIndex]);
  let usdc = new ethers.Contract(USDC_BASE, USDC_ABI, provider);

  for (let i = 0; i < state.wallets.length; i++) {
    const addr = state.wallets[i];
    let success = false;
    let attempt = 0;

    while (!success && attempt < 3) {
      try {
        const bal = await usdc.balanceOf(addr);

        if (bal > 0n) {
          const amount = Number(bal) / 1e6;
          console.log(`✅ Akun ${i + 1} → ${addr} = ${amount} USDC`);
          found = true;
        }

        success = true;
      } catch (e) {
        attempt++;
        rpcIndex = (rpcIndex + 1) % RPCS.length;

        provider = new ethers.JsonRpcProvider(RPCS[rpcIndex]);
        usdc = new ethers.Contract(USDC_BASE, USDC_ABI, provider);

        if (attempt === 3) {
          console.log(`⚠️ Akun ${i + 1} → gagal (RPC penuh)`);
        } else {
          await new Promise(r => setTimeout(r, 900));
        }
      }
    }

    // delay utama
    await new Promise(r => setTimeout(r, 700));
  }

  if (!found) {
    console.log("❌ Tidak ada akun dengan saldo USDC");
  }
}

/* ================= MENU ================= */
async function menu() {
  while (true) {
    const { action } = await inquirer.prompt({
      type: "list",
      name: "action",
      message: "Menu (PHRASE AKTIF):",
      choices: [
        "➕ Tambah Akun MASSAL",
        "🔍 Scan Saldo USDC (BASE)",
        "Exit"
      ]
    });

    if (action === "➕ Tambah Akun MASSAL") await addWalletMass();
    if (action === "🔍 Scan Saldo USDC (BASE)") await scanUSDC();
    if (action === "Exit") process.exit(0);
  }
}

/* ================= START ================= */
async function main() {
  const { start } = await inquirer.prompt({
    type: "list",
    name: "start",
    message: "Pilih:",
    choices: [
      "1. Generate Phrase (1x)",
      "2. Import Phrase Lama"
    ]
  });

  if (start.startsWith("1")) await generatePhrase();
  else await importPhrase();

  await menu();
}

main();
