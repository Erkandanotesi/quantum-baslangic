// Sepolia Chain ID değeri
const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";

// Blok gezgini taban adresi
const ETHERSCAN_URL = "https://sepolia.etherscan.io";

// Makbuz doğrulama ve yerel depolama ayarları
const MAKBUZ_ZAMAN_ASIMI_MS = 45000;
const MAKBUZ_SORGU_ARALIGI_MS = 2500;
const SON_ISLEM_STORAGE_KEY = "garaj-live-son-islemler-v1";
const SOZLESMELER_STORAGE_KEY = "garaj-live-sozlesmeler-v1";

// Anahtarsız, CORS destekli herkese açık Sepolia RPC uç noktaları (sıralı yedekli)
const SEPOLIA_RPCS = [
  "https://sepolia.gateway.tenderly.co",
  "https://ethereum-sepolia-rpc.publicnode.com",
];

// eth_getLogs sorguları için sırayla denenir (tam arşiv destekli Tenderly öncelikli)
const LOG_RPCS = [
  "https://sepolia.gateway.tenderly.co",
  "https://ethereum-sepolia-rpc.publicnode.com",
];

// Kayıt & giriş sözleşmesinin ABI bilgisi
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
