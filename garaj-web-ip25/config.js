// Sepolia Chain ID değeri
const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";

// İP 23'te Sepolia'ya deploy edilen GarajKayitV3 sözleşme bilgileri
const SOZLESME_ADI = "GarajKayitV3";
const SOZLESME_ADRESI = "0xceF9e2B864D08C230B2926F177F7a671379b9935";
const DEPLOY_BLOCK = 12197177;
const DEPLOY_TX = "0xcefcb10af522e33201e041f5fa62155b4379169772c712c4be90ed8af3ee4bdc";
const DERLEYICI = "solc 0.8.34";
const ETHERSCAN_URL = "https://sepolia.etherscan.io";

// İP 25 makbuz doğrulama ve bağlantı takibi ayarları
const MAKBUZ_ZAMAN_ASIMI_MS = 45000;
const MAKBUZ_SORGU_ARALIGI_MS = 2500;
const SON_ISLEM_STORAGE_KEY = "garaj-ip25-son-islem-v1";

// Anahtarsız, CORS destekli herkese açık Sepolia RPC uç noktaları (sıralı yedekli)
const SEPOLIA_RPCS = [
  "https://sepolia.gateway.tenderly.co",
  "https://1rpc.io/sepolia",
  "https://ethereum-sepolia-rpc.publicnode.com",
];

// eth_getLogs sorguları için sırayla denenir (tam arşiv destekli Tenderly öncelikli)
const LOG_RPCS = [
  "https://sepolia.gateway.tenderly.co",
  "https://ethereum-sepolia-rpc.publicnode.com",
];

// GarajKayitV3 sözleşmesinin ABI bilgisi (projects/IP23/GarajKayit.abi.json ile birebir uyumlu)
const SOZLESME_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "katilimci",
        "type": "address"
      }
    ],
    "name": "GirisOnaylandi",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "katilimci",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "takmaAd",
        "type": "string"
      }
    ],
    "name": "KayitOlundu",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_katilimci",
        "type": "address"
      }
    ],
    "name": "girisOnayla",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_takmaAd",
        "type": "string"
      }
    ],
    "name": "kayitOl",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "etkinlikAdi",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "girisYaptiMi",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "gorevli",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "KAPASITE",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "kayitlar",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "kayitliMi",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "toplamKayit",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];
